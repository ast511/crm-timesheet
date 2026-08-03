/**
 * The position module's magic numbers and literals, in one place.
 *
 * The database columns are unbounded `text`, so these lengths are an API-level
 * contract rather than a schema mirror: they keep a payload from carrying a
 * megabyte of prose into a column no screen can render, and they are the values
 * a form's `maxlength` should be generated from.
 */

/** `DEV`, `QA-LEAD`, `PM` — a short natural key, not a sentence. */
export const POSITION_CODE_MAX_LENGTH = 20;

export const POSITION_NAME_MAX_LENGTH = 100;

export const POSITION_DESCRIPTION_MAX_LENGTH = 500;

/** Bound on `?search=`, so a huge term cannot be pushed into a `LIKE` scan. */
export const POSITION_SEARCH_MAX_LENGTH = 100;

/**
 * Codes are uppercase alphanumerics, optionally separated by `-` or `_`.
 *
 * Input is upper-cased before this runs, so the pattern rejects punctuation and
 * whitespace rather than lowercase letters. Keeping a code quotable in a URL, a
 * CSV export or a spreadsheet is why the separators are limited to two.
 */
export const POSITION_CODE_PATTERN = /^[A-Z0-9]+([-_][A-Z0-9]+)*$/;

/**
 * Columns `?sortBy=` accepts.
 *
 * A closed list rather than a free string: the value reaches Prisma's `orderBy`
 * key, so anything not enumerated here must be rejected by validation before it
 * gets there.
 */
export const POSITION_SORT_FIELDS = ['code', 'name', 'createdAt'] as const;

export type PositionSortField = (typeof POSITION_SORT_FIELDS)[number];

/**
 * Default ordering column.
 *
 * `name` rather than `createdAt`, matching the departments endpoint: positions
 * are reference data a user scans alphabetically, and `name` is unique — so the
 * order is total and a record can never shift between two pages of the same
 * listing.
 */
export const DEFAULT_POSITION_SORT_FIELD: PositionSortField = 'name';
