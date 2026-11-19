import { Body, Controller, HttpCode, Post } from '@nestjs/common';
import { IsEmail, IsString, MaxLength, MinLength } from 'class-validator';
import { AuthService } from './auth.service';

class LoginDto {
  @IsEmail({}, { message: 'E-mail invalide.' })
  email: string;

  @IsString()
  @MinLength(1, { message: 'Mot de passe requis.' })
  @MaxLength(200)
  password: string;
}

@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  /** Super admin (Kapta owner). */
  @Post('admin/login')
  @HttpCode(200)
  loginSuperAdmin(@Body() body: LoginDto) {
    return this.auth.loginSuperAdmin(body.email, body.password);
  }

  /** A client's account, from the Kapta app. */
  @Post('login')
  @HttpCode(200)
  loginClientUser(@Body() body: LoginDto) {
    return this.auth.loginClientUser(body.email, body.password);
  }
}
