import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Patch,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { Request } from 'express';
import { getClientIp, getSessionContext } from '../common/utils/request.util';
import { AuthService } from './auth.service';
import { CurrentUser } from './decorators/current-user.decorator';
import {
  LogoutDto,
  RefreshTokenDto,
  RequestOtpDto,
  UpdateProfileDto,
  VerifyOtpDto,
} from './dto/auth-request.dto';
import { RequestIdentityOtpDto, VerifyIdentityDto } from './dto/identity.dto';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import type { AuthenticatedCustomer } from './strategies/jwt.strategy';

@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  // -------------------------------------------------------------------------
  // Public — login / signup
  // -------------------------------------------------------------------------

  /**
   * POST /auth/otp/request
   * Body: { "identifier": "9876543210" }  ya  { "identifier": "abc@gmail.com" }
   *
   * Hammesha same response — user exist kare ke na kare.
   */
  @Post('otp/request')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  async requestOtp(@Body() dto: RequestOtpDto, @Req() req: Request) {
    return this.auth.requestLoginOtp(dto.identifier, getClientIp(req));
  }

  /**
   * POST /auth/otp/verify
   * Body: { "identifier": "9876543210", "code": "123456", "deviceId": "..." }
   *
   * Success par access + refresh token male chhe. Navo user hoy to ahiya j
   * bane chhe — alag signup endpoint nathi.
   */
  @Post('otp/verify')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  async verifyOtp(@Body() dto: VerifyOtpDto, @Req() req: Request) {
    return this.auth.verifyLoginOtp(
      dto.identifier,
      dto.code,
      getSessionContext(req, dto.deviceId),
    );
  }

  /**
   * POST /auth/token/refresh
   * Access token expire thay etle app aa call kare.
   * Juno refresh token har vaar revoke thai ne navo male chhe (rotation).
   */
  @Post('token/refresh')
  @HttpCode(HttpStatus.OK)
  async refresh(@Body() dto: RefreshTokenDto, @Req() req: Request) {
    return this.auth.refresh(
      dto.refreshToken,
      getSessionContext(req, dto.deviceId),
    );
  }

  // -------------------------------------------------------------------------
  // Authenticated
  // -------------------------------------------------------------------------

  /** POST /auth/logout — aa ek device no logout */
  @Post('logout')
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtAuthGuard)
  async logout(@Body() dto: LogoutDto) {
    return this.auth.logout(dto.refreshToken);
  }

  /** POST /auth/logout-all — badha devices par thi logout */
  @Post('logout-all')
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtAuthGuard)
  async logoutAll(@CurrentUser() user: AuthenticatedCustomer) {
    return this.auth.logoutEverywhere(user.id);
  }

  /** GET /auth/me — profile + badha verified identifiers */
  @Get('me')
  @UseGuards(JwtAuthGuard)
  async me(@CurrentUser() user: AuthenticatedCustomer) {
    return this.auth.getProfile(user.id);
  }

  /**
   * PATCH /auth/me
   * Body: { "firstName": "Abhay", "lastName": "Desai", "gender": "female" }
   *
   * Profile screen (36) nu edit. Signup vakhte koi form nathi — OTP verify
   * pachhi user sidho app ma jaay chhe.
   *
   * ⚠️ Email ahiya thi set NATHI thato. Ena mate
   * `/auth/identities/request-otp` → `/auth/identities/verify`.
   */
  @Patch('me')
  @UseGuards(JwtAuthGuard)
  async updateProfile(
    @CurrentUser() user: AuthenticatedCustomer,
    @Body() dto: UpdateProfileDto,
  ) {
    return this.auth.updateProfile(user.id, dto);
  }

  // -------------------------------------------------------------------------
  // Identity linking — "juna orders nathi dekhata?" flow
  // -------------------------------------------------------------------------

  /**
   * POST /auth/identities/request-otp
   * Body: { "identifier": "juno-email@gmail.com" }
   *
   * User e phone thi login karyu, pan website par na juna orders alag email
   * thi hata — e email ahiya verify kare etle e orders jodai jaay chhe.
   */
  @Post('identities/request-otp')
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtAuthGuard)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  async requestIdentityOtp(
    @CurrentUser() user: AuthenticatedCustomer,
    @Body() dto: RequestIdentityOtpDto,
    @Req() req: Request,
  ) {
    return this.auth.requestIdentityOtp(
      user.id,
      dto.identifier,
      getClientIp(req),
    );
  }

  /**
   * POST /auth/identities/verify
   * Body: { "identifier": "juno-email@gmail.com", "code": "123456" }
   */
  @Post('identities/verify')
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtAuthGuard)
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  async verifyIdentity(
    @CurrentUser() user: AuthenticatedCustomer,
    @Body() dto: VerifyIdentityDto,
  ) {
    return this.auth.verifyIdentity(user.id, dto.identifier, dto.code);
  }
}
