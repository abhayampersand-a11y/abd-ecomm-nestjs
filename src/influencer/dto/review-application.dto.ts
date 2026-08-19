import { Transform } from 'class-transformer';
import { IsString, MaxLength, MinLength } from 'class-validator';

export class RejectApplicationDto {
  /**
   * Aa kaaran APPLICANT NE DEKHAAY CHHE, etle farjiyat chhe ane 10 akshar ni
   * had chhe. "no" jevu lakhi ne mokli na shakay — je vyakti e mahenat kari
   * ne apply karyu chhe ene khabar padvi joiye ke su khoot chhe.
   */
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MinLength(10, { message: 'Give the applicant a real reason (at least 10 characters)' })
  @MaxLength(500)
  reason!: string;
}
