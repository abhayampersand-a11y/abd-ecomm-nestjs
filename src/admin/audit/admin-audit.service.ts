import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import {
  toAdminPage,
  toSkipTake,
  type AdminPageDto,
} from '../dto/pagination.dto';
import type { ListAuditLogsDto } from '../dto/audit.dto';
import { currentAdminContext } from './admin-context';

export interface AuditEntry {
  /** "customer.block", "banner.update", "notification.send" */
  action: string;
  entityType: string;
  entityId?: string | null;
  summary: string;
  before?: unknown;
  after?: unknown;
}

@Injectable()
export class AdminAuditService {
  private readonly logger = new Logger(AdminAuditService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * ⚠️ AA METHOD KYAREY THROW NA KARE.
   *
   * Audit lakhvama bhool aavvathi asli kaam (customer block, banner update)
   * roLai na javu joiye. Nahi to ek din audit table full thai jaay ane aakhu
   * panel band padi jaay — je ilaaj rog karta bhundo chhe.
   */
  async record(entry: AuditEntry): Promise<void> {
    const ctx = currentAdminContext();

    try {
      await this.prisma.auditLog.create({
        data: {
          action: entry.action,
          entityType: entry.entityType,
          entityId: entry.entityId ?? null,
          summary: entry.summary.slice(0, 500),
          before: toJson(entry.before),
          after: toJson(entry.after),
          actor: ctx.actor,
          ip: ctx.ip ?? null,
        },
      });
    } catch (err) {
      this.logger.error(
        `Audit log lakhi na shakayo (${entry.action}): ${(err as Error).message}`,
      );
    }
  }

  async list(query: ListAuditLogsDto): Promise<AdminPageDto<unknown>> {
    const where: Prisma.AuditLogWhereInput = {};

    if (query.action) where.action = query.action;
    if (query.entityType) where.entityType = query.entityType;
    if (query.entityId) where.entityId = query.entityId;

    if (query.since) {
      where.createdAt = { gte: new Date(query.since) };
    }

    const [rows, total] = await this.prisma.$transaction([
      this.prisma.auditLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        ...toSkipTake(query),
      }),
      this.prisma.auditLog.count({ where }),
    ]);

    const items = rows.map((r) => ({
      id: r.id,
      action: r.action,
      entityType: r.entityType,
      entityId: r.entityId,
      summary: r.summary,
      before: r.before,
      after: r.after,
      actor: r.actor,
      ip: r.ip,
      createdAt: r.createdAt.toISOString(),
    }));

    return toAdminPage(items, total, query);
  }

  /** Panel na filter dropdown mate — kaya actions kharekhar thaya chhe */
  async actions(): Promise<string[]> {
    const rows = await this.prisma.auditLog.groupBy({
      by: ['action'],
      orderBy: { action: 'asc' },
    });

    return rows.map((r) => r.action);
  }
}

/**
 * `undefined` ne Prisma `Json?` column ma na moklaay — e "field j na aapyu"
 * jevu chhe, ane `null` thi alag chhe.
 */
function toJson(value: unknown): Prisma.InputJsonValue | typeof Prisma.JsonNull | undefined {
  if (value === undefined) return undefined;
  if (value === null) return Prisma.JsonNull;
  return value as Prisma.InputJsonValue;
}
