import {
  ReportCell,
  ReportColumn,
  ReportDataModel,
  ReportPeriod,
  ReportRow,
} from '../renderers/report-data-model';
import { LEAVE_ONLY_NOTE } from '../reporting.constants';
import { ClassifiedDay, ClassifiedMonth } from '../reporting.types';
import {
  buildLegend,
  countCell,
  markerCell,
  textCell,
  toCells,
} from './report-cells';

const EMPLOYEE_COLUMN = 'employee';
const TOTAL_COLUMN = 'total';

/**
 * Report 4 — *Situații lunare concedii angajați*.
 *
 * Rows are employees, columns are the days of the month, each cell carrying the
 * marker for what that day was. The last column is the person's absence total,
 * and the last row is the per-day total across everybody — which is the figure
 * this report is actually consulted for: how many people are away on the 14th.
 *
 * **It reads no timesheet.** This is the one report that does not depend on a
 * month having been filled in or approved, and it is deliberate: the question it
 * answers is "who is away", which is settled by an approved leave request and a
 * public holiday, both of which are known in advance. Gating it on timesheet
 * approval would make next month's calendar permanently empty — and next month
 * is exactly when somebody plans cover.
 *
 * It follows that a "worked" day here means only *a working day on which no
 * absence was recorded*, not a day with approved hours booked to it. The
 * attendance sheet is the report that knows about hours, and this one prints
 * nothing in those cells rather than implying it does.
 *
 * **Every marker is configuration.** A leave day carries its `LeaveType`'s
 * `reportMarker`, so a company that adds a kind of leave sees it on this calendar
 * the first time somebody takes it, with no code change and no entry in any
 * constant of this module.
 */
export function buildLeaveCalendar(
  period: ReportPeriod,
  generatedAt: string,
  months: readonly ClassifiedMonth[],
): ReportDataModel {
  const days = months[0]?.days ?? [];

  const columns: ReportColumn[] = [
    {
      key: EMPLOYEE_COLUMN,
      label: 'Angajat',
      sublabel: null,
      type: 'text',
      isTotal: false,
    },
    ...days.map((day): ReportColumn => ({
      key: day.dateKey,
      label: String(day.dayOfMonth),
      sublabel: null,
      type: 'marker',
      isTotal: false,
    })),
    {
      key: TOTAL_COLUMN,
      label: 'Total absențe',
      sublabel: null,
      type: 'number',
      isTotal: true,
    },
  ];

  const rows = months.map((month): ReportRow => ({
    key: month.employee.id,
    kind: 'data',
    label: month.employee.fullName,
    badge: null,
    cells: toCells([
      [EMPLOYEE_COLUMN, textCell(month.employee.fullName)],
      ...month.days.map((day): readonly [string, ReportCell] => [
        day.dateKey,
        toDayCell(day),
      ]),
      [TOTAL_COLUMN, countCell(countLeaveDays(month))],
    ]),
  }));

  // The per-day totals row: how many of the population were on leave that day.
  // Counted over `LEAVE` only, not over holidays and free days — everybody is
  // absent on a Sunday, and a row reading "13" for every weekend would drown the
  // number somebody is looking for.
  rows.push({
    key: 'total',
    kind: 'total',
    label: 'Total pe zi',
    badge: null,
    cells: toCells([
      [EMPLOYEE_COLUMN, textCell('Total pe zi')],
      ...days.map((day): readonly [string, ReportCell] => [
        day.dateKey,
        countCell(countAbsentOn(months, day.dateKey)),
      ]),
      [
        TOTAL_COLUMN,
        countCell(
          months.reduce((total, month) => total + countLeaveDays(month), 0),
        ),
      ],
    ]),
  });

  const totalLeaveDays = months.reduce(
    (total, month) => total + countLeaveDays(month),
    0,
  );

  return {
    reportType: 'leave-calendar',
    title: 'Monthly employee leave calendar',
    romanianTitle: 'Situații lunare concedii angajați',
    subtitle: `Situația concediilor pentru ${String(months.length)} angajați`,
    period,
    generatedAt,
    orientation: 'landscape',
    sourceNote: LEAVE_ONLY_NOTE,
    kpis: [
      {
        key: 'totalEmployees',
        label: 'Total Angajați',
        value: months.length,
        unit: 'angajați',
      },
      {
        key: 'totalLeaveDays',
        label: 'Total zile concediu',
        value: totalLeaveDays,
        unit: 'zile',
      },
      {
        key: 'employeesOnLeave',
        label: 'Angajați cu concediu',
        value: months.filter((month) => countLeaveDays(month) > 0).length,
        unit: 'angajați',
      },
    ],
    columns,
    rows,
    legend: buildLegend(months),
  };
}

/**
 * One day cell.
 *
 * A working day with no absence is blank rather than marked. The grid exists to
 * make absence visible, and a marker on every ordinary Tuesday would bury the
 * days that matter under three hundred identical letters.
 */
function toDayCell(day: ClassifiedDay): ReportCell {
  if (day.marker === '') {
    return textCell(null);
  }

  return markerCell(day.marker, day.legendKey ?? day.marker);
}

function countLeaveDays(month: ClassifiedMonth): number {
  return month.days.filter((day) => day.dayClass === 'LEAVE').length;
}

function countAbsentOn(
  months: readonly ClassifiedMonth[],
  dateKey: string,
): number {
  return months.filter((month) =>
    month.days.some(
      (day) => day.dateKey === dateKey && day.dayClass === 'LEAVE',
    ),
  ).length;
}
