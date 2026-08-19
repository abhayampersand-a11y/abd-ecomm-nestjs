import { InfluencerApplicationStatus, InfluencerStatus } from '@prisma/client';
import { Transform } from 'class-transformer';
import {
  IsEnum,
  IsIn,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';
import { PaginationDto } from './pagination.dto';

export const APPLICATION_SORTS = ['newest', 'oldest', 'followers'] as const;
export type ApplicationSort = (typeof APPLICATION_SORTS)[number];

export class ListApplicationsDto extends PaginationDto {
  /** Kai j na aapo to badhi — panel default `PENDING` mokle */
  @IsOptional()
  @IsEnum(InfluencerApplicationStatus)
  status?: InfluencerApplicationStatus;

  /** Social handle, naam, phone ke email */
  @IsOptional()
  @IsString()
  @MaxLength(200)
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  search?: string;

  /**
   * `followers` no aankdo APPLICANT E POTE kahelo chhe — verified nathi.
   * Etle e thi sort karvu e "mota" applications ne upar laave chhe, "saacha"
   * ne nahi. Queue triage mate kaam nu chhe, nirnay mate nahi.
   */
  @IsOptional()
  @IsIn(APPLICATION_SORTS)
  sort: ApplicationSort = 'newest';
}

export class ListInfluencersDto extends PaginationDto {
  @IsOptional()
  @IsEnum(InfluencerStatus)
  status?: InfluencerStatus;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  search?: string;
}

export class SuspendInfluencerDto {
  /**
   * `RejectApplicationDto` jevo j niyam: kaaran farjiyat ane 10 akshar ni had.
   * Mahina pachhi "aane kem suspend karyo hato?" no javaab ahiya thi j male chhe.
   */
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MinLength(10, {
    message: 'Give a real reason for the suspension (at least 10 characters)',
  })
  @MaxLength(500)
  reason!: string;
}
