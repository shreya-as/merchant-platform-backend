import { IsEmail, IsEnum, IsNotEmpty, IsString, MaxLength, MinLength } from 'class-validator';
import { RoleType } from '../../../common/enums';

export class LoginDto {
  @IsEmail()
  @MaxLength(255)
  email: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(128) // bcrypt only uses the first 72 bytes; cap input to avoid hashing huge payloads
  password: string;
}

// ADMIN-only: creates an internal staff account. There is no public self-registration.
export class RegisterDto {
  @IsEmail()
  @MaxLength(255)
  email: string;

  @IsString()
  @MinLength(8)
  @MaxLength(72)
  password: string;

  @IsEnum(RoleType)
  role: RoleType;
}
