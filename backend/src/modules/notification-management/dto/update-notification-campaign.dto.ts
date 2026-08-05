import { IsBoolean, IsEnum, IsIn, IsOptional } from 'class-validator';

import { IsIsoDateString } from '../../../common/decorators/is-iso-date-string.decorator';
import { ValidateIfPresent } from '../../../common/decorators/validate-if-present.decorator';
import {
  CampaignRecipientType,
  NotificationCampaignStatus,
  NotificationPriority,
  NotificationType,
} from '../../../generated/prisma/enums';
import { CLIENT_WRITABLE_CAMPAIGN_STATUSES } from '../notification-management.constants';
import {
  IsCampaignEmployeeIds,
  IsNotificationMessage,
  IsNotificationSubject,
} from './notification-management-field.decorators';

/**
 * Body of `PATCH /api/v1/notification-campaigns/:id`.
 *
 * Accepted **only while the campaign is `DRAFT` or `SCHEDULED`**. A `SENT`
 * campaign is read-only because its notifications are already in people's
 * inboxes — editing the stored announcement would leave it disagreeing with what
 * was actually delivered — and a `CANCELLED` one because cancelling is a
 * decision rather than a pause. Both answer a `409` naming the status, the same
 * call `LeaveRequestsService` makes for a request that has been decided.
 *
 * Every field is optional, and an absent one means "leave it alone". The two
 * dates are the nullable columns and therefore the fields where an explicit
 * `null` is a request ("clear it") rather than a mistake; on the others
 * `@ValidateIfPresent()` turns `null` into a `400` instead of letting
 * `@IsOptional()` wave it through to a `NOT NULL` column.
 *
 * **Scheduling and unscheduling happen through `scheduledAt`, not `status`.**
 * Setting it makes the campaign `SCHEDULED`, clearing it with `null` returns it
 * to `DRAFT`, and the derivation is the same one `POST` applies — so the two can
 * never contradict each other and there is no body that says "scheduled, with
 * nothing to fire at".
 */
export class UpdateNotificationCampaignDto {
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
   * The two delivery switches, judged **against the stored pair**: sending
   * `{ "sendEmail": false }` on a campaign that already has
   * `sendNotification: false` is the failing case, and neither field is wrong on
   * its own.
   */
  @ValidateIfPresent()
  @IsBoolean()
  readonly sendEmail?: boolean;

  @ValidateIfPresent()
  @IsBoolean()
  readonly sendNotification?: boolean;

  /** Nullable: `null` unschedules the campaign and returns it to `DRAFT`. */
  @IsOptional()
  @IsIsoDateString()
  readonly scheduledAt?: string | null;

  /** Nullable: `null` removes the expiry. */
  @IsOptional()
  @IsIsoDateString()
  readonly expiresAt?: string | null;

  /**
   * The one status a client may write, and the only value this field accepts.
   *
   * `@IsIn(CLIENT_WRITABLE_CAMPAIGN_STATUSES)` rather than
   * `@IsEnum(NotificationCampaignStatus)`, which is what keeps the derivation
   * above honest: `DRAFT` and `SCHEDULED` are decided by `scheduledAt`, so
   * accepting them here would be a second way to state one fact, and `SENT` is
   * the delivery engine's record that it ran — a client that could write it
   * would be claiming an announcement had gone out when nothing had.
   *
   * Cancelling is terminal. A cancelled campaign can no longer be patched, so
   * there is no way back through this field; composing the announcement again is
   * a new campaign, which is the honest record of what happened.
   */
  @ValidateIfPresent()
  @IsIn(CLIENT_WRITABLE_CAMPAIGN_STATUSES)
  readonly status?: typeof NotificationCampaignStatus.CANCELLED;

  /**
   * The audience, replaced **wholesale** when it is sent.
   *
   * Sending `recipientType` replaces every recipient the campaign had; omitting
   * it leaves them untouched. There is no "add one" or "remove one" endpoint,
   * and that is deliberate: the rule is "either one `ALL_EMPLOYEES` entry or a
   * set of named employees, never both", which is a statement about the set.
   * Judged one nomination at a time, removing the last one would have to be
   * refused by a rule that read as if it were about that person rather than
   * about the campaign — the same argument `UpdateLeaveRequestDto` makes for its
   * replacements.
   *
   * `employeeIds` on its own is a `400`: without a recipient type there is no
   * way to tell a corrected list of names from a switch to `ALL_EMPLOYEES` that
   * forgot to drop them.
   */
  @ValidateIfPresent()
  @IsEnum(CampaignRecipientType)
  readonly recipientType?: CampaignRecipientType;

  @IsOptional()
  @IsCampaignEmployeeIds()
  readonly employeeIds?: string[];
}
