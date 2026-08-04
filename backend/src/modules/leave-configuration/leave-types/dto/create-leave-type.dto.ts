import { IsBoolean, IsOptional } from 'class-validator';

import {
  IsLeaveTypeAllocatedDays,
  IsLeaveTypeCode,
  IsLeaveTypeColor,
  IsLeaveTypeDescription,
  IsLeaveTypeIcon,
  IsLeaveTypeLabel,
} from './leave-type-field.decorators';

/**
 * Body of `POST /api/v1/leave-types`.
 *
 * `code`, `label` and `icon` are the only required fields. Every leave type is
 * shown in a list and on a calendar, so an icon is part of what one *is* rather
 * than a decoration to be filled in later — which is why it is required while
 * `color` is not.
 *
 * `requiresApproval`, `isPaid` and `isActive` are left to the schema's `true`
 * defaults rather than repeated here, so "a new leave type is approved, paid and
 * available" stays one decision made in one place.
 *
 * Unknown properties never reach this class — the global `ValidationPipe` runs
 * with `forbidNonWhitelisted`, so a typo in a payload is a 400 rather than a
 * silently ignored field.
 */
export class CreateLeaveTypeDto {
  @IsLeaveTypeCode()
  readonly code!: string;

  @IsLeaveTypeLabel()
  readonly label!: string;

  @IsLeaveTypeIcon()
  readonly icon!: string;

  /** Nullable: `null` (or `""`) means "no accent colour". */
  @IsOptional()
  @IsLeaveTypeColor()
  readonly color?: string | null;

  /** Nullable: `null` (or `""`) means "no description". */
  @IsOptional()
  @IsLeaveTypeDescription()
  readonly description?: string | null;

  /**
   * A suggestion for the form HR fills in when it grants this leave, never an
   * allocation. Omitting it — or sending `null` — says the type suggests
   * nothing, which is what medical leave granted against a certificate does;
   * `0` would instead claim a suggestion of zero days.
   */
  @IsOptional()
  @IsLeaveTypeAllocatedDays()
  readonly defaultAllocatedDays?: number | null;

  @IsOptional()
  @IsBoolean()
  readonly requiresApproval?: boolean;

  @IsOptional()
  @IsBoolean()
  readonly isPaid?: boolean;

  @IsOptional()
  @IsBoolean()
  readonly isActive?: boolean;
}
