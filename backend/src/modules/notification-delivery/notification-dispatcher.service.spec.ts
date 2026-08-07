import { ConflictException, NotFoundException } from '@nestjs/common';
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
import { EmailException } from '../email/email.exception';
import { EmailService } from '../email/email.service';
import { ReminderRow } from '../notification-management/entities/reminder.entity';
import { CampaignDelivery } from '../notification-management/notification-campaign.service';
import { NotificationService } from '../notifications/notification.service';
import { EmailDeliveryStatus } from './entities/delivery-result.entity';
import { DeliverySource } from './notification-delivery.constants';
import {
  DeliveryPlan,
  NotificationDeliveryRepository,
} from './notification-delivery.repository';
import { NotificationDispatcher } from './notification-dispatcher.service';

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
  name: 'Timesheet due today',
  description: null,
  enabled: true,
  daysBeforeDeadline: 0,
  subject: 'Your timesheet is due today',
  message: 'Please complete your timesheet before the end of the day.',
  severity: NotificationType.WARNING,
  priority: NotificationPriority.HIGH,
  sendEmail: true,
  sendNotification: true,
  createdAt: new Date('2026-08-05T10:00:00.000Z'),
  updatedAt: new Date('2026-08-05T10:00:00.000Z'),
};

const PLAN: DeliveryPlan = {
  source: DeliverySource.Campaign,
  campaignId: 'cmp-1',
  reminderId: null,
  eventKey: null,
  subject: 'Planned maintenance',
  title: 'Planned maintenance',
  message: CAMPAIGN.message,
  category: NotificationCategory.GENERAL,
  type: NotificationType.WARNING,
  priority: NotificationPriority.HIGH,
  sendEmail: true,
  sendNotification: true,
  // The pairing every campaign and reminder has always produced, stated on the
  // plan since Feature 030 rather than written into the dispatcher.
  workspace: NotificationWorkspace.PERSONAL,
  recipientType: NotificationRecipientType.USER,
  targets: [
    { employeeId: 'emp-1', userId: 'usr-1', email: 'one@example.com' },
    { employeeId: 'emp-2', userId: 'usr-2', email: 'two@example.com' },
  ],
  emailRecipients: ['one@example.com', 'two@example.com'],
};

const planOf = (overrides: Partial<DeliveryPlan> = {}): DeliveryPlan => ({
  ...PLAN,
  ...overrides,
});

describe('NotificationDispatcher', () => {
  let dispatcher: NotificationDispatcher;
  let deliveries: {
    findCampaign: jest.Mock;
    findDueCampaignIds: jest.Mock;
    claimCampaign: jest.Mock;
    findEnabledReminders: jest.Mock;
    buildCampaignPlan: jest.Mock;
    buildReminderPlan: jest.Mock;
  };
  let notifications: { createMany: jest.Mock };
  let email: { sendMany: jest.Mock };

  beforeEach(async () => {
    deliveries = {
      findCampaign: jest.fn().mockResolvedValue(CAMPAIGN),
      findDueCampaignIds: jest.fn().mockResolvedValue([]),
      claimCampaign: jest.fn().mockResolvedValue(true),
      findEnabledReminders: jest.fn().mockResolvedValue([]),
      buildCampaignPlan: jest.fn().mockResolvedValue(PLAN),
      buildReminderPlan: jest.fn().mockResolvedValue(PLAN),
    };
    notifications = {
      createMany: jest
        .fn()
        .mockImplementation((dtos: unknown[]) =>
          Promise.resolve(dtos.map((_dto, index) => ({ id: `ntf-${index}` }))),
        ),
    };
    email = { sendMany: jest.fn().mockResolvedValue(undefined) };

    const moduleRef: TestingModule = await Test.createTestingModule({
      providers: [
        NotificationDispatcher,
        { provide: NotificationDeliveryRepository, useValue: deliveries },
        { provide: NotificationService, useValue: notifications },
        { provide: EmailService, useValue: email },
      ],
    }).compile();

    dispatcher = moduleRef.get(NotificationDispatcher);
  });

  describe('executeCampaign', () => {
    it('reports what the run did', async () => {
      const result = await dispatcher.executeCampaign('cmp-1');

      expect(result).toEqual({
        source: DeliverySource.Campaign,
        campaignId: 'cmp-1',
        reminderId: null,
        // Null on a campaign: only an event names one. Added by Feature 030.
        eventKey: null,
        recipientCount: 2,
        notificationsCreated: 2,
        emailsSent: 2,
        emailStatus: EmailDeliveryStatus.Sent,
        sentAt: expect.any(String) as string,
      });
    });

    // One row per person rather than one `ALL_USERS` broadcast: each employee's
    // copy is theirs to read, dismiss and count, which is what makes the unread
    // counter a number about one person.
    it('creates one personal notification per recipient, addressed to their account', async () => {
      await dispatcher.executeCampaign('cmp-1');

      expect(notifications.createMany).toHaveBeenCalledWith([
        {
          workspace: NotificationWorkspace.PERSONAL,
          recipientType: NotificationRecipientType.USER,
          recipientUserId: 'usr-1',
          title: 'Planned maintenance',
          message: PLAN.message,
          category: NotificationCategory.GENERAL,
          type: NotificationType.WARNING,
          priority: NotificationPriority.HIGH,
        },
        expect.objectContaining({ recipientUserId: 'usr-2' }),
      ]);
    });

    it('sends one email per recipient through the email module', async () => {
      await dispatcher.executeCampaign('cmp-1');

      expect(email.sendMany).toHaveBeenCalledWith({
        recipients: ['one@example.com', 'two@example.com'],
        subject: 'Planned maintenance',
        text: expect.stringContaining(PLAN.message) as string,
        html: expect.stringContaining(PLAN.message) as string,
      });
    });

    it('marks the campaign sent, with the moment it reports', async () => {
      const result = await dispatcher.executeCampaign('cmp-1');

      expect(deliveries.claimCampaign).toHaveBeenCalledWith(
        'cmp-1',
        new Date(result.sentAt),
      );
    });

    // Resolving the audience first means a failure to read the directory leaves
    // the campaign unclaimed and retryable; claiming first would burn it.
    it('resolves the audience before it claims the campaign', async () => {
      const order: string[] = [];

      deliveries.buildCampaignPlan.mockImplementation(() => {
        order.push('resolve');

        return Promise.resolve(PLAN);
      });
      deliveries.claimCampaign.mockImplementation(() => {
        order.push('claim');

        return Promise.resolve(true);
      });

      await dispatcher.executeCampaign('cmp-1');

      expect(order).toEqual(['resolve', 'claim']);
    });

    it('claims the campaign before anything is delivered', async () => {
      const order: string[] = [];

      deliveries.claimCampaign.mockImplementation(() => {
        order.push('claim');

        return Promise.resolve(true);
      });
      notifications.createMany.mockImplementation(() => {
        order.push('notify');

        return Promise.resolve([]);
      });
      email.sendMany.mockImplementation(() => {
        order.push('email');

        return Promise.resolve(undefined);
      });

      await dispatcher.executeCampaign('cmp-1');

      expect(order).toEqual(['claim', 'notify', 'email']);
    });

    it('answers 404 for a campaign that does not exist', async () => {
      deliveries.findCampaign.mockResolvedValue(null);

      await expect(dispatcher.executeCampaign('cmp-x')).rejects.toBeInstanceOf(
        NotFoundException,
      );
      expect(deliveries.claimCampaign).not.toHaveBeenCalled();
    });

    it.each([
      NotificationCampaignStatus.SENT,
      NotificationCampaignStatus.CANCELLED,
    ])('answers 409 for a %s campaign, naming the status', async (status) => {
      deliveries.findCampaign.mockResolvedValue({ ...CAMPAIGN, status });

      await expect(dispatcher.executeCampaign('cmp-1')).rejects.toThrow(
        new RegExp(status),
      );
      expect(notifications.createMany).not.toHaveBeenCalled();
      expect(email.sendMany).not.toHaveBeenCalled();
    });

    it('sends a DRAFT campaign, because this is somebody asking for it now', async () => {
      deliveries.findCampaign.mockResolvedValue({
        ...CAMPAIGN,
        status: NotificationCampaignStatus.DRAFT,
      });

      await expect(dispatcher.executeCampaign('cmp-1')).resolves.toEqual(
        expect.objectContaining({ notificationsCreated: 2 }),
      );
    });

    // Feature 027 left "what an expiry means" to the engine. This is the answer.
    it('refuses a campaign whose expiry has passed', async () => {
      deliveries.findCampaign.mockResolvedValue({
        ...CAMPAIGN,
        expiresAt: new Date('2020-01-01T00:00:00.000Z'),
      });

      await expect(dispatcher.executeCampaign('cmp-1')).rejects.toThrow(
        /expired/,
      );
      expect(deliveries.claimCampaign).not.toHaveBeenCalled();
    });

    it('sends a campaign whose expiry is still ahead', async () => {
      deliveries.findCampaign.mockResolvedValue({
        ...CAMPAIGN,
        expiresAt: new Date('2999-01-01T00:00:00.000Z'),
      });

      await expect(dispatcher.executeCampaign('cmp-1')).resolves.toBeDefined();
    });

    // The claim is what makes "never send duplicate notifications" true rather
    // than hoped for: a second run finds no row to update.
    it('refuses to deliver when the claim was lost to another run', async () => {
      deliveries.claimCampaign.mockResolvedValue(false);

      await expect(dispatcher.executeCampaign('cmp-1')).rejects.toBeInstanceOf(
        ConflictException,
      );
      expect(notifications.createMany).not.toHaveBeenCalled();
      expect(email.sendMany).not.toHaveBeenCalled();
    });
  });

  describe('the two delivery switches', () => {
    it('creates no notification when sendNotification is false', async () => {
      deliveries.buildCampaignPlan.mockResolvedValue(
        planOf({ sendNotification: false }),
      );

      const result = await dispatcher.executeCampaign('cmp-1');

      expect(notifications.createMany).not.toHaveBeenCalled();
      expect(result.notificationsCreated).toBe(0);
      expect(result.emailsSent).toBe(2);
    });

    it('sends no email when sendEmail is false', async () => {
      deliveries.buildCampaignPlan.mockResolvedValue(
        planOf({ sendEmail: false }),
      );

      const result = await dispatcher.executeCampaign('cmp-1');

      expect(email.sendMany).not.toHaveBeenCalled();
      expect(result.emailStatus).toBe(EmailDeliveryStatus.Skipped);
      expect(result.emailsSent).toBe(0);
    });

    // A campaign addressed to three people who have all left is not an error to
    // raise at whoever pressed the button.
    it('is a successful delivery of nothing when the audience resolves to nobody', async () => {
      // Both lists, because Feature 030 separated who gets a notification from
      // where the email copy goes. An audience of nobody has neither.
      deliveries.buildCampaignPlan.mockResolvedValue(
        planOf({ targets: [], emailRecipients: [] }),
      );

      const result = await dispatcher.executeCampaign('cmp-1');

      expect(result).toEqual(
        expect.objectContaining({
          recipientCount: 0,
          notificationsCreated: 0,
          emailsSent: 0,
          emailStatus: EmailDeliveryStatus.Skipped,
        }),
      );
      expect(notifications.createMany).not.toHaveBeenCalled();
      expect(email.sendMany).not.toHaveBeenCalled();
      // The campaign is still claimed: it went out, to nobody.
      expect(deliveries.claimCampaign).toHaveBeenCalled();
    });
  });

  describe('when the mail server fails', () => {
    beforeEach(() => {
      email.sendMany.mockRejectedValue(new EmailException('nope'));
    });

    it('reports the failure instead of losing the delivery', async () => {
      const result = await dispatcher.executeCampaign('cmp-1');

      expect(result.emailStatus).toBe(EmailDeliveryStatus.Failed);
      expect(result.emailsSent).toBe(0);
      expect(result.notificationsCreated).toBe(2);
    });

    it('leaves the notifications in place and the campaign sent', async () => {
      await dispatcher.executeCampaign('cmp-1');

      expect(notifications.createMany).toHaveBeenCalled();
      expect(deliveries.claimCampaign).toHaveBeenCalled();
    });

    // Only the email module's own exception is swallowed. Anything else is a bug
    // and must not be reported as a successful delivery.
    it('propagates a failure that is not an email failure', async () => {
      email.sendMany.mockRejectedValue(new Error('out of memory'));

      await expect(dispatcher.executeCampaign('cmp-1')).rejects.toThrow(
        'out of memory',
      );
    });
  });

  describe('executeReminder', () => {
    it('delivers a reminder through the same path', async () => {
      deliveries.buildReminderPlan.mockResolvedValue(
        planOf({
          source: DeliverySource.Reminder,
          campaignId: null,
          reminderId: 'rmd-1',
          category: NotificationCategory.REMINDER,
        }),
      );

      const result = await dispatcher.executeReminder(REMINDER);

      expect(result).toEqual(
        expect.objectContaining({
          source: DeliverySource.Reminder,
          campaignId: null,
          reminderId: 'rmd-1',
          notificationsCreated: 2,
          emailsSent: 2,
        }),
      );
      expect(notifications.createMany).toHaveBeenCalledWith([
        expect.objectContaining({
          category: NotificationCategory.REMINDER,
        }),
        expect.objectContaining({
          category: NotificationCategory.REMINDER,
        }),
      ]);
    });

    it('claims nothing, because a reminder writes no campaign', async () => {
      await dispatcher.executeReminder(REMINDER);

      expect(deliveries.claimCampaign).not.toHaveBeenCalled();
      expect(deliveries.findCampaign).not.toHaveBeenCalled();
    });
  });
});
