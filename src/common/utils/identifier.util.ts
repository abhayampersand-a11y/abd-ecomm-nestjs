import { BadRequestException } from '@nestjs/common';
import { IdentifierType } from '@prisma/client';
import { parsePhoneNumberFromString, type CountryCode } from 'libphonenumber-js';

export interface NormalizedIdentifier {
  type: IdentifierType;
  /** DB ma aa j value store thay chhe: E.164 phone athva lowercase email */
  value: string;
  /** User ne dekhaadva mate masked version — logs ane responses mate safe */
  masked: string;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/**
 * User "9876543210", "+91 98765 43210", "abc@gmail.com" — kai pan naakhi shake.
 * Aapne enu ek j canonical form banaviye, karan ke DB lookups ane
 * order-matching aa exact string par depend kare chhe.
 *
 * Aa normalization ek j jagya e thavu joiye — nahi to "+919876543210" ane
 * "9876543210" be alag users banii jashe.
 */
export function normalizeIdentifier(
  raw: string,
  defaultCountry: string,
): NormalizedIdentifier {
  const trimmed = raw?.trim();

  if (!trimmed) {
    throw new BadRequestException('Phone number or email is required');
  }

  if (trimmed.includes('@')) {
    const email = trimmed.toLowerCase();
    if (!EMAIL_RE.test(email)) {
      throw new BadRequestException('Email is not valid');
    }
    return { type: IdentifierType.EMAIL, value: email, masked: maskEmail(email) };
  }

  const phone = parsePhoneNumberFromString(
    trimmed,
    defaultCountry as CountryCode,
  );

  if (!phone?.isValid()) {
    throw new BadRequestException('Phone number is not valid');
  }

  const e164 = phone.number;
  return { type: IdentifierType.PHONE, value: e164, masked: maskPhone(e164) };
}

export function maskPhone(e164: string): string {
  // +919876543210 -> +91******3210
  if (e164.length <= 6) return '******';
  return `${e164.slice(0, 3)}${'*'.repeat(e164.length - 7)}${e164.slice(-4)}`;
}

export function maskEmail(email: string): string {
  // abhaykumar@gmail.com -> ab********@gmail.com
  const [local, domain] = email.split('@');
  if (!domain) return '***';
  const head = local.slice(0, Math.min(2, local.length));
  return `${head}${'*'.repeat(Math.max(local.length - head.length, 1))}@${domain}`;
}
