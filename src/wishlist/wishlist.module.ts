import { Module } from '@nestjs/common';
import { ProductsModule } from '../products/products.module';
import { RecentlyViewedController } from './recently-viewed.controller';
import { WishlistController } from './wishlist.controller';
import { WishlistService } from './wishlist.service';

/**
 * Wishlist ane recently-viewed ek j module ma — banne "grahak ni product
 * list" chhe, banne fakt handles saachve chhe, ane banne ne products
 * laavva mate e j `ProductsService` joiye chhe.
 */
@Module({
  imports: [ProductsModule],
  controllers: [WishlistController, RecentlyViewedController],
  providers: [WishlistService],
  exports: [WishlistService],
})
export class WishlistModule {}
