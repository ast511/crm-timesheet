import {
  ArgumentMetadata,
  BadRequestException,
  ValidationPipe,
} from '@nestjs/common';

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
    await expect(validate(VALID)).resolves.toEqual({
      ...VALID,
      // Supplied by the property initialiser rather than by the body: Feature 030
      // added this column, and a `PUT` written against the previous contract must
      // not start failing because a field nobody knew about is now compulsory.
      weekStartsOn: 'MONDAY',
    });
  });

  // The reason the column exists: the working week does not begin on Monday
  // everywhere this application may be deployed, and the timesheet module's
  // weekly hour ceiling has to know where one week ends and the next begins.
  it('accepts a working week that begins on a Sunday', async () => {
    await expect(
      validate({ ...VALID, weekStartsOn: 'SUNDAY' }),
    ).resolves.toMatchObject({ weekStartsOn: 'SUNDAY' });
  });

  // It is not constrained by `workingDays`: a company working Monday to Friday
  // whose payroll week begins on Sunday is an ordinary arrangement, and a week
  // turning over on a day nobody works is not a contradiction.
  it('does not require the week to begin on a working day', async () => {
    await expect(
      validate({ ...VALID, weekStartsOn: 'SATURDAY' }),
    ).resolves.toMatchObject({ weekStartsOn: 'SATURDAY' });
  });

  it('rejects a week beginning on something that is not a weekday', async () => {
    await expect(
      validate({ ...VALID, weekStartsOn: 'FUNDAY' }),
    ).rejects.toThrow();
  });

  it('rejects a body missing a field, since PUT replaces rather than merges', async () => {
    const { lunchBreakHours: _removed, ...partial } = VALID;

    await expect(validate(partial)).rejects.toThrow();
  });

  // The example used to be `timezone`, which stopped being unknown when the
  // company zone was added to this DTO. Anything genuinely not on the class does
  // the job; `weekendDays` is the near-miss most likely to be sent by mistake,
  // since nothing here has ever had such a field — `workingDays` is the only
  // statement about which days are worked.
  it('rejects an unknown property instead of ignoring it', async () => {
    await expect(validate({ ...VALID, weekendDays: [] })).rejects.toThrow();
  });

  /**
   * The company zone: one value for the whole application, in which every
   * calendar day and day boundary is read. An IANA *name*, never an offset.
   */
  describe('timezone', () => {
    it('is optional, and omitting it sends nothing to be stored', async () => {
      const dto = await validate(VALID);

      // `undefined` rather than a default, which is what makes an omitted zone
      // leave the stored one alone instead of resetting it.
      expect(dto.timezone).toBeUndefined();
    });

    it.each(['UTC', 'America/New_York', 'Asia/Tokyo', 'Europe/Bucharest'])(
      'accepts %p',
      async (timezone) => {
        await expect(validate({ ...VALID, timezone })).resolves.toMatchObject({
          timezone,
        });
      },
    );

    it('trims before checking, so a padded value is still valid', async () => {
      const dto = await validate({ ...VALID, timezone: '  UTC  ' });

      expect(dto.timezone).toBe('UTC');
    });

    // The name matters as much as the rejection: an administrator who typed the
    // zone by hand has to be told which of eleven fields the 400 is about. The
    // pipe carries that in the response payload rather than in `Error.message`,
    // which is the flat "Bad Request Exception".
    it('reports the field by name when the zone is not recognised', async () => {
      const error = await validate({
        ...VALID,
        timezone: 'Europe/Atlantis',
      }).catch((thrown: BadRequestException) => thrown);

      expect(error).toBeInstanceOf(BadRequestException);

      const { message } = (error as BadRequestException).getResponse() as {
        message: string[];
      };

      expect(message.join(' ')).toMatch(/timezone/);
    });

    /**
     * The check is membership of the runtime's tz database rather than a
     * `Region/City` pattern, and this is the case that tells the two apart:
     * `Europe/Atlantis` above is perfectly well shaped and names nothing.
     */
    it.each(['Not/A/Zone', 'GMT+2', '+02:00', '2', ''])(
      'rejects %p',
      async (timezone) => {
        await expect(validate({ ...VALID, timezone })).rejects.toThrow();
      },
    );

    /**
     * An offset is not a zone: `+02:00` is Bucharest's answer for half the year
     * and wrong for the other half, because daylight saving moves it. The name
     * carries the rules for when that happens, which is why the column holds one.
     */
    it('rejects a numeric offset in place of a name', async () => {
      await expect(
        validate({ ...VALID, timezone: 'UTC+02:00' }),
      ).rejects.toThrow();
    });

    /** IANA names have one canonical spelling; a second would mean one zone. */
    it('rejects a lower-case spelling rather than folding it', async () => {
      await expect(
        validate({ ...VALID, timezone: 'europe/bucharest' }),
      ).rejects.toThrow();
    });

    it('rejects a non-string, since a zone is a name', async () => {
      await expect(validate({ ...VALID, timezone: 2 })).rejects.toThrow();
    });
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
