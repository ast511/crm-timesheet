import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron } from '@nestjs/schedule';

import { ReminderRow } from '../notification-management/entities/reminder.entity';
import {
  REMINDER_CRON,
  SCHEDULER_ENABLED_KEY,
} from './notification-delivery.constants';
import { NotificationDeliveryRepository } from './notification-delivery.repository';
import { NotificationDispatcher } from './notification-dispatcher.service';

const MILLISECONDS_PER_DAY = 24 * 60 * 60 * 1000;

/**
 * Fires the reminder rules the company has configured.
 *
 * **It decides *which* rules are due and nothing else.** It composes no message,
 * resolves no audience, writes no notification and sends no email: it hands each
 * due rule to {@link NotificationDispatcher} and lets the one delivery path do
 * the rest. That is the requirement — the scheduler may only invoke the
 * dispatcher — and it is also what keeps a reminder and a manually executed
 * campaign from being two subtly different deliveries.
 *
 * Three decisions worth naming:
 *
 * 1. **Once a day, not once an hour.** `daysBeforeDeadline` is a whole number of
 *    days, so a rule is due on a *date*. Asking once per date is what makes "a
 *    reminder never fires twice" a property of the schedule rather than a
 *    duplicate-check the engine would have to keep — and a duplicate-check would
 *    need a table recording what had already fired, which is a migration bought
 *    to solve a problem the cron expression does not have.
 * 2. **One rule's failure does not stop the others.** Each is dispatched inside
 *    its own `try`, because a run is a batch of independent announcements: a
 *    reminder whose delivery failed should not silence the three that were about
 *    to go out after it.
 * 3. **It can be switched off.** `NOTIFICATION_SCHEDULER_ENABLED=false` stops the
 *    clock without stopping the engine — the manual endpoint still works. A
 *    staging deployment restored from a production dump holds real employees and
 *    real reminder rules, and it must be able to run the API without chasing the
 *    whole company for their timesheets.
 */
@Injectable()
export class ReminderSchedulerService {
  private readonly logger = new Logger(ReminderSchedulerService.name);

  /** Guards against a slow run overlapping the next tick. */
  private running = false;

  constructor(
    private readonly deliveries: NotificationDeliveryRepository,
    private readonly dispatcher: NotificationDispatcher,
    private readonly config: ConfigService,
  ) {}

  /**
   * The daily tick: which rules are due today, and send them.
   *
   * `@Cron` registers the job with `@nestjs/schedule`; the guard inside is what
   * decides whether it does anything, rather than the registration being
   * conditional. Registering it either way means the job's name and schedule are
   * the same in every deployment, and "the scheduler is off here" is a
   * configuration fact rather than a different application.
   */
  @Cron(REMINDER_CRON, { name: 'notification-delivery.reminders' })
  async runDueReminders(): Promise<void> {
    if (!this.isEnabled() || this.running) {
      return;
    }

    this.running = true;

    try {
      await this.dispatchDueReminders(new Date());
    } finally {
      this.running = false;
    }
  }

  /**
   * Loads the enabled rules, keeps the ones due today, and dispatches each.
   *
   * Takes `today` as an argument rather than reading the clock itself, which is
   * what lets the whole decision — including a reminder that is due only in the
   * last week of a month — be tested without faking a global.
   */
  async dispatchDueReminders(today: Date): Promise<void> {
    const due = (await this.deliveries.findEnabledReminders()).filter(
      (reminder) => isReminderDue(reminder, today),
    );

    if (due.length === 0) {
      return;
    }

    this.logger.log(`${due.length} reminder rule(s) are due today`);

    for (const reminder of due) {
      await this.dispatch(reminder);
    }
  }

  private async dispatch(reminder: ReminderRow): Promise<void> {
    try {
      await this.dispatcher.executeReminder(reminder);
    } catch (error) {
      this.logger.error(
        `Reminder "${reminder.name}" could not be delivered`,
        error instanceof Error ? (error.stack ?? error.message) : String(error),
      );
    }
  }

  /** `NOTIFICATION_SCHEDULER_ENABLED`, defaulting to on. */
  private isEnabled(): boolean {
    return this.config.get<boolean>(SCHEDULER_ENABLED_KEY) !== false;
  }
}

/**
 * Whether a rule fires today.
 *
 * A rule is due when today is exactly `daysBeforeDeadline` days before a
 * deadline. `0` is legal and means the deadline itself — Feature 027 is explicit
 * that "your timesheet is due **today**" is the reminder people actually act on.
 *
 * **Both the current month's deadline and the next one are considered**, and that
 * is not belt and braces: a rule with an offset of 40 days can never be that many
 * days before the *current* month's end, so judging against one deadline would
 * make every long-range rule silently dead. A rule cannot match both, since two
 * different deadlines are never the same number of days away.
 */
export function isReminderDue(
  reminder: Pick<ReminderRow, 'daysBeforeDeadline'>,
  today: Date,
): boolean {
  return resolveTimesheetDeadlines(today).some(
    (deadline) =>
      daysBetweenUtc(today, deadline) === reminder.daysBeforeDeadline,
  );
}

/**
 * The deadlines a reminder can be counting down to.
 *
 * **The last day of this month and of the next**, which is this application's
 * timesheet deadline until the Timesheets module says otherwise.
 *
 * Feature 027 deliberately left `Reminder` without a `deadlineType` column,
 * because the only deadline this system has is the timesheet's and the module
 * that owns it does not exist yet. Something has to decide what that deadline
 * *is*, and the engine is the right place: it is the only component that has to
 * know, it is the component that will read the real answer the day there is one,
 * and stating the rule here as a function means replacing it is one edit rather
 * than a search.
 *
 * Month-end is the interim rule because that is when a monthly timesheet is due
 * in practically every company that keeps one. When the Timesheets module lands
 * this function reads the configured deadline instead, and nothing else in this
 * feature moves.
 *
 * Computed in UTC, like every other date in this project: the columns are
 * `timestamp` and the seed writes UTC midnight, so a local-time calculation would
 * make a reminder fire a day early or late depending on where the server is.
 */
export function resolveTimesheetDeadlines(today: Date): Date[] {
  const year = today.getUTCFullYear();
  const month = today.getUTCMonth();

  return [lastDayOfMonth(year, month), lastDayOfMonth(year, month + 1)];
}

/**
 * Whole days from one instant to another, counted in calendar days rather than
 * in 24-hour periods.
 *
 * Both ends are truncated to UTC midnight first, so "how many days until the
 * 31st" is the same answer at 09:00 and at 17:00 on the same date. Counting
 * elapsed milliseconds instead would make a reminder due at breakfast and not at
 * tea time.
 */
export function daysBetweenUtc(from: Date, to: Date): number {
  return Math.round(
    (startOfUtcDay(to).getTime() - startOfUtcDay(from).getTime()) /
      MILLISECONDS_PER_DAY,
  );
}

/**
 * The last day of a month, as UTC midnight.
 *
 * Day `0` of the following month, which is how JavaScript spells "the last day of
 * this one" and is the one arithmetic that gets February right without a leap
 * year rule. A `month` of 12 rolls into January of the next year, which is what
 * makes {@link resolveTimesheetDeadlines} correct in December.
 */
function lastDayOfMonth(year: number, month: number): Date {
  return new Date(Date.UTC(year, month + 1, 0));
}

function startOfUtcDay(date: Date): Date {
  return new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()),
  );
}
