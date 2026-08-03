import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';

import { Trim } from '../../../common/decorators/trim.decorator';
import { SortQueryDto } from '../../../common/dto/sort-query.dto';
import {
  DEFAULT_POSITION_SORT_FIELD,
  POSITION_SEARCH_MAX_LENGTH,
  POSITION_SORT_FIELDS,
  PositionSortField,
} from '../position.constants';

/**
 * Query string of `GET /api/v1/positions`:
 * `?page=2&limit=50&search=dev&sortBy=name&sortOrder=asc`.
 *
 * Extends `SortQueryDto` instead of redeclaring `page`, `limit` and
 * `sortOrder`, so the shared defaults, the page-size cap and the direction
 * vocabulary apply here without being restated. Only `sortBy` is declared
 * locally, because its allowed values name columns of this table.
 *
 * `sortBy` carries its default as a property initialiser, the same technique
 * the pagination DTO uses: an absent parameter leaves the initialiser in place,
 * so the service always receives a concrete ordering and never has to apply a
 * fallback of its own.
 */
export class PositionQueryDto extends SortQueryDto {
  /**
   * Case-insensitive substring matched against `code` and `name`.
   *
   * Absent and empty are the same thing — an empty term would match every row,
   * which is what the endpoint already does without it.
   */
  @IsOptional()
  @Trim()
  @IsString()
  @MaxLength(POSITION_SEARCH_MAX_LENGTH)
  readonly search?: string;

  /** Column to order by; only the enumerated ones reach Prisma's `orderBy`. */
  @IsOptional()
  @IsIn(POSITION_SORT_FIELDS)
  readonly sortBy: PositionSortField = DEFAULT_POSITION_SORT_FIELD;
}
