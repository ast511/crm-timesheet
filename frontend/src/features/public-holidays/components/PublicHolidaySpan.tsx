import { useTranslation } from 'react-i18next';

import { formatCalendarDate, formatCalendarDayMonth } from '@/lib/datetime';

import type { PublicHoliday } from '../public-holidays-api';

export type PublicHolidaySpanProps = Pick<PublicHoliday, 'type' | 'startDate' | 'endDate'>;

/**
 * The *Dată* column: when the holiday falls, printed as the kind of value it
 * actually is.
 *
 * ## The year is shown only when the year is a fact
 *
 * This is the whole reason the column is a component rather than a call to
 * `formatCalendarDate`. A `VARIABLE` holiday is one specific year — Easter 2026
 * is a different row from Easter 2027 — so its full date is the truth about it.
 * A `FIXED` holiday recurs by month and day, and the year stored inside its
 * `startDate` is whatever year the row happened to be entered for: the backend
 * says so outright, and avoids `startDate` as its default sort for exactly this
 * reason.
 *
 * Printing `01.01.2025` beside `25.12.2026` would therefore invite a reader to
 * conclude the two are a year apart when they describe the same twelve months —
 * and, worse, to "correct" the year of a row where the year means nothing.
 * `formatCalendarDayMonth` prints `01.01`, which is what a recurring holiday
 * is, and the *Interval ani* column beside it carries the years that do mean
 * something.
 *
 * ## No day-shift, in either format
 *
 * Both helpers format in **UTC**, the zone these values were written in — a
 * holiday is a day on a calendar rather than a moment, and rendering midnight
 * UTC in any zone west of Greenwich prints the previous day. `formatDate` and
 * the company timezone are for instants such as `createdAt`; they are the wrong
 * tool here and would produce the classic 1 January / 31 December defect.
 *
 * ## One day or several
 *
 * Most holidays store the same date at both ends, which is how a one-day
 * holiday is spelled — the backend requires both, since the pair is the span
 * and an open end would leave every consumer guessing how long the company is
 * closed. Printing `01.01 – 01.01` would be noise, so a single day prints once
 * and only a real span shows both ends.
 */
export const PublicHolidaySpan = ({ type, startDate, endDate }: PublicHolidaySpanProps) => {
  const { t } = useTranslation();

  const format = type === 'FIXED' ? formatCalendarDayMonth : formatCalendarDate;
  const start = format(startDate);
  const end = format(endDate);

  return (
    <span className="whitespace-nowrap tabular-nums">
      {start === end ? start : t('publicHolidays.span.range', { start, end })}
    </span>
  );
};
