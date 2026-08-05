/**
 * The employee-leave-balances module's magic numbers and literals, in one place.
 *
 * Unlike most modules here, almost nothing bounds a text column: a balance is
 * three integers, a year and a note. What the bounds do instead is keep a stated
 * number physically possible, and keep every value inside the `integer` columns
 * that hold them — a value past 2^31-1 is rejected by the driver as a `500`
 * rather than by validation as a `400` naming the field.
 */

/**
 * The earliest year a balance may be recorded for.
 *
 * The rule the feature states. It is a guard against a typo — `202` or `20226`
 * for `2026` — rather than a claim about company history: a four-digit year
 * before 2000 is far more likely to be a slip than a real backdated grant.
 */
export const LEAVE_BALANCE_MIN_YEAR = 2000;

/**
 * The latest. The same bound the public-holidays calendar uses, and chosen for
 * the same reason: it exists so `20266` is a `400` naming the field rather than
 * a row nobody will ever look for. Allocating a few years ahead stays possible.
 */
export const LEAVE_BALANCE_MAX_YEAR = 2100;

/**
 * Day-count bounds, applied to `allocatedDays`, `carriedOverDays` and
 * `usedDays` alike.
 *
 * The minimum is the rule the feature states, and `0` stays legal for all
 * three: a balance of zero allocated days is a real statement ("this person
 * gets none of this leave type this year"), and zero used days is what every
 * balance starts at.
 *
 * The maximum is a leap year. No single year can grant, carry or consume more
 * days than it contains, so a larger number is a data-entry mistake — and
 * bounding it keeps the arithmetic in {@link computeRemainingDays} far away from
 * the edges of a 32-bit integer.
 */
export const LEAVE_BALANCE_MIN_DAYS = 0;

export const LEAVE_BALANCE_MAX_DAYS = 366;

/** A short HR note, not a case file. */
export const LEAVE_BALANCE_NOTES_MAX_LENGTH = 500;

/** Bound on `?search=`, so a huge term cannot be pushed into a `LIKE` scan. */
export const LEAVE_BALANCE_SEARCH_MAX_LENGTH = 100;

/**
 * The most ids `POST /employee-leave-balances/generate` accepts in one list,
 * for `employeeIds` and `leaveTypeIds` alike.
 *
 * It bounds the `IN (...)` each list becomes, and it is not a limit on how many
 * balances a run may write: omitting a list means "all of them", which is the
 * ordinary January call and is deliberately unbounded. The list exists to
 * *narrow* a run — one new hire, one leave type somebody forgot — and a
 * narrowing longer than this is the caller reaching for the unbounded form
 * without saying so.
 *
 * Generous rather than tight, because "every employee in one department" is a
 * legitimate way to use it and departments can be large.
 */
export const LEAVE_BALANCE_GENERATION_MAX_IDS = 500;

/**
 * The months in a year, named because the pro-rata arithmetic divides by it.
 *
 * A first-year allocation is `defaultAllocatedDays × monthsRemaining / 12`, and
 * `12` written inline in that expression is exactly the magic number the coding
 * rules ask to be given a name — it is the length of the entitlement period, not
 * an arbitrary divisor.
 */
export const MONTHS_PER_YEAR = 12;

/**
 * Columns `?sortBy=` accepts.
 *
 * A closed list rather than a free string: the value reaches Prisma's `orderBy`
 * key, so anything not enumerated here must be rejected by validation before it
 * gets there.
 *
 * `employee` is the one entry that is not a column of this table. It orders by
 * the related employee's surname and then given name — a to-one relation, which
 * Prisma's `orderBy` can express — because "sort by employee" is what a person
 * reading a balances table means, and `employeeId` would sort by cuid, which is
 * to say by nothing.
 *
 * **`remainingDays` is deliberately absent.** It is computed rather than stored,
 * so there is no column for `orderBy` to name; offering it would mean either
 * sorting a page after it was fetched — which sorts the wrong rows, since the
 * page was already chosen — or raw SQL, which CLAUDE.md admits only on request.
 * A caller who wants the smallest balances sorts by `allocatedDays` and reads
 * `remainingDays` from the payload. See the feature document for the change to
 * make if this ever needs to be a real ordering.
 */
export const LEAVE_BALANCE_SORT_FIELDS = [
  'employee',
  'year',
  'allocatedDays',
  'usedDays',
  'createdAt',
] as const;

export type LeaveBalanceSortField = (typeof LEAVE_BALANCE_SORT_FIELDS)[number];

/**
 * Default ordering.
 *
 * `employee` rather than `year`: this endpoint's ordinary use is "show me the
 * balances", read as a roster of people, and a person scans that alphabetically.
 * Ordering by year ascending would instead open on the oldest year on record,
 * which is nobody's first question.
 */
export const DEFAULT_LEAVE_BALANCE_SORT_FIELD: LeaveBalanceSortField =
  'employee';
