import {
  ReportCell,
  ReportColumn,
  ReportDataModel,
  ReportPeriod,
  ReportRow,
} from '../entities/report-data-model.entity';
import { APPROVED_WORK_ONLY_NOTE } from '../reporting.constants';
import { ClassifiedMonth } from '../reporting.types';
import {
  buildLegend,
  formatHours,
  hoursCell,
  markerCell,
  textCell,
  toCells,
} from './report-cells';

const EMPLOYEE_COLUMN = 'employee';
const TOTAL_COLUMN = 'total';

/** The configured working hours a worked day is stamped with. */
export interface WorkingHoursWindow {
  readonly workStartTime: string;
  readonly workEndTime: string;
}

/**
 * Report 3 — *Foaie colectivă de prezență*.
 *
 * Rows are employees, columns are the days of the month, and the last column is
 * the person's total hours. A worked day shows the clock window and the hours; a
 * day that was not worked shows its marker.
 *
 * **The clock times come from the Work Schedule, not from the timesheet**, and
 * that is a limitation worth stating on the report rather than hiding in it.
 * This application records *hours per day*, never a start and an end: a timesheet
 * entry has a date, a project and a decimal number of hours, and Feature 030
 * chose that deliberately so a day can hold three projects and half a day of
 * leave. So the window printed here is `workStartTime`–`workEndTime` from the
 * company's configuration — what the working day nominally is — and the hours
 * beside it are the real approved total. A person who worked six hours on an
 * eight-hour day shows `09:00-18:00` and `6h`, which is honest; inventing an end
 * time of `15:00` from the hours would be the report making up a fact nobody
 * recorded.
 *
 * **Approved months only**, like the hour matrices: an attendance sheet is a
 * document somebody signs, and a draft is not evidence of attendance.
 *
 * **The legend is built from the days that actually occur.** A month in which
 * nobody took medical leave has no `M` line, and a leave type added next year
 * appears automatically — see `buildLegend`.
 */
export function buildAttendanceSheet(
  period: ReportPeriod,
  generatedAt: string,
  months: readonly ClassifiedMonth[],
  workingHours: WorkingHoursWindow,
): ReportDataModel {
  // Every employee's month has the same days, so the first row defines the
  // columns. An empty population yields an empty grid rather than a crash.
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
      label: 'Total ore',
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
        toDayCell(day, workingHours),
      ]),
      [TOTAL_COLUMN, hoursCell(month.totalHours)],
    ]),
  }));

  const totalHours = months.reduce(
    (total, month) => round(total + month.totalHours),
    0,
  );

  return {
    reportType: 'attendance-sheet',
    title: 'Collective attendance sheet',
    romanianTitle: 'Foaie colectivă de prezență',
    subtitle: `Prezența pentru ${String(months.length)} angajați, ${String(days.length)} zile`,
    period,
    generatedAt,
    orientation: 'landscape',
    sourceNote: APPROVED_WORK_ONLY_NOTE,
    kpis: [
      {
        key: 'totalEmployees',
        label: 'Total Angajați',
        value: months.length,
        unit: 'angajați',
      },
      {
        key: 'totalHours',
        label: 'Total Ore',
        value: totalHours,
        unit: 'ore',
      },
      {
        key: 'totalDays',
        label: 'Zile în lună',
        value: days.length,
        unit: 'zile',
      },
    ],
    columns,
    rows,
    legend: buildLegend(months),
  };
}

/**
 * One day cell: the clock window and hours if it was worked, the marker if not.
 *
 * A day of **half-day leave that also carries work** prints both — its marker
 * and its hours — rather than choosing. That case is exactly what Feature 030's
 * half-day feature exists to allow, and a cell showing only `C` would lose the
 * four hours somebody worked that afternoon from a document their pay is checked
 * against.
 */
function toDayCell(
  day: ClassifiedMonth['days'][number],
  workingHours: WorkingHoursWindow,
): ReportCell {
  if (day.dayClass === 'WORKED') {
    return {
      kind: 'number',
      value: day.hours,
      text: `${workingHours.workStartTime}-${workingHours.workEndTime}\n${formatHours(day.hours)}h`,
    };
  }

  if (day.marker === '') {
    // An `EXPECTED` day: the person was due at work and nothing was recorded.
    // Blank rather than a zero, because "no hours were approved for this day" and
    // "somebody approved zero hours" are different statements.
    return textCell(null);
  }

  const text =
    day.hours > 0 ? `${day.marker} ${formatHours(day.hours)}h` : day.marker;

  return markerCell(day.marker, day.legendKey ?? day.marker, text);
}

function round(value: number): number {
  return Math.round(value * 100) / 100;
}
