import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  UseGuards,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import type { AuthenticatedCustomer } from '../auth/strategies/jwt.strategy';
import { ApplyDto } from './dto/apply.dto';
import { InfluencerService } from './influencer.service';

/**
 * Grahak ni baaju no creator program.
 *
 * Login farjiyat chhe — pan influencer hovu farjiyat NATHI. Aa j vaat aa
 * feature na aakha design nu paayu chhe: influencer ek ALAG account nathi,
 * e j grahak chhe jene ek vadharani bhumika mali chhe. Etle ahiya grahak
 * vaalo `JwtAuthGuard` j chhe, koi alag guard nathi.
 */
@Controller('influencer')
@UseGuards(JwtAuthGuard)
export class InfluencerController {
  constructor(private readonly influencer: InfluencerService) {}

  /**
   * POST /influencer/apply
   *
   * Rate limit kadak chhe: aa endpoint admin ni queue ma row banaave chhe,
   * ane e queue manas na samay thi khaali thay chhe — machine thi nahi.
   */
  @Post('apply')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  async apply(
    @CurrentUser() user: AuthenticatedCustomer,
    @Body() dto: ApplyDto,
  ) {
    return this.influencer.apply(user.id, dto);
  }

  /**
   * GET /influencer/application
   *
   * `null` aave to app "Become a creator" button daakhve. Baki na status
   * mate: PENDING → "Under review", REJECTED → kaaran + `canReapplyAt`,
   * APPROVED → creator tab kholi naakhvu.
   */
  @Get('application')
  async application(@CurrentUser() user: AuthenticatedCustomer) {
    return this.influencer.myApplication(user.id);
  }

  /** GET /influencer/me — approve thayo hoy to j; nahi to 404 */
  @Get('me')
  async me(@CurrentUser() user: AuthenticatedCustomer) {
    return this.influencer.me(user.id);
  }
}
