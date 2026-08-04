import { LeaveRequestStatus } from '../../generated/prisma/enums';

/**
 * The leave-requests module's magic numbers and literals, in one place.
 *
 * Two of the bounds here do work no other module's constants do: they cap how
 * much *computation* one request can ask for. A leave span is walked day by day
 * to count working days, and a request whose span nobody bounded would let a
 * single call iterate for centuries — so the span cap is a rule about the
 * feature's cost as much as about what a valid absence looks like.
 */

/**
 * The longest span a single leave request may cover, in calendar days.
 *
 * A year and a day. Leave is granted and budgeted per calendar year everywhere
 * this company operates, so an absence longer than a year is not a request
 * somebody meant to file — it is a typo in a date, and a `400` naming the field
 * is a better answer than a request that consumes several years of balance at
 * once.
 *
 * It is also what makes {@link WorkingDaysService}'s day-by-day walk safe to
 * write plainly: the loop runs at most this many times, and no caller can make
 * it run longer.
 */
export const LEAVE_REQUEST_MAX_SPAN_DAYS = 366;

/**
 * The earliest and latest year a request may name, applied to both ends of the
 * span and to `?year=`.
 *
 * The same bounds the leave balances and the public-holiday calendar use, and
 * chosen for the same reason: they exist so `20266` is a `400` naming the field
 * rather than a row nobody will ever look for. Backdating a request and filing
 * one a few years ahead both stay possible.
 */
export const LEAVE_REQUEST_MIN_YEAR = 2000;

export const LEAVE_REQUEST_MAX_YEAR = 2100;

/**
 * How many people may be named as cover for one request.
 *
 * The minimum is the rule the feature states: at least one. It is enforced by
 * `@ArrayMinSize` rather than by the schema, because a column cannot require a
 * row in another table to exist.
 *
 * The maximum is a sanity bound, not a policy: a handful of colleagues covering
 * one absence is a real arrangement, twenty is a paste error. Each name costs a
 * lookup and an overlap check, so the cap also bounds the work one write can
 * ask for.
 */
export const LEAVE_REQUEST_MIN_REPLACEMENTS = 1;

export const LEAVE_REQUEST_MAX_REPLACEMENTS = 10;

/** Free text an employee writes; long enough for a paragraph, not a case file. */
export const LEAVE_REQUEST_REASON_MAX_LENGTH = 500;

/**
 * The reason HR gives for refusing or cancelling. Bounded like the employee's
 * own reason, and for the same purpose: it is an explanation on a screen, not a
 * document.
 */
export const LEAVE_REQUEST_DECISION_REASON_MAX_LENGTH = 500;

/** Bound on `?search=`, so a huge term cannot be pushed into a `LIKE` scan. */
export const LEAVE_REQUEST_SEARCH_MAX_LENGTH = 100;

/**
 * Columns `?sortBy=` accepts on an employee's own requests.
 *
 * A closed list rather than a free string: the value reaches Prisma's `orderBy`
 * key, so anything not enumerated here must be rejected by validation before it
 * gets there.
 *
 * **`requestedWorkingDays` is deliberately absent**, for the reason
 * `remainingDays` is absent from the balances module's list: it is computed
 * rather than stored, so there is no column for `orderBy` to name. Offering it
 * would mean sorting a page after it was fetched — which sorts the wrong rows,
 * since the page was already chosen — or raw SQL over three tables, which
 * CLAUDE.md admits only on request. A caller who wants the longest absences
 * sorts by `startDate` and reads the day count from the payload.
 */
export const MY_LEAVE_REQUEST_SORT_FIELDS = [
  'startDate',
  'endDate',
  'status',
  'createdAt',
] as const;

export type MyLeaveRequestSortField =
  (typeof MY_LEAVE_REQUEST_SORT_FIELDS)[number];

/**
 * The same columns, plus the one that only means something when the list spans
 * more than one person.
 *
 * `employee` is not a column of this table: it orders by the related employee's
 * surname and then given name, which is what a person reading a requests table
 * means by "sort by employee" — `employeeId` would sort by cuid, which is to say
 * by nothing. It is offered here and not on `/me`, where every row is the same
 * person and the ordering would be a no-op the API pretended to honour.
 */
export const LEAVE_REQUEST_SORT_FIELDS = [
  ...MY_LEAVE_REQUEST_SORT_FIELDS,
  'employee',
] as const;

export type LeaveRequestSortField = (typeof LEAVE_REQUEST_SORT_FIELDS)[number];

/**
 * Default ordering for both lists: the span, ascending.
 *
 * `startDate` rather than `createdAt`, because a leave list is read as a
 * calendar — "who is away, and when" — and the order somebody happened to file
 * their requests in answers a different question. Ascending is the shared
 * default `SortQueryDto` applies; a client wanting the most recent absences
 * first sends `?sortOrder=desc`, which is visible in the URL and in the logs.
 */
export const DEFAULT_LEAVE_REQUEST_SORT_FIELD: MyLeaveRequestSortField =
  'startDate';

/**
 * The statuses `PATCH /leave-requests/:id/status` accepts.
 *
 * Every state except `PENDING`, and its absence is the rule rather than an
 * oversight: `PENDING` is where a request *starts*, so sending it would be
 * asking to un-decide something — and for an `APPROVED` request that would mean
 * putting back days the balance has already given out. There is no path back
 * into this state, from this endpoint or any other.
 *
 * Derived from the enum rather than spelled as three string literals, so a value
 * renamed in `schema.prisma` breaks the build here instead of producing a
 * validator that silently accepts nothing.
 */
export const LEAVE_REQUEST_DECISIONS = [
  LeaveRequestStatus.APPROVED,
  LeaveRequestStatus.REJECTED,
  LeaveRequestStatus.CANCELLED,
] as const;

export type LeaveRequestDecision = (typeof LEAVE_REQUEST_DECISIONS)[number];

/**
 * The decisions that must say why.
 *
 * A refusal and a cancellation both take something away from the person who
 * asked, and "no" without a reason is not an answer they can act on — they
 * cannot tell whether to shorten the request, move it, or talk to somebody. An
 * approval needs none: the request itself already said what it was for.
 */
export const LEAVE_REQUEST_DECISIONS_REQUIRING_REASON: readonly LeaveRequestDecision[] =
  [LeaveRequestStatus.REJECTED, LeaveRequestStatus.CANCELLED];

/** Whole days, in milliseconds. The columns hold UTC instants, so this is exact. */
export const MS_PER_DAY = 86_400_000;
