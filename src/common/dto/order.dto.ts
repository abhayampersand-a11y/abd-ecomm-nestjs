import type { ImageDto, MoneyDto } from './product.dto';

/**
 * ⚠️ MOBILE APP NO CONTRACT.
 *
 * Ahiya Shopify nu kai j na aave — `gid://shopify/Order/123`,
 * `displayFinancialStatus`, `currentTotalPriceSet.shopMoney`, `edges[].node`.
 * Aa file j e divaal chhe je Phase 2 (Postgres) vakhte mobile app ne bachavse.
 *
 * IDENTIFIER — jaan-bujhi ne aa rite:
 *
 *   OrderDto.id = order nu NAAM chhe (`PBG1036`), Shopify no numeric id nahi.
 *     Kem: aa naam grahak ni potani rasid par chhape chhe, e support ne
 *     kahi shake chhe, ane e AAPDA store nu data chhe — Shopify nu internal
 *     id nahi. Products ma handle vaparyo, ahiya order name. Ek j niyam:
 *     Shopify na numeric ids server ni bahar kyarey nathi jata.
 */

/**
 * Paisa bharaya ke nahi.
 *
 * Shopify na ghana statuses ne app mate 4 ma sameti didha chhe — app ne
 * `PARTIALLY_REFUNDED` ane `REFUNDED` vachche no farak batavvo nathi,
 * ene fakt "paisa pacha malya" batavvu chhe.
 */
export type PaymentStatus = 'PAID' | 'PENDING' | 'REFUNDED' | 'UNKNOWN';

/** Parcel kya pahonchyu */
export type FulfillmentStatus =
  | 'FULFILLED'
  | 'PARTIAL'
  | 'UNFULFILLED'
  | 'CANCELLED'
  | 'UNKNOWN';

/** Order ma jamelu address — aa saachvelu address NATHI, e vakhat no snapshot chhe */
export interface OrderAddressDto {
  firstName: string | null;
  lastName: string | null;
  phone: string | null;
  line1: string;
  line2: string | null;
  city: string;
  province: string | null;
  zip: string;
  country: string;
}

export interface OrderLineItemDto {
  /** Fakt list ma key tarike — app e aano koi arth na kaadhvo */
  id: string;
  title: string;
  /** "White / M" — single-variant product mate null */
  variantTitle: string | null;
  sku: string | null;
  quantity: number;
  image: ImageDto | null;
  /**
   * Aa line no KUL bhaav (quantity ganine, discount kaadhine).
   * Ek nag no bhaav joito hoy to app e bhaage — pan rasid ma aa j dekhaay chhe.
   */
  total: MoneyDto;
  /**
   * Product page par lai javu hoy to aa handle vaapro. Product delete thai
   * gayu hoy to null — tyare app e line ne tap-able na banaavvi.
   */
  productId: string | null;
}

export interface OrderTrackingDto {
  company: string | null;
  number: string | null;
  url: string | null;
}

export interface OrderSummaryDto {
  /** Order nu naam, `#` vagar — daa.t. `PBG1036` */
  id: string;
  /** Dekhaadva mate, `#` sathe — daa.t. `#PBG1036` */
  name: string;
  placedAt: string;
  paymentStatus: PaymentStatus;
  fulfillmentStatus: FulfillmentStatus;
  total: MoneyDto;
  /** Badhi lines ni quantity no saravalo — "3 items" batavva mate */
  itemCount: number;
  /** List ma thumbnail batavva mate — pehli line nu image */
  image: ImageDto | null;
  cancelledAt: string | null;
}

export interface OrderDto extends OrderSummaryDto {
  items: OrderLineItemDto[];
  subtotal: MoneyDto;
  shipping: MoneyDto;
  tax: MoneyDto;
  discount: MoneyDto;
  shippingAddress: OrderAddressDto | null;
  tracking: OrderTrackingDto[];
}
