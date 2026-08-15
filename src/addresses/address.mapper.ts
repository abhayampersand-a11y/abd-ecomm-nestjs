import { createHash } from 'node:crypto';
import type { Address } from '@prisma/client';
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
