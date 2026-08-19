import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class AdminLoginDto {
  /**
   * `@IsEmail()` jaan-bujhi ne nathi — validation error j kahi de ke "email
   * no format khoto chhe", ane e login form par bijo hint chhe. Ahiya badhu
   * ek j javaab ma khatm thavu joiye: "Email or password is incorrect".
   */
  @IsString()
  @IsNotEmpty()
  @MaxLength(320)
  email!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  password!: string;
}
