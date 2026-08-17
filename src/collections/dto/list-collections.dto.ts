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
import type { CollectionSort } from '../collection.repository';

const SORTS: CollectionSort[] = ['title', 'updated', 'relevance'];

export class ListCollectionsDto {
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

  /**
   * Default `title` chhe (products ma `newest` chhe) — categories row ma
   * kram sthir rahevo joiye. `updated` hoy to merchant koi juni category ne
   * edit kare etle e achaanak pehli aavi jaay.
   */
  @IsOptional()
  @IsIn(SORTS)
  sort: CollectionSort = 'title';
}
