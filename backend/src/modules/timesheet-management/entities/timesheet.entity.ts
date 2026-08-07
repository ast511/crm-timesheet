import {
  toIsoTimestamp,
  toNullableIsoTimestamp,
} from '../../../common/utils/date.util';
import type { Prisma } from '../../../generated/prisma/client';
import type { TimesheetStatus } from '../../../generated/prisma/enums';
import type {
  DepartmentModel,
  EmployeeModel,
  PositionModel,
  TimesheetModel,
} from '../../../generated/prisma/models';
import {
  TIMESHEET_ENTRY_PUBLIC_SELECT,
  TimesheetEntryEntity,
  TimesheetEntryRow,
  toTimesheetEntryEntity,
} from './timesheet-entry.entity';

/**
 * A person, as a timesheet names one — its owner, or whoever reviewed it.
 *
 * Declared as a `Pick` of the owning module's row rather than as a free-standing
 * interface, so renaming a column in `schema.prisma` breaks the build here
 * instead of producing a nested object with a field that no longer exists.
 *
 * The same shape serves both roles, because a screen renders them identically: a
 * name and the code beside it. It is deliberately a second declaration rather
 * than an import of `LeaveRequestEmployeeSummary` or `CampaignEmployeeSummary` —
 * the three coincide today by taste rather than by a rule any module owns, and a
 * timesheet's reviewer should be free to publish something a leave request does
 * not without one feature editing the other's payload. Feature 027 made the same
 * call for the same reason.
 */
export type TimesheetEmployeeSummary = Pick<
  EmployeeModel,
  'id' | 'employeeCode' | 'firstName' | 'lastName'
>;

export type TimesheetDepartmentSummary = Pick<
  DepartmentModel,
  'id' | 'code' | 'name'
>;

export type TimesheetPositionSummary = Pick<
  PositionModel,
  'id' | 'code' | 'name'
>;

/**
 * The owner, who carries their department and position and the reviewer does not.
 *
 * The administrative list renders both — "whose month is this, and what do they
 * do" — and filters by department, so a client that can narrow by it has to be
 * able to show it. A reviewer is neither filtered nor grouped on, so repeating
 * their department would be publishing a fact nobody asked for once per row.
 */
export type TimesheetOwnerSummary = TimesheetEmployeeSummary & {
  department: TimesheetDepartmentSummary;
  position: TimesheetPositionSummary;
};

/**
 * The hours a timesheet accounts for, split by what they were.
 *
 * **Four numbers rather than one**, and the split is the feature's answer to what
 * an administrator actually asks. "This person logged 168 hours" is not reviewable
 * — it does not say whether they worked a heavy month or were away for two weeks
 * over Christmas. `workedHours` is the number a project report is drawn from,
 * `leaveHours` and `holidayHours` are the two ways a day can be full without
 * anybody working, and `totalHours` is what the month adds up to.
 *
 * **None of them is a column.** They are `SUM(hours) GROUP BY type`, computed on
 * the way out, for the reason `EmployeeLeaveBalance.remainingDays` is not a
 * column and `LeaveRequest.requestedWorkingDays` is not either: a stored total is
 * a second home for a fact the entries already state, and the day an `UPDATE`
 * touched one and not the other the database would hold a timesheet that
 * contradicted its own lines. The cost is one `groupBy` per page — not one per
 * row — which is what {@link TimesheetHoursByTimesheet} exists to make possible.
 *
 * `totalHours` is stated rather than left to the client to add up, because it is
 * the one figure that appears on every screen and three clients adding three
 * subtotals is three chances to forget one.
 */
export interface TimesheetHours {
  /** `WORK` lines — the hours booked to projects. */
  workedHours: number;
  /** `LEAVE` lines — approved absence, at the configured rate for the day. */
  leaveHours: number;
  /** `HOLIDAY` lines — days the company was closed. */
  holidayHours: number;
  /** All three together. */
  totalHours: number;
}

/**
 * A timesheet as the **single-timesheet** endpoints expose it: the header, every
 * line, and the totals.
 *
 * This is the "see how it was filled" view the administrative list deliberately
 * omits — see `TimesheetListRowEntity` for why a list of a hundred months does
 * not carry three thousand entries.
 *
 * Six differences from the `timesheets` row are worth naming:
 *
 * 1. **The foreign keys are gone**, replaced by the records they point at.
 * 2. **The dates are strings**, ISO-8601, which is what a client receives once
 *    the body is serialised.
 * 3. **`month` and `year` stay two integers**, matching the URL that asked for
 *    them and the unique constraint that guarantees there is one.
 * 4. **The totals are here and are in no column.** See {@link TimesheetHours}.
 * 5. **`scheduleSnapshot` is exposed on an approved timesheet and null on every
 *    other**, because it is the answer to "what rules was this judged by" — a
 *    question that only has an answer once somebody has judged it.
 * 6. **`isStale` is published rather than acted on.** The API says the month is
 *    worth reviewing; it does not decide what the person should do about it, and
 *    it has changed none of their entries to make the point. See
 *    `TimesheetService.refreshStaleness`.
 */
export interface TimesheetEntity extends TimesheetHours {
  id: string;
  employee: TimesheetOwnerSummary;
  /** `1`–`12`. January is `1`, not `0`. */
  month: number;
  year: number;
  status: TimesheetStatus;
  submittedAt: string | null;
  reviewedAt: string | null;
  /** Who approved or refused it, or `null` while nobody has. */
  reviewedBy: TimesheetEmployeeSummary | null;
  /**
   * Why it was refused. Not cleared when the owner resubmits — the reason is what
   * they were asked to fix, and blanking it the moment they act on it would leave
   * the history of the month unable to say why it took two attempts.
   */
  rejectionReason: string | null;
  /** Something it was filled against has changed. Advisory; nothing was rewritten. */
  isStale: boolean;
  /**
   * The working-day and hours context this month was approved against.
   *
   * Non-null only on an `APPROVED` timesheet. It is a *photograph* — nothing
   * queries inside it and no client is expected to — published so an approval can
   * be explained years later, when the live schedule no longer resembles the one
   * it was signed off under.
   */
  scheduleSnapshot: Prisma.JsonValue | null;
  /** Every line, in day order then insertion order. */
  entries: TimesheetEntryEntity[];
  createdAt: string;
  updatedAt: string;
}

const EMPLOYEE_SUMMARY_SELECT = {
  id: true,
  employeeCode: true,
  firstName: true,
  lastName: true,
} as const satisfies Prisma.EmployeeSelect;

const OWNER_SUMMARY_SELECT = {
  ...EMPLOYEE_SUMMARY_SELECT,
  department: { select: { id: true, code: true, name: true } },
  position: { select: { id: true, code: true, name: true } },
} as const satisfies Prisma.EmployeeSelect;

/**
 * The header columns every read in this module shares.
 *
 * A `select` rather than an `include`, and here that choice does real work: this
 * row joins to `employees`, which itself joins to `users` — `include` would
 * return every column of each, putting `User.passwordHash` one careless nesting
 * away from a timesheet screen.
 */
export const TIMESHEET_BASE_SELECT = {
  id: true,
  month: true,
  year: true,
  status: true,
  submittedAt: true,
  reviewedAt: true,
  rejectionReason: true,
  isStale: true,
  employee: { select: OWNER_SUMMARY_SELECT },
  reviewedBy: { select: EMPLOYEE_SUMMARY_SELECT },
  createdAt: true,
  updatedAt: true,
} as const satisfies Prisma.TimesheetSelect;

/**
 * What a single timesheet reads: the header, the snapshot, and every line.
 *
 * Ordered by date and then by insertion, so a day holding several entries renders
 * the same way on every request rather than in whatever order the rows happened
 * to come back. `date` first is exactly the `(timesheet_id, date)` index, so the
 * ordering is satisfied by the same scan as the filter.
 *
 * `scheduleSnapshot` is read here and **not** in the list select: it is a JSON
 * blob per row, and a page of a hundred months would carry a hundred copies of a
 * configuration nobody is looking at.
 */
export const TIMESHEET_DETAIL_SELECT = {
  ...TIMESHEET_BASE_SELECT,
  scheduleSnapshot: true,
  entries: {
    orderBy: [{ date: 'asc' }, { createdAt: 'asc' }],
    select: TIMESHEET_ENTRY_PUBLIC_SELECT,
  },
} as const satisfies Prisma.TimesheetSelect;

/** The header columns, as every select reads them. */
export type TimesheetBaseRow = Pick<
  TimesheetModel,
  | 'id'
  | 'month'
  | 'year'
  | 'status'
  | 'submittedAt'
  | 'reviewedAt'
  | 'rejectionReason'
  | 'isStale'
  | 'createdAt'
  | 'updatedAt'
> & {
  employee: TimesheetOwnerSummary;
  reviewedBy: TimesheetEmployeeSummary | null;
};

/** A row read through {@link TIMESHEET_DETAIL_SELECT}. */
export type TimesheetDetailRow = TimesheetBaseRow & {
  scheduleSnapshot: Prisma.JsonValue | null;
  entries: TimesheetEntryRow[];
};

/**
 * Maps a row and its totals onto the resource the single-timesheet endpoints
 * return.
 *
 * The totals are passed in rather than computed here, and that is the shape the
 * whole feature depends on: they are a `groupBy` over another table, so summing
 * them inside a mapper would mean a query per row. The caller aggregates once for
 * however many timesheets it is about to map — the same call
 * `toMyLeaveRequestEntity` makes with `requestedWorkingDays`.
 */
export function toTimesheetEntity(
  timesheet: TimesheetDetailRow,
  hours: TimesheetHours,
): TimesheetEntity {
  return {
    ...toTimesheetBase(timesheet),
    ...hours,
    scheduleSnapshot: timesheet.scheduleSnapshot,
    entries: timesheet.entries.map(toTimesheetEntryEntity),
  };
}

/** The header fields every timesheet payload shares, mapped once. */
export function toTimesheetBase(
  timesheet: TimesheetBaseRow,
): Omit<
  TimesheetEntity,
  keyof TimesheetHours | 'entries' | 'scheduleSnapshot'
> {
  return {
    id: timesheet.id,
    employee: {
      ...toEmployeeSummary(timesheet.employee),
      department: {
        id: timesheet.employee.department.id,
        code: timesheet.employee.department.code,
        name: timesheet.employee.department.name,
      },
      position: {
        id: timesheet.employee.position.id,
        code: timesheet.employee.position.code,
        name: timesheet.employee.position.name,
      },
    },
    month: timesheet.month,
    year: timesheet.year,
    status: timesheet.status,
    submittedAt: toNullableIsoTimestamp(timesheet.submittedAt),
    reviewedAt: toNullableIsoTimestamp(timesheet.reviewedAt),
    reviewedBy:
      timesheet.reviewedBy === null
        ? null
        : toEmployeeSummary(timesheet.reviewedBy),
    rejectionReason: timesheet.rejectionReason,
    isStale: timesheet.isStale,
    createdAt: toIsoTimestamp(timesheet.createdAt),
    updatedAt: toIsoTimestamp(timesheet.updatedAt),
  };
}

/** The one rendering of a person, used for both roles they may play. */
export function toEmployeeSummary(
  employee: TimesheetEmployeeSummary,
): TimesheetEmployeeSummary {
  return {
    id: employee.id,
    employeeCode: employee.employeeCode,
    firstName: employee.firstName,
    lastName: employee.lastName,
  };
}

/** A timesheet with no lines yet — what a fresh draft's totals are. */
export const NO_HOURS: TimesheetHours = {
  workedHours: 0,
  leaveHours: 0,
  holidayHours: 0,
  totalHours: 0,
};

/** The totals of several timesheets at once, keyed by id. */
export type TimesheetHoursByTimesheet = ReadonlyMap<string, TimesheetHours>;
