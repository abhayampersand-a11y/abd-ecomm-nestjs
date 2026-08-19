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
import { FlushCacheDto, ListPendingAddressSyncDto } from '../dto/system.dto';
import { AdminSystemService } from './admin-system.service';

@Controller('admin/system')
@UseGuards(AdminJwtGuard)
export class AdminSystemController {
  constructor(private readonly system: AdminSystemService) {}

  /**
   * GET /admin/system/status
   * Public `/health` nu vistrut roop — Shopify config ane backlog sathe.
   */
  @Get('status')
  async status() {
    return this.system.status();
  }

  /** GET /admin/system/address-sync?page=1 — je addresses atkya chhe */
  @Get('address-sync')
  async addressSync(@Query() query: ListPendingAddressSyncDto) {
    return this.system.pendingAddressSyncs(query);
  }

  /**
   * POST /admin/system/cache/flush
   * Body: { "scope": "products" }   // products | collections | orders | all
   */
  @Post('cache/flush')
  @HttpCode(HttpStatus.OK)
  async flushCache(@Body() dto: FlushCacheDto) {
    return this.system.flushCache(dto.scope);
  }
}
