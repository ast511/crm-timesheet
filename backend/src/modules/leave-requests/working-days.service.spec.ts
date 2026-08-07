import { NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';

import { Weekday } from '../../generated/prisma/enums';
import { PublicHolidayService } from '../public-holidays/public-holiday.service';
import { WorkScheduleService } from '../work-schedule/work-schedule.service';
import { WorkingDaysService, yearsSpannedBy } from './working-days.service';

/** The ordinary Monday-to-Friday week most of these cases assume. */
const MONDAY_TO_FRIDAY = [
  Weekday.MONDAY,
  Weekday.TUESDAY,
  Weekday.WEDNESDAY,
  Weekday.THURSDAY,
  Weekday.FRIDAY,
];

/** A public holiday occurrence, in the shape `findYear` returns. */
const holiday = (startDate: string, endDate: string = startDate) => ({
  id: `hol-${startDate}`,
  name: 'Test holiday',
  description: null,
  type: 'FIXED' as const,
  isNational: true,
  startDate: `${startDate}T00:00:00.000Z`,
  endDate: `${endDate}T00:00:00.000Z`,
});

const utc = (date: string): Date => new Date(`${date}T00:00:00.000Z`);

describe('WorkingDaysService', () => {
  let service: WorkingDaysService;
  let workSchedule: { findWorkingDays: jest.Mock };
  let publicHolidays: { findYear: jest.Mock };

  beforeEach(async () => {
    workSchedule = {
      findWorkingDays: jest.fn().mockResolvedValue(MONDAY_TO_FRIDAY),
    };
    publicHolidays = { findYear: jest.fn().mockResolvedValue([]) };

    const moduleRef: TestingModule = await Test.createTestingModule({
      providers: [
        WorkingDaysService,
        { provide: WorkScheduleService, useValue: workSchedule },
        { provide: PublicHolidayService, useValue: publicHolidays },
      ],
    }).compile();

    service = moduleRef.get(WorkingDaysService);
  });

  describe('the span itself', () => {
    it('counts both ends, so a one-day request is one day', async () => {
      const calculator = await service.createCalculator([2026]);

      // 2026-09-07 is a Monday.
      expect(
        calculator.countBetween(utc('2026-09-07'), utc('2026-09-07')),
      ).toBe(1);
    });

    it('counts a Monday-to-Friday week as five days', async () => {
      const calculator = await service.createCalculator([2026]);

      expect(
        calculator.countBetween(utc('2026-09-07'), utc('2026-09-11')),
      ).toBe(5);
    });

    it('excludes the weekend inside a two-week span', async () => {
      const calculator = await service.createCalculator([2026]);

      expect(
        calculator.countBetween(utc('2026-09-07'), utc('2026-09-18')),
      ).toBe(10);
    });

    it('returns zero for a span that is nothing but a weekend', async () => {
      const calculator = await service.createCalculator([2026]);

      // Saturday to Sunday.
      expect(
        calculator.countBetween(utc('2026-09-12'), utc('2026-09-13')),
      ).toBe(0);
    });
  });

  describe('the work schedule', () => {
    it('counts a Saturday when the company works Saturdays', async () => {
      workSchedule.findWorkingDays.mockResolvedValue([
        ...MONDAY_TO_FRIDAY,
        Weekday.SATURDAY,
      ]);

      const calculator = await service.createCalculator([2026]);

      expect(
        calculator.countBetween(utc('2026-09-12'), utc('2026-09-12')),
      ).toBe(1);
    });

    it('does not count a Friday when the company does not work Fridays', async () => {
      workSchedule.findWorkingDays.mockResolvedValue([
        Weekday.MONDAY,
        Weekday.TUESDAY,
        Weekday.WEDNESDAY,
        Weekday.THURSDAY,
      ]);

      const calculator = await service.createCalculator([2026]);

      expect(
        calculator.countBetween(utc('2026-09-07'), utc('2026-09-11')),
      ).toBe(4);
    });

    it('reports the schedule missing rather than guessing a week', async () => {
      workSchedule.findWorkingDays.mockRejectedValue(
        new NotFoundException('not configured'),
      );

      await expect(service.createCalculator([2026])).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });

  describe('public holidays', () => {
    it('drops a holiday falling on a working day', async () => {
      // 2026-09-09 is the Wednesday of that week.
      publicHolidays.findYear.mockResolvedValue([holiday('2026-09-09')]);

      const calculator = await service.createCalculator([2026]);

      expect(
        calculator.countBetween(utc('2026-09-07'), utc('2026-09-11')),
      ).toBe(4);
    });

    it('drops every day of a multi-day holiday', async () => {
      publicHolidays.findYear.mockResolvedValue([
        holiday('2026-09-08', '2026-09-10'),
      ]);

      const calculator = await service.createCalculator([2026]);

      expect(
        calculator.countBetween(utc('2026-09-07'), utc('2026-09-11')),
      ).toBe(2);
    });

    it('does not double-subtract a holiday that falls on a weekend', async () => {
      publicHolidays.findYear.mockResolvedValue([holiday('2026-09-12')]);

      const calculator = await service.createCalculator([2026]);

      expect(
        calculator.countBetween(utc('2026-09-07'), utc('2026-09-18')),
      ).toBe(10);
    });
  });

  describe('loading the calendar', () => {
    it('reads each requested year once, however many spans are counted', async () => {
      const calculator = await service.createCalculator([2026, 2027]);

      calculator.countBetween(utc('2026-09-07'), utc('2026-09-11'));
      calculator.countBetween(utc('2027-09-06'), utc('2027-09-10'));

      expect(publicHolidays.findYear).toHaveBeenCalledTimes(2);
      expect(workSchedule.findWorkingDays).toHaveBeenCalledTimes(1);
    });

    it('applies the holidays of whichever year the day belongs to', async () => {
      publicHolidays.findYear.mockImplementation((year: number) =>
        Promise.resolve(
          year === 2027 ? [holiday('2027-01-01')] : [holiday('2026-12-31')],
        ),
      );

      const calculator = await service.createCalculator([2026, 2027]);

      // Thursday 31 December 2026 to Friday 1 January 2027: two working days,
      // both of them holidays.
      expect(
        calculator.countBetween(utc('2026-12-31'), utc('2027-01-01')),
      ).toBe(0);
    });
  });

  describe('isWorkingDay', () => {
    it('answers for a single date without a span', async () => {
      publicHolidays.findYear.mockResolvedValue([holiday('2026-09-09')]);

      const calculator = await service.createCalculator([2026]);

      expect(calculator.isWorkingDay(utc('2026-09-07'))).toBe(true);
      expect(calculator.isWorkingDay(utc('2026-09-09'))).toBe(false);
      expect(calculator.isWorkingDay(utc('2026-09-12'))).toBe(false);
    });
  });

  /**
   * The day boundary, which is what the company timezone is *about* — and the
   * reason this service is not one of its readers.
   *
   * Everything counted here is a **calendar date**, not an instant: a client
   * posts `2026-09-07`, the column stores that day's UTC midnight, and the date
   * is an anchor naming a square on a calendar rather than a moment somebody was
   * at their desk. A date-only anchor has no time of day to be in a zone, so
   * there is no boundary for a zone to move — and re-reading it in one would
   * *create* the drift instead of correcting it, by turning midnight into the
   * previous evening for every zone west of Greenwich.
   *
   * What the boundary must never do is follow the **server's** zone, and these
   * two cases are what pin that. Both dates are read while the process is running
   * in `America/New_York`, four hours behind: a local reading of Monday's anchor
   * gives the Sunday before it, which would refuse a perfectly ordinary working
   * day, and a local reading of Sunday's gives the Saturday, which would let a
   * weekend through. Neither happens, because the classification is anchored to
   * the stored calendar date and the same deployment answers the same way
   * wherever it runs.
   *
   * `WorkSchedule.timezone` is therefore read by the features that group
   * *instants* into days — Timesheet and Reporting — and deliberately not here.
   */
  describe('the day boundary', () => {
    const ORIGINAL_TZ = process.env.TZ;

    beforeEach(() => {
      process.env.TZ = 'America/New_York';
    });

    afterEach(() => {
      process.env.TZ = ORIGINAL_TZ;
    });

    it('classifies a date by its own calendar day, not the server zone', async () => {
      const calculator = await service.createCalculator([2026]);

      // Monday 7 September 2026. Read locally in New York, its stored anchor is
      // the Sunday evening before — and would be refused as a weekend.
      expect(calculator.isWorkingDay(utc('2026-09-07'))).toBe(true);

      // Sunday 13 September 2026, which locally would read as the Saturday.
      expect(calculator.isWorkingDay(utc('2026-09-13'))).toBe(false);
    });

    it('counts a working week as five days from a server four hours behind', async () => {
      const calculator = await service.createCalculator([2026]);

      expect(
        calculator.countBetween(utc('2026-09-07'), utc('2026-09-11')),
      ).toBe(5);
    });
  });
});

describe('yearsSpannedBy', () => {
  it('returns the single year a span sits inside', () => {
    expect([
      ...yearsSpannedBy([
        { startDate: utc('2026-09-07'), endDate: utc('2026-09-11') },
      ]),
    ]).toEqual([2026]);
  });

  it('returns both years a span crosses, not only the one it starts in', () => {
    expect([
      ...yearsSpannedBy([
        { startDate: utc('2026-12-28'), endDate: utc('2027-01-05') },
      ]),
    ]).toEqual([2026, 2027]);
  });

  it('collapses the years a page of spans shares', () => {
    const years = yearsSpannedBy([
      { startDate: utc('2026-03-02'), endDate: utc('2026-03-06') },
      { startDate: utc('2026-09-07'), endDate: utc('2026-09-11') },
      { startDate: utc('2027-01-04'), endDate: utc('2027-01-08') },
    ]);

    expect([...years].sort()).toEqual([2026, 2027]);
  });

  it('is empty for no spans, so an empty page asks the calendar nothing', () => {
    expect(yearsSpannedBy([]).size).toBe(0);
  });
});
