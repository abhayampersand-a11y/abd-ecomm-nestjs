/**
 * Grahak na potana orders.
 *
 * ⚠️ Aa badhi queries `customer_id:` filter SATHE j chale chhe. Filter vagar
 * kyarey na chalavvi — nahi to ek grahak ne bija na orders dekhaay.
 *
 * ⚠️ `read_all_orders` scope vagar Shopify fakt chhella 60 divas na orders
 * aape chhe. Aa store par e scope chhe (juo `npm run shopify:scopes`), pan
 * navi jagya e deploy karo tyare aa pehli vastu check karvi.
 */

const MONEY_FRAGMENT = /* GraphQL */ `
  fragment Money on MoneyBag {
    shopMoney {
      amount
      currencyCode
    }
  }
`;

const ORDER_CARD_FRAGMENT = /* GraphQL */ `
  fragment OrderCard on Order {
    id
    name
    createdAt
    cancelledAt
    displayFinancialStatus
    displayFulfillmentStatus
    customer {
      id
    }
    currentTotalPriceSet {
      ...Money
    }
    lineItems(first: 50) {
      nodes {
        id
        title
        variantTitle
        sku
        quantity
        image {
          url
          altText
          width
          height
        }
        discountedTotalSet {
          ...Money
        }
        product {
          handle
        }
      }
    }
  }
`;

export const CUSTOMER_ORDERS_QUERY = /* GraphQL */ `
  ${MONEY_FRAGMENT}
  ${ORDER_CARD_FRAGMENT}
  query CustomerOrders($query: String!, $first: Int!, $after: String) {
    orders(
      first: $first
      after: $after
      query: $query
      sortKey: CREATED_AT
      reverse: true
    ) {
      pageInfo {
        hasNextPage
        endCursor
      }
      nodes {
        ...OrderCard
      }
    }
  }
`;

export const ORDER_DETAIL_QUERY = /* GraphQL */ `
  ${MONEY_FRAGMENT}
  ${ORDER_CARD_FRAGMENT}
  query OrderDetail($query: String!) {
    orders(first: 1, query: $query) {
      nodes {
        ...OrderCard
        currentSubtotalPriceSet {
          ...Money
        }
        currentTotalTaxSet {
          ...Money
        }
        currentTotalDiscountsSet {
          ...Money
        }
        totalShippingPriceSet {
          ...Money
        }
        shippingAddress {
          firstName
          lastName
          phone
          address1
          address2
          city
          province
          zip
          country
        }
        fulfillments(first: 10) {
          trackingInfo {
            company
            number
            url
          }
        }
      }
    }
  }
`;

// ---------------------------------------------------------------------------
// Shopify na raw shapes — aa types aa folder ni bahar na jaay
// ---------------------------------------------------------------------------

export interface RawMoneyBag {
  shopMoney: { amount: string; currencyCode: string };
}

export interface RawOrderImage {
  url: string;
  altText: string | null;
  width: number | null;
  height: number | null;
}

export interface RawOrderLineItem {
  id: string;
  title: string;
  variantTitle: string | null;
  sku: string | null;
  quantity: number;
  image: RawOrderImage | null;
  discountedTotalSet: RawMoneyBag;
  product: { handle: string } | null;
}

export interface RawOrderShippingAddress {
  firstName: string | null;
  lastName: string | null;
  phone: string | null;
  address1: string | null;
  address2: string | null;
  city: string | null;
  province: string | null;
  zip: string | null;
  country: string | null;
}

export interface RawOrderCard {
  id: string;
  name: string;
  createdAt: string;
  cancelledAt: string | null;
  displayFinancialStatus: string | null;
  displayFulfillmentStatus: string | null;
  /** Guest checkout ma null hoy shake — tyare aa order koi na account no nathi */
  customer: { id: string } | null;
  currentTotalPriceSet: RawMoneyBag;
  lineItems: { nodes: RawOrderLineItem[] };
}

export interface RawOrderDetail extends RawOrderCard {
  currentSubtotalPriceSet: RawMoneyBag;
  currentTotalTaxSet: RawMoneyBag;
  currentTotalDiscountsSet: RawMoneyBag;
  totalShippingPriceSet: RawMoneyBag;
  shippingAddress: RawOrderShippingAddress | null;
  fulfillments: Array<{
    trackingInfo: Array<{
      company: string | null;
      number: string | null;
      url: string | null;
    }>;
  }>;
}

export interface CustomerOrdersResponse {
  orders: {
    pageInfo: { hasNextPage: boolean; endCursor: string | null };
    nodes: RawOrderCard[];
  };
}

export interface OrderDetailResponse {
  orders: { nodes: RawOrderDetail[] };
}
