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
  UseGuards,
} from '@nestjs/common';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import type { AuthenticatedCustomer } from '../auth/strategies/jwt.strategy';
import { AddressesService } from './addresses.service';
import { CreateAddressDto, UpdateAddressDto } from './dto/address.dto';

@Controller('addresses')
@UseGuards(JwtAuthGuard)
export class AddressesController {
  constructor(private readonly addresses: AddressesService) {}

  /** GET /addresses — default sauthi upar */
  @Get()
  async list(@CurrentUser() user: AuthenticatedCustomer) {
    return this.addresses.list(user.id);
  }

  /** POST /addresses */
  @Post()
  async create(
    @CurrentUser() user: AuthenticatedCustomer,
    @Body() dto: CreateAddressDto,
  ) {
    return this.addresses.create(user.id, dto);
  }

  /** PATCH /addresses/:id */
  @Patch(':id')
  async update(
    @CurrentUser() user: AuthenticatedCustomer,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateAddressDto,
  ) {
    return this.addresses.update(user.id, id, dto);
  }

  /** DELETE /addresses/:id */
  @Delete(':id')
  async remove(
    @CurrentUser() user: AuthenticatedCustomer,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.addresses.remove(user.id, id);
  }

  /** POST /addresses/:id/default */
  @Post(':id/default')
  @HttpCode(HttpStatus.OK)
  async setDefault(
    @CurrentUser() user: AuthenticatedCustomer,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.addresses.setDefault(user.id, id);
  }

  /**
   * POST /addresses/import-from-orders
   *
   * "Fetch my shipping addresses based on past order" checkbox nu endpoint.
   * FAKT juna ORDERS na shipping addresses jue chhe.
   *
   * Navi app builds e `/addresses/sync` vaparvu — e aa ane address book
   * banne kare chhe. Aa endpoint junа clients mate rakhelu chhe.
   *
   * FAKT verified identifiers na orders jovaay chhe.
   */
  @Post('import-from-orders')
  @HttpCode(HttpStatus.OK)
  async importFromOrders(@CurrentUser() user: AuthenticatedCustomer) {
    return this.addresses.importFromPastOrders(user.id);
  }

  /**
   * POST /addresses/sync
   *
   * Shopify parthi badhu khenchi lave chhe — customer no ADDRESS BOOK (user e
   * website par je save karyu hoy) ane juna ORDERS na shipping addresses,
   * banne. Fingerprint thi dedupe thay chhe.
   *
   * Email verify thaya pachhi aa apne-aap chale chhe, etle app e aa jate
   * call karvani jarur nathi — aa manual re-run ("Refresh" button) mate chhe.
   *
   * FAKT verified identifiers na records jovaay chhe.
   */
  @Post('sync')
  @HttpCode(HttpStatus.OK)
  async sync(@CurrentUser() user: AuthenticatedCustomer) {
    return this.addresses.syncFromShopify(user.id);
  }
}
