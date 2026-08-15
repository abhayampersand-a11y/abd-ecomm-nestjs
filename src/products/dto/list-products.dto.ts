import { Type } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import type { ProductSort } from '../product.repository';

const SORTS: ProductSort[] = ['newest', 'oldest', 'title', 'updated', 'relevance'];

export class ListProductsDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  limit: number = 20;

  /** Aagli page no cursor — response na `nextCursor` mathi as-is pacho aapo */
  @IsOptional()
  @IsString()
  @MaxLength(512)
  cursor?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  search?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  type?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  vendor?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  tag?: string;

  /**
   * ⚠️ Price sort ahiya jaan-bujhi ne nathi.
   * Shopify na Admin API ma products connection par price no sort key j
   * nathi. Phase 2 ma jyare data Postgres ma hase tyare `price_asc` /
   * `price_desc` ummerashe — tyare fakt DbProductRepository ma, aa DTO ane
   * mobile app ma ek line pan badlava vagar.
   */
  @IsOptional()
  @IsIn(SORTS)
  sort: ProductSort = 'newest';
}
