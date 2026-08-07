import { TimesheetStatus } from '../../generated/prisma/enums';

/**
 * The timesheet module's bounds, literals and sortable columns, in one place.
 *
 * **Note what is *not* here: every hour figure.** The daily ceiling, the weekly
 * ceiling, what a full day is worth, the smallest and largest single entry,
 * which weekdays may be logged and which day a week begins on all come from
 * `WorkSchedule` at the moment a timesheet is judged. A constant for any of them
 * would be this module quietly disagreeing with the configuration screen — and
 * the first company that works a seven-hour day, or a Sunday, would find the
 * disagreement the hard way. The bounds below are about *payload size and
 * plausibility*, which is a different question and one no configuration answers.
 */

/** The twelve months, as the API names them: `1` is January, not `0`. */
export const TIMESHEET_MIN_MONTH = 1;

export const TIMESHEET_MAX_MONTH = 12;

/**
 * The earliest and latest year a timesheet may name.
 *
 * The same bounds the leave requests, the leave balances and the public-holiday
 * calendar use, and chosen for the same reason: they exist so `20266` is a `400`
 * naming the field rather than a row nobody will ever look for. They are not a
 * policy about how far back a month may be filled — that is the employment
 * window, which is per person and is checked against `hireDate`.
 */
export const TIMESHEET_MIN_YEAR = 2000;

export const TIMESHEET_MAX_YEAR = 2100;

/**
 * How many lines one `PUT` may carry.
 *
 * A month has at most 31 days and a day holds several entries — a few projects,
 * a half day of leave — so this is generous by an order of magnitude and is a
 * bound on the work one write can ask for rather than a rule about how somebody
 * may account for their month. Every entry costs a validation pass and a row.
 *
 * It is deliberately not "31 × something": the number of entries a day may hold
 * is not a fact this module should invent, and a caller who hits this has pasted
 * the wrong payload rather than had an unusually busy month.
 */
export const TIMESHEET_MAX_ENTRIES = 500;

/** What was done, in the employee's own words — a line on a screen, not a report. */
export const TIMESHEET_ENTRY_DESCRIPTION_MAX_LENGTH = 500;

/**
 * The reason an administrator gives for refusing a month.
 *
 * Bounded like the leave module's `decisionReason`, and for the same purpose: it
 * is an explanation the employee reads and acts on, not a document. It is
 * **required** on a rejection, which the service enforces — "no" without a reason
 * leaves somebody unable to tell which day to fix.
 */
export const TIMESHEET_REJECTION_REASON_MAX_LENGTH = 500;

/** Bound on `?search=`, so a huge term cannot be pushed into a `LIKE` scan. */
export const TIMESHEET_SEARCH_MAX_LENGTH = 100;

/**
 * Columns `?sortBy=` accepts on the administrative list.
 *
 * A closed list rather than a free string: the value reaches Prisma's `orderBy`
 * key, so anything not enumerated here must be rejected by validation before it
 * gets there.
 *
 * `employee` is not a column of this table — it orders by the related employee's
 * surname and then given name, which is what a person reading a timesheet table
 * means by "sort by employee"; `employeeId` would sort by cuid, which is to say
 * by nothing. The same call `LEAVE_REQUEST_SORT_FIELDS` makes.
 *
 * **`totalHours` is deliberately absent**, and it is the one thing this feature
 * was asked for and did not build. The hour aggregates are `SUM(hours)` over
 * `timesheet_entries`, computed on the way out — there is no column for `orderBy`
 * to name, exactly as with `requestedWorkingDays` on a leave request and
 * `remainingDays` on a balance. Offering it would mean one of three things, and
 * none of them is right at this size: sorting the page *after* it was fetched,
 * which sorts the wrong rows because the page was already chosen; raw SQL, which
 * CLAUDE.md admits only on request; or paging the list through a `groupBy` over
 * the entries, which silently drops any timesheet with no entries at all — a
 * rejected month somebody emptied — from a list that still counts it. The
 * aggregates *are* on every row, so a client can sort a page it already has; the
 * feature document records what a real implementation would cost.
 */
export const TIMESHEET_SORT_FIELDS = [
  'submittedAt',
  'status',
  'employee',
  'createdAt',
] as const;

export type TimesheetSortField = (typeof TIMESHEET_SORT_FIELDS)[number];

/**
 * Default ordering: when it was handed in.
 *
 * `submittedAt` rather than `createdAt`, because the administrative list is a
 * review queue — "what is waiting, in the order it arrived" — and the moment
 * somebody opened a draft answers a different question. Ascending is the shared
 * default `SortQueryDto` applies, which puts the longest-waiting month first;
 * that is the order a reviewer should work in.
 *
 * `submittedAt` is null on nothing this list returns, since drafts are excluded
 * and every other status has been submitted at least once.
 */
export const DEFAULT_TIMESHEET_SORT_FIELD: TimesheetSortField = 'submittedAt';

/**
 * The statuses whose entries the owner may still change.
 *
 * `DRAFT` is the working copy. `REJECTED` is the same thing after somebody has
 * said what is wrong with it — which is why rejection is a state of its own
 * rather than a return to `DRAFT`: the reason survives the round trip.
 *
 * `SUBMITTED` is excluded because it is under review, and a month that changed
 * while somebody was reading it would be approved in a shape nobody saw.
 * `APPROVED` is excluded because it is the record of what the company agreed.
 */
export const EDITABLE_TIMESHEET_STATUSES = [
  TimesheetStatus.DRAFT,
  TimesheetStatus.REJECTED,
] as const;

/**
 * The statuses a timesheet may be submitted *from*.
 *
 * The same two values as {@link EDITABLE_TIMESHEET_STATUSES} and deliberately a
 * separate list, because they state different rules that happen to coincide
 * today: one says which months an owner may still change, the other which they
 * may hand in. The call Feature 027 makes with `EDITABLE_CAMPAIGN_STATUSES` and
 * `SENDABLE_CAMPAIGN_STATUSES`.
 *
 * It is also what makes "a double submit does not produce two notifications"
 * enforceable rather than hoped for: the transition is one conditional
 * `updateMany` guarded on these, so a second submit moves no row and announces
 * nothing.
 */
export const SUBMITTABLE_TIMESHEET_STATUSES = [
  TimesheetStatus.DRAFT,
  TimesheetStatus.REJECTED,
] as const;

/**
 * The one status an administrator may decide on.
 *
 * Approving and rejecting are both guarded on it, in the `WHERE` of the update
 * itself, which is what stops two administrators producing a month that is both
 * approved and rejected: the first moves one row, the second moves none and gets
 * a `409`.
 */
export const REVIEWABLE_TIMESHEET_STATUS = TimesheetStatus.SUBMITTED;

/**
 * The one status a timesheet cannot be deleted in.
 *
 * An `APPROVED` month is the record of what the company agreed somebody worked;
 * deleting it would remove the only account of hours that payroll and reporting
 * are drawn from. Everything else — a draft abandoned, a submission withdrawn by
 * an administrator, a month refused — may go. The call Feature 027 makes with
 * `UNDELETABLE_CAMPAIGN_STATUS`.
 */
export const UNDELETABLE_TIMESHEET_STATUS = TimesheetStatus.APPROVED;

/**
 * The statuses an administrator ever sees.
 *
 * **`DRAFT` is absent, and that is the visibility rule stated as data.** A draft
 * is a private working copy: half a month, entered out of order, with days
 * somebody has not got to yet. Showing it would put an administrator in the
 * position of reviewing something nobody has claimed is finished, and would make
 * "how many timesheets are outstanding" a number that counted people who are
 * still typing.
 *
 * It is applied to the list *and* to the single-timesheet read, so a draft is a
 * `404` on `GET /timesheets/:id` rather than a `403` — an administrator cannot
 * use the endpoint to discover that a colleague has started their month.
 */
export const ADMIN_VISIBLE_TIMESHEET_STATUSES = [
  TimesheetStatus.SUBMITTED,
  TimesheetStatus.APPROVED,
  TimesheetStatus.REJECTED,
] as const;

/**
 * The statuses whose dependencies are still worth re-checking.
 *
 * An `APPROVED` timesheet is frozen against its `scheduleSnapshot` and a
 * `REJECTED` one is already back with its owner carrying a reason to act on, so
 * neither gains anything from being told the calendar moved. See
 * `TimesheetService.refreshStaleness`.
 */
export const STALENESS_CHECKED_STATUSES = [
  TimesheetStatus.DRAFT,
  TimesheetStatus.SUBMITTED,
] as const;

/**
 * Two decimal places on every hour figure, matching `decimal(5, 2)`.
 *
 * Restated here rather than imported from the work-schedule module because this
 * module owns what a *timesheet entry* may say, and the agreement between the two
 * is load-bearing: an entry allowed a third decimal would be rounded on the way
 * into a column whose whole purpose is exact arithmetic, and the stored total
 * would then disagree with what somebody typed.
 */
export const TIMESHEET_HOURS_DECIMAL_PLACES = 2;

/**
 * The largest hour value the API will accept on one entry, before the work
 * schedule is consulted.
 *
 * A plausibility bound, not a policy: `maxHoursPerEntry` is the real limit and it
 * is configured. This exists so `800` is a `400` naming the field rather than a
 * value that reaches a `decimal(5, 2)` column — which tops out at `999.99` and
 * would otherwise surface a driver error as a `500`.
 */
export const TIMESHEET_MAX_ENTRY_HOURS = 24;
