import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { CustomerStatus, Prisma } from '@prisma/client';
import { TokenService } from '../../auth/token.service';
import { CartService } from '../../cart/cart.service';
import { fromMinor, toMinor } from '../../common/utils/money.util';
import { OrdersService } from '../../orders/orders.service';
import { PrismaService } from '../../prisma/prisma.service';
import { WishlistService } from '../../wishlist/wishlist.service';
import { AdminAuditService } from '../audit/admin-audit.service';
import {
  fullName,
  toAdminCustomerSummary,
  type AdminCustomerSummaryDto,
} from '../dto/admin-customer.dto';
import type { ListCustomersDto } from '../dto/list-customers.dto';
import {
  toAdminPage,
  toSkipTake,
  type AdminPageDto,
} from '../dto/pagination.dto';
import type { UpdateCustomerDto } from '../dto/update-customer.dto';

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Admin panel nu customer management.
 *
 * ⚠️ Ahiya `customerId` URL mathi aave chhe — mobile app ni jem token mathi
 * nahi. Etle aa aakhi service AdminJwtGuard ni pachhal j chalvi joiye; ek pan
 * route guard vagar rahi gayo to aakhu customer database khulli jaay chhe.
 */
@Injectable()
export class AdminCustomersService {
  private readonly logger = new Logger(AdminCustomersService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly tokens: TokenService,
    private readonly orders: OrdersService,
    private readonly cart: CartService,
    private readonly wishlist: WishlistService,
    private readonly audit: AdminAuditService,
  ) {}

  // ---------------------------------------------------------------------------
  // List / detail
  // ---------------------------------------------------------------------------

  async list(
    query: ListCustomersDto,
  ): Promise<AdminPageDto<AdminCustomerSummaryDto>> {
    const where = this.buildWhere(query);

    const [rows, total] = await this.prisma.$transaction([
      this.prisma.customer.findMany({
        where,
        orderBy: this.buildOrderBy(query.sort),
        ...toSkipTake(query),
        include: {
          identities: { select: { type: true } },
          _count: {
            select: {
              addresses: true,
              wishlist: true,
              recentlyViewed: true,
              shopifyLinks: true,
            },
          },
        },
      }),
      this.prisma.customer.count({ where }),
    ]);

    return toAdminPage(rows.map(toAdminCustomerSummary), total, query);
  }

  async findOne(id: string) {
    const customer = await this.prisma.customer.findUnique({
      where: { id },
      include: {
        identities: { orderBy: { verifiedAt: 'asc' } },
        shopifyLinks: { orderBy: { linkedAt: 'asc' } },
        deviceTokens: { orderBy: { lastSeenAt: 'desc' } },
        cart: { include: { items: true } },
        mergedInto: {
          select: { id: true, primaryPhone: true, primaryEmail: true },
        },
        mergedFrom: {
          select: {
            id: true,
            primaryPhone: true,
            primaryEmail: true,
            status: true,
          },
        },
        _count: {
          select: {
            addresses: true,
            wishlist: true,
            recentlyViewed: true,
            shopifyLinks: true,
          },
        },
      },
    });

    if (!customer) {
      throw new NotFoundException('Customer not found');
    }

    const activeSessions = await this.prisma.refreshToken.count({
      where: {
        customerId: id,
        revokedAt: null,
        expiresAt: { gt: new Date() },
      },
    });

    return {
      ...toAdminCustomerSummary(customer),
      firstName: customer.firstName,
      lastName: customer.lastName,
      gender: customer.gender,
      updatedAt: customer.updatedAt.toISOString(),

      identities: customer.identities.map((i) => ({
        id: i.id,
        type: i.type,
        value: i.value,
        isPrimary: i.isPrimary,
        verifiedAt: i.verifiedAt.toISOString(),
      })),

      shopifyLinks: customer.shopifyLinks.map((l) => ({
        shopifyCustomerId: l.shopifyCustomerId,
        matchedVia: l.matchedVia,
        matchedValue: l.matchedValue,
        linkedAt: l.linkedAt.toISOString(),
      })),

      devices: customer.deviceTokens.map((d) => ({
        id: d.id,
        platform: d.platform,
        deviceId: d.deviceId,
        lastSeenAt: d.lastSeenAt.toISOString(),
      })),

      cart: this.cartSnapshot(customer.cart),
      activeSessions,

      mergedInto: customer.mergedInto,
      mergedFrom: customer.mergedFrom,
    };
  }

  // ---------------------------------------------------------------------------
  // Mutations
  // ---------------------------------------------------------------------------

  async update(id: string, dto: UpdateCustomerDto) {
    await this.mustExist(id);

    const data: Prisma.CustomerUpdateInput = {};
    if (dto.firstName !== undefined) data.firstName = dto.firstName || null;
    if (dto.lastName !== undefined) data.lastName = dto.lastName || null;
    if (dto.gender !== undefined) data.gender = dto.gender || null;

    if (Object.keys(data).length === 0) {
      throw new BadRequestException('No fields to update');
    }

    await this.prisma.customer.update({ where: { id }, data });

    await this.audit.record({
      action: 'customer.update',
      entityType: 'customer',
      entityId: id,
      summary: `Updated ${Object.keys(data).join(', ')}`,
      after: data,
    });

    return this.findOne(id);
  }

  /**
   * Block = login band + badhi chalu sessions ratad.
   *
   * Fakt status badalvathi kaam nathi thatu: eno access token haju 15 minute
   * chale chhe ane refresh token 60 divas. Etle banne ahiya j band kariye chhiye.
   */
  async block(id: string, reason?: string) {
    const customer = await this.mustExist(id);

    if (customer.status === CustomerStatus.MERGED) {
      throw new BadRequestException(
        'This customer has been merged into another account. Block that account instead.',
      );
    }

    if (customer.status === CustomerStatus.BLOCKED) {
      throw new BadRequestException('Customer is already blocked');
    }

    await this.prisma.customer.update({
      where: { id },
      data: { status: CustomerStatus.BLOCKED },
    });

    const revokedSessions = await this.tokens.revokeAllForCustomer(id);

    await this.audit.record({
      action: 'customer.block',
      entityType: 'customer',
      entityId: id,
      summary: reason
        ? `Blocked — ${reason}`
        : 'Blocked (no reason given)',
      before: { status: customer.status },
      after: { status: CustomerStatus.BLOCKED, revokedSessions },
    });

    this.logger.warn(
      `Admin blocked customer ${id}` +
        (reason ? ` — reason: ${reason}` : '') +
        ` (${revokedSessions} session(s) revoked)`,
    );

    return { success: true as const, revokedSessions };
  }

  async unblock(id: string) {
    const customer = await this.mustExist(id);

    if (customer.status === CustomerStatus.MERGED) {
      throw new BadRequestException(
        'This customer has been merged into another account and cannot be unblocked.',
      );
    }

    if (customer.status !== CustomerStatus.BLOCKED) {
      throw new BadRequestException('Customer is not blocked');
    }

    await this.prisma.customer.update({
      where: { id },
      data: { status: CustomerStatus.ACTIVE },
    });

    await this.audit.record({
      action: 'customer.unblock',
      entityType: 'customer',
      entityId: id,
      summary: 'Unblocked',
      before: { status: CustomerStatus.BLOCKED },
      after: { status: CustomerStatus.ACTIVE },
    });

    this.logger.log(`Admin unblocked customer ${id}`);
    return { success: true as const };
  }

  // ---------------------------------------------------------------------------
  // Sessions
  // ---------------------------------------------------------------------------

  async sessions(id: string) {
    await this.mustExist(id);

    const [active, devices] = await Promise.all([
      this.prisma.refreshToken.findMany({
        where: { customerId: id, revokedAt: null, expiresAt: { gt: new Date() } },
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          deviceId: true,
          userAgent: true,
          ip: true,
          createdAt: true,
          expiresAt: true,
        },
      }),
      this.prisma.deviceToken.findMany({
        where: { customerId: id },
        orderBy: { lastSeenAt: 'desc' },
        select: { id: true, platform: true, deviceId: true, lastSeenAt: true },
      }),
    ]);

    return {
      // ⚠️ `tokenHash` kyarey bahar na jaay — enathi session hijack thai shake.
      sessions: active.map((s) => ({
        id: s.id,
        deviceId: s.deviceId,
        userAgent: s.userAgent,
        ip: s.ip,
        createdAt: s.createdAt.toISOString(),
        expiresAt: s.expiresAt.toISOString(),
      })),
      devices: devices.map((d) => ({
        id: d.id,
        platform: d.platform,
        deviceId: d.deviceId,
        lastSeenAt: d.lastSeenAt.toISOString(),
      })),
    };
  }

  async revokeSession(customerId: string, sessionId: string) {
    const { count } = await this.prisma.refreshToken.updateMany({
      where: { id: sessionId, customerId, revokedAt: null },
      data: { revokedAt: new Date() },
    });

    if (count === 0) {
      throw new NotFoundException('Session not found');
    }

    await this.audit.record({
      action: 'customer.session_revoke',
      entityType: 'customer',
      entityId: customerId,
      summary: `Revoked session ${sessionId}`,
    });

    return { success: true as const };
  }

  async logoutEverywhere(id: string) {
    await this.mustExist(id);
    const revokedSessions = await this.tokens.revokeAllForCustomer(id);

    await this.audit.record({
      action: 'customer.logout_all',
      entityType: 'customer',
      entityId: id,
      summary: `Logged out of ${revokedSessions} session(s)`,
    });

    return { success: true as const, revokedSessions };
  }

  // ---------------------------------------------------------------------------
  // Related data — badhu existing services thi j, nakal kari ne nahi
  // ---------------------------------------------------------------------------

  async orderHistory(id: string, opts: { limit: number; cursor?: string }) {
    await this.mustExist(id);
    // ⚠️ Aa Shopify sudhi jaay chhe (aapda DB ma orders nathi). Cursor-based
    // pagination pan etle j — Shopify page numbers aapto j nathi.
    return this.orders.list(id, opts);
  }

  async addresses(id: string) {
    await this.mustExist(id);

    const rows = await this.prisma.address.findMany({
      where: { customerId: id },
      orderBy: [{ isDefault: 'desc' }, { createdAt: 'asc' }],
    });

    return rows.map((a) => ({
      id: a.id,
      name: fullName(a),
      phone: a.phone,
      line1: a.line1,
      line2: a.line2,
      city: a.city,
      province: a.province,
      zip: a.zip,
      country: a.country,
      isDefault: a.isDefault,
      /** Null hoy to aa address haju Shopify sudhi nathi pahonchyu */
      shopifyAddressId: a.shopifyAddressId,
      syncedAt: a.syncedAt?.toISOString() ?? null,
      importedFromOrder: a.importedFromOrder,
      createdAt: a.createdAt.toISOString(),
    }));
  }

  async cartOf(id: string) {
    await this.mustExist(id);
    return this.cart.get(id);
  }

  async wishlistOf(id: string) {
    await this.mustExist(id);
    return this.wishlist.list(id);
  }

  async recentlyViewedOf(id: string) {
    await this.mustExist(id);
    return this.wishlist.listRecentlyViewed(id);
  }

  // ---------------------------------------------------------------------------
  // Export
  // ---------------------------------------------------------------------------

  /**
   * CSV export — panel na "Download" button mate.
   *
   * Cap 50k rows: aa thi motto export ek HTTP response ma na moklaay, e
   * background job nu kaam chhe.
   */
  async exportCsv(query: ListCustomersDto): Promise<string> {
    const rows = await this.prisma.customer.findMany({
      where: this.buildWhere(query),
      orderBy: this.buildOrderBy(query.sort),
      take: 50_000,
      include: { identities: { select: { type: true } } },
    });

    const header = [
      'id',
      'first_name',
      'last_name',
      'phone',
      'email',
      'gender',
      'status',
      'phone_verified',
      'email_verified',
      'shopify_customer_id',
      'last_login_at',
      'created_at',
    ];

    const lines = rows.map((r) =>
      [
        r.id,
        r.firstName,
        r.lastName,
        r.primaryPhone,
        r.primaryEmail,
        r.gender,
        r.status,
        r.identities.some((i) => i.type === 'PHONE'),
        r.identities.some((i) => i.type === 'EMAIL'),
        r.shopifyCustomerId,
        r.lastLoginAt?.toISOString() ?? '',
        r.createdAt.toISOString(),
      ]
        .map(csvCell)
        .join(','),
    );

    return [header.join(','), ...lines].join(CSV_NEWLINE);
  }

  // ---------------------------------------------------------------------------
  // Internals
  // ---------------------------------------------------------------------------

  private async mustExist(id: string) {
    const customer = await this.prisma.customer.findUnique({
      where: { id },
      select: { id: true, status: true },
    });

    if (!customer) {
      throw new NotFoundException('Customer not found');
    }

    return customer;
  }

  private buildWhere(query: ListCustomersDto): Prisma.CustomerWhereInput {
    const where: Prisma.CustomerWhereInput = {};

    if (query.status) where.status = query.status;

    if (query.linkedToShopify === 'true') {
      where.shopifyLinks = { some: {} };
    } else if (query.linkedToShopify === 'false') {
      where.shopifyLinks = { none: {} };
      where.shopifyCustomerId = null;
    }

    const search = query.search?.trim();
    if (search) {
      // Ek j box ma admin gme te naakhe chhe. UUID hoy to sidho id lookup,
      // baaki badha fields par `contains`.
      const or: Prisma.CustomerWhereInput[] = UUID_RE.test(search)
        ? [{ id: search }]
        : [
            { primaryPhone: { contains: search } },
            { primaryEmail: { contains: search, mode: 'insensitive' } },
            { firstName: { contains: search, mode: 'insensitive' } },
            { lastName: { contains: search, mode: 'insensitive' } },
            { shopifyCustomerId: search },
            { shopifyLinks: { some: { shopifyCustomerId: search } } },
          ];

      // `AND` ma mukiye chhiye, `OR` ma nahi — nahi to upar no status/link
      // filter aa OR sathe bhegayi ne nakamo thai jaay.
      where.AND = [{ OR: or }];
    }

    return where;
  }

  private buildOrderBy(
    sort: ListCustomersDto['sort'],
  ): Prisma.CustomerOrderByWithRelationInput {
    switch (sort) {
      case 'oldest':
        return { createdAt: 'asc' };
      case 'lastLogin':
        // Kyarey login j nathi karyu eva records chhelle — nahi to page 1
        // aakhu null thi bharai jaay chhe.
        return { lastLoginAt: { sort: 'desc', nulls: 'last' } };
      case 'name':
        return { firstName: { sort: 'asc', nulls: 'last' } };
      case 'newest':
      default:
        return { createdAt: 'desc' };
    }
  }

  /**
   * ⚠️ Aa rakam FAKT panel ma dekhaadva mate chhe.
   *
   * Cart lines ma add karti vakhte no bhaav saachvelo chhe (juo schema).
   * Asli rakam Shopify checkout ganse — etle aa ne "cart value" j kehvu,
   * "order value" kyarey nahi.
   */
  private cartSnapshot(
    cart:
      | {
          updatedAt: Date;
          discountCode: string | null;
          items: Array<{
            quantity: number;
            priceAmount: string;
            priceCurrency: string;
          }>;
        }
      | null
      | undefined,
  ) {
    if (!cart || cart.items.length === 0) return null;

    const currency = cart.items[0].priceCurrency;
    const minor = cart.items.reduce(
      (sum, i) => sum + toMinor(i.priceAmount, i.priceCurrency) * i.quantity,
      0,
    );

    return {
      itemCount: cart.items.reduce((sum, i) => sum + i.quantity, 0),
      lineCount: cart.items.length,
      estimatedValue: {
        amount: fromMinor(minor, currency),
        currencyCode: currency,
      },
      discountCode: cart.discountCode,
      updatedAt: cart.updatedAt.toISOString(),
    };
  }
}

/** Excel CRLF ne j saacho maane chhe */
const CSV_NEWLINE = '\r\n';

/** RFC 4180 — badhu quote karo, ane andar na quotes double karo */
function csvCell(value: unknown): string {
  if (value === null || value === undefined) return '';
  const text = String(value);
  return `"${text.replace(/"/g, '""')}"`;
}
