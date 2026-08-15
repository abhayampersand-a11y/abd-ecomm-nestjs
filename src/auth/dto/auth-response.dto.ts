import type { Customer, CustomerIdentity } from '@prisma/client';

/**
 * ⚠️ AA J MOBILE APP NO CONTRACT CHHE.
 *
 * Ahiya Shopify na field names / shapes KYAREY na aave (`gid://shopify/...`,
 * `admin_graphql_api_id`, `edges[].node`, vagere). Aa boundary sachavવાthi j
 * Phase 2 (Postgres) ane pachhi Shopify thi migration vakhte mobile app ma
 * ek line pan badalvi nahi pade.
 */

export interface AuthTokensDto {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  tokenType: 'Bearer';
}

export interface CustomerProfileDto {
  id: string;
  phone: string | null;
  /** Sauthi bharoso paatra email — verified hoy e, nahi to registration vaalo */
  email: string | null;
  /**
   * `false` hoy to app "Verify your email to see older orders" batavi shake.
   * Un-verified email order matching ma kyarey nathi vaparato.
   */
  emailVerified: boolean;
  phoneVerified: boolean;
  firstName: string | null;
  lastName: string | null;
  hasPassword: boolean;
  /** Aa user na badha verified email/phone */
  verifiedIdentifiers: Array<{ type: 'PHONE' | 'EMAIL'; value: string }>;
  createdAt: string;
}

export interface LoginResultDto {
  isNewUser: boolean;
  /** Ketla juna Shopify customer records aa login e jodaaya */
  linkedShopifyRecords: number;
  customer: CustomerProfileDto;
  tokens: AuthTokensDto;
}

export interface OtpRequestedDto {
  /** Hammesha true — "user exist kare chhe ke nahi" e kyarey na kaho */
  sent: true;
  /** Masked destination, jethi app "+91******3210 par OTP mokalyo" dekhaadi shake */
  sentTo: string;
  expiresAt: string;
  resendAfterSeconds: number;
  /** FAKT development ma (OTP_EXPOSE_IN_RESPONSE=true) */
  devCode?: string;
}

type CustomerWithIdentities = Customer & { identities?: CustomerIdentity[] };

export function toCustomerProfileDto(
  customer: CustomerWithIdentities,
): CustomerProfileDto {
  const identities = customer.identities ?? [];
  const emailVerified = identities.some((i) => i.type === 'EMAIL');
  const phoneVerified = identities.some((i) => i.type === 'PHONE');

  return {
    id: customer.id,
    phone: customer.primaryPhone,
    // Verified email hoy to e, nahi to registration screen vaalo (un-verified)
    email: customer.primaryEmail ?? customer.contactEmail,
    emailVerified,
    phoneVerified,
    firstName: customer.firstName,
    lastName: customer.lastName,
    hasPassword: Boolean(customer.passwordHash),
    verifiedIdentifiers: identities.map((i) => ({
      type: i.type,
      value: i.value,
    })),
    createdAt: customer.createdAt.toISOString(),
  };
}
