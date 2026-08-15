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
   * OTP verify vakhte apne-aap pan chale chhe — aa manual re-run mate chhe
   * (daa.t. user e pachhi thi bijo email verify karyo).
   *
   * FAKT verified identifiers na orders jovaay chhe.
   */
  @Post('import-from-orders')
  @HttpCode(HttpStatus.OK)
  async importFromOrders(@CurrentUser() user: AuthenticatedCustomer) {
    return this.addresses.importFromPastOrders(user.id);
  }
}
