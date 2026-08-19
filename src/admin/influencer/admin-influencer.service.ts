import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import {
  InfluencerApplicationStatus,
  InfluencerStatus,
  Prisma,
} from '@prisma/client';
import {
  profileUrlFor,
  toAdminApplicationDto,
} from '../../influencer/influencer.mapper';
import { REAPPLY_AFTER_DAYS } from '../../influencer/influencer.service';
import { PrismaService } from '../../prisma/prisma.service';
import { currentAdminContext } from '../audit/admin-context';
import { AdminAuditService } from '../audit/admin-audit.service';
import { fullName } from '../dto/admin-customer.dto';
import type {
  ListApplicationsDto,
  ListInfluencersDto,
} from '../dto/influencer.dto';
import {
  toAdminPage,
  toSkipTake,
  type AdminPageDto,
} from '../dto/pagination.dto';

/** Applicant nu customer record — mapper ne aatlu j joiye chhe */
const CUSTOMER_SELECT = {
  select: {
    firstName: true,
    lastName: true,
    primaryPhone: true,
    primaryEmail: true,
  },
} as const;

/**
 * Creator program ni admin baaju.
 *
 * ⚠️ PAN number ahiya thi kyarey aakho bahar na jaay — `toAdminApplicationDto`
 * ene mask kari ne j aape chhe, ane aa service e mapper ne bypass karine
 * `panNumber` jate select karvo NAHI. Panel screen kholelu rahe chhe ane
 * pasar thato koi pan vyakti joi shake chhe.
 */
@Injectable()
export class AdminInfluencerService {
  private readonly logger = new Logger(AdminInfluencerService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AdminAuditService,
  ) {}

  // ---------------------------------------------------------------------------
  // Applications queue
  // ---------------------------------------------------------------------------

  async listApplications(
    query: ListApplicationsDto,
  ): Promise<AdminPageDto<unknown>> {
    const where: Prisma.InfluencerApplicationWhereInput = {};

    if (query.status) where.status = query.status;

    if (query.search) {
      where.OR = [
        { socialHandle: { contains: query.search, mode: 'insensitive' } },
        {
          customer: {
            OR: [
              { firstName: { contains: query.search, mode: 'insensitive' } },
              { lastName: { contains: query.search, mode: 'insensitive' } },
              { primaryPhone: { contains: query.search } },
              { primaryEmail: { contains: query.search, mode: 'insensitive' } },
            ],
          },
        },
      ];
    }

    const [rows, total] = await this.prisma.$transaction([
      this.prisma.influencerApplication.findMany({
        where,
        orderBy: this.applicationOrderBy(query.sort),
        ...toSkipTake(query),
        include: { customer: CUSTOMER_SELECT },
      }),
      this.prisma.influencerApplication.count({ where }),
    ]);

    const items = rows.map((r) => toAdminApplicationDto(r, REAPPLY_AFTER_DAYS));
    return toAdminPage(items, total, query);
  }

  async findApplication(id: string) {
    const row = await this.prisma.influencerApplication.findUnique({
      where: { id },
      include: { customer: CUSTOMER_SELECT },
    });

    if (!row) throw new NotFoundException('Application not found');

    return toAdminApplicationDto(row, REAPPLY_AFTER_DAYS);
  }

  /** Panel na badge mate — "Applications (7)" */
  async pendingCount() {
    const pending = await this.prisma.influencerApplication.count({
      where: { status: InfluencerApplicationStatus.PENDING },
    });

    return { pending };
  }

  // ---------------------------------------------------------------------------
  // Nirnay — approve / reject
  // ---------------------------------------------------------------------------

  /**
   * Approve — application ne APPROVED kare chhe ane `Influencer` row banaave chhe.
   *
   * Banne ek j transaction ma chhe, ane e jaruri chhe: vachche fail thay to
   * application "approved" dekhaay pan creator record na hoy — user ne
   * `/influencer/me` par 404 male ane koi ne khabar j na pade ke su khoot chhe.
   */
  async approve(applicationId: string) {
    const application = await this.mustBePending(applicationId);
    const actor = currentAdminContext().actor;

    const existing = await this.prisma.influencer.findUnique({
      where: { customerId: application.customerId },
      select: { id: true, status: true },
    });

    if (existing) {
      throw new ConflictException('This customer is already a creator');
    }

    const now = new Date();

    const influencer = await this.prisma.$transaction(async (tx) => {
      await tx.influencerApplication.update({
        where: { id: applicationId },
        data: {
          status: InfluencerApplicationStatus.APPROVED,
          reviewedBy: actor,
          reviewedAt: now,
          rejectionReason: null,
        },
      });

      return tx.influencer.create({
        data: {
          customerId: application.customerId,
          applicationId,
          socialHandle: application.socialHandle,
          socialPlatform: application.socialPlatform,
          status: InfluencerStatus.ACTIVE,
          approvedAt: now,
          approvedBy: actor,
        },
      });
    });

    await this.audit.record({
      action: 'influencer.approve',
      entityType: 'influencerApplication',
      entityId: applicationId,
      summary: `Approved @${application.socialHandle} (${application.socialPlatform}) as a creator`,
      before: { status: InfluencerApplicationStatus.PENDING },
      after: { status: InfluencerApplicationStatus.APPROVED, influencerId: influencer.id },
    });

    this.logger.log(
      `Application ${applicationId} approved — customer ${application.customerId}`,
    );

    return this.findApplication(applicationId);
  }

  /**
   * Reject.
   *
   * `reason` applicant ne dekhaay chhe (juo `RejectApplicationDto`), ane
   * `canReapplyAt` aa j kshan thi ganaay chhe — etle reject karta pehla
   * kaaran barabar lakhvu.
   */
  async reject(applicationId: string, reason: string) {
    const application = await this.mustBePending(applicationId);

    await this.prisma.influencerApplication.update({
      where: { id: applicationId },
      data: {
        status: InfluencerApplicationStatus.REJECTED,
        rejectionReason: reason,
        reviewedBy: currentAdminContext().actor,
        reviewedAt: new Date(),
      },
    });

    await this.audit.record({
      action: 'influencer.reject',
      entityType: 'influencerApplication',
      entityId: applicationId,
      summary: `Rejected @${application.socialHandle}: ${reason}`,
      before: { status: InfluencerApplicationStatus.PENDING },
      after: { status: InfluencerApplicationStatus.REJECTED, reason },
    });

    return this.findApplication(applicationId);
  }

  // ---------------------------------------------------------------------------
  // Approved creators
  // ---------------------------------------------------------------------------

  async listInfluencers(query: ListInfluencersDto): Promise<AdminPageDto<unknown>> {
    const where: Prisma.InfluencerWhereInput = {};

    if (query.status) where.status = query.status;

    if (query.search) {
      where.OR = [
        { socialHandle: { contains: query.search, mode: 'insensitive' } },
        {
          customer: {
            OR: [
              { firstName: { contains: query.search, mode: 'insensitive' } },
              { lastName: { contains: query.search, mode: 'insensitive' } },
              { primaryPhone: { contains: query.search } },
            ],
          },
        },
      ];
    }

    const [rows, total] = await this.prisma.$transaction([
      this.prisma.influencer.findMany({
        where,
        orderBy: { approvedAt: 'desc' },
        ...toSkipTake(query),
        include: {
          customer: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              primaryPhone: true,
              primaryEmail: true,
              status: true,
            },
          },
        },
      }),
      this.prisma.influencer.count({ where }),
    ]);

    const items = rows.map((r) => ({
      id: r.id,
      status: r.status,
      socialHandle: r.socialHandle,
      socialPlatform: r.socialPlatform,
      profileUrl: profileUrlFor(r.socialPlatform, r.socialHandle),
      suspendedReason: r.suspendedReason,
      suspendedAt: r.suspendedAt?.toISOString() ?? null,
      approvedAt: r.approvedAt.toISOString(),
      approvedBy: r.approvedBy,
      customer: {
        id: r.customer.id,
        name: fullName(r.customer),
        phone: r.customer.primaryPhone,
        email: r.customer.primaryEmail,
        status: r.customer.status,
      },
    }));

    return toAdminPage(items, total, query);
  }

  async suspend(id: string, reason: string) {
    const row = await this.prisma.influencer.findUnique({ where: { id } });
    if (!row) throw new NotFoundException('Creator not found');

    if (row.status === InfluencerStatus.SUSPENDED) {
      throw new BadRequestException('This creator is already suspended');
    }

    const updated = await this.prisma.influencer.update({
      where: { id },
      data: {
        status: InfluencerStatus.SUSPENDED,
        suspendedReason: reason,
        suspendedAt: new Date(),
      },
    });

    await this.audit.record({
      action: 'influencer.suspend',
      entityType: 'influencer',
      entityId: id,
      summary: `Suspended @${row.socialHandle}: ${reason}`,
      before: { status: row.status },
      after: { status: updated.status, reason },
    });

    return { success: true as const, status: updated.status };
  }

  async unsuspend(id: string) {
    const row = await this.prisma.influencer.findUnique({ where: { id } });
    if (!row) throw new NotFoundException('Creator not found');

    if (row.status !== InfluencerStatus.SUSPENDED) {
      throw new BadRequestException('This creator is not suspended');
    }

    const updated = await this.prisma.influencer.update({
      where: { id },
      data: {
        status: InfluencerStatus.ACTIVE,
        suspendedReason: null,
        suspendedAt: null,
      },
    });

    await this.audit.record({
      action: 'influencer.unsuspend',
      entityType: 'influencer',
      entityId: id,
      summary: `Reinstated @${row.socialHandle}`,
      before: { status: row.status, reason: row.suspendedReason },
      after: { status: updated.status },
    });

    return { success: true as const, status: updated.status };
  }

  // ---------------------------------------------------------------------------

  /**
   * Default `newest` chhe (queue "aaje kone apply karyu" thi shuru thay chhe).
   * `oldest` tyare vaparvu jyare queue pachhal padi gai hoy — tyare jene
   * sauthi vadhu raah joi chhe ene pehla javaab malvo joiye.
   */
  private applicationOrderBy(
    sort: ListApplicationsDto['sort'],
  ): Prisma.InfluencerApplicationOrderByWithRelationInput {
    switch (sort) {
      case 'oldest':
        return { createdAt: 'asc' };
      case 'followers':
        return { followerCount: 'desc' };
      case 'newest':
      default:
        return { createdAt: 'desc' };
    }
  }

  private async mustBePending(id: string) {
    const row = await this.prisma.influencerApplication.findUnique({
      where: { id },
      select: {
        id: true,
        customerId: true,
        socialHandle: true,
        socialPlatform: true,
        status: true,
      },
    });

    if (!row) throw new NotFoundException('Application not found');

    // Be admins (ke be tabs) ek j application par ek sathe nirnay na le —
    // bijine ahiya saaf message male chhe, chup-chaap overwrite nathi thatu.
    if (row.status !== InfluencerApplicationStatus.PENDING) {
      throw new ConflictException(
        `This application has already been ${row.status.toLowerCase()}`,
      );
    }

    return row;
  }
}
