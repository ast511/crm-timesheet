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
