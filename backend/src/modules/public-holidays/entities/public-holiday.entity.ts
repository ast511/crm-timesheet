import { toIsoTimestamp } from '../../../common/utils/date.util';
import type { Prisma } from '../../../generated/prisma/client';
import type { HolidayType } from '../../../generated/prisma/enums';
import type { PublicHolidayModel } from '../../../generated/prisma/models';

/**
 * A public holiday as the API exposes it.
 *
 * It exists because the row and the resource are two different contracts that
 * only happen to agree today. Returning `PublicHolidayModel` straight from a
 * handler would make every column a published field, so a schema change would
 * leak the moment it was added instead of when someone decided to publish it.
 *
 * The visible difference is the dates: `Date` in the row, ISO-8601 strings
 * here, which is what the client actually receives once the body is serialised.
 *
 * `startDate` and `endDate` are rendered as full instants rather than truncated
 * to `YYYY-MM-DD`, for the reason `Project.startDate` is: the columns are
 * `timestamp`, so printing only the date would quietly assume a timezone this
 * module has no way to know. A client that wants "25 December" reads the first
 * ten characters of a UTC instant it was given as UTC.
 */
export class PublicHolidayEntity {
  id!: string;
  name!: string;
  description!: string | null;
  type!: HolidayType;
  isNational!: boolean;
  validFromYear!: number | null;
  validToYear!: number | null;
  startDate!: string;
  endDate!: string;
  isRecurring!: boolean;
  createdAt!: string;
  updatedAt!: string;
}

/**
 * The columns every query in `PublicHolidayService` reads.
 *
 * A `select` rather than an `include`: `include` returns every column of the
 * row and would keep publishing each one added to `public_holidays` later,
 * whereas `select` publishes a field only when someone decides to publish it.
 * The table has no relations today, which is exactly why the habit is worth
 * keeping — the first one added must not appear in a payload by default.
 *
 * `satisfies Prisma.PublicHolidaySelect` checks the keys against the model
 * without widening the constant, so a column renamed in `schema.prisma` breaks
 * the build here instead of at runtime.
 */
export const PUBLIC_HOLIDAY_PUBLIC_SELECT = {
  id: true,
  name: true,
  description: true,
  type: true,
  isNational: true,
  validFromYear: true,
  validToYear: true,
  startDate: true,
  endDate: true,
  isRecurring: true,
  createdAt: true,
  updatedAt: true,
} as const satisfies Prisma.PublicHolidaySelect;

/**
 * A `public_holidays` row read through {@link PUBLIC_HOLIDAY_PUBLIC_SELECT}.
 *
 * Spelled as a `Pick` of the model rather than as a free-standing interface, so
 * a `select` left off a query produces a row the mapper will not accept — the
 * same compile-time trip-wire the modules before this one use.
 */
export type PublicHolidayRow = Pick<
  PublicHolidayModel,
  keyof typeof PUBLIC_HOLIDAY_PUBLIC_SELECT
>;

/** Maps a `public_holidays` row onto the resource returned by the endpoints. */
export function toPublicHolidayEntity(
  holiday: PublicHolidayRow,
): PublicHolidayEntity {
  return {
    id: holiday.id,
    name: holiday.name,
    description: holiday.description,
    type: holiday.type,
    isNational: holiday.isNational,
    validFromYear: holiday.validFromYear,
    validToYear: holiday.validToYear,
    startDate: toIsoTimestamp(holiday.startDate),
    endDate: toIsoTimestamp(holiday.endDate),
    isRecurring: holiday.isRecurring,
    createdAt: toIsoTimestamp(holiday.createdAt),
    updatedAt: toIsoTimestamp(holiday.updatedAt),
  };
}
