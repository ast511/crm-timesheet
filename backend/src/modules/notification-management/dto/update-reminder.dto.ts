import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsOptional,
  Max,
  Min,
} from 'class-validator';

import { ValidateIfPresent } from '../../../common/decorators/validate-if-present.decorator';
import {
  NotificationPriority,
  NotificationType,
} from '../../../generated/prisma/enums';
import {
  REMINDER_MAX_DAYS_BEFORE_DEADLINE,
  REMINDER_MIN_DAYS_BEFORE_DEADLINE,
} from '../notification-management.constants';
import {
  IsNotificationMessage,
  IsNotificationSubject,
  IsReminderDescription,
  IsReminderName,
} from './notification-management-field.decorators';

/**
 * Body of `PATCH /api/v1/reminders/:id`.
 *
 * Every field is optional, and an absent one means "leave it alone" — Prisma
 * omits `undefined` from the `UPDATE`, so a partial body never blanks a column
 * the client did not mention.
 *
 * `description` is the one nullable column and therefore the one field where an
 * explicit `null` is a request ("clear it") rather than a mistake; on the others
 * `@ValidateIfPresent()` turns `null` into a `400` instead of letting
 * `@IsOptional()` wave it through to a `NOT NULL` column.
 *
 * **Enabling and disabling a reminder is this endpoint**, with
 * `{ "enabled": false }`. There is no `POST /reminders/:id/disable`, and that is
 * deliberate: `enabled` is a property of the rule rather than an event in its
 * life, so a sub-resource would be a second way to write one column — the rule
 * Feature 015 recorded. The notification centre's `PATCH /:id/read` is the
 * contrasting case: marking read also writes `readAt` from the server's clock,
 * so it is an *action* with a consequence the caller cannot state.
 *
 * There is no `createdAt` or `updatedAt` either; both are the database's to
 * write.
 */
export class UpdateReminderDto {
  @ValidateIfPresent()
  @IsReminderName()
  readonly name?: string;

  /** Nullable: `null` (or `""`) clears the description. */
  @IsOptional()
  @IsReminderDescription()
  readonly description?: string | null;

  @ValidateIfPresent()
  @IsBoolean()
  readonly enabled?: boolean;

  @ValidateIfPresent()
  @Type(() => Number)
  @IsInt()
  @Min(REMINDER_MIN_DAYS_BEFORE_DEADLINE)
  @Max(REMINDER_MAX_DAYS_BEFORE_DEADLINE)
  readonly daysBeforeDeadline?: number;

  @ValidateIfPresent()
  @IsNotificationSubject()
  readonly subject?: string;

  @ValidateIfPresent()
  @IsNotificationMessage()
  readonly message?: string;

  @ValidateIfPresent()
  @IsEnum(NotificationType)
  readonly severity?: NotificationType;

  @ValidateIfPresent()
  @IsEnum(NotificationPriority)
  readonly priority?: NotificationPriority;

  /**
   * The two delivery switches, judged **against the stored pair**.
   *
   * Sending `{ "sendEmail": false }` on a reminder that already has
   * `sendNotification: false` is the failing case, and neither field is wrong on
   * its own — which is exactly why the rule cannot live on this class. The
   * service merges the patch into the stored row and refuses the result.
   */
  @ValidateIfPresent()
  @IsBoolean()
  readonly sendEmail?: boolean;

  @ValidateIfPresent()
  @IsBoolean()
  readonly sendNotification?: boolean;
}
