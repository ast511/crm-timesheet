/**
 * The one place a timestamp becomes text.
 *
 * The API sends ISO strings and never formats a date — formatting is this
 * application's job, and it has exactly two rules:
 *
 * 1. **`ro-RO`**, matching the exported reports, so a screen and the
 *    spreadsheet printed from it never disagree about what a date looks like.
 * 2. **An explicit time zone, always.** `toLocaleString()` without one silently
 *    uses the machine's zone: correct on a laptop in Bucharest, wrong for a
 *    colleague abroad, and invisible in review. Every function here therefore
 *    *requires* the zone as an argument — the rule is enforced by the
 *    signature rather than by remembering it.
 *
 * The zone to pass is the **company timezone**, read once from
 * `GET /api/v1/work-schedule`. A later feature adds the hook that supplies it;
 * until then these functions are called with an explicit value.
 *
 * The full reasoning — instants versus calendar dates, and why the exports are
 * fixed to the company zone — is in `backend/FEATURES/031-reporting.md`.
 */

const LOCALE = 'ro-RO';

const format = (isoString: string, options: Intl.DateTimeFormatOptions): string =>
  new Intl.DateTimeFormat(LOCALE, options).format(new Date(isoString));

/** `14.08.2026` */
export const formatDate = (isoString: string, timeZone: string): string =>
  format(isoString, {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });

/** `14.08.2026, 09:30` */
export const formatDateTime = (isoString: string, timeZone: string): string =>
  format(isoString, {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });

/** `09:30` */
export const formatTime = (isoString: string, timeZone: string): string =>
  format(isoString, {
    timeZone,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });

/**
 * A **calendar date**, which is not an instant and takes no zone. `14.08.2026`
 *
 * A hire date, a public holiday, the day a leave request starts: these are days
 * on a calendar rather than moments in time, and the difference is not
 * pedantry. The backend stores them by parsing `2026-09-01` into a `DateTime`,
 * which lands on midnight UTC and comes back as `2026-09-01T00:00:00.000Z`.
 * Rendering that instant in *any* zone west of Greenwich prints the previous
 * day — a hire date one day early for a colleague in London on the wrong side
 * of an offset, and nobody would guess why.
 *
 * So this one function fixes the zone to `UTC` rather than requiring it, which
 * is the exact opposite of the rule the three above enforce and is correct for
 * the same reason: reading the value back in the zone it was written in returns
 * the day that was typed, and there is no other day it could mean.
 *
 * **Use {@link formatDate} for an instant** — something that happened at a
 * moment, like `createdAt` — where the company zone genuinely decides which day
 * it falls on.
 */
export const formatCalendarDate = (isoString: string): string =>
  formatDate(isoString, 'UTC');

/**
 * A calendar date **without its year**. `01.01`
 *
 * For the one value in this application whose year is not a fact: a `FIXED`
 * public holiday recurs by month and day, and the year inside its `startDate`
 * is whatever year the row happened to be entered for — the backend says so
 * outright, and its own default sort avoids `startDate` for exactly this
 * reason. Printing `01.01.2025` beside `25.12.2026` would invite the reader to
 * conclude the two are a year apart when they describe the same twelve months.
 *
 * `UTC` for the same reason {@link formatCalendarDate} fixes it: the value is a
 * day, and reading it back in the zone it was written in is what returns the
 * day that was typed.
 */
export const formatCalendarDayMonth = (isoString: string): string =>
  format(isoString, { timeZone: 'UTC', month: '2-digit', day: '2-digit' });

/**
 * The API's instant, as an `<input type="date">` value. `2026-01-01`
 *
 * The other half of {@link formatCalendarDate}: that one is how a calendar date
 * is *read*, this is how it is *edited*. `toISOString()` renders in UTC, which
 * is the zone the value was written in, so the day that comes back is the day
 * that was stored — whereas anything derived from `getFullYear()` /
 * `getMonth()` would read the browser's zone and hand 1 January to a colleague
 * in São Paulo as 31 December.
 */
export const toCalendarDateInput = (isoString: string): string =>
  new Date(isoString).toISOString().slice(0, 10);

/**
 * An `<input type="date">` value, as the instant the API stores.
 * `2026-01-01` → `2026-01-01T00:00:00.000Z`
 *
 * Midnight **UTC**, never `new Date('2026-01-01T00:00:00')` and never
 * `new Date(2026, 0, 1)`: both of those are midnight in the browser's zone, so
 * the same form submitted in Bucharest and in Los Angeles would store two
 * different days for one date the person picked. The suffix is appended as
 * text rather than round-tripped through `Date` precisely so no zone is
 * consulted at any point.
 *
 * The backend's `@IsIsoDateString()` accepts a bare `2026-01-01` as well, and
 * parses it to this same instant. The full form is sent because it is the
 * spelling the contract's examples use and it says explicitly which instant is
 * meant, rather than relying on the reader to know how the server parses a
 * date-only string.
 */
export const toCalendarDateIso = (inputValue: string): string =>
  `${inputValue}T00:00:00.000Z`;
