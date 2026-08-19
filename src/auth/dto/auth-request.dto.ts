import {
  IsNotEmpty,
  IsOptional,
  IsString,
  Length,
  MaxLength,
} from 'class-validator';

export class RequestOtpDto {
  /**
   * Phone athva email — banne aa ek j field ma. App ne be alag screens
   * banavva nathi padta, ane backend normalize kari le chhe.
   * Daa.t. "9876543210", "+91 98765 43210", "abc@gmail.com"
   */
  @IsString()
  @IsNotEmpty({ message: 'Phone number or email is required' })
  @MaxLength(255)
  identifier!: string;
}

export class VerifyOtpDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  identifier!: string;

  @IsString()
  @Length(4, 8, { message: 'OTP is not valid' })
  code!: string;

  /** Session ne device sathe bandhva mate — logout/audit ma kaam aave chhe */
  @IsOptional()
  @IsString()
  @MaxLength(128)
  deviceId?: string;
}

export class RefreshTokenDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(512)
  refreshToken!: string;

  @IsOptional()
  @IsString()
  @MaxLength(128)
  deviceId?: string;
}

/**
 * Profile screen (36) nu edit.
 *
 * ⚠️ Ahiya EMAIL NATHI — jaan-bujhi ne. Email fakt OTP verify thay tyare j
 * account par aave chhe (`/auth/identities/verify`). Un-verified email
 * kyanya store nathi thato.
 */
export class UpdateProfileDto {
  @IsOptional()
  @IsString()
  @MaxLength(80)
  firstName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  lastName?: string;

  /**
   * Screen 36 nu "Additional Information → Gender".
   * Jaan-bujhi ne khullo String — kaya vikalpo batavva e app nakki kare chhe,
   * server e fakt saachvvanu chhe.
   */
  @IsOptional()
  @IsString()
  @MaxLength(32)
  gender?: string;
}

export class LogoutDto {
  @IsOptional()
  @IsString()
  @MaxLength(512)
  refreshToken?: string;
}
