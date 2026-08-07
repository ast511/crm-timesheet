import { Injectable, Logger } from '@nestjs/common';

import {
  NotificationCategory,
  NotificationPriority,
  NotificationType,
} from '../../generated/prisma/enums';
import { NotificationDispatcher } from '../notification-delivery/notification-dispatcher.service';
import {
  EventAudience,
  EventAudienceKind,
  EventDelivery,
} from '../notification-delivery/notification-delivery.repository';
import { describePeriod } from './timesheet-management.rules';

/**
 * The four things this feature announces.
 *
 * String keys rather than an enum of the module's own, because they are the
 * *event names* — what a log line quotes, what a template is filed under, and
 * what a later feature will subscribe to. They are spelled `lower_snake` to match
 * the way every stored enum value in this schema is spelled, so a reader meets
 * one vocabulary rather than two.
 */
export const TIMESHEET_EVENTS = {
  submitted: 'timesheet_submitted',
  approved: 'timesheet_approved',
  rejected: 'timesheet_rejected',
  stale: 'timesheet_stale',
} as const;

/** Which timesheet an announcement is about — the fields every payload needs. */
export interface TimesheetSubject {
  readonly employeeId: string;
  readonly employeeCode: string;
  readonly firstName: string;
  readonly lastName: string;
  readonly month: number;
  readonly year: number;
}

/** What invalidated a draft, in words the owner can act on. */
export type StaleReason =
  'an approved leave request' | 'a public holiday' | 'the work schedule';

/**
 * Builds the timesheet notifications and hands them to the delivery engine.
 *
 * **Nothing here sends anything**, and that is the feature's standing rule rather
 * than a description of this file. No SMTP connection is opened, no socket is
 * touched, no `notifications` row is written and no email template is rendered.
 * This service decides *what to say and who to say it to*; the Notification
 * Delivery Engine decides how a message becomes an inbox entry and an email, and
 * it is the only thing in the application that does — see
 * `NotificationDispatcher`.
 *
 * The seam is {@link NotificationDispatcher.executeEvent}, which Feature 028 said
 * would exist "when the timesheet and leave features want to announce something"
 * and deliberately did not write in advance. This is that caller, and what it
 * needed turned out to be a third delivery source beside the campaign and the
 * reminder.
 *
 * Three decisions worth naming:
 *
 * 1. **Every payload identifies which timesheet it is about.** A person with
 *    three months in flight — one submitted, one rejected, one being redone —
 *    must be able to tell from the message alone which one changed. Every
 *    announcement therefore carries the period, and the one addressed to
 *    administrators carries the employee's name and code as well, because "a
 *    timesheet was submitted" is unactionable without whose.
 * 2. **An announcement can never fail the thing it announces.** Every method here
 *    swallows its errors and logs them — see {@link announce}. An approval that
 *    succeeded and then returned a `500` because a mail server was down would be
 *    the worst of both: the month is approved, the client believes it is not, and
 *    the retry hits an immutable timesheet. It is the same rule Feature 025 asks
 *    every email caller to apply and Feature 026 applies to its event publisher.
 * 3. **Nothing here decides *whether* to announce.** Each method is called from
 *    inside a state transition that has already established the change happened
 *    exactly once — a conditional `updateMany` that moved one row. Putting a
 *    "has this already been announced" check here would be a second gate that
 *    eventually disagreed with the first.
 */
@Injectable()
export class TimesheetNotificationService {
  private readonly logger = new Logger(TimesheetNotificationService.name);

  constructor(private readonly dispatcher: NotificationDispatcher) {}

  /**
   * A month has been handed in — tell the people who review them.
   *
   * Addressed to the administrative workspace rather than to a list of
   * administrators: it is one piece of work that one person picks up, and three
   * personal copies would leave two of them chasing a month a colleague had
   * already approved. See {@link EventAudienceKind.Administrative}.
   *
   * The email copy goes to the timesheet approval addresses — the list Feature
   * 016 created for exactly this and which nothing had read until now.
   */
  async announceSubmitted(subject: TimesheetSubject): Promise<void> {
    await this.announce({
      key: TIMESHEET_EVENTS.submitted,
      subject: `Timesheet submitted: ${describeEmployee(subject)} — ${describePeriod(subject.month, subject.year)}`,
      message:
        `${describeEmployee(subject)} has submitted their timesheet for ${describePeriod(subject.month, subject.year)} and it is waiting for review.\n\n` +
        `Open the timesheet review list to approve it or send it back with a reason.`,
      category: NotificationCategory.TIMESHEET,
      severity: NotificationType.INFO,
      priority: NotificationPriority.MEDIUM,
      sendEmail: true,
      sendNotification: true,
      audience: { kind: EventAudienceKind.Administrative },
    });
  }

  /**
   * A month has been approved — tell its owner.
   *
   * The period and nothing else: an approval needs no explanation, and a stored
   * one would read as a caveat. But the period is required, because "your
   * timesheet was approved" is ambiguous to anybody who submitted two.
   *
   * `SUCCESS` rather than `INFO`, which is the one place this feature uses the
   * severity for what it is for: a client draws it green, and the employee can
   * tell at a glance which of their months went through.
   */
  async announceApproved(subject: TimesheetSubject): Promise<void> {
    await this.announce({
      key: TIMESHEET_EVENTS.approved,
      subject: `Your timesheet for ${describePeriod(subject.month, subject.year)} was approved`,
      message: `Your timesheet for ${describePeriod(subject.month, subject.year)} has been approved. No further action is needed.`,
      category: NotificationCategory.TIMESHEET,
      severity: NotificationType.SUCCESS,
      priority: NotificationPriority.MEDIUM,
      sendEmail: true,
      sendNotification: true,
      audience: toOwner(subject),
    });
  }

  /**
   * A month has been sent back — tell its owner, with the reason.
   *
   * **The reason travels with the notification**, which is the whole point of
   * requiring one: a rejection the employee reads without knowing what to fix
   * will be resubmitted unchanged, and the second refusal will say the same
   * thing.
   *
   * `HIGH` priority and `ERROR` severity, and both are deserved: this is the one
   * timesheet event that asks somebody to do something, and a month sitting
   * rejected is a month that will not be paid.
   */
  async announceRejected(
    subject: TimesheetSubject,
    rejectionReason: string,
  ): Promise<void> {
    await this.announce({
      key: TIMESHEET_EVENTS.rejected,
      subject: `Your timesheet for ${describePeriod(subject.month, subject.year)} needs changes`,
      message:
        `Your timesheet for ${describePeriod(subject.month, subject.year)} was not approved.\n\n` +
        `Reason: ${rejectionReason}\n\n` +
        `Open the timesheet, make the changes and submit it again.`,
      category: NotificationCategory.TIMESHEET,
      severity: NotificationType.ERROR,
      priority: NotificationPriority.HIGH,
      sendEmail: true,
      sendNotification: true,
      audience: toOwner(subject),
    });
  }

  /**
   * Something the month was filled against has changed — ask its owner to look.
   *
   * **The message says what changed and does not say what to do about it**, which
   * mirrors exactly what the module did: it raised a flag and rewrote nothing. A
   * leave request approved after somebody filled their month may mean a day of
   * theirs is now leave, or may mean nothing at all if they already accounted for
   * it — and only the person who worked the month can say which.
   *
   * `WARNING` rather than `ERROR`: nothing is wrong yet, and a month that goes
   * stale and turns out to be correct is the common case.
   *
   * No email. This is the one timesheet event that is in-app only, and
   * deliberately: staleness is advisory, it can be raised by a colleague's
   * unrelated holiday being corrected, and a mail for each would train people to
   * ignore the ones that matter.
   */
  async announceStale(
    subject: TimesheetSubject,
    reason: StaleReason,
  ): Promise<void> {
    await this.announce({
      key: TIMESHEET_EVENTS.stale,
      subject: `Your timesheet for ${describePeriod(subject.month, subject.year)} needs a review`,
      message:
        `${capitalise(reason)} changed after you filled in your timesheet for ${describePeriod(subject.month, subject.year)}.\n\n` +
        `Nothing you entered has been altered. Open the timesheet, check that it still reflects the month, and save it again.`,
      category: NotificationCategory.TIMESHEET,
      severity: NotificationType.WARNING,
      priority: NotificationPriority.MEDIUM,
      sendEmail: false,
      sendNotification: true,
      audience: toOwner(subject),
    });
  }

  /**
   * Hands one announcement to the delivery engine, and never lets it break the
   * transition that caused it.
   *
   * Every method above goes through here, so the guarantee is stated once: a mail
   * server that is down, a socket that has gone away, an employee whose account
   * was deleted — none of them may turn an approved timesheet into a `500`. The
   * month has already changed by the time this runs, and reporting a failure the
   * caller cannot act on would invite a retry that the status guard would refuse
   * anyway.
   *
   * The log carries the event and the failure and **not the message**, which is
   * about a named person's work and does not belong in an application log. The
   * engine logs its own delivery line for the successful path.
   */
  private async announce(event: EventDelivery): Promise<void> {
    try {
      await this.dispatcher.executeEvent(event);
    } catch (error) {
      this.logger.error(
        `Announcing ${event.key} failed; the timesheet change itself was applied`,
        error instanceof Error ? (error.stack ?? error.message) : String(error),
      );
    }
  }
}

/** The timesheet's owner, as an audience. */
function toOwner(subject: TimesheetSubject): EventAudience {
  return {
    kind: EventAudienceKind.Employee,
    employeeId: subject.employeeId,
  };
}

/**
 * `EMP-0007 (Popescu Ion)` — how a person is named in a message somebody reads.
 *
 * The same rendering `LeaveRequestsService` uses in its refusals, so an
 * administrator meets one spelling of a colleague across the application. The
 * code comes first because it is what a search matches and what an administrator
 * pastes.
 */
function describeEmployee({
  employeeCode,
  firstName,
  lastName,
}: TimesheetSubject): string {
  return `${employeeCode} (${lastName} ${firstName})`;
}

/** `the work schedule` → `The work schedule`, for the start of a sentence. */
function capitalise(value: string): string {
  return `${value.charAt(0).toUpperCase()}${value.slice(1)}`;
}
