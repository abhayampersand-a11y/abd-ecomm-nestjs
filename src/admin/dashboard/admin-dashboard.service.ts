import { Injectable } from '@nestjs/common';
import { CustomerStatus } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

export interface DailyCountRow {
  day: Date;
  count: number;
}

export interface CartValueRow {
  currency: string;
  amount: string;
}

/**
 * Panel na home screen na aankda.
 *
 * ⚠️ Ahiya na koi pan aankda ma ORDERS nathi — e Shopify ma chhe, aapda DB ma
 * nathi. Revenue/orders na graph mate Shopify admin j saachu sthaan chhe;
 * ahiya batavva jaishu to be jagya e be alag aankda dekhaashe ane koi ek par
 * bharoso nahi rahe.
 *
 * Aa panel e batave chhe je Shopify NATHI janto: app na users, enu cart,
 * wishlist, sessions ane OTP ni tabiyat.
 */
@Injectable()
export class AdminDashboardService {
  constructor(private readonly prisma: PrismaService) {}

  async summary() {
    const now = new Date();
    const dayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const monthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

    const [
      totalCustomers,
      activeCustomers,
      importedCustomers,
      blockedCustomers,
      mergedCustomers,
      newLast24h,
      newLast7d,
      newLast30d,
      loggedInLast7d,
      activeSessions,
      totalCarts,
      cartsWithItems,
      abandonedCarts,
      wishlistItems,
      recentlyViewedItems,
      addresses,
      addressesPendingSync,
      devices,
      otpIssued24h,
      otpConsumed24h,
    ] = await this.prisma.$transaction([
      this.prisma.customer.count(),
      this.prisma.customer.count({ where: { status: CustomerStatus.ACTIVE } }),
      this.prisma.customer.count({ where: { status: CustomerStatus.IMPORTED } }),
      this.prisma.customer.count({ where: { status: CustomerStatus.BLOCKED } }),
      this.prisma.customer.count({ where: { status: CustomerStatus.MERGED } }),
      this.prisma.customer.count({ where: { createdAt: { gte: dayAgo } } }),
      this.prisma.customer.count({ where: { createdAt: { gte: weekAgo } } }),
      this.prisma.customer.count({ where: { createdAt: { gte: monthAgo } } }),
      this.prisma.customer.count({ where: { lastLoginAt: { gte: weekAgo } } }),
      this.prisma.refreshToken.count({
        where: { revokedAt: null, expiresAt: { gt: now } },
      }),
      this.prisma.cart.count(),
      this.prisma.cart.count({ where: { items: { some: {} } } }),
      // "Abandoned" = ander maal chhe pan 24 kalak thi koi e hath nathi
      // lagaadyo. ⚠️ Aa ma e pan aavi jashe jene atyar j order kari didho —
      // order aapda DB ma nathi, etle e khabar padvani rit nathi. Sales ne aa
      // list aapo tya pehla Shopify ma ek najar naakhvi.
      this.prisma.cart.count({
        where: { items: { some: {} }, updatedAt: { lt: dayAgo } },
      }),
      this.prisma.wishlistItem.count(),
      this.prisma.recentlyViewed.count(),
      this.prisma.address.count(),
      this.prisma.address.count({ where: { shopifyAddressId: null } }),
      this.prisma.deviceToken.count(),
      this.prisma.otpCode.count({ where: { createdAt: { gte: dayAgo } } }),
      this.prisma.otpCode.count({
        where: { createdAt: { gte: dayAgo }, consumedAt: { not: null } },
      }),
    ]);

    const cartValue = await this.cartValueByCurrency();

    return {
      generatedAt: now.toISOString(),

      customers: {
        total: totalCustomers,
        active: activeCustomers,
        imported: importedCustomers,
        blocked: blockedCustomers,
        merged: mergedCustomers,
        newLast24h,
        newLast7d,
        newLast30d,
        loggedInLast7d,
      },

      sessions: {
        active: activeSessions,
        pushDevices: devices,
      },

      carts: {
        total: totalCarts,
        withItems: cartsWithItems,
        abandonedOver24h: abandonedCarts,
        /** ⚠️ Fakt lines no saravalo — shipping/tax/discount ma nathi */
        estimatedValue: cartValue,
      },

      engagement: {
        wishlistItems,
        recentlyViewedItems,
        savedAddresses: addresses,
        addressesPendingShopifySync: addressesPendingSync,
      },

      otpLast24h: {
        issued: otpIssued24h,
        // "Consumed" ma safal verify ane "attempts kharchai gaya" — banne
        // halato aave chhe. Juo OtpService.verify().
        consumed: otpConsumed24h,
        pendingOrExpired: otpIssued24h - otpConsumed24h,
      },
    };
  }

  /**
   * Roj-baroj na signups — panel no line chart.
   *
   * `date_trunc` UTC ma chale chhe. Store India ma chhe, etle raat na 11 vagya
   * pachhi na signups "aavti kaal" ma dekhaashe. Aa jaan-bujhi ne chhe: server,
   * DB ane baaki badha aankda pan UTC ma j chhe — ek jagya e IST karvathi
   * baaki badhu vachche-vachche khota padashe.
   */
  async signups(days: number) {
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

    const rows = await this.prisma.$queryRaw<DailyCountRow[]>`
      SELECT date_trunc('day', "createdAt") AS day, COUNT(*)::int AS count
      FROM customers
      WHERE "createdAt" >= ${since}
      GROUP BY 1
      ORDER BY 1
    `;

    return { days, series: this.fillMissingDays(rows, days) };
  }

  /**
   * Kaya products ne sauthi vadhu wishlist / view / cart male chhe.
   *
   * Ahiya fakt handles ane counts aave chhe — title ane image Shopify ma chhe.
   * Panel ne list saathe naam batavvu hoy to `/admin/products` thi levu.
   */
  async topProducts(limit: number) {
    const [wishlisted, viewed, inCarts] = await Promise.all([
      this.prisma.wishlistItem.groupBy({
        by: ['productHandle'],
        _count: { productHandle: true },
        orderBy: { _count: { productHandle: 'desc' } },
        take: limit,
      }),
      this.prisma.recentlyViewed.groupBy({
        by: ['productHandle'],
        _count: { productHandle: true },
        orderBy: { _count: { productHandle: 'desc' } },
        take: limit,
      }),
      this.prisma.cartItem.groupBy({
        by: ['productHandle'],
        _sum: { quantity: true },
        orderBy: { _sum: { quantity: 'desc' } },
        take: limit,
      }),
    ]);

    return {
      mostWishlisted: wishlisted.map((r) => ({
        productHandle: r.productHandle,
        count: r._count.productHandle,
      })),
      mostViewed: viewed.map((r) => ({
        productHandle: r.productHandle,
        count: r._count.productHandle,
      })),
      mostInCarts: inCarts.map((r) => ({
        productHandle: r.productHandle,
        quantity: r._sum.quantity ?? 0,
      })),
    };
  }

  // ---------------------------------------------------------------------------

  /**
   * `priceAmount` DB ma string chhe (paisa float ma kyarey na ganvo), etle
   * saravalo SQL ma `numeric` ma kariye chhiye ane string tarike j pacho
   * laviye chhiye. Currency pramane group — multi-currency store ma badhu
   * bhegu karvu khotu chhe.
   */
  private async cartValueByCurrency(): Promise<CartValueRow[]> {
    return this.prisma.$queryRaw<CartValueRow[]>`
      SELECT "priceCurrency" AS currency,
             SUM(quantity * "priceAmount"::numeric)::text AS amount
      FROM cart_items
      GROUP BY 1
      ORDER BY 1
    `;
  }

  /** Jya koi signup na thayo hoy e divas pan chart ma joiye — 0 sathe */
  private fillMissingDays(rows: DailyCountRow[], days: number) {
    const byDay = new Map(
      rows.map((r) => [new Date(r.day).toISOString().slice(0, 10), r.count]),
    );

    const series: Array<{ date: string; count: number }> = [];
    const today = new Date();

    for (let i = days - 1; i >= 0; i -= 1) {
      const d = new Date(today.getTime() - i * 24 * 60 * 60 * 1000);
      const key = d.toISOString().slice(0, 10);
      series.push({ date: key, count: byDay.get(key) ?? 0 });
    }

    return series;
  }
}
