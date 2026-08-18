import {
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import type { AuthenticatedCustomer } from '../auth/strategies/jwt.strategy';
import { WishlistService } from './wishlist.service';

/** Screens 24, 26 — "Your Wishlist" */
@Controller('wishlist')
@UseGuards(JwtAuthGuard)
export class WishlistController {
  constructor(private readonly wishlist: WishlistService) {}

  /** GET /wishlist — navu pehla */
  @Get()
  async list(@CurrentUser() user: AuthenticatedCustomer) {
    return this.wishlist.list(user.id);
  }

  /**
   * POST /wishlist/:productId
   * `productId` = product no handle, products API jevu j.
   */
  @Post(':productId')
  @HttpCode(HttpStatus.OK)
  async add(
    @CurrentUser() user: AuthenticatedCustomer,
    @Param('productId') productId: string,
  ) {
    return this.wishlist.add(user.id, productId);
  }

  /** DELETE /wishlist/:productId */
  @Delete(':productId')
  async remove(
    @CurrentUser() user: AuthenticatedCustomer,
    @Param('productId') productId: string,
  ) {
    return this.wishlist.remove(user.id, productId);
  }
}
