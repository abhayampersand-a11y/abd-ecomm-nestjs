/**
 * Storefront API — cart banaavvi ane checkout par mokalvu.
 *
 * ⚠️ Aa file ni badhi queries **Storefront** API ni chhe, Admin ni nahi.
 * `ShopifyStorefrontClient` thi j chalavvi — Admin client thi chalavso to
 * "field doesn't exist" jevi gundhaayeli bhoolо aavse.
 */

export const CART_CREATE_MUTATION = /* GraphQL */ `
  mutation CartCreate($input: CartInput!) {
    cartCreate(input: $input) {
      cart {
        id
        checkoutUrl
        totalQuantity
      }
      userErrors {
        field
        message
      }
    }
  }
`;

export interface RawCart {
  id: string;
  checkoutUrl: string;
  totalQuantity: number;
}

export interface CartCreateResponse {
  cartCreate: {
    cart: RawCart | null;
    userErrors: Array<{ field: string[] | null; message: string }>;
  };
}
