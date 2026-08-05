import { IsOptional } from 'class-validator';

import { ValidateIfPresent } from '../../../common/decorators/validate-if-present.decorator';
import {
  IsLeaveBalanceDays,
  IsLeaveBalanceNotes,
} from './employee-leave-balance-field.decorators';

/**
 * Body of `PATCH /api/v1/employee-leave-balances/:id`.
 *
 * Every field is optional, and an absent one means "leave it alone" — Prisma
 * omits `undefined` from the `UPDATE`, so a partial body never blanks a column
 * the client did not mention. `notes` is the one nullable column and therefore
 * the one field where an explicit `null` is a request ("clear it") rather than a
 * mistake; on the three day counts `@ValidateIfPresent()` turns `null` into a
 * `400` instead of letting `@IsOptional()` wave it through to a `NOT NULL`
 * column.
 *
 * **`employeeId`, `leaveTypeId` and `year` are deliberately absent.** They are
 * not three editable properties of a balance — together they are its identity,
 * the triple the unique constraint is on. Changing one would not be an edit of
 * this balance but a claim that it was always a different one: the 2026 row
 * would become the 2027 row, and whatever the 2027 row said would either be
 * overwritten or collide. A balance filed against the wrong employee, type or
 * year is corrected by deleting it and creating the right one, which is one
 * extra request and leaves no ambiguity about which grant is which.
 *
 * **There is no `remainingDays` field, and sending one is a `400`**, exactly as
 * on creation. It is derived from the three numbers below on every read, so
 * there is nothing here for a client to set — and `forbidNonWhitelisted` says so
 * out loud rather than ignoring the attempt.
 */
export class UpdateEmployeeLeaveBalanceDto {
  @ValidateIfPresent()
  @IsLeaveBalanceDays()
  readonly allocatedDays?: number;

  @ValidateIfPresent()
  @IsLeaveBalanceDays()
  readonly carriedOverDays?: number;

  /**
   * Maintained by hand here, and by the Leave Requests feature later.
   *
   * It stays editable rather than becoming read-only in anticipation: until
   * requests exist, this is the only way to record days somebody has taken, and
   * a correction to a miscounted figure has to be possible afterwards too.
   */
  @ValidateIfPresent()
  @IsLeaveBalanceDays()
  readonly usedDays?: number;

  /**
   * Days written off by a year-end. Editable so a run that expired too much — a
   * carry-over cap corrected after the fact — can be put right without deleting
   * the balance and losing the year with it.
   *
   * Re-running the generation will not undo an over-expiry for you. It is safe
   * to run twice — expiring down to a cap leaves nothing above that cap, so the
   * second run finds nothing to take — but that is idempotence, not a
   * correction: it can only ever expire more, never give days back.
   */
  @ValidateIfPresent()
  @IsLeaveBalanceDays()
  readonly expiredDays?: number;

  /** Nullable: `null` (or `""`) clears the note. */
  @IsOptional()
  @IsLeaveBalanceNotes()
  readonly notes?: string | null;
}
