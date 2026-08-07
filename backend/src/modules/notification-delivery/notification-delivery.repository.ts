import { Injectable, NotFoundException } from '@nestjs/common';

import {
  CampaignRecipientType,
  NotificationCategory,
  NotificationPriority,
  NotificationRecipientType,
  NotificationType,
  NotificationWorkspace,
} from '../../generated/prisma/enums';
import { EmployeeService } from '../employees/employee.service';
import { WorkScheduleService } from '../work-schedule/work-schedule.service';
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
  /** The stored campaign this came from, or null for a reminder or an event. */
  readonly campaignId: string | null;
  /** The reminder rule this came from, or null for a campaign or an event. */
  readonly reminderId: string | null;
  /** The application event this came from, or null for the two stored sources. */
  readonly eventKey: string | null;
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
  /**
   * Which inbox the notification is filed in, and how it names who it is for.
   *
   * Both were implicit before Feature 030 — every delivery was `PERSONAL` +
   * `USER`, written into the dispatcher — and are stated on the plan now because
   * an administrative event is neither. "A timesheet is waiting for review" is
   * back-office work addressed to the people who do it, which is exactly what
   * `ADMINISTRATIVE` + `ADMINISTRATIVE_USERS` means; filing it personally would
   * put it in the inbox of whichever administrator happened to be resolved first.
   *
   * Only the two pairings Feature 026's `WORKSPACE_RECIPIENT_TYPES` calls legal
   * are produced here, and `NotificationService` refuses the rest regardless.
   */
  readonly workspace: NotificationWorkspace;
  readonly recipientType: NotificationRecipientType;
  /**
   * Who gets a notification row, resolved at this moment and never earlier.
   *
   * Possibly empty, and **empty by design on an administrative broadcast**: that
   * is one row nobody is individually addressed by, so there is no list of people
   * to fan out to. See {@link NotificationDispatcher.createNotifications}.
   */
  readonly targets: readonly DeliveryTarget[];
  /**
   * Where the email copy goes.
   *
   * A separate list from {@link targets} since Feature 030, because the two
   * genuinely differ on one delivery: an administrative broadcast reaches a
   * *workspace* in-app, but an email needs an address, and the addresses the
   * company has already nominated for this are the timesheet approval list
   * Feature 016 stores. For a campaign, a reminder and a personal event it is
   * exactly `targets.map(t => t.email)`, which is what it always was.
   */
  readonly emailRecipients: readonly string[];
}

/** Who an event is announced to. Two shapes, and they resolve differently. */
export enum EventAudienceKind {
  /** One named person — the owner of the thing that changed. */
  Employee = 'EMPLOYEE',
  /**
   * The people who run the company, as a workspace rather than as a list.
   *
   * One `ADMINISTRATIVE_USERS` notification that every administrator sees, and an
   * email to the addresses nominated for it. Deliberately *not* a fan-out over
   * every account whose role is administrative: that would put the same message
   * in three personal inboxes and make "how many administrators are there" a
   * question the delivery of a timesheet depends on.
   */
  Administrative = 'ADMINISTRATIVE',
}

export type EventAudience =
  | { readonly kind: EventAudienceKind.Employee; readonly employeeId: string }
  | { readonly kind: EventAudienceKind.Administrative };

/**
 * Something that happened, handed to the engine to announce.
 *
 * **The engine's third input, and the first that is not a stored row.** A
 * campaign is composed and a reminder is configured; an event is a moment in
 * another module — a timesheet was rejected — and there is nothing to look up,
 * claim or mark sent. The producing module composes the wording, because only it
 * knows which timesheet and whose, and hands over exactly this.
 *
 * It carries its own `category`, `severity` and `priority` for the same reason:
 * what a notification is *about* and how loudly it asks are facts about the
 * event, not about the mechanism that delivered it.
 *
 * There is no `expiresAt` and no schedule. An event is announced now or not at
 * all — the thing it describes has already happened.
 */
export interface EventDelivery {
  /** `timesheet_rejected` — what this is, for the log and the template. */
  readonly key: string;
  readonly subject: string;
  readonly message: string;
  readonly category: NotificationCategory;
  readonly severity: NotificationType;
  readonly priority: NotificationPriority;
  readonly sendEmail: boolean;
  readonly sendNotification: boolean;
  readonly audience: EventAudience;
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
    // Added by Feature 030, and only for the administrative half of an event:
    // `timesheet_approval_emails` is the list Feature 016 created for exactly
    // this — "an address notified when a timesheet needs approval" — and it had
    // no reader until an event had to reach the people who review one.
    private readonly workSchedule: WorkScheduleService,
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
    return toPersonalPlan({
      source: DeliverySource.Campaign,
      campaignId: campaign.id,
      reminderId: null,
      eventKey: null,
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
    });
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
    return toPersonalPlan({
      source: DeliverySource.Reminder,
      campaignId: null,
      reminderId: reminder.id,
      eventKey: null,
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
    });
  }

  /**
   * Turns something that happened into the same work the dispatcher already
   * executes.
   *
   * **No claim, no `SENT`, nothing marked.** A campaign is claimed before
   * delivery because two runs can race over one stored row; an event has no row,
   * and the thing that stops it being announced twice is that the module raising
   * it does so inside a transition guarded on status — see
   * `TimesheetService.approve`. That guarantee belongs where the transition is,
   * not here.
   *
   * The audience resolves two ways, and the asymmetry is the point:
   *
   * - **`EMPLOYEE`** — the one person named, exactly as a single-recipient
   *   campaign resolves, and filed `PERSONAL` + `USER`. Their timesheet was
   *   approved; nobody else needs to know.
   * - **`ADMINISTRATIVE`** — nobody in particular. One `ADMINISTRATIVE_USERS`
   *   notification that every administrator reads, and email to the approval
   *   addresses. There are no `targets`, which is why the plan carries the two
   *   lists separately.
   *
   * An audience naming somebody who has since been deleted resolves to nobody,
   * and that is a successful delivery of nothing rather than an error — the same
   * call {@link resolveTargets} makes for a campaign whose recipients have all
   * left.
   */
  async buildEventPlan(event: EventDelivery): Promise<DeliveryPlan> {
    const base = {
      source: DeliverySource.Event,
      campaignId: null,
      reminderId: null,
      eventKey: event.key,
      subject: event.subject,
      title: toNotificationTitle(event.subject),
      message: event.message,
      category: event.category,
      type: event.severity,
      priority: event.priority,
      sendEmail: event.sendEmail,
      sendNotification: event.sendNotification,
    } as const;

    if (event.audience.kind === EventAudienceKind.Employee) {
      return toPersonalPlan({
        ...base,
        targets: await this.employees.findDeliveryTargets([
          event.audience.employeeId,
        ]),
      });
    }

    return {
      ...base,
      workspace: NotificationWorkspace.ADMINISTRATIVE,
      recipientType: NotificationRecipientType.ADMINISTRATIVE_USERS,
      targets: [],
      emailRecipients: await this.findApprovalAddresses(),
    };
  }

  /**
   * The addresses nominated to hear about timesheets needing approval.
   *
   * Read through `WorkScheduleService` rather than by querying
   * `timesheet_approval_emails`, which is the rule every module here follows.
   *
   * **An empty list is a normal answer, not a failure**, and both ways of
   * reaching one are treated alike. A company that has nominated no approval
   * address still gets the in-app notification, which is the channel
   * administrators actually work from; the email is the copy. A company that has
   * not configured a work schedule at all makes that service answer `404` — the
   * right answer to somebody *asking for* the schedule, and the wrong one to
   * propagate here, because it would turn "your timesheet was submitted" into a
   * failed submission over a missing mailing list.
   */
  private async findApprovalAddresses(): Promise<string[]> {
    try {
      const addresses = await this.workSchedule.findEmails();

      return addresses.map(({ email }) => email);
    } catch (error) {
      if (!(error instanceof NotFoundException)) {
        throw error;
      }

      return [];
    }
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

/**
 * Completes a plan addressed to *people*: `PERSONAL` + `USER`, and the email
 * copy going to the same people.
 *
 * The three fields it fills were implicit before Feature 030 — every delivery
 * was personal, and `sendEmails` read the addresses straight off the targets —
 * so this function is that behaviour written down rather than a change to it.
 * A campaign, a reminder and an employee-addressed event all take this path and
 * come out exactly as they always did.
 *
 * It exists so the *administrative* plan is the only place that departs, and the
 * departure is visible in one branch instead of three ternaries repeated across
 * the builders.
 */
function toPersonalPlan(
  plan: Omit<DeliveryPlan, 'workspace' | 'recipientType' | 'emailRecipients'>,
): DeliveryPlan {
  return {
    ...plan,
    workspace: NotificationWorkspace.PERSONAL,
    recipientType: NotificationRecipientType.USER,
    emailRecipients: plan.targets.map(({ email }) => email),
  };
}
