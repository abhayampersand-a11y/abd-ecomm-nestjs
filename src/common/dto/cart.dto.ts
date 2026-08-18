import type { ImageDto, MoneyDto } from './product.dto';

/**
 * ⚠️ MOBILE APP NO CONTRACT.
 *
 * Cart aapdo potano chhe (Postgres), Shopify no nahi — etle ahiya Shopify nu
 * kai j nathi. Checkout vakhte j aa cart Shopify ne mokalaay chhe.
 */

export interface CartItemDto {
  /** Cart line no id — quantity badalvа ke kaadhva mate aa vaparo */
  id: string;
  /** Product no handle — product page par lai javu hoy to */
  productId: string;
  /** Variant token — e j je product detail ma malyu hatu */
  variantId: string;
  title: string;
  /** "White / M" — single-variant product mate null */
  variantTitle: string | null;
  image: ImageDto | null;
  quantity: number;
  unitPrice: MoneyDto;
  /** unitPrice × quantity */
  lineTotal: MoneyDto;
}

export interface CartDto {
  items: CartItemDto[];
  /** Badhi lines ni quantity no saravalo — badge ma aa batavo */
  itemCount: number;
  /**
   * ⚠️ AA FINAL RAKAM NATHI.
   *
   * Fakt lines no saravalo chhe. Shipping, tax ane discount **Shopify
   * checkout** ganse — ane e j asli rakam chhe. App ma aa ne "Subtotal"
   * j kehvu, "Total" kyarey nahi, nahi to grahak ne checkout ma biji
   * rakam dekhaay ane bharoso tooti jaay.
   */
  subtotal: MoneyDto;
  /** Lagaadelo voucher. Valid chhe ke nahi e checkout j nakki karse. */
  discountCode: string | null;
}
