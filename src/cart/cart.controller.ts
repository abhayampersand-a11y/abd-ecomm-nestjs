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
import { CartService } from './cart.service';
import {
  AddCartItemDto,
  ApplyDiscountDto,
  UpdateCartItemDto,
} from './dto/cart-request.dto';

/**
 * Dar method aakho cart pacho aape chhe, fakt badlayeli line nahi.
 *
 * Kem: app ne dar badlaav pachhi subtotal ane badge no aankdo joiye j chhe.
 * Ek j response ma aapishu to app ne biji GET call nahi karvi pade — ane
 * cart screen kyarey adhkachru dekhaashe nahi.
 */
@Controller('cart')
@UseGuards(JwtAuthGuard)
export class CartController {
  constructor(private readonly cart: CartService) {}

  /** GET /cart */
  @Get()
  async get(@CurrentUser() user: AuthenticatedCustomer) {
    return this.cart.get(user.id);
  }

  /** POST /cart/items — screen 09 no "ADD TO CART" */
  @Post('items')
  async addItem(
    @CurrentUser() user: AuthenticatedCustomer,
    @Body() dto: AddCartItemDto,
  ) {
    return this.cart.addItem(user.id, {
      productId: dto.productId,
      variantId: dto.variantId,
      quantity: dto.quantity,
    });
  }

  /** PATCH /cart/items/:id — screen 10 na +/− buttons */
  @Patch('items/:id')
  async updateItem(
    @CurrentUser() user: AuthenticatedCustomer,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateCartItemDto,
  ) {
    return this.cart.updateItem(user.id, id, dto.quantity);
  }

  /** DELETE /cart/items/:id */
  @Delete('items/:id')
  async removeItem(
    @CurrentUser() user: AuthenticatedCustomer,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.cart.removeItem(user.id, id);
  }

  /** DELETE /cart — badhu khali karo */
  @Delete()
  async clear(@CurrentUser() user: AuthenticatedCustomer) {
    return this.cart.clear(user.id);
  }

  /** POST /cart/discount — screen 13 no voucher */
  @Post('discount')
  @HttpCode(HttpStatus.OK)
  async applyDiscount(
    @CurrentUser() user: AuthenticatedCustomer,
    @Body() dto: ApplyDiscountDto,
  ) {
    return this.cart.applyDiscount(user.id, dto.code);
  }

  /** DELETE /cart/discount */
  @Delete('discount')
  async removeDiscount(@CurrentUser() user: AuthenticatedCustomer) {
    return this.cart.removeDiscount(user.id);
  }
}
