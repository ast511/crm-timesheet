import {
  toIsoTimestamp,
  toNullableIsoTimestamp,
} from '../../../common/utils/date.util';
import type { Prisma } from '../../../generated/prisma/client';
import type {
  NotificationCategory,
  NotificationPriority,
  NotificationRecipientType,
  NotificationType,
  NotificationWorkspace,
  UserRole,
} from '../../../generated/prisma/enums';
import type { NotificationModel } from '../../../generated/prisma/models';

/**
 * A notification as every endpoint exposes it.
 *
 * One shape for all of them — the two lists, the single read, and the temporary
 * `POST` — because the resource is genuinely the same everywhere and a second
 * shape would only be an invitation for the two to disagree about what a
 * notification is.
 *
 * Two differences from the `notifications` row:
 *
 * 1. **The dates are strings**, ISO-8601, which is what the client actually
 *    receives once the body is serialised.
 * 2. **Nothing is joined in.** `recipientUserId` stays an id rather than
 *    becoming a nested `recipientUser` object, which is the opposite of what
 *    `LeaveRequestEntity` does with its foreign keys. The reason is who reads
 *    it: on `GET /notifications` that id is always either the caller's own or
 *    null, so resolving it to a name would be a join per row to tell somebody
 *    who they are. The `POST` response is where the field carries information,
 *    and there an id is exactly what the caller sent.
 *
 * **The addressing columns are published**, which is worth stating because the
 * project's rule is that a response never repeats a scope the caller already
 * named. They survive that rule because these lists genuinely *mix*: a personal
 * page interleaves `USER` rows with `ALL_USERS` broadcasts, and a client has to
 * be able to tell them apart — that distinction is what explains why marking a
 * broadcast read affects everybody, and why deleting one removes it for
 * everybody. `workspace` is published for the same reason a `GET` of a created
 * resource echoes what was stored: `POST` accepts it, so the response has to
 * confirm it.
 */
export interface NotificationEntity {
  id: string;
  workspace: NotificationWorkspace;
  recipientType: NotificationRecipientType;
  /** Set only for `USER` notifications; null for role notifications and broadcasts. */
  recipientUserId: string | null;
  /** Set only for `ROLE` notifications; one of the three administrative roles. */
  recipientRole: UserRole | null;
  title: string;
  message: string;
  category: NotificationCategory;
  type: NotificationType;
  priority: NotificationPriority;
  isRead: boolean;
  /** When it was read, or null while it is unread. Moves with `isRead`, never alone. */
  readAt: string | null;
  createdAt: string;
  updatedAt: string;
}

/**
 * The columns every read of this table selects.
 *
 * A `select` rather than an `include`, and the choice does real work even though
 * this row joins to only one table: `include` on `recipientUser` would return
 * every column of `users` — `passwordHash` among them — and would go on
 * publishing every column added to that table later. Selecting the foreign key
 * and stopping there means the join is never made at all.
 *
 * `satisfies Prisma.NotificationSelect` checks the keys against the model
 * without widening the constant, so a column renamed in `schema.prisma` breaks
 * the build here instead of at runtime.
 */
export const NOTIFICATION_PUBLIC_SELECT = {
  id: true,
  workspace: true,
  recipientType: true,
  recipientUserId: true,
  recipientRole: true,
  title: true,
  message: true,
  category: true,
  type: true,
  priority: true,
  isRead: true,
  readAt: true,
  createdAt: true,
  updatedAt: true,
} as const satisfies Prisma.NotificationSelect;

/**
 * A row read through {@link NOTIFICATION_PUBLIC_SELECT}.
 *
 * Spelled as a `Pick` of the model rather than as a free-standing interface, so
 * a `select` left off a query produces a row the mapper will not accept — the
 * same compile-time trip-wire every module here uses.
 */
export type NotificationRow = Pick<
  NotificationModel,
  keyof typeof NOTIFICATION_PUBLIC_SELECT
>;

/** Maps a row onto the resource every endpoint returns. */
export function toNotificationEntity(
  notification: NotificationRow,
): NotificationEntity {
  return {
    id: notification.id,
    workspace: notification.workspace,
    recipientType: notification.recipientType,
    recipientUserId: notification.recipientUserId,
    recipientRole: notification.recipientRole,
    title: notification.title,
    message: notification.message,
    category: notification.category,
    type: notification.type,
    priority: notification.priority,
    isRead: notification.isRead,
    readAt: toNullableIsoTimestamp(notification.readAt),
    createdAt: toIsoTimestamp(notification.createdAt),
    updatedAt: toIsoTimestamp(notification.updatedAt),
  };
}
