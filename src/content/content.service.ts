import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { HomeSectionType, Prisma } from '@prisma/client';
import { CollectionsService } from '../collections/collections.service';
import type { CollectionSummaryDto } from '../common/dto/collection.dto';
import type { ProductSummaryDto } from '../common/dto/product.dto';
import type { Env } from '../config/env.schema';
import { PrismaService } from '../prisma/prisma.service';
import { ProductsService } from '../products/products.service';
import { RedisService } from '../redis/redis.service';
import type {
  AppCouponDto,
  BannerDto,
  FaqDto,
  HomeSectionDto,
  PageDetailDto,
  PageSummaryDto,
} from './content.dto';

/**
 * App nu content — banners, home layout, pages, FAQ, coupons.
 *
 * Aa aakhi service **read-only** chhe. Lakhvanu kaam admin ni baaju
 * (`AdminContentService`) ma chhe, ane e lakhe etle `invalidate()` call kare
 * chhe. Aa vahenchani jaan-bujhi ne chhe: aa file public internet ne dekhaay
 * chhe, ane ahiya ek pan write method na hovathi "bhulthi public write" jevi
 * bhool shakya j nathi.
 */
@Injectable()
export class ContentService {
  private readonly logger = new Logger(ContentService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly products: ProductsService,
    private readonly collections: CollectionsService,
    private readonly config: ConfigService<Env, true>,
  ) {}

  /**
   * Aakhu home screen — EK j call ma.
   *
   * Sections + enu content (banners, products, collections) badhu bharelu
   * aave chhe. App ne 6 alag calls na karvi pade, ane sauthi agatyanu:
   * layout badalvo hoy to app release ni raah na jovi pade.
   */
  async home(): Promise<{ sections: HomeSectionDto[] }> {
    const key = 'content:home';
    const cached = await this.redis.getJson<{ sections: HomeSectionDto[] }>(key);
    if (cached) return cached;

    const rows = await this.prisma.homeSection.findMany({
      where: this.liveWindow(),
      orderBy: [{ position: 'asc' }, { createdAt: 'asc' }],
    });

    const sections: HomeSectionDto[] = [];

    for (const row of rows) {
      // ⚠️ Ek section bhaange to AAKHU home screen na bhaangvu joiye.
      //
      // Section ma je collection handle lakhyu hoy e Shopify ma delete thai
      // gayu hoy — evu thashe j, karan ke aa be alag system chhe. Tyare
      // grahak ne khali screen batavvi e sauthi kharaab javaab chhe. Etle
      // e section chhoodi ne aagal vadhiye chhiye ane log ma nishaani mukiye.
      try {
        sections.push(await this.resolveSection(row));
      } catch (err) {
        this.logger.warn(
          `Home section ${row.id} (${row.type}) skip karyu: ${(err as Error).message}`,
        );
      }
    }

    const result = { sections };
    await this.redis.setJson(key, result, this.ttl());
    return result;
  }

  async banners(placement: string): Promise<BannerDto[]> {
    const key = `content:banners:${placement}`;
    const cached = await this.redis.getJson<BannerDto[]>(key);
    if (cached) return cached;

    const rows = await this.prisma.banner.findMany({
      where: { placement, ...this.liveWindow() },
      orderBy: [{ position: 'asc' }, { createdAt: 'asc' }],
    });

    const result = rows.map(toBannerDto);
    await this.redis.setJson(key, result, this.ttl());
    return result;
  }

  async pages(): Promise<PageSummaryDto[]> {
    const rows = await this.prisma.page.findMany({
      where: { isPublished: true },
      orderBy: { title: 'asc' },
      select: { slug: true, title: true, updatedAt: true },
    });

    return rows.map((p) => ({
      slug: p.slug,
      title: p.title,
      updatedAt: p.updatedAt.toISOString(),
    }));
  }

  async page(slug: string): Promise<PageDetailDto> {
    const key = `content:page:${slug}`;
    const cached = await this.redis.getJson<PageDetailDto>(key);
    if (cached) return cached;

    const row = await this.prisma.page.findUnique({ where: { slug } });

    // Draft page public ne "exists but hidden" jevu pan na dekhaadvu —
    // 404 j saacho javaab chhe.
    if (!row || !row.isPublished) {
      throw new NotFoundException('Page not found');
    }

    const result: PageDetailDto = {
      slug: row.slug,
      title: row.title,
      body: row.body,
      updatedAt: row.updatedAt.toISOString(),
    };

    await this.redis.setJson(key, result, this.ttl());
    return result;
  }

  async faqs(): Promise<FaqDto[]> {
    const key = 'content:faqs';
    const cached = await this.redis.getJson<FaqDto[]>(key);
    if (cached) return cached;

    const rows = await this.prisma.faq.findMany({
      where: { isActive: true },
      orderBy: [{ position: 'asc' }, { createdAt: 'asc' }],
    });

    const result = rows.map((f) => ({
      id: f.id,
      question: f.question,
      answer: f.answer,
      category: f.category,
    }));

    await this.redis.setJson(key, result, this.ttl());
    return result;
  }

  /**
   * "Available offers" ni list.
   *
   * ⚠️ Aa codes VALID chhe evi koi khaatri nathi — validate fakt Shopify
   * checkout kare chhe. Ahiya to fakt "grahak ne su batavvu" nu list chhe.
   */
  async coupons(): Promise<AppCouponDto[]> {
    const key = 'content:coupons';
    const cached = await this.redis.getJson<AppCouponDto[]>(key);
    if (cached) return cached;

    const rows = await this.prisma.appCoupon.findMany({
      where: this.liveWindow(),
      orderBy: [{ position: 'asc' }, { createdAt: 'asc' }],
    });

    const result = rows.map((c) => ({
      id: c.id,
      code: c.code,
      title: c.title,
      description: c.description,
      imageUrl: c.imageUrl,
      terms: c.terms,
      endsAt: c.endsAt?.toISOString() ?? null,
    }));

    await this.redis.setJson(key, result, this.ttl());
    return result;
  }

  /** Admin kai badle etle turat — TTL ni raah na jovi pade */
  async invalidate(): Promise<void> {
    const cleared = await this.redis.delByPattern('content:*');
    this.logger.log(`Content cache invalidated (${cleared} entries)`);
  }

  // ---------------------------------------------------------------------------

  /**
   * Section na `type` pramane enu content bhare chhe.
   *
   * Home ma ketla products aave e `itemLimit` nakki kare chhe — ane e nano j
   * rakhvo. Home screen e catalog nathi; 60 products laavva etle Shopify no
   * cost bucket ek j screen ma khaali karvo.
   */
  private async resolveSection(row: {
    id: string;
    type: HomeSectionType;
    title: string | null;
    subtitle: string | null;
    reference: string | null;
    productHandles: string[];
    itemLimit: number;
  }): Promise<HomeSectionDto> {
    const base: HomeSectionDto = {
      id: row.id,
      type: row.type,
      title: row.title,
      subtitle: row.subtitle,
      reference: row.reference,
      banners: [],
      products: [],
      collections: [],
    };

    switch (row.type) {
      case HomeSectionType.BANNER_CAROUSEL:
        return {
          ...base,
          banners: await this.banners(row.reference ?? 'home'),
        };

      case HomeSectionType.COLLECTION_ROW: {
        if (!row.reference) return base;
        const page = await this.collections.listProducts({
          handle: row.reference,
          limit: row.itemLimit,
          sort: 'manual',
        });
        return { ...base, products: page.items };
      }

      case HomeSectionType.PRODUCT_GRID:
        return {
          ...base,
          products: await this.loadProducts(
            row.productHandles.slice(0, row.itemLimit),
          ),
        };

      case HomeSectionType.CATEGORY_GRID: {
        const page = await this.collections.list({
          limit: row.itemLimit,
          sort: 'title',
        });
        return { ...base, collections: page.items as CollectionSummaryDto[] };
      }

      default:
        return base;
    }
  }

  /**
   * Handles parthi products.
   *
   * Admin e curate karelu list chhe, etle **kram jaLvai rakhvo** — enu j
   * kaam chhe. Ane vachche no ek product Shopify ma delete/draft thai gayo
   * hoy to e ek j gum thay, aakhi row nahi.
   */
  private async loadProducts(handles: string[]): Promise<ProductSummaryDto[]> {
    const settled = await Promise.allSettled(
      handles.map((handle) => this.products.findOne(handle)),
    );

    const found: ProductSummaryDto[] = [];

    settled.forEach((result, i) => {
      if (result.status === 'fulfilled') {
        found.push(result.value);
      } else {
        this.logger.warn(
          `Home section ma product "${handles[i]}" na malyo — chhodi didho`,
        );
      }
    });

    return found;
  }

  /**
   * "Atyare live chhe?" — `isActive` + schedule window.
   *
   * Sale na banners aa thi jaate on/off thay chhe: admin ne raat na 12 vagye
   * ubha rahi ne toggle dabaavvani jarur nathi.
   */
  private liveWindow() {
    const now = new Date();
    return {
      isActive: true,
      AND: [
        { OR: [{ startsAt: null }, { startsAt: { lte: now } }] },
        { OR: [{ endsAt: null }, { endsAt: { gt: now } }] },
      ],
    } satisfies Prisma.BannerWhereInput;
  }

  private ttl(): number {
    return this.config.get('CONTENT_CACHE_TTL', { infer: true });
  }
}

function toBannerDto(row: {
  id: string;
  title: string;
  imageUrl: string;
  alt: string | null;
  linkType: BannerDto['linkType'];
  linkValue: string | null;
}): BannerDto {
  return {
    id: row.id,
    title: row.title,
    imageUrl: row.imageUrl,
    alt: row.alt,
    linkType: row.linkType,
    linkValue: row.linkValue,
  };
}
