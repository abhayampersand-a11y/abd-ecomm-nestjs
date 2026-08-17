import { Controller, Get, Param, Query } from '@nestjs/common';
import { CollectionsService } from './collections.service';
import { ListCollectionProductsDto } from './dto/list-collection-products.dto';
import { ListCollectionsDto } from './dto/list-collections.dto';

/**
 * Public — products jevu j, browsing mate login ni jarur nathi.
 */
@Controller('collections')
export class CollectionsController {
  constructor(private readonly collections: CollectionsService) {}

  /**
   * GET /collections?limit=20&sort=title&search=saree&cursor=...
   *
   * Home page ni categories row ane "See all" page — banne aa j endpoint
   * vaapre chhe, fakt `limit` alag (row mate 8, See all mate 20+).
   */
  @Get()
  async list(@Query() query: ListCollectionsDto) {
    return this.collections.list({
      limit: query.limit,
      cursor: query.cursor,
      search: query.search,
      sort: query.sort,
    });
  }

  /**
   * GET /collections/:id
   * `id` = collection no handle/slug (daa.t. `summer-sale`).
   *
   * Category page nu header (title, image, description) mate. Products
   * alag endpoint ma chhe jethi header ni ek request e aakhi product list
   * no cost na bhare.
   */
  @Get(':id')
  async findOne(@Param('id') id: string) {
    return this.collections.findOne(id);
  }

  /**
   * GET /collections/:id/products?limit=20&sort=manual&cursor=...
   *
   * Aa endpoint `/products` jevo j `ProductSummaryDto` aape chhe — app ma
   * ek j product card component badhe kaam kare chhe.
   */
  @Get(':id/products')
  async listProducts(
    @Param('id') id: string,
    @Query() query: ListCollectionProductsDto,
  ) {
    return this.collections.listProducts({
      handle: id,
      limit: query.limit,
      cursor: query.cursor,
      sort: query.sort,
    });
  }
}
