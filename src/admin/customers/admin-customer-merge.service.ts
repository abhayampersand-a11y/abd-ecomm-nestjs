import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { CustomerStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AdminAuditService } from '../audit/admin-audit.service';
import type { MergeCustomersDto } from '../dto/merge-customers.dto';

type Tx = Prisma.TransactionClient;

export interface MergePlanDto {
  dryRun: boolean;
  source: { id: string; phone: string | null; email: string | null };
  target: { id: string; phone: string | null; email: string | null };
  moved: {
    identities: number;
    shopifyLinks: number;
    addresses: number;
    wishlist: number;
    recentlyViewed: number;
    devices: number;
    cartItems: number;
  };
  /** Target par pehla thi hatu etle chhoodi didhu */
  skippedDuplicates: {
    addresses: number;
    wishlist: number;
    recentlyViewed: number;
  };
  revokedSessions: number;
}

/**
 * Be Customer records ne ek karvu.
 *
 * Aavu kem thay chhe: ek j vyakti e ek vaar phone thi login karyu ane ek vaar
 * guest checkout email thi kharidyu — Shopify import banne ne alag records
 * tarike laavyu. Users ne aa "mara juna orders kyaa gaya?" tarike dekhaay chhe.
 *
 * ⚠️ NIYAM: source record DELETE kyarey nathi thato.
 *
 * Orders, audit trail ane `mergedIntoId` ni chain ene jodayela chhe. Ene
 * MERGED karva thi login pan tootatu nathi — `IdentityService` chain vaanchi
 * ne target sudhi pahonchi jaay chhe (juo `resolveMergeChain`). Etle source
 * na `primaryPhone`/`primaryEmail` pan jem chhe tem rehva daiye chhiye:
 * juna raste aavelo login pan saachi jagya e pahonche chhe.
 */
@Injectable()
export class AdminCustomerMergeService {
  private readonly logger = new Logger(AdminCustomerMergeService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AdminAuditService,
  ) {}

  async merge(dto: MergeCustomersDto): Promise<MergePlanDto> {
    const { sourceCustomerId, targetCustomerId, dryRun = false } = dto;

    if (sourceCustomerId === targetCustomerId) {
      throw new BadRequestException(
        'Source and target must be two different customers',
      );
    }

    const [source, target] = await Promise.all([
      this.prisma.customer.findUnique({ where: { id: sourceCustomerId } }),
      this.prisma.customer.findUnique({ where: { id: targetCustomerId } }),
    ]);

    if (!source) throw new NotFoundException('Source customer not found');
    if (!target) throw new NotFoundException('Target customer not found');

    if (source.status === CustomerStatus.MERGED) {
      throw new BadRequestException(
        'Source customer has already been merged into another account',
      );
    }

    if (target.status === CustomerStatus.MERGED) {
      throw new BadRequestException(
        'Target customer has already been merged into another account. Merge into that account instead.',
      );
    }

    if (target.status === CustomerStatus.BLOCKED) {
      throw new BadRequestException(
        'Target customer is blocked. Unblock it before merging.',
      );
    }

    if (dryRun) {
      return this.plan(source, target);
    }

    const result = await this.prisma.$transaction(
      (tx) => this.execute(tx, source, target),
      // Ghana nana writes chhe; default 5s tang padi shake chhe jyare
      // customer pase 50 addresses ane 200 wishlist items hoy.
      { timeout: 20_000 },
    );

    await this.audit.record({
      action: 'customer.merge',
      entityType: 'customer',
      entityId: target.id,
      summary: `Merged customer ${source.id} into ${target.id}`,
      before: { sourceId: source.id, sourcePhone: source.primaryPhone },
      after: result,
    });

    this.logger.warn(
      `Admin merged customer ${source.id} into ${target.id} — ` +
        `${result.moved.identities} identity, ${result.moved.shopifyLinks} shopify link, ` +
        `${result.moved.addresses} address, ${result.moved.cartItems} cart item(s) moved`,
    );

    return result;
  }

  // ---------------------------------------------------------------------------

  /** Kai j lakhya vagar "su-su khasse" e batave chhe (dryRun) */
  private async plan(
    source: { id: string; primaryPhone: string | null; primaryEmail: string | null },
    target: { id: string; primaryPhone: string | null; primaryEmail: string | null },
  ): Promise<MergePlanDto> {
    const [
      identities,
      shopifyLinks,
      addresses,
      wishlist,
      recentlyViewed,
      devices,
      sessions,
      cart,
    ] = await Promise.all([
      this.prisma.customerIdentity.count({ where: { customerId: source.id } }),
      this.prisma.shopifyCustomerLink.count({ where: { customerId: source.id } }),
      this.prisma.address.count({ where: { customerId: source.id } }),
      this.prisma.wishlistItem.count({ where: { customerId: source.id } }),
      this.prisma.recentlyViewed.count({ where: { customerId: source.id } }),
      this.prisma.deviceToken.count({ where: { customerId: source.id } }),
      this.prisma.refreshToken.count({
        where: { customerId: source.id, revokedAt: null },
      }),
      this.prisma.cart.findUnique({
        where: { customerId: source.id },
        select: { _count: { select: { items: true } } },
      }),
    ]);

    return {
      dryRun: true,
      source: {
        id: source.id,
        phone: source.primaryPhone,
        email: source.primaryEmail,
      },
      target: {
        id: target.id,
        phone: target.primaryPhone,
        email: target.primaryEmail,
      },
      moved: {
        identities,
        shopifyLinks,
        addresses,
        wishlist,
        recentlyViewed,
        devices,
        cartItems: cart?._count.items ?? 0,
      },
      // Duplicates dryRun ma nathi ganta — e ganvа mate banne baaju na badha
      // fingerprints kaadhvа pade, ane e dryRun ne kharekhar na merge jetlo
      // mongho banaavi de. Asli aankdo merge pachhi male chhe.
      skippedDuplicates: { addresses: 0, wishlist: 0, recentlyViewed: 0 },
      revokedSessions: sessions,
    };
  }

  private async execute(
    tx: Tx,
    source: {
      id: string;
      primaryPhone: string | null;
      primaryEmail: string | null;
      shopifyCustomerId: string | null;
    },
    target: {
      id: string;
      primaryPhone: string | null;
      primaryEmail: string | null;
      shopifyCustomerId: string | null;
    },
  ): Promise<MergePlanDto> {
    // 1) Verified identities — (type, value) globally unique chhe, etle ek j
    //    value be customers par hoi j na shake. Conflict no sawaal nathi.
    const identities = await tx.customerIdentity.updateMany({
      where: { customerId: source.id },
      data: { customerId: target.id },
    });

    // 2) Shopify links — `shopifyCustomerId` pan globally unique chhe.
    const shopifyLinks = await tx.shopifyCustomerLink.updateMany({
      where: { customerId: source.id },
      data: { customerId: target.id },
    });

    // 3) Source no primary Shopify record. Order history aa id par ubhi chhe,
    //    etle e kyaay khovai na jaay: pehla link banaviye, pachhi j khasedie.
    if (source.shopifyCustomerId) {
      await tx.shopifyCustomerLink.upsert({
        where: { shopifyCustomerId: source.shopifyCustomerId },
        create: {
          customerId: target.id,
          shopifyCustomerId: source.shopifyCustomerId,
          matchedVia: 'manual',
          matchedValue: `merged from customer ${source.id}`,
        },
        update: { customerId: target.id },
      });

      if (!target.shopifyCustomerId) {
        // `shopifyCustomerId` unique chhe — pehla source parthi chhoodavvu pade
        await tx.customer.update({
          where: { id: source.id },
          data: { shopifyCustomerId: null },
        });
        await tx.customer.update({
          where: { id: target.id },
          data: { shopifyCustomerId: source.shopifyCustomerId },
        });
      }
    }

    // 4) Addresses — `@@unique([customerId, fingerprint])`. Target par e j
    //    address pehla thi hoy to source vaalu kaadhi naakhiye chhiye, nahi to
    //    grahak ne ek j ghar be vaar dekhaay.
    //
    //    Default address: target pase pehla thi addresses hoy to eno potano
    //    default j saacho chhe, etle aavta addresses par `isDefault` chhoodavi
    //    daiye chhiye (be defaults na rahi shake). Pan target pase ek pan
    //    address na hoy to e flag saachvi rakhvo — nahi to merge pachhi
    //    grahak nu default address gum thai jaay ane checkout khali dekhaay.
    const targetHasAddress = await tx.address.count({
      where: { customerId: target.id },
    });

    const addresses = await this.moveWithDedupe(tx, {
      source: source.id,
      target: target.id,
      readKeys: async (customerId) =>
        (
          await tx.address.findMany({
            where: { customerId },
            select: { id: true, fingerprint: true },
          })
        ).map((r) => ({ id: r.id, key: r.fingerprint })),
      move: (ids) =>
        tx.address.updateMany({
          where: { id: { in: ids } },
          data: targetHasAddress > 0
            ? { customerId: target.id, isDefault: false }
            : { customerId: target.id },
        }),
      drop: (ids) => tx.address.deleteMany({ where: { id: { in: ids } } }),
    });

    // 5) Wishlist — `@@unique([customerId, productHandle])`
    const wishlist = await this.moveWithDedupe(tx, {
      source: source.id,
      target: target.id,
      readKeys: async (customerId) =>
        (
          await tx.wishlistItem.findMany({
            where: { customerId },
            select: { id: true, productHandle: true },
          })
        ).map((r) => ({ id: r.id, key: r.productHandle })),
      move: (ids) =>
        tx.wishlistItem.updateMany({
          where: { id: { in: ids } },
          data: { customerId: target.id },
        }),
      drop: (ids) => tx.wishlistItem.deleteMany({ where: { id: { in: ids } } }),
    });

    // 6) Recently viewed — e j niyam
    const recentlyViewed = await this.moveWithDedupe(tx, {
      source: source.id,
      target: target.id,
      readKeys: async (customerId) =>
        (
          await tx.recentlyViewed.findMany({
            where: { customerId },
            select: { id: true, productHandle: true },
          })
        ).map((r) => ({ id: r.id, key: r.productHandle })),
      move: (ids) =>
        tx.recentlyViewed.updateMany({
          where: { id: { in: ids } },
          data: { customerId: target.id },
        }),
      drop: (ids) => tx.recentlyViewed.deleteMany({ where: { id: { in: ids } } }),
    });

    // 7) Push tokens — `token` globally unique chhe, conflict nathi
    const devices = await tx.deviceToken.updateMany({
      where: { customerId: source.id },
      data: { customerId: target.id },
    });

    // 8) OTP records — audit trail saathe rahe
    await tx.otpCode.updateMany({
      where: { customerId: source.id },
      data: { customerId: target.id },
    });

    // 9) Cart. Source ni sessions to have marvani j chhe, etle enu cart pan
    //    tya nakamu chhe — items target ma bhegi kari daiye chhiye.
    const cartItems = await this.mergeCarts(tx, source.id, target.id);

    // 10) Source ni sessions band. Aa record have login mate nathi — token
    //     jinva rahe to e MERGED record tarike API vaparto rahe chhe.
    const { count: revokedSessions } = await tx.refreshToken.updateMany({
      where: { customerId: source.id, revokedAt: null },
      data: { revokedAt: new Date() },
    });

    // 11) Chhelle j — ahiya thi source "duplicate" tarike nishaanit thay chhe
    await tx.customer.update({
      where: { id: source.id },
      data: { status: CustomerStatus.MERGED, mergedIntoId: target.id },
    });

    return {
      dryRun: false,
      source: {
        id: source.id,
        phone: source.primaryPhone,
        email: source.primaryEmail,
      },
      target: {
        id: target.id,
        phone: target.primaryPhone,
        email: target.primaryEmail,
      },
      moved: {
        identities: identities.count,
        shopifyLinks: shopifyLinks.count,
        addresses: addresses.moved,
        wishlist: wishlist.moved,
        recentlyViewed: recentlyViewed.moved,
        devices: devices.count,
        cartItems,
      },
      skippedDuplicates: {
        addresses: addresses.dropped,
        wishlist: wishlist.dropped,
        recentlyViewed: recentlyViewed.dropped,
      },
      revokedSessions,
    };
  }

  /**
   * "Khasedo, pan jya taakraay tya kaadhi naakho."
   *
   * Tran tables ne ek j samasya chhe — badha par `@@unique([customerId, X])`
   * chhe — etle logic ek j jagya e rakhyo chhe. Naakhi ne update karso to
   * P2002 aavse ane aakhu merge rollback thai jashe.
   */
  private async moveWithDedupe(
    tx: Tx,
    opts: {
      source: string;
      target: string;
      readKeys: (customerId: string) => Promise<Array<{ id: string; key: string }>>;
      move: (ids: string[]) => Promise<{ count: number }>;
      drop: (ids: string[]) => Promise<{ count: number }>;
    },
  ): Promise<{ moved: number; dropped: number }> {
    const [sourceRows, targetRows] = await Promise.all([
      opts.readKeys(opts.source),
      opts.readKeys(opts.target),
    ]);

    if (sourceRows.length === 0) return { moved: 0, dropped: 0 };

    const taken = new Set(targetRows.map((r) => r.key));

    const toMove: string[] = [];
    const toDrop: string[] = [];

    for (const row of sourceRows) {
      if (taken.has(row.key)) {
        toDrop.push(row.id);
      } else {
        // Source ni ander pan duplicate hoi shake nahi (e j unique constraint),
        // pan `taken` ma ummeri daiye chhiye jethi logic ek j disha ma chale.
        taken.add(row.key);
        toMove.push(row.id);
      }
    }

    const moved = toMove.length ? (await opts.move(toMove)).count : 0;
    const dropped = toDrop.length ? (await opts.drop(toDrop)).count : 0;

    return { moved, dropped };
  }

  /**
   * Source no cart target ma bhelvo.
   *
   * Target pase cart j na hoy to aakho cart khasedi daiye chhiye (Cart.customerId
   * unique chhe, etle "move" j saachu chhe). Banne pase cart hoy to lines
   * bhegi kariye — e j variant hoy to quantity vadhe.
   */
  private async mergeCarts(
    tx: Tx,
    sourceId: string,
    targetId: string,
  ): Promise<number> {
    const sourceCart = await tx.cart.findUnique({
      where: { customerId: sourceId },
      include: { items: true },
    });

    if (!sourceCart || sourceCart.items.length === 0) {
      if (sourceCart) await tx.cart.delete({ where: { id: sourceCart.id } });
      return 0;
    }

    const targetCart = await tx.cart.findUnique({
      where: { customerId: targetId },
      select: { id: true },
    });

    if (!targetCart) {
      await tx.cart.update({
        where: { id: sourceCart.id },
        data: { customerId: targetId },
      });
      return sourceCart.items.length;
    }

    for (const item of sourceCart.items) {
      await tx.cartItem.upsert({
        where: {
          cartId_variantId: {
            cartId: targetCart.id,
            variantId: item.variantId,
          },
        },
        create: {
          cartId: targetCart.id,
          variantId: item.variantId,
          productHandle: item.productHandle,
          quantity: item.quantity,
          title: item.title,
          variantTitle: item.variantTitle,
          imageUrl: item.imageUrl,
          priceAmount: item.priceAmount,
          priceCurrency: item.priceCurrency,
        },
        update: { quantity: { increment: item.quantity } },
      });
    }

    // Items cascade thi jashe
    await tx.cart.delete({ where: { id: sourceCart.id } });

    return sourceCart.items.length;
  }
}
