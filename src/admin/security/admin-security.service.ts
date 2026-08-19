import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { OtpPurpose, Prisma } from '@prisma/client';
import { normalizeIdentifier } from '../../common/utils/identifier.util';
import type { Env } from '../../config/env.schema';
import { PrismaService } from '../../prisma/prisma.service';
import { RedisService } from '../../redis/redis.service';
import { AdminAuditService } from '../audit/admin-audit.service';
import { fullName } from '../dto/admin-customer.dto';
import {
  toAdminPage,
  toSkipTake,
  type AdminPageDto,
} from '../dto/pagination.dto';
import type {
  ListOtpLogsDto,
  ListSessionsDto,
  ResetOtpLimitDto,
} from '../dto/security.dto';

/**
 * OTP logs, sessions ane rate limits — support team nu roj-baroj nu kaam.
 *
 * ⚠️ `codeHash` aa file mathi KYAREY bahar na jaay. Hash + pepper hoy to pan
 * bahar mokalvani koi jarur nathi, ane ek vaar response ma aavi gayo to e
 * browser na network tab, screenshot ane logs — badhe pahonchi jaay chhe.
 */
@Injectable()
export class AdminSecurityService {
  private readonly logger = new Logger(AdminSecurityService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly config: ConfigService<Env, true>,
    private readonly audit: AdminAuditService,
  ) {}

  // ---------------------------------------------------------------------------
  // OTP logs
  // ---------------------------------------------------------------------------

  async listOtpLogs(query: ListOtpLogsDto): Promise<AdminPageDto<unknown>> {
    const where = this.buildOtpWhere(query);

    const [rows, total] = await this.prisma.$transaction([
      this.prisma.otpCode.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        ...toSkipTake(query),
        select: {
          id: true,
          identifierType: true,
          identifier: true,
          purpose: true,
          attempts: true,
          maxAttempts: true,
          expiresAt: true,
          consumedAt: true,
          requestIp: true,
          createdAt: true,
          customerId: true,
          // codeHash jaan-bujhi ne nathi
        },
      }),
      this.prisma.otpCode.count({ where }),
    ]);

    const now = new Date();

    const items = rows.map((r) => ({
      id: r.id,
      type: r.identifierType,
      identifier: r.identifier,
      purpose: r.purpose,
      attempts: r.attempts,
      maxAttempts: r.maxAttempts,
      status: r.consumedAt
        ? ('consumed' as const)
        : r.expiresAt <= now
          ? ('expired' as const)
          : ('pending' as const),
      requestIp: r.requestIp,
      customerId: r.customerId,
      expiresAt: r.expiresAt.toISOString(),
      consumedAt: r.consumedAt?.toISOString() ?? null,
      createdAt: r.createdAt.toISOString(),
    }));

    return toAdminPage(items, total, query);
  }

  /**
   * OTP delivery ni tabiyat.
   *
   * Sauthi kaam nu aankdo `neverUsed` chhe: OTP niklyo pan koi e vaparyo j
   * nahi. E vadhe etle SMS gateway ma kaik bagdyu chhe — users ne code
   * pahonchto j nathi.
   */
  async otpStats(days: number) {
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    const now = new Date();

    const [issued, consumed, expiredUnused, byPurpose, byType, topIdentifiers] =
      await Promise.all([
        this.prisma.otpCode.count({ where: { createdAt: { gte: since } } }),
        this.prisma.otpCode.count({
          where: { createdAt: { gte: since }, consumedAt: { not: null } },
        }),
        this.prisma.otpCode.count({
          where: {
            createdAt: { gte: since },
            consumedAt: null,
            expiresAt: { lt: now },
          },
        }),
        this.prisma.otpCode.groupBy({
          by: ['purpose'],
          where: { createdAt: { gte: since } },
          _count: { purpose: true },
        }),
        this.prisma.otpCode.groupBy({
          by: ['identifierType'],
          where: { createdAt: { gte: since } },
          _count: { identifierType: true },
        }),
        this.prisma.otpCode.groupBy({
          by: ['identifier'],
          where: { createdAt: { gte: since } },
          _count: { identifier: true },
          orderBy: { _count: { identifier: 'desc' } },
          take: 10,
        }),
      ]);

    return {
      days,
      issued,
      consumed,
      neverUsed: expiredUnused,
      /** Ketla issued OTP kharekhar vaparaaya (%) */
      usageRate: issued === 0 ? null : Math.round((consumed / issued) * 100),
      byPurpose: byPurpose.map((r) => ({
        purpose: r.purpose,
        count: r._count.purpose,
      })),
      byChannel: byType.map((r) => ({
        type: r.identifierType,
        count: r._count.identifierType,
      })),
      // Ek j number par 40 OTP = kaa to test chhe, kaa to koi tang kare chhe
      topRequesters: topIdentifiers.map((r) => ({
        identifier: r.identifier,
        count: r._count.identifier,
      })),
    };
  }

  // ---------------------------------------------------------------------------
  // Rate limits
  // ---------------------------------------------------------------------------

  /**
   * OTP na rate limits chhoodavo.
   *
   * ⚠️ Aa thi OTP MOKLATO NATHI ane code kyarey dekhaato nathi. Fakt Redis na
   * counters saaf thay chhe, jethi user pote fari "Resend" dabaavi shake. Aa
   * seema jaan-bujhi ne chhe: admin ne code batavvani sagvad aapo, etle ek
   * din e sagvad thi j koi na account ma andar javashe.
   */
  async resetOtpLimits(dto: ResetOtpLimitDto) {
    if (!dto.identifier && !dto.ip) {
      throw new BadRequestException('Provide an identifier or an IP address');
    }

    const cleared: string[] = [];

    if (dto.identifier) {
      // User e "9876543210" lakhyu hoy ane DB ma "+919876543210" hoy —
      // OtpService e j normalization vaapre chhe, etle aapne pan e j vaparvu.
      const identifier = normalizeIdentifier(
        dto.identifier,
        this.config.get('DEFAULT_COUNTRY_CODE', { infer: true }),
      );

      const keys = [
        `otp:rl:id:${identifier.value}`,
        ...Object.values(OtpPurpose).map(
          (purpose) => `otp:cd:${purpose}:${identifier.value}`,
        ),
      ];

      await this.redis.del(...keys);
      cleared.push(...keys);

      this.logger.warn(
        `Admin cleared OTP rate limits for ${identifier.masked}`,
      );
    }

    if (dto.ip) {
      const key = `otp:rl:ip:${dto.ip}`;
      await this.redis.del(key);
      cleared.push(key);
      this.logger.warn(`Admin cleared OTP rate limits for IP ${dto.ip}`);
    }

    await this.audit.record({
      action: 'otp.reset_limits',
      entityType: 'system',
      entityId: null,
      summary: `Cleared OTP rate limits for ${dto.identifier ?? ''}${dto.identifier && dto.ip ? ' and ' : ''}${dto.ip ?? ''}`.trim(),
      after: { clearedKeys: cleared.length },
    });

    return { success: true as const, clearedKeys: cleared.length };
  }

  // ---------------------------------------------------------------------------
  // Sessions ane devices (aakhi app ni, ek customer ni nahi)
  // ---------------------------------------------------------------------------

  async listSessions(query: ListSessionsDto) {
    const where: Prisma.RefreshTokenWhereInput = {
      revokedAt: null,
      expiresAt: { gt: new Date() },
    };

    const [rows, total] = await this.prisma.$transaction([
      this.prisma.refreshToken.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        ...toSkipTake(query),
        select: {
          id: true,
          deviceId: true,
          userAgent: true,
          ip: true,
          createdAt: true,
          expiresAt: true,
          customer: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              primaryPhone: true,
              primaryEmail: true,
            },
          },
        },
      }),
      this.prisma.refreshToken.count({ where }),
    ]);

    const items = rows.map((s) => ({
      id: s.id,
      deviceId: s.deviceId,
      userAgent: s.userAgent,
      ip: s.ip,
      createdAt: s.createdAt.toISOString(),
      expiresAt: s.expiresAt.toISOString(),
      customer: {
        id: s.customer.id,
        name: fullName(s.customer),
        phone: s.customer.primaryPhone,
        email: s.customer.primaryEmail,
      },
    }));

    return toAdminPage(items, total, query);
  }

  /** Push notifications ketla devices sudhi pahonchi shakse */
  async deviceStats() {
    const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

    const [byPlatform, total, activeLast7d, customersWithDevice] =
      await Promise.all([
        this.prisma.deviceToken.groupBy({
          by: ['platform'],
          _count: { platform: true },
        }),
        this.prisma.deviceToken.count(),
        this.prisma.deviceToken.count({
          where: { lastSeenAt: { gte: weekAgo } },
        }),
        this.prisma.deviceToken
          .findMany({ distinct: ['customerId'], select: { customerId: true } })
          .then((rows) => rows.length),
      ]);

    return {
      total,
      activeLast7d,
      customersReachable: customersWithDevice,
      byPlatform: byPlatform.map((r) => ({
        platform: r.platform,
        count: r._count.platform,
      })),
    };
  }

  // ---------------------------------------------------------------------------

  private buildOtpWhere(query: ListOtpLogsDto): Prisma.OtpCodeWhereInput {
    const where: Prisma.OtpCodeWhereInput = {};

    if (query.purpose) where.purpose = query.purpose;
    if (query.ip) where.requestIp = query.ip;

    if (query.identifier) {
      // Aakho E.164 na yaad hoy to pan "43210" thi shodhi shakay
      where.identifier = { contains: query.identifier, mode: 'insensitive' };
    }

    const now = new Date();
    if (query.status === 'consumed') {
      where.consumedAt = { not: null };
    } else if (query.status === 'expired') {
      where.consumedAt = null;
      where.expiresAt = { lt: now };
    } else if (query.status === 'pending') {
      where.consumedAt = null;
      where.expiresAt = { gt: now };
    }

    return where;
  }
}
