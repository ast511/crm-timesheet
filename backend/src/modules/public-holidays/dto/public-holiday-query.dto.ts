import {
  IsBoolean,
  IsIn,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

import { ToBoolean } from '../../../common/decorators/to-boolean.decorator';
import { Trim } from '../../../common/decorators/trim.decorator';
import { SortQueryDto } from '../../../common/dto/sort-query.dto';
import { HolidayType } from '../../../generated/prisma/enums';
import {
  DEFAULT_PUBLIC_HOLIDAY_SORT_FIELD,
  PUBLIC_HOLIDAY_SEARCH_MAX_LENGTH,
  PUBLIC_HOLIDAY_SORT_FIELDS,
  PublicHolidaySortField,
} from '../public-holiday.constants';
import { IsHolidayType } from './public-holiday-field.decorators';

/**
 * Query string of `GET /api/v1/public-holidays`:
 * `?page=2&limit=50&search=easter&type=VARIABLE&isNational=true`.
 *
 * **There is no `?year=` here.** This endpoint lists the *records* an
 * administrator maintains, and a fixed holiday's record carries whatever year
 * it was entered with — filtering those by year would answer a question nobody
 * asks. "Which days is the company closed in 2027" is
 * `GET /public-holidays/calendar/2027`, which projects each fixed holiday onto
 * the year instead of reporting the year it was typed in. Feature 018 removed
 * the parameter rather than leaving both, so there is one way to ask.
 *
 * Extends `SortQueryDto` instead of redeclaring `page`, `limit` and
 * `sortOrder`, so the shared defaults, the page-size cap and the direction
 * vocabulary apply here without being restated. Only the per-resource
 * parameters are declared locally.
 *
 * There is no `?isActive=` either. Feature 019 replaced that column with a
 * validity range, so "is it still in force" is a question about a year — and
 * the endpoint that takes a year is the calendar. This one lists every version
 * ever recorded, repealed ones included, which is what an administrator
 * maintaining the history needs to see.
 *
 * Extends `SortQueryDto` instead of redeclaring `page`, `limit` and
 * `sortOrder`, so the shared defaults, the page-size cap and the direction
 * vocabulary apply here without being restated. Only the per-resource
 * parameters are declared locally.
 *
 * `sortBy` carries its default as a property initialiser, the same technique
 * the other query DTOs use: an absent parameter leaves the initialiser in
 * place, so the service always receives a concrete ordering. The three filters
 * have no initialiser — for them, absent means "do not filter", which is not a
 * value they could carry.
 */
export class PublicHolidayQueryDto extends SortQueryDto {
  /**
   * Case-insensitive substring matched against `name`.
   *
   * `name` alone, not `description`: the description is prose about the
   * holiday, and matching it would make a search for "day" return everything
   * that merely mentions one.
   *
   * Absent and empty are the same thing — an empty term would match every row,
   * which is what the endpoint already does without it.
   */
  @IsOptional()
  @Trim()
  @IsString()
  @MaxLength(PUBLIC_HOLIDAY_SEARCH_MAX_LENGTH)
  readonly search?: string;

  /** `?type=FIXED` / `=VARIABLE`; validated against the enum. */
  @IsOptional()
  @IsHolidayType()
  readonly type?: HolidayType;

  /** `?isNational=true` / `=false`; anything else is a `400`. */
  @IsOptional()
  @ToBoolean()
  @IsBoolean()
  readonly isNational?: boolean;

  /** Column to order by; only the enumerated ones reach Prisma's `orderBy`. */
  @IsOptional()
  @IsIn(PUBLIC_HOLIDAY_SORT_FIELDS)
  readonly sortBy: PublicHolidaySortField = DEFAULT_PUBLIC_HOLIDAY_SORT_FIELD;
}
