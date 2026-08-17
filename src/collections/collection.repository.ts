import type {
  CollectionDto,
  CollectionSummaryDto,
} from '../common/dto/collection.dto';
import type { PageDto, ProductSummaryDto } from '../common/dto/product.dto';

export const COLLECTION_REPOSITORY = Symbol('COLLECTION_REPOSITORY');

export type CollectionSort = 'title' | 'updated' | 'relevance';

/**
 * Collection ni andar products kaya kram ma.
 *
 * `manual` = merchant e Shopify ma je kram goThavyo hoy e j. Home page na
 * section mate aa j default chhe — merchant e jaan-bujhi ne goThavelu hoy
 * chhe, ane aapne ene todvu nathi.
 *
 * 📌 Dhyaan: `price_asc`/`price_desc` ahiya CHHE, jyare `/products` par nathi.
 * Aa Shopify ni marjaadi chhe — products connection par price no sort key j
 * nathi, pan collection ni products connection par chhe.
 */
export type CollectionProductSort =
  | 'manual'
  | 'bestselling'
  | 'newest'
  | 'title'
  | 'price_asc'
  | 'price_desc';

export interface CollectionListParams {
  limit: number;
  cursor?: string;
  search?: string;
  sort: CollectionSort;
}

export interface CollectionProductsParams {
  /** Collection no handle/slug */
  handle: string;
  limit: number;
  cursor?: string;
  sort: CollectionProductSort;
}

/**
 * ⚠️ PRODUCT REPOSITORY JEVO J SEAM.
 *
 * Aaje ek j implementation chhe — `ShopifyCollectionRepository`. Phase 2 ma
 * `DbCollectionRepository` lakhvano ane `collections.module.ts` ma
 * `PRODUCT_SOURCE` thi swap karvano.
 *
 * CollectionsService, controller ane mobile app — ek pan nathi badlavanu.
 */
export interface CollectionRepository {
  list(params: CollectionListParams): Promise<PageDto<CollectionSummaryDto>>;

  /** @param handle collection no handle/slug */
  findByHandle(handle: string): Promise<CollectionDto | null>;

  /**
   * @returns `null` jo collection j na male (404 vs khali collection —
   * app ne aa be alag daakhvva pade chhe)
   */
  listProducts(
    params: CollectionProductsParams,
  ): Promise<PageDto<ProductSummaryDto> | null>;
}
