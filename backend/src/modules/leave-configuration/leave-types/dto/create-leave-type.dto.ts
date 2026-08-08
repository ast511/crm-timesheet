import { IsBoolean, IsOptional } from 'class-validator';

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

  /**
   * The glyph a report grid prints for a day of this leave — `C`, `M`, `S`.
   *
   * **Required**, and it is the fourth required field rather than something
   * derived from `code`. Deriving it would produce a collision the moment a
   * company added a second type beginning with the same letter, and the
   * resolution — silently handing one of them `AN` — would be a marker nobody
   * chose appearing on every printed report. The one place a derivation *is*
   * applied is the Feature 031 migration, which had rows with no answer at all
   * and needed a deterministic one.
   *
   * Unique across leave types; the service checks it beside `code` and `label`.
   */
  @IsLeaveTypeReportMarker()
  readonly reportMarker!: string;

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

  /**
   * Whether days left at the end of a year may still be taken in the next one.
   *
   * Left to the schema's `false` default rather than repeated here, which is the
   * conservative direction: a type carries nothing over until somebody says it
   * does. Annual leave is what this is for; medical leave is granted against a
   * certificate, so there is nothing to carry.
   */
  @IsOptional()
  @IsBoolean()
  readonly allowsCarryOver?: boolean;

  /**
   * The ceiling on what survives one year-end. Omitting it — or sending `null` —
   * means no ceiling, which is a different policy from a ceiling of `0`.
   *
   * Read only when `allowsCarryOver` is `true`; on a type that carries nothing
   * over it bounds something that never happens.
   */
  @IsOptional()
  @IsLeaveTypeCarryOverDays()
  readonly maxCarryOverDays?: number | null;

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
