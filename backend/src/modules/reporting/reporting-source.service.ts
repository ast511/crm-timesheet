import { BadRequestException, Injectable } from '@nestjs/common';

import { toDateKey } from '../../common/utils/date.util';
import { EmployeeService } from '../employees/employee.service';
import {
  ApprovedLeaveSpan,
  LeaveRequestsService,
} from '../leave-requests/leave-requests.service';
import {
  WorkingDayCalculator,
  WorkingDaysService,
} from '../leave-requests/working-days.service';
import { ProjectService } from '../projects/project.service';
import {
  TimesheetService,
  TimesheetStateRow,
} from '../timesheet-management/timesheet.service';
import { WorkScheduleService } from '../work-schedule/work-schedule.service';
import { ReportQueryDto } from './dto/report-query.dto';
import { ReportPeriod } from './renderers/report-data-model';
import {
  FIXED_DAY_MARKERS,
  REPORT_MAX_EMPLOYEES,
  REPORT_MAX_PROJECTS,
  REPORT_MONTH_NAMES,
} from './reporting.constants';
import {
  ClassifiedDay,
  ClassifiedMonth,
  EmployeeLeaveDay,
  ProjectEmployeeHourRow,
  ReportEmployee,
  ReportProject,
} from './reporting.types';

/** Whole days, in milliseconds. The date columns hold UTC instants, so exact. */
const MS_PER_DAY = 86_400_000;

/** Everything reports 1 and 5 need, resolved once. */
export interface ProjectHoursSource {
  readonly projects: readonly ReportProject[];
  readonly employees: readonly ReportEmployee[];
  readonly rows: readonly ProjectEmployeeHourRow[];
}

/** Everything reports 2, 3 and 4 need, resolved once. */
export interface DaySource {
  readonly months: readonly ClassifiedMonth[];
  readonly states: ReadonlyMap<string, TimesheetStateRow>;
  /** The leave types that actually occur in the period, for the legend. */
  readonly leaveMarkers: readonly EmployeeLeaveDay[];
}

/**
 * The I/O half of reporting: it reads the other modules and hands the builders
 * plain data.
 *
 * The module is deliberately two services, and the seam is the same one
 * Feature 030 draws between `TimesheetService` and `TimesheetFillService`.
 * **This one queries and classifies; the builders are pure.** A builder takes
 * resolved inputs and returns a data model — no Prisma, no clock, no HTTP — which
 * is what lets every report's arithmetic be tested without a database, and what
 * makes "preview and export agree" a property of one function rather than of
 * five.
 *
 * Three things it owns, and nothing else does:
 *
 * 1. **Every query.** Reporting touches no table directly. The employees come
 *    from `EmployeeService`, the projects from `ProjectService`, the hours and
 *    statuses from `TimesheetService`, the absences from `LeaveRequestsService`,
 *    the weekday and holiday rules from `WorkingDaysService`, and the timezone
 *    from `WorkScheduleService`. That is the rule the whole project keeps, and it
 *    is why this feature adds no schema table and no second copy of anybody's
 *    logic.
 *
 * 2. **Day classification, once.** {@link classifyMonths} decides what each
 *    `(employee, day)` was, and the attendance sheet, the leave calendar and the
 *    status summary all read the result. Three builders each asking "was the 25th
 *    a holiday" would eventually give three answers; here there is one, and the
 *    precedence between the classes is stated in exactly one place.
 *
 * 3. **The caps.** A request whose population would render an unbounded grid is
 *    refused before any of it is built — see {@link assertWithinCaps}.
 *
 * **Timezone.** The company's zone is read here and carried on the period, and it
 * is applied to *instants* only — `updatedAt` on the status report. The calendar
 * columns (a timesheet entry's `date`, a leave span, a holiday) hold a calendar
 * day at UTC midnight and are read with UTC accessors: re-interpreting one
 * through a zone west of Greenwich would move it into the previous column of
 * every grid. See `toZonedDateKey` for the full statement of the distinction.
 */
@Injectable()
export class ReportingSourceService {
  constructor(
    private readonly workSchedule: WorkScheduleService,
    private readonly workingDays: WorkingDaysService,
    private readonly employees: EmployeeService,
    private readonly projects: ProjectService,
    private readonly timesheets: TimesheetService,
    private readonly leaveRequests: LeaveRequestsService,
  ) {}

  /**
   * The period a report covers, with the company's zone attached.
   *
   * **A future month is allowed and yields an empty report.** Nothing has been
   * worked yet, so every grid comes back with its population and no hours, which
   * is the honest answer — and it is what lets somebody open next month's leave
   * calendar to see who has already booked time off, which is a real use of
   * report 4. Refusing it would be this module inventing a rule the timesheet
   * module states for a different reason: a month cannot be *filled in* before it
   * happens, but it can certainly be asked about.
   */
  async resolvePeriod(query: ReportQueryDto): Promise<ReportPeriod> {
    const timezone = await this.workSchedule.findTimezone();

    return {
      month: query.month,
      year: query.year,
      label: `${REPORT_MONTH_NAMES[query.month - 1]} ${String(query.year)}`,
      key: `${String(query.year)}-${String(query.month).padStart(2, '0')}`,
      timezone,
    };
  }

  /**
   * The population one report covers.
   *
   * Every employee by default; `departmentId` and `employeeId` narrow it. A
   * filter that matches nobody produces an empty population rather than a `404`,
   * which is the standard behaviour across this project: an unknown id is a
   * report about no-one, not a broken request.
   */
  async resolveEmployees(query: ReportQueryDto): Promise<ReportEmployee[]> {
    const employees = await this.employees.findForReporting({
      departmentId: query.departmentId,
      employeeId: query.employeeId,
    });

    assertWithinCaps(employees.length, REPORT_MAX_EMPLOYEES, 'employees');

    return employees.map((employee) => ({
      ...employee,
      fullName: `${employee.firstName} ${employee.lastName}`,
    }));
  }

  /**
   * The project × employee hours behind reports 1 and 5.
   *
   * The two reports call this identically and differ only in how they render what
   * comes back — which is what makes the reconciliation between them meaningful
   * rather than coincidental.
   */
  async resolveProjectHours(
    query: ReportQueryDto,
    employees: readonly ReportEmployee[],
  ): Promise<ProjectHoursSource> {
    const projects = await this.projects.findForReporting({
      projectId: query.projectId,
      clientName: query.clientName,
    });

    assertWithinCaps(projects.length, REPORT_MAX_PROJECTS, 'projects');

    const rows = await this.timesheets.findApprovedProjectHours(
      { month: query.month, year: query.year },
      employees.map(({ id }) => id),
      // Only narrowed when the caller narrowed it. Passing every project id
      // would turn an unfiltered report into an `IN` list of five hundred keys
      // for no gain — the join already restricts the entries to this period.
      query.projectId === undefined && query.clientName === undefined
        ? undefined
        : projects.map(({ id }) => id),
    );

    return { projects, employees, rows };
  }

  /**
   * Everything reports 2, 3 and 4 read: each person's month, classified day by
   * day, plus where their timesheet stands.
   *
   * Six reads, and every one of them covers the **whole population at once**.
   * There is no per-employee query anywhere in this method, which is what keeps a
   * report of five hundred people a fixed handful of round trips rather than
   * three thousand.
   */
  async resolveDays(
    query: ReportQueryDto,
    employees: readonly ReportEmployee[],
    options: { readonly includeHours: boolean },
  ): Promise<DaySource> {
    const period = { month: query.month, year: query.year };
    const span = monthSpan(query.month, query.year);
    const employeeIds = employees.map(({ id }) => id);

    const [calculator, leave, dayHours, states] = await Promise.all([
      this.workingDays.createCalculator([query.year]),
      this.leaveRequests.findApprovedForEmployeesInSpan(employeeIds, span),
      // Reports 3 and 2 need hours; report 4 is about absence and does not
      // depend on any timesheet existing, so it does not pay for this read.
      options.includeHours
        ? this.timesheets.findApprovedDailyHours(period, employeeIds)
        : Promise.resolve([]),
      this.timesheets.findStatesForPeriod(period, employeeIds),
    ]);

    const hoursByDay = new Map(
      dayHours.map((row) => [dayKey(row.employeeId, row.dateKey), row.hours]),
    );

    const months = employees.map((employee) =>
      this.classifyMonth(employee, span, calculator, leave, hoursByDay),
    );

    return {
      months,
      states: new Map(states.map((state) => [state.employeeId, state])),
      leaveMarkers: months.flatMap((month) =>
        month.days
          .map((day) => day.leave)
          .filter((day): day is EmployeeLeaveDay => day !== null),
      ),
    };
  }

  /**
   * What each day of one person's month was.
   *
   * **The precedence is the whole rule, and it matches Feature 030's fill-in
   * engine exactly** — which is deliberate, because a report that classified days
   * differently from the module that recorded them would show hours on days the
   * timesheet said could not carry any:
   *
   * 1. **Outside the employment window** beats everything. Somebody who joined on
   *    the 12th was not absent on the 5th; they were not here. Counting those
   *    days as leave or as unworked would put an absence on a report for a person
   *    who did not yet work for the company.
   * 2. **A non-working weekday** beats a holiday and beats leave. A company that
   *    does not work Sundays does not observe a holiday falling on one, and
   *    nobody spends leave on a day they were not due in — the same reason
   *    `planMonth` writes no forced entry on such a day.
   * 3. **A holiday** beats leave. Feature 030 states this and the reason carries
   *    over unchanged: nobody spends a day of their allowance to be absent from a
   *    day the office was shut, and counting both would double the day.
   * 4. **Leave** beats worked — but keeps the hours. Half a day of leave leaves
   *    the rest of the day free for work, so such a day prints its marker *and*
   *    its hours rather than having to choose.
   * 5. What is left is a working day, **worked** if approved hours were booked to
   *    it and **expected** if not.
   *
   * The classes are mutually exclusive and cover every day, which is what lets
   * report 2 assert that its counts sum to the length of the month.
   */
  private classifyMonth(
    employee: ReportEmployee,
    span: { startDate: Date; endDate: Date },
    calculator: WorkingDayCalculator,
    leave: readonly ApprovedLeaveSpan[],
    hoursByDay: ReadonlyMap<string, number>,
  ): ClassifiedMonth {
    const days: ClassifiedDay[] = [];
    let totalHours = 0;

    for (
      let time = span.startDate.getTime();
      time <= span.endDate.getTime();
      time += MS_PER_DAY
    ) {
      const date = new Date(time);
      const dateKey = toDateKey(date);
      const dayOfMonth = date.getUTCDate();
      const hours = hoursByDay.get(dayKey(employee.id, dateKey)) ?? 0;

      const day = this.classifyDay(
        employee,
        date,
        dateKey,
        dayOfMonth,
        calculator,
        leave,
        hours,
      );

      totalHours = round(totalHours + day.hours);
      days.push(day);
    }

    return { employee, days, totalHours };
  }

  /** One day, against the precedence stated on {@link classifyMonth}. */
  private classifyDay(
    employee: ReportEmployee,
    date: Date,
    dateKey: string,
    dayOfMonth: number,
    calculator: WorkingDayCalculator,
    leave: readonly ApprovedLeaveSpan[],
    hours: number,
  ): ClassifiedDay {
    if (!isWithinEmployment(employee, date)) {
      return fixedDay('NOT_EMPLOYED', dateKey, dayOfMonth, 0);
    }

    if (!calculator.isWorkingWeekday(date)) {
      return fixedDay('NON_WORKING', dateKey, dayOfMonth, 0);
    }

    if (calculator.isPublicHoliday(date)) {
      return fixedDay('HOLIDAY', dateKey, dayOfMonth, 0);
    }

    const absence = leave.find(
      (request) =>
        request.employeeId === employee.id &&
        date.getTime() >= startOfDay(request.startDate) &&
        date.getTime() <= startOfDay(request.endDate),
    );

    if (absence !== undefined) {
      const day: EmployeeLeaveDay = {
        employeeId: employee.id,
        dateKey,
        leaveTypeId: absence.leaveTypeId,
        marker: absence.reportMarker,
        label: absence.leaveTypeLabel,
        isHalfDay: absence.isHalfDay,
      };

      return {
        dateKey,
        dayOfMonth,
        dayClass: 'LEAVE',
        marker: absence.reportMarker,
        // Keyed by leave type rather than by marker, so two types could never
        // collapse into one legend line even if the unique index were lifted.
        legendKey: `leave:${absence.leaveTypeId}`,
        legendLabel: absence.leaveTypeLabel,
        hours,
        leave: day,
      };
    }

    return fixedDay(
      hours > 0 ? 'WORKED' : 'EXPECTED',
      dateKey,
      dayOfMonth,
      hours,
    );
  }
}

/** A day of one of the fixed classes, with its marker and legend text. */
function fixedDay(
  dayClass: Exclude<ClassifiedDay['dayClass'], 'LEAVE'>,
  dateKey: string,
  dayOfMonth: number,
  hours: number,
): ClassifiedDay {
  const { marker, label } = FIXED_DAY_MARKERS[dayClass];

  return {
    dateKey,
    dayOfMonth,
    dayClass,
    marker,
    // A worked day and an expected one carry no marker, so neither earns a
    // legend line: the grid shows hours or nothing, and "blank means nothing was
    // recorded" needs no key.
    legendKey: marker === '' ? null : `class:${dayClass}`,
    legendLabel: marker === '' ? null : label,
    hours,
    leave: null,
  };
}

/**
 * The first and last day of a month, both at UTC midnight and both inclusive.
 *
 * The same convention `timesheets`, `leave_requests` and `public_holidays` all
 * store, so a span from here can be handed straight to the leave overlap query
 * without a translation step that would eventually get a boundary wrong.
 */
function monthSpan(
  month: number,
  year: number,
): { startDate: Date; endDate: Date } {
  return {
    startDate: new Date(Date.UTC(year, month - 1, 1)),
    // Day 0 of the next month is the last day of this one, which gets February
    // and the leap years right without a table.
    endDate: new Date(Date.UTC(year, month, 0)),
  };
}

/** Whether somebody was employed here on a date. */
function isWithinEmployment(employee: ReportEmployee, date: Date): boolean {
  if (date.getTime() < startOfDay(employee.hireDate)) {
    return false;
  }

  return (
    employee.terminationDate === null ||
    date.getTime() <= startOfDay(employee.terminationDate)
  );
}

/** `employeeId|2026-09-07` — the key both per-day lookups agree on. */
function dayKey(employeeId: string, dateKey: string): string {
  return `${employeeId}|${dateKey}`;
}

/** The UTC midnight of a date, so two calendar days compare as days. */
function startOfDay(date: Date): number {
  return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
}

/** Rounds a running total to the two decimals the `decimal(5, 2)` column holds. */
function round(value: number): number {
  return Math.round(value * 100) / 100;
}

/**
 * Refuses a request whose grid would be unbounded.
 *
 * A `400` rather than a slow `200`, and the message names the cap and the filter
 * that narrows past it. Generation is synchronous, so an unbounded population is
 * unbounded work inside one request — and a report that merely took two minutes
 * would look like a broken server rather than a request that should have been
 * scoped. The feature document records the threshold and the asynchronous
 * pipeline that is the real answer beyond it.
 */
function assertWithinCaps(count: number, cap: number, subject: string): void {
  if (count > cap) {
    throw new BadRequestException([
      `This report would cover ${String(count)} ${subject}, which is above the limit of ${String(cap)}. Narrow it with a filter — departmentId, employeeId, projectId or clientName — and generate it in parts.`,
    ]);
  }
}
