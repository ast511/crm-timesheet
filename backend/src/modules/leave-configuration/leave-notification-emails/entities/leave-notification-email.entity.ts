import { toIsoTimestamp } from '../../../../common/utils/date.util';
import type { Prisma } from '../../../../generated/prisma/client';
import type { LeaveNotificationEmailModel } from '../../../../generated/prisma/models';

/**
 * A leave notification address as the API exposes it.
 *
 * `id` is published because it is the value `PATCH` and `DELETE
 * /leave-notification-emails/:id` need — a client cannot address a row it has no
 * way to name.
 *
 * `updatedAt` is published here and is absent from `TimesheetApprovalEmailEntity`
 * for one reason: that collection has no `PATCH`, so a row's only timestamp is
 * the moment it was added. This one can be corrected, so "when was this address
 * last changed" is a question with an answer worth returning.
 */
export class LeaveNotificationEmailEntity {
  id!: string;
  email!: string;
  createdAt!: string;
  updatedAt!: string;
}

/**
 * The columns every query in `LeaveNotificationEmailsService` reads.
 *
 * `satisfies Prisma.LeaveNotificationEmailSelect` checks the keys against the
 * model without widening the constant, so a column renamed in `schema.prisma`
 * breaks the build here instead of at runtime.
 */
export const LEAVE_NOTIFICATION_EMAIL_PUBLIC_SELECT = {
  id: true,
  email: true,
  createdAt: true,
  updatedAt: true,
} as const satisfies Prisma.LeaveNotificationEmailSelect;

/** A row read through {@link LEAVE_NOTIFICATION_EMAIL_PUBLIC_SELECT}. */
export type LeaveNotificationEmailRow = Pick<
  LeaveNotificationEmailModel,
  keyof typeof LEAVE_NOTIFICATION_EMAIL_PUBLIC_SELECT
>;

/** Maps a `leave_notification_emails` row onto the resource returned. */
export function toLeaveNotificationEmailEntity(
  notificationEmail: LeaveNotificationEmailRow,
): LeaveNotificationEmailEntity {
  return {
    id: notificationEmail.id,
    email: notificationEmail.email,
    createdAt: toIsoTimestamp(notificationEmail.createdAt),
    updatedAt: toIsoTimestamp(notificationEmail.updatedAt),
  };
}
