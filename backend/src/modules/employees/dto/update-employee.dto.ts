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
 * Body of `PATCH /api/v1/employees/:id`.
 *
 * Every field is optional, and an absent one means "leave it alone" — Prisma
 * omits `undefined` from the `UPDATE`, so a partial body never blanks a column
 * the client did not mention. `phone: null` (or `""`) is the explicit way to
 * remove a phone number, which is a different request from omitting it.
 *
 * The three foreign keys stay editable, because all three changes are ordinary
 * events: people transfer between departments, get promoted into a new
 * position, and — rarely, after an account is recreated — have their login
 * re-pointed. Each one is re-validated exactly as it is on creation, so a patch
 * cannot leave the row referencing something that does not exist, and moving a
 * user to a second employee is still refused.
 *
 * Note which fields carry `@ValidateIfPresent()` and which carry
 * `@IsOptional()`: `phone` is the only nullable column, so it is the only field
 * where `null` is a value rather than a mistake. Everywhere else `null` is a
 * `400`, because `@IsOptional()` alone would skip the constraints and let it
 * through to a column that cannot hold it.
 */
export class UpdateEmployeeDto {
  @ValidateIfPresent()
  @IsEmployeeCode()
  readonly employeeCode?: string;

  @ValidateIfPresent()
  @IsEmployeeName()
  readonly firstName?: string;

  @ValidateIfPresent()
  @IsEmployeeName()
  readonly lastName?: string;

  /** The one nullable column: `null` clears it rather than failing. */
  @IsOptional()
  @IsEmployeePhone()
  readonly phone?: string | null;

  @ValidateIfPresent()
  @IsIsoDateString()
  readonly hireDate?: string;

  /**
   * The day the person left, or `null` to say they did not after all.
   *
   * The second nullable column, and the second field where `null` is a value
   * rather than a mistake: a termination entered by accident, or a leaver who
   * withdrew their notice, has to be undoable, and `@ValidateIfPresent()` would
   * have made that a `400`.
   *
   * Setting it does **not** set `status`, and setting `status` to `TERMINATED`
   * does not set this. The two are deliberately independent — see the schema
   * comment on the column — because a notice period is real: somebody whose last
   * day is in three weeks is `ACTIVE` and has a termination date, and coupling
   * the two would either terminate them early or refuse to record the date.
   */
  @IsOptional()
  @IsIsoDateString()
  readonly terminationDate?: string | null;

  @ValidateIfPresent()
  @IsRelationId()
  readonly userId?: string;

  @ValidateIfPresent()
  @IsRelationId()
  readonly departmentId?: string;

  @ValidateIfPresent()
  @IsRelationId()
  readonly positionId?: string;

  @ValidateIfPresent()
  @IsEmployeeSeniority()
  readonly seniority?: SeniorityLevel;

  @ValidateIfPresent()
  @IsEmployeeStatus()
  readonly status?: EmployeeStatus;

  @ValidateIfPresent()
  @IsBoolean()
  readonly canReplaceOthers?: boolean;
}
