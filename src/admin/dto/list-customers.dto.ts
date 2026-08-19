import { CustomerStatus } from '@prisma/client';
import { Transform } from 'class-transformer';
import { IsBooleanString, IsEnum, IsIn, IsOptional, IsString, MaxLength } from 'class-validator';
import { PaginationDto } from './pagination.dto';

export const CUSTOMER_SORTS = ['newest', 'oldest', 'lastLogin', 'name'] as const;
export type CustomerSort = (typeof CUSTOMER_SORTS)[number];

export class ListCustomersDto extends PaginationDto {
  /**
   * Phone, email, naam ke Shopify customer id — ek j box ma badhu.
   * Panel ma ek j search bar hoy chhe, etle API pan ek j field le chhe.
   */
  @IsOptional()
  @IsString()
  @MaxLength(200)
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  search?: string;

  @IsOptional()
  @IsEnum(CustomerStatus)
  status?: CustomerStatus;

  @IsOptional()
  @IsIn(CUSTOMER_SORTS)
  sort: CustomerSort = 'newest';

  /** 'true' = fakt e customers jemna Shopify records jodayela chhe */
  @IsOptional()
  @IsBooleanString()
  linkedToShopify?: string;
}
