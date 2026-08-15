import { Controller, Get, Param, Query } from '@nestjs/common';
import { ListProductsDto } from './dto/list-products.dto';
import { ProductsService } from './products.service';

/**
 * Public — product browsing mate login ni jarur nathi.
 * (Cart ane orders par JwtAuthGuard aavse.)
 */
@Controller('products')
export class ProductsController {
  constructor(private readonly products: ProductsService) {}

  /**
   * GET /products?limit=20&sort=newest&search=saree&tag=silk&cursor=...
   *
   * Pagination cursor-based chhe (page numbers nahi) — motta catalogs mate
   * aa j saacho raasto chhe ane Shopify pan aa j aape chhe. App ne fakt
   * `nextCursor` pacho mokalvano.
   */
  @Get()
  async list(@Query() query: ListProductsDto) {
    return this.products.list({
      limit: query.limit,
      cursor: query.cursor,
      search: query.search,
      productType: query.type,
      vendor: query.vendor,
      tag: query.tag,
      sort: query.sort,
    });
  }

  /**
   * GET /products/:id
   * `id` = product no handle/slug (daa.t. `blue-cotton-saree`).
   * Shopify na numeric ids app sudhi kyarey nathi jata.
   */
  @Get(':id')
  async findOne(@Param('id') id: string) {
    return this.products.findOne(id);
  }
}
