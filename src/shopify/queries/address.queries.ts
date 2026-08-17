/**
 * Customer ADDRESS BOOK — `customer.queries.ts` na order-addresses thi aa
 * sav alag vastu chhe:
 *
 *   customer.queries.ts  → juna ORDERS na shippingAddress (read-only snapshot)
 *   aa file              → customer no potano ADDRESS BOOK (read + write)
 *
 * User e website par address book ma je save karyu hoy e ahiya thi male chhe,
 * ane app ma save kare e ahiya thi Shopify ma jaay chhe.
 *
 * ⚠️ Aa badhu 2026-07 schema par introspect kari ne lakhelu chhe. Version
 * badlo to fari verify karvu — Shopify e juna versions ma address mutations
 * ek karta vadhu vaar badlyu chhe.
 */

const MAILING_ADDRESS_FIELDS = /* GraphQL */ `
  fragment MailingAddressFields on MailingAddress {
    id
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
    countryCodeV2
  }
`;

/**
 * `addresses` nahi, **`addressesV2`** — juno `addresses` field kaadhi
 * naakhelo chhe ane aa connection chhe (pagination sathe).
 */
export const CUSTOMER_ADDRESS_BOOK_QUERY = /* GraphQL */ `
  ${MAILING_ADDRESS_FIELDS}
  query CustomerAddressBook($id: ID!, $first: Int!) {
    customer(id: $id) {
      id
      defaultAddress {
        id
      }
      addressesV2(first: $first) {
        nodes {
          ...MailingAddressFields
        }
      }
    }
  }
`;

export const CUSTOMER_ADDRESS_CREATE_MUTATION = /* GraphQL */ `
  ${MAILING_ADDRESS_FIELDS}
  mutation CustomerAddressCreate(
    $customerId: ID!
    $address: MailingAddressInput!
    $setAsDefault: Boolean
  ) {
    customerAddressCreate(
      customerId: $customerId
      address: $address
      setAsDefault: $setAsDefault
    ) {
      address {
        ...MailingAddressFields
      }
      userErrors {
        field
        message
      }
    }
  }
`;

export const CUSTOMER_ADDRESS_UPDATE_MUTATION = /* GraphQL */ `
  ${MAILING_ADDRESS_FIELDS}
  mutation CustomerAddressUpdate(
    $customerId: ID!
    $addressId: ID!
    $address: MailingAddressInput!
    $setAsDefault: Boolean
  ) {
    customerAddressUpdate(
      customerId: $customerId
      addressId: $addressId
      address: $address
      setAsDefault: $setAsDefault
    ) {
      address {
        ...MailingAddressFields
      }
      userErrors {
        field
        message
      }
    }
  }
`;

export const CUSTOMER_ADDRESS_DELETE_MUTATION = /* GraphQL */ `
  mutation CustomerAddressDelete($customerId: ID!, $addressId: ID!) {
    customerAddressDelete(customerId: $customerId, addressId: $addressId) {
      deletedAddressId
      userErrors {
        field
        message
      }
    }
  }
`;

export const CUSTOMER_DEFAULT_ADDRESS_UPDATE_MUTATION = /* GraphQL */ `
  mutation CustomerUpdateDefaultAddress($customerId: ID!, $addressId: ID!) {
    customerUpdateDefaultAddress(
      customerId: $customerId
      addressId: $addressId
    ) {
      customer {
        id
      }
      userErrors {
        field
        message
      }
    }
  }
`;

// ---------------------------------------------------------------------------
// Raw shapes — fakt src/shopify/ ni andar vaparva
// ---------------------------------------------------------------------------

/**
 * ⚠️ Read ma `country` (naam) ANE `countryCodeV2` (enum) banne male chhe, pan
 * WRITE ma Shopify fakt `countryCode` leve chhe. `country`/`province` naam
 * e Shopify jate code parthi kaadhe chhe — mokalva jaso to schema error aavse.
 */
export interface RawMailingAddress {
  id: string;
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
  countryCodeV2: string | null;
}

/** Shopify ne WRITE karva no shape — read karta ochha fields chhe */
export interface MailingAddressInput {
  firstName?: string;
  lastName?: string;
  phone?: string;
  address1?: string;
  address2?: string;
  city?: string;
  provinceCode?: string;
  zip?: string;
  countryCode?: string;
  company?: string;
}

interface UserErrors {
  userErrors: Array<{ field: string[] | null; message: string }>;
}

export interface CustomerAddressBookResponse {
  customer: {
    id: string;
    defaultAddress: { id: string } | null;
    addressesV2: { nodes: RawMailingAddress[] };
  } | null;
}

export interface AddressMutationResponse {
  customerAddressCreate?: { address: RawMailingAddress | null } & UserErrors;
  customerAddressUpdate?: { address: RawMailingAddress | null } & UserErrors;
  customerAddressDelete?: { deletedAddressId: string | null } & UserErrors;
  customerUpdateDefaultAddress?: { customer: { id: string } | null } & UserErrors;
}
