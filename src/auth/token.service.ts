import { Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import type { Env } from '../config/env.schema';
import { PrismaService } from '../prisma/prisma.service';

export interface AccessTokenPayload {
  /** Customer.id */
  sub: string;
  typ: 'access';
}

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
  /** Access token ni baaki life (seconds) — app aa thi refresh schedule kare */
  expiresIn: number;
  tokenType: 'Bearer';
}

export interface SessionContext {
  deviceId?: string;
  userAgent?: string;
  ip?: string;
}

@Injectable()
export class TokenService {
  private readonly logger = new Logger(TokenService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService<Env, true>,
  ) {}

  async issuePair(
    customerId: string,
    ctx: SessionContext,
    familyId: string = randomUUID(),
  ): Promise<TokenPair> {
    const expiresIn = this.config.get('JWT_ACCESS_TTL', { infer: true });

    const payload: AccessTokenPayload = { sub: customerId, typ: 'access' };
    const accessToken = await this.jwt.signAsync(payload);

    const refreshToken = this.generateRefreshToken();
    const ttlDays = this.config.get('REFRESH_TOKEN_TTL_DAYS', { infer: true });

    await this.prisma.refreshToken.create({
      data: {
        customerId,
        tokenHash: this.hashToken(refreshToken),
        familyId,
        deviceId: ctx.deviceId ?? null,
        userAgent: ctx.userAgent?.slice(0, 500) ?? null,
        ip: ctx.ip ?? null,
        expiresAt: new Date(Date.now() + ttlDays * 24 * 60 * 60 * 1000),
      },
    });

    return { accessToken, refreshToken, expiresIn, tokenType: 'Bearer' };
  }

  /**
   * Refresh token rotation + reuse detection.
   *
   * Har refresh e juno token revoke thay ane navo bane chhe. Jo koi ALREADY
   * REVOKED token fari vapre, to e stolen token no signal chhe — tyare aakhi
   * "family" (e device ni badhi sessions) revoke kari daiye chhiye, jethi
   * chor ane asli user banne bahar thai jaay ane user ne fari login karvu pade.
   */
  async rotate(rawToken: string, ctx: SessionContext): Promise<TokenPair> {
    const tokenHash = this.hashToken(rawToken);

    const existing = await this.prisma.refreshToken.findUnique({
      where: { tokenHash },
      include: { customer: { select: { id: true, status: true } } },
    });

    if (!existing) {
      throw new UnauthorizedException('Session valid nathi. Fari login karo.');
    }

    if (existing.revokedAt) {
      this.logger.warn(
        `Refresh token reuse detected for customer ${existing.customerId} ` +
          `(family ${existing.familyId}) — revoking whole family`,
      );
      await this.revokeFamily(existing.familyId);
      throw new UnauthorizedException('Session valid nathi. Fari login karo.');
    }

    if (existing.expiresAt <= new Date()) {
      throw new UnauthorizedException('Session expire thai gayu. Fari login karo.');
    }

    if (existing.customer.status !== 'ACTIVE') {
      throw new UnauthorizedException('Account active nathi.');
    }

    const pair = await this.issuePair(existing.customerId, ctx, existing.familyId);

    await this.prisma.refreshToken.update({
      where: { id: existing.id },
      data: {
        revokedAt: new Date(),
        replacedById: (
          await this.prisma.refreshToken.findUniqueOrThrow({
            where: { tokenHash: this.hashToken(pair.refreshToken) },
            select: { id: true },
          })
        ).id,
      },
    });

    return pair;
  }

  /** Ek device no logout */
  async revoke(rawToken: string): Promise<void> {
    await this.prisma.refreshToken.updateMany({
      where: { tokenHash: this.hashToken(rawToken), revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  /** Badha devices par thi logout ("log out everywhere") */
  async revokeAllForCustomer(customerId: string): Promise<number> {
    const { count } = await this.prisma.refreshToken.updateMany({
      where: { customerId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    return count;
  }

  private async revokeFamily(familyId: string): Promise<void> {
    await this.prisma.refreshToken.updateMany({
      where: { familyId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  private generateRefreshToken(): string {
    return randomBytes(48).toString('base64url');
  }

  /**
   * Raw refresh token DB ma kyarey store nathi thato — fakt eno SHA-256.
   * DB leak thay to pan koi na session hijack na thai shake.
   */
  private hashToken(raw: string): string {
    return createHash('sha256').update(raw).digest('hex');
  }
}
