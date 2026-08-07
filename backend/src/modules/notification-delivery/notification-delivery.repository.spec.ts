import { Test, TestingModule } from '@nestjs/testing';

import {
  CampaignRecipientType,
  NotificationCampaignStatus,
  NotificationCategory,
  NotificationPriority,
  NotificationRecipientType,
  NotificationType,
  NotificationWorkspace,
} from '../../generated/prisma/enums';
import { EmployeeService } from '../employees/employee.service';
import { ReminderRow } from '../notification-management/entities/reminder.entity';
import {
  CampaignDelivery,
  NotificationCampaignService,
} from '../notification-management/notification-campaign.service';
import { ReminderService } from '../notification-management/reminder.service';
import { NOTIFICATION_TITLE_MAX_LENGTH } from '../notifications/notification.constants';
import { WorkScheduleService } from '../work-schedule/work-schedule.service';
import { DeliverySource } from './notification-delivery.constants';
import { NotificationDeliveryRepository } from './notification-delivery.repository';

const CAMPAIGN: CampaignDelivery = {
  id: 'cmp-1',
  subject: 'Planned maintenance',
  message: 'The system will be unavailable on Saturday morning.',
  severity: NotificationType.WARNING,
  priority: NotificationPriority.HIGH,
  sendEmail: true,
  sendNotification: true,
  status: NotificationCampaignStatus.SCHEDULED,
  expiresAt: null,
  recipientType: CampaignRecipientType.EMPLOYEE,
  employeeIds: ['emp-1', 'emp-2'],
};

const REMINDER: ReminderRow = {
  id: 'rmd-1',
  name: 'Timesheet due in 3 days',
  description: null,
  enabled: true,
  daysBeforeDeadline: 3,
  subject: 'Your timesheet is due in 3 days',
  message: 'Please complete your timesheet before the end of the month.',
  severity: NotificationType.INFO,
  priority: NotificationPriority.LOW,
  sendEmail: false,
  sendNotification: true,
  createdAt: new Date('2026-08-05T10:00:00.000Z'),
  updatedAt: new Date('2026-08-05T10:00:00.000Z'),
};

const target = (suffix: string) => ({
  employeeId: `emp-${suffix}`,
  userId: `usr-${suffix}`,
  email: `person${suffix}@example.com`,
});

describe('NotificationDeliveryRepository', () => {
  let repository: NotificationDeliveryRepository;
  let campaigns: {
    findForDelivery: jest.Mock;
    findDue: jest.Mock;
    markSent: jest.Mock;
  };
  let reminders: { findEnabled: jest.Mock };
  let employees: { findDeliveryTargets: jest.Mock };
  let workSchedule: { findEmails: jest.Mock };

  beforeEach(async () => {
    campaigns = {
      findForDelivery: jest.fn().mockResolvedValue(CAMPAIGN),
      findDue: jest.fn().mockResolvedValue(['cmp-1']),
      markSent: jest.fn().mockResolvedValue(true),
    };
    reminders = { findEnabled: jest.fn().mockResolvedValue([REMINDER]) };
    employees = {
      findDeliveryTargets: jest
        .fn()
        .mockResolvedValue([target('1'), target('2')]),
    };

    // Added by Feature 030: the administrative half of an event is emailed to
    // the timesheet approval addresses, which is the list Feature 016 stores.
    workSchedule = {
      findEmails: jest
        .fn()
        .mockResolvedValue([{ id: 'eml-1', email: 'approvals@example.com' }]),
    };

    const moduleRef: TestingModule = await Test.createTestingModule({
      providers: [
        NotificationDeliveryRepository,
        { provide: NotificationCampaignService, useValue: campaigns },
        { provide: ReminderService, useValue: reminders },
        { provide: EmployeeService, useValue: employees },
        { provide: WorkScheduleService, useValue: workSchedule },
      ],
    }).compile();

    repository = moduleRef.get(NotificationDeliveryRepository);
  });

  describe('reads that belong to another module', () => {
    it('asks the campaign service for a campaign rather than the table', async () => {
      await expect(repository.findCampaign('cmp-1')).resolves.toBe(CAMPAIGN);
      expect(campaigns.findForDelivery).toHaveBeenCalledWith('cmp-1');
    });

    it('bounds one tick to a batch of due campaigns', async () => {
      const now = new Date('2026-08-05T09:00:00.000Z');

      await repository.findDueCampaignIds(now);

      expect(campaigns.findDue).toHaveBeenCalledWith(now, expect.any(Number));
      expect(campaigns.findDue.mock.calls[0][1]).toBeGreaterThan(0);
    });

    it('claims a campaign through the module that owns its lifecycle', async () => {
      const sentAt = new Date('2026-08-05T09:00:00.000Z');

      await expect(repository.claimCampaign('cmp-1', sentAt)).resolves.toBe(
        true,
      );
      expect(campaigns.markSent).toHaveBeenCalledWith('cmp-1', sentAt);
    });

    it('asks the reminder service for the enabled rules', async () => {
      await expect(repository.findEnabledReminders()).resolves.toEqual([
        REMINDER,
      ]);
    });
  });

  describe('buildCampaignPlan', () => {
    it('maps a campaign onto the work the dispatcher executes', async () => {
      const plan = await repository.buildCampaignPlan(CAMPAIGN);

      expect(plan).toEqual({
        source: DeliverySource.Campaign,
        campaignId: 'cmp-1',
        reminderId: null,
        // Null on both stored sources: only an event names one.
        eventKey: null,
        subject: 'Planned maintenance',
        title: 'Planned maintenance',
        message: CAMPAIGN.message,
        // `severity` becomes `type` — the same enum, no translation.
        category: NotificationCategory.GENERAL,
        type: NotificationType.WARNING,
        priority: NotificationPriority.HIGH,
        sendEmail: true,
        sendNotification: true,
        // Stated on the plan since Feature 030 rather than assumed by the
        // dispatcher. A campaign is unchanged: personal, one row per person.
        workspace: NotificationWorkspace.PERSONAL,
        recipientType: NotificationRecipientType.USER,
        targets: [target('1'), target('2')],
        emailRecipients: ['person1@example.com', 'person2@example.com'],
      });
    });

    it('resolves a named audience through the employees module', async () => {
      await repository.buildCampaignPlan(CAMPAIGN);

      expect(employees.findDeliveryTargets).toHaveBeenCalledWith([
        'emp-1',
        'emp-2',
      ]);
    });

    // The whole point of Feature 027's single stored row: who "everybody" means
    // is a question for this moment, not for the afternoon somebody typed it.
    it('resolves ALL_EMPLOYEES to the whole company, now', async () => {
      await repository.buildCampaignPlan({
        ...CAMPAIGN,
        recipientType: CampaignRecipientType.ALL_EMPLOYEES,
        employeeIds: [],
      });

      expect(employees.findDeliveryTargets).toHaveBeenCalledWith();
    });

    it('truncates a subject that will not fit a notification title', async () => {
      const subject = 'A'.repeat(200);

      const plan = await repository.buildCampaignPlan({ ...CAMPAIGN, subject });

      expect(plan.title).toHaveLength(NOTIFICATION_TITLE_MAX_LENGTH);
      expect(plan.title.endsWith('…')).toBe(true);
      // The email keeps the whole heading; only the notification title is bounded.
      expect(plan.subject).toBe(subject);
    });

    it('deduplicates an audience that names somebody twice', async () => {
      employees.findDeliveryTargets.mockResolvedValue([
        target('1'),
        target('1'),
        target('2'),
      ]);

      const plan = await repository.buildCampaignPlan(CAMPAIGN);

      expect(plan.targets).toEqual([target('1'), target('2')]);
    });

    // Delivering an announcement to the whole company because its audience was
    // empty is the worst possible reading of an ambiguous row.
    it('resolves an EMPLOYEE campaign with no ids to nobody, not to everybody', async () => {
      const plan = await repository.buildCampaignPlan({
        ...CAMPAIGN,
        employeeIds: [],
      });

      expect(plan.targets).toEqual([]);
      expect(employees.findDeliveryTargets).not.toHaveBeenCalled();
    });
  });

  describe('buildReminderPlan', () => {
    it('maps a reminder onto the same work, addressed to everybody', async () => {
      const plan = await repository.buildReminderPlan(REMINDER);

      expect(plan).toEqual({
        source: DeliverySource.Reminder,
        campaignId: null,
        reminderId: 'rmd-1',
        eventKey: null,
        subject: REMINDER.subject,
        title: REMINDER.subject,
        message: REMINDER.message,
        category: NotificationCategory.REMINDER,
        type: NotificationType.INFO,
        priority: NotificationPriority.LOW,
        sendEmail: false,
        sendNotification: true,
        workspace: NotificationWorkspace.PERSONAL,
        recipientType: NotificationRecipientType.USER,
        targets: [target('1'), target('2')],
        emailRecipients: ['person1@example.com', 'person2@example.com'],
      });
      expect(employees.findDeliveryTargets).toHaveBeenCalledWith();
    });

    // The "internal campaign" a reminder run creates is this value, not a row:
    // `created_by_employee_id` is NOT NULL because a campaign is something a
    // person wrote, and a scheduler is not a person.
    it('writes no campaign row', async () => {
      const plan = await repository.buildReminderPlan(REMINDER);

      expect(plan.campaignId).toBeNull();
      expect(campaigns.markSent).not.toHaveBeenCalled();
      expect(campaigns.findForDelivery).not.toHaveBeenCalled();
    });
  });
});
