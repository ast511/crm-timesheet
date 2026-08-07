import { IsBoolean, IsOptional } from 'class-validator';

import { IsIsoDateString } from '../../../common/decorators/is-iso-date-string.decorator';
import { IsRelationId } from '../../../common/decorators/is-relation-id.decorator';
import { ValidateIfPresent } from '../../../common/decorators/validate-if-present.decorator';
import {
  EmployeeStatus,
  SeniorityLevel,
} from '../../../generated/prisma/enums';
import {
  IsEmployeeCode,
  IsEmployeeName,
  IsEmployeePhone,
  IsEmployeeSeniority,
  IsEmployeeStatus,
} from './employee-field.decorators';

/**
 * Body of `POST /api/v1/employees`.
 *
 * The three foreign keys are all required, because the schema's relations are:
 * an employee without a user cannot sign in, and one without a department or a
 * position cannot be reported on. The service confirms each referenced row
 * exists before writing — this class only checks the shape of what arrived.
 *
 * `seniority` and `status` are required for a different reason: the columns
 * have no default, so there is no value for an omission to fall back to.
 * `canReplaceOthers` does have one (`false`), which is left to the schema rather
 * than repeated here, so it stays one decision made in one place.
 *
 * **No leave is granted by creating an employee.** `maxVacationDays` used to be
 * here and went with the column in Feature 022; leave is now allocated
 * deliberately, per leave type and per year, through
 * `POST /api/v1/employee-leave-balances`. A new employee therefore starts with
 * no balances at all, which is the honest state until HR decides the numbers.
 */
export class CreateEmployeeDto {
  @IsEmployeeCode()
  readonly employeeCode!: string;

  @IsEmployeeName()
  readonly firstName!: string;

  @IsEmployeeName()
  readonly lastName!: string;

  /** Optional, and a blank value is stored as `null` rather than as `""`. */
  @IsOptional()
  @IsEmployeePhone()
  readonly phone?: string | null;

  @IsIsoDateString()
  readonly hireDate!: string;

  /**
   * The last day the person works here, when that is already known.
   *
   * Optional, and null on almost every employee — somebody being hired does not
   * usually have a leaving date. It is accepted at creation anyway, because a
   * fixed-term contract is entered with both ends known, and requiring a second
   * `PATCH` to state a fact the form already had would be ceremony.
   *
   * Added by Feature 030, which is the first thing here that reads it: a
   * timesheet entry is only acceptable inside
   * `[hireDate, terminationDate ?? today]`, so a leaver's final month can be
   * filled up to the day they left and no further.
   *
   * That it must not precede `hireDate` is a rule about two fields at once, so it
   * is checked in the service beside the other statements about what a valid
   * employee is.
   */
  @IsOptional()
  @IsIsoDateString()
  readonly terminationDate?: string | null;

  @IsRelationId()
  readonly userId!: string;

  @IsRelationId()
  readonly departmentId!: string;

  @IsRelationId()
  readonly positionId!: string;

  @IsEmployeeSeniority()
  readonly seniority!: SeniorityLevel;

  @IsEmployeeStatus()
  readonly status!: EmployeeStatus;

  /**
   * Omitted, the schema's `false` applies. `null` is not the same request and
   * is rejected — the column is not nullable, so it has nothing to store.
   */
  @ValidateIfPresent()
  @IsBoolean()
  readonly canReplaceOthers?: boolean;
}
