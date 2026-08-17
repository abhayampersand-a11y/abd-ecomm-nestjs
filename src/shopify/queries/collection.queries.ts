/**
 * Collections na GraphQL Admin API queries.
 *
 * product.queries.ts jevo j niyam — cost-based rate limit chhe, etle queries
 * halki rakhi chhe:
 *   - LIST ma products NATHI magta (dar collection na products = bhaari cost).
 *     Categories row mate title + image puratu chhe.
 *   - Collection na products ALAG query thi aave chhe, jethi jene joiye
 *     e j page e cost bhare.
 */

import { PRODUCT_CARD_FIELDS, type RawProductCard } from './product.queries';

const COLLECTION_CARD_FIELDS = /* GraphQL */ `
  fragment CollectionCard on Collection {
    id
    handle
    title
    updatedAt
    productsCount {
      count
    }
    image {
      url
      altText
      width
      height
    }
  }
`;

export const COLLECTIONS_LIST_QUERY = /* GraphQL */ `
  ${COLLECTION_CARD_FIELDS}

  query CollectionsList(
    $first: Int!
    $after: String
    $query: String
    $sortKey: CollectionSortKeys
    $reverse: Boolean
  ) {
    collections(
      first: $first
      after: $after
      query: $query
      sortKey: $sortKey
      reverse: $reverse
    ) {
      pageInfo {
        hasNextPage
        endCursor
      }
      nodes {
        ...CollectionCard
      }
    }
  }
`;

export const COLLECTION_DETAIL_QUERY = /* GraphQL */ `
  ${COLLECTION_CARD_FIELDS}

  query CollectionDetail($handle: String!) {
    collectionByIdentifier(identifier: { handle: $handle }) {
      ...CollectionCard
      description
    }
  }
`;

/**
 * Collection na products.
 *
 * ⚠️ Shopify ni `Collection.products` connection par `query` argument NATHI —
 * etle products ni list jem `status:ACTIVE` filter karie chhie em ahiya
 * server-side filter thai shakto nathi. Draft/archived products response ma
 * aave chhe ane repository ma kaadhva pade chhe. Eni asar pagination par pade
 * chhe (20 maango, 18 male) — e repository ma samjaavelu chhe.
 */
export const COLLECTION_PRODUCTS_QUERY = /* GraphQL */ `
  ${PRODUCT_CARD_FIELDS}

  query CollectionProducts(
    $handle: String!
    $first: Int!
    $after: String
    $sortKey: ProductCollectionSortKeys
    $reverse: Boolean
  ) {
    collectionByIdentifier(identifier: { handle: $handle }) {
      id
      products(first: $first, after: $after, sortKey: $sortKey, reverse: $reverse) {
        pageInfo {
          hasNextPage
          endCursor
        }
        nodes {
          ...ProductCard
        }
      }
    }
  }
`;

// ---------------------------------------------------------------------------
// Raw Shopify response shapes — FAKT aa folder ni andar vaparva mate.
// ---------------------------------------------------------------------------

export interface RawCollectionImage {
  url: string;
  altText: string | null;
  width: number | null;
  height: number | null;
}

export interface RawCollectionCard {
  id: string;
  handle: string;
  title: string;
  updatedAt: string;
  productsCount: { count: number } | null;
  image: RawCollectionImage | null;
}

export interface RawCollectionDetail extends RawCollectionCard {
  description: string;
}

export interface CollectionsListResponse {
  collections: {
    pageInfo: { hasNextPage: boolean; endCursor: string | null };
    nodes: RawCollectionCard[];
  };
}

export interface CollectionDetailResponse {
  collectionByIdentifier: RawCollectionDetail | null;
}

export interface CollectionProductsResponse {
  collectionByIdentifier: {
    id: string;
    products: {
      pageInfo: { hasNextPage: boolean; endCursor: string | null };
      nodes: RawProductCard[];
    };
  } | null;
}
