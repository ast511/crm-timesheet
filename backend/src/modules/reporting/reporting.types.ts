import { DayClass } from './reporting.constants';

/**
 * The resolved inputs a builder is handed, in the shapes this module needs them.
 *
 * A file of its own rather than types hung off the source service, because both
 * sides depend on them: the source service *produces* these and the five
 * builders *consume* them, and putting them on either side would make the other
 * import a module it has no other reason to know about. It is the seam between
 * the half of this feature that does I/O and the half that is pure.
 *
 * **None of these is another module's entity.** `ReportEmployee` is not
 * `EmployeeEntity` and `ReportProject` is not `ProjectEntity`, deliberately:
 * those resources are shaped for a screen — ISO strings, archive flags, colours,
 * estimated hours — and a report needs a name, a code and a couple of dates. The
 * same call Feature 030 makes with `ApprovedLeaveDay` over `LeaveRequestEntity`.
 * Narrow shapes here are what let the `select` in each query stay narrow too.
 */

/** One person a report has a row or a column for. */
export interface ReportEmployee {
  readonly id: string;
  readonly employeeCode: string;
  readonly firstName: string;
  readonly lastName: string;
  /** `Ion Popescu` — assembled once, since every report prints it. */
  readonly fullName: string;
  /** Required columns on `employees`, so never null. */
  readonly departmentCode: string;
  readonly departmentName: string;
  readonly positionName: string;
  /**
   * The employment window, as `Date`s at UTC midnight.
   *
   * Carried on the employee rather than fetched per day, because every day-class
   * decision needs it: a month must not report somebody as absent from days
   * before they were hired. `terminationDate` is `null` for somebody still here.
   */
  readonly hireDate: Date;
  readonly terminationDate: Date | null;
}

/** One project a report has a row or a column for. */
export interface ReportProject {
  readonly id: string;
  readonly code: string;
  readonly name: string;
  /**
   * The customer, as a free string.
   *
   * **There is no client entity in this application.** `Project.clientName` is a
   * required text column, so "group by client" is a group by this string and
   * `?clientName=` is how a caller narrows to one. A `clientId` filter would name
   * a resource that does not exist and could not be looked up.
   */
  readonly clientName: string;
}

/** One `(project, employee)` pair and the hours booked to it. */
export interface ProjectEmployeeHourRow {
  readonly projectId: string;
  readonly employeeId: string;
  readonly hours: number;
}

/** One employee's approved hours on one calendar day. */
export interface EmployeeDayHours {
  readonly employeeId: string;
  /** `2026-09-07`, from the stored calendar date. Never zone-shifted. */
  readonly dateKey: string;
  readonly hours: number;
}

/** Where one employee's month stands, for the status report. */
export interface EmployeeTimesheetState {
  readonly employeeId: string;
  readonly status: string;
  /**
   * When the timesheet last changed, as an **instant**.
   *
   * A `Date` rather than a rendered string, because which calendar day it falls
   * on depends on the company's zone and only the builder knows that. This is the
   * one value in the whole feature that is genuinely zone-sensitive.
   */
  readonly updatedAt: Date;
}

/** One day of approved absence, already resolved to the marker it prints. */
export interface EmployeeLeaveDay {
  readonly employeeId: string;
  readonly dateKey: string;
  readonly leaveTypeId: string;
  /** `LeaveType.reportMarker` — configuration, never a constant of this module. */
  readonly marker: string;
  readonly label: string;
  /** Half a day of leave still occupies the day's cell, but says so. */
  readonly isHalfDay: boolean;
}

/**
 * What one employee's one day was.
 *
 * The single classification every day-level report reads, so the attendance
 * sheet, the leave calendar and the status summary cannot disagree about whether
 * the 25th was a holiday. Produced once per `(employee, day)` by the source
 * service and then only formatted.
 */
export interface ClassifiedDay {
  readonly dateKey: string;
  /** The day of the month, `1`–`31`. */
  readonly dayOfMonth: number;
  readonly dayClass: DayClass;
  /** The marker to print: a fixed one, or the leave type's. Empty on worked days. */
  readonly marker: string;
  /** Ties the cell to a legend entry; `null` on a class with no legend line. */
  readonly legendKey: string | null;
  /** What a legend calls this day's class. */
  readonly legendLabel: string | null;
  /** Approved hours booked to the day; `0` on every non-worked class. */
  readonly hours: number;
  /** The leave taken that day, when the class is `LEAVE`. */
  readonly leave: EmployeeLeaveDay | null;
}

/** One employee's whole month, classified. */
export interface ClassifiedMonth {
  readonly employee: ReportEmployee;
  readonly days: readonly ClassifiedDay[];
  /** Approved hours across the month. */
  readonly totalHours: number;
}
