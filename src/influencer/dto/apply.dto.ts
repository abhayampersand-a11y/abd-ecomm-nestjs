import { Transform } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

/** Aavti kaale navu platform aavse — etle list ahiya, DB ma enum nahi. */
export const SOCIAL_PLATFORMS = ['instagram', 'youtube', 'facebook'] as const;
export type SocialPlatform = (typeof SOCIAL_PLATFORMS)[number];

export class ApplyDto {
  /**
   * "@priya.styles" ke "priya.styles" — banne chale chhe. Leading @ ane
   * aakhu URL kaadhi naakhiye chhiye, jethi DB ma ek j swaroop rahe ane
   * admin be alag dekhaata handle ne be alag vyakti na samje.
   */
  @Transform(({ value }) =>
    typeof value === 'string'
      ? value
          .trim()
          .replace(/^https?:\/\/(www\.)?[^/]+\//i, '')
          .replace(/\/+$/, '')
          .replace(/^@+/, '')
      : value,
  )
  @IsString()
  @MinLength(2)
  @MaxLength(60)
  @Matches(/^[A-Za-z0-9._-]+$/, {
    message: 'Handle can only contain letters, numbers, dots, underscores and hyphens',
  })
  socialHandle!: string;

  @IsIn(SOCIAL_PLATFORMS, {
    message: `Platform must be one of: ${SOCIAL_PLATFORMS.join(', ')}`,
  })
  socialPlatform!: SocialPlatform;

  /**
   * Applicant potej kahe chhe — verify NATHI thatu. Fakt queue sort karva
   * kaam nu chhe; admin e jate profile kholi ne joi levu.
   *
   * Upar ni had 500 million chhe — koi pan asli account thi vadhare — jethi
   * dhyaan-khenchvа mate koi 9999999999 na naakhe.
   */
  @IsInt()
  @Min(0)
  @Max(500_000_000)
  followerCount!: number;

  /**
   * India no PAN — payout mate jaruri chhe (TDS).
   * Format: 5 akshar, 4 aankda, 1 akshar. Uppercase ma normalize thay chhe.
   */
  @Transform(({ value }) =>
    typeof value === 'string' ? value.trim().toUpperCase().replace(/\s+/g, '') : value,
  )
  @IsString()
  @Matches(/^[A-Z]{5}[0-9]{4}[A-Z]$/, {
    message: 'PAN must look like ABCDE1234F',
  })
  panNumber!: string;
}
