import {
  IsBoolean,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';

export class CreateAddressDto {
  @IsOptional() @IsString() @MaxLength(80) firstName?: string;
  @IsOptional() @IsString() @MaxLength(80) lastName?: string;
  @IsOptional() @IsString() @MaxLength(30) phone?: string;

  @IsString() @MinLength(3) @MaxLength(200) line1!: string;
  @IsOptional() @IsString() @MaxLength(200) line2?: string;

  @IsString() @MinLength(2) @MaxLength(100) city!: string;
  @IsOptional() @IsString() @MaxLength(100) province?: string;
  @IsOptional() @IsString() @MaxLength(10) provinceCode?: string;

  @IsString() @MinLength(3) @MaxLength(20) zip!: string;

  @IsString() @MinLength(2) @MaxLength(100) country!: string;
  @IsOptional() @IsString() @MaxLength(2) countryCode?: string;

  @IsOptional() @IsBoolean() isDefault?: boolean;
}

export class UpdateAddressDto {
  @IsOptional() @IsString() @MaxLength(80) firstName?: string;
  @IsOptional() @IsString() @MaxLength(80) lastName?: string;
  @IsOptional() @IsString() @MaxLength(30) phone?: string;

  @IsOptional() @IsString() @MinLength(3) @MaxLength(200) line1?: string;
  @IsOptional() @IsString() @MaxLength(200) line2?: string;

  @IsOptional() @IsString() @MinLength(2) @MaxLength(100) city?: string;
  @IsOptional() @IsString() @MaxLength(100) province?: string;
  @IsOptional() @IsString() @MaxLength(10) provinceCode?: string;

  @IsOptional() @IsString() @MinLength(3) @MaxLength(20) zip?: string;

  @IsOptional() @IsString() @MinLength(2) @MaxLength(100) country?: string;
  @IsOptional() @IsString() @MaxLength(2) countryCode?: string;

  @IsOptional() @IsBoolean() isDefault?: boolean;
}
