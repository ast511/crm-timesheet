import { ArgumentMetadata, ValidationPipe } from '@nestjs/common';

import {
  PUBLIC_HOLIDAY_MAX_MONTH,
  PUBLIC_HOLIDAY_MAX_YEAR,
  PUBLIC_HOLIDAY_MIN_MONTH,
  PUBLIC_HOLIDAY_MIN_YEAR,
} from '../public-holiday.constants';
import { MonthParamsDto } from './month-params.dto';
import { YearParamsDto } from './year-params.dto';

/**
 * The two path-parameter DTOs, run through a `ValidationPipe` configured
 * exactly like the global one — so what is asserted is what the controller
 * receives, coercion included.
 *
 * The reason they are DTOs rather than `ParseIntPipe` is the range: an
 * out-of-range year or a thirteenth month has to be a `400` naming the
 * parameter, not a calendar that quietly comes back empty or rolls into the
 * next year.
 */
describe('calendar path parameters', () => {
  const pipe = new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true,
  });

  const validate = <T>(
    metatype: ArgumentMetadata['metatype'],
    params: Record<string, string>,
  ): Promise<T> =>
    pipe.transform(params, { type: 'param', metatype }) as Promise<T>;

  describe('YearParamsDto', () => {
    const validateYear = (params: Record<string, string>) =>
      validate<YearParamsDto>(YearParamsDto, params);

    it('coerces the path segment into a number', async () => {
      const params = await validateYear({ year: '2027' });

      expect(params.year).toBe(2027);
    });

    it.each([PUBLIC_HOLIDAY_MIN_YEAR, PUBLIC_HOLIDAY_MAX_YEAR])(
      'accepts the boundary year %s',
      async (year) => {
        const params = await validateYear({ year: String(year) });

        expect(params.year).toBe(year);
      },
    );

    it.each([
      ['a year below the minimum', String(PUBLIC_HOLIDAY_MIN_YEAR - 1)],
      ['a year above the maximum', String(PUBLIC_HOLIDAY_MAX_YEAR + 1)],
      ['a year that is not a number', 'next'],
      ['a fractional year', '2027.5'],
      ['an empty segment', ''],
    ])('rejects %s', async (_case, year) => {
      await expect(validateYear({ year })).rejects.toThrow();
    });
  });

  describe('MonthParamsDto', () => {
    const validateMonth = (params: Record<string, string>) =>
      validate<MonthParamsDto>(MonthParamsDto, params);

    it('coerces both segments', async () => {
      const params = await validateMonth({ year: '2027', month: '5' });

      expect(params.year).toBe(2027);
      expect(params.month).toBe(5);
    });

    it.each([PUBLIC_HOLIDAY_MIN_MONTH, PUBLIC_HOLIDAY_MAX_MONTH])(
      'accepts the boundary month %s',
      async (month) => {
        const params = await validateMonth({
          year: '2027',
          month: String(month),
        });

        expect(params.month).toBe(month);
      },
    );

    /** It extends the year DTO, so the year's bounds are stated in one place. */
    it('inherits the year rules rather than restating them', async () => {
      await expect(
        validateMonth({
          year: String(PUBLIC_HOLIDAY_MAX_YEAR + 1),
          month: '5',
        }),
      ).rejects.toThrow();
    });

    it.each([
      ['a zero month', '0'],
      ['a thirteenth month', '13'],
      ['a negative month', '-1'],
      ['a month name', 'May'],
      ['a fractional month', '5.5'],
    ])('rejects %s', async (_case, month) => {
      await expect(validateMonth({ year: '2027', month })).rejects.toThrow();
    });
  });
});
