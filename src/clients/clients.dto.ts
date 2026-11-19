import {
  IsBoolean,
  IsEmail,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';

export class CreateClientDto {
  @IsString()
  @MinLength(2, { message: 'Nom du client requis.' })
  @MaxLength(100)
  name: string;

  @IsString()
  @MaxLength(300)
  backendUrl: string;
}

export class UpdateClientDto {
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  backendUrl?: string;

  @IsOptional()
  @IsBoolean()
  active?: boolean;
}

export class CreateClientUserDto {
  @IsEmail({}, { message: 'E-mail invalide.' })
  email: string;

  @IsString()
  @MinLength(8, {
    message: 'Le mot de passe doit faire au moins 8 caractères.',
  })
  @MaxLength(200)
  password: string;
}

export class UpdateClientUserDto {
  @IsOptional()
  @IsBoolean()
  active?: boolean;

  @IsOptional()
  @IsString()
  @MinLength(8, {
    message: 'Le mot de passe doit faire au moins 8 caractères.',
  })
  @MaxLength(200)
  password?: string;
}
