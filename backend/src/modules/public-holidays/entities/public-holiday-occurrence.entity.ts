import { toIsoTimestamp } from '../../../common/utils/date.util';
import type { Prisma } from '../../../generated/prisma/client';
import { HolidayType } from '../../../generated/prisma/enums';
import type { PublicHolidayModel } from '../../../generated/prisma/models';

/** Whole days, in milliseconds. The columns hold UTC instants, so this is exact. */
const MS_PER_DAY = 86_400_000;

/**
 * One holiday, as it actually falls in one particular year.
 *
 * The difference from `PublicHolidayEntity` is the whole point of the calendar
 * endpoints: that type is the stored **record**, this one is a computed
 * **occurrence**. A fixed holiday is one record and one occurrence per year, and
 * `startDate` here is the record's month and day projected onto the year that
 * was asked for — never the year the row happens to have been entered with.
 *
 * Three fields of the record are deliberately absent:
 *
 * - `isActive`, because only active holidays are ever returned — a calendar
 *   lists the days the company is closed, and an inactive holiday is not one of
 *   them. Publishing a column that is `true` on every row would be noise.
 * - `isRecurring`, because `type` already says it and the API keeps the two in
 *   step. One fact, one field.
 * - the year and month the caller named, which are not repeated anywhere in the
 *   payload. They are in the URL the client just built.
 *
 * `id` **is** kept: it is the record the occurrence was computed from, so a
 * calendar entry can be clicked through to `GET`, `PATCH` or `DELETE` without a
 * second lookup by name.
 */
export class PublicHolidayOccurrenceEntity {
  id!: string;
  name!: string;
  description!: string | null;
  type!: HolidayType;
  isNational!: boolean;
  startDate!: string;
  endDate!: string;
}

/**
 * The columns the calendar reads.
 *
 * Narrower than `PUBLIC_HOLIDAY_PUBLIC_SELECT` because a calendar needs less
 * than the administrative view: no timestamps, no `isActive` (every row read is
 * active), no `isRecurring` (`type` decides the projection). A `select` rather
 * than an `include`, for the reason stated on the record's select.
 */
export const PUBLIC_HOLIDAY_OCCURRENCE_SELECT = {
  id: true,
  name: true,
  description: true,
  type: true,
  isNational: true,
  startDate: true,
  endDate: true,
} as const satisfies Prisma.PublicHolidaySelect;

/** A `public_holidays` row read through {@link PUBLIC_HOLIDAY_OCCURRENCE_SELECT}. */
export type OccurrenceSourceRow = Pick<
  PublicHolidayModel,
  keyof typeof PUBLIC_HOLIDAY_OCCURRENCE_SELECT
>;

/** The dates a holiday actually falls on in the year being asked about. */
export interface OccurrenceSpan {
  readonly startDate: Date;
  readonly endDate: Date;
}

/**
 * Works out when — if at all — a holiday falls in a given year.
 *
 * This is the function the calendar exists for, and the two types take opposite
 * paths through it:
 *
 * - **`VARIABLE`** holidays are not projected at all. Their dates *are* the
 *   fact; a moving holiday recorded for 2026 says nothing about 2027, so a row
 *   whose start falls outside the year yields `null` rather than being dragged
 *   into it. This is why Easter has to be entered per year and why nothing here
 *   calculates it.
 * - **`FIXED`** holidays are projected: the month and day of `startDate` are
 *   re-anchored onto the requested year, and the span is carried over by its
 *   length in days rather than by its stored end. Carrying the length is what
 *   makes a holiday that runs from 31 December to 1 January come out as
 *   `2027-12-31 → 2028-01-01` instead of collapsing into a single year.
 *
 * Returns `null` when the holiday does not occur in that year at all. That
 * includes the one case a fixed holiday can miss a year: 29 February, which
 * simply does not exist in a common year — and a day that does not exist is not
 * a day the company is closed. Constructing it would silently roll over to 1
 * March and put the holiday on the wrong day, which is worse than omitting it.
 *
 * Everything is computed in UTC, on both sides. The columns are `timestamp` and
 * a client posting `2026-01-01` gets UTC midnight, so reading the local month
 * and day would make the projection depend on the server's timezone — the same
 * reasoning the fixed duplicate check rests on.
 */
export function occurrenceSpanIn(
  { type, startDate, endDate }: OccurrenceSourceRow,
  year: number,
): OccurrenceSpan | null {
  if (type === HolidayType.VARIABLE) {
    return startDate.getUTCFullYear() === year ? { startDate, endDate } : null;
  }

  const month = startDate.getUTCMonth();
  const projectedStart = new Date(
    Date.UTC(year, month, startDate.getUTCDate()),
  );

  // 29 February in a common year: `Date.UTC` rolls it into March instead of
  // refusing, so the month it landed on is what tells us the day was not real.
  if (projectedStart.getUTCMonth() !== month) {
    return null;
  }

  return {
    startDate: projectedStart,
    endDate: new Date(
      projectedStart.getTime() + spanInDays(startDate, endDate),
    ),
  };
}

/** How long the stored span runs, as a millisecond offset to add to a start. */
function spanInDays(startDate: Date, endDate: Date): number {
  return (
    Math.round((endDate.getTime() - startDate.getTime()) / MS_PER_DAY) *
    MS_PER_DAY
  );
}

/** Maps a row and the span it occupies onto the resource the calendar returns. */
export function toPublicHolidayOccurrence(
  holiday: OccurrenceSourceRow,
  { startDate, endDate }: OccurrenceSpan,
): PublicHolidayOccurrenceEntity {
  return {
    id: holiday.id,
    name: holiday.name,
    description: holiday.description,
    type: holiday.type,
    isNational: holiday.isNational,
    startDate: toIsoTimestamp(startDate),
    endDate: toIsoTimestamp(endDate),
  };
}
