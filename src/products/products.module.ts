import { Logger, Module, type Provider } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Env } from '../config/env.schema';
import { ShopifyGraphqlClient } from '../shopify/shopify-graphql.client';
import { PRODUCT_REPOSITORY } from './product.repository';
import { ProductsController } from './products.controller';
import { ProductsService } from './products.service';
import { ShopifyProductRepository } from './shopify-product.repository';

/**
 * 🔀 PHASE 2 NO SWITCH — aa 15 line j aakhi migration no seam chhe.
 *
 * Aaje `PRODUCT_SOURCE=shopify` chhe, etle live Shopify API vaparaay chhe.
 * Phase 2 ma:
 *   1. `DbProductRepository` lakhо (Postgres mathi, e j `ProductRepository`
 *      interface implement karine)
 *   2. Nichhe ek case ummero
 *   3. `.env` ma `PRODUCT_SOURCE=db` karo
 *
 * ProductsService, ProductsController ane mobile app — tran ma thi ek pan
 * nathi badlavanu. Shadow-read karvu hoy (banne source thi vaanchi ne compare
 * karvu) to e pan ahiya j ek wrapper repository thi thai shake.
 */
const productRepositoryProvider: Provider = {
  provide: PRODUCT_REPOSITORY,
  inject: [ConfigService, ShopifyGraphqlClient],
  useFactory: (config: ConfigService<Env, true>, shopify: ShopifyGraphqlClient) => {
    const source = config.get('PRODUCT_SOURCE', { infer: true });

    switch (source) {
      case 'shopify':
        return new ShopifyProductRepository(shopify);
      case 'db':
        throw new Error(
          'PRODUCT_SOURCE=db is not ready yet. Add this case after writing ' +
            'DbProductRepository in Phase 2.',
        );
      default:
        throw new Error(`Unknown PRODUCT_SOURCE: ${source}`);
    }
  },
};

@Module({
  controllers: [ProductsController],
  providers: [ProductsService, productRepositoryProvider, Logger],
  exports: [ProductsService],
})
export class ProductsModule {}
