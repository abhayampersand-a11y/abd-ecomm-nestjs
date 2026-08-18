import { Module } from '@nestjs/common';
import { ProductsModule } from '../products/products.module';
import { CartController } from './cart.controller';
import { CartService } from './cart.service';

/**
 * `ProductsModule` joiye chhe — cart ma item ummerta pehla variant kharekhar
 * chhe ke nahi ane eno bhaav shu chhe e tya thi j aave chhe (Redis-cached).
 */
@Module({
  imports: [ProductsModule],
  controllers: [CartController],
  providers: [CartService],
  exports: [CartService],
})
export class CartModule {}
