import { Transform, Type } from 'class-transformer';
import {
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

/**
 * ⚠️ `primaryPhone` ane `primaryEmail` ahiya JAAN-BUJHI NE NATHI.
 *
 * Aa be fields ma fakt OTP thi verified values j jaay chhe (juo schema no
 * INVARIANT comment). Admin ne e edit karva devathi ek j PATCH thi koi pan
 * account bija na phone par jodai jaay — etle e raasto j band rakhyo chhe.
 * Kharekhar badalvu hoy to user e potana device par thi OTP verify karvo pade.
 *
 * Un-verified email nu koi field pan nathi — e concept j kaadhi nakhyu chhe.
 * Admin ne grahak no email nondhvo hoy to grahak e pote verify karvo pade.
 */
export class UpdateCustomerDto {
  @IsOptional()
  @IsString()
  @MaxLength(100)
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  firstName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  lastName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  gender?: string;

}

export class BlockCustomerDto {
  /**
   * Fakt server log ma jaay chhe — audit table Phase 2 ma aavse.
   * (Ek j admin chhe etle "kone karyu" no sawaal atyare nathi, "kem karyu"
   * no chhe.)
   */
  @IsOptional()
  @IsString()
  @MaxLength(300)
  reason?: string;
}

export class ListCustomerOrdersDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  limit: number = 20;

  /** Shopify no cursor — aagli page mate response no `nextCursor` as-is pacho aapo */
  @IsOptional()
  @IsString()
  @MaxLength(512)
  cursor?: string;
}
