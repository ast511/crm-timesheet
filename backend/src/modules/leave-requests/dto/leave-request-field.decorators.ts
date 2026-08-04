import { applyDecorators } from '@nestjs/common';
import { Transform } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  ArrayUnique,
  IsInt,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

import { IsRelationId } from '../../../common/decorators/is-relation-id.decorator';
import {
  LEAVE_REQUEST_DECISION_REASON_MAX_LENGTH,
  LEAVE_REQUEST_MAX_REPLACEMENTS,
  LEAVE_REQUEST_MAX_YEAR,
  LEAVE_REQUEST_MIN_REPLACEMENTS,
  LEAVE_REQUEST_MIN_YEAR,
  LEAVE_REQUEST_REASON_MAX_LENGTH,
} from '../leave-request.constants';

/**
 * The per-field rules shared by the leave-request DTOs.
 *
 * The same split every module since Feature 007 uses: **constraints** live here,
 * **optionality** stays on the DTO, because `@IsOptional()` is what
 * distinguishes "create" from "patch" and has to be readable on the class it
 * applies to.
 *
 * `leaveTypeId` and `employeeId` are not here: they use the shared
 * `@IsRelationId()`, which Feature 013 moved into `common/decorators` precisely
 * so a fourth module would not write it again. Nor are `startDate` and
 * `endDate`, which use the shared `@IsIsoDateString()` for the same reason.
 */

/**
 * `replacementEmployeeIds` — who covers the work.
 *
 * Four rules, each doing something the others cannot:
 *
 * - **at least one**, which is the feature's stated rule and cannot be a schema
 *   constraint: a column cannot require a row in another table to exist.
 * - **at most a handful**, because each name costs a lookup and an overlap
 *   check, so the cap bounds the work one write can ask for.
 * - **no duplicates**, checked here rather than left to the composite primary
 *   key. The key would reject the second insert as a driver error surfacing as a
 *   `500`; this rejects the body as a `400` naming the field. Listing somebody
 *   twice is not a stronger nomination.
 * - **each a well-formed foreign key**, via `@IsRelationId({ each: true })`.
 *   Whether the person exists is a question for the service.
 */
export function IsLeaveReplacementIds() {
  return applyDecorators(
    ArrayMinSize(LEAVE_REQUEST_MIN_REPLACEMENTS),
    ArrayMaxSize(LEAVE_REQUEST_MAX_REPLACEMENTS),
    ArrayUnique(),
    IsRelationId({ each: true }),
  );
}

/**
 * `reason` — trimmed, and blank collapses to `null`.
 *
 * A cleared textarea posts `""`, which is not a shorter reason but the absence
 * of one; storing it verbatim would give the column two values meaning "empty"
 * and force every reader to check for both. The resulting `null` is skipped by
 * the `@IsOptional()` on the property, so clearing a reason is a valid request
 * rather than a failed `@IsString()`.
 */
export function IsLeaveRequestReason() {
  return applyDecorators(
    TrimToNull(),
    IsString(),
    MaxLength(LEAVE_REQUEST_REASON_MAX_LENGTH),
  );
}

/**
 * `decisionReason` — the same treatment, and the collapse to `null` matters more
 * here than it does for the employee's own reason.
 *
 * The field is **required** for `REJECTED` and `CANCELLED`, and that rule is
 * enforced in the service against the resolved status. Without the collapse, a
 * body carrying `"   "` would satisfy a presence check while telling the
 * employee nothing about why they were refused.
 */
export function IsLeaveDecisionReason() {
  return applyDecorators(
    TrimToNull(),
    IsString(),
    MaxLength(LEAVE_REQUEST_DECISION_REASON_MAX_LENGTH),
  );
}

/**
 * `year` — a whole calendar year inside the bounds a request may name.
 *
 * Coerced from text, because this only ever arrives as a query parameter, where
 * a number has no other way to travel. That is the opposite call the body DTOs
 * make, where `2026` and `"2026"` are genuinely different values and the string
 * is a payload the client should fix.
 */
export function IsLeaveRequestQueryYear() {
  return applyDecorators(
    Transform(({ value }: { value: unknown }) =>
      typeof value === 'string' ? Number(value) : value,
    ),
    IsInt(),
    Min(LEAVE_REQUEST_MIN_YEAR),
    Max(LEAVE_REQUEST_MAX_YEAR),
  );
}

/**
 * Trims a string and turns what is left of an empty one into `null`.
 *
 * Shared by the two free-text fields above rather than written twice, which is
 * the whole reason this file exists — the rule is identical and a second copy is
 * the one that eventually forgets the trim.
 */
function TrimToNull() {
  return Transform(({ value }: { value: unknown }) => {
    if (typeof value !== 'string') {
      return value;
    }

    const trimmed = value.trim();

    return trimmed.length === 0 ? null : trimmed;
  });
}
