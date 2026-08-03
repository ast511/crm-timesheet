/**
 * The project module's magic numbers and literals, in one place.
 *
 * The text columns are unbounded `text`, so these lengths are an API-level
 * contract rather than a schema mirror: they keep a payload from carrying a
 * megabyte of prose into a column no screen can render, and they are the values
 * a form's `maxlength` should be generated from. `color` is the exception — its
 * column is a `varchar(7)`, so there the length is enforced on both sides.
 */

/** `CRM-TS`, `PORTAL` — a short natural key, not a sentence. */
export const PROJECT_CODE_MAX_LENGTH = 20;

/**
 * Codes are uppercase alphanumerics, optionally separated by `-` or `_`.
 *
 * Input is upper-cased before this runs, so the pattern rejects punctuation and
 * whitespace rather than lowercase letters. It is the same pattern departments,
 * positions and employees use, and it matches the `CRM-TS` convention the seed
 * established — what lets a code stay quotable in a URL, a CSV export or a
 * spreadsheet.
 */
export const PROJECT_CODE_PATTERN = /^[A-Z0-9]+([-_][A-Z0-9]+)*$/;

export const PROJECT_NAME_MAX_LENGTH = 100;

/** A company name, on the same scale as the project's own name. */
export const PROJECT_CLIENT_NAME_MAX_LENGTH = 100;

export const PROJECT_DESCRIPTION_MAX_LENGTH = 500;

/** Bound on `?search=`, so a huge term cannot be pushed into a `LIKE` scan. */
export const PROJECT_SEARCH_MAX_LENGTH = 100;

/**
 * Estimated-effort bounds.
 *
 * The minimum is the rule the feature states: negative effort is not a smaller
 * estimate, it is a data-entry mistake, and `0` already means "not estimated
 * yet".
 *
 * The maximum is not cosmetic. `estimated_hours` is a PostgreSQL `integer`, so
 * a value past 2^31-1 is rejected by the driver as a `500` rather than by
 * validation as a `400` naming the field. A million hours is roughly five
 * hundred person-years — far past any real budget, and well inside the column.
 */
export const PROJECT_MIN_ESTIMATED_HOURS = 0;

export const PROJECT_MAX_ESTIMATED_HOURS = 1_000_000;

/**
 * `color` accepts one spelling only: `#` followed by six hexadecimal digits.
 *
 * Not the three-digit shorthand (`#FFF`), not a named colour, not `rgb(...)`.
 * A single stored format means every consumer — a CSS variable, a chart legend,
 * an exported report — parses it the same way, and it is the format the
 * `varchar(7)` column is sized for. Input is upper-cased before this runs, so
 * the pattern needs no case-insensitive flag; `#aabbcc` and `#AABBCC` are then
 * literally the same stored value rather than two spellings of one colour.
 */
export const PROJECT_COLOR_PATTERN = /^#[0-9A-F]{6}$/;

/**
 * Columns `?sortBy=` accepts.
 *
 * A closed list rather than a free string: the value reaches Prisma's `orderBy`
 * key, so anything not enumerated here must be rejected by validation before it
 * gets there.
 *
 * `projectStatus` and `projectPriority` are filterable but not sortable. They
 * *could* be ordered — a PostgreSQL enum sorts by declaration order, which is
 * lifecycle order for one and low-to-high for the other — but this feature
 * fixed the sortable set, and adding a column here is a one-line change once
 * somebody asks for it.
 */
export const PROJECT_SORT_FIELDS = [
  'code',
  'name',
  'clientName',
  'estimatedHours',
  'startDate',
  'createdAt',
] as const;

export type ProjectSortField = (typeof PROJECT_SORT_FIELDS)[number];

/**
 * Default ordering column.
 *
 * `code` rather than `name`: it is required and unique, so the order is total
 * and a record can never shift between two pages of the same listing. Project
 * names are neither unique nor stable — two clients can both have a "Website
 * Redesign" — so ordering by one would leave the tie-break doing the real work.
 */
export const DEFAULT_PROJECT_SORT_FIELD: ProjectSortField = 'code';
