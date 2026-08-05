import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsOptional,
  Max,
  Min,
} from 'class-validator';

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
 * Body of `POST /api/v1/reminders`.
 *
 * A reminder is a **rule**, not a message that goes out: creating one schedules
 * nothing, sends nothing and writes no notification. The Notification Delivery
 * Engine reads these rows and decides when a deadline is `daysBeforeDeadline`
 * away; this endpoint only records what the company wants.
 *
 * **What this class deliberately does not check** is that at least one of
 * `sendEmail` / `sendNotification` is true. That is a rule about two fields at
 * once, and on a `PATCH` it has to be judged against the state the patch would
 * leave behind rather than against the fields the body happens to carry — so it
 * lives in the service, where both cases can be answered by one function. The
 * same call `CreateNotificationDto` makes for its addressing rules.
 *
 * Nor does it check that the name is free: that is a question for the database.
 */
export class CreateReminderDto {
  /**
   * What the rule is called. Unique across reminders, case-insensitively — the
   * service checks it and reports a `409`.
   */
  @IsReminderName()
  readonly name!: string;

  /** Why the rule exists, for whoever opens this screen next year and wonders. */
  @IsOptional()
  @IsReminderDescription()
  readonly description?: string | null;

  /**
   * Whether the engine should act on this rule.
   *
   * Defaulted to `true` as a property initialiser — the technique every DTO in
   * this project uses — because a reminder somebody has just configured is one
   * they want. Creating a disabled reminder stays possible by saying so.
   */
  @IsOptional()
  @IsBoolean()
  readonly enabled: boolean = true;

  /**
   * How many days before the deadline the reminder goes out.
   *
   * `0` is the deadline itself and is a deliberate value rather than a
   * degenerate one — "your timesheet is due today" is the reminder people act
   * on. Negatives are refused: a reminder after the thing it warns about is a
   * data-entry mistake, not a late reminder.
   *
   * `@Type(() => Number)` is not applied. This arrives in a JSON body, where a
   * number has a representation of its own, so `7` and `"7"` are genuinely
   * different values and the string is a payload the client should fix — the
   * opposite call the query DTOs make, where everything is text by construction.
   */
  @Type(() => Number)
  @IsInt()
  @Min(REMINDER_MIN_DAYS_BEFORE_DEADLINE)
  @Max(REMINDER_MAX_DAYS_BEFORE_DEADLINE)
  readonly daysBeforeDeadline!: number;

  /** The heading the engine will copy into whatever it produces. */
  @IsNotificationSubject()
  readonly subject!: string;

  /** The body, plain text. */
  @IsNotificationMessage()
  readonly message!: string;

  /**
   * How the reminder is drawn and how loudly it asks.
   *
   * `severity` is a `NotificationType` — the enum the notification centre stores
   * in `notifications.type` — rather than a second enum of the same four values,
   * so the delivery engine copies the value across instead of translating
   * between two vocabularies. Both carry the same defaults the centre uses.
   */
  @IsOptional()
  @IsEnum(NotificationType)
  readonly severity: NotificationType = NotificationType.INFO;

  @IsOptional()
  @IsEnum(NotificationPriority)
  readonly priority: NotificationPriority = NotificationPriority.MEDIUM;

  /**
   * How the reminder reaches people. At least one must be true, which the
   * service enforces.
   *
   * The defaults are asymmetric on purpose: an in-app notification is cheap and
   * expected, while email leaves the system and lands in an inbox somebody has
   * to clear, so it is the one that has to be asked for.
   */
  @IsOptional()
  @IsBoolean()
  readonly sendEmail: boolean = false;

  @IsOptional()
  @IsBoolean()
  readonly sendNotification: boolean = true;
}
