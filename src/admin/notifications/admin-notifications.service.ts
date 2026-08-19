import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import {
  NotificationAudience,
  NotificationStatus,
  Prisma,
} from '@prisma/client';
import { NotificationsService } from '../../notifications/notifications.service';
import { PrismaService } from '../../prisma/prisma.service';
import { AdminAuditService } from '../audit/admin-audit.service';
import type {
  CreateNotificationDto,
  CreateTemplateDto,
  EstimateAudienceDto,
  ListNotificationsDto,
  UpdateNotificationDto,
  UpdateTemplateDto,
} from '../dto/notification.dto';
import {
  toAdminPage,
  toSkipTake,
  type AdminPageDto,
  type PaginationDto,
} from '../dto/pagination.dto';

/** Aa be status ma j notification badli ke mokli shakay */
const EDITABLE: NotificationStatus[] = [
  NotificationStatus.DRAFT,
  NotificationStatus.SCHEDULED,
];

@Injectable()
export class AdminNotificationsService {
  private readonly logger = new Logger(AdminNotificationsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
    private readonly audit: AdminAuditService,
  ) {}

  async list(query: ListNotificationsDto): Promise<AdminPageDto<unknown>> {
    const where: Prisma.NotificationWhereInput = query.status
      ? { status: query.status }
      : {};

    const [rows, total] = await this.prisma.$transaction([
      this.prisma.notification.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        ...toSkipTake(query),
      }),
      this.prisma.notification.count({ where }),
    ]);

    return toAdminPage(rows.map(toSummary), total, query);
  }

  /** Detail ma nishfal deliveries pan aave chhe — "kem na pahonchyu" no javaab */
  async findOne(id: string) {
    const row = await this.prisma.notification.findUnique({
      where: { id },
      include: {
        deliveries: { orderBy: { failedAt: 'desc' }, take: 100 },
        customer: {
          select: { id: true, firstName: true, lastName: true, primaryPhone: true },
        },
      },
    });

    if (!row) throw new NotFoundException('Notification not found');

    return {
      ...toSummary(row),
      customer: row.customer,
      error: row.error,
      // Fakt failures j store thay chhe (juo schema) — etle aa list
      // "problems" chhe, "log" nahi.
      failures: row.deliveries.map((d) => ({
        id: d.id,
        customerId: d.customerId,
        platform: d.platform,
        tokenPreview: d.tokenPreview,
        error: d.error,
        failedAt: d.failedAt.toISOString(),
      })),
    };
  }

  async create(dto: CreateNotificationDto) {
    const audience = dto.audience ?? NotificationAudience.ALL;
    this.assertAudienceShape(audience, dto.segment, dto.customerId);

    if (dto.scheduledAt && new Date(dto.scheduledAt) <= new Date()) {
      throw new BadRequestException('The scheduled time must be in the future');
    }

    const row = await this.prisma.notification.create({
      data: {
        title: dto.title,
        body: dto.body,
        deepLink: dto.deepLink ?? null,
        imageUrl: dto.imageUrl ?? null,
        audience,
        segment: dto.segment ?? null,
        customerId: dto.customerId ?? null,
        scheduledAt: dto.scheduledAt ? new Date(dto.scheduledAt) : null,
        status: dto.scheduledAt
          ? NotificationStatus.SCHEDULED
          : NotificationStatus.DRAFT,
      },
    });

    await this.audit.record({
      action: 'notification.create',
      entityType: 'notification',
      entityId: row.id,
      summary: `Notification "${row.title}" created (${row.status})`,
      after: toSummary(row),
    });

    return toSummary(row);
  }

  async update(id: string, dto: UpdateNotificationDto) {
    const before = await this.mustBeEditable(id);

    const audience = dto.audience ?? before.audience;
    this.assertAudienceShape(
      audience,
      dto.segment ?? before.segment,
      dto.customerId ?? before.customerId,
    );

    const row = await this.prisma.notification.update({
      where: { id },
      data: {
        title: dto.title,
        body: dto.body,
        deepLink: dto.deepLink,
        imageUrl: dto.imageUrl,
        audience: dto.audience,
        segment: dto.segment,
        customerId: dto.customerId,
        scheduledAt: dto.scheduledAt ? new Date(dto.scheduledAt) : undefined,
        status: dto.scheduledAt ? NotificationStatus.SCHEDULED : undefined,
      },
    });

    await this.audit.record({
      action: 'notification.update',
      entityType: 'notification',
      entityId: id,
      summary: `Notification "${row.title}" updated`,
      before: toSummary(before),
      after: toSummary(row),
    });

    return toSummary(row);
  }

  /**
   * ⚠️ Aa ekmatra jagya chhe jya kharekhar push jaay chhe.
   *
   * Mokli didha pachhi pachu levaay nahi — etle audit ahiya MOKALVA PEHLA
   * lakhaay chhe. Send vachche server padi jaay to pan "aa campaign chalu
   * karyo hato" no puravo rahe chhe.
   */
  async send(id: string) {
    const notification = await this.prisma.notification.findUnique({
      where: { id },
      select: {
        id: true,
        title: true,
        status: true,
        audience: true,
        segment: true,
      },
    });

    if (!notification) throw new NotFoundException('Notification not found');

    const target =
      notification.audience +
      (notification.segment ? `/${notification.segment}` : '');

    await this.audit.record({
      action: 'notification.send',
      entityType: 'notification',
      entityId: id,
      summary: `Notification "${notification.title}" sent to ${target}`,
      before: { status: notification.status },
    });

    return this.notifications.send(id);
  }

  /** Bahar no cron aa hit kare chhe — juo NotificationsService.dispatchDue() */
  async dispatchDue() {
    return this.notifications.dispatchDue();
  }

  async cancel(id: string) {
    const before = await this.mustBeEditable(id);

    const row = await this.prisma.notification.update({
      where: { id },
      data: { status: NotificationStatus.CANCELLED },
    });

    await this.audit.record({
      action: 'notification.cancel',
      entityType: 'notification',
      entityId: id,
      summary: `Notification "${row.title}" cancelled`,
      before: { status: before.status },
      after: { status: row.status },
    });

    return toSummary(row);
  }

  async remove(id: string) {
    const row = await this.prisma.notification.findUnique({ where: { id } });
    if (!row) throw new NotFoundException('Notification not found');

    // Mokali didhelu campaign delete na thay — e itihaas chhe.
    if (row.status === NotificationStatus.SENT) {
      throw new BadRequestException(
        'A notification that has already been sent cannot be deleted',
      );
    }

    await this.prisma.notification.delete({ where: { id } });

    await this.audit.record({
      action: 'notification.delete',
      entityType: 'notification',
      entityId: id,
      summary: `Notification "${row.title}" deleted`,
      before: toSummary(row),
    });

    return { success: true as const };
  }

  /** Mokalva pehla "ketla loko sudhi jashe" — panel e aa batavvu joiye */
  async estimate(dto: EstimateAudienceDto) {
    this.assertAudienceShape(dto.audience, dto.segment, dto.customerId);
    return this.notifications.estimateAudience(
      dto.audience,
      dto.segment,
      dto.customerId,
    );
  }

  // ---------------------------------------------------------------------------
  // Templates
  // ---------------------------------------------------------------------------

  async listTemplates(query: PaginationDto): Promise<AdminPageDto<unknown>> {
    const [items, total] = await this.prisma.$transaction([
      this.prisma.notificationTemplate.findMany({
        orderBy: { name: 'asc' },
        ...toSkipTake(query),
      }),
      this.prisma.notificationTemplate.count(),
    ]);

    return toAdminPage(items, total, query);
  }

  async createTemplate(dto: CreateTemplateDto) {
    try {
      const row = await this.prisma.notificationTemplate.create({
        data: {
          name: dto.name,
          title: dto.title,
          body: dto.body,
          deepLink: dto.deepLink ?? null,
          imageUrl: dto.imageUrl ?? null,
        },
      });

      await this.audit.record({
        action: 'template.create',
        entityType: 'notificationTemplate',
        entityId: row.id,
        summary: `Notification template "${row.name}" created`,
        after: row,
      });

      return row;
    } catch (err) {
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === 'P2002'
      ) {
        throw new BadRequestException('A template with this name already exists');
      }
      throw err;
    }
  }

  async updateTemplate(id: string, dto: UpdateTemplateDto) {
    const before = await this.prisma.notificationTemplate.findUnique({
      where: { id },
    });
    if (!before) throw new NotFoundException('Template not found');

    const row = await this.prisma.notificationTemplate.update({
      where: { id },
      data: {
        name: dto.name,
        title: dto.title,
        body: dto.body,
        deepLink: dto.deepLink,
        imageUrl: dto.imageUrl,
      },
    });

    await this.audit.record({
      action: 'template.update',
      entityType: 'notificationTemplate',
      entityId: id,
      summary: `Notification template "${row.name}" updated`,
      before,
      after: row,
    });

    return row;
  }

  async removeTemplate(id: string) {
    const row = await this.prisma.notificationTemplate.findUnique({
      where: { id },
    });
    if (!row) throw new NotFoundException('Template not found');

    await this.prisma.notificationTemplate.delete({ where: { id } });

    await this.audit.record({
      action: 'template.delete',
      entityType: 'notificationTemplate',
      entityId: id,
      summary: `Notification template "${row.name}" deleted`,
      before: row,
    });

    return { success: true as const };
  }

  // ---------------------------------------------------------------------------

  private async mustBeEditable(id: string) {
    const row = await this.prisma.notification.findUnique({ where: { id } });
    if (!row) throw new NotFoundException('Notification not found');

    if (!EDITABLE.includes(row.status)) {
      throw new BadRequestException(
        `A notification with status ${row.status} can no longer be changed`,
      );
    }

    return row;
  }

  /**
   * Audience ane enu sathi field mel khaay chhe ke nahi.
   *
   * SEGMENT pasand karyu pan segment na bharyu — evu campaign save thai jaay
   * to send vakhte fail thay chhe, ane e sauthi khoto samay chhe: admin
   * "Send" dabaavi ne raah joto hoy chhe.
   */
  private assertAudienceShape(
    audience: NotificationAudience,
    segment?: string | null,
    customerId?: string | null,
  ): void {
    if (audience === NotificationAudience.SEGMENT && !segment) {
      throw new BadRequestException(
        'A segment must be selected when the audience is SEGMENT',
      );
    }

    if (audience === NotificationAudience.CUSTOMER && !customerId) {
      throw new BadRequestException(
        'A customer must be selected when the audience is CUSTOMER',
      );
    }
  }
}

function toSummary(row: {
  id: string;
  title: string;
  body: string;
  deepLink: string | null;
  imageUrl: string | null;
  audience: NotificationAudience;
  segment: string | null;
  customerId: string | null;
  status: NotificationStatus;
  scheduledAt: Date | null;
  sentAt: Date | null;
  totalTargets: number;
  sentCount: number;
  failedCount: number;
  createdAt: Date;
}) {
  return {
    id: row.id,
    title: row.title,
    body: row.body,
    deepLink: row.deepLink,
    imageUrl: row.imageUrl,
    audience: row.audience,
    segment: row.segment,
    customerId: row.customerId,
    status: row.status,
    scheduledAt: row.scheduledAt?.toISOString() ?? null,
    sentAt: row.sentAt?.toISOString() ?? null,
    totalTargets: row.totalTargets,
    sentCount: row.sentCount,
    failedCount: row.failedCount,
    createdAt: row.createdAt.toISOString(),
  };
}
