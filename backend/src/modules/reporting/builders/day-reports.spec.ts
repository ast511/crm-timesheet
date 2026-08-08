import { TimesheetStateRow } from '../../timesheet-management/timesheet.service';
import {
  ReportDataModel,
  ReportNumberCell,
  ReportPeriod,
  ReportTextCell,
} from '../renderers/report-data-model';
import {
  ClassifiedDay,
  ClassifiedMonth,
  ReportEmployee,
} from '../reporting.types';
import { buildAttendanceSheet } from './attendance-sheet.builder';
import { buildLeaveCalendar } from './leave-calendar.builder';
import { buildTimesheetStatus } from './timesheet-status.builder';

const PERIOD: ReportPeriod = {
  month: 9,
  year: 2026,
  label: 'September 2026',
  key: '2026-09',
  timezone: 'Europe/Bucharest',
};

const GENERATED_AT = '2026-10-01T08:00:00.000Z';

const EMPLOYEE: ReportEmployee = {
  id: 'e1',
  employeeCode: 'EMP-0001',
  firstName: 'Ion',
  lastName: 'Popescu',
  fullName: 'Ion Popescu',
  departmentCode: 'DEV',
  departmentName: 'Development',
  positionName: 'Developer',
  hireDate: new Date('2020-01-01T00:00:00.000Z'),
  terminationDate: null,
};

/** Builds a day of a given class, with the marker the fixed classes carry. */
function makeDay(
  dayOfMonth: number,
  dayClass: ClassifiedDay['dayClass'],
  options: {
    hours?: number;
    marker?: string;
    leaveTypeId?: string;
    label?: string;
  } = {},
): ClassifiedDay {
  const dateKey = `2026-09-${String(dayOfMonth).padStart(2, '0')}`;

  const fixed: Record<string, { marker: string; label: string | null }> = {
    NOT_EMPLOYED: { marker: '·', label: 'Outside employment' },
    NON_WORKING: { marker: 'L', label: 'Free / non-working day' },
    HOLIDAY: { marker: 'S', label: 'Public holiday' },
    WORKED: { marker: '', label: null },
    EXPECTED: { marker: '', label: null },
  };

  if (dayClass === 'LEAVE') {
    const leaveTypeId = options.leaveTypeId ?? 'lt-1';

    return {
      dateKey,
      dayOfMonth,
      dayClass,
      marker: options.marker ?? 'C',
      legendKey: `leave:${leaveTypeId}`,
      legendLabel: options.label ?? 'Annual Leave',
      hours: options.hours ?? 0,
      leave: {
        employeeId: EMPLOYEE.id,
        dateKey,
        leaveTypeId,
        marker: options.marker ?? 'C',
        label: options.label ?? 'Annual Leave',
        isHalfDay: false,
      },
    };
  }

  const { marker, label } = fixed[dayClass];

  return {
    dateKey,
    dayOfMonth,
    dayClass,
    marker,
    legendKey: marker === '' ? null : `class:${dayClass}`,
    legendLabel: label,
    hours: options.hours ?? 0,
    leave: null,
  };
}

/** A 30-day September: weekends free, one holiday, two kinds of leave, some work. */
function buildMonth(): ClassifiedMonth {
  const days: ClassifiedDay[] = [];

  for (let dayOfMonth = 1; dayOfMonth <= 30; dayOfMonth += 1) {
    const weekday = new Date(Date.UTC(2026, 8, dayOfMonth)).getUTCDay();

    if (weekday === 0 || weekday === 6) {
      days.push(makeDay(dayOfMonth, 'NON_WORKING'));
      continue;
    }

    if (dayOfMonth === 15) {
      days.push(makeDay(dayOfMonth, 'HOLIDAY'));
      continue;
    }

    if (dayOfMonth === 7) {
      days.push(makeDay(dayOfMonth, 'LEAVE'));
      continue;
    }

    if (dayOfMonth === 8) {
      days.push(
        makeDay(dayOfMonth, 'LEAVE', {
          marker: 'M',
          leaveTypeId: 'lt-2',
          label: 'Medical Leave',
        }),
      );
      continue;
    }

    days.push(makeDay(dayOfMonth, 'WORKED', { hours: 8 }));
  }

  return {
    employee: EMPLOYEE,
    days,
    totalHours: days.reduce((total, day) => total + day.hours, 0),
  };
}

const MONTH = buildMonth();

const STATES = new Map<string, TimesheetStateRow>([
  [
    'e1',
    {
      employeeId: 'e1',
      status: 'APPROVED',
      // 22:30 UTC on the 7th is the 8th in Bucharest (UTC+3 in September).
      updatedAt: new Date('2026-09-07T22:30:00.000Z'),
    } as TimesheetStateRow,
  ],
]);

const numberAt = (model: ReportDataModel, rowKey: string, columnKey: string) =>
  (
    model.rows.find((row) => row.key === rowKey)?.cells[columnKey] as
      ReportNumberCell | undefined
  )?.value;

const textAt = (model: ReportDataModel, rowKey: string, columnKey: string) =>
  (
    model.rows.find((row) => row.key === rowKey)?.cells[columnKey] as
      ReportTextCell | undefined
  )?.text;

describe('report 2 — timesheet status', () => {
  const model = buildTimesheetStatus(PERIOD, GENERATED_AT, [MONTH], STATES);

  /**
   * The invariant that makes the row trustworthy: the day classes are mutually
   * exclusive and total, so the breakdown must account for every day of the
   * month. A breakdown that does not add up is one nobody can act on.
   */
  it('sums the day categories to the length of the month', () => {
    const total =
      (numberAt(model, 'e1', 'leaveDays') ?? 0) +
      (numberAt(model, 'e1', 'holidayDays') ?? 0) +
      (numberAt(model, 'e1', 'freeDays') ?? 0) +
      (numberAt(model, 'e1', 'notEmployedDays') ?? 0) +
      (numberAt(model, 'e1', 'workingDays') ?? 0);

    expect(total).toBe(30);
    expect(numberAt(model, 'e1', 'totalDays')).toBe(30);
  });

  it('counts the holiday once, and not as a working day', () => {
    expect(numberAt(model, 'e1', 'holidayDays')).toBe(1);
  });

  /**
   * The dynamic half of the report. There is no fixed "medical" column: one
   * column appears per leave type that occurs in the period, headed by the
   * marker that type was configured with.
   */
  it('gives each leave type occurring in the period its own column', () => {
    const leaveColumns = model.columns.filter((column) =>
      column.key.startsWith('leave:'),
    );

    expect(leaveColumns.map((column) => column.label)).toEqual(['C', 'M']);
    expect(leaveColumns.map((column) => column.sublabel)).toEqual([
      'Annual Leave',
      'Medical Leave',
    ]);
    expect(numberAt(model, 'e1', 'leave:lt-1')).toBe(1);
    expect(numberAt(model, 'e1', 'leave:lt-2')).toBe(1);
    expect(numberAt(model, 'e1', 'leaveDays')).toBe(2);
  });

  it('adds no column for a leave type that did not occur', () => {
    const withoutMedical = buildTimesheetStatus(
      PERIOD,
      GENERATED_AT,
      [
        {
          ...MONTH,
          days: MONTH.days.filter((day) => day.dayOfMonth !== 8),
        },
      ],
      STATES,
    );

    expect(
      withoutMedical.columns.some((column) => column.key === 'leave:lt-2'),
    ).toBe(false);
  });

  /**
   * `updatedAt` is an instant, so which calendar day it falls on genuinely
   * depends on the company's zone — the one value in the feature that is
   * zone-sensitive.
   */
  it('renders the last-modified instant in the company timezone', () => {
    // 22:30 UTC on the 7th is the 8th in Bucharest, and the document is
    // Romanian — so it reads `08.09.2026`, not `2026-09-08` and not the 7th.
    expect(textAt(model, 'e1', 'lastModified')).toBe('08.09.2026');
  });

  /**
   * The two halves of the same rule, pinned together: the zone decides *which*
   * day, and the locale decides how it is *written*. Getting either wrong
   * produces a plausible-looking date that is simply not the one the reader's
   * clock and calendar would give.
   */
  it('would report the previous day under a zone behind Greenwich', () => {
    const newYork = buildTimesheetStatus(
      { ...PERIOD, timezone: 'America/New_York' },
      GENERATED_AT,
      [MONTH],
      STATES,
    );

    expect(textAt(newYork, 'e1', 'lastModified')).toBe('07.09.2026');
  });

  it('reports an employee with no timesheet rather than dropping them', () => {
    const missing = buildTimesheetStatus(
      PERIOD,
      GENERATED_AT,
      [MONTH],
      new Map(),
    );

    expect(missing.rows).toHaveLength(1);
    expect(textAt(missing, 'e1', 'status')).toBe('Fără timesheet');
    expect(textAt(missing, 'e1', 'lastModified')).toBeNull();
  });

  it('maps the stored status onto the label the report prints', () => {
    expect(textAt(model, 'e1', 'status')).toBe('Aprobat');
  });

  it('reads every timesheet state, not only approved ones', () => {
    expect(model.sourceNote).toContain('every state');
  });
});

describe('report 3 — attendance sheet', () => {
  const model = buildAttendanceSheet(PERIOD, GENERATED_AT, [MONTH], {
    workStartTime: '09:00',
    workEndTime: '18:00',
  });

  it('has one column per day of the month, plus name and total', () => {
    expect(model.columns).toHaveLength(32);
  });

  it('stamps a worked day with the configured window and the real hours', () => {
    const cell = model.rows[0].cells['2026-09-01'] as ReportNumberCell;

    expect(cell.value).toBe(8);
    expect(cell.text).toBe('09:00-18:00\n8h');
  });

  it('marks a holiday rather than showing hours', () => {
    expect(model.rows[0].cells['2026-09-15']).toMatchObject({
      kind: 'marker',
      marker: 'S',
      text: 'S',
    });
  });

  it('totals the approved hours per employee', () => {
    expect(numberAt(model, 'e1', 'total')).toBe(MONTH.totalHours);
  });

  /** Built from the days that occur, so a leave type added later needs no code. */
  it('builds the legend only from the markers actually used', () => {
    expect(model.legend.map((item) => item.marker).sort()).toEqual([
      'C',
      'L',
      'M',
      'S',
    ]);
  });

  it('counts approved timesheets only', () => {
    expect(model.sourceNote).toContain('APPROVED');
  });
});

describe('report 4 — leave calendar', () => {
  const model = buildLeaveCalendar(PERIOD, GENERATED_AT, [MONTH]);

  it('marks leave days and leaves ordinary working days blank', () => {
    expect(model.rows[0].cells['2026-09-07']).toMatchObject({
      kind: 'marker',
      marker: 'C',
    });
    expect(model.rows[0].cells['2026-09-01']).toMatchObject({
      kind: 'text',
      text: null,
    });
  });

  it('totals absences per employee and per day', () => {
    expect(numberAt(model, 'e1', 'total')).toBe(2);
    expect(numberAt(model, 'total', '2026-09-07')).toBe(1);
    expect(numberAt(model, 'total', '2026-09-01')).toBe(0);
  });

  /** It answers "who is away", which is settled without any timesheet. */
  it('does not depend on a timesheet existing', () => {
    expect(model.sourceNote).toContain('does not depend on any timesheet');
  });
});
