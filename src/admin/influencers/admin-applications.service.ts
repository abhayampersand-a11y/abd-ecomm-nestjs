import {
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import type { InfluencerApplicationStatus, Prisma } from '@prisma/client';
import {
  toAdminApplicationDto,
  type AdminApplicationDto,
} from '../../influencer/influencer.mapper';
import { REAPPLY_AFTER_DAYS } from '../../influencer/influencer.service';
import { PrismaService } from '../../prisma/prisma.service';
import type { ListApplicationsDto } from '../dto/list-applications.dto';
import {
  toAdminPage,
  toSkipTake,
  type AdminPageDto,
} from '../dto/pagination.dto';

/** Grahak na je fields queue ma joiye chhe — ek j jagya e vyakhya */
const CUSTOMER_FIELDS = {
  firstName: true,
  lastName: true,
  primaryPhone: true,
  primaryEmail: true,
} as const;

@Injectable()
export class AdminApplicationsService {
  private readonly logger = new Logger(AdminApplicationsService.name);

  constructor(private readonly prisma: PrismaService) {}

  async list(
    query: ListApplicationsDto,
  ): Promise<AdminPageDto<AdminApplicationDto>> {
    const where = this.buildWhere(query);
    const { skip, take } = toSkipTake(query);

    const [rows, total] = await this.prisma.$transaction([
      this.prisma.influencerApplication.findMany({
        where,
        include: { customer: { select: CUSTOMER_FIELDS } },
        orderBy: this.buildOrderBy(query.sort),
        skip,
        take,
      }),
      this.prisma.influencerApplication.count({ where }),
    ]);

    return toAdminPage(
      rows.map((r) => toAdminApplicationDto(r, REAPPLY_AFTER_DAYS)),
      total,
      query,
    );
  }

  /** Sidebar no badge — ek j aankdo, aakhi list laavya vagar */
  async pendingCount(): Promise<{ pending: number }> {
    return {
      pending: await this.prisma.influencerApplication.count({
        where: { status: 'PENDING' },
      }),
    };
  }

  async findOne(id: string): Promise<AdminApplicationDto> {
    const row = await this.prisma.influencerApplication.findUnique({
      where: { id },
      include: { customer: { select: CUSTOMER_FIELDS } },
    });

    if (!row) throw new NotFoundException('Application not found');

    return toAdminApplicationDto(row, REAPPLY_AFTER_DAYS);
  }

  /**
   * Gate 1 — approve.
   *
   * Application nu update ane Influencer nu creation EK J transaction ma chhe.
   * Vachche fail thay to evi halat bane jya application "APPROVED" dekhaay pan
   * grahak pase creator access na hoy — ane e sauthi gundhaayelu support
   * ticket chhe je aa feature ma thai shake.
   */
  async approve(id: string, adminEmail: string): Promise<AdminApplicationDto> {
    const row = await this.prisma.influencerApplication.findUnique({
      where: { id },
      select: {
        id: true,
        status: true,
        customerId: true,
        socialHandle: true,
        socialPlatform: true,
      },
    });

    if (!row) throw new NotFoundException('Application not found');
    this.assertPending(row.status);

    // E j grahak nu biju approved record to nathi ne? `Influencer.customerId`
    // unique chhe etle DB pan rokse — pan ahiya thi vaanchvа layak message
    // male chhe, "unique constraint failed" na badle.
    const already = await this.prisma.influencer.findUnique({
      where: { customerId: row.customerId },
      select: { id: true },
    });

    if (already) {
      throw new ConflictException('This customer is already a creator');
    }

    const now = new Date();

    await this.prisma.$transaction([
      this.prisma.influencerApplication.update({
        where: { id },
        data: {
          status: 'APPROVED',
          reviewedBy: adminEmail,
          reviewedAt: now,
          rejectionReason: null,
        },
      }),
      this.prisma.influencer.create({
        data: {
          customerId: row.customerId,
          applicationId: row.id,
          socialHandle: row.socialHandle,
          socialPlatform: row.socialPlatform,
          approvedAt: now,
          approvedBy: adminEmail,
        },
      }),
    ]);

    this.logger.log(
      `Application APPROVED — id=${id} customer=${row.customerId} by=${adminEmail}`,
    );

    return this.findOne(id);
  }

  /** Gate 1 — reject. Kaaran farjiyat chhe; applicant ne e dekhaay chhe. */
  async reject(
    id: string,
    reason: string,
    adminEmail: string,
  ): Promise<AdminApplicationDto> {
    const row = await this.prisma.influencerApplication.findUnique({
      where: { id },
      select: { status: true, customerId: true },
    });

    if (!row) throw new NotFoundException('Application not found');
    this.assertPending(row.status);

    await this.prisma.influencerApplication.update({
      where: { id },
      data: {
        status: 'REJECTED',
        rejectionReason: reason,
        reviewedBy: adminEmail,
        reviewedAt: new Date(),
      },
    });

    this.logger.log(
      `Application REJECTED — id=${id} customer=${row.customerId} by=${adminEmail}`,
    );

    return this.findOne(id);
  }

  // -------------------------------------------------------------------------

  /**
   * Be tabs ma e j application kholi ne banne par Approve dabaay — bijа ne
   * spashta error male chhe, chup-chaap overwrite nathi thatu.
   */
  private assertPending(status: InfluencerApplicationStatus): void {
    if (status !== 'PENDING') {
      throw new ConflictException(
        `This application has already been ${status.toLowerCase()}`,
      );
    }
  }

  private buildWhere(
    query: ListApplicationsDto,
  ): Prisma.InfluencerApplicationWhereInput {
    const where: Prisma.InfluencerApplicationWhereInput = {};

    if (query.status) where.status = query.status;

    if (query.search) {
      const search = query.search;
      where.OR = [
        { socialHandle: { contains: search, mode: 'insensitive' } },
        { customer: { firstName: { contains: search, mode: 'insensitive' } } },
        { customer: { lastName: { contains: search, mode: 'insensitive' } } },
        { customer: { primaryPhone: { contains: search } } },
        { customer: { primaryEmail: { contains: search, mode: 'insensitive' } } },
      ];
    }

    return where;
  }

  private buildOrderBy(
    sort: ListApplicationsDto['sort'],
  ): Prisma.InfluencerApplicationOrderByWithRelationInput {
    switch (sort) {
      case 'oldest':
        return { createdAt: 'asc' };
      case 'followers':
        return { followerCount: 'desc' };
      default:
        return { createdAt: 'desc' };
    }
  }
}
