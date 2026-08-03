import {
  IsBoolean,
  IsIn,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

import { IsRelationId } from '../../../common/decorators/is-relation-id.decorator';
import { ToBoolean } from '../../../common/decorators/to-boolean.decorator';
import { Trim } from '../../../common/decorators/trim.decorator';
import { SortQueryDto } from '../../../common/dto/sort-query.dto';
import {
  EmployeeStatus,
  SeniorityLevel,
} from '../../../generated/prisma/enums';
import {
  DEFAULT_EMPLOYEE_SORT_FIELD,
  EMPLOYEE_SEARCH_MAX_LENGTH,
  EMPLOYEE_SORT_FIELDS,
  EmployeeSortField,
} from '../employee.constants';
import {
  IsEmployeeSeniority,
  IsEmployeeStatus,
} from './employee-field.decorators';

/**
 * Query string of `GET /api/v1/employees`:
 * `?page=2&limit=50&search=popescu&departmentId=…&status=ACTIVE&sortBy=lastName`.
 *
 * Extends `SortQueryDto` instead of redeclaring `page`, `limit` and
 * `sortOrder`, so the shared defaults, the page-size cap and the direction
 * vocabulary apply here without being restated. Only the per-resource
 * parameters are declared locally.
 *
 * `sortBy` carries its default as a property initialiser, the same technique
 * the other query DTOs use: an absent parameter leaves the initialiser in
 * place, so the service always receives a concrete ordering and never has to
 * apply a fallback of its own. The five filters have no initialiser — for them,
 * absent means "do not filter", which is not a value they could carry.
 */
export class EmployeeQueryDto extends SortQueryDto {
  /**
   * Case-insensitive substring matched against `employeeCode`, `firstName` and
   * `lastName`.
   *
   * Absent and empty are the same thing — an empty term would match every row,
   * which is what the endpoint already does without it.
   */
  @IsOptional()
  @Trim()
  @IsString()
  @MaxLength(EMPLOYEE_SEARCH_MAX_LENGTH)
  readonly search?: string;

  /**
   * Exact department. An id matching no department is not an error: it simply
   * matches no employee, and an empty page is the honest answer to "who works
   * in a department that does not exist".
   */
  @IsOptional()
  @IsRelationId()
  readonly departmentId?: string;

  /** Exact position, on the same terms as `departmentId`. */
  @IsOptional()
  @IsRelationId()
  readonly positionId?: string;

  /** Exact seniority. Validated against the enum, so it reaches Prisma as a
   * value the column can hold rather than as arbitrary text. */
  @IsOptional()
  @IsEmployeeSeniority()
  readonly seniority?: SeniorityLevel;

  /** Exact employment status, on the same terms as `seniority`. */
  @IsOptional()
  @IsEmployeeStatus()
  readonly status?: EmployeeStatus;

  /** `?canReplaceOthers=true` / `=false`; anything else is a `400`. */
  @IsOptional()
  @ToBoolean()
  @IsBoolean()
  readonly canReplaceOthers?: boolean;

  /** Column to order by; only the enumerated ones reach Prisma's `orderBy`. */
  @IsOptional()
  @IsIn(EMPLOYEE_SORT_FIELDS)
  readonly sortBy: EmployeeSortField = DEFAULT_EMPLOYEE_SORT_FIELD;
}
