import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { ContentService } from '../../content/content.service';
import { PrismaService } from '../../prisma/prisma.service';
import { AdminAuditService } from '../audit/admin-audit.service';
import type {
  CreateBannerDto,
  CreateCouponDto,
  CreateFaqDto,
  CreateHomeSectionDto,
  CreatePageDto,
  ListBannersDto,
  ReorderDto,
  UpdateBannerDto,
  UpdateCouponDto,
  UpdateFaqDto,
  UpdateHomeSectionDto,
  UpdatePageDto,
} from '../dto/content.dto';
import {
  toAdminPage,
  toSkipTake,
  type AdminPageDto,
  type PaginationDto,
} from '../dto/pagination.dto';

/**
 * CMS nu lakhvanu kaam.
 *
 * ⚠️ Dar write pachhi `content.invalidate()` FARJIYAT chhe. Bhulai jaay to
 * admin "Save" dabaave, panel ma navu dekhaay, ane app ma 10 minute sudhi
 * junu — ane e 10 minute admin fari-fari save karto rahese em samji ne ke
 * kaik bagdyu chhe. Etle e call `afterWrite()` ma ek j jagya e chhe.
 */
@Injectable()
export class AdminContentService {
  private readonly logger = new Logger(AdminContentService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly content: ContentService,
    private readonly audit: AdminAuditService,
  ) {}

  // ---------------------------------------------------------------------------
  // Banners
  // ---------------------------------------------------------------------------

  async listBanners(query: ListBannersDto): Promise<AdminPageDto<unknown>> {
    const where: Prisma.BannerWhereInput = query.placement
      ? { placement: query.placement }
      : {};

    const [items, total] = await this.prisma.$transaction([
      this.prisma.banner.findMany({
        where,
        orderBy: [{ placement: 'asc' }, { position: 'asc' }],
        ...toSkipTake(query),
      }),
      this.prisma.banner.count({ where }),
    ]);

    return toAdminPage(items.map(withLiveFlag), total, query);
  }

  async createBanner(dto: CreateBannerDto) {
    this.assertWindow(dto.startsAt, dto.endsAt);

    const row = await this.prisma.banner.create({
      data: {
        title: dto.title,
        imageUrl: dto.imageUrl,
        alt: dto.alt ?? null,
        linkType: dto.linkType ?? 'NONE',
        linkValue: dto.linkValue ?? null,
        placement: dto.placement ?? 'home',
        position: dto.position ?? 0,
        isActive: dto.isActive ?? true,
        startsAt: toDate(dto.startsAt),
        endsAt: toDate(dto.endsAt),
      },
    });

    await this.afterWrite('banner.create', 'banner', row.id, `Banner "${row.title}" created`, null, row);
    return withLiveFlag(row);
  }

  async updateBanner(id: string, dto: UpdateBannerDto) {
    const before = await this.prisma.banner.findUnique({ where: { id } });
    if (!before) throw new NotFoundException('Banner not found');

    this.assertWindow(dto.startsAt ?? before.startsAt?.toISOString(), dto.endsAt ?? before.endsAt?.toISOString());

    const row = await this.prisma.banner.update({
      where: { id },
      data: {
        title: dto.title,
        imageUrl: dto.imageUrl,
        alt: dto.alt,
        linkType: dto.linkType,
        linkValue: dto.linkValue,
        placement: dto.placement,
        position: dto.position,
        isActive: dto.isActive,
        startsAt: dto.startsAt !== undefined ? toDate(dto.startsAt) : undefined,
        endsAt: dto.endsAt !== undefined ? toDate(dto.endsAt) : undefined,
      },
    });

    await this.afterWrite('banner.update', 'banner', id, `Banner "${row.title}" updated`, before, row);
    return withLiveFlag(row);
  }

  async removeBanner(id: string) {
    const row = await this.prisma.banner.findUnique({ where: { id } });
    if (!row) throw new NotFoundException('Banner not found');

    await this.prisma.banner.delete({ where: { id } });
    await this.afterWrite('banner.delete', 'banner', id, `Banner "${row.title}" deleted`, row, null);

    return { success: true as const };
  }

  async reorderBanners(dto: ReorderDto) {
    await this.prisma.$transaction(
      dto.ids.map((id, index) =>
        this.prisma.banner.update({ where: { id }, data: { position: index } }),
      ),
    );

    await this.afterWrite('banner.reorder', 'banner', null, `${dto.ids.length} banners reordered`, null, { ids: dto.ids });
    return { success: true as const, count: dto.ids.length };
  }

  // ---------------------------------------------------------------------------
  // Home sections
  // ---------------------------------------------------------------------------

  async listHomeSections() {
    const rows = await this.prisma.homeSection.findMany({
      orderBy: [{ position: 'asc' }, { createdAt: 'asc' }],
    });

    return rows.map(withLiveFlag);
  }

  async createHomeSection(dto: CreateHomeSectionDto) {
    this.assertWindow(dto.startsAt, dto.endsAt);
    this.assertSectionShape(dto.type, dto.reference, dto.productHandles);

    const row = await this.prisma.homeSection.create({
      data: {
        type: dto.type,
        title: dto.title ?? null,
        subtitle: dto.subtitle ?? null,
        reference: dto.reference ?? null,
        productHandles: dto.productHandles ?? [],
        itemLimit: dto.itemLimit ?? 10,
        position: dto.position ?? 0,
        isActive: dto.isActive ?? true,
        startsAt: toDate(dto.startsAt),
        endsAt: toDate(dto.endsAt),
      },
    });

    await this.afterWrite('homeSection.create', 'homeSection', row.id, `Home section ${row.type} created`, null, row);
    return withLiveFlag(row);
  }

  async updateHomeSection(id: string, dto: UpdateHomeSectionDto) {
    const before = await this.prisma.homeSection.findUnique({ where: { id } });
    if (!before) throw new NotFoundException('Home section not found');

    this.assertWindow(
      dto.startsAt ?? before.startsAt?.toISOString(),
      dto.endsAt ?? before.endsAt?.toISOString(),
    );
    this.assertSectionShape(
      dto.type ?? before.type,
      dto.reference ?? before.reference,
      dto.productHandles ?? before.productHandles,
    );

    const row = await this.prisma.homeSection.update({
      where: { id },
      data: {
        type: dto.type,
        title: dto.title,
        subtitle: dto.subtitle,
        reference: dto.reference,
        productHandles: dto.productHandles,
        itemLimit: dto.itemLimit,
        position: dto.position,
        isActive: dto.isActive,
        startsAt: dto.startsAt !== undefined ? toDate(dto.startsAt) : undefined,
        endsAt: dto.endsAt !== undefined ? toDate(dto.endsAt) : undefined,
      },
    });

    await this.afterWrite('homeSection.update', 'homeSection', id, `Home section ${row.type} updated`, before, row);
    return withLiveFlag(row);
  }

  async removeHomeSection(id: string) {
    const row = await this.prisma.homeSection.findUnique({ where: { id } });
    if (!row) throw new NotFoundException('Home section not found');

    await this.prisma.homeSection.delete({ where: { id } });
    await this.afterWrite('homeSection.delete', 'homeSection', id, `Home section ${row.type} deleted`, row, null);

    return { success: true as const };
  }

  async reorderHomeSections(dto: ReorderDto) {
    await this.prisma.$transaction(
      dto.ids.map((id, index) =>
        this.prisma.homeSection.update({ where: { id }, data: { position: index } }),
      ),
    );

    await this.afterWrite('homeSection.reorder', 'homeSection', null, `${dto.ids.length} sections reordered`, null, { ids: dto.ids });
    return { success: true as const, count: dto.ids.length };
  }

  // ---------------------------------------------------------------------------
  // Pages
  // ---------------------------------------------------------------------------

  async listPages() {
    return this.prisma.page.findMany({ orderBy: { title: 'asc' } });
  }

  async getPage(id: string) {
    const row = await this.prisma.page.findUnique({ where: { id } });
    if (!row) throw new NotFoundException('Page not found');
    return row;
  }

  async createPage(dto: CreatePageDto) {
    try {
      const row = await this.prisma.page.create({
        data: {
          slug: dto.slug,
          title: dto.title,
          body: dto.body,
          isPublished: dto.isPublished ?? false,
        },
      });

      await this.afterWrite('page.create', 'page', row.id, `Page "${row.slug}" created`, null, { slug: row.slug, title: row.title });
      return row;
    } catch (err) {
      throw this.asConflict(err, 'A page with this slug already exists');
    }
  }

  async updatePage(id: string, dto: UpdatePageDto) {
    const before = await this.prisma.page.findUnique({ where: { id } });
    if (!before) throw new NotFoundException('Page not found');

    const row = await this.prisma.page.update({
      where: { id },
      data: { title: dto.title, body: dto.body, isPublished: dto.isPublished },
    });

    // `body` audit ma nathi mukto — e 50 KB no hoi shake ane dar save e
    // eni be nakalo (before + after) lakhso to audit table j sauthi motu
    // table bani jashe.
    await this.afterWrite(
      'page.update',
      'page',
      id,
      `Page "${row.slug}" updated`,
      { title: before.title, isPublished: before.isPublished },
      { title: row.title, isPublished: row.isPublished },
    );

    return row;
  }

  async removePage(id: string) {
    const row = await this.prisma.page.findUnique({ where: { id } });
    if (!row) throw new NotFoundException('Page not found');

    await this.prisma.page.delete({ where: { id } });
    await this.afterWrite('page.delete', 'page', id, `Page "${row.slug}" deleted`, { slug: row.slug, title: row.title }, null);

    return { success: true as const };
  }

  // ---------------------------------------------------------------------------
  // FAQs
  // ---------------------------------------------------------------------------

  async listFaqs(query: PaginationDto): Promise<AdminPageDto<unknown>> {
    const [items, total] = await this.prisma.$transaction([
      this.prisma.faq.findMany({
        orderBy: [{ position: 'asc' }, { createdAt: 'asc' }],
        ...toSkipTake(query),
      }),
      this.prisma.faq.count(),
    ]);

    return toAdminPage(items, total, query);
  }

  async createFaq(dto: CreateFaqDto) {
    const row = await this.prisma.faq.create({
      data: {
        question: dto.question,
        answer: dto.answer,
        category: dto.category ?? null,
        position: dto.position ?? 0,
        isActive: dto.isActive ?? true,
      },
    });

    await this.afterWrite('faq.create', 'faq', row.id, `FAQ created: ${row.question}`, null, row);
    return row;
  }

  async updateFaq(id: string, dto: UpdateFaqDto) {
    const before = await this.prisma.faq.findUnique({ where: { id } });
    if (!before) throw new NotFoundException('FAQ not found');

    const row = await this.prisma.faq.update({
      where: { id },
      data: {
        question: dto.question,
        answer: dto.answer,
        category: dto.category,
        position: dto.position,
        isActive: dto.isActive,
      },
    });

    await this.afterWrite('faq.update', 'faq', id, `FAQ updated: ${row.question}`, before, row);
    return row;
  }

  async removeFaq(id: string) {
    const row = await this.prisma.faq.findUnique({ where: { id } });
    if (!row) throw new NotFoundException('FAQ not found');

    await this.prisma.faq.delete({ where: { id } });
    await this.afterWrite('faq.delete', 'faq', id, `FAQ deleted: ${row.question}`, row, null);

    return { success: true as const };
  }

  async reorderFaqs(dto: ReorderDto) {
    await this.prisma.$transaction(
      dto.ids.map((id, index) =>
        this.prisma.faq.update({ where: { id }, data: { position: index } }),
      ),
    );

    await this.afterWrite('faq.reorder', 'faq', null, `${dto.ids.length} FAQs reordered`, null, { ids: dto.ids });
    return { success: true as const, count: dto.ids.length };
  }

  // ---------------------------------------------------------------------------
  // App coupons
  // ---------------------------------------------------------------------------

  async listCoupons(query: PaginationDto): Promise<AdminPageDto<unknown>> {
    const [items, total] = await this.prisma.$transaction([
      this.prisma.appCoupon.findMany({
        orderBy: [{ position: 'asc' }, { createdAt: 'asc' }],
        ...toSkipTake(query),
      }),
      this.prisma.appCoupon.count(),
    ]);

    return toAdminPage(items.map(withLiveFlag), total, query);
  }

  async createCoupon(dto: CreateCouponDto) {
    this.assertWindow(dto.startsAt, dto.endsAt);

    try {
      const row = await this.prisma.appCoupon.create({
        data: {
          code: dto.code,
          title: dto.title,
          description: dto.description ?? null,
          imageUrl: dto.imageUrl ?? null,
          terms: dto.terms ?? null,
          position: dto.position ?? 0,
          isActive: dto.isActive ?? true,
          startsAt: toDate(dto.startsAt),
          endsAt: toDate(dto.endsAt),
        },
      });

      await this.afterWrite('coupon.create', 'coupon', row.id, `Coupon "${row.code}" listed in the app`, null, row);
      return withLiveFlag(row);
    } catch (err) {
      throw this.asConflict(err, 'This coupon code is already listed');
    }
  }

  async updateCoupon(id: string, dto: UpdateCouponDto) {
    const before = await this.prisma.appCoupon.findUnique({ where: { id } });
    if (!before) throw new NotFoundException('Coupon not found');

    this.assertWindow(
      dto.startsAt ?? before.startsAt?.toISOString(),
      dto.endsAt ?? before.endsAt?.toISOString(),
    );

    try {
      const row = await this.prisma.appCoupon.update({
        where: { id },
        data: {
          code: dto.code,
          title: dto.title,
          description: dto.description,
          imageUrl: dto.imageUrl,
          terms: dto.terms,
          position: dto.position,
          isActive: dto.isActive,
          startsAt: dto.startsAt !== undefined ? toDate(dto.startsAt) : undefined,
          endsAt: dto.endsAt !== undefined ? toDate(dto.endsAt) : undefined,
        },
      });

      await this.afterWrite('coupon.update', 'coupon', id, `Coupon "${row.code}" updated`, before, row);
      return withLiveFlag(row);
    } catch (err) {
      throw this.asConflict(err, 'This coupon code is already listed');
    }
  }

  async removeCoupon(id: string) {
    const row = await this.prisma.appCoupon.findUnique({ where: { id } });
    if (!row) throw new NotFoundException('Coupon not found');

    await this.prisma.appCoupon.delete({ where: { id } });
    await this.afterWrite('coupon.delete', 'coupon', id, `Coupon "${row.code}" removed from the app`, row, null);

    return { success: true as const };
  }

  // ---------------------------------------------------------------------------
  // Internals
  // ---------------------------------------------------------------------------

  /**
   * Dar write pachhi ek j jagya e be kaam: cache saaf ane audit.
   *
   * Ee j karan e badhi CRUD methods aa ne j call kare chhe — nahi to 20 ma
   * thi ek jagya e `invalidate()` rahi jaay ane e bug mahina pachhi
   * "kyarek junu dekhaay chhe" tarike bahar aave, je pakadvo lagbhag
   * ashakya chhe.
   */
  private async afterWrite(
    action: string,
    entityType: string,
    entityId: string | null,
    summary: string,
    before: unknown,
    after: unknown,
  ): Promise<void> {
    await this.content.invalidate();
    await this.audit.record({ action, entityType, entityId, summary, before, after });
    this.logger.log(summary);
  }

  private assertWindow(startsAt?: string | null, endsAt?: string | null): void {
    if (!startsAt || !endsAt) return;

    if (new Date(endsAt) <= new Date(startsAt)) {
      throw new BadRequestException('The end date must be after the start date');
    }
  }

  /**
   * Section no type ane enu content mel khaay chhe ke nahi.
   *
   * Aa check vagar admin COLLECTION_ROW banaave, `reference` bharvanu bhuli
   * jaay, save thai jaay — ane home screen par e section chup-chaap gum
   * rahe. Save vakhte na paadvi e bahu saaru chhe.
   */
  private assertSectionShape(
    type: string,
    reference?: string | null,
    productHandles?: string[] | null,
  ): void {
    if (type === 'COLLECTION_ROW' && !reference) {
      throw new BadRequestException(
        'A collection handle is required for a COLLECTION_ROW section',
      );
    }

    if (type === 'PRODUCT_GRID' && (!productHandles || productHandles.length === 0)) {
      throw new BadRequestException(
        'At least one product handle is required for a PRODUCT_GRID section',
      );
    }
  }

  private asConflict(err: unknown, message: string): unknown {
    if (
      err instanceof Prisma.PrismaClientKnownRequestError &&
      err.code === 'P2002'
    ) {
      return new ConflictException(message);
    }
    return err;
  }
}

/** ISO string → Date. Khaali string ke null => `null` (etle "seema kaadhi naakho") */
function toDate(value?: string | null): Date | null {
  return value ? new Date(value) : null;
}

/**
 * Panel ne "isActive: true" karta vadhu joiye chhe: schedule vaali vastu
 * active hoy pan haju live na hoy. Aa flag vagar admin toggle on karyu hoy
 * ane app ma na dekhaay to e vichaarse ke kaik bhaangyu chhe.
 */
function withLiveFlag<T extends { isActive: boolean; startsAt: Date | null; endsAt: Date | null }>(
  row: T,
): T & { isLive: boolean } {
  const now = new Date();
  const started = !row.startsAt || row.startsAt <= now;
  const notEnded = !row.endsAt || row.endsAt > now;

  return { ...row, isLive: row.isActive && started && notEnded };
}
