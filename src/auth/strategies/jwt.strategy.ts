import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { CustomerStatus } from '@prisma/client';
import { ExtractJwt, Strategy } from 'passport-jwt';
import type { Env } from '../../config/env.schema';
import { PrismaService } from '../../prisma/prisma.service';
import type { AccessTokenPayload } from '../token.service';

export interface AuthenticatedCustomer {
  id: string;
  phone: string | null;
  email: string | null;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, 'jwt') {
  constructor(
    config: ConfigService<Env, true>,
    private readonly prisma: PrismaService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: config.get('JWT_ACCESS_SECRET', { infer: true }),
      issuer: config.get('JWT_ISSUER', { infer: true }),
    });
  }

  /**
   * Har request e DB hit thay chhe — jaan-bujhi ne. Aa thi block thayelo ke
   * delete thayelo user eno access token expire thai tya sudhi andar rahi
   * na shake.
   *
   * Traffic vadhે tyare aa lookup Redis ma cache karva jevu (short TTL),
   * pan tyare pan block event par cache invalidate karvu.
   */
  async validate(payload: AccessTokenPayload): Promise<AuthenticatedCustomer> {
    if (payload.typ !== 'access') {
      throw new UnauthorizedException('Token is not valid');
    }

    const customer = await this.prisma.customer.findUnique({
      where: { id: payload.sub },
      select: {
        id: true,
        status: true,
        primaryPhone: true,
        primaryEmail: true,
      },
    });

    if (!customer || customer.status !== CustomerStatus.ACTIVE) {
      throw new UnauthorizedException('Session is not valid. Please log in again.');
    }

    return {
      id: customer.id,
      phone: customer.primaryPhone,
      email: customer.primaryEmail,
    };
  }
}
