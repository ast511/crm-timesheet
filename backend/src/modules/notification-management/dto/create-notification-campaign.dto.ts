import { IsBoolean, IsEnum, IsOptional } from 'class-validator';

import { IsIsoDateString } from '../../../common/decorators/is-iso-date-string.decorator';
import {
  CampaignRecipientType,
  NotificationPriority,
  NotificationType,
} from '../../../generated/prisma/enums';
import {
  IsCampaignEmployeeIds,
  IsNotificationMessage,
  IsNotificationSubject,
} from './notification-management-field.decorators';

/**
 * Body of `POST /api/v1/notification-campaigns`.
 *
 * **Creating a campaign sends nothing.** No email leaves the system, no
 * notification is written, no socket is opened and no job is scheduled: this
 * stores the announcement, its audience and how it should eventually be
 * delivered. The Notification Delivery Engine is what turns a stored campaign
 * into notifications people can read.
 *
 * **There is no `status` field, and sending one is a `400`.** The status is
 * derived: a body carrying `scheduledAt` produces a `SCHEDULED` campaign, one
 * without produces a `DRAFT`. Accepting both would let a client claim
 * `SCHEDULED` with nothing to fire at — two fields stating one fact, and the
 * engine would have to decide which of them it believed. It is the same call
 * `CreateLeaveRequestDto` makes: a status is a conclusion the server draws, not
 * a value the caller picks. `SENT` in particular is the engine's record that it
 * ran, and a client that could write it would be claiming an announcement had
 * gone out when nothing had.
 *
 * **There is no `sentAt` and no `createdByEmployeeId` either.** The first is the
 * engine's; the second is who is calling, taken from `@CurrentUser()`. Putting
 * the author in the body would make "who wrote this" a value a client chooses
 * per request, which is exactly what it stopped being when Feature 032 made the
 * caller an authenticated account. The global
 * `ValidationPipe` runs with `forbidNonWhitelisted`, so a client that tries any
 * of the four is told rather than having the field silently ignored.
 *
 * **What this class deliberately does not check** are the three rules about
 * several fields at once: that `employeeIds` is required for `EMPLOYEE` and
 * refused for `ALL_EMPLOYEES`, that at least one delivery method is chosen, and
 * that `expiresAt` is later than `scheduledAt`. class-validator can state "this
 * field is a date", not "these two dates are in this order"; the service judges
 * all three against the resolved body, and reports every problem at once.
 */
export class CreateNotificationCampaignDto {
  /** The heading. */
  @IsNotificationSubject()
  readonly subject!: string;

  /** The body, plain text. */
  @IsNotificationMessage()
  readonly message!: string;

  /**
   * How the announcement is drawn and how loudly it asks.
   *
   * `severity` is a `NotificationType` — the enum the notification centre stores
   * in `notifications.type` — so the delivery engine copies the value across
   * rather than translating between two vocabularies of the same four words.
   */
  @IsOptional()
  @IsEnum(NotificationType)
  readonly severity: NotificationType = NotificationType.INFO;

  @IsOptional()
  @IsEnum(NotificationPriority)
  readonly priority: NotificationPriority = NotificationPriority.MEDIUM;

  /**
   * How it reaches people. At least one must be true, which the service
   * enforces; the defaults are the same asymmetric pair a reminder carries.
   */
  @IsOptional()
  @IsBoolean()
  readonly sendEmail: boolean = false;

  @IsOptional()
  @IsBoolean()
  readonly sendNotification: boolean = true;

  /**
   * When the engine should send it. Absent means a draft nobody has scheduled.
   *
   * Must be in the future, which the service checks against the server's clock
   * rather than the client's: a campaign scheduled for a moment that has already
   * passed is either a mistake or a request to send immediately, and the two are
   * worth telling apart before an announcement goes to the whole company.
   *
   * An ISO-8601 string, kept as a string and parsed once in the service — see
   * `@IsIsoDateString()` for why converting here would accept `01/13/2020`, a
   * format whose meaning depends on which side of the Atlantic reads it.
   */
  @IsOptional()
  @IsIsoDateString()
  readonly scheduledAt?: string;

  /**
   * When the announcement stops being worth showing. Absent means it never goes
   * stale.
   *
   * Must be later than `scheduledAt` when both are given — an expiry at or
   * before the send is a campaign that is over before it begins — and later than
   * now when it is the only one of the two, since a draft that has already
   * expired can never be sent usefully. Both comparisons are the service's.
   */
  @IsOptional()
  @IsIsoDateString()
  readonly expiresAt?: string;

  /**
   * How the campaign names its audience.
   *
   * Required and not defaulted. "One employee" and "everybody" are different
   * announcements, and guessing between them would either spam the company or
   * quietly deliver a company-wide notice to one person.
   */
  @IsEnum(CampaignRecipientType)
  readonly recipientType!: CampaignRecipientType;

  /**
   * The people addressed, for an `EMPLOYEE` campaign.
   *
   * Required by the service when `recipientType` is `EMPLOYEE` — one id or many,
   * which is the whole difference between the feature's "one employee" and
   * "multiple employees" cases — and **refused** for `ALL_EMPLOYEES`, where a
   * list would contradict the recipient type it was sent with. Marked
   * `@IsOptional()` here because omitting it is correct for one of the two types.
   *
   * `employees.id`, not `users.id`: a campaign is announced to the people who
   * work here, and the screen that composes one picks names from the employee
   * directory.
   */
  @IsOptional()
  @IsCampaignEmployeeIds()
  readonly employeeIds?: string[];
}
