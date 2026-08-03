import { applyDecorators } from '@nestjs/common';
import { Transform } from 'class-transformer';
import {
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

import { Trim } from '../../../common/decorators/trim.decorator';
import {
  ProjectPriority,
  ProjectStatus,
} from '../../../generated/prisma/enums';
import {
  PROJECT_CLIENT_NAME_MAX_LENGTH,
  PROJECT_CODE_MAX_LENGTH,
  PROJECT_CODE_PATTERN,
  PROJECT_COLOR_PATTERN,
  PROJECT_DESCRIPTION_MAX_LENGTH,
  PROJECT_MAX_ESTIMATED_HOURS,
  PROJECT_MIN_ESTIMATED_HOURS,
  PROJECT_NAME_MAX_LENGTH,
} from '../project.constants';

/**
 * The per-field rules shared by `CreateProjectDto` and `UpdateProjectDto`.
 *
 * The same split the four modules before this one use: **constraints** live
 * here, **optionality** stays on the DTO, because `@IsOptional()` — or
 * `@ValidateIfPresent()` — is what distinguishes "create" from "patch" and has
 * to be readable on the class it applies to.
 *
 * `startDate` and `endDate` are not here. They use the shared
 * `@IsIsoDateString()`: Feature 013 found the same rule written for a third
 * date column and moved it into `common/decorators`, since nothing in it was
 * specific to a project.
 */

/**
 * `code` — trimmed, upper-cased, then checked.
 *
 * Upper-casing is normalisation, not cosmetics: PostgreSQL's unique index is
 * case-sensitive, so without it `crm-ts` and `CRM-TS` would be two projects as
 * far as the database is concerned. Folding the case at the edge makes that
 * index the real guarantee rather than a partial one.
 */
export function IsProjectCode() {
  return applyDecorators(
    Transform(({ value }: { value: unknown }) =>
      typeof value === 'string' ? value.trim().toUpperCase() : value,
    ),
    IsString(),
    IsNotEmpty(),
    MaxLength(PROJECT_CODE_MAX_LENGTH),
    Matches(PROJECT_CODE_PATTERN, {
      message:
        'code must contain only letters and digits, optionally separated by "-" or "_"',
    }),
  );
}

/** `name` — trimmed, non-empty, bounded. Case is preserved as typed. */
export function IsProjectName() {
  return applyDecorators(
    Trim(),
    IsString(),
    IsNotEmpty(),
    MaxLength(PROJECT_NAME_MAX_LENGTH),
  );
}

/**
 * `clientName` — trimmed, non-empty, bounded.
 *
 * No pattern, for the same reason people's names have none: a company name
 * carries diacritics, ampersands, dots and legal suffixes (`S.R.L.`, `& Co`),
 * and every pattern narrow enough to be worth writing eventually rejects a real
 * customer. An internal project names the company itself rather than leaving
 * this empty, which is why the column is not nullable.
 */
export function IsProjectClientName() {
  return applyDecorators(
    Trim(),
    IsString(),
    IsNotEmpty(),
    MaxLength(PROJECT_CLIENT_NAME_MAX_LENGTH),
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
export function IsProjectDescription() {
  return applyDecorators(
    Transform(({ value }: { value: unknown }) => {
      if (typeof value !== 'string') {
        return value;
      }

      const trimmed = value.trim();

      return trimmed.length === 0 ? null : trimmed;
    }),
    IsString(),
    MaxLength(PROJECT_DESCRIPTION_MAX_LENGTH),
  );
}

/**
 * `estimatedHours` — a whole number of hours, never negative, bounded.
 *
 * `@IsInt()` and not `@Type(() => Number)`: this arrives in a JSON body, where
 * `120` and `"120"` are genuinely different values, and coercing the string
 * would accept a payload the client should fix. Half-hours are rejected too —
 * an estimate is a budget in whole hours, and `120.5` would be silently
 * truncated by the `integer` column.
 */
export function IsProjectEstimatedHours() {
  return applyDecorators(
    IsInt(),
    Min(PROJECT_MIN_ESTIMATED_HOURS),
    Max(PROJECT_MAX_ESTIMATED_HOURS),
  );
}

/**
 * `color` — trimmed, upper-cased, blank collapses to `null`, then checked
 * against `#RRGGBB`.
 *
 * Upper-casing is the same normalisation `code` gets and for a related reason:
 * a colour picker emits `#3b82f6` while a designer's spec says `#3B82F6`, and
 * without folding the case the two would be different strings for one colour —
 * enough to break an equality check in a legend or a diff of two projects.
 *
 * Blank becoming `null` is what lets a UI clear the accent by submitting an
 * emptied input, rather than storing `""` in a column whose only valid contents
 * are seven characters long.
 */
export function IsProjectColor() {
  return applyDecorators(
    Transform(({ value }: { value: unknown }) => {
      if (typeof value !== 'string') {
        return value;
      }

      const trimmed = value.trim();

      return trimmed.length === 0 ? null : trimmed.toUpperCase();
    }),
    IsString(),
    Matches(PROJECT_COLOR_PATTERN, {
      message: 'color must be a HEX colour in the form #RRGGBB',
    }),
  );
}

/**
 * `projectStatus` — one of the `ProjectStatus` values the column accepts.
 *
 * The API vocabulary is the TypeScript one (`ON_HOLD`), not the stored one
 * (`on_hold`): Prisma maps between them, and publishing the database spelling
 * would tie the payload to a `@map` that exists for PostgreSQL's benefit.
 */
export function IsProjectStatus() {
  return applyDecorators(IsEnum(ProjectStatus));
}

/** `projectPriority` — one of the `ProjectPriority` values, on the same terms. */
export function IsProjectPriority() {
  return applyDecorators(IsEnum(ProjectPriority));
}
