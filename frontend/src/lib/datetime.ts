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
