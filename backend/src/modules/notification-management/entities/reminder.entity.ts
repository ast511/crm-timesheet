import { toIsoTimestamp } from '../../../common/utils/date.util';
import type { Prisma } from '../../../generated/prisma/client';
import type {
  NotificationPriority,
  NotificationType,
} from '../../../generated/prisma/enums';
import type { ReminderModel } from '../../../generated/prisma/models';

/**
 * A reminder rule as every endpoint exposes it.
 *
 * One shape for all of them — the list, the single read, the create and the
 * patch — because the resource is genuinely the same everywhere and a second
 * shape would only be an invitation for the two to disagree about what a
 * reminder is.
 *
 * Every column is published. There is nothing internal on this table: a reminder
 * is configuration somebody typed, and the screen that maintains it needs every
 * field back to render the form it will patch. The only difference from the row
 * is that the dates are ISO-8601 strings, which is what the client actually
 * receives once the body is serialised.
 *
 * **`severity` is a `NotificationType`**, the enum the notification centre
 * stores in `notifications.type`. The field is named for what it is to a
 * reminder and typed by where it ends up; a client rendering both resources
 * matches one vocabulary against one set of colours.
 */
export interface ReminderEntity {
  id: string;
  name: string;
  description: string | null;
  enabled: boolean;
  /** Days before the deadline. `0` is the deadline itself. */
  daysBeforeDeadline: number;
  subject: string;
  message: string;
  severity: NotificationType;
  priority: NotificationPriority;
  sendEmail: boolean;
  sendNotification: boolean;
  createdAt: string;
  updatedAt: string;
}

/**
 * The columns every read of this table selects.
 *
 * A `select` rather than an `include`, so a column added to `reminders` later is
 * published deliberately rather than by default. `satisfies Prisma.ReminderSelect`
 * checks the keys against the model without widening the constant, so a column
 * renamed in `schema.prisma` breaks the build here instead of at runtime.
 */
export const REMINDER_PUBLIC_SELECT = {
  id: true,
  name: true,
  description: true,
  enabled: true,
  daysBeforeDeadline: true,
  subject: true,
  message: true,
  severity: true,
  priority: true,
  sendEmail: true,
  sendNotification: true,
  createdAt: true,
  updatedAt: true,
} as const satisfies Prisma.ReminderSelect;

/**
 * A row read through {@link REMINDER_PUBLIC_SELECT}.
 *
 * Spelled as a `Pick` of the model rather than as a free-standing interface, so
 * a `select` left off a query produces a row the mapper will not accept — the
 * same compile-time trip-wire every module here uses.
 */
export type ReminderRow = Pick<
  ReminderModel,
  keyof typeof REMINDER_PUBLIC_SELECT
>;

/** Maps a row onto the resource every endpoint returns. */
export function toReminderEntity(reminder: ReminderRow): ReminderEntity {
  return {
    id: reminder.id,
    name: reminder.name,
    description: reminder.description,
    enabled: reminder.enabled,
    daysBeforeDeadline: reminder.daysBeforeDeadline,
    subject: reminder.subject,
    message: reminder.message,
    severity: reminder.severity,
    priority: reminder.priority,
    sendEmail: reminder.sendEmail,
    sendNotification: reminder.sendNotification,
    createdAt: toIsoTimestamp(reminder.createdAt),
    updatedAt: toIsoTimestamp(reminder.updatedAt),
  };
}
