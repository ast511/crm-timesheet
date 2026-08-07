import { applyDecorators } from '@nestjs/common';
import { Transform } from 'class-transformer';
import {
  ArrayNotEmpty,
  ArrayUnique,
  IsArray,
  IsEnum,
  IsNumber,
  IsPositive,
  IsString,
  Matches,
  Max,
  Min,
  registerDecorator,
  ValidationArguments,
} from 'class-validator';

import { Trim } from '../../../common/decorators/trim.decorator';
import { Weekday } from '../../../generated/prisma/enums';
import {
  compareWeekdays,
  DEFAULT_TIMEZONE,
  HOURS_DECIMAL_PLACES,
  isSupportedTimezone,
  MAX_HOURS_PER_DAY,
  MAX_HOURS_PER_WEEK,
  WORK_TIME_PATTERN,
} from '../work-schedule.constants';

/**
 * The per-field rules of the work-schedule configuration.
 *
 * The same split the other modules use: **constraints** live here,
 * **optionality** stays on the DTO. This module has only one write DTO, and
 * every field on it is required — but the split is kept anyway, because it is
 * what the next reader expects to find, and because three of the eight hour
 * fields share `@IsHours()` and would otherwise be three copies of the same
 * four decorators.
 *
 * `email` is not here. It uses the shared `@IsEmailAddress()` from
 * `common/decorators`, where Feature 016 moved the rule the users module had
 * been carrying alone.
 */

/**
 * `workingDays` — a non-empty array of distinct weekdays, in week order.
 *
 * Four separate rules, each answering a different bad payload:
 *
 * - `@IsArray()` + `@ArrayNotEmpty()` — a company with no working days has no
 *   schedule to configure, so `[]` is a mistake rather than a valid answer.
 * - `@ArrayUnique()` — the requested rule. `["MONDAY", "MONDAY"]` is not a
 *   Monday that counts twice; there is no such thing, and the enum array column
 *   would have stored it happily.
 * - `@IsEnum(Weekday, { each: true })` — `each` is what makes this check the
 *   *elements*; without it the check would be applied to the array itself and
 *   would fail every valid payload.
 *
 * The `Transform` sorts into the enum's declaration order — Monday first — so
 * the stored array reads as a week rather than as the order the boxes were
 * ticked in, and two configurations holding the same days are equal arrays. It
 * runs before validation, so it deliberately tolerates values that are about to
 * be rejected, and it copies rather than sorting in place: mutating the parsed
 * body would be a side effect on an object the pipe still owns.
 */
export function IsWorkingDays() {
  return applyDecorators(
    Transform(({ value }: { value: unknown }) =>
      Array.isArray(value)
        ? [...(value as Weekday[])].sort(compareWeekdays)
        : value,
    ),
    IsArray(),
    ArrayNotEmpty(),
    ArrayUnique(),
    IsEnum(Weekday, { each: true }),
  );
}

/**
 * `weekStartsOn` — the single weekday a week begins on.
 *
 * One value rather than an array, and deliberately unconstrained by
 * {@link IsWorkingDays}: the day a week *turns over* need not itself be worked.
 * A company working Monday to Friday whose payroll week begins on Sunday is a
 * perfectly ordinary arrangement, and requiring the start to be a working day
 * would refuse it for no reason a weekly total cares about.
 *
 * Its own decorator rather than a bare `@IsEnum(Weekday)` on the property, for
 * the reason every other field here has one: the constraint belongs beside the
 * others, and the day this gains a second rule there is one place to put it.
 */
export function IsWeekStartsOn() {
  return IsEnum(Weekday);
}

/**
 * `workStartTime` / `workEndTime` — a wall-clock time as `HH:mm`.
 *
 * Trimmed first, then matched against the anchored pattern, so `" 09:00 "` is
 * accepted and stored as `09:00` while `9:00`, `24:00` and `09:00:00` are
 * rejected. One spelling in the column means every consumer — a form input, a
 * comparison, an export — parses it the same way.
 *
 * Note what is *not* checked: whether the end is after the start. A shift that
 * runs 22:00 to 06:00 crosses midnight and is a real schedule, so "end before
 * start" is not an error here — it is a night shift, and rejecting it would
 * make this module refuse to describe a company that works nights. The
 * Timesheets module is where a crossing day has to be interpreted, and it can
 * read both values.
 */
export function IsWorkTime() {
  return applyDecorators(
    Trim(),
    IsString(),
    Matches(WORK_TIME_PATTERN, {
      message: 'must be a time in 24-hour HH:mm format, for example 09:00',
    }),
  );
}

/**
 * `timezone` — the IANA zone the company's calendar days are read in.
 *
 * Trimmed first, like the two times, so a value pasted with a stray space is
 * accepted rather than refused for something the client cannot see.
 *
 * The check is membership of the runtime's own tz database, not a pattern. A
 * regular expression over `Region/City` would accept `Europe/Atlantis` — a
 * perfectly well-shaped name for a zone that does not exist — and the failure
 * would surface much later, as days grouped against a zone nothing can resolve.
 * Checking the name is *recognised* is the only check that means anything here.
 *
 * Note what is deliberately **not** accepted: a numeric offset. `+02:00` is not
 * a zone, it is a zone's answer on one particular day; daylight saving moves it,
 * so storing the offset would freeze half the year's answer and apply it to the
 * other half. The name is the stable fact, which is why the column holds one.
 */
export function IsTimezone() {
  return applyDecorators(Trim(), IsString(), IsIanaTimezone());
}

/**
 * Rejects a string that does not name a zone this runtime knows.
 *
 * Written with `registerDecorator` for the reason `MaxByteLength` in the users
 * module is: `class-validator` has no constraint for it, and a `@Matches()`
 * standing in would check the shape rather than the fact. Non-strings pass,
 * leaving them to the `@IsString()` alongside, whose message is far better than
 * a set lookup failing on a number.
 *
 * The message names an example rather than listing the alternatives: there are
 * some four hundred, and a `400` carrying all of them would be unreadable in
 * exactly the situation somebody is trying to read it.
 */
function IsIanaTimezone(): PropertyDecorator {
  return (target, propertyName) => {
    registerDecorator({
      name: 'isIanaTimezone',
      target: target.constructor,
      propertyName: propertyName as string,
      validator: {
        validate(value: unknown): boolean {
          return typeof value !== 'string' || isSupportedTimezone(value);
        },
        defaultMessage({ property }: ValidationArguments): string {
          return `${property} must be an IANA timezone name, for example ${DEFAULT_TIMEZONE}`;
        },
      },
    });
  };
}

/**
 * An hour value that must be greater than zero, bounded by the day.
 *
 * `@IsPositive()` rather than `@Min(0)`, because the rule is *greater than*
 * zero: an entry of zero hours is not a small entry, it is the absence of one,
 * and a standard day of zero hours would make every timesheet complete before
 * anybody worked.
 *
 * `@IsNumber()` without `@Type(() => Number)`: this arrives in a JSON body,
 * where `8` and `"8"` are genuinely different values, and coercing the string
 * would accept a payload the client should fix. `maxDecimalPlaces` mirrors the
 * `decimal(5, 2)` column, so a third decimal is rejected by name instead of
 * being rounded into the stored value.
 */
export function IsHours(max: number = MAX_HOURS_PER_DAY) {
  return applyDecorators(
    IsNumber({
      allowInfinity: false,
      allowNaN: false,
      maxDecimalPlaces: HOURS_DECIMAL_PLACES,
    }),
    IsPositive(),
    Max(max),
  );
}

/** Hours per week, on the same terms, bounded by the 168 hours in one. */
export function IsWeeklyHours() {
  return IsHours(MAX_HOURS_PER_WEEK);
}

/**
 * `lunchBreakHours` — the one hour value allowed to be zero.
 *
 * `@Min(0)` rather than `@IsPositive()`, because "this company has no lunch
 * break" is a configuration somebody may legitimately state, and refusing it
 * would force a fictional value into a field that changes nothing.
 */
export function IsLunchBreakHours() {
  return applyDecorators(
    IsNumber({
      allowInfinity: false,
      allowNaN: false,
      maxDecimalPlaces: HOURS_DECIMAL_PLACES,
    }),
    Min(0),
    Max(MAX_HOURS_PER_DAY),
  );
}
