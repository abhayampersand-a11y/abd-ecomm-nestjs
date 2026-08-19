import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { AddressesModule } from './addresses/addresses.module';
import { AdminModule } from './admin/admin.module';
import { AuthModule } from './auth/auth.module';
import { CartModule } from './cart/cart.module';
import { CheckoutModule } from './checkout/checkout.module';
import { CollectionsModule } from './collections/collections.module';
import { validateEnv } from './config/env.schema';
import { ContentModule } from './content/content.module';
import { HealthController } from './health/health.controller';
import { InfluencerModule } from './influencer/influencer.module';
import { NotificationsModule } from './notifications/notifications.module';
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
    InfluencerModule,

    // App nu content (banners, home layout, pages, FAQ) — public reads
    ContentModule,
    // Push device tokens (grahak ni baaju). Mokalvanu kaam AdminModule ma chhe.
    NotificationsModule,

    // Admin panel — badha routes /admin/* par, alag JWT secret pachhal
    AdminModule,
  ],
  controllers: [HealthController],
  providers: [{ provide: APP_GUARD, useClass: ThrottlerGuard }],
})
export class AppModule {}
