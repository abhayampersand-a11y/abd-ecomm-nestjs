import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import type { AuthenticatedCustomer } from '../auth/strategies/jwt.strategy';
import { ListOrdersDto } from './dto/list-orders.dto';
import { OrdersService } from './orders.service';

/**
 * ⚠️ Products thi ultu — ahiya login FARJIYAT chhe, ane dar method potana j
 * orders aape chhe. `customerId` hammesha token mathi j aave chhe, kyarey
 * query ke body mathi nahi.
 */
@Controller('orders')
@UseGuards(JwtAuthGuard)
export class OrdersController {
  constructor(private readonly orders: OrdersService) {}

  /**
   * GET /orders?limit=20&cursor=...
   *
   * Sauthi navo order pehla. Grahak na BADHA Shopify records na orders
   * bhega thai ne aave chhe — guest checkout na juna orders pan.
   */
  @Get()
  async list(
    @CurrentUser() user: AuthenticatedCustomer,
    @Query() query: ListOrdersDto,
  ) {
    return this.orders.list(user.id, {
      limit: query.limit,
      cursor: query.cursor,
    });
  }

  /**
   * GET /orders/:id
   * `id` = order nu naam `#` vagar (daa.t. `PBG1036`) — e j je grahak ni
   * rasid par chhapelu chhe. Shopify na numeric ids app sudhi nathi jata.
   */
  @Get(':id')
  async findOne(
    @CurrentUser() user: AuthenticatedCustomer,
    @Param('id') id: string,
  ) {
    return this.orders.findOne(user.id, id);
  }
}
