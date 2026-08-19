import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { AdminJwtGuard } from '../auth/admin-jwt.guard';
import {
  CreateNotificationDto,
  CreateTemplateDto,
  EstimateAudienceDto,
  ListNotificationsDto,
  UpdateNotificationDto,
  UpdateTemplateDto,
} from '../dto/notification.dto';
import { PaginationDto } from '../dto/pagination.dto';
import { AdminNotificationsService } from './admin-notifications.service';

@Controller('admin/notifications')
@UseGuards(AdminJwtGuard)
export class AdminNotificationsController {
  constructor(private readonly notifications: AdminNotificationsService) {}

  /** GET /admin/notifications?status=SENT&page=1 */
  @Get()
  async list(@Query() query: ListNotificationsDto) {
    return this.notifications.list(query);
  }

  /**
   * POST /admin/notifications
   * `scheduledAt` aapo etle SCHEDULED, nahi to DRAFT. Banavvathi mokalaatu
   * nathi — `/send` alag call chhe, jaan-bujhi ne.
   */
  @Post()
  async create(@Body() dto: CreateNotificationDto) {
    return this.notifications.create(dto);
  }

  /**
   * POST /admin/notifications/estimate
   * Body: { "audience": "SEGMENT", "segment": "ABANDONED_CART" }
   *
   * Mokalva pehla aa batavvu — "40,000 devices" jovu ane "4 devices" jovu,
   * banne kissa ma admin ne atkavu joiye.
   */
  @Post('estimate')
  @HttpCode(HttpStatus.OK)
  async estimate(@Body() dto: EstimateAudienceDto) {
    return this.notifications.estimate(dto);
  }

  /**
   * POST /admin/notifications/dispatch-due
   *
   * Scheduled campaigns mokle chhe. Aa repo ma scheduler nathi, etle **bahar
   * no cron** aa hit kare (daa.t. dar 5 minute). Be vaar hit thay to pan
   * vaandho nahi — claim atomic chhe.
   */
  @Post('dispatch-due')
  @HttpCode(HttpStatus.OK)
  async dispatchDue() {
    return this.notifications.dispatchDue();
  }

  /** GET /admin/notifications/templates */
  @Get('templates')
  async listTemplates(@Query() query: PaginationDto) {
    return this.notifications.listTemplates(query);
  }

  @Post('templates')
  async createTemplate(@Body() dto: CreateTemplateDto) {
    return this.notifications.createTemplate(dto);
  }

  @Patch('templates/:id')
  async updateTemplate(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateTemplateDto,
  ) {
    return this.notifications.updateTemplate(id, dto);
  }

  @Delete('templates/:id')
  async removeTemplate(@Param('id', ParseUUIDPipe) id: string) {
    return this.notifications.removeTemplate(id);
  }

  /** GET /admin/notifications/:id — delivery failures sathe */
  @Get(':id')
  async findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.notifications.findOne(id);
  }

  @Patch(':id')
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateNotificationDto,
  ) {
    return this.notifications.update(id, dto);
  }

  /**
   * POST /admin/notifications/:id/send
   * ⚠️ Aa turat mokle chhe ane pachu levaay nahi.
   */
  @Post(':id/send')
  @HttpCode(HttpStatus.OK)
  async send(@Param('id', ParseUUIDPipe) id: string) {
    return this.notifications.send(id);
  }

  /** POST /admin/notifications/:id/cancel — scheduled campaign rokvo */
  @Post(':id/cancel')
  @HttpCode(HttpStatus.OK)
  async cancel(@Param('id', ParseUUIDPipe) id: string) {
    return this.notifications.cancel(id);
  }

  @Delete(':id')
  async remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.notifications.remove(id);
  }
}
