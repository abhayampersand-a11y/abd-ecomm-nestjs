import { BannerLinkType, HomeSectionType } from '@prisma/client';
import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsEnum,
  IsISO8601,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  IsUrl,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { PaginationDto } from './pagination.dto';

const trim = Transform(({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value,
);

// ---------------------------------------------------------------------------
// Banners
// ---------------------------------------------------------------------------

export class CreateBannerDto {
  @IsString()
  @MinLength(1)
  @MaxLength(150)
  title!: string;

  /**
   * Image aapde host nathi karta — Shopify Files, Cloudinary ke S3 nu URL
   * ahiya chipkaavvanu. Upload aapdi jawabdari ma laavvo etle storage,
   * resizing, CDN ane cleanup — badhu aapnu thai jaay chhe.
   */
  @IsUrl({ require_protocol: true })
  @MaxLength(1000)
  imageUrl!: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  alt?: string;

  @IsOptional()
  @IsEnum(BannerLinkType)
  linkType?: BannerLinkType;

  /** PRODUCT/COLLECTION => handle, URL => aakhu URL */
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  linkValue?: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  @Matches(/^[a-z0-9-]+$/, {
    message: 'placement may only contain lowercase letters, numbers and hyphens',
  })
  placement?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(9999)
  position?: number;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsISO8601()
  startsAt?: string;

  @IsOptional()
  @IsISO8601()
  endsAt?: string;
}

export class UpdateBannerDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(150)
  title?: string;

  @IsOptional()
  @IsUrl({ require_protocol: true })
  @MaxLength(1000)
  imageUrl?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  alt?: string;

  @IsOptional()
  @IsEnum(BannerLinkType)
  linkType?: BannerLinkType;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  linkValue?: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  @Matches(/^[a-z0-9-]+$/, {
    message: 'placement may only contain lowercase letters, numbers and hyphens',
  })
  placement?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(9999)
  position?: number;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsISO8601()
  startsAt?: string;

  @IsOptional()
  @IsISO8601()
  endsAt?: string;
}

export class ListBannersDto extends PaginationDto {
  @IsOptional()
  @IsString()
  @MaxLength(50)
  placement?: string;
}

/**
 * Drag-and-drop pachhi ek j call.
 *
 * Ek-ek PATCH mokalso to vachche ma request fail thay ane list adhu-padhu
 * kramai jaay. Ahiya badhu ek transaction ma chhe — kaa to aakho navo kram,
 * kaa to juno.
 */
export class ReorderDto {
  @IsArray()
  @ArrayMaxSize(500)
  @IsUUID('4', { each: true })
  ids!: string[];
}

// ---------------------------------------------------------------------------
// Home sections
// ---------------------------------------------------------------------------

export class CreateHomeSectionDto {
  @IsEnum(HomeSectionType)
  type!: HomeSectionType;

  @IsOptional()
  @IsString()
  @MaxLength(150)
  title?: string;

  @IsOptional()
  @IsString()
  @MaxLength(250)
  subtitle?: string;

  /**
   * BANNER_CAROUSEL => banner placement ("home")
   * COLLECTION_ROW  => collection no handle ("sarees")
   *
   * ⚠️ Aa handle Shopify ma kharekhar chhe ke nahi e aapne ahiya check nathi
   * karta — Shopify ne puchhvu pade ane admin ne save karta 2 second rah
   * jovi pade. Khoto handle hoy to e section home par thi chup-chaap gum
   * thai jashe (juo ContentService.home()), ane log ma nishaani rahese.
   */
  @IsOptional()
  @IsString()
  @MaxLength(200)
  reference?: string;

  /** PRODUCT_GRID mate — aa j kram ma dekhaashe */
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(50)
  @IsString({ each: true })
  productHandles?: string[];

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  itemLimit?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(9999)
  position?: number;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsISO8601()
  startsAt?: string;

  @IsOptional()
  @IsISO8601()
  endsAt?: string;
}

export class UpdateHomeSectionDto {
  @IsOptional()
  @IsEnum(HomeSectionType)
  type?: HomeSectionType;

  @IsOptional()
  @IsString()
  @MaxLength(150)
  title?: string;

  @IsOptional()
  @IsString()
  @MaxLength(250)
  subtitle?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  reference?: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(50)
  @IsString({ each: true })
  productHandles?: string[];

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  itemLimit?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(9999)
  position?: number;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsISO8601()
  startsAt?: string;

  @IsOptional()
  @IsISO8601()
  endsAt?: string;
}

// ---------------------------------------------------------------------------
// Pages
// ---------------------------------------------------------------------------

export class CreatePageDto {
  /** "about-us", "terms", "privacy", "return-policy" */
  @trim
  @IsString()
  @MaxLength(80)
  @Matches(/^[a-z0-9-]+$/, {
    message: 'slug may only contain lowercase letters, numbers and hyphens',
  })
  slug!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(200)
  title!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(200_000)
  body!: string;

  /** Default `false` — likhta-likhta app ma adhuru majkur na dekhaay */
  @IsOptional()
  @IsBoolean()
  isPublished?: boolean;
}

export class UpdatePageDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  title?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(200_000)
  body?: string;

  @IsOptional()
  @IsBoolean()
  isPublished?: boolean;
}

// ---------------------------------------------------------------------------
// FAQs
// ---------------------------------------------------------------------------

export class CreateFaqDto {
  @IsString()
  @MinLength(1)
  @MaxLength(300)
  question!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(5000)
  answer!: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  category?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(9999)
  position?: number;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class UpdateFaqDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(300)
  question?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(5000)
  answer?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  category?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(9999)
  position?: number;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

// ---------------------------------------------------------------------------
// App coupons
// ---------------------------------------------------------------------------

export class CreateCouponDto {
  /**
   * ⚠️ Aa code Shopify ma pehla thi hovo joiye.
   *
   * Ahiya lakhvathi coupon banto nathi — aa fakt "grahak ne su batavvu" nu
   * list chhe. Shopify ma na hoy to grahak checkout ma "code invalid" jose,
   * ane e sauthi kharaab kshan chhe: paisa aapva taiyar vyakti ne na paadvi.
   */
  @trim
  @IsString()
  @MinLength(1)
  @MaxLength(80)
  code!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(150)
  title!: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;

  @IsOptional()
  @IsUrl({ require_protocol: true })
  @MaxLength(1000)
  imageUrl?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  terms?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(9999)
  position?: number;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsISO8601()
  startsAt?: string;

  @IsOptional()
  @IsISO8601()
  endsAt?: string;
}

export class UpdateCouponDto {
  @IsOptional()
  @trim
  @IsString()
  @MinLength(1)
  @MaxLength(80)
  code?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(150)
  title?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;

  @IsOptional()
  @IsUrl({ require_protocol: true })
  @MaxLength(1000)
  imageUrl?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  terms?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(9999)
  position?: number;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsISO8601()
  startsAt?: string;

  @IsOptional()
  @IsISO8601()
  endsAt?: string;
}
