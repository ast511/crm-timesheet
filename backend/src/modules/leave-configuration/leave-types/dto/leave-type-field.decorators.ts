import { applyDecorators } from '@nestjs/common';
import { Transform } from 'class-transformer';
import {
  IsInt,
  IsNotEmpty,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

import { Trim } from '../../../../common/decorators/trim.decorator';
import {
  LEAVE_TYPE_CODE_MAX_LENGTH,
  LEAVE_TYPE_CODE_PATTERN,
  LEAVE_TYPE_COLOR_PATTERN,
  LEAVE_TYPE_DESCRIPTION_MAX_LENGTH,
  LEAVE_TYPE_ICON_MAX_LENGTH,
  LEAVE_TYPE_LABEL_MAX_LENGTH,
  LEAVE_TYPE_MAX_ALLOCATED_DAYS,
  LEAVE_TYPE_MIN_ALLOCATED_DAYS,
  LEAVE_TYPE_REPORT_MARKER_MAX_LENGTH,
  LEAVE_TYPE_REPORT_MARKER_PATTERN,
} from '../leave-type.constants';

/**
 * The per-field rules shared by `CreateLeaveTypeDto` and `UpdateLeaveTypeDto`.
 *
 * The same split every module before this one uses: **constraints** live here,
 * **optionality** stays on the DTO, because `@IsOptional()` — or
 * `@ValidateIfPresent()` — is what distinguishes "create" from "patch" and has
 * to be readable on the class it applies to.
 *
 * The three booleans are not here: `@IsBoolean()` already describes each of them
 * completely, and wrapping it would add a name without adding a rule.
 */

/**
 * `code` — trimmed, upper-cased, then checked.
 *
 * Upper-casing is normalisation, not cosmetics: PostgreSQL's unique index is
 * case-sensitive, so without it `annual` and `ANNUAL` would be two leave types
 * as far as the database is concerned. Folding the case at the edge makes that
 * index the real guarantee rather than a partial one.
 */
export function IsLeaveTypeCode() {
  return applyDecorators(
    Transform(({ value }: { value: unknown }) =>
      typeof value === 'string' ? value.trim().toUpperCase() : value,
    ),
    IsString(),
    IsNotEmpty(),
    MaxLength(LEAVE_TYPE_CODE_MAX_LENGTH),
    Matches(LEAVE_TYPE_CODE_PATTERN, {
      message:
        'code must contain only letters and digits, optionally separated by "-" or "_"',
    }),
  );
}

/**
 * `reportMarker` — trimmed, upper-cased, then checked against the one-to-three
 * character pattern.
 *
 * Upper-casing is the same normalisation `code` gets and for the same reason:
 * PostgreSQL's unique index is case-sensitive, so without it `c` and `C` would
 * be two markers as far as the database is concerned — and a grid printing both
 * would have two legend entries for what a reader sees as one letter.
 *
 * Unlike `code`, this is not a natural key anybody quotes. It is a glyph a
 * report cell prints, which is why the pattern is narrower and the length bound
 * is three rather than twenty. Whether the marker is already taken is the
 * service's question, checked alongside `code` and `label`.
 */
export function IsLeaveTypeReportMarker() {
  return applyDecorators(
    Transform(({ value }: { value: unknown }) =>
      typeof value === 'string' ? value.trim().toUpperCase() : value,
    ),
    IsString(),
    IsNotEmpty(),
    MaxLength(LEAVE_TYPE_REPORT_MARKER_MAX_LENGTH),
    Matches(LEAVE_TYPE_REPORT_MARKER_PATTERN, {
      message:
        'reportMarker must be 1 to 3 letters or digits, with no spaces or punctuation',
    }),
  );
}

/**
 * `label` — trimmed, non-empty, bounded. Case is preserved as typed.
 *
 * No upper-casing, unlike `code`: this is the text a person reads on a leave
 * form ("Annual Leave"), and it carries diacritics. The duplicate check in the
 * service folds the case itself, so nothing depends on the stored spelling.
 */
export function IsLeaveTypeLabel() {
  return applyDecorators(
    Trim(),
    IsString(),
    IsNotEmpty(),
    MaxLength(LEAVE_TYPE_LABEL_MAX_LENGTH),
  );
}

/**
 * `icon` — trimmed, non-empty, bounded. Stored exactly as typed.
 *
 * No pattern, and no case folding. Icon sets do not agree on a spelling —
 * `umbrella-beach`, `umbrellaBeach`, `ph:umbrella-beach` are all real
 * conventions — so a pattern would reject whichever set the frontend happens to
 * ship, and lower-casing would quietly turn a camelCase key into one that
 * resolves to nothing. The name a client sends is the name a client gets back.
 *
 * What the column is *for* has not changed: it holds the **name** of an icon,
 * not the icon. The drawing behind that name differs between the web app, a
 * native client and a PDF export, and only the consumer knows which one it has.
 * That intent is now carried by the length bound and by the field's
 * documentation rather than by a regular expression.
 */
export function IsLeaveTypeIcon() {
  return applyDecorators(
    Trim(),
    IsString(),
    IsNotEmpty(),
    MaxLength(LEAVE_TYPE_ICON_MAX_LENGTH),
  );
}

/**
 * `color` — trimmed, upper-cased, blank collapses to `null`, then checked
 * against `#RRGGBB`.
 *
 * Upper-casing is the same normalisation `code` gets and for a related reason: a
 * colour picker emits `#3b82f6` while a designer's spec says `#3B82F6`, and
 * without folding the case the two would be different strings for one colour —
 * enough to break an equality check in a calendar legend.
 *
 * Blank becoming `null` is what lets a UI clear the accent by submitting an
 * emptied input, rather than storing `""` in a column whose only valid contents
 * are seven characters long.
 */
export function IsLeaveTypeColor() {
  return applyDecorators(
    Transform(({ value }: { value: unknown }) => {
      if (typeof value !== 'string') {
        return value;
      }

      const trimmed = value.trim();

      return trimmed.length === 0 ? null : trimmed.toUpperCase();
    }),
    IsString(),
    Matches(LEAVE_TYPE_COLOR_PATTERN, {
      message: 'color must be a HEX colour in the form #RRGGBB',
    }),
  );
}

/**
 * `description` — trimmed, and blank collapses to `null`.
 *
 * A cleared textarea posts `""`, which is not a shorter description but the
 * absence of one; storing it verbatim would give the column two values meaning
 * "empty" and force every reader to check for both. The resulting `null` is
 * skipped by the `@IsOptional()` on the property, so clearing a description is a
 * valid request rather than a failed `@IsString()`.
 */
export function IsLeaveTypeDescription() {
  return applyDecorators(
    Transform(({ value }: { value: unknown }) => {
      if (typeof value !== 'string') {
        return value;
      }

      const trimmed = value.trim();

      return trimmed.length === 0 ? null : trimmed;
    }),
    IsString(),
    MaxLength(LEAVE_TYPE_DESCRIPTION_MAX_LENGTH),
  );
}

/**
 * `defaultAllocatedDays` — a whole number of days, never negative, bounded by a
 * calendar year.
 *
 * `@IsInt()` and not `@Type(() => Number)`: this arrives in a JSON body, where
 * `21` and `"21"` are genuinely different values, and coercing the string would
 * accept a payload the client should fix. Half days are rejected too — this is a
 * suggested allocation in whole days, and `21.5` would be silently truncated by
 * the `integer` column.
 *
 * Nullability stays on the DTO, because `null` is a real request here: it is how
 * a leave type says it suggests nothing, which is a different statement from
 * suggesting zero days.
 */
export function IsLeaveTypeAllocatedDays() {
  return applyDecorators(
    IsInt(),
    Min(LEAVE_TYPE_MIN_ALLOCATED_DAYS),
    Max(LEAVE_TYPE_MAX_ALLOCATED_DAYS),
  );
}

/**
 * `maxCarryOverDays` — the ceiling on what survives a year-end, in whole days.
 *
 * The same bounds as the allocation, and reusing those constants is deliberate
 * rather than lazy: both are a count of days inside one calendar year, held in
 * the same `integer` column type, and a cap larger than a year could not bind
 * anything a year can produce. Two copies of `366` would be two numbers to keep
 * in step.
 *
 * `0` is legal and is not the same as omitting the field: it says days may carry
 * over but none of them may, which is how a policy is expressed while it is being
 * phased out. *No cap* is `null`, which the DTO allows and this decorator never
 * sees.
 *
 * Nothing here checks it against `allowsCarryOver`. A cap on a type that carries
 * nothing over is inert rather than contradictory, and rejecting the pair would
 * stop HR from setting the ceiling first and turning the policy on afterwards.
 */
export function IsLeaveTypeCarryOverDays() {
  return applyDecorators(
    IsInt(),
    Min(LEAVE_TYPE_MIN_ALLOCATED_DAYS),
    Max(LEAVE_TYPE_MAX_ALLOCATED_DAYS),
  );
}
