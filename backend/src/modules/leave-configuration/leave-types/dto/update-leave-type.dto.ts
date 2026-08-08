import { IsBoolean, IsOptional } from 'class-validator';

import { ValidateIfPresent } from '../../../../common/decorators/validate-if-present.decorator';
import {
  IsLeaveTypeAllocatedDays,
  IsLeaveTypeCarryOverDays,
  IsLeaveTypeCode,
  IsLeaveTypeColor,
  IsLeaveTypeDescription,
  IsLeaveTypeIcon,
  IsLeaveTypeLabel,
  IsLeaveTypeReportMarker,
} from './leave-type-field.decorators';

/**
 * Body of `PATCH /api/v1/leave-types/:id`.
 *
 * Every field is optional, and an absent one means "leave it alone" — Prisma
 * omits `undefined` from the `UPDATE`, so a partial body never blanks a column
 * the client did not mention.
 *
 * `color`, `description` and `defaultAllocatedDays` are the nullable columns, so
 * they are the fields where an explicit `null` is a request ("clear it")
 * rather than a mistake. Everywhere else `@ValidateIfPresent()` turns `null`
 * into a `400` instead of letting `@IsOptional()` wave it through to a column
 * that cannot hold it.
 *
 * The constraints are the same objects `CreateLeaveTypeDto` uses; only the
 * optionality markers differ, which is the entire difference between creating
 * and patching. `code` and `label` are re-checked for uniqueness by the service
 * whenever the body mentions them.
 */
export class UpdateLeaveTypeDto {
  @ValidateIfPresent()
  @IsLeaveTypeCode()
  readonly code?: string;

  @ValidateIfPresent()
  @IsLeaveTypeLabel()
  readonly label?: string;

  /**
   * The glyph a report grid prints for a day of this leave.
   *
   * Editable, which is the half of the field that matters once the Feature 031
   * migration has derived one for every existing type: a marker chosen by an
   * algorithm is a starting point, not a decision. A company that finds its
   * medical leave printing as `M1` because `M` went to maternity leave changes
   * both here, on the leave-type screen, and every report follows.
   *
   * Re-checked for uniqueness by the service whenever the body mentions it,
   * exactly as `code` and `label` are. `@ValidateIfPresent()` rather than
   * `@IsOptional()`, because the column is NOT NULL: `null` is a `400` here
   * rather than a request to clear something that cannot be cleared.
   */
  @ValidateIfPresent()
  @IsLeaveTypeReportMarker()
  readonly reportMarker?: string;

  @ValidateIfPresent()
  @IsLeaveTypeIcon()
  readonly icon?: string;

  /** Nullable: `null` (or `""`) clears the accent colour. */
  @IsOptional()
  @IsLeaveTypeColor()
  readonly color?: string | null;

  /** Nullable: `null` (or `""`) clears the description. */
  @IsOptional()
  @IsLeaveTypeDescription()
  readonly description?: string | null;

  /**
   * Nullable: `null` withdraws the suggestion entirely, which is a different
   * request from `0` — "suggest no days" — and both are accepted.
   *
   * Changing it moves the number a future form is pre-filled with. It rewrites
   * no allocation anybody has already been granted, because this feature grants
   * none: the balances are a table the Leave Balances feature owns.
   */
  @IsOptional()
  @IsLeaveTypeAllocatedDays()
  readonly defaultAllocatedDays?: number | null;

  /**
   * Turning this on does not retroactively rescue days an earlier year-end
   * already expired, and turning it off does not reclaim days that survived one.
   * Both are true for the same reason: the policy is read once, when a year is
   * generated, and what it decided is recorded in that year's `expiredDays`.
   */
  @ValidateIfPresent()
  @IsBoolean()
  readonly allowsCarryOver?: boolean;

  /**
   * Nullable: `null` removes the ceiling entirely, which is a different request
   * from `0` — "carry over, but no days" — and both are accepted.
   */
  @IsOptional()
  @IsLeaveTypeCarryOverDays()
  readonly maxCarryOverDays?: number | null;

  @ValidateIfPresent()
  @IsBoolean()
  readonly requiresApproval?: boolean;

  @ValidateIfPresent()
  @IsBoolean()
  readonly isPaid?: boolean;

  @ValidateIfPresent()
  @IsBoolean()
  readonly isActive?: boolean;
}
