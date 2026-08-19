import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { randomBytes } from 'node:crypto';
import { ExtractJwt, Strategy } from 'passport-jwt';
import type { Env } from '../../config/env.schema';
import {
  AdminAuthService,
  type AdminTokenPayload,
  type AuthenticatedAdmin,
} from './admin-auth.service';

@Injectable()
export class AdminJwtStrategy extends PassportStrategy(Strategy, 'admin-jwt') {
  constructor(
    private readonly config: ConfigService<Env, true>,
    private readonly adminAuth: AdminAuthService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      // Admin band hoy (ADMIN_EMAIL khaali) tyare pan passport ne koi ne koi
      // secret joiye j chhe, nahi to app boot ma j fail thay. Etle dar boot e
      // navo random secret — enathi banelo koi token duniya ma chhe j nahi,
      // ane `AdminAuthService.isConfigured()` login pan nathi thava deto.
      secretOrKey:
        config.get('JWT_ADMIN_SECRET', { infer: true }) ||
        randomBytes(48).toString('hex'),
      issuer: config.get('JWT_ISSUER', { infer: true }),
      passReqToCallback: false,
    });
  }

  async validate(payload: AdminTokenPayload): Promise<AuthenticatedAdmin> {
    // Grahak no access token ahiya na chaali jaay. (Secret pehla thi alag
    // chhe — aa bijo taalo chhe, ane ek j taalo kyarey puro nathi.)
    if (payload.typ !== 'admin' || payload.sub !== 'admin') {
      throw new UnauthorizedException('Token is not valid');
    }

    if (!this.adminAuth.isConfigured()) {
      throw new UnauthorizedException('Admin panel is not configured');
    }

    // ADMIN_EMAIL badlaayo (etle ke malik badlaayo) — juna badha tokens
    // e j kshane nakama thai jaay chhe.
    const configuredEmail = this.config
      .get('ADMIN_EMAIL', { infer: true })
      .trim()
      .toLowerCase();

    if (payload.email !== configuredEmail) {
      throw new UnauthorizedException('Session is no longer valid. Please log in again.');
    }

    if (await this.adminAuth.isRevoked(payload.jti)) {
      throw new UnauthorizedException('Session has been logged out. Please log in again.');
    }

    return { email: payload.email, jti: payload.jti, exp: payload.exp };
  }
}
