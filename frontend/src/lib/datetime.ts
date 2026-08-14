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
