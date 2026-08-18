import type { MoneyDto } from '../dto/product.dto';

/**
 * Shopify paisa ne ek-samaan swaroop ma nathi aapto — e j ₹100 mate kyarek
 * "100.0" aave chhe ane kyarek "100.00". Aapdo contract kahe chhe ke amount
 * decimal STRING chhe (float nahi, jethi paisa na khovaay) — pan e string
 * hammesha e j swaroop ni hovi joiye, nahi to app "₹100.0" chhaapse.
 *
 * Decimal digits currency parthi j kadhiye chhiye (INR/USD = 2, JPY = 0),
 * hardcode nahi.
 *
 * ⚠️ `ProductMapper` ma aa j logic ni ek juni khaanagi nakal chhe. Navi
 * jagya e AA vaparvu; Phase 2 ma product mapper ne pan ahiya laavvanu chhe.
 */

const fractionDigitsCache = new Map<string, number>();

export function fractionDigits(currencyCode: string): number {
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

export function normalizeAmount(amount: string, currencyCode: string): string {
  const n = Number(amount);
  return Number.isFinite(n) ? n.toFixed(fractionDigits(currencyCode)) : amount;
}

/** Shopify no `MoneyBag` (`{ shopMoney: { amount, currencyCode } }`) → aapdo DTO */
export function moneyFromBag(bag: {
  shopMoney: { amount: string; currencyCode: string };
}): MoneyDto {
  return {
    amount: normalizeAmount(bag.shopMoney.amount, bag.shopMoney.currencyCode),
    currencyCode: bag.shopMoney.currencyCode,
  };
}

/**
 * Paisa ni ganatri mate minor units (paise/cents) ma laavo.
 *
 * ⚠️ Bhaav ne float tarike KYAREY na goniye. `0.1 + 0.2 = 0.30000000000000004`
 * — ane cart ma 20 lines hoy to aa bhool dekhaava mande chhe. Integer paise ma
 * ganatri karo, ane chhelle j string ma pacha laavo.
 */
export function toMinor(amount: string, currencyCode: string): number {
  return Math.round(Number(amount) * 10 ** fractionDigits(currencyCode));
}

export function fromMinor(minor: number, currencyCode: string): string {
  const d = fractionDigits(currencyCode);
  return (minor / 10 ** d).toFixed(d);
}
