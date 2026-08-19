import { Transform, Type } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { PaginationDto } from './pagination.dto';

export const CART_SORTS = ['updated', 'oldest', 'items'] as const;
export type CartSort = (typeof CART_SORTS)[number];

export class ListCartsDto extends PaginationDto {
  @IsOptional()
  @IsIn(CART_SORTS)
  sort: CartSort = 'updated';

  /**
   * Fakt e carts jene aatla kalak thi koi e hath nathi lagaadyo.
   * `/abandoned` route aane 24 rakhi ne j chale chhe.
   */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(8760)
  idleHours?: number;

  /** Grahak no phone, email ke naam */
  @IsOptional()
  @IsString()
  @MaxLength(200)
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  search?: string;
}
