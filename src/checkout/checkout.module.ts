import { Module } from '@nestjs/common';
import { CheckoutController } from './checkout.controller';
import { CheckoutService } from './checkout.service';

/** `ShopifyCheckoutService` ane `PrismaService` global modules mathi aave chhe */
@Module({
  controllers: [CheckoutController],
  providers: [CheckoutService],
})
export class CheckoutModule {}
