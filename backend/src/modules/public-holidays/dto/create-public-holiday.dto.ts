import { IsBoolean, IsOptional } from 'class-validator';

import { IsIsoDateString } from '../../../common/decorators/is-iso-date-string.decorator';
import { ValidateIfPresent } from '../../../common/decorators/validate-if-present.decorator';
import { HolidayType } from '../../../generated/prisma/enums';
import {
  IsHolidayType,
  IsPublicHolidayDescription,
  IsPublicHolidayName,
  IsPublicHolidayYear,
} from './public-holiday-field.decorators';

/**
 * Body of `POST /api/v1/public-holidays`.
 *
 * Four fields are required — `name`, `type`, `startDate` and `endDate`. The two
 * dates are required even for a one-day holiday, which stores the same date
 * twice; the column pair is the holiday's span, and an open end would leave
 * every consumer guessing how long the company is closed.
 *
 * `isNational` is the opposite case: its default (`true`) describes what a newly
 * entered holiday *is*, so it is left to the schema rather than repeated here.
 *
 * Three rules are deliberately **not** checked in this class, because none of
 * them is about a single field in isolation and all three have to be answered
 * the same way on `PATCH`, against the values already stored:
 *
 * - `endDate` on or after `startDate`;
 * - `isRecurring` agreeing with `type`;
 * - the two duplicate rules.
 *
 * They live in `PublicHolidayService`. This class only checks the shape of what
 * arrived.
 *
 * Unknown properties never reach it: the global `ValidationPipe` runs with
 * `forbidNonWhitelisted`, so a typo in a payload is a 400 rather than a silently
 * ignored field.
 */
export class CreatePublicHolidayDto {
  @IsPublicHolidayName()
  readonly name!: string;

  /** Optional, and a blank value is stored as `null` rather than as `""`. */
  @IsOptional()
  @IsPublicHolidayDescription()
  readonly description?: string | null;

  /**
   * Required, and it is the field the rest of the record is judged against:
   * it decides whether the year in `startDate` means anything and which
   * duplicate rule applies.
   */
  @IsHolidayType()
  readonly type!: HolidayType;

  /** Omitted, the schema's `true` applies; `null` is rejected — the column is
   * not nullable, so it has nothing to store. */
  @ValidateIfPresent()
  @IsBoolean()
  readonly isNational?: boolean;

  /**
   * The years this version applies to, both ends inclusive and both optional.
   *
   * Omitting them — the common case — creates a holiday that has always applied
   * and still does, which is what entering a holiday normally means. They are
   * for the two cases a flag could not express: a holiday introduced in a known
   * year, and one that has already been repealed.
   *
   * `FIXED` only. On a `VARIABLE` holiday either of them is a `400`: that row
   * already *is* one year, named by `startDate`, and a range on it would be a
   * second statement of the same fact that could disagree with the first.
   */
  @IsOptional()
  @IsPublicHolidayYear()
  readonly validFromYear?: number | null;

  @IsOptional()
  @IsPublicHolidayYear()
  readonly validToYear?: number | null;

  /**
   * Optional, and redundant when sent: recurrence follows from `type`, so the
   * service derives it (`FIXED` → `true`, `VARIABLE` → `false`) and stores the
   * derived value.
   *
   * It is accepted anyway so a client can state the invariant explicitly — and
   * a value that contradicts `type` is a `400` rather than something quietly
   * overwritten, which is the point of accepting it at all.
   */
  @ValidateIfPresent()
  @IsBoolean()
  readonly isRecurring?: boolean;

  /**
   * Both ends of the span, inclusive.
   *
   * For a `FIXED` holiday the year is disregarded by the recurrence rule but is
   * still stored — a `timestamp` column has no way to hold a month and a day
   * alone, and inventing a sentinel year would be a value every reader has to
   * know about.
   */
  @IsIsoDateString()
  readonly startDate!: string;

  @IsIsoDateString()
  readonly endDate!: string;
}
