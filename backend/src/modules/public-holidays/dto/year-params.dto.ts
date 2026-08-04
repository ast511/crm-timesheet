import { Type } from 'class-transformer';
import { IsInt, Max, Min } from 'class-validator';

import {
  PUBLIC_HOLIDAY_MAX_YEAR,
  PUBLIC_HOLIDAY_MIN_YEAR,
} from '../public-holiday.constants';

/**
 * Path parameters of `GET /api/v1/public-holidays/calendar/:year`.
 *
 * A DTO rather than `@Param('year', ParseIntPipe)`, because the year needs a
 * *range* and not merely a type: `ParseIntPipe` would accept `/calendar/0` and
 * `/calendar/20227` and hand them to a query that returns an empty calendar,
 * which reads as "no holidays that year" rather than as "that is not a year".
 * Validated by the same global `ValidationPipe` every body and query goes
 * through, so the rejection is the familiar `400` naming the parameter.
 *
 * `@Type(() => Number)` is mandatory, not decoration: a path segment is text,
 * so without it `@IsInt()` would reject every request.
 */
export class YearParamsDto {
  @Type(() => Number)
  @IsInt()
  @Min(PUBLIC_HOLIDAY_MIN_YEAR)
  @Max(PUBLIC_HOLIDAY_MAX_YEAR)
  readonly year!: number;
}
