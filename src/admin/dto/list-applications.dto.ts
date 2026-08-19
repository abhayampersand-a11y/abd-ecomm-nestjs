import { InfluencerApplicationStatus } from '@prisma/client';
import { Transform } from 'class-transformer';
import { IsEnum, IsIn, IsOptional, IsString, MaxLength } from 'class-validator';
import { PaginationDto } from './pagination.dto';

export const APPLICATION_SORTS = ['newest', 'oldest', 'followers'] as const;
export type ApplicationSort = (typeof APPLICATION_SORTS)[number];

export class ListApplicationsDto extends PaginationDto {
  /** Handle, grahak nu naam ke phone — panel ma ek j search box chhe */
  @IsOptional()
  @IsString()
  @MaxLength(200)
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  search?: string;

  /**
   * Na moklo to BADHI applications aave chhe.
   *
   * Panel e default `status=PENDING` moklvu — kholtа venti je kaam baaki chhe
   * e j dekhaay. Default ahiya server ma nathi rakhyo, jethi "aakhu history
   * batavo" pan ek j endpoint thi thai shake.
   */
  @IsOptional()
  @IsEnum(InfluencerApplicationStatus)
  status?: InfluencerApplicationStatus;

  /**
   * `followers` thi motta accounts pehla aave chhe — pan yaad rakhjo ke e
   * aankdo applicant e potej lakhyo chhe, verify thayelo nathi.
   */
  @IsOptional()
  @IsIn(APPLICATION_SORTS)
  sort: ApplicationSort = 'newest';
}
