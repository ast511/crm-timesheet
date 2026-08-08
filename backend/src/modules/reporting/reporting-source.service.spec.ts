import { BadRequestException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';

import { EmployeeService } from '../employees/employee.service';
import { LeaveRequestsService } from '../leave-requests/leave-requests.service';
import { WorkingDaysService } from '../leave-requests/working-days.service';
import { ProjectService } from '../projects/project.service';
import { TimesheetService } from '../timesheet-management/timesheet.service';
import { WorkScheduleService } from '../work-schedule/work-schedule.service';
import { ReportQueryDto } from './dto/report-query.dto';
import { ReportingSourceService } from './reporting-source.service';
import { ClassifiedMonth } from './reporting.types';

/** September 2026: 30 days, the 1st a Tuesday. */
const QUERY = { month: 9, year: 2026 } as ReportQueryDto;

/**
 * `terminationDate` is typed rather than inferred, so a test that sets one is
 * not rejected for widening `null`.
 */
const EMPLOYEE_ROW: {
  id: string;
  employeeCode: string;
  firstName: string;
  lastName: string;
  departmentCode: string;
  departmentName: string;
  positionName: string;
  hireDate: Date;
  terminationDate: Date | null;
} = {
  id: 'e1',
  employeeCode: 'EMP-0001',
  firstName: 'Ion',
  lastName: 'Popescu',
  departmentCode: 'DEV',
  departmentName: 'Development',
  positionName: 'Developer',
  hireDate: new Date('2020-01-01T00:00:00.000Z'),
  terminationDate: null,
};

describe('ReportingSourceService', () => {
  let service: ReportingSourceService;
  let employees: { findForReporting: jest.Mock };
  let projects: { findForReporting: jest.Mock };
  let timesheets: {
    findApprovedProjectHours: jest.Mock;
    findApprovedDailyHours: jest.Mock;
    findStatesForPeriod: jest.Mock;
  };
  let leaveRequests: { findApprovedForEmployeesInSpan: jest.Mock };
  let workingDays: { createCalculator: jest.Mock };
  let workSchedule: { findTimezone: jest.Mock };

  /** A calculator that works Monday–Friday and closes on the given dates. */
  function calculator(closedDates: readonly string[] = []) {
    const closed = new Set(closedDates);

    return {
      isWorkingWeekday: (date: Date) =>
        date.getUTCDay() !== 0 && date.getUTCDay() !== 6,
      isPublicHoliday: (date: Date) =>
        closed.has(date.toISOString().slice(0, 10)),
      isWorkingDay: () => true,
      countBetween: () => 0,
    };
  }

  beforeEach(async () => {
    employees = {
      findForReporting: jest.fn().mockResolvedValue([EMPLOYEE_ROW]),
    };
    projects = { findForReporting: jest.fn().mockResolvedValue([]) };
    timesheets = {
      findApprovedProjectHours: jest.fn().mockResolvedValue([]),
      findApprovedDailyHours: jest.fn().mockResolvedValue([]),
      findStatesForPeriod: jest.fn().mockResolvedValue([]),
    };
    leaveRequests = {
      findApprovedForEmployeesInSpan: jest.fn().mockResolvedValue([]),
    };
    workingDays = {
      createCalculator: jest.fn().mockResolvedValue(calculator()),
    };
    workSchedule = {
      findTimezone: jest.fn().mockResolvedValue('Europe/Bucharest'),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ReportingSourceService,
        { provide: EmployeeService, useValue: employees },
        { provide: ProjectService, useValue: projects },
        { provide: TimesheetService, useValue: timesheets },
        { provide: LeaveRequestsService, useValue: leaveRequests },
        { provide: WorkingDaysService, useValue: workingDays },
        { provide: WorkScheduleService, useValue: workSchedule },
      ],
    }).compile();

    service = module.get(ReportingSourceService);
  });

  describe('resolvePeriod', () => {
    it('reads the timezone from the work schedule rather than assuming one', async () => {
      const period = await service.resolvePeriod(QUERY);

      expect(workSchedule.findTimezone).toHaveBeenCalled();
      expect(period.timezone).toBe('Europe/Bucharest');
    });

    it('labels and keys the period', async () => {
      const period = await service.resolvePeriod(QUERY);

      expect(period.label).toBe('September 2026');
      expect(period.key).toBe('2026-09');
    });

    /** A future month is a legitimate question, answered with an empty report. */
    it('accepts a future period', async () => {
      await expect(
        service.resolvePeriod({ month: 12, year: 2099 } as ReportQueryDto),
      ).resolves.toMatchObject({ label: 'December 2099' });
    });
  });

  describe('resolveEmployees', () => {
    it('refuses a population above the cap, naming it', async () => {
      employees.findForReporting.mockResolvedValue(
        Array.from({ length: 501 }, (_, index) => ({
          ...EMPLOYEE_ROW,
          id: `e${String(index)}`,
        })),
      );

      await expect(service.resolveEmployees(QUERY)).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });

    it('passes the filters through to the employee service', async () => {
      await service.resolveEmployees({
        ...QUERY,
        departmentId: 'dep-1',
        employeeId: 'e1',
      } as ReportQueryDto);

      expect(employees.findForReporting).toHaveBeenCalledWith({
        departmentId: 'dep-1',
        employeeId: 'e1',
      });
    });
  });

  describe('day classification', () => {
    async function classify(options?: {
      closedDates?: readonly string[];
      leave?: readonly unknown[];
      hours?: readonly unknown[];
      employee?: typeof EMPLOYEE_ROW;
    }) {
      workingDays.createCalculator.mockResolvedValue(
        calculator(options?.closedDates ?? []),
      );
      leaveRequests.findApprovedForEmployeesInSpan.mockResolvedValue(
        options?.leave ?? [],
      );
      timesheets.findApprovedDailyHours.mockResolvedValue(options?.hours ?? []);

      if (options?.employee !== undefined) {
        employees.findForReporting.mockResolvedValue([options.employee]);
      }

      const population = await service.resolveEmployees(QUERY);
      const { months } = await service.resolveDays(QUERY, population, {
        includeHours: true,
      });

      return months[0];
    }

    const day = (month: ClassifiedMonth, dateKey: string) =>
      month.days.find((current) => current.dateKey === dateKey);

    it('covers every day of the month exactly once', async () => {
      const month = await classify();

      expect(month.days).toHaveLength(30);
      expect(new Set(month.days.map((current) => current.dateKey)).size).toBe(
        30,
      );
    });

    /** Saturday the 5th and Sunday the 6th of September 2026. */
    it('classifies a non-working weekday as free', async () => {
      const month = await classify();

      expect(day(month, '2026-09-05')?.dayClass).toBe('NON_WORKING');
      expect(day(month, '2026-09-05')?.marker).toBe('L');
    });

    it('classifies a public holiday, and never as worked', async () => {
      const month = await classify({
        closedDates: ['2026-09-15'],
        hours: [{ employeeId: 'e1', dateKey: '2026-09-15', hours: 8 }],
      });

      const holiday = day(month, '2026-09-15');

      expect(holiday?.dayClass).toBe('HOLIDAY');
      expect(holiday?.marker).toBe('S');
      // The hours are not carried onto a holiday: the day is not worked, whatever
      // a stray entry says.
      expect(holiday?.hours).toBe(0);
    });

    /** A non-working day carries nothing, not even a holiday — Feature 030's rule. */
    it('lets a non-working weekday beat a holiday falling on it', async () => {
      const month = await classify({ closedDates: ['2026-09-06'] });

      expect(day(month, '2026-09-06')?.dayClass).toBe('NON_WORKING');
    });

    it('lets a holiday beat leave on the same day', async () => {
      const month = await classify({
        closedDates: ['2026-09-15'],
        leave: [
          {
            employeeId: 'e1',
            startDate: new Date('2026-09-14T00:00:00.000Z'),
            endDate: new Date('2026-09-16T00:00:00.000Z'),
            leaveTypeId: 'lt-1',
            leaveTypeLabel: 'Annual Leave',
            reportMarker: 'C',
            isHalfDay: false,
            halfDayPortion: null,
            id: 'lvr-1',
          },
        ],
      });

      expect(day(month, '2026-09-15')?.dayClass).toBe('HOLIDAY');
      expect(day(month, '2026-09-14')?.dayClass).toBe('LEAVE');
    });

    /**
     * The marker is whatever the leave type was configured with. Nothing in the
     * reporting module decides that medical leave prints `M`.
     */
    it('takes the marker from the leave type', async () => {
      const month = await classify({
        leave: [
          {
            employeeId: 'e1',
            startDate: new Date('2026-09-08T00:00:00.000Z'),
            endDate: new Date('2026-09-08T00:00:00.000Z'),
            leaveTypeId: 'lt-9',
            leaveTypeLabel: 'Paternity Leave',
            reportMarker: 'PT',
            isHalfDay: false,
            halfDayPortion: null,
            id: 'lvr-2',
          },
        ],
      });

      const leaveDay = day(month, '2026-09-08');

      expect(leaveDay?.marker).toBe('PT');
      expect(leaveDay?.legendLabel).toBe('Paternity Leave');
    });

    it('classifies a working day with approved hours as worked', async () => {
      const month = await classify({
        hours: [{ employeeId: 'e1', dateKey: '2026-09-08', hours: 7.5 }],
      });

      expect(day(month, '2026-09-08')?.dayClass).toBe('WORKED');
      expect(month.totalHours).toBe(7.5);
    });

    it('classifies a working day with nothing recorded as expected', async () => {
      const month = await classify();

      expect(day(month, '2026-09-08')?.dayClass).toBe('EXPECTED');
    });

    /** Half a day of leave leaves the rest free for work, so the cell shows both. */
    it('keeps the hours on a half-day of leave', async () => {
      const month = await classify({
        leave: [
          {
            employeeId: 'e1',
            startDate: new Date('2026-09-08T00:00:00.000Z'),
            endDate: new Date('2026-09-08T00:00:00.000Z'),
            leaveTypeId: 'lt-1',
            leaveTypeLabel: 'Annual Leave',
            reportMarker: 'C',
            isHalfDay: true,
            halfDayPortion: 'FIRST_HALF',
            id: 'lvr-3',
          },
        ],
        hours: [{ employeeId: 'e1', dateKey: '2026-09-08', hours: 4 }],
      });

      const halfDay = day(month, '2026-09-08');

      expect(halfDay?.dayClass).toBe('LEAVE');
      expect(halfDay?.hours).toBe(4);
    });

    it('marks days before the hire date as outside the employment', async () => {
      const month = await classify({
        employee: {
          ...EMPLOYEE_ROW,
          hireDate: new Date('2026-09-14T00:00:00.000Z'),
        },
      });

      expect(day(month, '2026-09-08')?.dayClass).toBe('NOT_EMPLOYED');
      expect(day(month, '2026-09-14')?.dayClass).toBe('EXPECTED');
    });

    it('marks days after the termination date as outside the employment', async () => {
      const month = await classify({
        employee: {
          ...EMPLOYEE_ROW,
          terminationDate: new Date('2026-09-10T00:00:00.000Z'),
        },
      });

      expect(day(month, '2026-09-10')?.dayClass).toBe('EXPECTED');
      expect(day(month, '2026-09-11')?.dayClass).toBe('NOT_EMPLOYED');
    });
  });

  /**
   * The rule the whole feature's correctness rests on.
   *
   * A timesheet entry's date, a leave span and a holiday are **calendar dates**
   * stored at UTC midnight — not instants — so they are read with UTC accessors
   * and never re-interpreted through a zone. Passing `2026-09-07T00:00Z` through
   * a zone behind Greenwich would yield the 6th and move the day one column left
   * in every grid.
   */
  describe('timezone', () => {
    it('keeps a calendar day in its own column whatever the company zone', async () => {
      workSchedule.findTimezone.mockResolvedValue('America/New_York');
      timesheets.findApprovedDailyHours.mockResolvedValue([
        { employeeId: 'e1', dateKey: '2026-09-07', hours: 8 },
      ]);

      const population = await service.resolveEmployees(QUERY);
      const { months } = await service.resolveDays(QUERY, population, {
        includeHours: true,
      });

      const seventh = months[0].days.find(
        (current) => current.dateKey === '2026-09-07',
      );
      const sixth = months[0].days.find(
        (current) => current.dateKey === '2026-09-06',
      );

      expect(seventh?.hours).toBe(8);
      expect(sixth?.hours).toBe(0);
    });

    it('classifies a leave day at a month boundary in the right column', async () => {
      leaveRequests.findApprovedForEmployeesInSpan.mockResolvedValue([
        {
          employeeId: 'e1',
          startDate: new Date('2026-08-28T00:00:00.000Z'),
          endDate: new Date('2026-09-01T00:00:00.000Z'),
          leaveTypeId: 'lt-1',
          leaveTypeLabel: 'Annual Leave',
          reportMarker: 'C',
          isHalfDay: false,
          halfDayPortion: null,
          id: 'lvr-4',
        },
      ]);

      const population = await service.resolveEmployees(QUERY);
      const { months } = await service.resolveDays(QUERY, population, {
        includeHours: false,
      });

      expect(months[0].days[0].dateKey).toBe('2026-09-01');
      expect(months[0].days[0].dayClass).toBe('LEAVE');
    });
  });

  /** The leave calendar is about absence and pays for no timesheet read. */
  it('skips the hours query when the report does not need it', async () => {
    const population = await service.resolveEmployees(QUERY);

    await service.resolveDays(QUERY, population, { includeHours: false });

    expect(timesheets.findApprovedDailyHours).not.toHaveBeenCalled();
  });
});
