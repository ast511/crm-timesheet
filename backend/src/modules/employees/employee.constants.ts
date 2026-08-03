/**
 * The employee module's magic numbers and literals, in one place.
 *
 * The database columns are unbounded `text`, so these lengths are an API-level
 * contract rather than a schema mirror: they keep a payload from carrying a
 * megabyte of prose into a column no screen can render, and they are the values
 * a form's `maxlength` should be generated from.
 */

/** `EMP-0001` — a short natural key, not a sentence. */
export const EMPLOYEE_CODE_MAX_LENGTH = 20;

/**
 * Codes are uppercase alphanumerics, optionally separated by `-` or `_`.
 *
 * Input is upper-cased before this runs, so the pattern rejects punctuation and
 * whitespace rather than lowercase letters. It is the same pattern departments
 * and positions use, and it matches the `EMP-0001` convention the seed
 * established — what lets a code stay quotable in a URL, a CSV export or a
 * spreadsheet.
 */
export const EMPLOYEE_CODE_PATTERN = /^[A-Z0-9]+([-_][A-Z0-9]+)*$/;

/** Bound on `firstName` and `lastName` — a person's name, not a biography. */
export const EMPLOYEE_NAME_MAX_LENGTH = 100;

/**
 * Bound on `phone`.
 *
 * Generous enough for the longest international form with separators
 * (`+40 721 000 001`, `+1 (555) 010-0199 ext. 12`), because the column stores
 * whatever a human typed rather than a normalised E.164 number.
 */
export const EMPLOYEE_PHONE_MAX_LENGTH = 30;

/**
 * Bound on a foreign key accepted from a client.
 *
 * Ids are cuids — 25 characters today — so this is headroom rather than a
 * format check: its job is to keep a megabyte of text out of an indexed lookup,
 * not to decide what a valid id looks like. An id of the right length that
 * matches no row is reported as a missing relation, which is the honest answer.
 */
export const EMPLOYEE_RELATION_ID_MAX_LENGTH = 50;

/** Bound on `?search=`, so a huge term cannot be pushed into a `LIKE` scan. */
export const EMPLOYEE_SEARCH_MAX_LENGTH = 100;

/**
 * Vacation entitlement bounds.
 *
 * The minimum is the rule the feature states — strictly more than zero — and an
 * employee with no vacation at all is a data-entry mistake rather than a
 * contract. The maximum is a sanity bound: a year's worth of days is already
 * past any entitlement anyone negotiates, and without it a typo can store a
 * number that later arithmetic has to defend against.
 */
export const EMPLOYEE_MIN_VACATION_DAYS = 1;

export const EMPLOYEE_MAX_VACATION_DAYS = 365;

/**
 * Columns `?sortBy=` accepts.
 *
 * A closed list rather than a free string: the value reaches Prisma's `orderBy`
 * key, so anything not enumerated here must be rejected by validation before it
 * gets there. The related tables are absent — ordering by a department's name
 * is a join Prisma expresses differently, and offering it here would mean
 * accepting a key `orderBy` cannot use.
 */
export const EMPLOYEE_SORT_FIELDS = [
  'employeeCode',
  'firstName',
  'lastName',
  'hireDate',
  'createdAt',
] as const;

export type EmployeeSortField = (typeof EMPLOYEE_SORT_FIELDS)[number];

/**
 * Default ordering column.
 *
 * `employeeCode` rather than `lastName`: it is required and unique, so the
 * order is total and a record can never shift between two pages of the same
 * listing. Names are neither — two people share a surname often enough that the
 * tie-break would be doing the real work.
 */
export const DEFAULT_EMPLOYEE_SORT_FIELD: EmployeeSortField = 'employeeCode';
