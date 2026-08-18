import { Injectable, Logger } from '@nestjs/common';
import type { NormalizedIdentifier } from '../common/utils/identifier.util';
import { ShopifyGraphqlClient } from './shopify-graphql.client';
import {
  CUSTOMERS_SEARCH_QUERY,
  CUSTOMER_CREATE_MUTATION,
  CUSTOMER_MERGE_MUTATION,
  CUSTOMER_MERGE_PREVIEW_QUERY,
  CUSTOMER_ORDER_ADDRESSES_QUERY,
  CUSTOMER_UPDATE_MUTATION,
  type CustomerMergePreviewResponse,
  type CustomerMergeResponse,
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
  /**
   * ⚠️ Aa fakt tyare vaparvu jyare aapdi pase kai j na hoy.
   * User e app ma jate type karelu naam hammesha jite chhe — juo
   * `IdentityService.setPrimaryShopifyCustomer()`.
   */
  firstName: string | null;
  lastName: string | null;
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
        firstName: c.firstName,
        lastName: c.lastName,
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
   * Shopify customer par email/phone/naam set kare chhe.
   *
   * Email set karvu e j e step chhe je **website login chalu kare chhe** —
   * Shopify na customer accounts email par code mokle chhe, etle email vagar
   * app no user website par login j nathi kari shakto.
   *
   * ⚠️ email/phone FAKT verified values sathe j moklvi. firstName/lastName
   * par aa niyam lagu nathi padto — e unique nathi, etle koi bija na record
   * sathe khoti rite jodaan nathi karaavta.
   */
  async updateContact(
    shopifyCustomerId: string,
    fields: {
      email?: string;
      phone?: string;
      firstName?: string | null;
      lastName?: string | null;
    },
  ): Promise<{ success: boolean; reason?: string }> {
    // Naam mate `null` no matlab "Shopify par thi kaadhi naakh" ane
    // `undefined` no "hath j na lagaadto" — etle truthy check nahi chale.
    const changes = {
      ...(fields.email && { email: fields.email }),
      ...(fields.phone && { phone: fields.phone }),
      ...(fields.firstName !== undefined && { firstName: fields.firstName }),
      ...(fields.lastName !== undefined && { lastName: fields.lastName }),
    };

    if (Object.keys(changes).length === 0) return { success: true };

    const data = await this.shopify.request<CustomerMutationResponse>(
      CUSTOMER_UPDATE_MUTATION,
      {
        input: {
          id: `gid://shopify/Customer/${shopifyCustomerId}`,
          ...changes,
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
        `(${Object.keys(changes).join(', ')})`,
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
   * Be Shopify customer records ne ek karе chhe — orders sathe j.
   *
   * Kyare jarur pade: user e phone thi app ma signup karyu, aapne ena mate
   * navo Shopify record banaavyo, ene APP MA THI ORDER PAN KARYO — ane pachhi
   * e potano email verify kare tyare khabar pade ke eno juno record pehla thi
   * chhe. Have juno record delete NA thai shake (ena par order chhe), etle
   * merge j ek raasto chhe. Merge vagar e vyakti Shopify ma kaydami be
   * records tarike rahi jaay: admin, segments, LTV — badhu vahenchai jaay.
   *
   * `keepId` = jene rakhvo gamse (motabhage juno, vadhu orders vaalo).
   * ⚠️ Pan aa fakt aapdi ICHCHHA chhe — Shopify jate nakki kare chhe ane
   * `resultingCustomerId` ma kahे chhe. Etle e j return karીe chhiye, ane
   * caller e E J save karvo, `keepId` nahi.
   *
   * Preview pehla chale chhe: subscription/gift card/store credit jevu kai
   * hoy to Shopify merge nathi karva deto, ane tyare aapne chokkas karan
   * sathe `merged: false` aapiye chhiye jethi caller manual review mate log
   * kari shake.
   *
   * ⚠️ AA METHOD KYAREY THROW NATHI KARTU.
   *
   * Merge ne be alag scopes joiye chhe — `read_customer_merge` (preview) ane
   * `write_customer_merge` (mutation) — ane e `write_customers` ma AAVI
   * JATA NATHI, alag thi maangva pade chhe. E na hoy to Shopify ACCESS_DENIED
   * aape chhe.
   *
   * Aa throw kare to aakho `reconcileAfterEmailVerified()` atki jaay — ane
   * pachhi primary record set thato nathi, links sudharata nathi, addresses
   * import thata nathi. Etle ek "nice to have" saaf-safai baaki nu badhu
   * bagaadi naakhe. Etle ahiya badhu pakdi laiye chhiye ane fakt
   * `merged: false` kahiye chhiye.
   */
  async mergeCustomers(
    keepId: string,
    mergeFromId: string,
    overrides: { keepPhoneFrom?: string; keepEmailFrom?: string } = {},
  ): Promise<{ merged: boolean; resultingCustomerId?: string; reason?: string }> {
    if (keepId === mergeFromId) {
      return { merged: true, resultingCustomerId: keepId };
    }

    const gid = (id: string) => `gid://shopify/Customer/${id}`;

    let preview: CustomerMergePreviewResponse;
    try {
      preview = await this.shopify.request<CustomerMergePreviewResponse>(
        CUSTOMER_MERGE_PREVIEW_QUERY,
        { customerOneId: gid(keepId), customerTwoId: gid(mergeFromId) },
        'customer.mergePreview',
      );
    } catch (err) {
      // Sauthi sambhavit karan: `read_customer_merge` scope j nathi.
      // `npm run shopify:scopes` chalavo — e aa spashta batavse.
      return {
        merged: false,
        reason: `merge preview failed: ${(err as Error).message}`,
      };
    }

    const blockers = preview.customerMergePreview?.customerMergeErrors ?? [];
    if (blockers.length) {
      const reason = blockers
        .map((e) => `${e.errorFields?.join(',') || '?'}: ${e.message}`)
        .join(' | ');
      this.logger.warn(
        `Merge blocked (${mergeFromId} -> ${keepId}): ${reason}`,
      );
      return { merged: false, reason };
    }

    let data: CustomerMergeResponse;
    try {
      data = await this.shopify.request<CustomerMergeResponse>(
        CUSTOMER_MERGE_MUTATION,
        {
          customerOneId: gid(keepId),
          customerTwoId: gid(mergeFromId),
          overrideFields: {
            // App e banaavelo record fakt phone laavyo chhe — e phone juna
            // record par pahonchvo j joiye, nahi to aa vyakti fari kyarey
            // phone thi nahi male ane aakho reconcile fero fari thato rahese.
            ...(overrides.keepPhoneFrom && {
              customerIdOfPhoneNumberToKeep: gid(overrides.keepPhoneFrom),
            }),
            ...(overrides.keepEmailFrom && {
              customerIdOfEmailToKeep: gid(overrides.keepEmailFrom),
            }),
          },
        },
        'customer.merge',
      );
    } catch (err) {
      // `write_customer_merge` scope khute chhe, ke Shopify j nathi pahonchi
      // rahyu. Banne ma orphan rahi jaay chhe — e chalse, log ma dekhai jashe.
      return {
        merged: false,
        reason: `merge failed: ${(err as Error).message}`,
      };
    }

    const result = data.customerMerge;

    if (result?.userErrors?.length) {
      const reason = result.userErrors.map((e) => e.message).join(' | ');
      this.logger.warn(`customerMerge failed (${mergeFromId} -> ${keepId}): ${reason}`);
      return { merged: false, reason };
    }

    const resultingCustomerId = result?.resultingCustomerId
      ? idFromGid(result.resultingCustomerId)
      : undefined;

    if (!resultingCustomerId) {
      return { merged: false, reason: 'no resultingCustomerId in response' };
    }

    // Job async chale chhe — orders khsedvani prakriya thodi var laage. Aapne
    // rah nathi jota: resultingCustomerId aavi gayo chhe ane e j saacho chhe.
    this.logger.log(
      `Merged Shopify customer ${mergeFromId} into ${resultingCustomerId} ` +
        `(job ${result?.job?.id ?? 'n/a'})`,
    );

    return { merged: true, resultingCustomerId };
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
    const a = phoneKey(customer.phone);
    return a !== null && a === phoneKey(identifier.value);
  }
}

/** `gid://shopify/Customer/8823` → `8823` */
function idFromGid(gid: string): string {
  return gid.split('/').pop() ?? gid;
}

/** Bharat ma subscriber number 10 digit no — country code ane leading 0 ni bahar */
const SUBSCRIBER_DIGITS = 10;

/**
 * Phone ne sarkhaavva mate ek j swaroop ma laave chhe.
 *
 * ⚠️ Fakt digits kaadhi naakhvu PURATU NATHI — ane aa j pehla bug hato.
 * Aapdi pase hammesha E.164 hoy chhe (`+916352434438` → `916352434438`), pan
 * Shopify ma merchant e je type karyu hoy e — `6352434438`, `09876543210`,
 * `+91 98765 43210`. Digits sarkhaavso to `916352434438 !== 6352434438` aavse
 * ane E J VYAKTI na male — juna grahak ne navo ganine duplicate bani jaay.
 *
 * Etle chhella 10 digit par j compare kariye chhiye. Aa thi country code ane
 * leading 0, banne no farak nikli jaay chhe.
 *
 * ⚠️ Trade-off: be alag desh na number na chhella 10 digit sarkha hoy to
 * khoto match thay. Aa store bharat purtu j chhe (`DEFAULT_COUNTRY_CODE=IN`)
 * etle sweekaryu chhe. Multi-country thavu hoy tyare country code alag thi
 * sarkhaavvo padse.
 */
function phoneKey(phone: string | null): string | null {
  if (!phone) return null;

  const digits = phone.replace(/\D/g, '');
  if (!digits) return null;

  return digits.length > SUBSCRIBER_DIGITS
    ? digits.slice(-SUBSCRIBER_DIGITS)
    : digits;
}

function quote(value: string): string {
  return `'${value.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`;
}
