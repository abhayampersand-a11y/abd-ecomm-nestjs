import {
  Body,
  Controller,
  Delete,
  Get,
  Header,
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
import { ListCustomersDto } from '../dto/list-customers.dto';
import { MergeCustomersDto } from '../dto/merge-customers.dto';
import {
  BlockCustomerDto,
  ListCustomerOrdersDto,
  UpdateCustomerDto,
} from '../dto/update-customer.dto';
import { AdminCustomerMergeService } from './admin-customer-merge.service';
import { AdminCustomersService } from './admin-customers.service';

@Controller('admin/customers')
@UseGuards(AdminJwtGuard)
export class AdminCustomersController {
  constructor(
    private readonly customers: AdminCustomersService,
    private readonly merge: AdminCustomerMergeService,
  ) {}

  /**
   * GET /admin/customers?search=98765&status=ACTIVE&sort=newest&page=1&limit=25
   *
   * `search` ek j box chhe — phone, email, naam, aapdo uuid ke Shopify
   * customer id, badhu ahiya naakhi shakay.
   */
  @Get()
  async list(@Query() query: ListCustomersDto) {
    return this.customers.list(query);
  }

  /**
   * GET /admin/customers/export?status=ACTIVE
   * List jeva j filters — fakt CSV ma.
   *
   * ⚠️ `:id` route thi PEHLA hovu j joiye, nahi to Nest "export" ne id samje.
   */
  @Get('export')
  @Header('Content-Type', 'text/csv; charset=utf-8')
  @Header('Content-Disposition', 'attachment; filename="customers.csv"')
  async export(@Query() query: ListCustomersDto): Promise<string> {
    return this.customers.exportCsv(query);
  }

  /**
   * POST /admin/customers/merge
   * Body: { "sourceCustomerId": "...", "targetCustomerId": "...", "dryRun": true }
   *
   * Pehla hammesha `dryRun: true` thi chalavo — merge undo nathi thai shakto.
   */
  @Post('merge')
  @HttpCode(HttpStatus.OK)
  async mergeCustomers(@Body() dto: MergeCustomersDto) {
    return this.merge.merge(dto);
  }

  /** GET /admin/customers/:id — profile + identities + Shopify links + cart */
  @Get(':id')
  async findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.customers.findOne(id);
  }

  /**
   * PATCH /admin/customers/:id
   * Body: { "firstName": "...", "lastName": "...", "gender": "..." }
   *
   * Email ane phone ahiya thi NA badlaay — juo UpdateCustomerDto.
   */
  @Patch(':id')
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateCustomerDto,
  ) {
    return this.customers.update(id, dto);
  }

  /** POST /admin/customers/:id/block — login band + badhi sessions revoke */
  @Post(':id/block')
  @HttpCode(HttpStatus.OK)
  async block(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: BlockCustomerDto,
  ) {
    return this.customers.block(id, dto.reason);
  }

  /** POST /admin/customers/:id/unblock */
  @Post(':id/unblock')
  @HttpCode(HttpStatus.OK)
  async unblock(@Param('id', ParseUUIDPipe) id: string) {
    return this.customers.unblock(id);
  }

  /** POST /admin/customers/:id/logout-all — badha devices par thi kaadho */
  @Post(':id/logout-all')
  @HttpCode(HttpStatus.OK)
  async logoutAll(@Param('id', ParseUUIDPipe) id: string) {
    return this.customers.logoutEverywhere(id);
  }

  /** GET /admin/customers/:id/sessions — chalu sessions + push devices */
  @Get(':id/sessions')
  async sessions(@Param('id', ParseUUIDPipe) id: string) {
    return this.customers.sessions(id);
  }

  /** DELETE /admin/customers/:id/sessions/:sessionId — ek j device kaadho */
  @Delete(':id/sessions/:sessionId')
  async revokeSession(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('sessionId', ParseUUIDPipe) sessionId: string,
  ) {
    return this.customers.revokeSession(id, sessionId);
  }

  /**
   * GET /admin/customers/:id/orders?limit=20&cursor=...
   * Shopify parthi live — etle ahiya cursor chhe, page number nahi.
   */
  @Get(':id/orders')
  async orders(
    @Param('id', ParseUUIDPipe) id: string,
    @Query() query: ListCustomerOrdersDto,
  ) {
    return this.customers.orderHistory(id, {
      limit: query.limit,
      cursor: query.cursor,
    });
  }

  /** GET /admin/customers/:id/addresses — sync status sathe */
  @Get(':id/addresses')
  async addresses(@Param('id', ParseUUIDPipe) id: string) {
    return this.customers.addresses(id);
  }

  /** GET /admin/customers/:id/cart — atyare enu cart ma su chhe */
  @Get(':id/cart')
  async cart(@Param('id', ParseUUIDPipe) id: string) {
    return this.customers.cartOf(id);
  }

  /** GET /admin/customers/:id/wishlist */
  @Get(':id/wishlist')
  async wishlist(@Param('id', ParseUUIDPipe) id: string) {
    return this.customers.wishlistOf(id);
  }

  /** GET /admin/customers/:id/recently-viewed */
  @Get(':id/recently-viewed')
  async recentlyViewed(@Param('id', ParseUUIDPipe) id: string) {
    return this.customers.recentlyViewedOf(id);
  }
}
