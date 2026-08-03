import { IsBoolean, IsOptional } from 'class-validator';

import {
  IsPositionCode,
  IsPositionDescription,
  IsPositionName,
} from './position-field.decorators';

/**
 * Body of `POST /api/v1/positions`.
 *
 * `code` and `name` are the only required fields; `isActive` is left to the
 * schema's `true` default rather than repeated here, so "a new position is
 * active" stays one decision made in one place.
 *
 * Unknown properties never reach this class — the global `ValidationPipe` runs
 * with `forbidNonWhitelisted`, so a typo in a payload is a 400 rather than a
 * silently ignored field.
 */
export class CreatePositionDto {
  @IsPositionCode()
  readonly code!: string;

  @IsPositionName()
  readonly name!: string;

  @IsOptional()
  @IsPositionDescription()
  readonly description?: string | null;

  @IsOptional()
  @IsBoolean()
  readonly isActive?: boolean;
}
