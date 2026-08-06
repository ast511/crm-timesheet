import { Injectable } from '@nestjs/common';

import {
  CampaignRecipientType,
  NotificationCategory,
  NotificationPriority,
  NotificationType,
} from '../../generated/prisma/enums';
import { EmployeeService } from '../employees/employee.service';
import {
  CampaignDelivery,
  NotificationCampaignService,
} from '../notification-management/notification-campaign.service';
import { ReminderService } from '../notification-management/reminder.service';
import { ReminderRow } from '../notification-management/entities/reminder.entity';
import {
  DELIVERY_CATEGORIES,
  DeliverySource,
  DUE_CAMPAIGN_BATCH_SIZE,
  toNotificationTitle,
} from './notification-delivery.constants';

/**
 * One person a delivery can actually reach.
 *
 * An employee, the account they sign in with, and the address mail goes to —
 * the three ids the two channels need. It is `EmployeeDeliveryTarget` under
 * another name, re-exported here because it is this module's vocabulary and a
 * caller in the dispatcher should not have to import from the employees module
 * to describe who a campaign is for.
 */
export interface DeliveryTarget {
  readonly employeeId: string;
  readonly userId: string;
  readonly email: string;
}

/**
 * Everything one delivery needs, resolved and ready to execute.
 *
 * **The engine's single unit of work, and the reason a campaign and a reminder
 * are not two code paths.** A stored campaign becomes one of these; a reminder
 * rule the scheduler found due becomes one of these; and `NotificationDispatcher`
 * knows how to execute one of these and nothing else. Whatever is added later —
 * a leave decision, a timesheet rejection — becomes one of these too, and the
 * delivery logic does not grow a branch.
 *
 * Two fields deserve a note:
 *
 * - **`title` and `subject` are both here and are not the same string.** The
 *   title is what a notification carries and is bounded at 150; the subject is
 *   what the email carries and is not. Deriving one from the other at the point
 *   of use would mean truncating in two places — see `toNotificationTitle`.
 * - **`campaignId` is null for a reminder**, because a reminder produces no
 *   campaign row. See the feature document for why the "internal campaign" a
 *   reminder run creates is this value rather than a persisted one.
 */
export interface DeliveryPlan {
  readonly source: DeliverySource;
  /** The stored campaign this came from, or null for a reminder run. */
  readonly campaignId: string | null;
  /** The reminder rule this came from, or null for a campaign. */
  readonly reminderId: string | null;
  /** The heading, as typed. Used for the email subject. */
  readonly subject: string;
  /** The heading, bounded to what a notification title may hold. */
  readonly title: string;
  readonly message: string;
  readonly category: NotificationCategory;
  readonly type: NotificationType;
  readonly priority: NotificationPriority;
  readonly sendEmail: boolean;
  readonly sendNotification: boolean;
  /** Resolved at this moment, never earlier. Possibly empty. */
  readonly targets: readonly DeliveryTarget[];
}

/**
 * Everything the delivery engine reads, and the one thing it writes outside the
 * notifications table.
 *
 * **It holds no Prisma, and that is the design rather than an omission.** This
 * feature owns no table: campaigns and reminders belong to Feature 027,
 * notifications to Feature 026, employees and accounts to their own modules, and
 * this project's rule throughout is that the module owning a table is the only
 * one that queries it. A repository here that reached for `PrismaService` would
 * be the first violation of that rule in the codebase, and the one that
 * eventually read a campaign in a shape `NotificationCampaignService` would have
 * refused to write.
 *
 * So it is a repository in the sense that matters: **the single seam between the
 * dispatcher and every source of data**. The dispatcher reasons in
 * {@link DeliveryPlan} and {@link DeliveryTarget}; turning a stored campaign or a
 * reminder rule into one of those — resolving the audience, deduplicating it,
 * mapping a campaign's columns onto a notification's, bounding the title —
 * happens here and nowhere else. That is real work rather than argument
 * forwarding, and it is the work that would otherwise be copied between the
 * manual endpoint, the campaign tick and the reminder tick.
 *
 * The rules stay with their owners, which is what this arrangement buys:
 *
 * | Question | Answered by |
 * | --- | --- |
 * | What is a valid campaign, and may it still be sent? | `NotificationCampaignService` |
 * | Which reminder rules are live? | `ReminderService` |
 * | Who is an employee, and how is one reached? | `EmployeeService` |
 * | How is a notification legally addressed? | `NotificationService` |
 * | How does a message reach an inbox? | `EmailService`, `NotificationGateway` |
 */
@Injectable()
export class NotificationDeliveryRepository {
  constructor(
    private readonly campaigns: NotificationCampaignService,
    private readonly reminders: ReminderService,
    private readonly employees: EmployeeService,
  ) {}

  /** One campaign in delivery shape, or `null` when there is no such campaign. */
  async findCampaign(campaignId: string): Promise<CampaignDelivery | null> {
    return this.campaigns.findForDelivery(campaignId);
  }

  /**
   * The campaigns whose schedule has arrived, oldest first and bounded.
   *
   * The bound is the scheduler's, not the query's: see
   * {@link DUE_CAMPAIGN_BATCH_SIZE}.
   */
  async findDueCampaignIds(now: Date): Promise<string[]> {
    return this.campaigns.findDue(now, DUE_CAMPAIGN_BATCH_SIZE);
  }

  /**
   * Claims a campaign, so that this run and no other delivers it.
   *
   * `false` means somebody else got there first, or the campaign was cancelled
   * or deleted in the moments since it was read.
   */
  async claimCampaign(campaignId: string, sentAt: Date): Promise<boolean> {
    return this.campaigns.markSent(campaignId, sentAt);
  }

  /** Every reminder rule that is switched on, in the order they fire. */
  async findEnabledReminders(): Promise<ReminderRow[]> {
    return this.reminders.findEnabled();
  }

  /**
   * Turns a stored campaign into the work the dispatcher executes.
   *
   * The audience is resolved **here, now** — which is the whole reason Feature
   * 027 stores `ALL_EMPLOYEES` as a single row. Somebody hired between the
   * afternoon the announcement was composed and the morning it goes out is
   * included; somebody who left is not.
   */
  async buildCampaignPlan(campaign: CampaignDelivery): Promise<DeliveryPlan> {
    return {
      source: DeliverySource.Campaign,
      campaignId: campaign.id,
      reminderId: null,
      subject: campaign.subject,
      title: toNotificationTitle(campaign.subject),
      message: campaign.message,
      category: DELIVERY_CATEGORIES[DeliverySource.Campaign],
      type: campaign.severity,
      priority: campaign.priority,
      sendEmail: campaign.sendEmail,
      sendNotification: campaign.sendNotification,
      targets: await this.resolveTargets(
        campaign.recipientType,
        campaign.employeeIds,
      ),
    };
  }

  /**
   * Turns a reminder rule into the same work — the "internal campaign" the
   * feature calls for.
   *
   * Internal in the sense that it exists for the length of one run and is never
   * stored: `notification_campaigns.created_by_employee_id` is `NOT NULL` because
   * Feature 027 decided a campaign is something a *person* wrote, and a scheduler
   * is not a person. Writing a row with an invented author would contradict a
   * shipped decision to gain a record of something the notifications themselves
   * already record. See the feature document for the alternative and why it was
   * not taken.
   *
   * A reminder addresses everybody, because the deadline it warns about is
   * everybody's. When the Timesheets module exists this becomes "everybody who
   * has not submitted yet", which is a narrower list built the same way.
   */
  async buildReminderPlan(reminder: ReminderRow): Promise<DeliveryPlan> {
    return {
      source: DeliverySource.Reminder,
      campaignId: null,
      reminderId: reminder.id,
      subject: reminder.subject,
      title: toNotificationTitle(reminder.subject),
      message: reminder.message,
      category: DELIVERY_CATEGORIES[DeliverySource.Reminder],
      type: reminder.severity,
      priority: reminder.priority,
      sendEmail: reminder.sendEmail,
      sendNotification: reminder.sendNotification,
      targets: await this.resolveTargets(
        CampaignRecipientType.ALL_EMPLOYEES,
        [],
      ),
    };
  }

  /**
   * The two recipient shapes, resolved to people the engine can reach.
   *
   * `ALL_EMPLOYEES` asks the employees module for the whole company;
   * `EMPLOYEE` asks it for the named ids. Both go through `EmployeeService`
   * rather than a query here, so "who counts as somebody who works here" —
   * which statuses are included, and which are not — is stated once, in the
   * module that owns the answer.
   *
   * **The result is deduplicated by employee**, which is the last line of defence
   * behind "never send duplicate notifications". The unique index on
   * `(campaign_id, employee_id)` already prevents a campaign naming somebody
   * twice, so this is belt to that braces — but a plan is executed rather than
   * validated, and a duplicate here would be a second email and a second row in
   * somebody's inbox, which is exactly the failure a reader of this method will
   * be checking for.
   *
   * An `EMPLOYEE` campaign with no stored ids resolves to nobody rather than to
   * everybody. It cannot be created through the API — a campaign needs at least
   * one recipient — and if one ever existed, delivering an announcement to the
   * whole company because its audience was empty is the worst possible reading of
   * an ambiguous row.
   */
  private async resolveTargets(
    recipientType: CampaignRecipientType,
    employeeIds: readonly string[],
  ): Promise<DeliveryTarget[]> {
    if (recipientType === CampaignRecipientType.ALL_EMPLOYEES) {
      return this.employees.findDeliveryTargets();
    }

    if (employeeIds.length === 0) {
      return [];
    }

    return dedupeByEmployee(
      await this.employees.findDeliveryTargets(employeeIds),
    );
  }
}

/** One entry per employee, keeping the first. */
function dedupeByEmployee(
  targets: readonly DeliveryTarget[],
): DeliveryTarget[] {
  return [
    ...new Map(targets.map((target) => [target.employeeId, target])).values(),
  ];
}
