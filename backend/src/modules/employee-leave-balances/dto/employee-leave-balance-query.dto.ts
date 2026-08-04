import { Type } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

import { IsRelationId } from '../../../common/decorators/is-relation-id.decorator';
import { Trim } from '../../../common/decorators/trim.decorator';
import { SortQueryDto } from '../../../common/dto/sort-query.dto';
import {
  DEFAULT_LEAVE_BALANCE_SORT_FIELD,
  LEAVE_BALANCE_MAX_YEAR,
  LEAVE_BALANCE_MIN_YEAR,
  LEAVE_BALANCE_SEARCH_MAX_LENGTH,
  LEAVE_BALANCE_SORT_FIELDS,
  LeaveBalanceSortField,
} from '../employee-leave-balance.constants';

/**
 * Query string of `GET /api/v1/employee-leave-balances`:
 * `?page=2&limit=50&search=popescu&year=2026&leaveTypeId=…&sortBy=employee`.
 *
 * Extends `SortQueryDto` instead of redeclaring `page`, `limit` and `sortOrder`,
 * so the shared defaults, the page-size cap and the direction vocabulary apply
 * here without being restated. Only the per-resource parameters are declared
 * locally.
 *
 * `sortBy` carries its default as a property initialiser, the same technique
 * every other query DTO uses: an absent parameter leaves the initialiser in
 * place, so the service always receives a concrete ordering and never has to
 * apply a fallback of its own. The three filters have no initialiser — for them,
 * absent means "do not filter", which is not a value they could carry.
 *
 * In particular `year` is **not** defaulted to the current year. It would be the
 * convenient choice and it is the wrong one: a client asking for every balance
 * would silently receive one year's, and no parameter it could send would say
 * "all years" — the filter would have taken the place of the default rather than
 * narrowing it. A UI that wants the current year sends `?year=2026`, which is
 * visible in the URL and in the logs.
 */
export class EmployeeLeaveBalanceQueryDto extends SortQueryDto {
  /**
   * Case-insensitive substring matched against the **employee's**
   * `employeeCode`, `firstName` and `lastName`.
   *
   * The searchable text belongs to the related row rather than to this one: a
   * balance is three numbers and a year, and nobody looks one up by typing `21`.
   * The leave type is not searched either — it is a closed vocabulary, so
   * `?leaveTypeId=` answers that exactly, where a substring would guess.
   *
   * Absent and empty are the same thing — an empty term would match every row,
   * which is what the endpoint already does without it.
   */
  @IsOptional()
  @Trim()
  @IsString()
  @MaxLength(LEAVE_BALANCE_SEARCH_MAX_LENGTH)
  readonly search?: string;

  /**
   * Exact year: `?year=2026`.
   *
   * `@Type(() => Number)` is mandatory, not decoration: a query parameter is
   * text, so without it `@IsInt()` would reject every request. This is the
   * opposite call from the body DTO, where `"2026"` is a payload the client
   * should fix — the difference is that a query string has no other way to carry
   * a number.
   */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(LEAVE_BALANCE_MIN_YEAR)
  @Max(LEAVE_BALANCE_MAX_YEAR)
  readonly year?: number;

  /**
   * Exact leave type. An id matching no leave type is not an error: it simply
   * matches no balance, and an empty page is the honest answer to "who has a
   * balance in a leave type that does not exist".
   */
  @IsOptional()
  @IsRelationId()
  readonly leaveTypeId?: string;

  /**
   * Exact department, matched through the employee.
   *
   * A balance has no department of its own — the person does — so this narrows
   * on `employee.departmentId`. That is what makes "the Development team's 2026
   * annual leave" one request rather than a client fetching the department's
   * employees and then filtering balances by hand.
   */
  @IsOptional()
  @IsRelationId()
  readonly departmentId?: string;

  /** Column to order by; only the enumerated ones reach Prisma's `orderBy`. */
  @IsOptional()
  @IsIn(LEAVE_BALANCE_SORT_FIELDS)
  readonly sortBy: LeaveBalanceSortField = DEFAULT_LEAVE_BALANCE_SORT_FIELD;
}
