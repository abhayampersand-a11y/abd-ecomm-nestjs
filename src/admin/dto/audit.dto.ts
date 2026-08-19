import { IsISO8601, IsOptional, IsString, MaxLength } from 'class-validator';
import { PaginationDto } from './pagination.dto';

export class ListAuditLogsDto extends PaginationDto {
  /** "customer.block" jevu — aakho match, `/admin/audit-logs/actions` mathi lo */
  @IsOptional()
  @IsString()
  @MaxLength(100)
  action?: string;

  /** "customer" | "banner" | "notification" | "system" ... */
  @IsOptional()
  @IsString()
  @MaxLength(50)
  entityType?: string;

  /** Ek j record no itihaas jovo hoy tyare */
  @IsOptional()
  @IsString()
  @MaxLength(100)
  entityId?: string;

  @IsOptional()
  @IsISO8601()
  since?: string;
}
