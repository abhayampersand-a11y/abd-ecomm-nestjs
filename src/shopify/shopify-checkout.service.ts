import { Injectable, Logger } from '@nestjs/common';
import { gidFor } from './gid.util';
import {
  CART_CREATE_MUTATION,
  type CartCreateResponse,
  type RawCart,
} from './queries/checkout.queries';
import { ShopifyStorefrontClient } from './shopify-storefront.client';

export interface CheckoutLine {
  /** Shopify variant id (numeric) */
  variantId: string;
  quantity: number;
}

export interface CheckoutBuyer {
  email?: string | null;
  phone?: string | null;
}

export class ShopifyCheckoutError extends Error {}

/**
 * Aapdo cart Shopify ne aapi ne `checkoutUrl` levu.
 *
 * Aa j e jagya chhe jya aapdo Postgres cart Shopify ne sopay chhe. Ahiya thi
 * aage — bhaav, tax, shipping, payment, order create — badhu Shopify nu.
 */
@Injectable()
export class ShopifyCheckoutService {
  private readonly logger = new Logger(ShopifyCheckoutService.name);

  constructor(private readonly storefront: ShopifyStorefrontClient) {}

  async createCart(input: {
    lines: CheckoutLine[];
    buyer: CheckoutBuyer;
    discountCode?: string | null;
  }): Promise<RawCart> {
    const data = await this.storefront.request<CartCreateResponse>(
      CART_CREATE_MUTATION,
      {
        input: {
          lines: input.lines.map((l) => ({
            // Storefront API gid maange chhe; aapdi pase numeric id chhe
            merchandiseId: gidFor('ProductVariant', l.variantId),
            quantity: l.quantity,
          })),

          /**
           * ⚠️ AA SAUTHI AGATYA NU FIELD CHHE.
           *
           * Aa vagar order **guest order** tarike banse — `order.customer`
           * null hase — ane pachhi aapdu `GET /orders` ene KYAREY nahi
           * batave (e `customer_id:` par filter kare chhe).
           *
           * Etle: paisa gaya, order Shopify ma chhe, ane app ma "no orders
           * yet" dekhaay. Aa j sauthi kharaab bug chhe je ahiya thai shake.
           */
          buyerIdentity: {
            ...(input.buyer.email && { email: input.buyer.email }),
            ...(input.buyer.phone && { phone: input.buyer.phone }),
          },

          ...(input.discountCode && { discountCodes: [input.discountCode] }),
        },
      },
      'cart.create',
    );

    const { cart, userErrors } = data.cartCreate;

    if (userErrors.length > 0) {
      const messages = userErrors.map((e) => e.message).join('; ');
      this.logger.warn(`cartCreate userErrors: ${messages}`);
      throw new ShopifyCheckoutError(messages);
    }

    if (!cart) {
      // ⚠️ Aa message grahak sudhi pahonche chhe (`CheckoutService` ene
      // BadRequestException ma naakhe chhe) — etle ANGREJI ma j.
      throw new ShopifyCheckoutError('Could not start checkout. Please try again.');
    }

    return cart;
  }
}
