import {
  BadRequestException,
  Inject,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { IdentifierType, OtpPurpose } from '@prisma/client';
import { createHmac, randomInt, timingSafeEqual } from 'node:crypto';
import type { Env } from '../../config/env.schema';
import { PrismaService } from '../../prisma/prisma.service';
import { RedisService } from '../../redis/redis.service';
import { TooManyRequestsException } from '../../common/exceptions/too-many-requests.exception';
import type { NormalizedIdentifier } from '../../common/utils/identifier.util';
import { OTP_SENDER, type OtpSender } from './otp-sender.interface';

export interface IssuedOtp {
  expiresAt: Date;
  resendAfterSeconds: number;
  /** FAKT dev ma (OTP_EXPOSE_IN_RESPONSE=true). Production ma hammesha undefined. */
  devCode?: string;
}

@Injectable()
export class OtpService {
  private readonly logger = new Logger(OtpService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly config: ConfigService<Env, true>,
    @Inject(OTP_SENDER) private readonly sender: OtpSender,
  ) {}

  /**
   * OTP banavi, hash kari ne store kari, sender ne aapi de chhe.
   *
   * Dhyaan: aa method e KYAREY nathi kehtu ke customer exist kare chhe ke nahi.
   * Caller pan e leak na kare — nahi to koi script chalavi ne khabar padi jaay
   * ke kaya numbers tamara customers chhe (enumeration attack).
   */
  async issue(params: {
    identifier: NormalizedIdentifier;
    purpose: OtpPurpose;
    customerId?: string;
    ip?: string;
  }): Promise<IssuedOtp> {
    const { identifier, purpose, customerId, ip } = params;

    await this.enforceRateLimits(identifier, purpose, ip);

    const ttl = this.config.get('OTP_TTL_SECONDS', { infer: true });
    const code = this.generateCode();
    const expiresAt = new Date(Date.now() + ttl * 1000);

    // Ek identifier mate ek j pending OTP rahe — juna badha consume kari daiye,
    // nahi to user ne 3 code mokalya hoy ane treye chale, je window vadhaare chhe.
    await this.prisma.$transaction([
      this.prisma.otpCode.updateMany({
        where: {
          identifier: identifier.value,
          purpose,
          consumedAt: null,
          expiresAt: { gt: new Date() },
        },
        data: { consumedAt: new Date() },
      }),
      this.prisma.otpCode.create({
        data: {
          identifierType: identifier.type,
          identifier: identifier.value,
          codeHash: this.hashCode(identifier, purpose, code),
          purpose,
          customerId: customerId ?? null,
          maxAttempts: this.config.get('OTP_MAX_ATTEMPTS', { infer: true }),
          expiresAt,
          requestIp: ip ?? null,
        },
      }),
    ]);

    await this.sender.send({
      type: identifier.type,
      to: identifier.value,
      code,
      ttlSeconds: ttl,
    });

    return {
      expiresAt,
      resendAfterSeconds: this.config.get('OTP_RESEND_COOLDOWN_SECONDS', {
        infer: true,
      }),
      devCode: this.config.get('OTP_EXPOSE_IN_RESPONSE', { infer: true })
        ? code
        : undefined,
    };
  }

  /**
   * Code verify kare chhe ane success par ene consume kari de chhe (one-time use).
   *
   * @returns OTP record no customerId (LINK_IDENTITY mate kaam no)
   */
  async verify(params: {
    identifier: NormalizedIdentifier;
    purpose: OtpPurpose;
    code: string;
  }): Promise<{ customerId: string | null }> {
    const { identifier, purpose, code } = params;

    const record = await this.prisma.otpCode.findFirst({
      where: {
        identifier: identifier.value,
        purpose,
        consumedAt: null,
        expiresAt: { gt: new Date() },
      },
      orderBy: { createdAt: 'desc' },
    });

    // Message hammesha ek j — "code khoto" ke "code j nathi" e farak na kaho.
    if (!record) {
      throw new UnauthorizedException('OTP is incorrect or has expired');
    }

    if (record.attempts >= record.maxAttempts) {
      await this.consume(record.id);
      throw new UnauthorizedException('OTP is incorrect or has expired');
    }

    const expected = record.codeHash;
    const actual = this.hashCode(identifier, purpose, code.trim());

    if (!this.constantTimeEquals(expected, actual)) {
      const updated = await this.prisma.otpCode.update({
        where: { id: record.id },
        data: { attempts: { increment: 1 } },
        select: { attempts: true, maxAttempts: true },
      });

      // Attempts puri thai gaya — record ne turat marii naakho, jethi brute
      // force karnaar ne bijo chance na male.
      if (updated.attempts >= updated.maxAttempts) {
        await this.consume(record.id);
      }

      throw new UnauthorizedException('OTP is incorrect or has expired');
    }

    await this.consume(record.id);
    return { customerId: record.customerId };
  }

  // -------------------------------------------------------------------------
  // Internals
  // -------------------------------------------------------------------------

  private async consume(id: string): Promise<void> {
    await this.prisma.otpCode.update({
      where: { id },
      data: { consumedAt: new Date() },
    });
  }

  private generateCode(): string {
    const length = this.config.get('OTP_LENGTH', { infer: true });
    const max = 10 ** length;
    // randomInt = CSPRNG. Math.random() ahiya kyarey na vaparvu.
    return randomInt(0, max).toString().padStart(length, '0');
  }

  /**
   * Code ne identifier + purpose sathe bandhi ne hash kariye chhiye.
   * Etle ek identifier no code bija identifier par ke bija purpose par
   * kyarey na chale, bhale hash koi rite leak thai jaay.
   */
  private hashCode(
    identifier: NormalizedIdentifier,
    purpose: OtpPurpose,
    code: string,
  ): string {
    return createHmac('sha256', this.config.get('OTP_PEPPER', { infer: true }))
      .update(`${identifier.type}:${identifier.value}:${purpose}:${code}`)
      .digest('hex');
  }

  private constantTimeEquals(a: string, b: string): boolean {
    const bufA = Buffer.from(a, 'hex');
    const bufB = Buffer.from(b, 'hex');
    if (bufA.length !== bufB.length) return false;
    return timingSafeEqual(bufA, bufB);
  }

  /**
   * Tran layer:
   *   1. Cooldown  — ek pachhi ek turat resend na thay
   *   2. Per identifier/hour — ek number par SMS bombing na thay
   *   3. Per IP/hour — ek attacker ghana numbers par bombing na kare
   *
   * SMS no kharcho real chhe. Aa vagar ek script tamaru gateway balance
   * ek raat ma khaali kari shake chhe.
   */
  private async enforceRateLimits(
    identifier: NormalizedIdentifier,
    purpose: OtpPurpose,
    ip?: string,
  ): Promise<void> {
    const cooldownSeconds = this.config.get('OTP_RESEND_COOLDOWN_SECONDS', {
      infer: true,
    });
    const cooldownKey = `otp:cd:${purpose}:${identifier.value}`;

    const gotLock = await this.redis.acquireCooldown(cooldownKey, cooldownSeconds);
    if (!gotLock) {
      const retryAfter = await this.redis.ttl(cooldownKey);
      throw new TooManyRequestsException(
        `Please wait a moment and try again`,
        retryAfter || cooldownSeconds,
      );
    }

    const perIdentifierMax = this.config.get('OTP_MAX_PER_IDENTIFIER_PER_HOUR', {
      infer: true,
    });
    const idHits = await this.redis.incrementWithWindow(
      `otp:rl:id:${identifier.value}`,
      3600,
    );
    if (idHits > perIdentifierMax) {
      this.logger.warn(
        `OTP hourly limit hit for identifier ${identifier.masked} (${idHits} requests)`,
      );
      throw new TooManyRequestsException(
        'Too many OTP requests. Please try again after an hour.',
        3600,
      );
    }

    if (ip) {
      const perIpMax = this.config.get('OTP_MAX_PER_IP_PER_HOUR', { infer: true });
      const ipHits = await this.redis.incrementWithWindow(`otp:rl:ip:${ip}`, 3600);
      if (ipHits > perIpMax) {
        this.logger.warn(`OTP hourly limit hit for IP ${ip} (${ipHits} requests)`);
        throw new TooManyRequestsException(
          'Too many OTP requests. Please try again after an hour.',
          3600,
        );
      }
    }

    if (!identifier.value) {
      throw new BadRequestException('Identifier is required');
    }
  }
}
