import { ConfigService } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';

import {
  NotificationPriority,
  NotificationType,
} from '../../generated/prisma/enums';
import { ReminderRow } from '../notification-management/entities/reminder.entity';
import { SCHEDULER_ENABLED_KEY } from './notification-delivery.constants';
import { NotificationDeliveryRepository } from './notification-delivery.repository';
import { NotificationDispatcher } from './notification-dispatcher.service';
import {
  daysBetweenUtc,
  isReminderDue,
  ReminderSchedulerService,
  resolveTimesheetDeadlines,
} from './reminder-scheduler.service';

const reminderOf = (
  id: string,
  daysBeforeDeadline: number,
  enabled = true,
): ReminderRow => ({
  id,
  name: `Timesheet due in ${String(daysBeforeDeadline)} days`,
  description: null,
  enabled,
  daysBeforeDeadline,
  subject: `Your timesheet is due in ${String(daysBeforeDeadline)} days`,
  message: 'Please complete your timesheet.',
  severity: NotificationType.WARNING,
  priority: NotificationPriority.MEDIUM,
  sendEmail: false,
  sendNotification: true,
  createdAt: new Date('2026-08-01T00:00:00.000Z'),
  updatedAt: new Date('2026-08-01T00:00:00.000Z'),
});

describe('reminder scheduling arithmetic', () => {
  describe('resolveTimesheetDeadlines', () => {
    it('is the last day of this month and of the next', () => {
      expect(
        resolveTimesheetDeadlines(new Date('2026-08-05T09:00:00.000Z')),
      ).toEqual([
        new Date('2026-08-31T00:00:00.000Z'),
        new Date('2026-09-30T00:00:00.000Z'),
      ]);
    });

    it('rolls into the next year in December', () => {
      expect(
        resolveTimesheetDeadlines(new Date('2026-12-10T09:00:00.000Z')),
      ).toEqual([
        new Date('2026-12-31T00:00:00.000Z'),
        new Date('2027-01-31T00:00:00.000Z'),
      ]);
    });

    it('gets February right in a leap year', () => {
      expect(
        resolveTimesheetDeadlines(new Date('2028-02-01T09:00:00.000Z'))[0],
      ).toEqual(new Date('2028-02-29T00:00:00.000Z'));
    });

    it('gets February right in an ordinary year', () => {
      expect(
        resolveTimesheetDeadlines(new Date('2026-02-01T09:00:00.000Z'))[0],
      ).toEqual(new Date('2026-02-28T00:00:00.000Z'));
    });
  });

  describe('daysBetweenUtc', () => {
    it('counts calendar days rather than 24-hour periods', () => {
      const morning = new Date('2026-08-05T09:00:00.000Z');
      const evening = new Date('2026-08-05T17:00:00.000Z');
      const deadline = new Date('2026-08-31T00:00:00.000Z');

      expect(daysBetweenUtc(morning, deadline)).toBe(26);
      expect(daysBetweenUtc(evening, deadline)).toBe(26);
    });

    it('is zero on the day itself, whatever the time', () => {
      expect(
        daysBetweenUtc(
          new Date('2026-08-31T23:59:00.000Z'),
          new Date('2026-08-31T00:00:00.000Z'),
        ),
      ).toBe(0);
    });
  });

  describe('isReminderDue', () => {
    const today = new Date('2026-08-28T06:00:00.000Z');

    it('fires a rule whose offset matches the days remaining', () => {
      expect(isReminderDue({ daysBeforeDeadline: 3 }, today)).toBe(true);
    });

    it('does not fire a rule whose offset does not', () => {
      expect(isReminderDue({ daysBeforeDeadline: 4 }, today)).toBe(false);
      expect(isReminderDue({ daysBeforeDeadline: 2 }, today)).toBe(false);
    });

    // `0` is a deliberate value: "your timesheet is due today" is the reminder
    // people actually act on.
    it('fires a zero-day rule on the deadline itself', () => {
      expect(
        isReminderDue(
          { daysBeforeDeadline: 0 },
          new Date('2026-08-31T06:00:00.000Z'),
        ),
      ).toBe(true);
    });

    // Judging against one deadline would make every long-range rule silently
    // dead, because no day is 40 days before the end of the current month.
    it('fires a long-range rule against next month deadline', () => {
      expect(
        isReminderDue(
          { daysBeforeDeadline: 40 },
          new Date('2026-08-21T06:00:00.000Z'),
        ),
      ).toBe(true);
    });

    it('is unaffected by the time of day', () => {
      expect(
        isReminderDue(
          { daysBeforeDeadline: 3 },
          new Date('2026-08-28T23:59:59.000Z'),
        ),
      ).toBe(true);
    });
  });
});

describe('ReminderSchedulerService', () => {
  let scheduler: ReminderSchedulerService;
  let deliveries: { findEnabledReminders: jest.Mock };
  let dispatcher: { executeReminder: jest.Mock };
  let config: { get: jest.Mock };

  /** 28 August 2026 — three days before that month's deadline. */
  const TODAY = new Date('2026-08-28T07:00:00.000Z');

  beforeEach(async () => {
    deliveries = { findEnabledReminders: jest.fn().mockResolvedValue([]) };
    dispatcher = { executeReminder: jest.fn().mockResolvedValue({}) };
    config = { get: jest.fn().mockReturnValue(undefined) };

    const moduleRef: TestingModule = await Test.createTestingModule({
      providers: [
        ReminderSchedulerService,
        { provide: NotificationDeliveryRepository, useValue: deliveries },
        { provide: NotificationDispatcher, useValue: dispatcher },
        { provide: ConfigService, useValue: config },
      ],
    }).compile();

    scheduler = moduleRef.get(ReminderSchedulerService);
  });

  it('dispatches only the rules that are due today', async () => {
    const due = reminderOf('rmd-due', 3);

    deliveries.findEnabledReminders.mockResolvedValue([
      reminderOf('rmd-week', 7),
      due,
      reminderOf('rmd-today', 0),
    ]);

    await scheduler.dispatchDueReminders(TODAY);

    expect(dispatcher.executeReminder).toHaveBeenCalledTimes(1);
    expect(dispatcher.executeReminder).toHaveBeenCalledWith(due);
  });

  // The scheduler may only invoke the dispatcher: it composes nothing, resolves
  // no audience and writes nothing itself.
  it('does nothing but call the dispatcher', async () => {
    deliveries.findEnabledReminders.mockResolvedValue([reminderOf('rmd-1', 3)]);

    await scheduler.dispatchDueReminders(TODAY);

    expect(Object.keys(dispatcher)).toEqual(['executeReminder']);
  });

  it('does nothing when no rule is due', async () => {
    deliveries.findEnabledReminders.mockResolvedValue([reminderOf('rmd-1', 7)]);

    await scheduler.dispatchDueReminders(TODAY);

    expect(dispatcher.executeReminder).not.toHaveBeenCalled();
  });

  it('dispatches several rules that happen to fall on the same day', async () => {
    deliveries.findEnabledReminders.mockResolvedValue([
      reminderOf('rmd-a', 3),
      reminderOf('rmd-b', 3),
    ]);

    await scheduler.dispatchDueReminders(TODAY);

    expect(dispatcher.executeReminder).toHaveBeenCalledTimes(2);
  });

  // A run is a batch of independent announcements.
  it('keeps going after a rule fails to deliver', async () => {
    deliveries.findEnabledReminders.mockResolvedValue([
      reminderOf('rmd-a', 3),
      reminderOf('rmd-b', 3),
    ]);
    dispatcher.executeReminder.mockRejectedValueOnce(new Error('smtp down'));

    await expect(
      scheduler.dispatchDueReminders(TODAY),
    ).resolves.toBeUndefined();
    expect(dispatcher.executeReminder).toHaveBeenCalledTimes(2);
  });

  describe('the switch', () => {
    beforeEach(() => {
      deliveries.findEnabledReminders.mockResolvedValue([
        reminderOf('rmd-1', 0),
      ]);
    });

    it('runs when the variable is unset', async () => {
      await scheduler.runDueReminders();

      expect(deliveries.findEnabledReminders).toHaveBeenCalled();
      expect(config.get).toHaveBeenCalledWith(SCHEDULER_ENABLED_KEY);
    });

    it('runs when the variable is true', async () => {
      config.get.mockReturnValue(true);

      await scheduler.runDueReminders();

      expect(deliveries.findEnabledReminders).toHaveBeenCalled();
    });

    // The case it exists for: a staging deployment restored from a production
    // dump must not chase the whole company for their timesheets.
    it('stops the clock when the variable is false', async () => {
      config.get.mockReturnValue(false);

      await scheduler.runDueReminders();

      expect(deliveries.findEnabledReminders).not.toHaveBeenCalled();
      expect(dispatcher.executeReminder).not.toHaveBeenCalled();
    });
  });

  it('does not start a second run while one is still going', async () => {
    let release = (): void => undefined;

    deliveries.findEnabledReminders.mockImplementation(
      () =>
        new Promise((resolve) => {
          release = () => {
            resolve([]);
          };
        }),
    );

    const first = scheduler.runDueReminders();
    await scheduler.runDueReminders();

    expect(deliveries.findEnabledReminders).toHaveBeenCalledTimes(1);

    release();
    await first;
  });
});
