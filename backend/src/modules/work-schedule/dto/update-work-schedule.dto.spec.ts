import { ArgumentMetadata, ValidationPipe } from '@nestjs/common';

import {
  MAX_HOURS_PER_DAY,
  MAX_HOURS_PER_WEEK,
} from '../work-schedule.constants';
import { UpdateWorkScheduleDto } from './update-work-schedule.dto';

/**
 * Run through a `ValidationPipe` configured exactly like the global one, so
 * what is asserted here is the object the controller receives — the weekday
 * sort included, since a canonical order is what lets two configurations
 * holding the same days be equal arrays.
 */
describe('UpdateWorkScheduleDto', () => {
  const pipe = new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true,
  });

  const metadata: ArgumentMetadata = {
    type: 'body',
    metatype: UpdateWorkScheduleDto,
  };

  const validate = (body: unknown): Promise<UpdateWorkScheduleDto> =>
    pipe.transform(body, metadata) as Promise<UpdateWorkScheduleDto>;

  /** The complete configuration; every test starts from these. */
  const VALID = {
    workingDays: ['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY'],
    workStartTime: '09:00',
    workEndTime: '18:00',
    minHoursPerEntry: 0.5,
    maxHoursPerEntry: 8,
    maxHoursPerDay: 8,
    standardHoursPerDay: 8,
    standardHoursPerWeek: 40,
    lunchBreakHours: 1,
  };

  it('accepts the documented configuration unchanged', async () => {
    await expect(validate(VALID)).resolves.toEqual(VALID);
  });

  it('rejects a body missing a field, since PUT replaces rather than merges', async () => {
    const { lunchBreakHours: _removed, ...partial } = VALID;

    await expect(validate(partial)).rejects.toThrow();
  });

  it('rejects an unknown property instead of ignoring it', async () => {
    await expect(validate({ ...VALID, timezone: 'UTC' })).rejects.toThrow();
  });

  describe('workingDays', () => {
    it('sorts into week order however the days arrived', async () => {
      const dto = await validate({
        ...VALID,
        workingDays: ['FRIDAY', 'MONDAY', 'WEDNESDAY'],
      });

      expect(dto.workingDays).toEqual(['MONDAY', 'WEDNESDAY', 'FRIDAY']);
    });

    it('accepts a six-day week', async () => {
      const days = [...VALID.workingDays, 'SATURDAY'];
      const dto = await validate({ ...VALID, workingDays: days });

      expect(dto.workingDays).toEqual(days);
    });

    it('rejects a duplicated day', async () => {
      await expect(
        validate({ ...VALID, workingDays: ['MONDAY', 'MONDAY'] }),
      ).rejects.toThrow();
    });

    it('rejects a value that is not a weekday', async () => {
      await expect(
        validate({ ...VALID, workingDays: ['MONDAY', 'FUNDAY'] }),
      ).rejects.toThrow();
    });

    it('rejects the lower-case spelling the column stores', async () => {
      await expect(
        validate({ ...VALID, workingDays: ['monday'] }),
      ).rejects.toThrow();
    });

    it('rejects an empty week', async () => {
      await expect(validate({ ...VALID, workingDays: [] })).rejects.toThrow();
    });

    it('rejects a bare string in place of the array', async () => {
      await expect(
        validate({ ...VALID, workingDays: 'MONDAY' }),
      ).rejects.toThrow();
    });
  });

  describe('the two times', () => {
    it('trims before checking, so a padded value is still valid', async () => {
      const dto = await validate({ ...VALID, workStartTime: '  09:00  ' });

      expect(dto.workStartTime).toBe('09:00');
    });

    it('accepts both ends of the day, 00:00 and 23:59', async () => {
      const dto = await validate({
        ...VALID,
        workStartTime: '00:00',
        workEndTime: '23:59',
      });

      expect([dto.workStartTime, dto.workEndTime]).toEqual(['00:00', '23:59']);
    });

    it.each(['9:00', '09:00:00', '24:00', '09:60', 'morning', ''])(
      'rejects %p',
      async (value) => {
        await expect(
          validate({ ...VALID, workStartTime: value }),
        ).rejects.toThrow();
      },
    );

    /**
     * A night shift is a real schedule, so this is deliberately *not* an error.
     * The Timesheets module is where a day crossing midnight is interpreted.
     */
    it('accepts an end earlier than the start, which is a night shift', async () => {
      const dto = await validate({
        ...VALID,
        workStartTime: '22:00',
        workEndTime: '06:00',
      });

      expect(dto.workEndTime).toBe('06:00');
    });
  });

  describe('the hour fields', () => {
    const REQUIRED_POSITIVE = [
      'minHoursPerEntry',
      'maxHoursPerEntry',
      'maxHoursPerDay',
      'standardHoursPerDay',
      'standardHoursPerWeek',
    ] as const;

    it.each(REQUIRED_POSITIVE)('rejects %s at zero', async (field) => {
      await expect(validate({ ...VALID, [field]: 0 })).rejects.toThrow();
    });

    it.each(REQUIRED_POSITIVE)('rejects a negative %s', async (field) => {
      await expect(validate({ ...VALID, [field]: -1 })).rejects.toThrow();
    });

    it('accepts a half hour, the granularity people book in', async () => {
      const dto = await validate({ ...VALID, minHoursPerEntry: 0.5 });

      expect(dto.minHoursPerEntry).toBe(0.5);
    });

    it('accepts a quarter hour, which the column can hold exactly', async () => {
      const dto = await validate({ ...VALID, minHoursPerEntry: 0.25 });

      expect(dto.minHoursPerEntry).toBe(0.25);
    });

    /** A third decimal would be rounded by the column rather than stored. */
    it('rejects a third decimal instead of letting PostgreSQL round it', async () => {
      await expect(
        validate({ ...VALID, minHoursPerEntry: 0.125 }),
      ).rejects.toThrow();
    });

    it('rejects a numeric string, since JSON can carry a number', async () => {
      await expect(
        validate({ ...VALID, standardHoursPerDay: '8' }),
      ).rejects.toThrow();
    });

    it('rejects a day longer than there are hours in one', async () => {
      await expect(
        validate({ ...VALID, maxHoursPerDay: MAX_HOURS_PER_DAY + 1 }),
      ).rejects.toThrow();
    });

    it('rejects a week longer than there are hours in one', async () => {
      await expect(
        validate({ ...VALID, standardHoursPerWeek: MAX_HOURS_PER_WEEK + 1 }),
      ).rejects.toThrow();
    });

    it('allows a weekly total above the daily ceiling', async () => {
      const dto = await validate({ ...VALID, standardHoursPerWeek: 40 });

      expect(dto.standardHoursPerWeek).toBe(40);
    });
  });

  describe('lunchBreakHours', () => {
    it('accepts zero — a company may have no lunch break', async () => {
      const dto = await validate({ ...VALID, lunchBreakHours: 0 });

      expect(dto.lunchBreakHours).toBe(0);
    });

    it('rejects a negative break', async () => {
      await expect(
        validate({ ...VALID, lunchBreakHours: -0.5 }),
      ).rejects.toThrow();
    });

    it('is required, like every other field on a PUT', async () => {
      const { lunchBreakHours: _removed, ...partial } = VALID;

      await expect(validate(partial)).rejects.toThrow();
    });
  });

  /**
   * `maxHoursPerEntry > minHoursPerEntry` is a service rule, so a body that
   * contradicts itself passes the pipe untouched and is refused later. Pinned
   * here so the split is deliberate rather than an oversight.
   */
  it('leaves the entry-range rule to the service', async () => {
    const dto = await validate({
      ...VALID,
      minHoursPerEntry: 4,
      maxHoursPerEntry: 2,
    });

    expect(dto.maxHoursPerEntry).toBe(2);
  });
});
