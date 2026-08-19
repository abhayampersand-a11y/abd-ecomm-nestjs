import { Type } from 'class-transformer';
import { IsInt, IsOptional, Max, Min } from 'class-validator';

/**
 * Admin panel ma page NUMBERS chhe, cursor nahi.
 *
 * Mobile app ma cursor vaparie chhiye karan ke e Shopify no data chhe ane
 * infinite scroll kare chhe. Admin no data aapda Postgres ma chhe ane panel
 * ne "Page 4 of 37" jevu table joiye chhe — etle ahiya offset j saacho chhe.
 */
export class PaginationDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit: number = 25;
}

export interface AdminPageDto<T> {
  items: T[];
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export function toAdminPage<T>(
  items: T[],
  total: number,
  opts: { page: number; limit: number },
): AdminPageDto<T> {
  return {
    items,
    page: opts.page,
    limit: opts.limit,
    total,
    totalPages: Math.max(Math.ceil(total / opts.limit), 1),
  };
}

/** `page`/`limit` → Prisma na `skip`/`take` */
export function toSkipTake(opts: { page: number; limit: number }): {
  skip: number;
  take: number;
} {
  return { skip: (opts.page - 1) * opts.limit, take: opts.limit };
}
