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
import type { AuthenticatedAdmin } from '../auth/admin-auth.service';
import { CurrentAdmin } from '../auth/current-admin.decorator';
import { ListApplicationsDto } from '../dto/list-applications.dto';
import { AdminApplicationsService } from './admin-applications.service';

/**
 * Gate 1 — creator applications ni review queue.
 *
 * ⚠️ `@UseGuards(AdminJwtGuard)` — aa ek line ahiya thi kadhaay to gme te
 * grahak bija loko na PAN numbers vaanchi shake.
 */
@Controller('admin/influencer-applications')
@UseGuards(AdminJwtGuard)
export class AdminApplicationsController {
  constructor(private readonly applications: AdminApplicationsService) {}

  /** GET /admin/influencer-applications?status=PENDING&sort=newest&page=1 */
  @Get()
  async list(@Query() query: ListApplicationsDto) {
    return this.applications.list(query);
  }

  /**
   * GET /admin/influencer-applications/pending-count
   *
   * ⚠️ `:id` thi PEHLA hovu joiye, nahi to "pending-count" ne UUID tarike
   * parse karvani koshish thay chhe ane 400 male chhe.
   */
  @Get('pending-count')
  async pendingCount() {
    return this.applications.pendingCount();
  }

  /** GET /admin/influencer-applications/:id — PAN masked j aave chhe */
  @Get(':id')
  async findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.applications.findOne(id);
  }

  /**
   * POST /admin/influencer-applications/:id/approve
   *
   * Aa call pachhi grahak na app ma Creator tab khulli jaay chhe.
   */
  @Post(':id/approve')
  @HttpCode(HttpStatus.OK)
  async approve(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentAdmin() admin: AuthenticatedAdmin,
  ) {
    return this.applications.approve(id, admin.email);
  }

  /**
   * POST /admin/influencer-applications/:id/reject
   * Body: { "reason": "..." }
   *
   * Kaaran farjiyat chhe — e applicant ne jem nu tem dekhaay chhe.
   */
  @Post(':id/reject')
  @HttpCode(HttpStatus.OK)
  async reject(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: RejectApplicationDto,
    @CurrentAdmin() admin: AuthenticatedAdmin,
  ) {
    return this.applications.reject(id, dto.reason, admin.email);
  }
}
