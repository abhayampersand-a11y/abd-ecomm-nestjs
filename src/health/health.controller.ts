import { Controller, Get } from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { ShopifyTokenService } from '../shopify/shopify-token.service';

@Controller('health')
@SkipThrottle()
export class HealthController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly shopifyToken: ShopifyTokenService,
  ) {}

  @Get()
  async check() {
    const [db, cache] = await Promise.allSettled([
      this.prisma.$queryRaw`SELECT 1`,
      this.redis.client.ping(),
    ]);

    const postgres = db.status === 'fulfilled' ? 'up' : 'down';
    const redis = cache.status === 'fulfilled' ? 'up' : 'down';

    // Shopify ne ahiya ping nathi karta — health check dar few seconds e
    // chale chhe ane e cost bucket khaali kari naakhe. Fakt config chhe ke
    // nahi e batavye chhiye.
    const shopify = this.shopifyToken.isConfigured()
      ? 'configured'
      : 'not-configured';

    return {
      status: postgres === 'up' && redis === 'up' ? 'ok' : 'degraded',
      services: { postgres, redis, shopify },
      timestamp: new Date().toISOString(),
    };
  }
}
