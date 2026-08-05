import {
  IsEnum,
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

import {
  ADMINISTRATIVE_ROLES,
  AdministrativeRole,
} from '../../../common/constants/role.constants';
import { IsRelationId } from '../../../common/decorators/is-relation-id.decorator';
import { Trim } from '../../../common/decorators/trim.decorator';
import {
  NotificationCategory,
  NotificationPriority,
  NotificationRecipientType,
  NotificationType,
  NotificationWorkspace,
} from '../../../generated/prisma/enums';
import {
  NOTIFICATION_MESSAGE_MAX_LENGTH,
  NOTIFICATION_TITLE_MAX_LENGTH,
} from '../notification.constants';

/**
 * Body of `POST /api/v1/notifications`.
 *
 * **This endpoint is temporary.** It exists so the notification centre can be
 * exercised before anything produces notifications; the Notification Delivery
 * Engine will create them from events — a leave request approved, an import
 * finished — and this route goes away when it does. The DTO is written properly
 * anyway, because the *shape* it validates is the shape the delivery engine will
 * write, and a lax placeholder would let a malformed row into the table that
 * every later reader would have to cope with.
 *
 * **What this class deliberately does not check** is the relationship between
 * `workspace`, `recipientType`, `recipientUserId` and `recipientRole`. Those
 * four fields have to agree — only four of the eight workspace/recipient
 * pairings are legal, and which of the two id fields is required depends on the
 * pairing — and that is a rule about several fields at once, judged against a
 * resolved combination. `NotificationService.create` enforces it, which is the
 * same call `LeaveRequestsService` makes for `decisionReason`: class-validator
 * can state "this field is an enum", not "these four fields form one of four
 * legal shapes", and splitting the rule across both layers would leave neither
 * able to state it completely.
 */
export class CreateNotificationDto {
  /**
   * Which inbox the notification is filed in.
   *
   * Required and not defaulted. A notification is written for employees or for
   * the back office, and guessing which would put administrative messages in
   * everybody's personal list — the one mistake this field exists to prevent.
   */
  @IsEnum(NotificationWorkspace)
  readonly workspace!: NotificationWorkspace;

  /** How the notification names its audience. Required, for the same reason. */
  @IsEnum(NotificationRecipientType)
  readonly recipientType!: NotificationRecipientType;

  /**
   * The one account addressed.
   *
   * Optional *here* and conditionally required by the service: mandatory when
   * `recipientType` is `USER`, refused otherwise. Marked `@IsOptional()` rather
   * than `@ValidateIfPresent()` because omitting it is the normal case for three
   * of the four recipient types.
   *
   * A `users.id`, not an `employees.id`. An account is what a person signs in
   * with, and not every account has an employment record — a super-admin created
   * to administer the system is the obvious case.
   */
  @IsOptional()
  @IsRelationId()
  readonly recipientUserId?: string;

  /**
   * The one administrative role addressed.
   *
   * `@IsIn(ADMINISTRATIVE_ROLES)` rather than `@IsEnum(UserRole)`, which is the
   * whole reason the column's wider type is safe: `USER` is a `UserRole` and is
   * not a role a notification may be addressed to — an `ADMINISTRATIVE` message
   * aimed at every ordinary employee is a contradiction, and `ALL_USERS` in the
   * personal workspace is how you actually reach them.
   */
  @IsOptional()
  @IsIn(ADMINISTRATIVE_ROLES)
  readonly recipientRole?: AdministrativeRole;

  /** The heading. Trimmed first, so `"   "` is rejected as empty rather than stored. */
  @Trim()
  @IsString()
  @IsNotEmpty()
  @MaxLength(NOTIFICATION_TITLE_MAX_LENGTH)
  readonly title!: string;

  /** The body, plain text. */
  @Trim()
  @IsString()
  @IsNotEmpty()
  @MaxLength(NOTIFICATION_MESSAGE_MAX_LENGTH)
  readonly message!: string;

  /**
   * What the notification is about, how it looks, and how loudly it asks.
   *
   * All three carry their default as a property initialiser — the technique
   * every DTO in this project uses — so an absent field leaves the initialiser
   * in place and the service never applies a fallback of its own. The defaults
   * describe an ordinary informational notice of normal importance, which is
   * what a caller who said nothing meant.
   *
   * `category` and `type` are separate fields answering separate questions:
   * where it came from, and how urgent it looks. A rejected leave request is
   * `LEAVE` + `ERROR`; a finished import is `SYSTEM` + `SUCCESS`. Folding them
   * into one field would make "every leave notification" unanswerable.
   */
  @IsOptional()
  @IsEnum(NotificationCategory)
  readonly category: NotificationCategory = NotificationCategory.GENERAL;

  @IsOptional()
  @IsEnum(NotificationType)
  readonly type: NotificationType = NotificationType.INFO;

  @IsOptional()
  @IsEnum(NotificationPriority)
  readonly priority: NotificationPriority = NotificationPriority.MEDIUM;
}
