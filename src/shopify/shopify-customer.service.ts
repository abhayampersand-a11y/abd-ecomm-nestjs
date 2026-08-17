import { Injectable, Logger } from '@nestjs/common';
import type { NormalizedIdentifier } from '../common/utils/identifier.util';
import { ShopifyGraphqlClient } from './shopify-graphql.client';
import {
  CUSTOMERS_SEARCH_QUERY,
  CUSTOMER_CREATE_MUTATION,
  CUSTOMER_ORDER_ADDRESSES_QUERY,
  CUSTOMER_UPDATE_MUTATION,
  type CustomerMutationResponse,
  type CustomerOrderAddressesResponse,
  type CustomersSearchResponse,
  type RawOrderAddress,
  type RawShopifyCustomer,
} from './queries/customer.queries';

export interface ShopifyCustomerMatch {
  /** Numeric id (gid nahi) */
  shopifyCustomerId: string;
  email: string | null;
  phone: string | null;
  orderCount: number;
}

@Injectable()
export class ShopifyCustomerService {
  private readonly logger = new Logger(ShopifyCustomerService.name);

  /** Ek vyakti na ketla Shopify records sudhi jovu (guest checkout duplicates) */
  private static readonly MAX_CUSTOMER_MATCHES = 10;
  /** Address import mate ketla juna orders jova */
  private static readonly MAX_ORDERS_PER_CUSTOMER = 25;

  constructor(private readonly shopify: ShopifyGraphqlClient) {}

  /**
   * VERIFIED identifier na aadhare aa vyakti na badha Shopify customer
   * records shodhe chhe.
   *
   * ⚠️ Ahiya fakt verified value j aavvi joiye. Un-verified email par search
   * karso to bija na records mali jashe — ane pachhi ena orders ane addresses
   * pan. Caller ni jawabdari chhe.
   */
  async findCustomersByIdentifier(
    identifier: NormalizedIdentifier,
  ): Promise<ShopifyCustomerMatch[]> {
    const field = identifier.type === 'EMAIL' ? 'email' : 'phone';
    const query = `${field}:${quote(identifier.value)}`;

    const data = await this.shopify.request<CustomersSearchResponse>(
      CUSTOMERS_SEARCH_QUERY,
      { query, first: ShopifyCustomerService.MAX_CUSTOMER_MATCHES },
      'customers.search',
    );

    return data.customers.nodes
      .filter((c) => this.actuallyMatches(c, identifier))
      .map((c) => ({
        shopifyCustomerId: idFromGid(c.id),
        email: c.email,
        phone: c.phone,
        orderCount: Number(c.numberOfOrders ?? 0),
      }));
  }

  /**
   * Aa Shopify customers na juna orders mathi shipping addresses kaadhe chhe.
   *
   * ⚠️ `read_all_orders` scope vagar Shopify fakt **chhella 60 divas** na
   * orders aape chhe. Juna grahak na 2 varas juna orders aa thi NAHI male —
   * e scope approve thay pachhi j aa feature kharekhar kaam karse.
   */
  async findOrderAddresses(
    shopifyCustomerIds: string[],
  ): Promise<RawOrderAddress[]> {
    if (shopifyCustomerIds.length === 0) return [];

    const results: RawOrderAddress[] = [];

    for (const customerId of shopifyCustomerIds) {
      const data = await this.shopify.request<CustomerOrderAddressesResponse>(
        CUSTOMER_ORDER_ADDRESSES_QUERY,
        {
          query: `customer_id:${customerId}`,
          first: ShopifyCustomerService.MAX_ORDERS_PER_CUSTOMER,
        },
        'orders.addresses',
      );

      results.push(...data.orders.nodes);
    }

    return results;
  }

  /**
   * Shopify ma navo customer banave chhe.
   *
   * ⚠️ FAKT verified values j moklvi. Un-verified email Shopify par mukso to:
   *   - Shopify no email unique constraint bhangi shake (bija no email hoy to)
   *   - ane pachhi jyare e asli vyakti potano email verify karshe, tyare e
   *     KHOTA Shopify customer sathe jodai jashe ane bija na orders joi lese.
   *
   * @returns numeric customer id, ke `null` jo Shopify e na banaavyo
   */
  async createCustomer(input: {
    phone?: string;
    email?: string;
    firstName?: string | null;
    lastName?: string | null;
  }): Promise<string | null> {
    if (!input.phone && !input.email) {
      this.logger.warn('createCustomer: either a phone or an email is required');
      return null;
    }

    const data = await this.shopify.request<CustomerMutationResponse>(
      CUSTOMER_CREATE_MUTATION,
      {
        input: {
          ...(input.email && { email: input.email }),
          ...(input.phone && { phone: input.phone }),
          ...(input.firstName && { firstName: input.firstName }),
          ...(input.lastName && { lastName: input.lastName }),
          tags: ['mobile-app'],
        },
      },
      'customer.create',
    );

    const result = data.customerCreate;

    // userErrors GraphQL `errors` ma nathi aavta — data ni andar aave chhe,
    // etle alag thi check karvu pade. Aa bhulai jaay to failure silent rahe.
    if (result?.userErrors?.length) {
      this.logger.warn(
        `customerCreate userErrors: ${result.userErrors
          .map((e) => `${e.field?.join('.') ?? '?'}: ${e.message}`)
          .join(' | ')}`,
      );
      return null;
    }

    if (!result?.customer) return null;

    const id = idFromGid(result.customer.id);
    this.logger.log(`Shopify customer created: ${id}`);
    return id;
  }

  /**
   * Shopify customer par email/phone set kare chhe.
   *
   * Email set karvu e j e step chhe je **website login chalu kare chhe** —
   * Shopify na customer accounts email par code mokle chhe, etle email vagar
   * app no user website par login j nathi kari shakto.
   *
   * ⚠️ Fakt VERIFIED values sathe j call karvu.
   */
  async updateContact(
    shopifyCustomerId: string,
    fields: { email?: string; phone?: string },
  ): Promise<{ success: boolean; reason?: string }> {
    if (!fields.email && !fields.phone) return { success: true };

    const data = await this.shopify.request<CustomerMutationResponse>(
      CUSTOMER_UPDATE_MUTATION,
      {
        input: {
          id: `gid://shopify/Customer/${shopifyCustomerId}`,
          ...(fields.email && { email: fields.email }),
          ...(fields.phone && { phone: fields.phone }),
        },
      },
      'customer.update',
    );

    const result = data.customerUpdate;

    if (result?.userErrors?.length) {
      const reason = result.userErrors.map((e) => e.message).join(' | ');
      // Sauthi common: "Email has already been taken" / "Phone has already
      // been taken" — e value vaalo bijo Shopify customer pehla thi chhe.
      // Caller e pachhi e juna record ne j link karvo joiye.
      this.logger.warn(
        `customerUpdate failed for ${shopifyCustomerId}: ${reason}`,
      );
      return { success: false, reason };
    }

    this.logger.log(
      `Shopify customer ${shopifyCustomerId} updated ` +
        `(${Object.keys(fields).join(', ')})`,
    );
    return { success: true };
  }

  /**
   * App e jate banaavelo khali record kaadhe chhe.
   *
   * Kyare jarur pade: user phone thi signup kare (aapne Shopify ma phone-only
   * record banaviye), pachhi e potano email verify kare ane tyare khabar pade
   * ke eno **juno** Shopify record pehla thi chhe (order history sathe).
   * Tyare aapne banaavelo khali record kaadhi naakhvo joiye, nahi to store ma
   * dar returning customer no duplicate rahi jashe.
   *
   * ⚠️ Fakt e record par vaparvu je AAPNE banaavyu hoy ane jena par ek pan
   * order na hoy.
   */
  async deleteCustomerIfEmpty(
    shopifyCustomerId: string,
  ): Promise<{ deleted: boolean; reason?: string }> {
    const check = await this.shopify.request<{
      customer: { numberOfOrders: string; tags: string[] } | null;
    }>(
      `query($id: ID!) { customer(id: $id) { numberOfOrders tags } }`,
      { id: `gid://shopify/Customer/${shopifyCustomerId}` },
      'customer.check',
    );

    if (!check.customer) return { deleted: false, reason: 'not found' };

    if (Number(check.customer.numberOfOrders ?? 0) > 0) {
      return { deleted: false, reason: 'has orders' };
    }
    if (!check.customer.tags?.includes('mobile-app')) {
      return { deleted: false, reason: 'not app-created' };
    }

    const data = await this.shopify.request<{
      customerDelete: {
        deletedCustomerId: string | null;
        userErrors: Array<{ message: string }>;
      };
    }>(
      `mutation($input: CustomerDeleteInput!) {
         customerDelete(input: $input) {
           deletedCustomerId
           userErrors { message }
         }
       }`,
      { input: { id: `gid://shopify/Customer/${shopifyCustomerId}` } },
      'customer.delete',
    );

    const errs = data.customerDelete?.userErrors ?? [];
    if (errs.length) {
      return { deleted: false, reason: errs.map((e) => e.message).join(' | ') };
    }

    this.logger.log(`Deleted orphan app-created Shopify customer ${shopifyCustomerId}`);
    return { deleted: true };
  }

  /**
   * Shopify no search "fuzzy" chhe — `email:'abc@x.com'` bija results pan
   * aapi shake chhe. Aapne exact match par j bharoso karvo, nahi to koi
   * bija na records jodai jaay.
   */
  private actuallyMatches(
    customer: RawShopifyCustomer,
    identifier: NormalizedIdentifier,
  ): boolean {
    if (identifier.type === 'EMAIL') {
      return customer.email?.toLowerCase() === identifier.value;
    }
    return normalizePhone(customer.phone) === normalizePhone(identifier.value);
  }
}

/** `gid://shopify/Customer/8823` → `8823` */
function idFromGid(gid: string): string {
  return gid.split('/').pop() ?? gid;
}

/** Shopify ma phone kyarek "+91 98765 43210" hoy chhe — digits j compare karo */
function normalizePhone(phone: string | null): string | null {
  return phone ? phone.replace(/\D/g, '') : null;
}

function quote(value: string): string {
  return `'${value.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`;
}
