import { Injectable } from '@nestjs/common';
import type {
  PageDto,
  ProductDto,
  ProductSummaryDto,
} from '../common/dto/product.dto';
import { toProductDto, toProductSummaryDto } from '../shopify/mappers/product.mapper';
import {
  PRODUCTS_LIST_QUERY,
  PRODUCT_DETAIL_QUERY,
  type ProductDetailResponse,
  type ProductsListResponse,
} from '../shopify/queries/product.queries';
import { ShopifyGraphqlClient } from '../shopify/shopify-graphql.client';
import type {
  ProductListParams,
  ProductRepository,
  ProductSort,
} from './product.repository';

/** Aapdo sort → Shopify no ProductSortKeys */
const SORT_MAP: Record<ProductSort, { sortKey: string; reverse: boolean }> = {
  newest: { sortKey: 'CREATED_AT', reverse: true },
  oldest: { sortKey: 'CREATED_AT', reverse: false },
  title: { sortKey: 'TITLE', reverse: false },
  updated: { sortKey: 'UPDATED_AT', reverse: true },
  relevance: { sortKey: 'RELEVANCE', reverse: false },
};

@Injectable()
export class ShopifyProductRepository implements ProductRepository {
  constructor(private readonly shopify: ShopifyGraphqlClient) {}

  async list(params: ProductListParams): Promise<PageDto<ProductSummaryDto>> {
    const { sortKey, reverse } = SORT_MAP[params.sort];

    const data = await this.shopify.request<ProductsListResponse>(
      PRODUCTS_LIST_QUERY,
      {
        first: params.limit,
        after: params.cursor ?? null,
        query: this.buildSearchQuery(params),
        sortKey,
        reverse,
      },
      'products.list',
    );

    return {
      items: data.products.nodes.map(toProductSummaryDto),
      nextCursor: data.products.pageInfo.hasNextPage
        ? data.products.pageInfo.endCursor
        : null,
      hasNextPage: data.products.pageInfo.hasNextPage,
    };
  }

  async findById(id: string): Promise<ProductDto | null> {
    const data = await this.shopify.request<ProductDetailResponse>(
      PRODUCT_DETAIL_QUERY,
      { handle: id },
      'products.detail',
    );

    const raw = data.productByIdentifier;
    if (!raw) return null;

    // Draft/archived products Shopify admin ma dekhaay chhe pan app ma
    // kyarey na dekhaava joiye — admin API badhu aape chhe, filter aapne
    // karvanu chhe.
    if (raw.status !== 'ACTIVE') return null;

    return toProductDto(raw);
  }

  /**
   * Shopify no search query banave chhe.
   *
   * `status:ACTIVE` hammesha lagaadiye chhiye — Admin API default ma draft ane
   * archived products pan aape chhe, ane e mobile app ma kyarey na dekhaava
   * joiye.
   */
  private buildSearchQuery(params: ProductListParams): string {
    const parts = ['status:ACTIVE'];

    if (params.productType) parts.push(`product_type:${quote(params.productType)}`);
    if (params.vendor) parts.push(`vendor:${quote(params.vendor)}`);
    if (params.tag) parts.push(`tag:${quote(params.tag)}`);
    if (params.search) parts.push(quote(params.search));

    return parts.join(' AND ');
  }
}

/**
 * Shopify na search syntax ma value ne quote kariye chhiye. Escape kariye
 * chhiye jethi user nu input query syntax todi na shake
 * (daa.t. koi search ma `' OR status:DRAFT` naakhe).
 */
function quote(value: string): string {
  return `'${value.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`;
}
