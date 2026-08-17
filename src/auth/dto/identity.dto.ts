import { IsNotEmpty, IsString, Length, MaxLength } from 'class-validator';

/**
 * "Juna orders nathi dekhata? Website par bijo email vaparyo hato?"
 * — aa flow na DTOs.
 *
 * Logged-in user potano bijo email/phone verify kare, ane e verify thaya
 * pachhi j ena juna Shopify records link thay chhe.
 */
export class RequestIdentityOtpDto {
  @IsString()
  @IsNotEmpty({ message: 'Phone number or email is required' })
  @MaxLength(255)
  identifier!: string;
}

export class VerifyIdentityDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  identifier!: string;

  @IsString()
  @Length(4, 8, { message: 'OTP is not valid' })
  code!: string;
}
