import { Module } from '@nestjs/common';
import { CollectionsModule } from '../collections/collections.module';
import { ProductsModule } from '../products/products.module';
import { ContentController } from './content.controller';
import { ContentService } from './content.service';

/**
 * Home sections products ane collections resolve kare chhe, etle e be
 * modules joiye chhe. Prisma ane Redis global chhe.
 */
@Module({
  imports: [ProductsModule, CollectionsModule],
  controllers: [ContentController],
  providers: [ContentService],
  exports: [ContentService],
})
export class ContentModule {}
