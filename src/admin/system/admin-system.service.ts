import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { CollectionsService } from '../../collections/collections.service';
import type { Env } from '../../config/env.schema';
import { PrismaService } from '../../prisma/prisma.service';
import { ProductsService } from '../../products/products.service';
import { RedisService } from '../../redis/redis.service';
import { ShopifyTokenService } from '../../shopify/shopify-token.service';
import { AdminAuditService } from '../audit/admin-audit.service';
import { fullName } from '../dto/admin-customer.dto';
import {
  toAdminPage,
  toSkipTake,
  type AdminPageDto,
} from '../dto/pagination.dto';
import type {
  CacheScope,
  ListPendingAddressSyncDto,
} from '../dto/system.dto';

/**
 * Ops screens — "kai bagdyu chhe?" no javaab.
 *
 * Public `/health` thi aa alag chhe: e load balancer mate chhe ane ochhu
 * kahe chhe (jaan-bujhi ne — public endpoint e internals na batavva). Ahiya
 * admin login pachhal chhe, etle vistaar thi kahi shakay.
 */
@Injectable()
export class AdminSystemService {
  private readonly logger = new Logger(AdminSystemService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly shopifyToken: ShopifyTokenService,
    private readonly products: ProductsService,
    private readonly collections: CollectionsService,
    private readonly config: ConfigService<Env, true>,
    private readonly audit: AdminAuditService,
  ) {}

  async status() {
    const [db, cache] = await Promise.allSettled([
      this.prisma.$queryRaw`SELECT 1`,
      this.redis.client.ping(),
    ]);

    const postgres = db.status === 'fulfilled' ? 'up' : 'down';
    const redis = cache.status === 'fulfilled' ? 'up' : 'down';

    const [pendingAddressSync, expiredOtps, staleSessions] = await Promise.all([
      this.prisma.address.count({ where: { shopifyAddressId: null } }),
      this.prisma.otpCode.count({
        where: { consumedAt: null, expiresAt: { lt: new Date() } },
      }),
      this.prisma.refreshToken.count({
        where: { revokedAt: null, expiresAt: { lt: new Date() } },
      }),
    ]);

    return {
      status: postgres === 'up' && redis === 'up' ? 'ok' : 'degraded',

      services: {
        postgres,
        redis,
        // Shopify ne ahiya ping nathi karta — dar refresh e token endpoint
        // par javu e enu rate-limit bucket khaali kari naakhe chhe.
        shopify: this.shopifyToken.isConfigured() ? 'configured' : 'not-configured',
      },

      shopify: {
        storeDomain: this.config.get('SHOPIFY_STORE_DOMAIN', { infer: true }) || null,
        apiVersion: this.config.get('SHOPIFY_API_VERSION', { infer: true }),
        productSource: this.config.get('PRODUCT_SOURCE', { infer: true }),
        storefrontTokenSet: Boolean(
          this.config.get('SHOPIFY_STOREFRONT_TOKEN', { infer: true }),
        ),
        createCustomerOnSignup: this.config.get(
          'SHOPIFY_CREATE_CUSTOMER_ON_SIGNUP',
          { infer: true },
        ),
      },

      /** Aa aankda vadhta jaay to kaik atkyu chhe */
      backlog: {
        addressesPendingShopifySync: pendingAddressSync,
        expiredOtpRows: expiredOtps,
        expiredSessionRows: staleSessions,
      },

      environment: this.config.get('NODE_ENV', { infer: true }),
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * E addresses jem no Shopify sudhi pahonchvano baaki chhe.
   *
   * `shopifyAddressId` null etle kaa to Shopify e vakhte down hato, kaa to
   * country code na oLakhaayo (juo `AddressesService.pushToShopify`) — ke
   * pachhi e grahak nu Shopify ma koi record j nathi.
   */
  async pendingAddressSyncs(
    query: ListPendingAddressSyncDto,
  ): Promise<AdminPageDto<unknown>> {
    const where = { shopifyAddressId: null };

    const [rows, total] = await this.prisma.$transaction([
      this.prisma.address.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        ...toSkipTake(query),
        include: {
          customer: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              primaryPhone: true,
              shopifyCustomerId: true,
            },
          },
        },
      }),
      this.prisma.address.count({ where }),
    ]);

    const items = rows.map((a) => ({
      id: a.id,
      city: a.city,
      country: a.country,
      countryCode: a.countryCode,
      /** Country code null hoy to push kyarey nahi thaay — ee j karan chhe */
      likelyReason: a.countryCode
        ? a.customer.shopifyCustomerId
          ? 'Shopify was unreachable when this address was saved'
          : 'Customer is not linked to a Shopify record yet'
        : 'Country code is missing, so the address cannot be sent to Shopify',
      customer: {
        id: a.customer.id,
        name: fullName(a.customer),
        phone: a.customer.primaryPhone,
        shopifyCustomerId: a.customer.shopifyCustomerId,
      },
      createdAt: a.createdAt.toISOString(),
    }));

    return toAdminPage(items, total, query);
  }

  /**
   * Cache saaf karo.
   *
   * Shopify ma bhaav badlyo ane app ma juno dekhaay chhe — tyare aa. Phase 2
   * ma webhooks aa jaate karse, tyare aa button fakt emergency mate rahese.
   */
  async flushCache(scope: CacheScope) {
    const cleared: Record<string, number | 'cleared'> = {};

    if (scope === 'products' || scope === 'all') {
      await this.products.invalidate();
      cleared.products = 'cleared';
    }

    if (scope === 'collections' || scope === 'all') {
      await this.collections.invalidate();
      cleared.collections = 'cleared';
    }

    if (scope === 'orders' || scope === 'all') {
      // OrdersService pase invalidate() nathi — enu TTL 60 second no j chhe,
      // etle enu potanu invalidation kyarey joyu nathi. Ahiya sidhu pattern.
      cleared.orders = await this.redis.delByPattern('orders:list:*');
    }

    await this.audit.record({
      action: 'system.cache_flush',
      entityType: 'system',
      entityId: null,
      summary: `Flushed ${scope} cache`,
      after: cleared,
    });

    this.logger.log(`Admin flushed cache (scope: ${scope})`);

    return { success: true as const, scope, cleared };
  }
}
