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
import { RejectApplicationDto } from '../../influencer/dto/review-application.dto';
import { AdminJwtGuard } from '../auth/admin-jwt.guard';
import { ListApplicationsDto } from '../dto/influencer.dto';
import { AdminInfluencerService } from './admin-influencer.service';

/**
 * Gate 1 — creator applications ni review queue.
 *
 * Aa queue **manas na samay thi** khaali thay chhe, machine thi nahi. Etle
 * `/influencer/apply` par rate limit kadak chhe ane reject pachhi 30 divas ni
 * raah chhe: banne aa screen ne bharai javathi bachaave chhe.
 */
@Controller('admin/influencer-applications')
@UseGuards(AdminJwtGuard)
export class AdminInfluencerApplicationsController {
  constructor(private readonly influencers: AdminInfluencerService) {}

  /**
   * GET /admin/influencer-applications?status=PENDING&sort=newest&page=1&limit=25
   *
   * Offset pagination, cursor nahi — panel ne "Page 4 of 37" joiye chhe ane
   * aa data aapda potana Postgres ma chhe.
   */
  @Get()
  async list(@Query() query: ListApplicationsDto) {
    return this.influencers.listApplications(query);
  }

  /**
   * GET /admin/influencer-applications/pending-count
   * Sidebar no badge. `:id` route thi PEHLA hovu joiye.
   */
  @Get('pending-count')
  async pendingCount() {
    return this.influencers.pendingCount();
  }

  /** GET /admin/influencer-applications/:id — PAN masked j aave chhe */
  @Get(':id')
  async findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.influencers.findApplication(id);
  }

  /**
   * POST /admin/influencer-applications/:id/approve
   *
   * Body nathi — kayo admin e token mathi aave chhe.
   * Application APPROVED ane `Influencer` row, **ek j transaction ma**.
   */
  @Post(':id/approve')
  @HttpCode(HttpStatus.OK)
  async approve(@Param('id', ParseUUIDPipe) id: string) {
    return this.influencers.approve(id);
  }

  /**
   * POST /admin/influencer-applications/:id/reject
   * Body: { "reason": "..." }
   *
   * ⚠️ `reason` APPLICANT NE DEKHAAY CHHE, ane 30 divas ni re-apply ni raah
   * aa j kshan thi shuru thay chhe.
   */
  @Post(':id/reject')
  @HttpCode(HttpStatus.OK)
  async reject(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: RejectApplicationDto,
  ) {
    return this.influencers.reject(id, dto.reason);
  }
}
