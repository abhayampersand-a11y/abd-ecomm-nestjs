import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { Request } from 'express';
import { getClientIp } from '../../common/utils/request.util';
import { AdminLoginDto } from '../dto/admin-auth.dto';
import {
  AdminAuthService,
  type AuthenticatedAdmin,
} from './admin-auth.service';
import { AdminJwtGuard } from './admin-jwt.guard';
import { CurrentAdmin } from './current-admin.decorator';

@Controller('admin/auth')
export class AdminAuthController {
  constructor(private readonly adminAuth: AdminAuthService) {}

  /**
   * POST /admin/auth/login
   * Body: { "email": "...", "password": "..." }
   *
   * Ek j admin chhe, etle na signup, na roles, na "forgot password".
   * Success par 8 kalak no access token male chhe (refresh token nathi).
   */
  @Post('login')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  async login(@Body() dto: AdminLoginDto, @Req() req: Request) {
    return this.adminAuth.login(dto.email, dto.password, getClientIp(req));
  }

  /** POST /admin/auth/logout — aa token turat nakamo thai jaay chhe */
  @Post('logout')
  @HttpCode(HttpStatus.OK)
  @UseGuards(AdminJwtGuard)
  async logout(@CurrentAdmin() admin: AuthenticatedAdmin) {
    return this.adminAuth.logout(admin);
  }

  /**
   * GET /admin/auth/me
   * Panel boot vakhte aa call kare — 200 aave to session chalu chhe.
   */
  @Get('me')
  @UseGuards(AdminJwtGuard)
  me(@CurrentAdmin() admin: AuthenticatedAdmin) {
    return {
      email: admin.email,
      sessionExpiresAt: admin.exp
        ? new Date(admin.exp * 1000).toISOString()
        : null,
    };
  }
}
