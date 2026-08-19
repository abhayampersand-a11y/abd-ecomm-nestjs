import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { AdminJwtGuard } from '../auth/admin-jwt.guard';
import { ListInfluencersDto, SuspendInfluencerDto } from '../dto/influencer.dto';
import { AdminInfluencerService } from './admin-influencer.service';

/**
 * Approve thai gayela creators.
 *
 * Applications ni queue alag controller ma chhe (`admin/influencer-applications`) —
 * be alag kaam chhe: aa "chalu creators nu management" chhe, e "navi
 * requests no nirnay".
 */
@Controller('admin/influencers')
@UseGuards(AdminJwtGuard)
export class AdminInfluencerController {
  constructor(private readonly influencers: AdminInfluencerService) {}

  /** GET /admin/influencers?status=ACTIVE&search=priya */
  @Get()
  async list(@Query() query: ListInfluencersDto) {
    return this.influencers.listInfluencers(query);
  }

  /**
   * POST /admin/influencers/:id/suspend
   * Body: { "reason": "..." }
   *
   * Juna reels feed ma thi nikdi jaay chhe ane navu earning band. Wallet no
   * baaki balance rahe chhe — e kamayela paisa chhe, saja nahi.
   */
  @Post(':id/suspend')
  @HttpCode(HttpStatus.OK)
  async suspend(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: SuspendInfluencerDto,
  ) {
    return this.influencers.suspend(id, dto.reason);
  }

  /** POST /admin/influencers/:id/unsuspend */
  @Post(':id/unsuspend')
  @HttpCode(HttpStatus.OK)
  async unsuspend(@Param('id', ParseUUIDPipe) id: string) {
    return this.influencers.unsuspend(id);
  }
}
