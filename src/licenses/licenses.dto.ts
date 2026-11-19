import { Type } from 'class-transformer';
import {
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

// The app sends a stable id generated once per installation.
const DEVICE_ID = /^[A-Za-z0-9._:-]{8,128}$/;
const DEVICE_ID_MESSAGE = 'Identifiant du téléphone invalide.';

export class GenerateCodesDto {
  /** License length given by each code. */
  @Type(() => Number)
  @IsInt({ message: 'La durée doit être un nombre de jours.' })
  @Min(1)
  @Max(3650)
  durationDays: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  count?: number;

  /** Days left to use the code before it expires; empty = no limit. */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(365)
  validForDays?: number;
}

export class ActivateDto {
  @IsString()
  @MaxLength(40)
  code: string;

  @IsString()
  @Matches(DEVICE_ID, { message: DEVICE_ID_MESSAGE })
  deviceId: string;
}

export class LicenseStatusQuery {
  @IsString()
  @Matches(DEVICE_ID, { message: DEVICE_ID_MESSAGE })
  deviceId: string;
}
