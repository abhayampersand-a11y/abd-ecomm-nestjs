/**
 * GraphQL Admin API queries.
 *
 * Rate limit cost-based chhe, etle queries jaan-bujhi ne halki rakhi chhe:
 *   - LIST ma variants NATHI magta (dar product na 100 variants = bhaari cost).
 *     Card mate priceRange puratu chhe.
 *   - DETAIL ma j variants aave chhe, ane e pan 100 sudhi.
 *
 * Product.options pan nathi magta — e variants na selectedOptions mathi
 * mapper ma derive thai jaay chhe. Ek field ochhu = ek risk ochho.
 */

const PRODUCT_CARD_FIELDS = /* GraphQL */ `
  fragment ProductCard on Product {
    id
    handle
    title
    vendor
    productType
    tags
    status
    totalInventory
    tracksInventory
    updatedAt
    priceRangeV2 {
      minVariantPrice {
        amount
        currencyCode
      }
      maxVariantPrice {
        amount
        currencyCode
      }
    }
    compareAtPriceRange {
      maxVariantCompareAtPrice {
        amount
        currencyCode
      }
    }
    featuredMedia {
      ... on MediaImage {
        alt
        image {
          url
          width
          height
        }
      }
    }
  }
`;

export const PRODUCTS_LIST_QUERY = /* GraphQL */ `
  ${PRODUCT_CARD_FIELDS}

  query ProductsList(
    $first: Int!
    $after: String
    $query: String
    $sortKey: ProductSortKeys
    $reverse: Boolean
  ) {
    products(
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
        ...ProductCard
      }
    }
  }
`;

export const PRODUCT_DETAIL_QUERY = /* GraphQL */ `
  ${PRODUCT_CARD_FIELDS}

  query ProductDetail($handle: String!) {
    productByIdentifier(identifier: { handle: $handle }) {
      ...ProductCard
      description
      media(first: 15) {
        nodes {
          ... on MediaImage {
            alt
            image {
              url
              width
              height
            }
          }
        }
      }
      variants(first: 100) {
        nodes {
          id
          title
          sku
          availableForSale
          inventoryQuantity
          price
          compareAtPrice
          selectedOptions {
            name
            value
          }
        }
      }
    }
  }
`;

// ---------------------------------------------------------------------------
// Raw Shopify response shapes — FAKT aa folder ni andar vaparva mate.
// Aa types kyarey controller ke DTO sudhi na jaay.
// ---------------------------------------------------------------------------

export interface RawMoney {
  amount: string;
  currencyCode: string;
}

export interface RawMediaImage {
  alt: string | null;
  image: { url: string; width: number | null; height: number | null } | null;
}

export interface RawProductCard {
  id: string;
  handle: string;
  title: string;
  vendor: string | null;
  productType: string | null;
  tags: string[];
  status: string;
  totalInventory: number | null;
  tracksInventory: boolean;
  updatedAt: string;
  priceRangeV2: {
    minVariantPrice: RawMoney;
    maxVariantPrice: RawMoney;
  };
  compareAtPriceRange: {
    maxVariantCompareAtPrice: RawMoney | null;
  } | null;
  featuredMedia: RawMediaImage | null;
}

export interface RawVariant {
  id: string;
  title: string;
  sku: string | null;
  availableForSale: boolean;
  inventoryQuantity: number | null;
  price: string;
  compareAtPrice: string | null;
  selectedOptions: Array<{ name: string; value: string }>;
}

export interface RawProductDetail extends RawProductCard {
  description: string;
  media: { nodes: RawMediaImage[] };
  variants: { nodes: RawVariant[] };
}

export interface ProductsListResponse {
  products: {
    pageInfo: { hasNextPage: boolean; endCursor: string | null };
    nodes: RawProductCard[];
  };
}

export interface ProductDetailResponse {
  productByIdentifier: RawProductDetail | null;
}
