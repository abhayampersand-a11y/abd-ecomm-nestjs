import {
  IsEmail,
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
 * Registration screen (screen 05) — OTP verify pachhi, jyare
 * `isNewUser: true` aavyu hoy tyare j dekhaadvani.
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
   * Aa email VERIFIED nathi — fakt contact mate save thay chhe.
   * Juna orders sathe match karva mate user e ene
   * `/auth/identities/verify` thi verify karvo padse.
   */
  @IsOptional()
  @IsEmail({}, { message: 'Email is not valid' })
  @MaxLength(255)
  email?: string;
}

export class LogoutDto {
  @IsOptional()
  @IsString()
  @MaxLength(512)
  refreshToken?: string;
}
