import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { AdminJwtGuard } from '../auth/admin-jwt.guard';
import {
  ListOtpLogsDto,
  ListSessionsDto,
  OtpStatsDto,
  ResetOtpLimitDto,
} from '../dto/security.dto';
import { AdminSecurityService } from './admin-security.service';

@Controller('admin/security')
@UseGuards(AdminJwtGuard)
export class AdminSecurityController {
  constructor(private readonly security: AdminSecurityService) {}

  /**
   * GET /admin/security/otp-logs?identifier=98765&status=expired&page=1
   *
   * "Mane OTP nathi aavto" vaali fariyad ahiya thi ukelaay chhe:
   * code niklyo hato ke nahi, ketli vaar try karyu, kai IP par thi.
   * ⚠️ Code pote (ke eno hash) ahiya kyarey nathi aavto.
   */
  @Get('otp-logs')
  async otpLogs(@Query() query: ListOtpLogsDto) {
    return this.security.listOtpLogs(query);
  }

  /** GET /admin/security/otp-stats?days=7 — SMS gateway ni tabiyat */
  @Get('otp-stats')
  async otpStats(@Query() query: OtpStatsDto) {
    return this.security.otpStats(query.days);
  }

  /**
   * POST /admin/security/otp/reset-limits
   * Body: { "identifier": "9876543210" }  athva  { "ip": "1.2.3.4" }
   *
   * Rate limit chhoodave chhe. OTP mokalto nathi — e user e jaate j fari
   * "Resend" dabaavvu pade.
   */
  @Post('otp/reset-limits')
  @HttpCode(HttpStatus.OK)
  async resetOtpLimits(@Body() dto: ResetOtpLimitDto) {
    return this.security.resetOtpLimits(dto);
  }

  /** GET /admin/security/sessions?page=1 — atyare kaya devices logged-in chhe */
  @Get('sessions')
  async sessions(@Query() query: ListSessionsDto) {
    return this.security.listSessions(query);
  }

  /** GET /admin/security/devices — push reach (iOS / Android / Web) */
  @Get('devices')
  async devices() {
    return this.security.deviceStats();
  }
}
