import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import type { ApplyDto } from './dto/apply.dto';
import {
  toApplicationStatusDto,
  toInfluencerProfileDto,
  type ApplicationStatusDto,
  type InfluencerProfileDto,
} from './influencer.mapper';

/**
 * Reject thaya pachhi fari apply karva mate ni raah.
 *
 * Aa vagar reject thayelo vyakti roj savare fari apply kare chhe ane admin ni
 * queue e j naam thi bharai jaay chhe. 30 divas ma sadharan rite loko potanu
 * profile sudhaari shake chhe — je j karan e reject thaya hoy e.
 */
export const REAPPLY_AFTER_DAYS = 30;

@Injectable()
export class InfluencerService {
  private readonly logger = new Logger(InfluencerService.name);

  constructor(private readonly prisma: PrismaService) {}

  // -------------------------------------------------------------------------
  // Grahak ni baaju
  // -------------------------------------------------------------------------

  async apply(customerId: string, dto: ApplyDto): Promise<ApplicationStatusDto> {
    // Pehla thi influencer chhe? To application no matlab j nathi.
    const existing = await this.prisma.influencer.findUnique({
      where: { customerId },
      select: { status: true },
    });

    if (existing) {
      throw new ConflictException(
        existing.status === 'SUSPENDED'
          ? 'Your creator account is suspended. Please contact support.'
          : 'You are already a creator.',
      );
    }

    await this.assertCanApply(customerId);

    try {
      const row = await this.prisma.influencerApplication.create({
        data: {
          customerId,
          socialHandle: dto.socialHandle,
          socialPlatform: dto.socialPlatform,
          followerCount: dto.followerCount,
          panNumber: dto.panNumber,
        },
      });

      this.logger.log(
        `Application submitted — customer=${customerId} ` +
          `${dto.socialPlatform}/@${dto.socialHandle} (${dto.followerCount} followers)`,
      );

      return toApplicationStatusDto(row, REAPPLY_AFTER_DAYS);
    } catch (err) {
      // Partial unique index par thi aavelo race — be tap ek sathe padya.
      // Aa error nathi, user ni drishti e: eni request pahonchi j gai chhe.
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === 'P2002'
      ) {
        throw new ConflictException('Your application is already under review.');
      }
      throw err;
    }
  }

  /** Sauthi navi application — na hoy to `null` (app "Apply" button daakhve) */
  async myApplication(customerId: string): Promise<ApplicationStatusDto | null> {
    const row = await this.prisma.influencerApplication.findFirst({
      where: { customerId },
      orderBy: { createdAt: 'desc' },
    });

    return row ? toApplicationStatusDto(row, REAPPLY_AFTER_DAYS) : null;
  }

  async me(customerId: string): Promise<InfluencerProfileDto> {
    const row = await this.prisma.influencer.findUnique({ where: { customerId } });

    if (!row) {
      throw new NotFoundException('You are not a creator yet.');
    }

    return toInfluencerProfileDto(row);
  }

  // -------------------------------------------------------------------------

  /**
   * Chhelli application joi ne nakki kare ke atyare apply thai shake ke nahi.
   *
   * PENDING no case ahiya pan pakdiye chhiye ane DB index par pan — kem ke
   * ahiya thi saras message aape chhe, ane index race condition rokE chhe.
   */
  private async assertCanApply(customerId: string): Promise<void> {
    const last = await this.prisma.influencerApplication.findFirst({
      where: { customerId },
      orderBy: { createdAt: 'desc' },
      select: { status: true, reviewedAt: true },
    });

    if (!last) return;

    if (last.status === 'PENDING') {
      throw new ConflictException('Your application is already under review.');
    }

    if (last.status === 'REJECTED' && last.reviewedAt) {
      const canReapplyAt = new Date(
        last.reviewedAt.getTime() + REAPPLY_AFTER_DAYS * 86_400_000,
      );

      if (canReapplyAt > new Date()) {
        const days = Math.ceil((canReapplyAt.getTime() - Date.now()) / 86_400_000);
        throw new BadRequestException(
          `You can apply again in ${days} day${days === 1 ? '' : 's'}.`,
        );
      }
    }
  }
}
