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
  IsEmployeeMaxVacationDays,
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
 * `canReplaceOthers` and `maxVacationDays` do have defaults (`false` and `21`),
 * which are left to the schema rather than repeated here, so each stays one
 * decision made in one place.
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

  /** Omitted, the schema's 21 applies; `null` is rejected, as above. */
  @ValidateIfPresent()
  @IsEmployeeMaxVacationDays()
  readonly maxVacationDays?: number;
}
