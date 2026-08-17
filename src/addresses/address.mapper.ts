import { createHash } from 'node:crypto';
import type { Address } from '@prisma/client';
import { resolveCountryCode } from '../common/utils/country.util';
import type {
  MailingAddressInput,
  RawMailingAddress,
} from '../shopify/queries/address.queries';
import type { RawShippingAddress } from '../shopify/queries/customer.queries';

/** Mobile app no contract — Shopify na field names ahiya nathi */
export interface AddressDto {
  id: string;
  firstName: string | null;
  lastName: string | null;
  phone: string | null;
  line1: string;
  line2: string | null;
  city: string;
  province: string | null;
  zip: string;
  country: string;
  countryCode: string | null;
  isDefault: boolean;
  /** Juna order mathi apne-aap aavyo chhe ke user e jate ummeryo */
  imported: boolean;
}

export function toAddressDto(address: Address): AddressDto {
  return {
    id: address.id,
    firstName: address.firstName,
    lastName: address.lastName,
    phone: address.phone,
    line1: address.line1,
    line2: address.line2,
    city: address.city,
    province: address.province,
    zip: address.zip,
    country: address.country,
    countryCode: address.countryCode,
    isDefault: address.isDefault,
    imported: address.importedFromOrder !== null,
  };
}

export interface AddressInput {
  firstName?: string | null;
  lastName?: string | null;
  phone?: string | null;
  line1: string;
  line2?: string | null;
  city: string;
  province?: string | null;
  provinceCode?: string | null;
  zip: string;
  country: string;
  countryCode?: string | null;
}

/**
 * Ek j address 15 juna orders ma hoy chhe. Fingerprint vagar user ne 15 same
 * addresses dekhaay — je aa feature ne fayda ne badle nuksan banaavi de.
 *
 * Case, spacing ane punctuation kaadhi naakhiye chhiye, karan ke
 * "A-101, Shanti Nagar" ane "A 101 Shanti nagar" ek j jagya chhe.
 */
export function addressFingerprint(input: AddressInput): string {
  const normalize = (v: string | null | undefined) =>
    (v ?? '')
      .toLowerCase()
      .replace(/[^a-z0-9]/g, '');

  const canonical = [
    input.line1,
    input.line2,
    input.city,
    input.zip,
    input.countryCode ?? input.country,
  ]
    .map(normalize)
    .join('|');

  return createHash('sha1').update(canonical).digest('hex').slice(0, 24);
}

/**
 * Shopify no shipping address → aapdo input shape.
 * Jaruri fields (line1/city/zip/country) na hoy to `null` — adhura addresses
 * save karvano matlab nathi.
 */
export function fromShopifyAddress(
  raw: RawShippingAddress | null,
): AddressInput | null {
  if (!raw?.address1 || !raw.city || !raw.country) return null;

  return {
    firstName: raw.firstName,
    lastName: raw.lastName,
    phone: raw.phone,
    line1: raw.address1,
    line2: raw.address2,
    city: raw.city,
    province: raw.province,
    provinceCode: raw.provinceCode,
    zip: raw.zip ?? '',
    country: raw.country,
    countryCode: raw.countryCode,
  };
}

/**
 * Customer na ADDRESS BOOK no entry → aapdo input shape.
 *
 * Order address (upar) thi be farak chhe: ahiya `id` hoy chhe (jethi pachhi
 * update/delete kari shakay), ane country code `countryCodeV2` ma aave chhe,
 * `countryCode` ma nahi.
 */
export function fromMailingAddress(
  raw: RawMailingAddress | null,
): (AddressInput & { shopifyAddressId: string }) | null {
  if (!raw?.address1 || !raw.city || !raw.country) return null;

  return {
    shopifyAddressId: raw.id.split('/').pop() ?? raw.id,
    firstName: raw.firstName,
    lastName: raw.lastName,
    phone: raw.phone,
    line1: raw.address1,
    line2: raw.address2,
    city: raw.city,
    province: raw.province,
    provinceCode: raw.provinceCode,
    zip: raw.zip ?? '',
    country: raw.country,
    countryCode: raw.countryCodeV2,
  };
}

/**
 * Aapdo address → Shopify no write shape.
 *
 * ⚠️ `country` ane `province` naam JAAN-BUJHI NE nathi mokalta — Shopify no
 * `MailingAddressInput` e fields leto j nathi (fakt `countryCode` ane
 * `provinceCode`). Naam Shopify jate code parthi kaadhe chhe.
 *
 * @returns `null` jyare country code na oળkhaay. Tyare push skip karvo —
 *   khoto country mokalvo e address kharaab karva jevu chhe, ane user ne
 *   khabar pan nahi pade.
 */
export function toMailingAddressInput(
  input: AddressInput,
): MailingAddressInput | null {
  const countryCode = resolveCountryCode(input.country, input.countryCode);
  if (!countryCode) return null;

  return {
    countryCode,
    address1: input.line1,
    city: input.city,
    zip: input.zip,
    ...(input.firstName && { firstName: input.firstName }),
    ...(input.lastName && { lastName: input.lastName }),
    ...(input.phone && { phone: input.phone }),
    ...(input.line2 && { address2: input.line2 }),
    ...(input.provinceCode && { provinceCode: input.provinceCode }),
  };
}
