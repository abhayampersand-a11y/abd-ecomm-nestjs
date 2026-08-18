import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { OrderDto, OrderSummaryDto } from '../common/dto/order.dto';
import type { PageDto } from '../common/dto/product.dto';
import type { Env } from '../config/env.schema';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import {
  orderIdFromName,
  orderNameQuery,
  toOrderDto,
  toOrderSummaryDto,
} from '../shopify/mappers/order.mapper';
import { ShopifyOrderService } from '../shopify/shopify-order.service';

/**
 * Grahak na potana orders.
 *
 * Phase 1 ma aa Shopify parthi live aave chhe (products jevu j proxy mode).
 * Phase 2 ma orders aapda Postgres ma mirror thashe — tyare fakt aa service
 * nu andar badlashe, controller ane DTO jem na tem, ane mobile app ma ek
 * line pan nahi.
 */
@Injectable()
export class OrdersService {
  private readonly logger = new Logger(OrdersService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly orders: ShopifyOrderService,
    private readonly redis: RedisService,
    private readonly config: ConfigService<Env, true>,
  ) {}

  async list(
    customerId: string,
    opts: { limit: number; cursor?: string },
  ): Promise<PageDto<OrderSummaryDto>> {
    const shopifyCustomerIds = await this.linkedShopifyCustomerIds(customerId);

    // Aa grahak Shopify sathe haju jodayo j nathi — enu email verify thay
    // etle `IdentityService.linkShopifyRecords()` links banaavse ane tyare
    // aa apoaap bharaai jashe.
    if (shopifyCustomerIds.length === 0) {
      return { items: [], nextCursor: null, hasNextPage: false };
    }

    const key = `orders:list:${customerId}:${opts.limit}:${opts.cursor ?? ''}`;
    const cached = await this.redis.getJson<PageDto<OrderSummaryDto>>(key);
    if (cached) return cached;

    const page = await this.orders.findOrders(shopifyCustomerIds, opts);

    const result: PageDto<OrderSummaryDto> = {
      items: page.nodes.map(toOrderSummaryDto),
      nextCursor: page.hasNextPage ? page.nextCursor : null,
      hasNextPage: page.hasNextPage,
    };

    await this.redis.setJson(
      key,
      result,
      this.config.get('ORDER_LIST_CACHE_TTL', { infer: true }),
    );

    return result;
  }

  async findOne(customerId: string, orderId: string): Promise<OrderDto> {
    const shopifyCustomerIds = await this.linkedShopifyCustomerIds(customerId);

    const raw = shopifyCustomerIds.length
      ? await this.orders.findOrderByName(
          shopifyCustomerIds,
          orderNameQuery(orderId),
        )
      : null;

    // ⚠️ Bija na order mate pan E J javaab — "Order not found".
    // "Aa order chhe pan tamaro nathi" evu kehvathi koi order numbers
    // aajmaavi ne jaani shake ke kayo order kharekhar chhe.
    if (!raw) {
      throw new NotFoundException('Order not found');
    }

    return toOrderDto(raw);
  }

  // -------------------------------------------------------------------------

  /**
   * Aa grahak na badha Shopify customer records.
   *
   * Ek vyakti na ghana records hoy shake chhe — guest checkout e dar vakhte
   * navo banaavyo hoy, ke phone vaalo ane email vaalo alag hoy. Enu order
   * history in badha ma vahenchayelu chhe, etle badha ni jarur chhe.
   *
   * ⚠️ Aa list j security no paayo chhe. Ahiya fakt e j ids aave je
   * VERIFIED identifier parthi jodaya hoy — juo `IdentityService`.
   */
  private async linkedShopifyCustomerIds(customerId: string): Promise<string[]> {
    const [links, customer] = await Promise.all([
      this.prisma.shopifyCustomerLink.findMany({
        where: { customerId },
        select: { shopifyCustomerId: true },
      }),
      this.prisma.customer.findUnique({
        where: { id: customerId },
        select: { shopifyCustomerId: true },
      }),
    ]);

    const ids = new Set(links.map((l) => l.shopifyCustomerId));

    // Primary saamanya rite links ma hoy j chhe, pan `reconcileAfterEmailVerified`
    // pachhi e badlaai shake chhe — etle e alag thi pan ummeri daiye.
    if (customer?.shopifyCustomerId) ids.add(customer.shopifyCustomerId);

    return [...ids];
  }
}
