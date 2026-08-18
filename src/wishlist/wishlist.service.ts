import { Injectable, Logger } from '@nestjs/common';
import type { ProductSummaryDto } from '../common/dto/product.dto';
import { PrismaService } from '../prisma/prisma.service';
import { ProductsService } from '../products/products.service';

/**
 * Wishlist ane "recently viewed" — banne AAPDA chhe.
 *
 * Shopify ma aa concept j nathi (na customer par wishlist, na browsing
 * history). Etle aa Phase 2 ma pan aapda DB ma j rahese — migration no koi
 * sawaal j nathi.
 *
 * Aapne fakt `productHandle` saachviye chhiye, aakhu product nahi. Kem: bhaav
 * ane stock badlaata rahe chhe, ane wishlist ma juno bhaav dekhaadvo e
 * grahak sathe anyaay chhe. Vaanchvani vakhte j taaju product laviye chhiye.
 */
@Injectable()
export class WishlistService {
  private readonly logger = new Logger(WishlistService.name);

  /** Recently viewed ma aatha thi vadhu na raakhvu */
  private static readonly RECENT_LIMIT = 20;

  constructor(
    private readonly prisma: PrismaService,
    private readonly products: ProductsService,
  ) {}

  // -------------------------------------------------------------------------
  // Wishlist — screens 24, 26
  // -------------------------------------------------------------------------

  async list(customerId: string): Promise<ProductSummaryDto[]> {
    const rows = await this.prisma.wishlistItem.findMany({
      where: { customerId },
      orderBy: { createdAt: 'desc' },
      select: { productHandle: true },
    });

    return this.loadProducts(rows.map((r) => r.productHandle));
  }

  async add(customerId: string, productHandle: string): Promise<{ added: boolean }> {
    // Pehla thi hoy to chup-chaap chhodi do — user e be vaar heart dabaavyu
    // hoy to error batavvo vyarth chhe.
    const existing = await this.prisma.wishlistItem.findUnique({
      where: { customerId_productHandle: { customerId, productHandle } },
      select: { id: true },
    });

    if (existing) return { added: false };

    await this.prisma.wishlistItem.create({
      data: { customerId, productHandle },
    });

    return { added: true };
  }

  async remove(
    customerId: string,
    productHandle: string,
  ): Promise<{ removed: boolean }> {
    const { count } = await this.prisma.wishlistItem.deleteMany({
      where: { customerId, productHandle },
    });

    // Nahi hoy to pan 404 nahi — "wishlist ma nathi" e j to joitu hatu.
    return { removed: count > 0 };
  }

  // -------------------------------------------------------------------------
  // Recently viewed — screen 26
  // -------------------------------------------------------------------------

  async listRecentlyViewed(customerId: string): Promise<ProductSummaryDto[]> {
    const rows = await this.prisma.recentlyViewed.findMany({
      where: { customerId },
      orderBy: { viewedAt: 'desc' },
      take: WishlistService.RECENT_LIMIT,
      select: { productHandle: true },
    });

    return this.loadProducts(rows.map((r) => r.productHandle));
  }

  async recordView(customerId: string, productHandle: string): Promise<void> {
    // Fari joyu to navi row nahi — `viewedAt` j aagal vadhe chhe, jethi e
    // list ma upar aave. Aa vagar ek j product 50 vaar list ma dekhaay.
    await this.prisma.recentlyViewed.upsert({
      where: { customerId_productHandle: { customerId, productHandle } },
      create: { customerId, productHandle },
      update: { viewedAt: new Date() },
    });

    await this.trimRecentlyViewed(customerId);
  }

  // -------------------------------------------------------------------------

  /**
   * Handles parthi products laavo.
   *
   * ⚠️ Product delete thai gayu hoy (ke draft thai gayu hoy) to `findOne`
   * throw kare chhe. Evi ek entry aakhi wishlist ne fail na karvi joiye —
   * etle e chup-chaap chhodi daiye chhiye.
   *
   * ProductsService Redis-cached chhe, etle aa saamanya rite Shopify sudhi
   * jatu nathi. Product mirror (Phase 2) aavse tyare aa ek j SQL query
   * banaavi devi — tyare aa method j badalvani chhe, baaki kai nahi.
   */
  private async loadProducts(handles: string[]): Promise<ProductSummaryDto[]> {
    if (handles.length === 0) return [];

    const results = await Promise.all(
      handles.map(async (handle) => {
        try {
          return await this.products.findOne(handle);
        } catch {
          this.logger.debug(`Wishlist/recent ma product ${handle} have nathi`);
          return null;
        }
      }),
    );

    return results.filter((p): p is NonNullable<typeof p> => p !== null);
  }

  /** Limit thi vadhu thay to sauthi juna kaadhi naakho */
  private async trimRecentlyViewed(customerId: string): Promise<void> {
    const extras = await this.prisma.recentlyViewed.findMany({
      where: { customerId },
      orderBy: { viewedAt: 'desc' },
      skip: WishlistService.RECENT_LIMIT,
      select: { id: true },
    });

    if (extras.length === 0) return;

    await this.prisma.recentlyViewed.deleteMany({
      where: { id: { in: extras.map((e) => e.id) } },
    });
  }
}
