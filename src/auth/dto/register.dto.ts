import { IsEmail, IsString, MinLength, MaxLength } from 'class-validator';

export class RegisterDto {
  @IsEmail()
  email: string;

  @IsString()
  @MinLength(8)
  @MaxLength(72) // bcrypt max input length
  password: string;

  @IsString()
  @MinLength(2)
  @MaxLength(100)
  fullName: string;
}
