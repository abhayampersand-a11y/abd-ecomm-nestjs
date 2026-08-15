/**
 * ⚠️ MOBILE APP NO CONTRACT.
 *
 * Ahiya Shopify nu kai j na aave — `gid://shopify/Product/123`, `edges[].node`,
 * `priceRangeV2`, `admin_graphql_api_id`. Aa file j e divaal chhe je Phase 2
 * (Postgres) ane pachhi Shopify thi migration vakhte mobile app ne bachave chhe.
 *
 * IDENTIFIERS — jaan-bujhi ne aa rite:
 *
 *   ProductDto.id  = product no HANDLE (slug), Shopify no numeric id nahi.
 *     Kem: handle aapdo potano data chhe. Phase 2 ma products table ma e j
 *     handle unique column tarike aavse, etle app ni saachvelī links, deep
 *     links ane cache badhu kaam karta rahese. Shopify na numeric ids server
 *     ni bahar kyarey nathi jata.
 *
 *   VariantDto.id  = app mate OPAQUE token chhe. App ene fakt pacho aape chhe
 *     (add to cart), enu andar shu chhe e app e kyarey na jovu joiye.
 *     Phase 2 ma aani andar nu badlaay to pan app ne farak nahi pade, karan ke
 *     cart aapda Postgres ma chhe.
 */

export interface MoneyDto {
  /** Decimal string ("1299.00") — float nahi, jethi paisa na khovaay */
  amount: string;
  /** ISO 4217, daa.t. "INR" */
  currencyCode: string;
}

export interface ImageDto {
  url: string;
  alt: string | null;
  width: number | null;
  height: number | null;
}

export interface ProductOptionDto {
  name: string;
  values: string[];
}

export interface VariantDto {
  /** Opaque token — app fakt pacho aape chhe */
  id: string;
  /**
   * Single-variant products mate `null` (Shopify no "Default Title" nakli
   * naam app sudhi nathi jato). App aa null jue etle variant selector
   * chhupaavi de.
   */
  title: string | null;
  sku: string | null;
  price: MoneyDto;
  /** Strike-through price. Discount na hoy to null. */
  compareAtPrice: MoneyDto | null;
  inStock: boolean;
  /** Exact stock jaan-bujhi ne bahar nathi aapto — fakt "chhe ke nahi". */
  selectedOptions: Array<{ name: string; value: string }>;
}

export interface ProductSummaryDto {
  /** Handle / slug — listing ane detail banne ma aa j identifier */
  id: string;
  title: string;
  vendor: string | null;
  productType: string | null;
  tags: string[];
  /** Listing card mate — sauthi sasti variant ni price */
  price: MoneyDto;
  compareAtPrice: MoneyDto | null;
  /** Range hoy tyare app "₹899 thi" dekhaadi shake */
  priceVaries: boolean;
  image: ImageDto | null;
  inStock: boolean;
}

export interface ProductDto extends ProductSummaryDto {
  description: string;
  images: ImageDto[];
  options: ProductOptionDto[];
  variants: VariantDto[];
  updatedAt: string;
}

export interface PageDto<T> {
  items: T[];
  /** Aa cursor next page mate pacho mokalvo. Null = puru thai gayu. */
  nextCursor: string | null;
  hasNextPage: boolean;
}
