import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';

import { Trim } from '../../../common/decorators/trim.decorator';
import { SortQueryDto } from '../../../common/dto/sort-query.dto';
import {
  DEFAULT_DEPARTMENT_SORT_FIELD,
  DEPARTMENT_SEARCH_MAX_LENGTH,
  DEPARTMENT_SORT_FIELDS,
  DepartmentSortField,
} from '../department.constants';

/**
 * Query string of `GET /api/v1/departments`:
 * `?page=2&limit=50&search=dev&sortBy=name&sortOrder=asc`.
 *
 * Extends `SortQueryDto` instead of redeclaring `page`, `limit` and
 * `sortOrder`, so the shared defaults, the page-size cap and the direction
 * vocabulary apply here without being restated. Feature 008 moved `sortOrder`
 * up into that class once a second list endpoint confirmed the shape; only
 * `sortBy`, whose allowed values are per-resource, stays here.
 *
 * `sortBy` carries its default as a property initialiser, the same technique
 * the pagination DTO uses: an absent parameter leaves the initialiser in place,
 * so the service always receives a concrete ordering and never has to apply a
 * fallback of its own.
 */
export class DepartmentQueryDto extends SortQueryDto {
  /**
   * Case-insensitive substring matched against `code` and `name`.
   *
   * Absent and empty are the same thing — an empty term would match every row,
   * which is what the endpoint already does without it.
   */
  @IsOptional()
  @Trim()
  @IsString()
  @MaxLength(DEPARTMENT_SEARCH_MAX_LENGTH)
  readonly search?: string;

  /** Column to order by; only the enumerated ones reach Prisma's `orderBy`. */
  @IsOptional()
  @IsIn(DEPARTMENT_SORT_FIELDS)
  readonly sortBy: DepartmentSortField = DEFAULT_DEPARTMENT_SORT_FIELD;
}
