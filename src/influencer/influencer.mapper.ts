import type { Influencer, InfluencerApplication } from '@prisma/client';

/**
 * ⚠️ MOBILE APP ANE ADMIN PANEL NO CONTRACT.
 *
 * Ahiya no sauthi agatya no niyam: **PAN kyarey aakho bahar na jaay.**
 * Grahak ne to kyarey nahi j, ane admin ne pan fakt masked — panel screen
 * par khulu hoy chhe ane koi pan pasar thato vyakti joi shake chhe. Aakho
 * PAN fakt payout na samaye joiye, ane e tyare DB mathi jate kaadhvano.
 */

/** ABCDE1234F → ABC****34F */
function maskPan(pan: string): string {
  if (pan.length !== 10) return '******';
  return `${pan.slice(0, 3)}****${pan.slice(7)}`;
}

export interface ApplicationStatusDto {
  id: string;
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
  socialHandle: string;
  socialPlatform: string;
  followerCount: number;
  /** Reject thayu hoy tyare j — applicant ne su sudhaarvu e khabar pade */
  rejectionReason: string | null;
  submittedAt: string;
  reviewedAt: string | null;
  /**
   * Reject thaya pachhi fari kyare apply kari shakay. `null` = atyare j
   * (ke pehla thi approved chhe, etle jarur j nathi).
   */
  canReapplyAt: string | null;
}

export interface InfluencerProfileDto {
  id: string;
  status: 'ACTIVE' | 'SUSPENDED';
  socialHandle: string;
  socialPlatform: string;
  /** Suspend thayo hoy to enu kaaran — nahi to null */
  suspendedReason: string | null;
  approvedAt: string;
}

/** Admin ni queue mate — PAN masked, baki badhu */
export interface AdminApplicationDto extends ApplicationStatusDto {
  customerId: string;
  customerName: string | null;
  customerPhone: string | null;
  customerEmail: string | null;
  /** ABC****34F — aakho kyarey nahi */
  panMasked: string;
  /** Admin ne tap karva mate taiyar link */
  profileUrl: string;
  reviewedBy: string | null;
}

const PROFILE_URL: Record<string, (handle: string) => string> = {
  instagram: (h) => `https://instagram.com/${h}`,
  youtube: (h) => `https://youtube.com/@${h}`,
  facebook: (h) => `https://facebook.com/${h}`,
};

export function profileUrlFor(platform: string, handle: string): string {
  return PROFILE_URL[platform]?.(handle) ?? handle;
}

export function toApplicationStatusDto(
  row: InfluencerApplication,
  reapplyAfterDays: number,
): ApplicationStatusDto {
  return {
    id: row.id,
    status: row.status,
    socialHandle: row.socialHandle,
    socialPlatform: row.socialPlatform,
    followerCount: row.followerCount,
    rejectionReason: row.rejectionReason,
    submittedAt: row.createdAt.toISOString(),
    reviewedAt: row.reviewedAt?.toISOString() ?? null,
    canReapplyAt:
      row.status === 'REJECTED' && row.reviewedAt
        ? new Date(
            row.reviewedAt.getTime() + reapplyAfterDays * 86_400_000,
          ).toISOString()
        : null,
  };
}

export function toAdminApplicationDto(
  row: InfluencerApplication & {
    customer: {
      firstName: string | null;
      lastName: string | null;
      primaryPhone: string | null;
      primaryEmail: string | null;
    };
  },
  reapplyAfterDays: number,
): AdminApplicationDto {
  const { firstName, lastName } = row.customer;
  const name = [firstName, lastName].filter(Boolean).join(' ').trim();

  return {
    ...toApplicationStatusDto(row, reapplyAfterDays),
    customerId: row.customerId,
    customerName: name || null,
    customerPhone: row.customer.primaryPhone,
    // FAKT verified email. Un-verified email store j nathi thato.
    customerEmail: row.customer.primaryEmail,
    panMasked: maskPan(row.panNumber),
    profileUrl: profileUrlFor(row.socialPlatform, row.socialHandle),
    reviewedBy: row.reviewedBy,
  };
}

export function toInfluencerProfileDto(row: Influencer): InfluencerProfileDto {
  return {
    id: row.id,
    status: row.status,
    socialHandle: row.socialHandle,
    socialPlatform: row.socialPlatform,
    suspendedReason: row.suspendedReason,
    approvedAt: row.approvedAt.toISOString(),
  };
}
