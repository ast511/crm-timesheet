import { IsOptional } from 'class-validator';

import { IsRelationId } from '../../../common/decorators/is-relation-id.decorator';
import {
  IsLeaveBalanceDays,
  IsLeaveBalanceNotes,
  IsLeaveBalanceYear,
} from './employee-leave-balance-field.decorators';

/**
 * Body of `POST /api/v1/employee-leave-balances`.
 *
 * The three fields that identify the balance — `employeeId`, `leaveTypeId`,
 * `year` — are all required, because together they *are* the balance: the unique
 * constraint is on exactly this triple, and a row missing any of them could not
 * be checked against it. The service confirms the two referenced rows exist
 * before writing; this class only checks the shape of what arrived.
 *
 * `allocatedDays` is required as well, and that is the deliberate half of "the
 * application must not assign leave on its own". A balance exists because
 * somebody decided a number, so the number has to be typed — including `0`,
 * which is a decision ("no days of this type this year") rather than an
 * omission. `carriedOverDays` and `usedDays` are optional and left to the
 * schema's `0`, so that default stays one decision made in one place.
 *
 * **There is no `remainingDays` field, and sending one is a `400`.** The global
 * `ValidationPipe` runs with `forbidNonWhitelisted`, so a client that tries to
 * state the derived value is told, rather than having it silently ignored — the
 * strongest form of "the API never persists it".
 */
export class CreateEmployeeLeaveBalanceDto {
  @IsRelationId()
  readonly employeeId!: string;

  @IsRelationId()
  readonly leaveTypeId!: string;

  @IsLeaveBalanceYear()
  readonly year!: number;

  @IsLeaveBalanceDays()
  readonly allocatedDays!: number;

  /** Omitted, the schema's `0` applies — the right answer for a first year. */
  @IsOptional()
  @IsLeaveBalanceDays()
  readonly carriedOverDays?: number;

  /**
   * Omitted, the schema's `0` applies.
   *
   * Statable on creation rather than forced to zero, because a balance is not
   * always opened at the start of a year: somebody joining mid-year, or a
   * migration from whatever HR used before, arrives with days already taken.
   */
  @IsOptional()
  @IsLeaveBalanceDays()
  readonly usedDays?: number;

  /** Nullable: `null` (or `""`) means "no note". */
  @IsOptional()
  @IsLeaveBalanceNotes()
  readonly notes?: string | null;
}
