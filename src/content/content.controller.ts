import { Controller, Get, Param, Query } from '@nestjs/common';
import { IsOptional, IsString, MaxLength } from 'class-validator';
import { ContentService } from './content.service';

class BannersQueryDto {
  /** "home", "cart", "category" — admin e banner par je lakhyu hoy te */
  @IsOptional()
  @IsString()
  @MaxLength(50)
  placement: string = 'home';
}

/**
 * Public — content jovA mate login ni jarur nathi.
 *
 * App na pehla launch e (login pehla j) home screen bharai javu joiye, nahi
 * to nava user ne khali app dekhaay ane e j kshan e chhoodi de chhe.
 */
@Controller('content')
export class ContentController {
  constructor(private readonly content: ContentService) {}

  /**
   * GET /content/home
   *
   * Aakhu home screen — sections, banners, products, badhu bharelu.
   * App e `type` par switch karvano ane **ajaanyo type chup-chaap chhodi
   * devano** — enathi navo section type juna app versions ne todto nathi.
   */
  @Get('home')
  async home() {
    return this.content.home();
  }

  /** GET /content/banners?placement=home */
  @Get('banners')
  async banners(@Query() query: BannersQueryDto) {
    return this.content.banners(query.placement);
  }

  /** GET /content/pages — About, Terms, Privacy... ni list */
  @Get('pages')
  async pages() {
    return this.content.pages();
  }

  /** GET /content/pages/:slug — page nu majkur */
  @Get('pages/:slug')
  async page(@Param('slug') slug: string) {
    return this.content.page(slug);
  }

  /** GET /content/faqs */
  @Get('faqs')
  async faqs() {
    return this.content.faqs();
  }

  /**
   * GET /content/coupons
   * ⚠️ Aa fakt "batavva na" codes chhe — valid chhe ke nahi e checkout nakki kare.
   */
  @Get('coupons')
  async coupons() {
    return this.content.coupons();
  }
}
