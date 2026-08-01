import { Type } from 'class-transformer';
import { IsInt, IsOptional, Max, Min } from 'class-validator';

import {
  DEFAULT_PAGE_SIZE,
  FIRST_PAGE,
  MAX_PAGE_SIZE,
  MIN_PAGE_SIZE,
} from '../constants/pagination.constants';
import { PaginationParams } from '../interfaces/pagination.interface';

/**
 * Query parameters every list endpoint accepts: `?page=2&limit=50`.
 *
 * A list DTO that also needs filtering or sorting extends this class instead of
 * redeclaring `page` and `limit`, so the rules below hold for every collection
 * in the API.
 *
 * Both properties are optional and carry their default as a property
 * initialiser: an absent parameter leaves the initialiser untouched, so a
 * handler always receives concrete numbers and never has to apply a fallback of
 * its own.
 *
 * `@Type(() => Number)` is required because query strings are text — without it
 * `@IsInt()` would reject every request. It works globally thanks to the
 * `transform: true` option on the application's `ValidationPipe`.
 */
export class PaginationQueryDto implements PaginationParams {
  /** 1-based page number. */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(FIRST_PAGE)
  readonly page: number = FIRST_PAGE;

  /** Records per page, capped so one request cannot drain a table. */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(MIN_PAGE_SIZE)
  @Max(MAX_PAGE_SIZE)
  readonly limit: number = DEFAULT_PAGE_SIZE;
}
