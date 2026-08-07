import { applyDecorators } from '@nestjs/common';
import { Transform } from 'class-transformer';
import {
  IsInt,
  IsNumber,
  IsPositive,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

import {
  TIMESHEET_ENTRY_DESCRIPTION_MAX_LENGTH,
  TIMESHEET_HOURS_DECIMAL_PLACES,
  TIMESHEET_MAX_ENTRY_HOURS,
  TIMESHEET_MAX_MONTH,
  TIMESHEET_MAX_YEAR,
  TIMESHEET_MIN_MONTH,
  TIMESHEET_MIN_YEAR,
  TIMESHEET_REJECTION_REASON_MAX_LENGTH,
} from '../timesheet-management.constants';

/**
 * The per-field rules shared by the timesheet DTOs.
 *
 * The same split every module since Feature 007 uses: **constraints** live here,
 * **optionality** stays on the DTO, because `@IsOptional()` is what distinguishes
 * a create from a patch and has to be readable on the class it applies to.
 *
 * `projectId` is not here: it uses the shared `@IsRelationId()`, which Feature
 * 013 moved into `common/decorators` precisely so a fifth module would not write
 * it again. Nor is `date`, which uses the shared `@IsIsoDateString()`.
 *
 * **Nothing here consults the work schedule**, and that is the boundary worth
 * stating. These decorators check that a payload is *shaped* like a timesheet —
 * a month is one of twelve, hours are a positive number with two decimals — and
 * every rule that depends on configuration (the daily ceiling, the weekly one,
 * whether that weekday is worked at all) belongs to `TimesheetFillService`, which
 * is the only thing that can read it. A `@Max(8)` here would be this file
 * inventing a working day.
 */

/**
 * `month` — one of the twelve, in a **query string**.
 *
 * Coerced from text, because this only ever arrives as a query parameter, where a
 * number has no other way to travel. That is the opposite call
 * {@link IsTimesheetBodyMonth} makes, and the distinction matters: in a JSON body
 * `9` and `"9"` are genuinely different values and the string is a payload the
 * client should fix.
 */
export function IsTimesheetQueryMonth() {
  return applyDecorators(
    CoerceNumber(),
    IsInt(),
    Min(TIMESHEET_MIN_MONTH),
    Max(TIMESHEET_MAX_MONTH),
  );
}

/** `year` — a plausible calendar year, in a query string. */
export function IsTimesheetQueryYear() {
  return applyDecorators(
    CoerceNumber(),
    IsInt(),
    Min(TIMESHEET_MIN_YEAR),
    Max(TIMESHEET_MAX_YEAR),
  );
}

/**
 * `month` — one of the twelve, in a **JSON body**.
 *
 * Not coerced, for the reason above. That a month is not in the *future* is a
 * rule about the pair and about the clock, so it is checked in the service — see
 * `assertMonthIsFillable`.
 */
export function IsTimesheetBodyMonth() {
  return applyDecorators(
    IsInt(),
    Min(TIMESHEET_MIN_MONTH),
    Max(TIMESHEET_MAX_MONTH),
  );
}

/** `year` — a plausible calendar year, in a JSON body. */
export function IsTimesheetBodyYear() {
  return applyDecorators(
    IsInt(),
    Min(TIMESHEET_MIN_YEAR),
    Max(TIMESHEET_MAX_YEAR),
  );
}

/**
 * `hours` — how long one entry is.
 *
 * `@IsPositive()` rather than `@Min(0)`, because the rule is *greater than* zero:
 * an entry of no hours is not a short entry, it is the absence of one, and
 * storing it would put a line on the screen that accounts for nothing. The same
 * call `WorkScheduleService`'s `@IsHours()` makes.
 *
 * `maxDecimalPlaces` mirrors the `decimal(5, 2)` column, so a third decimal is
 * rejected by name instead of being rounded into a stored value that then
 * disagrees with what somebody typed — which matters here more than anywhere,
 * because these are the numbers the daily and weekly ceilings are compared
 * against.
 *
 * The `@Max()` is a plausibility bound and **not the limit**: `maxHoursPerEntry`
 * is configured, and this exists only so a value past what `decimal(5, 2)` can
 * hold is a `400` naming the field rather than a driver error surfacing as a
 * `500`.
 */
export function IsTimesheetEntryHours() {
  return applyDecorators(
    IsNumber({
      allowInfinity: false,
      allowNaN: false,
      maxDecimalPlaces: TIMESHEET_HOURS_DECIMAL_PLACES,
    }),
    IsPositive(),
    Max(TIMESHEET_MAX_ENTRY_HOURS),
  );
}

/**
 * `description` — what was done, trimmed, and blank collapses to `null`.
 *
 * A cleared textarea posts `""`, which is not a shorter description but the
 * absence of one; storing it verbatim would give the column two values meaning
 * "empty" and force every reader to check for both. The same treatment the leave
 * module gives `reason`.
 */
export function IsTimesheetEntryDescription() {
  return applyDecorators(
    TrimToNull(),
    IsString(),
    MaxLength(TIMESHEET_ENTRY_DESCRIPTION_MAX_LENGTH),
  );
}

/**
 * `rejectionReason` — why a month was refused.
 *
 * The collapse to `null` matters more here than on any optional field, because
 * this one is **required**: without it a body carrying `"   "` would satisfy a
 * presence check while telling the employee nothing about what to fix. The
 * service's `assertRejectionReasonGiven` sees the `null` this produces and
 * refuses it.
 */
export function IsTimesheetRejectionReason() {
  return applyDecorators(
    TrimToNull(),
    IsString(),
    MaxLength(TIMESHEET_REJECTION_REASON_MAX_LENGTH),
  );
}

/**
 * Turns the text a query string carries into a number, leaving anything else
 * alone for the validator that follows to reject.
 */
function CoerceNumber() {
  return Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? Number(value) : value,
  );
}

/**
 * Trims a string and turns what is left of an empty one into `null`.
 *
 * Shared by the two free-text fields above rather than written twice, which is
 * the whole reason this file exists — the rule is identical and a second copy is
 * the one that eventually forgets the trim.
 */
function TrimToNull() {
  return Transform(({ value }: { value: unknown }) => {
    if (typeof value !== 'string') {
      return value;
    }

    const trimmed = value.trim();

    return trimmed.length === 0 ? null : trimmed;
  });
}
