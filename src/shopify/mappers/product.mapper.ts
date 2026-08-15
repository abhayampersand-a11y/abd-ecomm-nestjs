import type {
  ImageDto,
  MoneyDto,
  ProductDto,
  ProductOptionDto,
  ProductSummaryDto,
  VariantDto,
} from '../../common/dto/product.dto';
import type {
  RawMediaImage,
  RawMoney,
  RawProductCard,
  RawProductDetail,
  RawVariant,
} from '../queries/product.queries';

/**
 * ⚠️ AA J E DIVAAL CHHE.
 *
 * Shopify no data ahiya aave chhe ane aapdo data bahar jaay chhe. Bahar
 * `gid://shopify/...`, `priceRangeV2`, `edges[].node` — kai j nathi jatu.
 *
 * Phase 2 ma Postgres source banse tyare ek navo mapper (db → same DTO)
 * lakhvano, ane mobile app ne khabar pan nahi pade.
 */

/** `gid://shopify/ProductVariant/45678` → `45678` */
function idFromGid(gid: string): string {
  const last = gid.split('/').pop();
  return last ?? gid;
}

/**
 * Shopify ek j product mate "1299.0" (priceRange) ane "1299.00" (variant)
 * banne aape chhe. Aa aapda contract ma na jaay — app "₹1299.0" dekhaadi de.
 * Etle badhe ek j form ma normalize kariye chhiye.
 *
 * Decimal digits currency mathi j kaadhiye chhiye (INR/USD = 2, JPY = 0),
 * hardcode nahi.
 */
const fractionDigitsCache = new Map<string, number>();

function fractionDigits(currencyCode: string): number {
  const cached = fractionDigitsCache.get(currencyCode);
  if (cached !== undefined) return cached;

  let digits = 2;
  try {
    digits =
      new Intl.NumberFormat('en', { style: 'currency', currency: currencyCode })
        .resolvedOptions().minimumFractionDigits ?? 2;
  } catch {
    // Ajaanyo currency code — 2 thi chalavi laiye
  }

  fractionDigitsCache.set(currencyCode, digits);
  return digits;
}

function normalizeAmount(amount: string, currencyCode: string): string {
  const n = Number(amount);
  return Number.isFinite(n) ? n.toFixed(fractionDigits(currencyCode)) : amount;
}

function money(raw: RawMoney): MoneyDto {
  return {
    amount: normalizeAmount(raw.amount, raw.currencyCode),
    currencyCode: raw.currencyCode,
  };
}

function optionalMoney(raw: RawMoney | null | undefined): MoneyDto | null {
  return raw ? money(raw) : null;
}

function image(raw: RawMediaImage | null | undefined): ImageDto | null {
  if (!raw?.image?.url) return null;
  return {
    url: raw.image.url,
    // Shopify khali alt mate "" aape chhe. App mate `null` vadhu spashta chhe:
    // "alt text chhe j nahi" ane "alt text khali chhe" ek j vaat chhe.
    alt: raw.alt?.trim() ? raw.alt : null,
    width: raw.image.width,
    height: raw.image.height,
  };
}

/**
 * Shopify ma product "in stock" chhe ke nahi e ek line ma nathi malto:
 * je products inventory track j nathi karta (daa.t. made-to-order) emno
 * totalInventory 0 hoy chhe — pan e vechay chhe. Fakt totalInventory jovu
 * to evi badhi items app ma "Out of stock" dekhaay.
 */
function isInStock(raw: RawProductCard): boolean {
  if (!raw.tracksInventory) return true;
  return (raw.totalInventory ?? 0) > 0;
}

/**
 * compareAtPrice tyare j batavvi jyare e kharekhar price karta vadhare hoy.
 * Shopify ma juna/vasi compareAtPrice rahi jata hoy chhe, ane e evu
 * "₹499 ~~₹499~~" jevu bekaar strike-through banaave chhe.
 */
function meaningfulCompareAt(
  compareAt: MoneyDto | null,
  price: MoneyDto,
): MoneyDto | null {
  if (!compareAt) return null;
  return Number(compareAt.amount) > Number(price.amount) ? compareAt : null;
}

export function toProductSummaryDto(raw: RawProductCard): ProductSummaryDto {
  const price = money(raw.priceRangeV2.minVariantPrice);
  const maxPrice = raw.priceRangeV2.maxVariantPrice;

  return {
    id: raw.handle,
    title: raw.title,
    vendor: raw.vendor,
    productType: raw.productType,
    tags: raw.tags ?? [],
    price,
    compareAtPrice: meaningfulCompareAt(
      optionalMoney(raw.compareAtPriceRange?.maxVariantCompareAtPrice),
      price,
    ),
    priceVaries: maxPrice.amount !== price.amount,
    image: image(raw.featuredMedia),
    inStock: isInStock(raw),
  };
}

function toVariantDto(raw: RawVariant, currencyCode: string): VariantDto {
  const price = money({ amount: raw.price, currencyCode });
  const compareAt = optionalMoney(
    raw.compareAtPrice ? { amount: raw.compareAtPrice, currencyCode } : null,
  );

  const options = (raw.selectedOptions ?? []).filter(
    (o) => !(o.name === 'Title' && o.value === 'Default Title'),
  );

  return {
    id: idFromGid(raw.id),
    // "Default Title" Shopify nu internal placeholder chhe, product nu naam nahi
    title: raw.title === 'Default Title' ? null : raw.title,
    sku: raw.sku,
    price,
    compareAtPrice: meaningfulCompareAt(compareAt, price),
    inStock: raw.availableForSale,
    selectedOptions: options,
  };
}

/**
 * Jena kharekhar variants nathi (daa.t. ek j size no dupatta) e products ne
 * Shopify andar khane "Title = Default Title" evo nakli option aape chhe.
 *
 * Aa app ma na javu joiye — nahi to product page par "Title: Default Title"
 * evu bekaar dropdown dekhaay. Options khali aave etle app ne khabar pade ke
 * "aa single-variant product chhe, sidho Add to Cart batavo".
 */
function isPlaceholderOption(name: string, values: string[]): boolean {
  return (
    name === 'Title' && values.length === 1 && values[0] === 'Default Title'
  );
}

/**
 * Options ne variants mathi derive kariye chhiye, Product.options mathi nahi.
 * Faydo: ek GraphQL field ochhu (cost ochho), ane je options ni kharekhar
 * koi variant j nathi e app ma dekhaata nathi.
 */
function deriveOptions(variants: RawVariant[]): ProductOptionDto[] {
  const seen = new Map<string, Set<string>>();

  for (const variant of variants) {
    for (const { name, value } of variant.selectedOptions ?? []) {
      if (!seen.has(name)) seen.set(name, new Set());
      seen.get(name)!.add(value);
    }
  }

  return [...seen.entries()]
    .map(([name, values]) => ({ name, values: [...values] }))
    .filter((option) => !isPlaceholderOption(option.name, option.values));
}

export function toProductDto(raw: RawProductDetail): ProductDto {
  const summary = toProductSummaryDto(raw);
  const currency = raw.priceRangeV2.minVariantPrice.currencyCode;
  const variants = raw.variants?.nodes ?? [];

  const images = (raw.media?.nodes ?? [])
    .map(image)
    .filter((img): img is ImageDto => img !== null);

  return {
    ...summary,
    description: raw.description ?? '',
    images: images.length > 0 ? images : summary.image ? [summary.image] : [],
    options: deriveOptions(variants),
    variants: variants.map((v) => toVariantDto(v, currency)),
    updatedAt: raw.updatedAt,
  };
}
