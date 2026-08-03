import { IsBoolean, IsOptional } from 'class-validator';

import { ValidateIfPresent } from '../../../common/decorators/validate-if-present.decorator';
import {
  ProjectPriority,
  ProjectStatus,
} from '../../../generated/prisma/enums';
import {
  IsProjectClientName,
  IsProjectCode,
  IsProjectColor,
  IsProjectDate,
  IsProjectDescription,
  IsProjectEstimatedHours,
  IsProjectName,
  IsProjectPriority,
  IsProjectStatus,
} from './project-field.decorators';

/**
 * Body of `PATCH /api/v1/projects/:id`.
 *
 * Every field is optional, and an absent one means "leave it alone" — Prisma
 * omits `undefined` from the `UPDATE`, so a partial body never blanks a column
 * the client did not mention. An explicit `null` on one of the four nullable
 * fields is the way to clear it, which is a different request from omitting it.
 *
 * Note which fields carry `@ValidateIfPresent()` and which carry
 * `@IsOptional()`: `description`, `color`, `startDate` and `endDate` are the
 * nullable columns, so they are the only fields where `null` is a value rather
 * than a mistake. Everywhere else `null` is a `400`, because `@IsOptional()`
 * alone would skip the constraints and let it through to a column that cannot
 * hold it.
 *
 * `isArchived` stays editable in both directions on purpose: archiving is a
 * state a project moves into and back out of, and — the rule this feature
 * states — an archived project remains editable like any other. Nothing in this
 * class or in the service treats `isArchived: true` as read-only.
 */
export class UpdateProjectDto {
  @ValidateIfPresent()
  @IsProjectCode()
  readonly code?: string;

  @ValidateIfPresent()
  @IsProjectName()
  readonly name?: string;

  @ValidateIfPresent()
  @IsProjectClientName()
  readonly clientName?: string;

  /** Nullable: `null` (or `""`) clears the description. */
  @IsOptional()
  @IsProjectDescription()
  readonly description?: string | null;

  @ValidateIfPresent()
  @IsProjectEstimatedHours()
  readonly estimatedHours?: number;

  /** Nullable: `null` (or `""`) removes the accent. */
  @IsOptional()
  @IsProjectColor()
  readonly color?: string | null;

  @ValidateIfPresent()
  @IsBoolean()
  readonly isArchived?: boolean;

  /**
   * Free to move in any direction. A cancelled project can be reopened and a
   * completed one reclassified — this module records the state somebody chose,
   * it does not police the transitions between them. A lifecycle state machine
   * is a policy decision, and one nobody has asked for yet.
   */
  @ValidateIfPresent()
  @IsProjectStatus()
  readonly projectStatus?: ProjectStatus;

  @ValidateIfPresent()
  @IsProjectPriority()
  readonly projectPriority?: ProjectPriority;

  /**
   * Nullable, and the reason the service resolves the range rather than reading
   * it off this object: patching only `endDate` has to be compared against the
   * `startDate` already stored, and clearing `startDate` has to lift the
   * constraint instead of failing against a value that is no longer there.
   */
  @IsOptional()
  @IsProjectDate()
  readonly startDate?: string | null;

  @IsOptional()
  @IsProjectDate()
  readonly endDate?: string | null;
}
