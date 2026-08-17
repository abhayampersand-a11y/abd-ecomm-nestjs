import { Injectable } from '@nestjs/common';
import type {
  CollectionDto,
  CollectionSummaryDto,
} from '../common/dto/collection.dto';
import type { PageDto, ProductSummaryDto } from '../common/dto/product.dto';
import {
  toCollectionDto,
  toCollectionSummaryDto,
} from '../shopify/mappers/collection.mapper';
import { toProductSummaryDto } from '../shopify/mappers/product.mapper';
import {
  COLLECTIONS_LIST_QUERY,
  COLLECTION_DETAIL_QUERY,
  COLLECTION_PRODUCTS_QUERY,
  type CollectionDetailResponse,
  type CollectionProductsResponse,
  type CollectionsListResponse,
} from '../shopify/queries/collection.queries';
import { ShopifyGraphqlClient } from '../shopify/shopify-graphql.client';
import type {
  CollectionListParams,
  CollectionProductSort,
  CollectionProductsParams,
  CollectionRepository,
  CollectionSort,
} from './collection.repository';

/** Aapdo sort → Shopify no CollectionSortKeys */
const SORT_MAP: Record<CollectionSort, { sortKey: string; reverse: boolean }> = {
  title: { sortKey: 'TITLE', reverse: false },
  updated: { sortKey: 'UPDATED_AT', reverse: true },
  relevance: { sortKey: 'RELEVANCE', reverse: false },
};

/** Aapdo sort → Shopify no ProductCollectionSortKeys */
const PRODUCT_SORT_MAP: Record<
  CollectionProductSort,
  { sortKey: string; reverse: boolean }
> = {
  manual: { sortKey: 'COLLECTION_DEFAULT', reverse: false },
  bestselling: { sortKey: 'BEST_SELLING', reverse: false },
  newest: { sortKey: 'CREATED', reverse: true },
  title: { sortKey: 'TITLE', reverse: false },
  price_asc: { sortKey: 'PRICE', reverse: false },
  price_desc: { sortKey: 'PRICE', reverse: true },
};

@Injectable()
export class ShopifyCollectionRepository implements CollectionRepository {
  constructor(private readonly shopify: ShopifyGraphqlClient) {}

  async list(
    params: CollectionListParams,
  ): Promise<PageDto<CollectionSummaryDto>> {
    const { sortKey, reverse } = SORT_MAP[params.sort];

    const data = await this.shopify.request<CollectionsListResponse>(
      COLLECTIONS_LIST_QUERY,
      {
        first: params.limit,
        after: params.cursor ?? null,
        query: params.search ? quote(params.search) : null,
        sortKey,
        reverse,
      },
      'collections.list',
    );

    return {
      items: data.collections.nodes.map(toCollectionSummaryDto),
      nextCursor: data.collections.pageInfo.hasNextPage
        ? data.collections.pageInfo.endCursor
        : null,
      hasNextPage: data.collections.pageInfo.hasNextPage,
    };
  }

  async findByHandle(handle: string): Promise<CollectionDto | null> {
    const data = await this.shopify.request<CollectionDetailResponse>(
      COLLECTION_DETAIL_QUERY,
      { handle },
      'collections.detail',
    );

    const raw = data.collectionByIdentifier;
    return raw ? toCollectionDto(raw) : null;
  }

  async listProducts(
    params: CollectionProductsParams,
  ): Promise<PageDto<ProductSummaryDto> | null> {
    const { sortKey, reverse } = PRODUCT_SORT_MAP[params.sort];

    const data = await this.shopify.request<CollectionProductsResponse>(
      COLLECTION_PRODUCTS_QUERY,
      {
        handle: params.handle,
        first: params.limit,
        after: params.cursor ?? null,
        sortKey,
        reverse,
      },
      'collections.products',
    );

    const collection = data.collectionByIdentifier;
    if (!collection) return null;

    const { pageInfo, nodes } = collection.products;

    /**
     * ⚠️ Draft/archived products ahiya server-side filter NATHI thai shakta —
     * Shopify ni `Collection.products` connection par `query` argument j nathi
     * (jyare `/products` par chhe, tya `status:ACTIVE` lagaadiye chhiye).
     *
     * Etle filter ahiya karvo pade chhe, ane eno matlab: app 20 maange to 18
     * pan male shake. Aa **barabar chhe** ane app e aa handle karvu joiye —
     * `items.length` jovanu nahi, `hasNextPage`/`nextCursor` j jovana. Cursor
     * Shopify no j chhe (filter pehla no), etle pagination tutti nathi.
     */
    const items = nodes
      .filter((node) => node.status === 'ACTIVE')
      .map(toProductSummaryDto);

    return {
      items,
      nextCursor: pageInfo.hasNextPage ? pageInfo.endCursor : null,
      hasNextPage: pageInfo.hasNextPage,
    };
  }
}

/**
 * Shopify na search syntax ma value ne quote kariye chhiye — product
 * repository jevo j niyam, jethi user nu input query syntax na todi shake.
 */
function quote(value: string): string {
  return `'${value.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`;
}
