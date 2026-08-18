import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { AddressesModule } from './addresses/addresses.module';
import { AuthModule } from './auth/auth.module';
import { CartModule } from './cart/cart.module';
import { CheckoutModule } from './checkout/checkout.module';
import { CollectionsModule } from './collections/collections.module';
import { validateEnv } from './config/env.schema';
import { HealthController } from './health/health.controller';
import { OrdersModule } from './orders/orders.module';
import { PrismaModule } from './prisma/prisma.module';
import { ProductsModule } from './products/products.module';
import { RedisModule } from './redis/redis.module';
import { ShopifyModule } from './shopify/shopify.module';
import { WishlistModule } from './wishlist/wishlist.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      cache: true,
      validate: validateEnv,
    }),

    // Baseline throttle — badha routes par. Auth routes par vadhu kadak
    // limits controller ma @Throttle() thi chhe, ane OTP-specific (per phone,
    // per IP) limits Redis ma OtpService ma chhe.
    ThrottlerModule.forRoot([{ name: 'default', ttl: 60_000, limit: 100 }]),

    PrismaModule,
    RedisModule,
    ShopifyModule,
    AuthModule,
    AddressesModule,
    ProductsModule,
    CollectionsModule,
    OrdersModule,
    CartModule,
    CheckoutModule,
    WishlistModule,
  ],
  controllers: [HealthController],
  providers: [{ provide: APP_GUARD, useClass: ThrottlerGuard }],
})
export class AppModule {}
