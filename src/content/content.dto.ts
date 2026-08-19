import type { ProductSummaryDto } from '../common/dto/product.dto';
import type { CollectionSummaryDto } from '../common/dto/collection.dto';

/**
 * ⚠️ MOBILE APP NO CONTRACT.
 *
 * Home screen nu layout app ma hard-coded NATHI — aa payload j nakki kare
 * chhe ke kaya sections, kaya kram ma, ane ander su. Etle "aa mahine banner
 * upar, next mahine bestsellers upar" mate app nu navu version release
 * karvani jarur nathi.
 *
 * App e `type` par switch karvano chhe ane ajaanya type ne CHUP-CHAAP
 * CHHODI DEVANO chhe. Aa niyam j aapne navo section type ummervani chhut
 * aape chhe — juna app versions ene fakt jota nathi, crash nathi thata.
 */

export interface BannerDto {
  id: string;
  title: string;
  imageUrl: string;
  alt: string | null;
  /** 'NONE' hoy to tap par kai na thay */
  linkType: 'NONE' | 'PRODUCT' | 'COLLECTION' | 'URL';
  /** PRODUCT/COLLECTION => handle, URL => aakhu URL */
  linkValue: string | null;
}

export interface HomeSectionDto {
  id: string;
  type: 'BANNER_CAROUSEL' | 'COLLECTION_ROW' | 'PRODUCT_GRID' | 'CATEGORY_GRID';
  title: string | null;
  subtitle: string | null;
  /** COLLECTION_ROW ma collection no handle — "View all" button mate */
  reference: string | null;
  banners: BannerDto[];
  products: ProductSummaryDto[];
  collections: CollectionSummaryDto[];
}

export interface PageSummaryDto {
  slug: string;
  title: string;
  updatedAt: string;
}

export interface PageDetailDto extends PageSummaryDto {
  body: string;
}

export interface FaqDto {
  id: string;
  question: string;
  answer: string;
  category: string | null;
}

export interface AppCouponDto {
  id: string;
  code: string;
  title: string;
  description: string | null;
  imageUrl: string | null;
  terms: string | null;
  endsAt: string | null;
}
