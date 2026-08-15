/**
 * Ek vyakti na Shopify records ane ena juna orders shodhva mate.
 *
 * Be step ma kem: Shopify na orders search ma `phone:` filter bharosaapatr
 * nathi, pan customers search ma chhe. Etle pehla customer(s) shodhiye, pachhi
 * ena `customer_id` thi orders. Aa vadhu reliable chhe ane sathe sathe aapne
 * ShopifyCustomerLink pan bhari shakiye chhiye.
 */

export const CUSTOMERS_SEARCH_QUERY = /* GraphQL */ `
  query CustomersSearch($query: String!, $first: Int!) {
    customers(first: $first, query: $query) {
      nodes {
        id
        email
        phone
        firstName
        lastName
        numberOfOrders
      }
    }
  }
`;

export const CUSTOMER_ORDER_ADDRESSES_QUERY = /* GraphQL */ `
  query CustomerOrderAddresses($query: String!, $first: Int!) {
    orders(first: $first, query: $query, sortKey: CREATED_AT, reverse: true) {
      nodes {
        id
        name
        createdAt
        shippingAddress {
          firstName
          lastName
          phone
          address1
          address2
          city
          province
          provinceCode
          zip
          country
          countryCode
        }
      }
    }
  }
`;

/**
 * App ma signup thayelo user Shopify ma pan banaviye chhiye, jethi team ne
 * admin ma dekhaay ane website par pan e j vyakti tarike ole khaay.
 *
 * `tags: ["mobile-app"]` jaan-bujhi ne — Shopify admin ma filter kari ne
 * khabar pade ke kaya customers app mathi aavya.
 */
export const CUSTOMER_CREATE_MUTATION = /* GraphQL */ `
  mutation CustomerCreate($input: CustomerInput!) {
    customerCreate(input: $input) {
      customer {
        id
        email
        phone
      }
      userErrors {
        field
        message
      }
    }
  }
`;

export const CUSTOMER_UPDATE_MUTATION = /* GraphQL */ `
  mutation CustomerUpdate($input: CustomerInput!) {
    customerUpdate(input: $input) {
      customer {
        id
        email
        phone
      }
      userErrors {
        field
        message
      }
    }
  }
`;

// ---------------------------------------------------------------------------
// Raw shapes — fakt src/shopify/ ni andar
// ---------------------------------------------------------------------------

export interface CustomerMutationResponse {
  customerCreate?: {
    customer: { id: string; email: string | null; phone: string | null } | null;
    userErrors: Array<{ field: string[] | null; message: string }>;
  };
  customerUpdate?: {
    customer: { id: string; email: string | null; phone: string | null } | null;
    userErrors: Array<{ field: string[] | null; message: string }>;
  };
}

export interface RawShopifyCustomer {
  id: string;
  email: string | null;
  phone: string | null;
  firstName: string | null;
  lastName: string | null;
  numberOfOrders: string;
}

export interface RawShippingAddress {
  firstName: string | null;
  lastName: string | null;
  phone: string | null;
  address1: string | null;
  address2: string | null;
  city: string | null;
  province: string | null;
  provinceCode: string | null;
  zip: string | null;
  country: string | null;
  countryCode: string | null;
}

export interface RawOrderAddress {
  id: string;
  name: string;
  createdAt: string;
  shippingAddress: RawShippingAddress | null;
}

export interface CustomersSearchResponse {
  customers: { nodes: RawShopifyCustomer[] };
}

export interface CustomerOrderAddressesResponse {
  orders: { nodes: RawOrderAddress[] };
}
