import { Type } from 'class-transformer';
import { IsInt, Max, Min } from 'class-validator';

import {
  PUBLIC_HOLIDAY_MAX_MONTH,
  PUBLIC_HOLIDAY_MIN_MONTH,
} from '../public-holiday.constants';
import { YearParamsDto } from './year-params.dto';

/**
 * Path parameters of `GET /api/v1/public-holidays/calendar/:year/:month`.
 *
 * Extends `YearParamsDto` instead of redeclaring `year`, so the year's bounds
 * are stated once and the two endpoints cannot come to disagree about what a
 * valid year is.
 *
 * `month` is one-based, as a person writes a date: `/calendar/2027/5` is May.
 * `13` and `0` are a `400` rather than a request quietly rolling into the next
 * or previous year, which is what a bare `new Date(...)` would have done with
 * them.
 */
export class MonthParamsDto extends YearParamsDto {
  @Type(() => Number)
  @IsInt()
  @Min(PUBLIC_HOLIDAY_MIN_MONTH)
  @Max(PUBLIC_HOLIDAY_MAX_MONTH)
  readonly month!: number;
}
