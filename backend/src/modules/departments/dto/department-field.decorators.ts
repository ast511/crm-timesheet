import { applyDecorators } from '@nestjs/common';
import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsNotEmpty, IsString, Matches, MaxLength } from 'class-validator';

import { Trim } from '../../../common/decorators/trim.decorator';
import {
  DEPARTMENT_CODE_MAX_LENGTH,
  DEPARTMENT_CODE_PATTERN,
  DEPARTMENT_DESCRIPTION_MAX_LENGTH,
  DEPARTMENT_NAME_MAX_LENGTH,
} from '../department.constants';

/**
 * The per-field rules shared by `CreateDepartmentDto` and
 * `UpdateDepartmentDto`.
 *
 * Without this file the two DTOs would each spell out the same four decorators
 * per field, and the day a length or a pattern changes, one of them would be
 * missed. Composing with Nest's `applyDecorators` keeps that in one place
 * without adding a dependency — `PartialType` from `@nestjs/mapped-types` is
 * the usual answer, but the package is not installed and installing one is not
 * this feature's call to make.
 *
 * The split is deliberate: **constraints** live here, **optionality** stays on
 * the DTO. `@IsOptional()` is what distinguishes "create" from "patch", so it
 * has to be readable on the class it applies to rather than hidden behind a
 * flag passed to a decorator factory.
 */

/**
 * `code` — trimmed, upper-cased, then checked.
 *
 * Upper-casing is normalisation, not cosmetics: PostgreSQL's unique index is
 * case-sensitive, so without it `dev` and `DEV` would be two departments as far
 * as the database is concerned. Folding the case at the edge makes that index
 * the real guarantee rather than a partial one.
 */
export function IsDepartmentCode() {
  return applyDecorators(
    ApiProperty({
      minLength: 1,
      maxLength: DEPARTMENT_CODE_MAX_LENGTH,
      pattern: DEPARTMENT_CODE_PATTERN,
      example: 'IT',
      description: 'Trimmed and upper-cased before it is stored or compared.',
    }),
    Transform(({ value }: { value: unknown }) =>
      typeof value === 'string' ? value.trim().toUpperCase() : value,
    ),
    IsString(),
    IsNotEmpty(),
    MaxLength(DEPARTMENT_CODE_MAX_LENGTH),
    Matches(DEPARTMENT_CODE_PATTERN, {
      message:
        'code must contain only letters and digits, optionally separated by "-" or "_"',
    }),
  );
}

/** `name` — trimmed, non-empty, bounded. Case is preserved as typed. */
export function IsDepartmentName() {
  return applyDecorators(
    ApiProperty({
      minLength: 1,
      maxLength: DEPARTMENT_NAME_MAX_LENGTH,
      example: 'Information Technology',
    }),
    Trim(),
    IsString(),
    IsNotEmpty(),
    MaxLength(DEPARTMENT_NAME_MAX_LENGTH),
  );
}

/**
 * `description` — trimmed, and blank collapses to `null`.
 *
 * A cleared textarea posts `""`, which is not a shorter description but the
 * absence of one; storing it verbatim would give the column two values meaning
 * "empty" and force every reader to check for both. The resulting `null` is
 * skipped by the `@IsOptional()` on the property, so clearing a description is
 * a valid request rather than a failed `@IsString()`.
 */
export function IsDepartmentDescription() {
  return applyDecorators(
    ApiProperty({
      maxLength: DEPARTMENT_DESCRIPTION_MAX_LENGTH,
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
    MaxLength(DEPARTMENT_DESCRIPTION_MAX_LENGTH),
  );
}
