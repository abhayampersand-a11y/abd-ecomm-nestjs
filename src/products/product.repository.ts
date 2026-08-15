import type {
  PageDto,
  ProductDto,
  ProductSummaryDto,
} from '../common/dto/product.dto';

export const PRODUCT_REPOSITORY = Symbol('PRODUCT_REPOSITORY');

export type ProductSort = 'newest' | 'oldest' | 'title' | 'updated' | 'relevance';

export interface ProductListParams {
  limit: number;
  cursor?: string;
  search?: string;
  productType?: string;
  vendor?: string;
  tag?: string;
  sort: ProductSort;
}

/**
 * ⚠️ AA INTERFACE J MIGRATION NO ASLI SEAM CHHE.
 *
 * Aaje eno ek j implementation chhe — `ShopifyProductRepository` (live API).
 * Phase 2 ma `DbProductRepository` (Postgres) lakhvano, ane
 * `products.module.ts` ma env var thi swap karvano.
 *
 * ProductsService, controller ane mobile app — tran ma thi ek pan nathi
 * badlavanu. Aa 20 line na interface ne kaarne j.
 */
export interface ProductRepository {
  list(params: ProductListParams): Promise<PageDto<ProductSummaryDto>>;

  /** @param id product no handle/slug */
  findById(id: string): Promise<ProductDto | null>;
}
