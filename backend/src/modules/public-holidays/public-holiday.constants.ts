/**
 * The public-holidays module's magic numbers and literals, in one place.
 *
 * The text columns are unbounded `text`, so these lengths are an API-level
 * contract rather than a schema mirror: they keep a payload from carrying a
 * megabyte of prose into a column no screen can render, and they are the values
 * a form's `maxlength` should be generated from.
 */

/** `Christmas Day`, `Ziua Națională` — a label, not a paragraph. */
export const PUBLIC_HOLIDAY_NAME_MAX_LENGTH = 100;

export const PUBLIC_HOLIDAY_DESCRIPTION_MAX_LENGTH = 500;

/** Bound on `?search=`, so a huge term cannot be pushed into a `LIKE` scan. */
export const PUBLIC_HOLIDAY_SEARCH_MAX_LENGTH = 100;

/**
 * Bounds on the `:year` of the calendar endpoints.
 *
 * Not a guess at how long the company will exist: they exist so a typo
 * (`/calendar/20227`, `/calendar/0`) is a `400` naming the parameter rather
 * than a silently empty calendar, and so the year can be turned into a
 * `timestamp` range that PostgreSQL can hold. The lower bound is the Unix epoch
 * year, which predates any holiday worth recording here by decades.
 */
export const PUBLIC_HOLIDAY_MIN_YEAR = 1970;

export const PUBLIC_HOLIDAY_MAX_YEAR = 2100;

/**
 * Bounds on the `:month` of the monthly calendar endpoint.
 *
 * One-based, as a person writes a date: `/calendar/2027/5` is May, not June.
 * JavaScript's zero-based months are an implementation detail of `Date`, and
 * publishing them would make every caller subtract one — the classic off-by-one
 * that reads as correct in the code and is wrong on the screen. The conversion
 * happens once, where the range is built.
 */
export const PUBLIC_HOLIDAY_MIN_MONTH = 1;

export const PUBLIC_HOLIDAY_MAX_MONTH = 12;

/**
 * Columns `?sortBy=` accepts.
 *
 * A closed list rather than a free string: the value reaches Prisma's `orderBy`
 * key, so anything not enumerated here must be rejected by validation before it
 * gets there.
 */
export const PUBLIC_HOLIDAY_SORT_FIELDS = [
  'name',
  'startDate',
  'createdAt',
] as const;

export type PublicHolidaySortField =
  (typeof PUBLIC_HOLIDAY_SORT_FIELDS)[number];

/**
 * Default ordering column.
 *
 * `name` rather than `startDate`, which is the one place this module's default
 * differs from what a calendar would suggest — and it differs for a reason
 * particular to this table. A `FIXED` holiday's stored year is disregarded by
 * the recurrence rule, so it is whatever year the row happened to be entered
 * for: New Year saved as `2025-01-01` and Christmas saved as `2026-12-25` would
 * sort a year apart while both describe the same twelve months. `name` is the
 * only key that means the same thing for both types, and a caller who wants
 * calendar order asks for `?sortBy=startDate&type=VARIABLE`, where the year is
 * real.
 */
export const DEFAULT_PUBLIC_HOLIDAY_SORT_FIELD: PublicHolidaySortField = 'name';
