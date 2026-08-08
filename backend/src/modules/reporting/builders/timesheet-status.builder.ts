import { toZonedDate } from '../../../common/utils/date.util';
import { TimesheetStateRow } from '../../timesheet-management/timesheet.service';
import {
  ReportCell,
  ReportColumn,
  ReportDataModel,
  ReportPeriod,
  ReportRow,
} from '../renderers/report-data-model';
import {
  ALL_STATES_NOTE,
  FIXED_DAY_MARKERS,
  REPORT_LOCALE,
} from '../reporting.constants';
import { ClassifiedMonth } from '../reporting.types';
import { countCell, textCell, toCells } from './report-cells';

const EMPLOYEE_COLUMN = 'employee';
const YEAR_COLUMN = 'year';
const MONTH_COLUMN = 'month';
const STATUS_COLUMN = 'status';
const MODIFIED_COLUMN = 'lastModified';
const LEAVE_TOTAL_COLUMN = 'leaveDays';
const HOLIDAY_COLUMN = 'holidayDays';
const FREE_COLUMN = 'freeDays';
const NOT_EMPLOYED_COLUMN = 'notEmployedDays';
const WORKING_COLUMN = 'workingDays';
const TOTAL_COLUMN = 'totalDays';

/**
 * How each stored status is named on the report, in the language it is read in.
 *
 * A lookup rather than the enum value, because `SUBMITTED` on a Romanian
 * attendance report is not what anybody calls it. The fifth entry is not a
 * status — see {@link NO_TIMESHEET_LABEL}.
 */
const STATUS_LABELS: Readonly<Record<string, string>> = {
  DRAFT: 'Ciornă',
  SUBMITTED: 'În așteptare',
  APPROVED: 'Aprobat',
  REJECTED: 'Respins',
};

/**
 * What an employee with no timesheet at all is called.
 *
 * **Not a fifth status and deliberately not blank.** "This person has not opened
 * their month" is the single most actionable line on this report — it is who
 * needs chasing — and a blank cell would read as a rendering fault. It is also
 * genuinely different from `Ciornă`: a draft means somebody started, and this
 * means nobody did.
 */
const NO_TIMESHEET_LABEL = 'Fără timesheet';

/**
 * Report 2 — *Centralizator stare timesheeturi*.
 *
 * One row per employee: where their month stands, when it last moved, and how
 * their days divided.
 *
 * **The one report that reads every timesheet state**, because the state is what
 * it reports. Filtering to approved months would leave it unable to answer the
 * question it exists for — which months are still outstanding — and an employee
 * with no timesheet at all appears with {@link NO_TIMESHEET_LABEL} rather than
 * being dropped, since a missing month is the finding.
 *
 * **The day-count columns are partly dynamic**, and this is where the leave-type
 * rule shows. There is no fixed "medical days" column: instead there is one
 * column per leave type that **actually occurs in the period**, headed by that
 * type's configured `reportMarker`, plus a `Total concedii` column summing them.
 * A company that adds a kind of leave sees a column appear the first month
 * somebody takes it, with no code change. The remaining columns — holidays, free
 * days, working days — are fixed, because those are facts about the calendar
 * rather than rows somebody configures.
 *
 * **The counts sum to the length of the month, per employee**, and that is an
 * invariant rather than a coincidence: the day classes are mutually exclusive
 * and total, so `leave + holidays + free + outside-employment + working` is
 * every day. The test asserts it, and it is what makes the row trustworthy —
 * a breakdown that does not add up is a breakdown nobody can act on.
 */
export function buildTimesheetStatus(
  period: ReportPeriod,
  generatedAt: string,
  months: readonly ClassifiedMonth[],
  states: ReadonlyMap<string, TimesheetStateRow>,
): ReportDataModel {
  const leaveTypes = collectLeaveTypes(months);

  const columns: ReportColumn[] = [
    {
      key: EMPLOYEE_COLUMN,
      label: 'Angajat',
      sublabel: null,
      type: 'text',
      isTotal: false,
    },
    {
      key: YEAR_COLUMN,
      label: 'An',
      sublabel: null,
      type: 'text',
      isTotal: false,
    },
    {
      key: MONTH_COLUMN,
      label: 'Lună',
      sublabel: null,
      type: 'text',
      isTotal: false,
    },
    {
      key: STATUS_COLUMN,
      label: 'Stare',
      sublabel: null,
      type: 'text',
      isTotal: false,
    },
    {
      key: MODIFIED_COLUMN,
      label: 'Ultima modificare',
      // States the clock, because this is the one column in the whole feature
      // whose value depends on it.
      sublabel: period.timezone,
      type: 'text',
      isTotal: false,
    },
    ...leaveTypes.map((type): ReportColumn => ({
      key: type.key,
      label: type.marker,
      sublabel: type.label,
      type: 'number',
      isTotal: false,
    })),
    {
      key: LEAVE_TOTAL_COLUMN,
      label: 'Total concedii',
      sublabel: null,
      type: 'number',
      isTotal: false,
    },
    {
      key: HOLIDAY_COLUMN,
      label: 'Sărbători',
      sublabel: FIXED_DAY_MARKERS.HOLIDAY.marker,
      type: 'number',
      isTotal: false,
    },
    {
      key: FREE_COLUMN,
      label: 'Zile libere',
      sublabel: FIXED_DAY_MARKERS.NON_WORKING.marker,
      type: 'number',
      isTotal: false,
    },
    {
      key: NOT_EMPLOYED_COLUMN,
      label: 'În afara angajării',
      sublabel: FIXED_DAY_MARKERS.NOT_EMPLOYED.marker,
      type: 'number',
      isTotal: false,
    },
    {
      key: WORKING_COLUMN,
      label: 'Zile lucrătoare',
      sublabel: null,
      type: 'number',
      isTotal: false,
    },
    {
      key: TOTAL_COLUMN,
      label: 'Total zile',
      sublabel: null,
      type: 'number',
      isTotal: true,
    },
  ];

  const rows = months.map((month): ReportRow => {
    const counts = countDays(month);
    const state = states.get(month.employee.id);

    return {
      key: month.employee.id,
      kind: 'data',
      label: month.employee.fullName,
      badge: null,
      cells: toCells([
        [EMPLOYEE_COLUMN, textCell(month.employee.fullName)],
        [YEAR_COLUMN, textCell(String(period.year))],
        [MONTH_COLUMN, textCell(String(period.month))],
        [
          STATUS_COLUMN,
          textCell(
            state === undefined
              ? NO_TIMESHEET_LABEL
              : (STATUS_LABELS[state.status] ?? state.status),
          ),
        ],
        [
          MODIFIED_COLUMN,
          textCell(
            // The one genuinely zone-sensitive value in the grid: `updatedAt`
            // is an instant, so which calendar day it belongs to depends on where
            // the company is. Rendered against the Work Schedule's zone rather
            // than the server's.
            //
            // `toZonedDate` rather than `toZonedDateKey`: this is a value
            // somebody *reads* in a Romanian document, so it follows their
            // conventions — `08.09.2026`. The ISO form is for keys, where a shape
            // that changed with the language would break every lookup.
            state === undefined
              ? null
              : toZonedDate(state.updatedAt, period.timezone, REPORT_LOCALE),
          ),
        ],
        ...leaveTypes.map((type): readonly [string, ReportCell] => [
          type.key,
          countCell(counts.leaveByType.get(type.leaveTypeId) ?? 0),
        ]),
        [LEAVE_TOTAL_COLUMN, countCell(counts.leave)],
        [HOLIDAY_COLUMN, countCell(counts.holiday)],
        [FREE_COLUMN, countCell(counts.free)],
        [NOT_EMPLOYED_COLUMN, countCell(counts.notEmployed)],
        [WORKING_COLUMN, countCell(counts.working)],
        [TOTAL_COLUMN, countCell(month.days.length)],
      ]),
    };
  });

  const stateValues = [...states.values()];

  return {
    reportType: 'timesheet-status',
    title: 'Timesheet status summary',
    romanianTitle: 'Centralizator stare timesheeturi',
    subtitle: `Starea timesheeturilor pentru ${String(months.length)} angajați`,
    period,
    generatedAt,
    // The one report narrow enough to read upright: its columns are a fixed
    // handful plus one per leave type in use, not one per day or per person.
    orientation: 'portrait',
    sourceNote: ALL_STATES_NOTE,
    kpis: [
      {
        key: 'totalTimesheets',
        label: 'Total timesheeturi',
        value: stateValues.length,
        unit: 'timesheeturi',
      },
      {
        key: 'approved',
        label: 'Aprobate',
        value: countStatus(stateValues, 'APPROVED'),
        unit: 'aprobate',
      },
      {
        key: 'pending',
        label: 'În așteptare',
        value: countStatus(stateValues, 'SUBMITTED'),
        unit: 'în așteptare',
      },
      {
        key: 'rejected',
        label: 'Respinse',
        value: countStatus(stateValues, 'REJECTED'),
        unit: 'respinse',
      },
    ],
    columns,
    rows,
    legend: [],
  };
}

/** One employee's month, counted by day class. */
interface DayCounts {
  readonly leave: number;
  readonly leaveByType: ReadonlyMap<string, number>;
  readonly holiday: number;
  readonly free: number;
  readonly notEmployed: number;
  readonly working: number;
}

/**
 * Counts one classified month.
 *
 * A single pass over days that are already classified, so this function makes no
 * decision about what a day *was* — it only tallies. That is what keeps this
 * report, the attendance sheet and the leave calendar in agreement: all three
 * count the same classification rather than each deciding for itself.
 */
function countDays(month: ClassifiedMonth): DayCounts {
  const leaveByType = new Map<string, number>();
  let leave = 0;
  let holiday = 0;
  let free = 0;
  let notEmployed = 0;
  let working = 0;

  for (const day of month.days) {
    switch (day.dayClass) {
      case 'LEAVE':
        leave += 1;

        if (day.leave !== null) {
          leaveByType.set(
            day.leave.leaveTypeId,
            (leaveByType.get(day.leave.leaveTypeId) ?? 0) + 1,
          );
        }
        break;
      case 'HOLIDAY':
        holiday += 1;
        break;
      case 'NON_WORKING':
        free += 1;
        break;
      case 'NOT_EMPLOYED':
        notEmployed += 1;
        break;
      // A worked day and an expected one are both days the person was due at
      // work, which is what "zile lucrătoare" means on this report. Splitting
      // them would answer a question the attendance sheet already answers better.
      case 'WORKED':
      case 'EXPECTED':
        working += 1;
        break;
    }
  }

  return { leave, leaveByType, holiday, free, notEmployed, working };
}

/** The leave types that occur in the period, in marker order. */
function collectLeaveTypes(
  months: readonly ClassifiedMonth[],
): { key: string; leaveTypeId: string; marker: string; label: string }[] {
  const types = new Map<
    string,
    { key: string; leaveTypeId: string; marker: string; label: string }
  >();

  for (const month of months) {
    for (const day of month.days) {
      if (day.leave === null || types.has(day.leave.leaveTypeId)) {
        continue;
      }

      types.set(day.leave.leaveTypeId, {
        key: `leave:${day.leave.leaveTypeId}`,
        leaveTypeId: day.leave.leaveTypeId,
        marker: day.leave.marker,
        label: day.leave.label,
      });
    }
  }

  return [...types.values()].sort((left, right) =>
    left.marker.localeCompare(right.marker),
  );
}

function countStatus(
  states: readonly TimesheetStateRow[],
  status: string,
): number {
  return states.filter((state) => state.status === status).length;
}
