import { DevicePlatform } from '@prisma/client';
import { IsEnum, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class RegisterDeviceDto {
  @IsEnum(DevicePlatform)
  platform!: DevicePlatform;

  /** FCM/APNs no token. App e dar launch e mokalvo — e badlaato rahe chhe. */
  @IsString()
  @MinLength(10)
  @MaxLength(500)
  token!: string;

  /** Ek j device ne oLakhvani aapdi rit — logout vakhte kaam aave chhe */
  @IsOptional()
  @IsString()
  @MaxLength(200)
  deviceId?: string;
}

export class UnregisterDeviceDto {
  @IsString()
  @MinLength(10)
  @MaxLength(500)
  token!: string;
}
