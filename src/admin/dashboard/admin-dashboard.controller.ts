import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { AdminJwtGuard } from '../auth/admin-jwt.guard';
import { SignupsChartDto, TopProductsDto } from '../dto/dashboard.dto';
import { AdminDashboardService } from './admin-dashboard.service';

@Controller('admin/dashboard')
@UseGuards(AdminJwtGuard)
export class AdminDashboardController {
  constructor(private readonly dashboard: AdminDashboardService) {}

  /**
   * GET /admin/dashboard/summary
   * Panel no home screen — ek j call ma badha counters.
   */
  @Get('summary')
  async summary() {
    return this.dashboard.summary();
  }

  /** GET /admin/dashboard/signups?days=30 — line chart */
  @Get('signups')
  async signups(@Query() query: SignupsChartDto) {
    return this.dashboard.signups(query.days);
  }

  /** GET /admin/dashboard/top-products?limit=10 */
  @Get('top-products')
  async topProducts(@Query() query: TopProductsDto) {
    return this.dashboard.topProducts(query.limit);
  }
}
