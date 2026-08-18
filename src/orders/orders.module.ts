import { Module } from '@nestjs/common';
import { OrdersController } from './orders.controller';
import { OrdersService } from './orders.service';

/**
 * `ShopifyOrderService` ane `PrismaService` global modules mathi aave chhe
 * (`ShopifyModule` ane `PrismaModule` banne `@Global()` chhe), etle ahiya
 * imports ni jarur nathi.
 */
@Module({
  controllers: [OrdersController],
  providers: [OrdersService],
  exports: [OrdersService],
})
export class OrdersModule {}
