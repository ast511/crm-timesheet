import { NotificationCategory } from '../../generated/prisma/enums';
import { NOTIFICATION_TITLE_MAX_LENGTH } from '../notifications/notification.constants';

/**
 * The delivery engine's literals, bounds and schedules, in one place.
 */

/** What produced a delivery. The engine has three sources. */
export enum DeliverySource {
  /** A `NotificationCampaign` somebody composed — manual or scheduled. */
  Campaign = 'CAMPAIGN',
  /** A `Reminder` rule the scheduler decided was due today. */
  Reminder = 'REMINDER',
  /**
   * Something that happened in another module and is worth telling somebody
   * about — a timesheet submitted, approved or rejected.
   *
   * The third source, added by Feature 030, and the first that is not *stored*
   * anywhere: a campaign and a reminder are rows somebody configured, while an
   * event is a moment. It is delivered as it happens, by the module it happened
   * in, through {@link NotificationDispatcher.executeEvent} — which is the seam
   * Feature 028 said would exist "when the timesheet and leave features want to
   * announce something", written by the caller that needed it.
   */
  Event = 'EVENT',
}

/**
 * The two sources whose category is a property of the *mechanism*.
 *
 * An event is deliberately not among them — see {@link DELIVERY_CATEGORIES}.
 */
export type StoredDeliverySource =
  DeliverySource.Campaign | DeliverySource.Reminder;

/**
 * Which notification category each *stored* source produces.
 *
 * A table rather than a ternary, for the reason `WORKSPACE_RECIPIENT_TYPES` is
 * one: the day a fourth source exists, this is the line that has to change and
 * the type makes forgetting it a build error.
 *
 * A campaign is `GENERAL` — planned maintenance, a company meeting, an office
 * closure: things that come from nowhere in the system and are simply announced.
 * A reminder is `REMINDER`, the category Feature 026 created for exactly this and
 * which nothing had written until Feature 028. Neither is `SYSTEM`, which
 * describes something the application did to itself rather than something a
 * person said.
 *
 * **An event names its own category and is therefore absent from this table.**
 * `NotificationCategory` says what a notification is *about*, and for an event
 * that is the event — a timesheet announcement is `TIMESHEET`, a leave decision
 * would be `LEAVE` — not the fact that the engine delivered it. A row here would
 * have to be one category for every event this application will ever raise, which
 * is precisely the grouping the category exists to avoid.
 */
export const DELIVERY_CATEGORIES = {
  [DeliverySource.Campaign]: NotificationCategory.GENERAL,
  [DeliverySource.Reminder]: NotificationCategory.REMINDER,
} as const satisfies Record<StoredDeliverySource, NotificationCategory>;

/**
 * What a truncated heading ends with.
 *
 * A single character rather than three dots, so it costs one of the 150 the title
 * has rather than three.
 */
const ELLIPSIS = '…';

/**
 * Turns a campaign or reminder `subject` into a notification `title`.
 *
 * **This resolves the seam Feature 027 named and deliberately left open.** A
 * `subject` may be 200 characters and `notifications.title` is bounded at 150, so
 * the engine either truncates or the notification centre's shipped contract
 * widens. It truncates, for three reasons:
 *
 *  - the 150 is a statement about what fits on one line of an inbox, and that is
 *    still true — widening it would make the bound describe nothing;
 *  - a client that renders a notification list has already been written against
 *    150, and changing a published contract for the benefit of a feature written
 *    afterwards is the wrong direction for the change to travel;
 *  - nothing is lost. The full text goes out in the email, and the campaign row
 *    keeps the subject exactly as it was typed — this affects the *heading of a
 *    delivered notification*, not the announcement.
 *
 * The ellipsis is the point: a heading cut at exactly 150 characters reads as a
 * sentence somebody forgot to finish, while one that says it was cut reads as a
 * heading with more behind it. Which is true — the body is right underneath.
 */
export function toNotificationTitle(subject: string): string {
  if (subject.length <= NOTIFICATION_TITLE_MAX_LENGTH) {
    return subject;
  }

  return `${subject.slice(0, NOTIFICATION_TITLE_MAX_LENGTH - ELLIPSIS.length).trimEnd()}${ELLIPSIS}`;
}

/**
 * How many due campaigns one scheduler tick sends.
 *
 * A bound rather than "all of them", so a scheduler that wakes to a backlog — an
 * instance that was down for a day, a batch scheduled for one minute — does some
 * work now and the rest on the next tick, instead of holding one long run during
 * which nothing else the engine does can proceed. The remainder is not lost: it
 * is still `SCHEDULED` and still due, so the next tick finds it.
 */
export const DUE_CAMPAIGN_BATCH_SIZE = 25;

/**
 * When the engine looks for campaigns whose schedule has arrived.
 *
 * Every minute, which is the resolution `scheduledAt` is worth having: an
 * administrator schedules an announcement for 09:00, and a minute either side of
 * that is indistinguishable from on time. A tighter tick would be a query per
 * second to answer a question whose answer changes at the granularity of an
 * afternoon.
 */
export const DUE_CAMPAIGN_CRON = '* * * * *';

/**
 * When the engine decides which reminder rules are due.
 *
 * Once a day, early enough that "your timesheet is due in 3 days" arrives before
 * the working day rather than during it. Daily rather than hourly is what makes
 * "a rule fires once per day" a property of the schedule instead of a duplicate
 * check the engine would otherwise have to keep: `daysBeforeDeadline` is a whole
 * number of days, so a rule is due on a *date*, and asking twice on the same date
 * could only produce the same reminder twice.
 *
 * 07:00 in the server's timezone. Timezone-aware scheduling is a decision for the
 * day this application has more than one — see the feature document.
 */
export const REMINDER_CRON = '0 7 * * *';

/**
 * `NOTIFICATION_SCHEDULER_ENABLED` — whether this deployment runs the two ticks.
 *
 * The switch every scheduled job needs and for the same reason `SMTP_ENABLED`
 * exists: a staging copy of production holds real employee addresses and real
 * campaigns, and it must be able to run the API without a cron quietly announcing
 * a maintenance window to the whole company. It does not disable the engine —
 * `POST /notification-delivery/execute/:campaignId` still works, because that is
 * somebody deliberately asking — it disables the *clock*.
 */
export const SCHEDULER_ENABLED_KEY = 'NOTIFICATION_SCHEDULER_ENABLED';
