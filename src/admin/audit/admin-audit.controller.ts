import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { AdminJwtGuard } from '../auth/admin-jwt.guard';
import { ListAuditLogsDto } from '../dto/audit.dto';
import { AdminAuditService } from './admin-audit.service';

@Controller('admin/audit-logs')
@UseGuards(AdminJwtGuard)
export class AdminAuditController {
  constructor(private readonly audit: AdminAuditService) {}

  /**
   * GET /admin/audit-logs?entityType=customer&entityId=<uuid>
   *
   * "Mane block kem karyo?" ke "mari wishlist kya gai?" — javaab ahiya chhe.
   * `entityId` thi ek j record no aakho itihaas male chhe.
   */
  @Get()
  async list(@Query() query: ListAuditLogsDto) {
    return this.audit.list(query);
  }

  /** GET /admin/audit-logs/actions — filter dropdown bharva mate */
  @Get('actions')
  async actions() {
    return this.audit.actions();
  }
}
