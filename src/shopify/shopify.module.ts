import { Global, Module } from '@nestjs/common';
import { ShopifyAddressService } from './shopify-address.service';
import { ShopifyCheckoutService } from './shopify-checkout.service';
import { ShopifyCustomerService } from './shopify-customer.service';
import { ShopifyGraphqlClient } from './shopify-graphql.client';
import { ShopifyOrderService } from './shopify-order.service';
import { ShopifyStorefrontClient } from './shopify-storefront.client';
import { ShopifyTokenService } from './shopify-token.service';

/**
 * Shopify sathe vaat karvani EK j jagya.
 *
 * Aakhi app ma bija koi module e `fetch()` thi Shopify ne call na karvu —
 * badhu ahiya thi. Migration vakhte aa module kaadhi naakhvanu chhe, ane e
 * tyare j sahelu rahese jyare enu kaam ahiya j simit hoy.
 */
@Global()
@Module({
  providers: [
    ShopifyTokenService,
    ShopifyGraphqlClient,
    ShopifyCustomerService,
    ShopifyAddressService,
    ShopifyOrderService,
    ShopifyStorefrontClient,
    ShopifyCheckoutService,
  ],
  exports: [
    ShopifyTokenService,
    ShopifyGraphqlClient,
    ShopifyCustomerService,
    ShopifyAddressService,
    ShopifyOrderService,
    ShopifyStorefrontClient,
    ShopifyCheckoutService,
  ],
})
export class ShopifyModule {}
