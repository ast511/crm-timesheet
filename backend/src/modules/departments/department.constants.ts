/**
 * The department module's magic numbers and literals, in one place.
 *
 * The database columns are unbounded `text`, so these lengths are an API-level
 * contract rather than a schema mirror: they keep a payload from carrying a
 * megabyte of prose into a column no screen can render, and they are the values
 * a form's `maxlength` should be generated from.
 */

/** `DEV`, `MAINT`, `HR` — a short natural key, not a sentence. */
export const DEPARTMENT_CODE_MAX_LENGTH = 20;

export const DEPARTMENT_NAME_MAX_LENGTH = 100;

export const DEPARTMENT_DESCRIPTION_MAX_LENGTH = 500;

/** Bound on `?search=`, so a huge term cannot be pushed into a `LIKE` scan. */
export const DEPARTMENT_SEARCH_MAX_LENGTH = 100;

/**
 * Codes are uppercase alphanumerics, optionally separated by `-` or `_`.
 *
 * Input is upper-cased before this runs, so the pattern rejects punctuation and
 * whitespace rather than lowercase letters. Matching the convention the seed
 * data established (`MGMT`, `BA`, …) is what lets a code stay quotable in a
 * URL, a CSV export or a spreadsheet.
 */
export const DEPARTMENT_CODE_PATTERN = /^[A-Z0-9]+([-_][A-Z0-9]+)*$/;

/**
 * Columns `?sortBy=` accepts.
 *
 * A closed list rather than a free string: the value reaches Prisma's `orderBy`
 * key, so anything not enumerated here must be rejected by validation before it
 * gets there.
 */
export const DEPARTMENT_SORT_FIELDS = ['code', 'name', 'createdAt'] as const;

export type DepartmentSortField = (typeof DEPARTMENT_SORT_FIELDS)[number];

/**
 * Default ordering column.
 *
 * `name` rather than `createdAt` for two reasons: departments are reference
 * data a user scans alphabetically, and `name` is unique — so the order is
 * total and a record can never shift between two pages of the same listing.
 */
export const DEFAULT_DEPARTMENT_SORT_FIELD: DepartmentSortField = 'name';
