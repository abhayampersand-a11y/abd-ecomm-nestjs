import { BadRequestException, Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  CustomerStatus,
  DevicePlatform,
  NotificationAudience,
  NotificationSegment,
  NotificationStatus,
  Prisma,
} from '@prisma/client';
import type { Env } from '../config/env.schema';
import { PrismaService } from '../prisma/prisma.service';
import type { RegisterDeviceDto } from './dto/device-token.dto';
import { maskToken } from './push/console-push.sender';
import {
  PUSH_SENDER,
  type PushMessage,
  type PushSender,
} from './push/push-sender.interface';

interface Target {
  id: string;
  token: string;
  platform: DevicePlatform;
  customerId: string;
}

export interface SendResultDto {
  notificationId: string;
  status: NotificationStatus;
  totalTargets: number;
  sentCount: number;
  failedCount: number;
  /** Kharaab thai gayela tokens je DB mathi kaadhi naakhya */
  prunedTokens: number;
}

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService<Env, true>,
    @Inject(PUSH_SENDER) private readonly sender: PushSender,
  ) {}

  // ---------------------------------------------------------------------------
  // Device tokens — grahak ni baaju
  // ---------------------------------------------------------------------------

  /**
   * App dar launch e aa call kare chhe.
   *
   * Token par upsert kariye chhiye, customer par nahi — ek j vyakti na traN
   * devices hoi shake, ane ek j device par be loko vaari-fari ne login kari
   * shake. Bije kisse token e j rahe chhe pan **maalik badlai jaay chhe**:
   * customerId update na karie to juna user na notifications nava user na
   * phone par jaay.
   */
  async registerDevice(customerId: string, dto: RegisterDeviceDto) {
    await this.prisma.deviceToken.upsert({
      where: { token: dto.token },
      create: {
        customerId,
        platform: dto.platform,
        token: dto.token,
        deviceId: dto.deviceId ?? null,
      },
      update: {
        customerId,
        platform: dto.platform,
        deviceId: dto.deviceId ?? null,
        lastSeenAt: new Date(),
      },
    });

    return { success: true as const };
  }

  /**
   * Logout vakhte. `deleteMany` + customerId — bija na token ne aakade
   * naakhvani rit na aapvi.
   */
  async unregisterDevice(customerId: string, token: string) {
    const { count } = await this.prisma.deviceToken.deleteMany({
      where: { token, customerId },
    });

    return { success: true as const, removed: count };
  }

  // ---------------------------------------------------------------------------
  // Sending
  // ---------------------------------------------------------------------------

  /**
   * Ek notification mokle chhe.
   *
   * ⚠️ Aa method **ek j vaar chalvi joiye**. Rakshan status par chhe: fakt
   * DRAFT/SCHEDULED mathi j SENDING ma jaay chhe, ane e badlav atomic
   * `updateMany` thi thay chhe. Be requests ek sathe aave to bijine 0 rows
   * male chhe ane e chup-chaap paachi vale chhe — grahak ne be vaar e j
   * notification nathi malti.
   */
  async send(notificationId: string): Promise<SendResultDto> {
    const claimed = await this.prisma.notification.updateMany({
      where: {
        id: notificationId,
        status: { in: [NotificationStatus.DRAFT, NotificationStatus.SCHEDULED] },
      },
      data: { status: NotificationStatus.SENDING },
    });

    if (claimed.count === 0) {
      const current = await this.prisma.notification.findUnique({
        where: { id: notificationId },
        select: { status: true },
      });

      throw new BadRequestException(
        current
          ? `This notification cannot be sent because its status is ${current.status}`
          : 'Notification not found',
      );
    }

    const notification = await this.prisma.notification.findUniqueOrThrow({
      where: { id: notificationId },
    });

    try {
      return await this.deliver(notification);
    } catch (err) {
      // SENDING ma atkelu na rahi jaay — nahi to e fari kyarey na mokli shakay
      await this.prisma.notification.update({
        where: { id: notificationId },
        data: {
          status: NotificationStatus.FAILED,
          error: (err as Error).message.slice(0, 500),
        },
      });

      this.logger.error(
        `Notification ${notificationId} failed: ${(err as Error).message}`,
      );
      throw err;
    }
  }

  /**
   * Jene mokalvano samay thai gayo hoy e badha.
   *
   * Aa repo ma scheduler nathi (`@nestjs/schedule` no dependency ummeryo
   * nathi — ek j vastu mate aakho package ane dar instance ma timer). Etle
   * aa endpoint bahar na cron thi hit thay chhe. Be instances ek sathe hit
   * kare to pan vaandho nahi: claim `send()` ma atomic chhe.
   */
  async dispatchDue(): Promise<{ dispatched: number; results: SendResultDto[] }> {
    const due = await this.prisma.notification.findMany({
      where: {
        status: NotificationStatus.SCHEDULED,
        scheduledAt: { lte: new Date() },
      },
      orderBy: { scheduledAt: 'asc' },
      take: 20,
      select: { id: true },
    });

    const results: SendResultDto[] = [];

    for (const row of due) {
      try {
        results.push(await this.send(row.id));
      } catch (err) {
        this.logger.warn(
          `Scheduled notification ${row.id} skip thayu: ${(err as Error).message}`,
        );
      }
    }

    return { dispatched: results.length, results };
  }

  /** Panel ne "aa campaign ketla loko sudhi jashe" pehla thi batavva mate */
  async estimateAudience(
    audience: NotificationAudience,
    segment?: NotificationSegment | null,
    customerId?: string | null,
  ): Promise<{ devices: number; customers: number }> {
    const where = this.targetWhere(audience, segment, customerId);

    const [devices, customers] = await Promise.all([
      this.prisma.deviceToken.count({ where }),
      this.prisma.deviceToken
        .findMany({ where, distinct: ['customerId'], select: { customerId: true } })
        .then((rows) => rows.length),
    ]);

    return { devices, customers };
  }

  // ---------------------------------------------------------------------------

  private async deliver(notification: {
    id: string;
    title: string;
    body: string;
    deepLink: string | null;
    imageUrl: string | null;
    audience: NotificationAudience;
    segment: NotificationSegment | null;
    customerId: string | null;
  }): Promise<SendResultDto> {
    const targets = await this.prisma.deviceToken.findMany({
      where: this.targetWhere(
        notification.audience,
        notification.segment,
        notification.customerId,
      ),
      select: { id: true, token: true, platform: true, customerId: true },
    });

    if (targets.length === 0) {
      await this.prisma.notification.update({
        where: { id: notification.id },
        data: {
          status: NotificationStatus.SENT,
          sentAt: new Date(),
          totalTargets: 0,
          sentCount: 0,
          failedCount: 0,
        },
      });

      this.logger.warn(
        `Notification ${notification.id} ne ek pan device na malyu ` +
          `(audience: ${notification.audience}${notification.segment ? '/' + notification.segment : ''})`,
      );

      return {
        notificationId: notification.id,
        status: NotificationStatus.SENT,
        totalTargets: 0,
        sentCount: 0,
        failedCount: 0,
        prunedTokens: 0,
      };
    }

    const batchSize = this.config.get('PUSH_BATCH_SIZE', { infer: true });

    let sentCount = 0;
    const failures: Array<{ target: Target; error: string }> = [];
    const invalidTokens: string[] = [];

    for (let i = 0; i < targets.length; i += batchSize) {
      const batch = targets.slice(i, i + batchSize);
      const byToken = new Map(batch.map((t) => [t.token, t]));

      const messages: PushMessage[] = batch.map((t) => ({
        token: t.token,
        platform: t.platform,
        title: notification.title,
        body: notification.body,
        deepLink: notification.deepLink,
        imageUrl: notification.imageUrl,
      }));

      const results = await this.sender.send(messages);

      for (const result of results) {
        const target = byToken.get(result.token);
        if (!target) continue;

        if (result.ok) {
          sentCount += 1;
          continue;
        }

        failures.push({ target, error: result.error ?? 'Unknown error' });
        if (result.invalidToken) invalidTokens.push(result.token);
      }
    }

    // Fakt nishfal delivery o lakhiye chhiye — juo schema no comment.
    if (failures.length) {
      await this.prisma.notificationDelivery.createMany({
        data: failures.map((f) => ({
          notificationId: notification.id,
          customerId: f.target.customerId,
          platform: f.target.platform,
          tokenPreview: maskToken(f.target.token),
          error: f.error.slice(0, 500),
        })),
      });
    }

    // Mareli tokens kaadhi naakho — nahi to dar campaign e e badhi par fari
    // prayatn thay chhe ane failure count kayam uncho dekhaay chhe.
    let prunedTokens = 0;
    if (invalidTokens.length) {
      const { count } = await this.prisma.deviceToken.deleteMany({
        where: { token: { in: invalidTokens } },
      });
      prunedTokens = count;
    }

    await this.prisma.notification.update({
      where: { id: notification.id },
      data: {
        status: NotificationStatus.SENT,
        sentAt: new Date(),
        totalTargets: targets.length,
        sentCount,
        failedCount: failures.length,
      },
    });

    this.logger.log(
      `Notification ${notification.id} sent — ${sentCount}/${targets.length} ok, ` +
        `${failures.length} failed, ${prunedTokens} dead token(s) removed`,
    );

    return {
      notificationId: notification.id,
      status: NotificationStatus.SENT,
      totalTargets: targets.length,
      sentCount,
      failedCount: failures.length,
      prunedTokens,
    };
  }

  /**
   * Kaya devices ne mokalvu.
   *
   * ⚠️ Dar segment ma `customer.status = ACTIVE` chhe ane e kaadhvu nahi.
   * Block karelo grahak, ke bija ma merge thai gayelo duplicate record —
   * ene marketing push mokalvi e sauthi saadi ane sauthi sharmajanak bhool
   * chhe.
   */
  private targetWhere(
    audience: NotificationAudience,
    segment?: NotificationSegment | null,
    customerId?: string | null,
  ): Prisma.DeviceTokenWhereInput {
    if (audience === NotificationAudience.CUSTOMER) {
      if (!customerId) {
        throw new BadRequestException('A customer must be selected for this audience');
      }
      return { customerId, customer: { status: CustomerStatus.ACTIVE } };
    }

    const active = { status: CustomerStatus.ACTIVE };

    if (audience === NotificationAudience.ALL) {
      return { customer: active };
    }

    if (!segment) {
      throw new BadRequestException('A segment must be selected for this audience');
    }

    const now = Date.now();
    const dayAgo = new Date(now - 24 * 60 * 60 * 1000);
    const weekAgo = new Date(now - 7 * 24 * 60 * 60 * 1000);
    const monthAgo = new Date(now - 30 * 24 * 60 * 60 * 1000);

    switch (segment) {
      case NotificationSegment.ABANDONED_CART:
        return {
          customer: {
            ...active,
            cart: { items: { some: {} }, updatedAt: { lt: dayAgo } },
          },
        };

      case NotificationSegment.HAS_WISHLIST:
        return { customer: { ...active, wishlist: { some: {} } } };

      case NotificationSegment.INACTIVE_30D:
        return {
          customer: {
            ...active,
            OR: [{ lastLoginAt: null }, { lastLoginAt: { lt: monthAgo } }],
          },
        };

      case NotificationSegment.NEW_LAST_7D:
        return { customer: { ...active, createdAt: { gte: weekAgo } } };

      case NotificationSegment.ALL_USERS:
      default:
        return { customer: active };
    }
  }
}
