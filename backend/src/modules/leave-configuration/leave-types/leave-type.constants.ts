/**
 * The leave-types module's magic numbers and literals, in one place.
 *
 * The text columns are unbounded `text`, so these lengths are an API-level
 * contract rather than a schema mirror: they keep a payload from carrying a
 * megabyte of prose into a column no screen can render, and they are the values
 * a form's `maxlength` should be generated from. `color` is the exception — its
 * column is a `varchar(7)`, so there the length is enforced on both sides.
 */

/** `ANNUAL`, `MEDICAL`, `UNPAID` — a short natural key, not a sentence. */
export const LEAVE_TYPE_CODE_MAX_LENGTH = 20;

/**
 * Codes are uppercase alphanumerics, optionally separated by `-` or `_`.
 *
 * Input is upper-cased before this runs, so the pattern rejects punctuation and
 * whitespace rather than lowercase letters. It is the same pattern departments,
 * positions, employees and projects use — what lets a code stay quotable in a
 * URL, a CSV export or a spreadsheet.
 */
export const LEAVE_TYPE_CODE_PATTERN = /^[A-Z0-9]+([-_][A-Z0-9]+)*$/;

/** `Annual Leave`, `Medical Leave` — a label a person reads, not a paragraph. */
export const LEAVE_TYPE_LABEL_MAX_LENGTH = 100;

/**
 * `reportMarker` — the glyph a report grid prints for a day of this leave.
 *
 * Three characters, and the bound is the feature rather than a limit on it. The
 * collective attendance sheet and the leave calendar (Feature 031) are grids of
 * employees by days: a cell is a few millimetres wide, so a day of absence has
 * room for a letter. `MEDICAL` in that cell would either overflow or be
 * truncated by whichever renderer got to it first, and the three renderers would
 * truncate it differently.
 *
 * It matches the `varchar(3)` column exactly, so the same rule is enforced on
 * both sides rather than only at the edge — the call `LEAVE_TYPE_COLOR_PATTERN`
 * already makes for `color`.
 */
export const LEAVE_TYPE_REPORT_MARKER_MAX_LENGTH = 3;

/**
 * A marker is one to three upper-case letters or digits, and nothing else.
 *
 * Input is upper-cased before this runs, so the pattern rejects punctuation,
 * whitespace and accented characters rather than lower-case letters. The
 * narrowness is deliberate: this string is drawn into a PDF cell and an Excel
 * cell as-is, and a marker carrying a space or a diacritic renders differently
 * in each of the three outputs the same data model feeds.
 *
 * It is deliberately **not** {@link LEAVE_TYPE_CODE_PATTERN}: that pattern
 * admits `-` and `_` as separators between alphanumeric groups, which is right
 * for a natural key somebody quotes in a URL and wrong for a single glyph.
 */
export const LEAVE_TYPE_REPORT_MARKER_PATTERN = /^[A-Z0-9]{1,3}$/;

export const LEAVE_TYPE_DESCRIPTION_MAX_LENGTH = 500;

/** Bound on `?search=`, so a huge term cannot be pushed into a `LIKE` scan. */
export const LEAVE_TYPE_SEARCH_MAX_LENGTH = 100;

/**
 * `icon` holds the *name* of an icon — `umbrella-beach`, `hospital`,
 * `graduation-cap` — and its shape is deliberately not constrained beyond this
 * length.
 *
 * There is no pattern. Icon sets do not agree on a spelling: one publishes
 * `umbrella-beach`, another `umbrellaBeach`, a third `ph:umbrella-beach`, and a
 * pattern narrow enough to be worth writing would reject whichever set the
 * frontend actually ships. The vocabulary is the frontend's to choose, so the
 * API takes the name it is given.
 *
 * The length is what keeps the column a *key* rather than a payload: 50
 * characters hold any icon name in use and nothing that could be mistaken for a
 * sprite. An icon that does not resolve is a broken glyph on one screen; a rule
 * that rejects the set in use is a feature nobody can configure.
 */
export const LEAVE_TYPE_ICON_MAX_LENGTH = 50;

/**
 * `color` accepts one spelling only: `#` followed by six hexadecimal digits.
 *
 * The same rule and the same reasoning as `PROJECT_COLOR_PATTERN`: not the
 * three-digit shorthand (`#FFF`), not a named colour, not `rgb(...)`. A single
 * stored format means every consumer — a CSS variable, a calendar legend, an
 * exported report — parses it the same way, and it is the format the
 * `varchar(7)` column is sized for. Input is upper-cased before this runs, so
 * `#aabbcc` and `#AABBCC` are literally the same stored value rather than two
 * spellings of one colour.
 *
 * It is deliberately a second copy of the projects pattern rather than a shared
 * constant. Both are `#RRGGBB` today by coincidence of taste, not by a rule
 * either module owns, and a project accent and a leave-type accent should be
 * free to diverge without one feature editing the other's validation.
 */
export const LEAVE_TYPE_COLOR_PATTERN = /^#[0-9A-F]{6}$/;

/**
 * Bounds on `defaultAllocatedDays`.
 *
 * The minimum is the rule the feature states: a negative allocation is not a
 * smaller suggestion, it is a data-entry mistake. `0` stays legal and means "a
 * suggestion of no days"; *no* suggestion at all is `null`, which is a different
 * statement and is why the column is nullable.
 *
 * The maximum is a calendar year, and it is not cosmetic. The column is a
 * PostgreSQL `integer`, so a value past 2^31-1 would be rejected by the driver
 * as a `500` rather than by validation as a `400` naming the field. No leave
 * type can suggest more days than a year contains, and a leap year has 366.
 */
export const LEAVE_TYPE_MIN_ALLOCATED_DAYS = 0;

export const LEAVE_TYPE_MAX_ALLOCATED_DAYS = 366;

/**
 * Columns `?sortBy=` accepts.
 *
 * A closed list rather than a free string: the value reaches Prisma's `orderBy`
 * key, so anything not enumerated here must be rejected by validation before it
 * gets there.
 *
 * The three booleans are filterable but not sortable. Ordering a list by a
 * two-valued column groups it rather than sorts it, which is what `?isPaid=` and
 * the tie-break already do — and better.
 */
export const LEAVE_TYPE_SORT_FIELDS = [
  'code',
  'label',
  'defaultAllocatedDays',
  'createdAt',
] as const;

export type LeaveTypeSortField = (typeof LEAVE_TYPE_SORT_FIELDS)[number];

/**
 * Default ordering column.
 *
 * `label` rather than `createdAt`, the same call departments make and for the
 * same two reasons: leave types are reference data a user scans alphabetically,
 * and `label` is unique — so the order is total and a record can never shift
 * between two pages of the same listing.
 */
export const DEFAULT_LEAVE_TYPE_SORT_FIELD: LeaveTypeSortField = 'label';
