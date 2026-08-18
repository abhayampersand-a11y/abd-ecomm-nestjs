import { Injectable, Logger } from '@nestjs/common';
import { idFromGid } from './gid.util';
import {
  CUSTOMER_ORDERS_QUERY,
  ORDER_DETAIL_QUERY,
  type CustomerOrdersResponse,
  type OrderDetailResponse,
  type RawOrderCard,
  type RawOrderDetail,
} from './queries/order.queries';
import { ShopifyGraphqlClient } from './shopify-graphql.client';

export interface RawOrderPage {
  nodes: RawOrderCard[];
  nextCursor: string | null;
  hasNextPage: boolean;
}

/**
 * Grahak na orders Shopify parthi.
 *
 * ⚠️ AA AAKHI SERVICE NO EK J NIYAM: dar method ne `shopifyCustomerIds`
 * FARJIYAT joiye chhe, ane e list khaali hoy to kai j pacho nathi aavtu.
 *
 * Kem farjiyat: jo koi din koi e "badha orders" vaali method ummeri, to ek
 * bhool e aakhi store no order history kholi de. Signature ma j customer ids
 * majboor karvathi evi method bhoolthi banаvi na shakay.
 */
@Injectable()
export class ShopifyOrderService {
  private readonly logger = new Logger(ShopifyOrderService.name);

  /** Ek page ma vadhu ma vadhu ketla orders */
  private static readonly MAX_PAGE_SIZE = 50;

  constructor(private readonly shopify: ShopifyGraphqlClient) {}

  async findOrders(
    shopifyCustomerIds: string[],
    opts: { limit: number; cursor?: string },
  ): Promise<RawOrderPage> {
    if (shopifyCustomerIds.length === 0) {
      return { nodes: [], nextCursor: null, hasNextPage: false };
    }

    const data = await this.shopify.request<CustomerOrdersResponse>(
      CUSTOMER_ORDERS_QUERY,
      {
        query: this.ownerFilter(shopifyCustomerIds),
        first: Math.min(opts.limit, ShopifyOrderService.MAX_PAGE_SIZE),
        after: opts.cursor ?? null,
      },
      'orders.list',
    );

    // Shopify e filter lagaadyu j chhe, pan aapne fari khaatri kariye chhiye.
    // (Ek j jagya e bharoso na mukvo — `ShopifyCustomerService.actuallyMatches`
    // ma pan aa j paath chhe: Shopify no search fuzzy chhe.)
    const owned = data.orders.nodes.filter((o) =>
      this.isOwnedBy(o, shopifyCustomerIds),
    );

    if (owned.length !== data.orders.nodes.length) {
      this.logger.warn(
        `orders.list e ${data.orders.nodes.length - owned.length} order(s) ` +
          `pacha aapya je aa grahak na NATHI — filter kari naakhya`,
      );
    }

    return {
      nodes: owned,
      nextCursor: data.orders.pageInfo.endCursor,
      hasNextPage: data.orders.pageInfo.hasNextPage,
    };
  }

  /**
   * Ek order — fakt tyare j male jyare e AA grahak no j hoy.
   * Bija koi no order maangso to `null` male chhe (404 jevu), "forbidden"
   * nahi: "aa order chhe pan tamaro nathi" evu kehvu pan ek leak chhe.
   */
  async findOrderByName(
    shopifyCustomerIds: string[],
    nameQuery: string,
  ): Promise<RawOrderDetail | null> {
    if (shopifyCustomerIds.length === 0) return null;

    const data = await this.shopify.request<OrderDetailResponse>(
      ORDER_DETAIL_QUERY,
      { query: `${nameQuery} AND ${this.ownerFilter(shopifyCustomerIds)}` },
      'orders.detail',
    );

    const order = data.orders.nodes[0];
    if (!order) return null;

    if (!this.isOwnedBy(order, shopifyCustomerIds)) {
      this.logger.warn(
        `orders.detail e ${order.name} pacho aapyo je aa grahak no nathi — rok'yo`,
      );
      return null;
    }

    return order;
  }

  // -------------------------------------------------------------------------

  /** `(customer_id:123 OR customer_id:456)` */
  private ownerFilter(shopifyCustomerIds: string[]): string {
    return `(${shopifyCustomerIds.map((id) => `customer_id:${id}`).join(' OR ')})`;
  }

  private isOwnedBy(order: RawOrderCard, shopifyCustomerIds: string[]): boolean {
    // Guest checkout ma customer null hoy shake — evo order koi na account no
    // nathi, etle koi ne na dekhaadvo.
    if (!order.customer) return false;
    return shopifyCustomerIds.includes(idFromGid(order.customer.id));
  }
}
