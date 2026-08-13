import { applyDecorators } from '@nestjs/common';
import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

import { Trim } from '../../../common/decorators/trim.decorator';
import { HolidayType } from '../../../generated/prisma/enums';
import {
  PUBLIC_HOLIDAY_DESCRIPTION_MAX_LENGTH,
  PUBLIC_HOLIDAY_MAX_YEAR,
  PUBLIC_HOLIDAY_MIN_YEAR,
  PUBLIC_HOLIDAY_NAME_MAX_LENGTH,
} from '../public-holiday.constants';

/**
 * The per-field rules shared by `CreatePublicHolidayDto` and
 * `UpdatePublicHolidayDto`.
 *
 * The same split the modules before this one use: **constraints** live here,
 * **optionality** stays on the DTO, because `@IsOptional()` — or
 * `@ValidateIfPresent()` — is what distinguishes "create" from "patch" and has
 * to be readable on the class it applies to.
 *
 * `startDate` and `endDate` are not here: they use the shared
 * `@IsIsoDateString()`, and `isNational` / `isRecurring` are plain booleans that
 * `@IsBoolean()` already describes completely.
 */

/**
 * `name` — trimmed, non-empty, bounded. Case is preserved as typed.
 *
 * No upper-casing, unlike the `code` columns elsewhere: this is a proper noun a
 * person reads ("Christmas Day"), not a natural key, and it carries diacritics.
 * The duplicate checks in the service fold the case themselves, so nothing
 * depends on the stored spelling.
 */
export function IsPublicHolidayName() {
  return applyDecorators(
    ApiProperty({
      minLength: 1,
      maxLength: PUBLIC_HOLIDAY_NAME_MAX_LENGTH,
      example: 'Ziua Națională',
    }),
    Trim(),
    IsString(),
    IsNotEmpty(),
    MaxLength(PUBLIC_HOLIDAY_NAME_MAX_LENGTH),
  );
}

/**
 * `description` — trimmed, and blank collapses to `null`.
 *
 * A cleared textarea posts `""`, which is not a shorter description but the
 * absence of one; storing it verbatim would give the column two values meaning
 * "empty" and force every reader to check for both.
 */
export function IsPublicHolidayDescription() {
  return applyDecorators(
    ApiProperty({
      maxLength: PUBLIC_HOLIDAY_DESCRIPTION_MAX_LENGTH,
      description:
        'Trimmed; a blank string is stored as `null` rather than as "".',
    }),
    Transform(({ value }: { value: unknown }) => {
      if (typeof value !== 'string') {
        return value;
      }

      const trimmed = value.trim();

      return trimmed.length === 0 ? null : trimmed;
    }),
    IsString(),
    MaxLength(PUBLIC_HOLIDAY_DESCRIPTION_MAX_LENGTH),
  );
}

/**
 * `validFromYear` / `validToYear` — a whole year inside the bounds the calendar
 * endpoints accept.
 *
 * The same bounds on purpose: a version valid from a year no calendar can ask
 * about would be a row nothing could ever return.
 *
 * `@IsInt()` and not `@Type(() => Number)`: these arrive in a JSON body, where
 * `2026` and `"2026"` are genuinely different values, and coercing the string
 * would accept a payload the client should fix. It is the same call
 * `estimatedHours` makes on projects — and the opposite of the one the path
 * parameters make, where a segment is text by definition.
 *
 * Nullability stays on the DTO, because `null` is a real request here: it is
 * how an end of the range is opened again.
 */
export function IsPublicHolidayYear() {
  return applyDecorators(
    ApiProperty({
      type: 'integer',
      minimum: PUBLIC_HOLIDAY_MIN_YEAR,
      maximum: PUBLIC_HOLIDAY_MAX_YEAR,
      example: 2026,
    }),
    IsInt(),
    Min(PUBLIC_HOLIDAY_MIN_YEAR),
    Max(PUBLIC_HOLIDAY_MAX_YEAR),
  );
}

/**
 * `type` — `FIXED` or `VARIABLE`.
 *
 * The API vocabulary is the TypeScript one, not the stored one (`fixed`):
 * Prisma maps between them, and publishing the database spelling would tie the
 * payload to a `@map` that exists for PostgreSQL's benefit.
 */
export function IsHolidayType() {
  return applyDecorators(IsEnum(HolidayType));
}
