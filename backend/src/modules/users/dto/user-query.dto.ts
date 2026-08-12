import { IsEnum, IsIn, IsOptional, IsString, MaxLength } from 'class-validator';

import { Trim } from '../../../common/decorators/trim.decorator';
import { SortQueryDto } from '../../../common/dto/sort-query.dto';
import { AccountStatus, UserRole } from '../../../generated/prisma/enums';
import {
  DEFAULT_USER_SORT_FIELD,
  USER_SEARCH_MAX_LENGTH,
  USER_SORT_FIELDS,
  UserSortField,
} from '../user.constants';
import { IsUserRole } from './user-field.decorators';

/**
 * Query string of `GET /api/v1/users`:
 * `?page=2&limit=50&search=ana&role=ADMIN&status=ACTIVE&sortBy=email&sortOrder=asc`.
 *
 * Extends `SortQueryDto` instead of redeclaring `page`, `limit` and
 * `sortOrder`, so the shared defaults, the page-size cap and the direction
 * vocabulary apply here without being restated. Only the per-resource
 * parameters are declared locally.
 *
 * `sortBy` carries its default as a property initialiser, the same technique
 * the pagination DTO uses: an absent parameter leaves the initialiser in place,
 * so the service always receives a concrete ordering and never has to apply a
 * fallback of its own. The two filters have no initialiser — for them, absent
 * means "do not filter", which is not a value they could carry.
 */
export class UserQueryDto extends SortQueryDto {
  /**
   * Case-insensitive substring matched against `email` and `username`.
   *
   * Absent and empty are the same thing — an empty term would match every row,
   * which is what the endpoint already does without it.
   */
  @IsOptional()
  @Trim()
  @IsString()
  @MaxLength(USER_SEARCH_MAX_LENGTH)
  readonly search?: string;

  /** Exact role. Validated against the enum, so it reaches Prisma as a value
   * the column can hold rather than as arbitrary text. */
  @IsOptional()
  @IsUserRole()
  readonly role?: UserRole;

  /**
   * Exact account state — `?status=PENDING_ACTIVATION`.
   *
   * **Replaced `?isActive=` in Feature 036**, along with the column behind it.
   * The boolean could answer two questions and the screen has three: the filter
   * an administrator actually reaches for on the accounts page is "who has not
   * accepted their invitation yet", and `?isActive=true` used to return those
   * people mixed in with everybody else. A client that filtered `?isActive=true`
   * now filters `?status=ACTIVE`, and one that filtered `?isActive=false` filters
   * `?status=DISABLED`.
   *
   * Validated against the enum, so it reaches Prisma as a value the column can
   * hold rather than as arbitrary text.
   */
  @IsOptional()
  @IsEnum(AccountStatus)
  readonly status?: AccountStatus;

  /** Column to order by; only the enumerated ones reach Prisma's `orderBy`. */
  @IsOptional()
  @IsIn(USER_SORT_FIELDS)
  readonly sortBy: UserSortField = DEFAULT_USER_SORT_FIELD;
}
