import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { AuthModule } from '../auth/auth.module';
import { CartModule } from '../cart/cart.module';
import { CollectionsModule } from '../collections/collections.module';
import type { Env } from '../config/env.schema';
import { ContentModule } from '../content/content.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { OrdersModule } from '../orders/orders.module';
import { ProductsModule } from '../products/products.module';
import { WishlistModule } from '../wishlist/wishlist.module';
import { AdminAuditController } from './audit/admin-audit.controller';
import { AdminAuditService } from './audit/admin-audit.service';
import { AdminContextInterceptor } from './audit/admin-context.interceptor';
import { AdminAuthController } from './auth/admin-auth.controller';
import { AdminAuthService } from './auth/admin-auth.service';
import { AdminJwtStrategy } from './auth/admin-jwt.strategy';
import { AdminCartsController } from './carts/admin-carts.controller';
import { AdminCartsService } from './carts/admin-carts.service';
import { AdminContentController } from './content/admin-content.controller';
import { AdminContentService } from './content/admin-content.service';
import { AdminCustomerMergeService } from './customers/admin-customer-merge.service';
import { AdminCustomersController } from './customers/admin-customers.controller';
import { AdminCustomersService } from './customers/admin-customers.service';
import { AdminDashboardController } from './dashboard/admin-dashboard.controller';
import { AdminDashboardService } from './dashboard/admin-dashboard.service';
import { AdminInfluencerApplicationsController } from './influencer/admin-influencer-applications.controller';
import { AdminInfluencerController } from './influencer/admin-influencer.controller';
import { AdminInfluencerService } from './influencer/admin-influencer.service';
import { AdminNotificationsController } from './notifications/admin-notifications.controller';
import { AdminNotificationsService } from './notifications/admin-notifications.service';
import { AdminSecurityController } from './security/admin-security.controller';
import { AdminSecurityService } from './security/admin-security.service';
import { AdminSystemController } from './system/admin-system.controller';
import { AdminSystemService } from './system/admin-system.service';

/**
 * Admin panel — EK j user, roles nathi.
 *
 * Aa module ne traN niyam chhe, ane traNey jaan-bujhi ne kadak chhe:
 *
 *  1. **Ahiya thi grahak nu kai j na chale.** Admin ni strategy nu naam
 *     'admin-jwt' chhe ane secret pan alag (JWT_ADMIN_SECRET). Grahak no
 *     token ahiya laavo to 401 j male chhe.
 *
 *  2. **Dar controller par `@UseGuards(AdminJwtGuard)`.** Global guard nathi
 *     rakhyo, karan ke aakhi app ma bija badha routes public ke customer-auth
 *     vaala chhe. Navo admin controller ummero tyare guard lakhvo BHOOLVU
 *     NAHI — e ek line j aakha customer database ne bachaave chhe.
 *
 *  3. **Badalvanu kaam audit ma jaay chhe.** Block, merge, banner delete,
 *     campaign send — badha writes `AdminAuditService.record()` call kare
 *     chhe. Actor ane IP `AdminContextInterceptor` mathi jate aave chhe.
 *
 * Vaanchvanu kaam ahiya nathi lakhaatu — badhu existing services (OrdersService,
 * CartService, WishlistService, ContentService) thi j aave chhe. Query fari
 * lakhso to be jagya e be niyamo bani jashe.
 */
@Module({
  imports: [
    PassportModule,
    // Signing vakhte secret explicitly pass thay chhe (juo AdminAuthService),
    // etle ahiya fakt module joiye chhe. Aa vagar admin no token bhulthi
    // grahak na secret thi sign thai jaay evi shakyata rahe chhe.
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService<Env, true>) => ({
        secret: config.get('JWT_ADMIN_SECRET', { infer: true }),
        signOptions: {
          expiresIn: config.get('JWT_ADMIN_TTL', { infer: true }),
          issuer: config.get('JWT_ISSUER', { infer: true }),
        },
      }),
    }),

    // Force-logout mate TokenService
    AuthModule,
    // Grahak nu order history — Shopify parthi, e j service thi je app vaapre chhe
    OrdersModule,
    CartModule,
    WishlistModule,
    // Cache flush ane content invalidation mate
    ProductsModule,
    CollectionsModule,
    ContentModule,
    // Push mokalva mate
    NotificationsModule,
  ],
  controllers: [
    AdminAuthController,
    AdminDashboardController,
    AdminCustomersController,
    AdminSecurityController,
    AdminCartsController,
    AdminContentController,
    AdminNotificationsController,
    AdminInfluencerApplicationsController,
    AdminInfluencerController,
    AdminAuditController,
    AdminSystemController,
  ],
  providers: [
    AdminAuthService,
    AdminJwtStrategy,
    AdminAuditService,
    AdminDashboardService,
    AdminCustomersService,
    AdminCustomerMergeService,
    AdminSecurityService,
    AdminCartsService,
    AdminContentService,
    AdminNotificationsService,
    AdminInfluencerService,
    AdminSystemService,

    // Global chhe pan kaam fakt `/admin/` par kare chhe — juo interceptor.
    // Aa thi audit ma actor ane IP jate bharaay chhe ane koi service ne
    // e parameters pass karva padta nathi.
    { provide: APP_INTERCEPTOR, useClass: AdminContextInterceptor },
  ],
})
export class AdminModule {}
