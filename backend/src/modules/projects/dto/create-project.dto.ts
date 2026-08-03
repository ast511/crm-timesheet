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
 * Body of `POST /api/v1/projects`.
 *
 * Four fields are required — `code`, `name`, `clientName` and `estimatedHours`
 * — and the last of those is worth a note, because the column carries a
 * `@default(0)`. The default is the *database's* answer for rows written
 * outside this API (the seed, a future import); over HTTP the number is asked
 * for, so "not estimated yet" is a deliberate `0` rather than an omission
 * nobody notices.
 *
 * `isArchived`, `projectStatus` and `projectPriority` are the opposite case:
 * their defaults (`false`, `ACTIVE` and `MEDIUM`) describe what a newly created
 * project *is*, so they are left to the schema rather than repeated here, and
 * each stays one decision made in one place.
 *
 * Whether `endDate` falls on or after `startDate` is not checked here. It is a
 * rule about two fields at once, and on `PATCH` it has to be answered against
 * the values already stored — so it lives in the service, where both halves are
 * available. This class only checks the shape of what arrived.
 *
 * Unknown properties never reach it: the global `ValidationPipe` runs with
 * `forbidNonWhitelisted`, so a typo in a payload is a 400 rather than a silently
 * ignored field.
 */
export class CreateProjectDto {
  @IsProjectCode()
  readonly code!: string;

  @IsProjectName()
  readonly name!: string;

  @IsProjectClientName()
  readonly clientName!: string;

  /** Optional, and a blank value is stored as `null` rather than as `""`. */
  @IsOptional()
  @IsProjectDescription()
  readonly description?: string | null;

  @IsProjectEstimatedHours()
  readonly estimatedHours!: number;

  /** Optional accent; blank clears it, anything else must be `#RRGGBB`. */
  @IsOptional()
  @IsProjectColor()
  readonly color?: string | null;

  /**
   * Omitted, the schema's `false` applies. `null` is not the same request and
   * is rejected — the column is not nullable, so it has nothing to store.
   */
  @ValidateIfPresent()
  @IsBoolean()
  readonly isArchived?: boolean;

  /** Omitted, the schema's `ACTIVE` applies; `null` is rejected, as above. */
  @ValidateIfPresent()
  @IsProjectStatus()
  readonly projectStatus?: ProjectStatus;

  /** Omitted, the schema's `MEDIUM` applies; `null` is rejected, as above. */
  @ValidateIfPresent()
  @IsProjectPriority()
  readonly projectPriority?: ProjectPriority;

  /** A project may be planned before its dates are known; both are nullable. */
  @IsOptional()
  @IsProjectDate()
  readonly startDate?: string | null;

  @IsOptional()
  @IsProjectDate()
  readonly endDate?: string | null;
}
