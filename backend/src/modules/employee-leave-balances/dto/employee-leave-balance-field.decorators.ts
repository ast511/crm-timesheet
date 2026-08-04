import { applyDecorators } from '@nestjs/common';
import { Transform } from 'class-transformer';
import { IsInt, IsString, Max, MaxLength, Min } from 'class-validator';

import {
  LEAVE_BALANCE_MAX_DAYS,
  LEAVE_BALANCE_MAX_YEAR,
  LEAVE_BALANCE_MIN_DAYS,
  LEAVE_BALANCE_MIN_YEAR,
  LEAVE_BALANCE_NOTES_MAX_LENGTH,
} from '../employee-leave-balance.constants';

/**
 * The per-field rules shared by `CreateEmployeeLeaveBalanceDto` and
 * `UpdateEmployeeLeaveBalanceDto`.
 *
 * The same split every module since Feature 007 uses: **constraints** live here,
 * **optionality** stays on the DTO, because `@IsOptional()` — or
 * `@ValidateIfPresent()` — is what distinguishes "create" from "patch" and has
 * to be readable on the class it applies to.
 *
 * `employeeId` and `leaveTypeId` are not here: they use the shared
 * `@IsRelationId()`, which Feature 013 moved into `common/decorators` precisely
 * so a third module would not write it again.
 */

/**
 * `year` — a whole calendar year inside the bounds a balance may name.
 *
 * `@IsInt()` and not `@Type(() => Number)`: this arrives in a JSON body, where
 * `2026` and `"2026"` are genuinely different values, and coercing the string
 * would accept a payload the client should fix. The query-string counterpart is
 * the opposite case and does coerce — see `EmployeeLeaveBalanceQueryDto`, where
 * a parameter is text by definition.
 */
export function IsLeaveBalanceYear() {
  return applyDecorators(
    IsInt(),
    Min(LEAVE_BALANCE_MIN_YEAR),
    Max(LEAVE_BALANCE_MAX_YEAR),
  );
}

/**
 * `allocatedDays`, `carriedOverDays`, `usedDays` — a whole number of days,
 * never negative, never more than a year holds.
 *
 * One decorator for all three, because the rule is genuinely the same for each;
 * what differs between them is only whether the field is required, which stays
 * on the DTO. Half days are rejected: leave here is counted in whole days, and
 * `10.5` would be silently truncated by the `integer` column.
 */
export function IsLeaveBalanceDays() {
  return applyDecorators(
    IsInt(),
    Min(LEAVE_BALANCE_MIN_DAYS),
    Max(LEAVE_BALANCE_MAX_DAYS),
  );
}

/**
 * `notes` — trimmed, and blank collapses to `null`.
 *
 * A cleared textarea posts `""`, which is not a shorter note but the absence of
 * one; storing it verbatim would give the column two values meaning "empty" and
 * force every reader to check for both. The resulting `null` is skipped by the
 * `@IsOptional()` on the property, so clearing a note is a valid request rather
 * than a failed `@IsString()`.
 */
export function IsLeaveBalanceNotes() {
  return applyDecorators(
    Transform(({ value }: { value: unknown }) => {
      if (typeof value !== 'string') {
        return value;
      }

      const trimmed = value.trim();

      return trimmed.length === 0 ? null : trimmed;
    }),
    IsString(),
    MaxLength(LEAVE_BALANCE_NOTES_MAX_LENGTH),
  );
}
