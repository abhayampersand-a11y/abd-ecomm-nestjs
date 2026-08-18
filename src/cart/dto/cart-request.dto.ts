import { Type } from 'class-transformer';
import {
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

export class AddCartItemDto {
  /** Product no handle — `GET /products/:id` ma je vaparyu e j */
  @IsString()
  @MinLength(1)
  @MaxLength(255)
  productId!: string;

  /** Variant token — product detail na `variants[].id` mathi as-is */
  @IsString()
  @MinLength(1)
  @MaxLength(64)
  variantId!: string;

  /**
   * Uparni had jaan-bujhi ne — koi 10,000 nag no order na naakhi de.
   * Aa thi vadhu joitu hoy to e wholesale chhe, app nu kaam nathi.
   */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(20)
  quantity: number = 1;
}

export class UpdateCartItemDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(20)
  quantity!: number;
}

export class ApplyDiscountDto {
  @IsString()
  @MinLength(1)
  @MaxLength(64)
  code!: string;
}
