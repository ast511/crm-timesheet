import { BadRequestException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';

import {
  LeaveHalfDayPortion,
  TimesheetEntryType,
  Weekday,
} from '../../generated/prisma/enums';
import { EmployeeService } from '../employees/employee.service';
import { LeaveRequestsService } from '../leave-requests/leave-requests.service';
import { ProjectService } from '../projects/project.service';
import { PublicHolidayService } from '../public-holidays/public-holiday.service';
import { WorkScheduleEntity } from '../work-schedule/entities/work-schedule.entity';
import { WorkScheduleService } from '../work-schedule/work-schedule.service';
import { EntryInput, TimesheetFillService } from './timesheet-fill.service';

/**
 * The fill-in rule engine, exercised without a database, a transition or a
 * notification.
 *
 * **This is the reason the engine is a separate service.** Every rule below is a
 * statement about a calendar and a set of hours, and testing it through the
 * lifecycle would mean opening a timesheet, saving entries and submitting it to
 * find out whether a Tuesday is loggable. Here each rule is one arrangement of
 * four mocked sources and one assertion.
 *
 * **Nothing in this file hard-codes a working week.** The schedule is a fixture
 * that tests override — a Monday-to-Friday company, a Monday-to-Sunday one, a
 * seven-hour day, a week that begins on Sunday — because that is exactly the
 * variation the engine exists to respect.
 */

/** September 2026: the 1st is a Tuesday, so the month starts mid-week. */
const MONTH = 9;
const YEAR = 2026;

/** A day inside the month, safely past any employment boundary a test sets. */
const NOW = new Date('2026-09-30T12:00:00.000Z');

const WEEKDAYS: Weekday[] = [
  Weekday.MONDAY,
  Weekday.TUESDAY,
  Weekday.WEDNESDAY,
  Weekday.THURSDAY,
  Weekday.FRIDAY,
];

/**
 * A Monday-to-Friday company on an eight-hour day, whose week begins on Monday.
 *
 * Every number here is *configuration*, and the tests that matter most are the
 * ones that change it.
 */
const SCHEDULE: WorkScheduleEntity = {
  workingDays: WEEKDAYS,
  weekStartsOn: Weekday.MONDAY,
  workStartTime: '09:00',
  workEndTime: '18:00',
  minHoursPerEntry: 0.5,
  maxHoursPerEntry: 8,
  maxHoursPerDay: 8,
  standardHoursPerDay: 8,
  standardHoursPerWeek: 40,
  lunchBreakHours: 1,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

/** Employed throughout the month and still here. */
const EMPLOYMENT = {
  hireDate: new Date('2020-01-13T00:00:00.000Z'),
  terminationDate: null,
};

const work = (
  date: string,
  hours: number,
  projectId = 'prj-1',
): EntryInput => ({
  date: `${date}T00:00:00.000Z`,
  type: TimesheetEntryType.WORK,
  hours,
  projectId,
});

/** The field messages inside an exception thrown with an array payload. */
const messagesFrom = async (call: Promise<unknown>): Promise<string[]> => {
  try {
    await call;
  } catch (error) {
    const response = (error as BadRequestException).getResponse();
    const { message } = response as { message: string | string[] };

    return Array.isArray(message) ? message : [message];
  }

  throw new Error('Expected the call to reject, but it resolved');
};

describe('TimesheetFillService', () => {
  let service: TimesheetFillService;
  let workSchedule: { find: jest.Mock };
  let publicHolidays: { findYear: jest.Mock };
  let leaveRequests: { findApprovedInSpan: jest.Mock };
  let employees: { findEmploymentWindow: jest.Mock };
  let projects: { findExistingIds: jest.Mock };

  const planMonth = () => service.planMonth('emp-1', MONTH, YEAR, NOW);

  beforeEach(async () => {
    workSchedule = { find: jest.fn().mockResolvedValue(SCHEDULE) };
    publicHolidays = { findYear: jest.fn().mockResolvedValue([]) };
    leaveRequests = { findApprovedInSpan: jest.fn().mockResolvedValue([]) };
    employees = {
      findEmploymentWindow: jest.fn().mockResolvedValue(EMPLOYMENT),
    };
    projects = {
      findExistingIds: jest
        .fn()
        .mockImplementation((ids: string[]) => Promise.resolve(ids)),
    };

    const moduleRef: TestingModule = await Test.createTestingModule({
      providers: [
        TimesheetFillService,
        { provide: WorkScheduleService, useValue: workSchedule },
        { provide: PublicHolidayService, useValue: publicHolidays },
        { provide: LeaveRequestsService, useValue: leaveRequests },
        { provide: EmployeeService, useValue: employees },
        { provide: ProjectService, useValue: projects },
      ],
    }).compile();

    service = moduleRef.get(TimesheetFillService);
  });

  describe('planMonth', () => {
    it('covers every calendar day of the month, and no more', async () => {
      const plan = await planMonth();

      // September has 30 days; October's 1st must not appear.
      expect(plan.days.size).toBe(30);
      expect(plan.days.has('2026-09-01')).toBe(true);
      expect(plan.days.has('2026-09-30')).toBe(true);
      expect(plan.days.has('2026-10-01')).toBe(false);
    });

    it('asks the leave module only about the month being filled', async () => {
      await planMonth();

      expect(leaveRequests.findApprovedInSpan).toHaveBeenCalledWith('emp-1', {
        startDate: new Date('2026-09-01T00:00:00.000Z'),
        endDate: new Date('2026-09-30T00:00:00.000Z'),
      });
    });
  });

  describe('which days may be logged', () => {
    it('refuses a day the configured schedule does not work', async () => {
      const plan = await planMonth();

      // 5 September 2026 is a Saturday, and this company does not work Saturdays.
      const problems = await messagesFrom(
        service.assertEntriesAreValid([work('2026-09-05', 4)], plan),
      );

      expect(problems).toEqual([
        expect.stringContaining('2026-09-05') as string,
      ]);
      expect(problems[0]).toContain('not a working day');
    });

    /**
     * The rule the whole module is built on: "not loggable" means "not in
     * `workingDays`", never "Saturday or Sunday". A company that works all seven
     * days configures that, and the engine has to agree with it.
     */
    it('allows a weekend day when the company works weekends', async () => {
      workSchedule.find.mockResolvedValue({
        ...SCHEDULE,
        workingDays: [...WEEKDAYS, Weekday.SATURDAY, Weekday.SUNDAY],
      });

      const plan = await planMonth();

      await expect(
        service.assertEntriesAreValid([work('2026-09-05', 4)], plan),
      ).resolves.toHaveLength(1);
    });

    it('refuses a day before the employee was hired', async () => {
      employees.findEmploymentWindow.mockResolvedValue({
        hireDate: new Date('2026-09-14T00:00:00.000Z'),
        terminationDate: null,
      });

      const plan = await planMonth();
      const problems = await messagesFrom(
        // 11 September is a Friday, but they had not joined yet.
        service.assertEntriesAreValid([work('2026-09-11', 8)], plan),
      );

      expect(problems[0]).toContain('outside this employee');
    });

    it('refuses a day after the employee left, and allows the days before it', async () => {
      employees.findEmploymentWindow.mockResolvedValue({
        hireDate: new Date('2020-01-13T00:00:00.000Z'),
        terminationDate: new Date('2026-09-11T00:00:00.000Z'),
      });

      const plan = await planMonth();

      // Their last day is fillable...
      await expect(
        service.assertEntriesAreValid([work('2026-09-11', 8)], plan),
      ).resolves.toHaveLength(1);

      // ...and the following Monday is not.
      const problems = await messagesFrom(
        service.assertEntriesAreValid([work('2026-09-14', 8)], plan),
      );

      expect(problems[0]).toContain('outside this employee');
    });

    it('refuses a date outside the month the timesheet is for', async () => {
      const plan = await planMonth();
      const problems = await messagesFrom(
        service.assertEntriesAreValid([work('2026-10-01', 8)], plan),
      );

      expect(problems[0]).toContain('is not in September 2026');
    });
  });

  describe('the daily ceiling', () => {
    it('sums several entries on one day against the configured maximum', async () => {
      const plan = await planMonth();
      const problems = await messagesFrom(
        service.assertEntriesAreValid(
          [work('2026-09-01', 5, 'prj-1'), work('2026-09-01', 4, 'prj-2')],
          plan,
        ),
      );

      expect(problems[0]).toContain('9 hours exceeds the configured maximum');
    });

    it('accepts several entries that together meet the ceiling exactly', async () => {
      const plan = await planMonth();

      await expect(
        service.assertEntriesAreValid(
          [work('2026-09-01', 3, 'prj-1'), work('2026-09-01', 5, 'prj-2')],
          plan,
        ),
      ).resolves.toHaveLength(2);
    });

    // Under the norm is a short day, not an error. Refusing it would make a draft
    // impossible to build up over a week.
    it('accepts a day under the standard hours', async () => {
      const plan = await planMonth();

      await expect(
        service.assertEntriesAreValid([work('2026-09-01', 6)], plan),
      ).resolves.toHaveLength(1);
    });

    it('takes the ceiling from configuration rather than a constant', async () => {
      workSchedule.find.mockResolvedValue({
        ...SCHEDULE,
        maxHoursPerDay: 6,
        maxHoursPerEntry: 6,
        standardHoursPerDay: 6,
      });

      const plan = await planMonth();
      // Two entries, each inside the per-entry bound, so it is the *day* that is
      // over rather than the line — which is the rule under test.
      const problems = await messagesFrom(
        service.assertEntriesAreValid(
          [work('2026-09-01', 4, 'prj-1'), work('2026-09-01', 2.5, 'prj-2')],
          plan,
        ),
      );

      expect(problems[0]).toContain('maximum of 6 hours per day');
    });
  });

  describe('the weekly ceiling', () => {
    it('refuses a week over the configured maximum', async () => {
      const plan = await planMonth();

      // Mon 7 – Fri 11 September, nine hours a day would be 45 in one week —
      // except the daily ceiling catches nine first, so use five eight-hour days
      // plus a sixth day the company works.
      workSchedule.find.mockResolvedValue({
        ...SCHEDULE,
        workingDays: [...WEEKDAYS, Weekday.SATURDAY],
      });

      const widerPlan = await planMonth();
      const problems = await messagesFrom(
        service.assertEntriesAreValid(
          [
            work('2026-09-07', 8),
            work('2026-09-08', 8),
            work('2026-09-09', 8),
            work('2026-09-10', 8),
            work('2026-09-11', 8),
            work('2026-09-12', 8),
          ],
          widerPlan,
        ),
      );

      expect(problems[0]).toContain('48 hours exceeds the configured maximum');
      expect(problems[0]).toContain('40 hours per week');
      expect(plan.schedule.standardHoursPerWeek).toBe(40);
    });

    /**
     * The straddling-week rule. 1 September 2026 is a Tuesday, so the week
     * beginning Monday 31 August has only four days inside this month. Those four
     * days at eight hours are 32 — under the ceiling — and must be accepted even
     * though the same week's Monday, in August, might carry another eight.
     */
    it('counts only the part of a straddling week that falls in this month', async () => {
      const plan = await planMonth();

      await expect(
        service.assertEntriesAreValid(
          [
            work('2026-09-01', 8),
            work('2026-09-02', 8),
            work('2026-09-03', 8),
            work('2026-09-04', 8),
          ],
          plan,
        ),
      ).resolves.toHaveLength(4);
    });

    /**
     * The reason `weekStartsOn` is configuration. With a Sunday-first week, the
     * six days from Sunday 6 to Friday 11 September are **one** week and must be
     * caught; grouped Monday-first they would fall into two buckets of 8 and 40
     * and slip past a ceiling that should have bound.
     */
    it('groups the week by the configured first day, not by Monday', async () => {
      workSchedule.find.mockResolvedValue({
        ...SCHEDULE,
        workingDays: [...WEEKDAYS, Weekday.SUNDAY],
        weekStartsOn: Weekday.SUNDAY,
      });

      const plan = await planMonth();
      const problems = await messagesFrom(
        service.assertEntriesAreValid(
          [
            work('2026-09-06', 8),
            work('2026-09-07', 8),
            work('2026-09-08', 8),
            work('2026-09-09', 8),
            work('2026-09-10', 8),
            work('2026-09-11', 8),
          ],
          plan,
        ),
      );

      expect(problems[0]).toContain('The week beginning 2026-09-06');
      expect(problems[0]).toContain('48 hours');
    });
  });

  describe('leave and holidays', () => {
    const annualLeave = (
      startDate: string,
      endDate: string,
      isHalfDay = false,
    ) => ({
      id: 'lvr-1',
      startDate: new Date(`${startDate}T00:00:00.000Z`),
      endDate: new Date(`${endDate}T00:00:00.000Z`),
      isHalfDay,
      halfDayPortion: isHalfDay ? LeaveHalfDayPortion.FIRST_HALF : null,
      leaveTypeLabel: 'Annual Leave',
    });

    it('pre-populates an approved leave day at the configured full-day hours', async () => {
      leaveRequests.findApprovedInSpan.mockResolvedValue([
        annualLeave('2026-09-07', '2026-09-08'),
      ]);

      const prepopulated = service.prepopulate(await planMonth());

      expect(prepopulated).toEqual([
        expect.objectContaining({
          type: TimesheetEntryType.LEAVE,
          hours: 8,
          leaveRequestId: 'lvr-1',
        }) as unknown,
        expect.objectContaining({
          type: TimesheetEntryType.LEAVE,
          hours: 8,
        }) as unknown,
      ]);
    });

    it('takes the leave hours from the schedule rather than a constant', async () => {
      workSchedule.find.mockResolvedValue({
        ...SCHEDULE,
        standardHoursPerDay: 7,
      });
      leaveRequests.findApprovedInSpan.mockResolvedValue([
        annualLeave('2026-09-07', '2026-09-07'),
      ]);

      const [entry] = service.prepopulate(await planMonth());

      expect(entry.hours).toBe(7);
    });

    it('books half the configured hours for a half-day absence', async () => {
      leaveRequests.findApprovedInSpan.mockResolvedValue([
        annualLeave('2026-09-07', '2026-09-07', true),
      ]);

      const [entry] = service.prepopulate(await planMonth());

      expect(entry.hours).toBe(4);
      expect(entry.description).toBe('Annual Leave (first half)');
    });

    // Half a day of leave leaves half a day for work, which is the case the
    // orthogonal half-day fields exist for.
    it('leaves the rest of a half-day free to be filled with work', async () => {
      leaveRequests.findApprovedInSpan.mockResolvedValue([
        annualLeave('2026-09-07', '2026-09-07', true),
      ]);

      const plan = await planMonth();
      const entries = await service.assertEntriesAreValid(
        [work('2026-09-07', 4)],
        plan,
      );

      expect(entries).toHaveLength(2);
      expect(entries.map((entry) => entry.hours)).toEqual([4, 4]);
    });

    it('refuses work that would push a half-day past the daily ceiling', async () => {
      leaveRequests.findApprovedInSpan.mockResolvedValue([
        annualLeave('2026-09-07', '2026-09-07', true),
      ]);

      const plan = await planMonth();
      const problems = await messagesFrom(
        service.assertEntriesAreValid([work('2026-09-07', 6)], plan),
      );

      expect(problems[0]).toContain('10 hours exceeds');
      expect(problems[0]).toContain(
        'leave or holiday hours that cannot be removed',
      );
    });

    it('pre-populates a public holiday at the configured hours', async () => {
      publicHolidays.findYear.mockResolvedValue([
        {
          name: 'Company Day',
          startDate: '2026-09-07T00:00:00.000Z',
          endDate: '2026-09-07T00:00:00.000Z',
        },
      ]);

      const prepopulated = service.prepopulate(await planMonth());

      expect(prepopulated).toEqual([
        expect.objectContaining({
          type: TimesheetEntryType.HOLIDAY,
          hours: 8,
          leaveRequestId: null,
          description: 'Company Day',
        }) as unknown,
      ]);
    });

    // Nobody spends leave to be absent from a day the office is shut, and booking
    // both would put sixteen unremovable hours on one day.
    it('records a holiday rather than leave when both fall on one day', async () => {
      publicHolidays.findYear.mockResolvedValue([
        {
          name: 'Company Day',
          startDate: '2026-09-07T00:00:00.000Z',
          endDate: '2026-09-07T00:00:00.000Z',
        },
      ]);
      leaveRequests.findApprovedInSpan.mockResolvedValue([
        annualLeave('2026-09-07', '2026-09-07'),
      ]);

      const prepopulated = service.prepopulate(await planMonth());

      expect(prepopulated).toHaveLength(1);
      expect(prepopulated[0].type).toBe(TimesheetEntryType.HOLIDAY);
    });

    it('puts nothing on a holiday that falls on a non-working day', async () => {
      publicHolidays.findYear.mockResolvedValue([
        {
          // 5 September 2026 is a Saturday.
          name: 'Company Day',
          startDate: '2026-09-05T00:00:00.000Z',
          endDate: '2026-09-05T00:00:00.000Z',
        },
      ]);

      expect(service.prepopulate(await planMonth())).toEqual([]);
    });

    /**
     * The rule a real person meets: they were away, they know they were away, and
     * the leave request is the thing they forgot to file.
     */
    it('blocks leave with no approved request, naming the day and what to do', async () => {
      const plan = await planMonth();
      const problems = await messagesFrom(
        service.assertEntriesAreValid(
          [
            {
              date: '2026-09-07T00:00:00.000Z',
              type: TimesheetEntryType.LEAVE,
              hours: 8,
            },
          ],
          plan,
        ),
      );

      expect(problems[0]).toContain('2026-09-07 cannot be marked as leave');
      expect(problems[0]).toContain('File the leave request first');
    });

    it('refuses a leave line whose hours a client has changed', async () => {
      leaveRequests.findApprovedInSpan.mockResolvedValue([
        annualLeave('2026-09-07', '2026-09-07'),
      ]);

      const plan = await planMonth();
      const problems = await messagesFrom(
        service.assertEntriesAreValid(
          [
            {
              date: '2026-09-07T00:00:00.000Z',
              type: TimesheetEntryType.LEAVE,
              hours: 2,
            },
          ],
          plan,
        ),
      );

      expect(problems[0]).toContain(
        'set from the work schedule and cannot be changed',
      );
    });

    it('refuses a holiday a client invented', async () => {
      const plan = await planMonth();
      const problems = await messagesFrom(
        service.assertEntriesAreValid(
          [
            {
              date: '2026-09-07T00:00:00.000Z',
              type: TimesheetEntryType.HOLIDAY,
              hours: 8,
            },
          ],
          plan,
        ),
      );

      expect(problems[0]).toContain('is not a public holiday');
    });

    // A client that strips the locked rows before saving still gets a correct
    // month: the engine writes them regardless.
    it('writes the forced lines even when the body omitted them', async () => {
      leaveRequests.findApprovedInSpan.mockResolvedValue([
        annualLeave('2026-09-07', '2026-09-07'),
      ]);

      const plan = await planMonth();
      const entries = await service.assertEntriesAreValid([], plan);

      expect(entries).toHaveLength(1);
      expect(entries[0].type).toBe(TimesheetEntryType.LEAVE);
    });
  });

  describe('work entries', () => {
    it('requires a project', async () => {
      const plan = await planMonth();
      const problems = await messagesFrom(
        service.assertEntriesAreValid(
          [
            {
              date: '2026-09-01T00:00:00.000Z',
              type: TimesheetEntryType.WORK,
              hours: 8,
            },
          ],
          plan,
        ),
      );

      expect(problems[0]).toContain('projectId is required');
    });

    it('rejects a project that does not exist, in one query for the month', async () => {
      projects.findExistingIds.mockResolvedValue([]);

      const plan = await planMonth();
      const problems = await messagesFrom(
        service.assertEntriesAreValid(
          [work('2026-09-01', 4), work('2026-09-02', 4)],
          plan,
        ),
      );

      expect(problems).toEqual(['Project prj-1 does not exist']);
      expect(projects.findExistingIds).toHaveBeenCalledWith(['prj-1']);
    });

    it('applies the configured per-entry bounds', async () => {
      workSchedule.find.mockResolvedValue({
        ...SCHEDULE,
        minHoursPerEntry: 1,
        maxHoursPerEntry: 4,
      });

      const plan = await planMonth();

      expect(
        await messagesFrom(
          service.assertEntriesAreValid([work('2026-09-01', 0.5)], plan),
        ),
      ).toEqual([expect.stringContaining('between 1 and 4 hours') as string]);

      expect(
        await messagesFrom(
          service.assertEntriesAreValid([work('2026-09-01', 5)], plan),
        ),
      ).toEqual([expect.stringContaining('between 1 and 4 hours') as string]);
    });

    // A month is filled on one screen; one error at a time would be thirty round
    // trips.
    it('reports every offending day at once', async () => {
      const plan = await planMonth();
      const problems = await messagesFrom(
        service.assertEntriesAreValid(
          [work('2026-09-05', 4), work('2026-10-01', 4)],
          plan,
        ),
      );

      expect(problems).toHaveLength(2);
    });
  });

  describe('buildScheduleSnapshot', () => {
    it('freezes the configuration and the forced days the month was judged by', async () => {
      publicHolidays.findYear.mockResolvedValue([
        {
          name: 'Company Day',
          startDate: '2026-09-07T00:00:00.000Z',
          endDate: '2026-09-07T00:00:00.000Z',
        },
      ]);

      const snapshot = service.buildScheduleSnapshot(await planMonth());

      expect(snapshot).toMatchObject({
        capturedFor: { month: MONTH, year: YEAR },
        workingDays: WEEKDAYS,
        weekStartsOn: Weekday.MONDAY,
        standardHoursPerDay: 8,
        standardHoursPerWeek: 40,
        maxHoursPerDay: 8,
        forcedDays: [
          {
            date: '2026-09-07',
            type: TimesheetEntryType.HOLIDAY,
            hours: 8,
            description: 'Company Day',
          },
        ],
      });
    });
  });
});
