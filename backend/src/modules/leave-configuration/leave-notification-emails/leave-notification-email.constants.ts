/**
 * The leave-notification-emails module's literals, in one place.
 *
 * There is no length constant for `email`: what an address may weigh is a
 * property of email itself rather than of this resource, so it lives in
 * `common/constants/email.constants.ts` and reaches this module through
 * `@IsEmailAddress()`.
 */

/** Bound on `?search=`, so a huge term cannot be pushed into a `LIKE` scan. */
export const LEAVE_NOTIFICATION_EMAIL_SEARCH_MAX_LENGTH = 100;

/**
 * Columns `?sortBy=` accepts.
 *
 * A closed list rather than a free string: the value reaches Prisma's `orderBy`
 * key, so anything not enumerated here must be rejected by validation before it
 * gets there.
 */
export const LEAVE_NOTIFICATION_EMAIL_SORT_FIELDS = [
  'email',
  'createdAt',
] as const;

export type LeaveNotificationEmailSortField =
  (typeof LEAVE_NOTIFICATION_EMAIL_SORT_FIELDS)[number];

/**
 * Default ordering column.
 *
 * `email` rather than `createdAt`: it is unique, so the order is total and a
 * record can never shift between two pages of the same listing — and a list of
 * addresses is something a person reads alphabetically, not in the order
 * somebody happened to add them.
 */
export const DEFAULT_LEAVE_NOTIFICATION_EMAIL_SORT_FIELD: LeaveNotificationEmailSortField =
  'email';
