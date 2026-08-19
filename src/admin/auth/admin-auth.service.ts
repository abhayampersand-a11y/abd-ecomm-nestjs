import {
  Injectable,
  Logger,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { verify as argon2Verify } from '@node-rs/argon2';
import { randomUUID, timingSafeEqual } from 'node:crypto';
import { TooManyRequestsException } from '../../common/exceptions/too-many-requests.exception';
import type { Env } from '../../config/env.schema';
import { RedisService } from '../../redis/redis.service';

/**
 * Admin no access token. Grahak na token thi be rite alag chhe:
 *   - alag secret (JWT_ADMIN_SECRET)
 *   - `typ: 'admin'`
 * Banne check thay chhe — ek bhulai jaay to biju bachaavi le.
 */
export interface AdminTokenPayload {
  sub: 'admin';
  typ: 'admin';
  /** Aa token kaya ADMIN_EMAIL mate niklyo hato */
  email: string;
  /** Logout mate — revoke list ma aa j jaay chhe */
  jti: string;
  exp?: number;
}

export interface AuthenticatedAdmin {
  email: string;
  jti: string;
  /** Unix seconds — logout vakhte revoke-entry no TTL aa parthi nakki thay chhe */
  exp?: number;
}

export interface AdminSessionDto {
  accessToken: string;
  tokenType: 'Bearer';
  /** Seconds — panel aa thi "session expires in" batavi shake */
  expiresIn: number;
  admin: { email: string };
}

/**
 * Admin login — EK j user, roles nathi.
 *
 * Credentials env ma chhe, DB ma nahi. Etle ahiya na to koi table chhe, na
 * signup, na "forgot password". Password badalvo etle navo hash deploy karvo.
 *
 * Refresh token pan jaan-bujhi ne nathi: ek j vyakti, browser ma bethelo, 8
 * kalak ni session — rotation na aakha tantra ni ahiya kimat nathi.
 */
@Injectable()
export class AdminAuthService {
  private readonly logger = new Logger(AdminAuthService.name);

  constructor(
    private readonly jwt: JwtService,
    private readonly redis: RedisService,
    private readonly config: ConfigService<Env, true>,
  ) {}

  /**
   * ADMIN_EMAIL khaali hoy to aakhu /admin/* band — fail-closed.
   * (env.schema ma pehla thi khaatri thai chuki chhe ke email hoy to secret
   * ane password pan hoy j.)
   */
  isConfigured(): boolean {
    return Boolean(this.config.get('ADMIN_EMAIL', { infer: true }));
  }

  async login(
    email: string,
    password: string,
    ip?: string,
  ): Promise<AdminSessionDto> {
    if (!this.isConfigured()) {
      throw new ServiceUnavailableException('Admin panel is not configured');
    }

    await this.assertNotLockedOut(ip);

    const configuredEmail = this.config
      .get('ADMIN_EMAIL', { infer: true })
      .trim()
      .toLowerCase();

    // Banne check hammesha chale chhe — email khoto hoy to pan password
    // verify thay chhe. Vehela return karso to response no time j kahi de
    // chhe ke email saacho hato ke nahi.
    const emailOk = this.constantTimeEquals(
      (email ?? '').trim().toLowerCase(),
      configuredEmail,
    );
    const passwordOk = await this.verifyPassword(password ?? '');

    if (!emailOk || !passwordOk) {
      const attempts = await this.recordFailure(ip);
      this.logger.warn(
        `Admin login failed from ${ip ?? 'unknown IP'} (attempt ${attempts})`,
      );
      throw new UnauthorizedException('Email or password is incorrect');
    }

    await this.clearFailures(ip);

    const expiresIn = this.config.get('JWT_ADMIN_TTL', { infer: true });
    const payload: AdminTokenPayload = {
      sub: 'admin',
      typ: 'admin',
      email: configuredEmail,
      jti: randomUUID(),
    };

    const accessToken = await this.jwt.signAsync(payload, {
      secret: this.config.get('JWT_ADMIN_SECRET', { infer: true }),
      expiresIn,
      issuer: this.config.get('JWT_ISSUER', { infer: true }),
    });

    this.logger.log(`Admin logged in from ${ip ?? 'unknown IP'}`);

    return {
      accessToken,
      tokenType: 'Bearer',
      expiresIn,
      admin: { email: configuredEmail },
    };
  }

  /**
   * Logout.
   *
   * JWT ne "pacho" na levaay, etle eno `jti` Redis ma revoke-list ma mukiye
   * chhiye — token ni baaki life jetla j samay mate. Strategy dar request e
   * aa list joi le chhe.
   */
  async logout(admin: AuthenticatedAdmin): Promise<{ success: true }> {
    const exp = admin.exp;
    const ttl = exp
      ? Math.max(exp - Math.floor(Date.now() / 1000), 1)
      : this.config.get('JWT_ADMIN_TTL', { infer: true });

    await this.redis.client.set(this.revokeKey(admin.jti), '1', 'EX', ttl);
    return { success: true };
  }

  async isRevoked(jti: string): Promise<boolean> {
    const found = await this.redis.client.get(this.revokeKey(jti));
    return found !== null;
  }

  // ---------------------------------------------------------------------------

  private async verifyPassword(password: string): Promise<boolean> {
    const hash = this.config.get('ADMIN_PASSWORD_HASH', { infer: true });

    if (hash) {
      try {
        return await argon2Verify(hash, password);
      } catch (err) {
        // Kharaab/adhuro hash — aa configuration ni bhool chhe, password ni nahi
        this.logger.error(
          `ADMIN_PASSWORD_HASH could not be verified: ${(err as Error).message}`,
        );
        return false;
      }
    }

    // Dev-only fallback. Production ma aa env j validateEnv e rokelo chhe.
    const plain = this.config.get('ADMIN_PASSWORD', { infer: true });
    return Boolean(plain) && this.constantTimeEquals(password, plain);
  }

  /**
   * Throttler request-rate roke chhe, aa password-guessing roke chhe — be
   * alag vaat chhe. 10 khota password pachhi e IP 15 minute mate band.
   */
  private async assertNotLockedOut(ip?: string): Promise<void> {
    if (!ip) return;

    const max = this.config.get('ADMIN_MAX_LOGIN_ATTEMPTS', { infer: true });
    const current = Number((await this.redis.client.get(this.failKey(ip))) ?? 0);

    if (current >= max) {
      const retryAfter = await this.redis.ttl(this.failKey(ip));
      throw new TooManyRequestsException(
        'Too many failed login attempts. Please try again later.',
        retryAfter || this.config.get('ADMIN_LOGIN_LOCK_SECONDS', { infer: true }),
      );
    }
  }

  private async recordFailure(ip?: string): Promise<number> {
    if (!ip) return 0;
    return this.redis.incrementWithWindow(
      this.failKey(ip),
      this.config.get('ADMIN_LOGIN_LOCK_SECONDS', { infer: true }),
    );
  }

  private async clearFailures(ip?: string): Promise<void> {
    if (ip) await this.redis.del(this.failKey(ip));
  }

  private failKey(ip: string): string {
    return `admin:login:fail:${ip}`;
  }

  private revokeKey(jti: string): string {
    return `admin:revoked:${jti}`;
  }

  private constantTimeEquals(a: string, b: string): boolean {
    const bufA = Buffer.from(a, 'utf8');
    const bufB = Buffer.from(b, 'utf8');
    if (bufA.length !== bufB.length) return false;
    return timingSafeEqual(bufA, bufB);
  }
}
