import { forwardRef, Logger, Module, type Provider } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { AddressesModule } from '../addresses/addresses.module';
import type { Env } from '../config/env.schema';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { IdentityService } from './identity.service';
import { ConsoleOtpSender } from './otp/console-otp.sender';
import { OTP_SENDER } from './otp/otp-sender.interface';
import { OtpService } from './otp/otp.service';
import { JwtStrategy } from './strategies/jwt.strategy';
import { TokenService } from './token.service';

/**
 * OTP provider ni pasandagi ek j jagya e.
 *
 * Msg91/Twilio joiye tyare: e sender class lakhо, ahiya case add karo,
 * ane .env ma OTP_PROVIDER badlo. OtpService ne khabar pan nahi pade.
 */
const otpSenderProvider: Provider = {
  provide: OTP_SENDER,
  inject: [ConfigService],
  useFactory: (config: ConfigService<Env, true>) => {
    const provider = config.get('OTP_PROVIDER', { infer: true });

    switch (provider) {
      case 'console':
        return new ConsoleOtpSender();
      case 'msg91':
      case 'twilio':
        throw new Error(
          `OTP_PROVIDER="${provider}" is not implemented yet. ` +
            `Add that sender in src/auth/otp/ (implementing the OtpSender interface).`,
        );
      default:
        throw new Error(`Unknown OTP_PROVIDER: ${provider}`);
    }
  },
};

@Module({
  imports: [
    // Identity verify thay etle addresses apne-aap khenchiye chhiye.
    // Circular chhe — juo AddressesModule.
    forwardRef(() => AddressesModule),
    PassportModule.register({ defaultStrategy: 'jwt', session: false }),
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService<Env, true>) => ({
        secret: config.get('JWT_ACCESS_SECRET', { infer: true }),
        signOptions: {
          expiresIn: config.get('JWT_ACCESS_TTL', { infer: true }),
          issuer: config.get('JWT_ISSUER', { infer: true }),
        },
      }),
    }),
  ],
  controllers: [AuthController],
  providers: [
    AuthService,
    OtpService,
    TokenService,
    IdentityService,
    JwtStrategy,
    otpSenderProvider,
    Logger,
  ],
  exports: [AuthService, TokenService, IdentityService],
})
export class AuthModule {}
