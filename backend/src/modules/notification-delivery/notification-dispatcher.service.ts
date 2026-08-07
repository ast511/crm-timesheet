import {
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';

import { toIsoTimestamp } from '../../common/utils/date.util';
import { NotificationRecipientType } from '../../generated/prisma/enums';
import { EmailException } from '../email/email.exception';
import { EmailService } from '../email/email.service';
import { CampaignDelivery } from '../notification-management/notification-campaign.service';
import { SENDABLE_CAMPAIGN_STATUSES } from '../notification-management/notification-management.constants';
import { ReminderRow } from '../notification-management/entities/reminder.entity';
import { CreateNotificationDto } from '../notifications/dto/create-notification.dto';
import { NotificationService } from '../notifications/notification.service';
import {
  DeliveryResultEntity,
  EmailDeliveryStatus,
} from './entities/delivery-result.entity';
import {
  DeliveryPlan,
  EventDelivery,
  NotificationDeliveryRepository,
} from './notification-delivery.repository';
import { renderNotificationEmail } from './notification-email.template';

/**
 * The one way a notification is ever delivered.
 *
 * **Every notification this application produces passes through this service.**
 * Nothing else creates a delivery, sends a notification email or announces one
 * over a socket: the manual endpoint calls it, the campaign tick calls it, the
 * reminder tick calls it, and whatever the timesheet and leave features
 * eventually want to announce will call it too. That rule is what makes the
 * business rules in this feature — never a duplicate email, never a duplicate
 * notification, never a duplicate event — statements about one code path rather
 * than promises repeated at every producer.
 *
 * What it does *not* do is as important:
 *
 * | It does not | Because |
 * | --- | --- |
 * | write a `notifications` row | `NotificationService` owns the addressing rules |
 * | open an SMTP connection | `EmailService` is the only component that sends mail |
 * | touch a socket | `NotificationGateway` is the only component that emits |
 * | decide *when* | the two schedulers do, and the endpoint is a person deciding |
 * | query a table | the repository is the seam, and the owning modules answer |
 *
 * It orchestrates, and every step of the orchestration is a call to the module
 * that owns the answer. What is left here is the part nobody else can own: the
 * order of the steps, and what to do when one of them fails.
 *
 * Three decisions worth naming:
 *
 * 1. **A campaign is claimed before anything is delivered, and after the audience
 *    is resolved.** The claim is a conditional `UPDATE` to `SENT` — see
 *    `NotificationCampaignService.markSent` — so two runs racing over one campaign
 *    end with one delivery and one `409`. Resolving the audience first means a
 *    failure to read the directory leaves the campaign unclaimed and retryable,
 *    while claiming first would burn it.
 * 2. **Notifications are created before emails are sent, and an email failure
 *    does not undo them.** A notification is in the inbox the moment it is
 *    written; an email is a copy of the same message that may or may not be
 *    accepted by a server this application does not run. Rolling back a delivered
 *    notification because a mail server was down would make the outage worse, and
 *    retrying would then send a second one. The result says `emailStatus:
 *    FAILED`, the log carries the provider's own account of it, and the
 *    notification stands.
 * 3. **An audience that resolves to nobody is a successful delivery of nothing.**
 *    A campaign addressed to three people who have all left is not an error to
 *    raise at whoever pressed the button; it is a campaign that reached zero
 *    people, which is what the result says.
 */
@Injectable()
export class NotificationDispatcher {
  private readonly logger = new Logger(NotificationDispatcher.name);

  constructor(
    private readonly deliveries: NotificationDeliveryRepository,
    private readonly notifications: NotificationService,
    private readonly email: EmailService,
  ) {}

  /**
   * Sends one stored campaign, now.
   *
   * The entry point of `POST /notification-delivery/execute/:campaignId` and of
   * the scheduler's due-campaign tick, so a campaign that goes out because
   * somebody pressed a button and one that goes out because its schedule arrived
   * are the same run with the same rules.
   *
   * Four refusals, in the order a caller can act on them:
   *
   * | Situation | Answer |
   * | --- | --- |
   * | no such campaign | `404` |
   * | already `SENT`, or `CANCELLED` | `409` naming the status |
   * | `expiresAt` has passed | `409` — see below |
   * | claimed by another run in between | `409` |
   *
   * **An expired campaign is refused rather than sent**, and this is where
   * Feature 027's open question — "what an expiry means is the engine's decision"
   * — is answered. `expiresAt` is when an announcement stops being worth showing;
   * delivering one past that moment would put a notification in a thousand
   * inboxes that was, by the author's own statement, already stale. A campaign
   * that missed its window needs a person to look at it, so it stays `SCHEDULED`
   * and says why.
   */
  async executeCampaign(campaignId: string): Promise<DeliveryResultEntity> {
    const campaign = await this.deliveries.findCampaign(campaignId);

    if (campaign === null) {
      throw new NotFoundException(
        `Notification campaign ${campaignId} was not found`,
      );
    }

    assertSendable(campaign);

    const plan = await this.deliveries.buildCampaignPlan(campaign);
    const sentAt = new Date();

    if (!(await this.deliveries.claimCampaign(campaign.id, sentAt))) {
      throw new ConflictException(
        `Campaign ${campaign.id} is already being sent, or has just been sent by another run`,
      );
    }

    return this.deliver(plan, sentAt);
  }

  /**
   * Sends one reminder rule the scheduler has decided is due today.
   *
   * There is no campaign to claim and none to mark sent, because a reminder run
   * writes no campaign row — see
   * `NotificationDeliveryRepository.buildReminderPlan`. What stops a rule firing
   * twice is that it is due on a *date* and the scheduler asks once a day; the
   * feature document records that this is the guarantee, and what it does not
   * cover.
   */
  async executeReminder(reminder: ReminderRow): Promise<DeliveryResultEntity> {
    const plan = await this.deliveries.buildReminderPlan(reminder);

    return this.deliver(plan, new Date());
  }

  /**
   * Announces something that just happened in another module.
   *
   * **The seam Feature 028 said would exist** — "when the timesheet and leave
   * features want to announce something, by importing this module then" — written
   * by the caller that needed it. Feature 030 is that caller: a timesheet
   * submitted, approved, rejected or gone stale.
   *
   * There is nothing to look up and nothing to claim, which is the whole
   * difference from {@link executeCampaign}. A campaign is a stored row two runs
   * can race over, so it is claimed by a conditional `UPDATE`; an event is a
   * moment, and what stops it being announced twice is that the module raising it
   * does so inside a state transition guarded on the current status. That
   * guarantee belongs with the transition — see `TimesheetService.approve`, which
   * announces only when its own `updateMany` moved exactly one row — and
   * duplicating it here would be a second gate that eventually disagreed with the
   * first.
   *
   * It therefore has no refusals of its own. An event about something that has
   * already happened cannot be "too late" the way a campaign can be expired, and
   * an audience that resolves to nobody is a successful delivery of nothing.
   */
  async executeEvent(event: EventDelivery): Promise<DeliveryResultEntity> {
    const plan = await this.deliveries.buildEventPlan(event);

    return this.deliver(plan, new Date());
  }

  /**
   * Executes a plan: notifications first, then email, then the report.
   *
   * The two channels are independent — a campaign may use either, both or,
   * because the API refuses it, neither — and each is skipped without a query
   * when it was not asked for. Nothing here emits a WebSocket event: creating the
   * notifications does that, through the publisher `NotificationService` calls,
   * which is what keeps one notification to one `notification.created` however it
   * came to exist.
   */
  private async deliver(
    plan: DeliveryPlan,
    sentAt: Date,
  ): Promise<DeliveryResultEntity> {
    const notificationsCreated = await this.createNotifications(plan);
    const { emailsSent, emailStatus } = await this.sendEmails(plan);

    this.logger.log(
      `${plan.source}${plan.eventKey === null ? '' : ` ${plan.eventKey}`} ` +
        `delivery reached ${plan.targets.length} recipient(s): ` +
        `${notificationsCreated} notification(s), ${emailsSent} email(s) (${emailStatus})`,
    );

    return {
      source: plan.source,
      campaignId: plan.campaignId,
      reminderId: plan.reminderId,
      eventKey: plan.eventKey,
      recipientCount: plan.targets.length,
      notificationsCreated,
      emailsSent,
      emailStatus,
      sentAt: toIsoTimestamp(sentAt),
    };
  }

  /**
   * Writes one notification per recipient, or none at all.
   *
   * **One row per person rather than a single `ALL_USERS` broadcast**, and that
   * is the most consequential decision this method makes. Feature 026 records a
   * known limitation: a broadcast is one row with one `isRead` flag, so the first
   * person to open a company announcement marks it read for everybody and
   * deleting it removes it for everybody. Fanning out per person avoids that
   * entirely — each employee's copy is theirs to read, dismiss and count — and it
   * is what makes `notification.unreadCount` a number about one person rather
   * than about the row they happened to share.
   *
   * The cost is stated rather than hidden: a company of a thousand people is a
   * thousand rows for one announcement. They are written by one statement, they
   * are what an inbox is made of, and the alternative is a read flag that lies.
   *
   * **The one exception is a delivery addressed to a workspace**, which Feature
   * 030 introduced: an `ADMINISTRATIVE_USERS` event writes exactly *one* row with
   * no recipient, and fanning it out would be wrong rather than merely wasteful.
   * The argument that makes a fan-out right for a campaign is that each employee
   * should own their copy — read it, dismiss it, count it. Administrative review
   * is the opposite: "a timesheet is waiting" is one piece of work that one
   * administrator picks up, and three copies would leave the other two chasing a
   * month a colleague has already approved. Feature 026's shared `isRead` is a
   * limitation for an announcement and exactly the semantics wanted here.
   *
   * Everything goes through `NotificationService.createMany`, never the table, so
   * the four-combination addressing rule is enforced by the module that owns it
   * however a notification comes to exist.
   */
  private async createNotifications(plan: DeliveryPlan): Promise<number> {
    if (!plan.sendNotification) {
      return 0;
    }

    const dtos = isBroadcast(plan)
      ? [toBroadcastNotificationDto(plan)]
      : plan.targets.map((target) => toNotificationDto(plan, target.userId));

    if (dtos.length === 0) {
      return 0;
    }

    const created = await this.notifications.createMany(dtos);

    return created.length;
  }

  /**
   * Sends one email per recipient, and never lets a mail failure lose a delivery.
   *
   * `EmailService.sendMany` is Feature 025's, unchanged: one message per person
   * rather than a shared `To`, so nobody learns who else was notified. It is
   * sequential and stops at the first failure, which is the behaviour that module
   * documents and the email-queue feature will replace.
   *
   * `EmailException` is caught here rather than propagated, and it is the one
   * exception this class swallows. Feature 025 asks every caller that must not
   * fail when mail fails to make exactly this catch: the notifications are
   * already in people's inboxes and the campaign is already `SENT`, so turning
   * the run into a `500` would report a delivery that happened as one that did
   * not — and invite a retry that the claim would refuse anyway.
   *
   * `emailsSent` is the size of the audience on success and `0` on failure. It is
   * honest about what it does not know: `sendMany` stops at the first refusal
   * without saying which, so the run cannot claim a partial number it would be
   * guessing at. Per-recipient outcomes arrive with the email queue.
   */
  private async sendEmails(plan: DeliveryPlan): Promise<{
    emailsSent: number;
    emailStatus: EmailDeliveryStatus;
  }> {
    if (!plan.sendEmail || plan.emailRecipients.length === 0) {
      return { emailsSent: 0, emailStatus: EmailDeliveryStatus.Skipped };
    }

    try {
      await this.email.sendMany({
        recipients: [...plan.emailRecipients],
        ...renderNotificationEmail(plan.subject, plan.message),
      });

      return {
        emailsSent: plan.emailRecipients.length,
        emailStatus: EmailDeliveryStatus.Sent,
      };
    } catch (error) {
      if (!(error instanceof EmailException)) {
        throw error;
      }

      // No recipient and no subject: both are personal data once notifications
      // exist, and the provider's own error — already logged by `EmailService` —
      // is what identifies the problem.
      this.logger.error(
        `${plan.source} delivery was announced but its emails could not be sent`,
      );

      return { emailsSent: 0, emailStatus: EmailDeliveryStatus.Failed };
    }
  }
}

/**
 * Whether this plan is one row for a whole workspace rather than one row per
 * person.
 *
 * The two recipient types Feature 026 calls broadcasts are exactly the two that
 * carry a null recipient, so the question is the same one either way. Only
 * `ADMINISTRATIVE_USERS` is produced here today; `ALL_USERS` is included because
 * the property being tested is "addressed to nobody in particular", and a check
 * that named one value would silently fan the other out.
 */
function isBroadcast(plan: DeliveryPlan): boolean {
  return (
    plan.recipientType === NotificationRecipientType.ADMINISTRATIVE_USERS ||
    plan.recipientType === NotificationRecipientType.ALL_USERS
  );
}

/**
 * One notification, addressed to one account.
 *
 * `PERSONAL` + `USER` is what a campaign, a reminder and an employee-addressed
 * event all produce, and both halves are deliberate. Personal, because those are
 * things the company tells *an employee about themselves and their work* — the
 * back-office workspace is for what administrators need to act on, and filing an
 * office closure there would put it in front of three people instead of
 * everybody. `USER`, because the row is one person's copy: see
 * {@link NotificationDispatcher} on why this is a fan-out rather than a
 * broadcast.
 *
 * Both are read off the plan rather than written in here, which is the change
 * Feature 030 made: an administrative event is neither, and a constant in this
 * function would have been the second place deciding a fact the plan already
 * states.
 *
 * The DTO class is used as the shape rather than a bare object, so this is
 * checked against the same contract the temporary `POST` validates — a field
 * added there is a build error here rather than a notification quietly missing
 * it.
 */
function toNotificationDto(
  plan: DeliveryPlan,
  recipientUserId: string,
): CreateNotificationDto {
  return {
    workspace: plan.workspace,
    recipientType: plan.recipientType,
    recipientUserId,
    title: plan.title,
    message: plan.message,
    category: plan.category,
    type: plan.type,
    priority: plan.priority,
  };
}

/**
 * One notification for a whole workspace, addressed to nobody in particular.
 *
 * The same message with `recipientUserId` left off, because a broadcast that
 * named an account would be refused by `NotificationService`'s addressing rule —
 * and rightly: a row addressed both to everybody and to one person is two
 * different notifications.
 */
function toBroadcastNotificationDto(plan: DeliveryPlan): CreateNotificationDto {
  return {
    workspace: plan.workspace,
    recipientType: plan.recipientType,
    title: plan.title,
    message: plan.message,
    category: plan.category,
    type: plan.type,
    priority: plan.priority,
  };
}

/**
 * Refuses a campaign that may no longer go out.
 *
 * Both refusals are `409`s naming the reason rather than `403`s: they are
 * statements about the state of the campaign, not about who is asking — the call
 * Feature 027 makes for every lifecycle gate, and Feature 023 before it.
 *
 * The status check is made against the stored row before the claim, even though
 * the claim enforces it too. That is not redundant: the claim can only answer
 * "no", while this can answer "no, because it was cancelled" — and a `409`
 * without a reason sends an administrator looking for a permission problem that
 * does not exist.
 */
function assertSendable(campaign: CampaignDelivery): void {
  const sendable: readonly string[] = SENDABLE_CAMPAIGN_STATUSES;

  if (!sendable.includes(campaign.status)) {
    throw new ConflictException(
      `Campaign ${campaign.id} is ${campaign.status} and cannot be sent; only ${sendable.join(' and ')} campaigns may be delivered`,
    );
  }

  if (campaign.expiresAt !== null && campaign.expiresAt <= new Date()) {
    throw new ConflictException(
      `Campaign ${campaign.id} expired at ${toIsoTimestamp(campaign.expiresAt)} and is no longer worth sending`,
    );
  }
}
