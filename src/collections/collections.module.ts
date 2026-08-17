import { Logger, Module, type Provider } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Env } from '../config/env.schema';
import { ShopifyGraphqlClient } from '../shopify/shopify-graphql.client';
import { COLLECTION_REPOSITORY } from './collection.repository';
import { CollectionsController } from './collections.controller';
import { CollectionsService } from './collections.service';
import { ShopifyCollectionRepository } from './shopify-collection.repository';

/**
 * 🔀 products.module.ts jevo j Phase 2 switch.
 *
 * E j `PRODUCT_SOURCE` env var vaparaay chhe — collections ane products ek
 * sathe j migrate thashe (adhu Shopify, adhu Postgres evu rakhvu no matlab
 * nathi: collection na products banne jagya e thi aave to kram ane paging
 * bagde).
 */
const collectionRepositoryProvider: Provider = {
  provide: COLLECTION_REPOSITORY,
  inject: [ConfigService, ShopifyGraphqlClient],
  useFactory: (config: ConfigService<Env, true>, shopify: ShopifyGraphqlClient) => {
    const source = config.get('PRODUCT_SOURCE', { infer: true });

    switch (source) {
      case 'shopify':
        return new ShopifyCollectionRepository(shopify);
      case 'db':
        throw new Error(
          'PRODUCT_SOURCE=db is not ready yet. Add this case after writing ' +
            'DbCollectionRepository in Phase 2.',
        );
      default:
        throw new Error(`Unknown PRODUCT_SOURCE: ${source}`);
    }
  },
};

@Module({
  controllers: [CollectionsController],
  providers: [CollectionsService, collectionRepositoryProvider, Logger],
  exports: [CollectionsService],
})
export class CollectionsModule {}
