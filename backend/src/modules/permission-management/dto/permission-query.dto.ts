import { IsEnum, IsIn, IsOptional, IsString, MaxLength } from 'class-validator';

import { Trim } from '../../../common/decorators/trim.decorator';
import { SortQueryDto } from '../../../common/dto/sort-query.dto';
import {
  PermissionAction,
  PermissionResource,
} from '../../../generated/prisma/enums';
import {
  DEFAULT_PERMISSION_SORT_FIELD,
  PERMISSION_SEARCH_MAX_LENGTH,
  PERMISSION_SORT_FIELDS,
  PermissionSortField,
} from '../permission-management.constants';

/**
 * Query string of `GET /api/v1/permissions`:
 * `?page=1&limit=100&search=timesheet&resource=TIMESHEET&action=CREATE&sortBy=resource`.
 *
 * Extends `SortQueryDto` instead of redeclaring `page`, `limit` and `sortOrder`,
 * so Feature 006's shared defaults and page-size cap apply here without being
 * restated. The catalog is fifty-five rows and `MAX_PAGE_SIZE` is 100, so a
 * screen that wants the whole matrix asks for it in one request; the pagination
 * is there because every list in this API has it, not because this one needs
 * rescuing.
 *
 * The filters are independent and combine with `AND`: `?resource=TIMESHEET`
 * narrows whatever `?search=` matched rather than replacing it.
 *
 * There is no `?role=` and no `?userId=`. "What does HR get by default" and
 * "what does this person hold" are not filters over the catalog — they are the
 * resolution, and it has its own endpoints. A filter that quietly answered a
 * different question with the same shape would be the second way to ask it.
 */
export class PermissionQueryDto extends SortQueryDto {
  /**
   * Case-insensitive substring matched against `key` **and** `label`.
   *
   * Both, because the two are how the same permission is named in the two places
   * somebody comes from: an administrator reading a screen types `approve`,
   * while somebody reading a feature document or a future
   * `@RequirePermission()` types `LEAVE_REQUESTS.APPROVE`. `description` is
   * deliberately not searched — it is prose written to explain a cell, and
   * matching it would return rows whose key and label say nothing about the term.
   *
   * Absent and empty are the same thing.
   */
  @IsOptional()
  @Trim()
  @IsString()
  @MaxLength(PERMISSION_SEARCH_MAX_LENGTH)
  readonly search?: string;

  /** One row of the matrix: `?resource=TIMESHEET`. */
  @IsOptional()
  @IsEnum(PermissionResource)
  readonly resource?: PermissionResource;

  /**
   * One column of it: `?action=APPROVE` is "everything anybody can approve",
   * which is the question an administrator asks when deciding who signs off on
   * what.
   */
  @IsOptional()
  @IsEnum(PermissionAction)
  readonly action?: PermissionAction;

  /**
   * Column to order by; only the enumerated ones reach Prisma's `orderBy`.
   *
   * `resource` and `action` order by their enums' declaration order, which is
   * the order the matrix is drawn in — see the constants file for why that makes
   * `resource` the default rather than the project-wide `createdAt`.
   */
  @IsOptional()
  @IsIn(PERMISSION_SORT_FIELDS)
  readonly sortBy: PermissionSortField = DEFAULT_PERMISSION_SORT_FIELD;
}
