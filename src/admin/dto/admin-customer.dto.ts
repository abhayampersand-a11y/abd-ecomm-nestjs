import type { Customer, CustomerStatus, IdentifierType } from '@prisma/client';

/**
 * ⚠️ AA ADMIN PANEL NO CONTRACT CHHE — mobile app no nahi.
 *
 * Mobile app na DTOs (`auth-response.dto.ts`) ma jaan-bujhi ne ochhu chhe:
 * app ne `status`, `mergedIntoId` ke Shopify ids ni koi jarur nathi. Admin ne
 * e badhu joiye chhe, ane ee j karan e aa file alag chhe. Be ne bhega karva
 * ni lalach ma padvu nahi — pachhi app ma bhoolthi internal fields lik thase.
 */

export interface AdminCustomerCountsDto {
  addresses: number;
  wishlist: number;
  recentlyViewed: number;
  shopifyLinks: number;
  verifiedIdentities: number;
}

export interface AdminCustomerSummaryDto {
  id: string;
  fullName: string | null;
  phone: string | null;
  /** FAKT verified. Un-verified email nu concept j nathi. */
  email: string | null;
  status: CustomerStatus;
  phoneVerified: boolean;
  emailVerified: boolean;
  hasPassword: boolean;
  shopifyCustomerId: string | null;
  /** Null nathi to aa record duplicate chhe ane ahiya merge thai gayo chhe */
  mergedIntoId: string | null;
  counts: AdminCustomerCountsDto;
  lastLoginAt: string | null;
  createdAt: string;
}

type CustomerRow = Customer & {
  identities?: Array<{ type: IdentifierType }>;
  _count?: {
    addresses?: number;
    wishlist?: number;
    recentlyViewed?: number;
    shopifyLinks?: number;
    identities?: number;
  };
};

export function toAdminCustomerSummary(row: CustomerRow): AdminCustomerSummaryDto {
  const identities = row.identities ?? [];

  return {
    id: row.id,
    fullName: fullName(row),
    phone: row.primaryPhone,
    email: row.primaryEmail,
    status: row.status,
    phoneVerified: identities.some((i) => i.type === 'PHONE'),
    emailVerified: identities.some((i) => i.type === 'EMAIL'),
    hasPassword: Boolean(row.passwordHash),
    shopifyCustomerId: row.shopifyCustomerId,
    mergedIntoId: row.mergedIntoId,
    counts: {
      addresses: row._count?.addresses ?? 0,
      wishlist: row._count?.wishlist ?? 0,
      recentlyViewed: row._count?.recentlyViewed ?? 0,
      shopifyLinks: row._count?.shopifyLinks ?? 0,
      verifiedIdentities: row._count?.identities ?? identities.length,
    },
    lastLoginAt: row.lastLoginAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
  };
}

export function fullName(row: {
  firstName: string | null;
  lastName: string | null;
}): string | null {
  const name = [row.firstName, row.lastName].filter(Boolean).join(' ').trim();
  return name || null;
}
