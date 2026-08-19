import { IsIn, IsOptional } from 'class-validator';
import { PaginationDto } from './pagination.dto';

export const CACHE_SCOPES = ['products', 'collections', 'orders', 'all'] as const;
export type CacheScope = (typeof CACHE_SCOPES)[number];

export class FlushCacheDto {
  /**
   * Shopify ma kaik badlyu ane app ma juno dekhaay chhe — tyare aa.
   * Webhooks (Phase 2) aavse pachhi aa button ni jarur nahi rahe.
   */
  @IsOptional()
  @IsIn(CACHE_SCOPES)
  scope: CacheScope = 'all';
}

export class ListPendingAddressSyncDto extends PaginationDto {}
