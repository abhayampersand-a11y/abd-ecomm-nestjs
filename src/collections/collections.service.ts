import { Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash } from 'node:crypto';
import type {
  CollectionDto,
  CollectionSummaryDto,
} from '../common/dto/collection.dto';
import type { PageDto, ProductSummaryDto } from '../common/dto/product.dto';
import type { Env } from '../config/env.schema';
import { RedisService } from '../redis/redis.service';
import {
  COLLECTION_REPOSITORY,
  type CollectionListParams,
  type CollectionProductsParams,
  type CollectionRepository,
} from './collection.repository';

/**
 * ProductsService jevi j rachana — cache ahiya chhe, repository ma nahi.
 *
 * Collections products karta ochha badlaay chhe (merchant mahina e ek vaar
 * navu category banaave), etle eno TTL alag ane lambo chhe.
 */
@Injectable()
export class CollectionsService {
  private readonly logger = new Logger(CollectionsService.name);

  constructor(
    @Inject(COLLECTION_REPOSITORY) private readonly repo: CollectionRepository,
    private readonly redis: RedisService,
    private readonly config: ConfigService<Env, true>,
  ) {}

  async list(
    params: CollectionListParams,
  ): Promise<PageDto<CollectionSummaryDto>> {
    const key = `collections:list:${this.fingerprint(params)}`;
    const ttl = this.config.get('COLLECTION_LIST_CACHE_TTL', { infer: true });

    const cached = await this.redis.getJson<PageDto<CollectionSummaryDto>>(key);
    if (cached) return cached;

    const result = await this.repo.list(params);
    await this.redis.setJson(key, result, ttl);
    return result;
  }

  async findOne(handle: string): Promise<CollectionDto> {
    const key = `collections:detail:${handle}`;
    const ttl = this.config.get('COLLECTION_DETAIL_CACHE_TTL', { infer: true });

    const cached = await this.redis.getJson<CollectionDto>(key);
    if (cached) return cached;

    const collection = await this.repo.findByHandle(handle);
    if (!collection) {
      throw new NotFoundException('Aa collection male nahi');
    }

    await this.redis.setJson(key, collection, ttl);
    return collection;
  }

  /**
   * Aa PRODUCT no data chhe (collection no nahi), etle jaan-bujhi ne
   * `PRODUCT_LIST_CACHE_TTL` vaparaay chhe — price/stock badlaay tyare
   * category page pan etli j jaldi taazu thavu joiye jetlu `/products`.
   */
  async listProducts(
    params: CollectionProductsParams,
  ): Promise<PageDto<ProductSummaryDto>> {
    const key = `collections:products:${this.fingerprintProducts(params)}`;
    const ttl = this.config.get('PRODUCT_LIST_CACHE_TTL', { infer: true });

    const cached = await this.redis.getJson<PageDto<ProductSummaryDto>>(key);
    if (cached) return cached;

    const result = await this.repo.listProducts(params);
    if (!result) {
      throw new NotFoundException('Aa collection male nahi');
    }

    await this.redis.setJson(key, result, ttl);
    return result;
  }

  /**
   * Phase 2 ma `collections/update` webhook aa call karshe.
   *
   * Products no cache pan saaf kariye chhiye: collection ma product ummeraay
   * ke nikde tyare `/collections/:id/products` juno rahi jaay to app ma
   * kaadhi naakhelo product dekhaata rahe.
   */
  async invalidate(handle?: string): Promise<void> {
    if (handle) {
      await this.redis.del(`collections:detail:${handle}`);
    }
    const lists = await this.redis.delByPattern('collections:list:*');
    const products = await this.redis.delByPattern('collections:products:*');
    this.logger.log(
      `Collection cache invalidated${handle ? ` for ${handle}` : ''} ` +
        `(${lists} list, ${products} product entries)`,
    );
  }

  /** ProductsService jevu j — lambo cursor/search Redis key na fulaave */
  private fingerprint(params: CollectionListParams): string {
    return hash({
      l: params.limit,
      c: params.cursor ?? '',
      s: params.search ?? '',
      o: params.sort,
    });
  }

  private fingerprintProducts(params: CollectionProductsParams): string {
    return hash({
      h: params.handle,
      l: params.limit,
      c: params.cursor ?? '',
      o: params.sort,
    });
  }
}

function hash(value: unknown): string {
  return createHash('sha1')
    .update(JSON.stringify(value))
    .digest('hex')
    .slice(0, 16);
}
