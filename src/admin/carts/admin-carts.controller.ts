import { Controller, Get, Param, ParseUUIDPipe, Query, UseGuards } from '@nestjs/common';
import { AdminJwtGuard } from '../auth/admin-jwt.guard';
import { ListCartsDto } from '../dto/list-carts.dto';
import { AdminCartsService } from './admin-carts.service';

@Controller('admin/carts')
@UseGuards(AdminJwtGuard)
export class AdminCartsController {
  constructor(private readonly carts: AdminCartsService) {}

  /** GET /admin/carts?sort=updated&search=98765&page=1 — fakt bharela carts */
  @Get()
  async list(@Query() query: ListCartsDto) {
    return this.carts.list(query);
  }

  /**
   * GET /admin/carts/abandoned?idleHours=24
   *
   * ⚠️ `:id` thi PEHLA hovu joiye. Ane list par thi koi ne message mokalta
   * pehla enu order history joi levu — ahiya e pan aavse jene kharidi lidhu chhe.
   */
  @Get('abandoned')
  async abandoned(@Query() query: ListCartsDto) {
    return this.carts.abandoned(query);
  }

  /** GET /admin/carts/:id — line-by-line, add karyani tarikh sathe */
  @Get(':id')
  async findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.carts.findOne(id);
  }
}
