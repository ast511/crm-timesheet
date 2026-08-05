import {
  NotificationRecipientType,
  NotificationWorkspace,
} from '../../generated/prisma/enums';

/**
 * The notifications module's bounds, literals and — the one that does real work
 * — the table of legal addressings, in one place.
 */

/**
 * The heading, bounded at what fits on one line of a notification list.
 *
 * 150 rather than a round 255: a title longer than this is a message that has
 * been pasted into the wrong field, and truncating it in every client is worse
 * than refusing it once.
 */
export const NOTIFICATION_TITLE_MAX_LENGTH = 150;

/**
 * The body. Long enough for several paragraphs of an announcement, short enough
 * that no single row can carry a document — which this table is not for.
 */
export const NOTIFICATION_MESSAGE_MAX_LENGTH = 5000;

/** Bound on `?search=`, so a huge term cannot be pushed into a `LIKE` scan. */
export const NOTIFICATION_SEARCH_MAX_LENGTH = 100;

/**
 * Columns `?sortBy=` accepts.
 *
 * A closed list rather than a free string: the value reaches Prisma's `orderBy`
 * key, so anything not enumerated here must be rejected by validation before it
 * gets there.
 *
 * `priority` sorts by the enum's *declaration* order, which is why
 * `NotificationPriority` is declared low-to-high in `schema.prisma`:
 * `?sortBy=priority&sortOrder=desc` puts `HIGH` first because of that list, not
 * because of anything here.
 *
 * `isRead` is deliberately absent. Unread-first is what a reader wants, but it
 * is a *filter* — `?isRead=false` — rather than an ordering: sorting by it would
 * put the read ones on a later page instead of leaving them out, which is never
 * what the person asking meant.
 */
export const NOTIFICATION_SORT_FIELDS = [
  'createdAt',
  'priority',
  'title',
] as const;

export type NotificationSortField = (typeof NOTIFICATION_SORT_FIELDS)[number];

/**
 * Default ordering: newest first.
 *
 * This is the one list in the project that defaults to `desc`, and the reason is
 * what the resource is. Every other collection here is a register — employees,
 * projects, holidays — read in a stable order somebody chose. A notification
 * list is a feed: the row that matters most is the one that arrived last, and an
 * ascending default would open every inbox on its oldest message. The override
 * lives in `NotificationQueryDto` as a property initialiser, so it is visible
 * beside the shared default it departs from.
 */
export const DEFAULT_NOTIFICATION_SORT_FIELD: NotificationSortField =
  'createdAt';

/**
 * Which recipient types each workspace accepts — the feature's central rule,
 * written once as data rather than as four `if` statements.
 *
 * Four legal pairings out of eight possible ones:
 *
 * | Workspace        | Recipient type         | Addressed to |
 * | ---------------- | ---------------------- | ------------ |
 * | `PERSONAL`       | `USER`                 | one employee |
 * | `PERSONAL`       | `ALL_USERS`            | everybody |
 * | `ADMINISTRATIVE` | `ROLE`                 | one administrative role |
 * | `ADMINISTRATIVE` | `ADMINISTRATIVE_USERS` | every administrative user |
 *
 * The other four are refused. `PERSONAL`+`ROLE` would file a message addressed
 * to HR in employees' personal inboxes; `ADMINISTRATIVE`+`USER` would put a
 * message about one person in the back-office feed. Neither is a shape the two
 * list queries could serve, which is the point: the visibility filters in
 * `NotificationRepository` are built on the assumption that this table holds.
 *
 * Stated as a lookup keyed by workspace because that is how it is used — the
 * validator asks "what may this workspace hold" — and because a table cannot
 * fall out of step with itself the way a pair of `if` statements can.
 */
export const WORKSPACE_RECIPIENT_TYPES = {
  [NotificationWorkspace.PERSONAL]: [
    NotificationRecipientType.USER,
    NotificationRecipientType.ALL_USERS,
  ],
  [NotificationWorkspace.ADMINISTRATIVE]: [
    NotificationRecipientType.ROLE,
    NotificationRecipientType.ADMINISTRATIVE_USERS,
  ],
} as const satisfies Record<
  NotificationWorkspace,
  readonly NotificationRecipientType[]
>;

/**
 * The recipient type that requires `recipientUserId`, and the one that requires
 * `recipientRole`. Every other type requires neither and refuses both.
 *
 * Named rather than inlined so the rule and its two error messages quote the
 * same constant — the checks and the messages drifting apart is exactly how a
 * validator ends up naming the wrong field.
 */
export const USER_ADDRESSED_RECIPIENT_TYPE = NotificationRecipientType.USER;

export const ROLE_ADDRESSED_RECIPIENT_TYPE = NotificationRecipientType.ROLE;
