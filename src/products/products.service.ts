import { Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash } from 'node:crypto';
import type {
  PageDto,
  ProductDto,
  ProductSummaryDto,
} from '../common/dto/product.dto';
import type { Env } from '../config/env.schema';
import { RedisService } from '../redis/redis.service';
import {
  PRODUCT_REPOSITORY,
  type ProductListParams,
  type ProductRepository,
} from './product.repository';

/**
 * Cache ahiya chhe, repository ma nahi — jaan-bujhi ne.
 *
 * Phase 2 ma jyare source Postgres banse, tyare aa j caching layer kaam
 * karti rahese (ya kaadhi shakay, karan ke Postgres pehla thi j fast chhe).
 * Repository ne cache ni khabar nathi, cache ne source ni khabar nathi.
 */
@Injectable()
export class ProductsService {
  private readonly logger = new Logger(ProductsService.name);

  constructor(
    @Inject(PRODUCT_REPOSITORY) private readonly repo: ProductRepository,
    private readonly redis: RedisService,
    private readonly config: ConfigService<Env, true>,
  ) {}

  async list(params: ProductListParams): Promise<PageDto<ProductSummaryDto>> {
    const key = `products:list:${this.fingerprint(params)}`;
    const ttl = this.config.get('PRODUCT_LIST_CACHE_TTL', { infer: true });

    const cached = await this.redis.getJson<PageDto<ProductSummaryDto>>(key);
    if (cached) return cached;

    const result = await this.repo.list(params);
    await this.redis.setJson(key, result, ttl);
    return result;
  }

  async findOne(id: string): Promise<ProductDto> {
    const key = `products:detail:${id}`;
    const ttl = this.config.get('PRODUCT_DETAIL_CACHE_TTL', { infer: true });

    const cached = await this.redis.getJson<ProductDto>(key);
    if (cached) return cached;

    const product = await this.repo.findById(id);
    if (!product) {
      throw new NotFoundException('Product not found');
    }

    await this.redis.setJson(key, product, ttl);
    return product;
  }

  /**
   * Phase 2 ma `products/update` webhook aa call karshe, jethi price ke stock
   * badlaay etle app ma turat dekhaay ane TTL ni raah na jovi pade.
   */
  async invalidate(id?: string): Promise<void> {
    if (id) {
      await this.redis.del(`products:detail:${id}`);
    }
    const cleared = await this.redis.delByPattern('products:list:*');
    this.logger.log(
      `Product cache invalidated${id ? ` for ${id}` : ''} (${cleared} list entries)`,
    );
  }

  /**
   * Cache key. Params ne hash kariye chhiye jethi lambo search string ke
   * cursor Redis key ne 500 characters no na banaavi de.
   */
  private fingerprint(params: ProductListParams): string {
    const canonical = JSON.stringify({
      l: params.limit,
      c: params.cursor ?? '',
      s: params.search ?? '',
      t: params.productType ?? '',
      v: params.vendor ?? '',
      g: params.tag ?? '',
      o: params.sort,
    });
    return createHash('sha1').update(canonical).digest('hex').slice(0, 16);
  }
}
