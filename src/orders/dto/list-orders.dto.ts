import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';

export class ListOrdersDto {
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
}
