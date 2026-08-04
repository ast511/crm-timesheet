import {
  IsBoolean,
  IsIn,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

import { ToBoolean } from '../../../../common/decorators/to-boolean.decorator';
import { Trim } from '../../../../common/decorators/trim.decorator';
import { SortQueryDto } from '../../../../common/dto/sort-query.dto';
import {
  DEFAULT_LEAVE_TYPE_SORT_FIELD,
  LEAVE_TYPE_SEARCH_MAX_LENGTH,
  LEAVE_TYPE_SORT_FIELDS,
  LeaveTypeSortField,
} from '../leave-type.constants';

/**
 * Query string of `GET /api/v1/leave-types`:
 * `?page=2&limit=50&search=annual&isActive=true&sortBy=defaultAllocatedDays`.
 *
 * Extends `SortQueryDto` instead of redeclaring `page`, `limit` and `sortOrder`,
 * so the shared defaults, the page-size cap and the direction vocabulary apply
 * here without being restated. Only the per-resource parameters are declared
 * locally.
 *
 * `sortBy` carries its default as a property initialiser, the same technique the
 * other query DTOs use: an absent parameter leaves the initialiser in place, so
 * the service always receives a concrete ordering and never has to apply a
 * fallback of its own. The three filters have no initialiser — for them, absent
 * means "do not filter", which is not a value they could carry. In particular,
 * omitting `isActive` lists retired and available types alike; hiding the
 * retired ones by default would be a policy the caller cannot see or turn off,
 * and this endpoint is the screen an administrator maintains them on.
 */
export class LeaveTypeQueryDto extends SortQueryDto {
  /**
   * Case-insensitive substring matched against `code` and `label`.
   *
   * Those two, not `description`: the description is prose about the leave type,
   * and matching it would make a search for "leave" return everything that
   * merely mentions it.
   *
   * Absent and empty are the same thing — an empty term would match every row,
   * which is what the endpoint already does without it.
   */
  @IsOptional()
  @Trim()
  @IsString()
  @MaxLength(LEAVE_TYPE_SEARCH_MAX_LENGTH)
  readonly search?: string;

  /** `?isActive=true` / `=false`; anything else is a `400`. */
  @IsOptional()
  @ToBoolean()
  @IsBoolean()
  readonly isActive?: boolean;

  /** `?requiresApproval=true` / `=false`, on the same terms. */
  @IsOptional()
  @ToBoolean()
  @IsBoolean()
  readonly requiresApproval?: boolean;

  /** `?isPaid=true` / `=false`, on the same terms. */
  @IsOptional()
  @ToBoolean()
  @IsBoolean()
  readonly isPaid?: boolean;

  /** Column to order by; only the enumerated ones reach Prisma's `orderBy`. */
  @IsOptional()
  @IsIn(LEAVE_TYPE_SORT_FIELDS)
  readonly sortBy: LeaveTypeSortField = DEFAULT_LEAVE_TYPE_SORT_FIELD;
}
