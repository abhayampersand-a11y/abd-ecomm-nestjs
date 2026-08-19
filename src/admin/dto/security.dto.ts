import { OtpPurpose } from '@prisma/client';
import { Transform, Type } from 'class-transformer';
import {
  IsEnum,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { PaginationDto } from './pagination.dto';

export const OTP_LOG_STATUSES = ['pending', 'consumed', 'expired'] as const;
export type OtpLogStatus = (typeof OTP_LOG_STATUSES)[number];

export class ListOtpLogsDto extends PaginationDto {
  /** Phone ke email — jem type karyu hoy tem, normalize aapne kari laishu */
  @IsOptional()
  @IsString()
  @MaxLength(200)
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  identifier?: string;

  @IsOptional()
  @IsEnum(OtpPurpose)
  purpose?: OtpPurpose;

  @IsOptional()
  @IsIn(OTP_LOG_STATUSES)
  status?: OtpLogStatus;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  ip?: string;
}

export class OtpStatsDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(90)
  days: number = 7;
}

/**
 * "Mane OTP j nathi aavto" — support no sauthi saamanya call.
 *
 * Ghana khara kisso ma user e 5 vaar resend dabaavyu hoy chhe ane hourly
 * limit lagi gai hoy chhe. Aa endpoint e limit chhoodave chhe — OTP mokalto
 * NATHI, ane code to kyarey nathi j batavto.
 */
export class ResetOtpLimitDto {
  @IsOptional()
  @IsString()
  @MaxLength(200)
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  identifier?: string;

  /** Aakhi office ek j IP par thi test kare tyare kaam aave chhe */
  @IsOptional()
  @IsString()
  @MaxLength(64)
  ip?: string;
}

export class ListSessionsDto extends PaginationDto {}
