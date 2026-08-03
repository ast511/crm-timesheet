import { IsBoolean, IsOptional } from 'class-validator';

import {
  IsPositionCode,
  IsPositionDescription,
  IsPositionName,
} from './position-field.decorators';

/**
 * Body of `PATCH /api/v1/positions/:id`.
 *
 * Every field is optional, and an absent one means "leave it alone" — Prisma
 * omits `undefined` from the `UPDATE`, so a partial body never blanks a column
 * the client did not mention. `description: null` (or `""`) is the explicit way
 * to clear the description, which is a different request from omitting it.
 *
 * The constraints are the same objects `CreatePositionDto` uses; only the
 * `@IsOptional()` markers differ, which is the entire difference between
 * creating and patching.
 */
export class UpdatePositionDto {
  @IsOptional()
  @IsPositionCode()
  readonly code?: string;

  @IsOptional()
  @IsPositionName()
  readonly name?: string;

  @IsOptional()
  @IsPositionDescription()
  readonly description?: string | null;

  @IsOptional()
  @IsBoolean()
  readonly isActive?: boolean;
}
