import type { ImageDto } from '../../common/dto/product.dto';
import type {
  FulfillmentStatus,
  OrderAddressDto,
  OrderDto,
  OrderLineItemDto,
  OrderSummaryDto,
  OrderTrackingDto,
  PaymentStatus,
} from '../../common/dto/order.dto';
import { moneyFromBag } from '../../common/utils/money.util';
import type {
  RawOrderCard,
  RawOrderDetail,
  RawOrderImage,
  RawOrderLineItem,
  RawOrderShippingAddress,
} from '../queries/order.queries';

/**
 * ⚠️ AA J E DIVAAL CHHE.
 *
 * Shopify no order data ahiya aave chhe, aapdo DTO bahar jaay chhe. Bahar
 * `gid://shopify/Order/...`, `displayFinancialStatus`, `shopMoney` — kai j
 * nathi jatu.
 */

/**
 * Shopify na 8-9 financial statuses ne app mate 4 ma sameti didha chhe.
 *
 * Kem: grahak ne `PARTIALLY_REFUNDED` ane `REFUNDED` vachche no farak nathi
 * joito — ene "paisa pacha malya" j joiye chhe. Ochha statuses etle app ma
 * ochhi if-else ane ochhi bhulo.
 */
const PAYMENT_STATUS: Record<string, PaymentStatus> = {
  PAID: 'PAID',
  PARTIALLY_PAID: 'PENDING',
  PENDING: 'PENDING',
  AUTHORIZED: 'PENDING',
  REFUNDED: 'REFUNDED',
  PARTIALLY_REFUNDED: 'REFUNDED',
  // Voided = paisa lidha j nathi. Grahak ni najar e aa "pacha malya" jevu j.
  VOIDED: 'REFUNDED',
  EXPIRED: 'UNKNOWN',
};

const FULFILLMENT_STATUS: Record<string, FulfillmentStatus> = {
  FULFILLED: 'FULFILLED',
  PARTIALLY_FULFILLED: 'PARTIAL',
  UNFULFILLED: 'UNFULFILLED',
  PENDING_FULFILLMENT: 'UNFULFILLED',
  OPEN: 'UNFULFILLED',
  IN_PROGRESS: 'UNFULFILLED',
  ON_HOLD: 'UNFULFILLED',
  SCHEDULED: 'UNFULFILLED',
  RESTOCKED: 'CANCELLED',
  REQUEST_DECLINED: 'CANCELLED',
};

/** `#PBG1036` → `PBG1036`. App ne `#` vagar nu joiye, dekhaadva mate sathe. */
export function orderIdFromName(name: string): string {
  return name.replace(/^#/, '');
}

/** `PBG1036` → `name:#PBG1036` — Shopify na order search mate */
export function orderNameQuery(id: string): string {
  return `name:#${orderIdFromName(id)}`;
}

function image(raw: RawOrderImage | null): ImageDto | null {
  if (!raw?.url) return null;
  return {
    url: raw.url,
    // Shopify khali alt mate "" aape chhe — app mate `null` vadhu spashta chhe
    alt: raw.altText?.trim() ? raw.altText : null,
    width: raw.width,
    height: raw.height,
  };
}

function lineItem(raw: RawOrderLineItem): OrderLineItemDto {
  return {
    id: raw.id.split('/').pop() ?? raw.id,
    title: raw.title,
    // Shopify single-variant products ne "Default Title" aape chhe — e nakli
    // naam app sudhi na jaay, nahi to rasid ma "Default Title" chhapse.
    variantTitle:
      raw.variantTitle && raw.variantTitle !== 'Default Title'
        ? raw.variantTitle
        : null,
    sku: raw.sku,
    quantity: raw.quantity,
    image: image(raw.image),
    total: moneyFromBag(raw.discountedTotalSet),
    // Product delete thai gayu hoy to handle nathi malto — tyare app e line
    // ne tap-able na banaavvi.
    productId: raw.product?.handle ?? null,
  };
}

function shippingAddress(
  raw: RawOrderShippingAddress | null,
): OrderAddressDto | null {
  if (!raw) return null;

  return {
    firstName: raw.firstName,
    lastName: raw.lastName,
    phone: raw.phone,
    line1: raw.address1 ?? '',
    line2: raw.address2,
    city: raw.city ?? '',
    province: raw.province,
    zip: raw.zip ?? '',
    country: raw.country ?? '',
  };
}

export function toOrderSummaryDto(raw: RawOrderCard): OrderSummaryDto {
  const items = raw.lineItems.nodes;

  return {
    id: orderIdFromName(raw.name),
    name: raw.name,
    placedAt: raw.createdAt,
    paymentStatus: PAYMENT_STATUS[raw.displayFinancialStatus ?? ''] ?? 'UNKNOWN',
    fulfillmentStatus:
      FULFILLMENT_STATUS[raw.displayFulfillmentStatus ?? ''] ?? 'UNKNOWN',
    total: moneyFromBag(raw.currentTotalPriceSet),
    itemCount: items.reduce((sum, i) => sum + i.quantity, 0),
    image: items.map((i) => image(i.image)).find((img) => img !== null) ?? null,
    cancelledAt: raw.cancelledAt,
  };
}

export function toOrderDto(raw: RawOrderDetail): OrderDto {
  return {
    ...toOrderSummaryDto(raw),
    items: raw.lineItems.nodes.map(lineItem),
    subtotal: moneyFromBag(raw.currentSubtotalPriceSet),
    shipping: moneyFromBag(raw.totalShippingPriceSet),
    tax: moneyFromBag(raw.currentTotalTaxSet),
    discount: moneyFromBag(raw.currentTotalDiscountsSet),
    shippingAddress: shippingAddress(raw.shippingAddress),
    tracking: raw.fulfillments.flatMap<OrderTrackingDto>((f) =>
      f.trackingInfo.map((t) => ({
        company: t.company,
        number: t.number,
        url: t.url,
      })),
    ),
  };
}
