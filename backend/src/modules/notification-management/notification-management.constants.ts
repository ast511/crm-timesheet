import { NotificationCampaignStatus } from '../../generated/prisma/enums';

/**
 * The notification-management module's bounds, literals and sortable columns, in
 * one place.
 *
 * The text columns are unbounded `text`, so these lengths are an API-level
 * contract rather than a schema mirror: they keep a payload from carrying a
 * megabyte of prose into a column no screen can render, and they are the values
 * a form's `maxlength` should be generated from.
 *
 * The content bounds are shared by **both** resources rather than declared per
 * resource, because a reminder's wording and a campaign's are the same kind of
 * text written by the same people on the same kind of screen. Two copies would
 * mean an announcement that fits a reminder being refused as a campaign.
 */

/**
 * `subject` — the heading, on a reminder and on a campaign alike.
 *
 * **200, and the notification centre's `title` is 150.** That is not an
 * oversight and it is not harmless: the Notification Delivery Engine will copy
 * this value into `notifications.title`, so a 200-character subject has no room
 * to land in. The mismatch is recorded here and in the feature document rather
 * than papered over — resolving it is either a truncation rule (the engine's
 * decision to make, when it exists) or a widening of
 * `NOTIFICATION_TITLE_MAX_LENGTH`, which would edit a shipped contract for the
 * benefit of a feature not yet written. The specified 200 is stored; the seam is
 * named.
 */
export const NOTIFICATION_SUBJECT_MAX_LENGTH = 200;

/**
 * `message` — the body.
 *
 * The same 5000 the notification centre bounds `notifications.message` at, and
 * the agreement is load-bearing rather than coincidental: the delivery engine
 * copies this text straight across, so a campaign allowed more than the centre
 * accepts would be a campaign that could never be delivered. Restated here
 * rather than imported, because this module owns what a campaign may say; the
 * feature document records that the two have to move together.
 */
export const NOTIFICATION_MESSAGE_MAX_LENGTH = 5000;

/** Bound on `?search=`, so a huge term cannot be pushed into a `LIKE` scan. */
export const NOTIFICATION_MANAGEMENT_SEARCH_MAX_LENGTH = 100;

/** `Timesheet due in 3 days` — a name a person scans in a list, not a sentence. */
export const REMINDER_NAME_MAX_LENGTH = 100;

export const REMINDER_DESCRIPTION_MAX_LENGTH = 500;

/**
 * Bounds on `daysBeforeDeadline`.
 *
 * The minimum is the rule the feature states, and `0` is deliberately legal
 * rather than merely tolerated: "your timesheet is due **today**" is the
 * reminder people actually act on. A negative offset is not a reminder after the
 * deadline — it is a data-entry mistake, and a rule that fired after the thing
 * it warns about would be worse than no rule.
 *
 * The maximum is a calendar year, and it is not cosmetic. The column is a
 * PostgreSQL `integer`, so a value past 2^31-1 would be rejected by the driver
 * as a `500` rather than by validation as a `400` naming the field. No deadline
 * this application knows about is announced more than a year ahead.
 */
export const REMINDER_MIN_DAYS_BEFORE_DEADLINE = 0;

export const REMINDER_MAX_DAYS_BEFORE_DEADLINE = 366;

/**
 * How many employees one campaign may name.
 *
 * The minimum is the feature's rule — a campaign with no recipients is an
 * announcement addressed to nobody — and it cannot be a schema constraint: a
 * column cannot require a row in another table to exist.
 *
 * The maximum bounds the work one write can ask for, since every id costs a
 * lookup and a row. It is deliberately not "the number of employees": a campaign
 * that names everybody should say `ALL_EMPLOYEES`, which is one row and stays
 * correct as people join and leave. Hitting this cap is the signal that the
 * wrong recipient type was chosen.
 */
export const CAMPAIGN_MIN_RECIPIENTS = 1;

export const CAMPAIGN_MAX_RECIPIENTS = 200;

/**
 * Columns `?sortBy=` accepts on `/reminders`.
 *
 * A closed list rather than a free string: the value reaches Prisma's `orderBy`
 * key, so anything not enumerated here must be rejected by validation before it
 * gets there.
 *
 * `priority` sorts by the enum's *declaration* order, which is why
 * `NotificationPriority` is declared low-to-high in `schema.prisma`.
 *
 * `enabled`, `sendEmail` and `sendNotification` are filterable but not sortable:
 * ordering a list by a two-valued column groups it rather than sorts it, which
 * is what the filters and the tie-break already do, and better.
 */
export const REMINDER_SORT_FIELDS = [
  'createdAt',
  'priority',
  'subject',
] as const;

export type ReminderSortField = (typeof REMINDER_SORT_FIELDS)[number];

/**
 * Columns `?sortBy=` accepts on `/notification-campaigns`.
 *
 * The reminder list's three, plus `scheduledAt` — the column that only exists
 * here, and the one an administrator watching for what goes out next actually
 * wants.
 *
 * `scheduledAt` is nullable, so PostgreSQL's null ordering shows through: a
 * `DRAFT` campaign has no schedule and sorts last ascending, first descending.
 * That is stated rather than corrected, because both ends are defensible and
 * imposing one would be this API inventing an opinion the database does not
 * have.
 */
export const CAMPAIGN_SORT_FIELDS = [
  'createdAt',
  'priority',
  'subject',
  'scheduledAt',
] as const;

export type CampaignSortField = (typeof CAMPAIGN_SORT_FIELDS)[number];

/**
 * Default ordering column for both lists.
 *
 * `createdAt` rather than `subject` or `name`, which is the opposite of the call
 * `LeaveType` makes with its unique `label`. The difference is what the rows
 * are: leave types are a vocabulary somebody scans alphabetically, while these
 * two are registers of things people composed, where "what was set up, in the
 * order it was set up" is the reading that needs no explanation.
 *
 * The *direction* is the shared ascending default, deliberately not the
 * descending one the notification centre takes. That override exists because an
 * inbox is a feed whose newest row is the one that matters; these are
 * administrative registers, and a second list departing from the project-wide
 * default would make "which way does this endpoint sort" a question a client has
 * to ask per endpoint.
 */
export const DEFAULT_REMINDER_SORT_FIELD: ReminderSortField = 'createdAt';

export const DEFAULT_CAMPAIGN_SORT_FIELD: CampaignSortField = 'createdAt';

/**
 * The statuses a campaign may still be edited in — the feature's rule, written
 * once as data rather than as a pair of comparisons.
 *
 * `SENT` is excluded because its notifications are already in people's inboxes:
 * editing the stored announcement would leave it disagreeing with what was
 * actually delivered, and no later reader could tell which of the two had been
 * seen. `CANCELLED` is excluded because cancelling is a decision rather than a
 * pause — reviving a cancelled campaign by patching it would erase the record
 * that somebody called it off.
 */
export const EDITABLE_CAMPAIGN_STATUSES = [
  NotificationCampaignStatus.DRAFT,
  NotificationCampaignStatus.SCHEDULED,
] as const;

/**
 * The statuses a **client** may write directly. Exactly one.
 *
 * `DRAFT` and `SCHEDULED` are absent because they are derived from
 * `scheduledAt`, so accepting them would be a second way to state one fact.
 * `SENT` is absent because it is the delivery engine's record that it ran; a
 * client that could write it would be claiming an announcement had gone out when
 * nothing had.
 *
 * A list of one rather than a bare constant, because it is what `@IsIn()` takes
 * and because the day a second client-writable status exists — a `PAUSED`, say —
 * this is the line that changes.
 */
export const CLIENT_WRITABLE_CAMPAIGN_STATUSES = [
  NotificationCampaignStatus.CANCELLED,
] as const;

/**
 * The statuses the delivery engine may send a campaign from.
 *
 * The same two values as {@link EDITABLE_CAMPAIGN_STATUSES} and deliberately a
 * separate list, because they state different rules that happen to coincide
 * today: one says which campaigns an administrator may still change, the other
 * which the engine may still deliver. A future `PAUSED` status would belong to
 * the first and not the second, and a single shared constant would make that a
 * silent change to both.
 *
 * It is what makes "never send duplicate notifications" enforceable rather than
 * hoped for: {@link NotificationCampaignService.markSent} moves a campaign to
 * `SENT` only *from* one of these, in one conditional statement, so a second
 * delivery attempt — a retried request, an overlapping scheduler tick, a second
 * instance — updates no row and is refused.
 */
export const SENDABLE_CAMPAIGN_STATUSES = [
  NotificationCampaignStatus.DRAFT,
  NotificationCampaignStatus.SCHEDULED,
] as const;

/**
 * The one status a campaign cannot be deleted in.
 *
 * A `SENT` campaign is the record of an announcement people have already
 * received; deleting it would remove the only explanation for notifications
 * still sitting in their inboxes. Everything else — a draft abandoned, a
 * schedule thought better of, a campaign called off — may go.
 */
export const UNDELETABLE_CAMPAIGN_STATUS = NotificationCampaignStatus.SENT;
