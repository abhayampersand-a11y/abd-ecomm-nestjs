import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { AdminJwtGuard } from '../auth/admin-jwt.guard';
import {
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
import { PaginationDto } from '../dto/pagination.dto';
import { AdminContentService } from './admin-content.service';

/**
 * App nu content — banners, home layout, pages, FAQ, coupons.
 *
 * Aa j e jagya chhe je "app ma badalvu hoy to release joiye" ne khatm kare
 * chhe. Ahiya thi save karo, ane app ma tarat dekhaay (cache jate saaf thay chhe).
 */
@Controller('admin/content')
@UseGuards(AdminJwtGuard)
export class AdminContentController {
  constructor(private readonly content: AdminContentService) {}

  // -------------------------------------------------------------------------
  // Banners
  // -------------------------------------------------------------------------

  /** GET /admin/content/banners?placement=home */
  @Get('banners')
  async listBanners(@Query() query: ListBannersDto) {
    return this.content.listBanners(query);
  }

  @Post('banners')
  async createBanner(@Body() dto: CreateBannerDto) {
    return this.content.createBanner(dto);
  }

  /** POST /admin/content/banners/reorder — drag-drop pachhi ek j call */
  @Post('banners/reorder')
  @HttpCode(HttpStatus.OK)
  async reorderBanners(@Body() dto: ReorderDto) {
    return this.content.reorderBanners(dto);
  }

  @Patch('banners/:id')
  async updateBanner(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateBannerDto,
  ) {
    return this.content.updateBanner(id, dto);
  }

  @Delete('banners/:id')
  async removeBanner(@Param('id', ParseUUIDPipe) id: string) {
    return this.content.removeBanner(id);
  }

  // -------------------------------------------------------------------------
  // Home layout
  // -------------------------------------------------------------------------

  /** GET /admin/content/home-sections — inactive ane scheduled sathe */
  @Get('home-sections')
  async listHomeSections() {
    return this.content.listHomeSections();
  }

  @Post('home-sections')
  async createHomeSection(@Body() dto: CreateHomeSectionDto) {
    return this.content.createHomeSection(dto);
  }

  @Post('home-sections/reorder')
  @HttpCode(HttpStatus.OK)
  async reorderHomeSections(@Body() dto: ReorderDto) {
    return this.content.reorderHomeSections(dto);
  }

  @Patch('home-sections/:id')
  async updateHomeSection(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateHomeSectionDto,
  ) {
    return this.content.updateHomeSection(id, dto);
  }

  @Delete('home-sections/:id')
  async removeHomeSection(@Param('id', ParseUUIDPipe) id: string) {
    return this.content.removeHomeSection(id);
  }

  // -------------------------------------------------------------------------
  // Pages
  // -------------------------------------------------------------------------

  @Get('pages')
  async listPages() {
    return this.content.listPages();
  }

  @Post('pages')
  async createPage(@Body() dto: CreatePageDto) {
    return this.content.createPage(dto);
  }

  @Get('pages/:id')
  async getPage(@Param('id', ParseUUIDPipe) id: string) {
    return this.content.getPage(id);
  }

  @Patch('pages/:id')
  async updatePage(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdatePageDto,
  ) {
    return this.content.updatePage(id, dto);
  }

  @Delete('pages/:id')
  async removePage(@Param('id', ParseUUIDPipe) id: string) {
    return this.content.removePage(id);
  }

  // -------------------------------------------------------------------------
  // FAQs
  // -------------------------------------------------------------------------

  @Get('faqs')
  async listFaqs(@Query() query: PaginationDto) {
    return this.content.listFaqs(query);
  }

  @Post('faqs')
  async createFaq(@Body() dto: CreateFaqDto) {
    return this.content.createFaq(dto);
  }

  @Post('faqs/reorder')
  @HttpCode(HttpStatus.OK)
  async reorderFaqs(@Body() dto: ReorderDto) {
    return this.content.reorderFaqs(dto);
  }

  @Patch('faqs/:id')
  async updateFaq(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateFaqDto,
  ) {
    return this.content.updateFaq(id, dto);
  }

  @Delete('faqs/:id')
  async removeFaq(@Param('id', ParseUUIDPipe) id: string) {
    return this.content.removeFaq(id);
  }

  // -------------------------------------------------------------------------
  // App coupons
  // -------------------------------------------------------------------------

  /** ⚠️ Coupon ahiya banto nathi — Shopify ma pehla thi hovo joiye */
  @Get('coupons')
  async listCoupons(@Query() query: PaginationDto) {
    return this.content.listCoupons(query);
  }

  @Post('coupons')
  async createCoupon(@Body() dto: CreateCouponDto) {
    return this.content.createCoupon(dto);
  }

  @Patch('coupons/:id')
  async updateCoupon(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateCouponDto,
  ) {
    return this.content.updateCoupon(id, dto);
  }

  @Delete('coupons/:id')
  async removeCoupon(@Param('id', ParseUUIDPipe) id: string) {
    return this.content.removeCoupon(id);
  }
}
