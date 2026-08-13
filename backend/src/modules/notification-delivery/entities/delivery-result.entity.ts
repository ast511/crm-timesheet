import { DeliverySource } from '../notification-delivery.constants';

/**
 * What happened to the email half of a delivery.
 *
 * Three values rather than a boolean, because "no email was asked for" and "an
 * email was asked for and the mail server refused it" are different facts and a
 * `false` would say the same thing about both.
 */
export enum EmailDeliveryStatus {
  /** Every recipient's message was accepted by the SMTP server. */
  Sent = 'SENT',
  /** `sendEmail` was false, or the audience resolved to nobody. */
  Skipped = 'SKIPPED',
  /** The mail server refused or could not be reached. The log has the reason. */
  Failed = 'FAILED',
}

/**
 * What one delivery run did — the response of the manual execution endpoint and
 * the line the scheduler logs.
 *
 * It is a *report*, not a resource: nothing is addressable by its id and nothing
 * is stored. That is deliberate for now and named in the feature document as the
 * obvious next step — a per-campaign delivery report belongs beside `sentAt`, on
 * the campaign, and needs a table.
 *
 * The three counts are separate because they can legitimately differ:
 * `recipientCount` is who the audience resolved to, `notificationsCreated` is
 * `0` when `sendNotification` is false, and `emailsSent` is `0` when `sendEmail`
 * is false — so a campaign that reached forty people by email and none in-app is
 * describable rather than looking like a partial failure.
 */
export class DeliveryResultEntity {
  readonly source!: DeliverySource;
  /** The campaign that was sent, or null for a reminder or an event run. */
  readonly campaignId!: string | null;
  /** The reminder rule that fired, or null for a campaign or an event. */
  readonly reminderId!: string | null;
  /**
   * Which application event was announced — `timesheet_rejected` — or null for a
   * campaign or a reminder.
   *
   * A key rather than an id, because an event has no stored row to point at: it
   * is something that *happened* in another module, announced as it happened. The
   * key is what a log line and a template are both named by. Added by Feature 030.
   */
  readonly eventKey!: string | null;
  /**
   * How many people the audience resolved to at this moment.
   *
   * `0` on a delivery addressed to a *workspace* rather than to people — an
   * administrative broadcast is one notification row that every administrator
   * reads, so there is no list of recipients to count. `notificationsCreated`
   * says `1` there, which together are the honest description.
   */
  readonly recipientCount!: number;
  readonly notificationsCreated!: number;
  readonly emailsSent!: number;
  readonly emailStatus!: EmailDeliveryStatus;
  /** When the run happened, ISO-8601. For a campaign this is its `sentAt`. */
  readonly sentAt!: string;
}
