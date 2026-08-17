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
import type { CollectionProductSort } from '../collection.repository';

const SORTS: CollectionProductSort[] = [
  'manual',
  'bestselling',
  'newest',
  'title',
  'price_asc',
  'price_desc',
];

export class ListCollectionProductsDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  limit: number = 20;

  @IsOptional()
  @IsString()
  @MaxLength(512)
  cursor?: string;

  /**
   * Default `manual` — merchant e Shopify ma je kram goThavyo hoy e j.
   * Home page na section mate aa j joiye; user filter badle tyare j badlaay.
   */
  @IsOptional()
  @IsIn(SORTS)
  sort: CollectionProductSort = 'manual';
}
