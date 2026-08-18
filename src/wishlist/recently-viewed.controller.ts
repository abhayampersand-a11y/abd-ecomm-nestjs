import {
  Controller,
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

/** Screen 26 — profile nu "recently viewed" */
@Controller('recently-viewed')
@UseGuards(JwtAuthGuard)
export class RecentlyViewedController {
  constructor(private readonly wishlist: WishlistService) {}

  /** GET /recently-viewed — chhella 20, navu pehla */
  @Get()
  async list(@CurrentUser() user: AuthenticatedCustomer) {
    return this.wishlist.listRecentlyViewed(user.id);
  }

  /**
   * POST /recently-viewed/:productId
   *
   * App e product page kholе tyare aa call kare chhe. Jaan-bujhi ne
   * fire-and-forget jevu chhe — javaab ma kai j nathi, ane app e aa call
   * na javaab ni raah joya vagar product batavi devu.
   */
  @Post(':productId')
  @HttpCode(HttpStatus.NO_CONTENT)
  async record(
    @CurrentUser() user: AuthenticatedCustomer,
    @Param('productId') productId: string,
  ): Promise<void> {
    await this.wishlist.recordView(user.id, productId);
  }
}
