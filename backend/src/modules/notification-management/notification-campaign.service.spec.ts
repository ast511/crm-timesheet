import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';

import { CurrentUser } from '../../common/decorators/current-user.decorator';
import {
  CampaignRecipientType,
  NotificationCampaignStatus,
  NotificationPriority,
  NotificationType,
  UserRole,
} from '../../generated/prisma/enums';
import { PrismaService } from '../../prisma/prisma.service';
import { EmployeeService } from '../employees/employee.service';
import { CreateNotificationCampaignDto } from './dto/create-notification-campaign.dto';
import { NotificationCampaignQueryDto } from './dto/notification-campaign-query.dto';
import { NotificationCampaignService } from './notification-campaign.service';

const admin: CurrentUser = {
  userId: 'usr-1',
  employeeId: 'emp-author',
  role: UserRole.ADMIN,
  administrativeAccess: true,
};

/** An account with no employment record — a super-admin who administers the system. */
const accountWithoutEmployee: CurrentUser = { ...admin, employeeId: null };

const AUTHOR = {
  id: 'emp-author',
  employeeCode: 'E-001',
  firstName: 'Ana',
  lastName: 'Ionescu',
};

/** Comfortably ahead of any clock a test could run on. */
const FUTURE = '2099-01-01T08:00:00.000Z';
const LATER = '2099-01-02T08:00:00.000Z';
const PAST = '2020-01-01T08:00:00.000Z';

/** A row as `CAMPAIGN_DETAIL_SELECT` returns it. */
const DETAIL_ROW = {
  id: 'cmp-1',
  subject: 'Planned maintenance',
  message: 'The system will be unavailable on Saturday morning.',
  severity: NotificationType.WARNING,
  priority: NotificationPriority.HIGH,
  sendEmail: true,
  sendNotification: true,
  status: NotificationCampaignStatus.DRAFT,
  scheduledAt: null,
  expiresAt: null,
  sentAt: null,
  createdBy: AUTHOR,
  recipients: [
    {
      id: 'rcp-1',
      recipientType: CampaignRecipientType.EMPLOYEE,
      employee: {
        id: 'emp-1',
        employeeCode: 'E-002',
        firstName: 'Radu',
        lastName: 'Popescu',
      },
    },
  ],
  createdAt: new Date('2026-08-05T10:00:00.000Z'),
  updatedAt: new Date('2026-08-05T10:00:00.000Z'),
};

/** The same campaign as `CAMPAIGN_LIST_SELECT` returns it. */
const LIST_ROW = {
  ...DETAIL_ROW,
  recipients: [{ recipientType: CampaignRecipientType.EMPLOYEE }],
};

const CREATE_BODY: CreateNotificationCampaignDto = {
  subject: 'Planned maintenance',
  message: 'The system will be unavailable on Saturday morning.',
  severity: NotificationType.WARNING,
  priority: NotificationPriority.HIGH,
  sendEmail: true,
  sendNotification: true,
  recipientType: CampaignRecipientType.EMPLOYEE,
  employeeIds: ['emp-1'],
};

/**
 * The field messages inside an exception thrown with an array payload.
 *
 * `.message` on such an exception is the generic `"Bad Request Exception"`; the
 * messages a client actually reads live in `response.message`, which is the
 * shape the global `ValidationPipe` produces and the shape this service copies
 * so a form can mark each offending field.
 */
const messagesFrom = async (call: Promise<unknown>): Promise<string[]> => {
  try {
    await call;
  } catch (error) {
    const response = (error as BadRequestException).getResponse();
    const { message } = response as { message: string | string[] };

    return Array.isArray(message) ? message : [message];
  }

  throw new Error('Expected the call to reject, but it resolved');
};

const defaultQuery = (overrides: Partial<NotificationCampaignQueryDto> = {}) =>
  Object.assign(
    new NotificationCampaignQueryDto(),
    overrides,
  ) as NotificationCampaignQueryDto;

describe('NotificationCampaignService', () => {
  let service: NotificationCampaignService;
  let prisma: {
    notificationCampaign: {
      findMany: jest.Mock;
      findUnique: jest.Mock;
      count: jest.Mock;
      create: jest.Mock;
      update: jest.Mock;
      delete: jest.Mock;
    };
    notificationRecipient: { deleteMany: jest.Mock; createMany: jest.Mock };
    $transaction: jest.Mock;
  };
  let employees: { findStatus: jest.Mock; findExistingIds: jest.Mock };

  /** The `data` the last `create` was handed. */
  const createdData = () =>
    (prisma.notificationCampaign.create.mock.calls[0][0] as { data: any }).data;

  /** The `data` the last `update` was handed. */
  const updatedData = () =>
    (prisma.notificationCampaign.update.mock.calls[0][0] as { data: any }).data;

  beforeEach(async () => {
    prisma = {
      notificationCampaign: {
        findMany: jest.fn().mockResolvedValue([LIST_ROW]),
        findUnique: jest.fn().mockResolvedValue(DETAIL_ROW),
        count: jest.fn().mockResolvedValue(1),
        create: jest.fn().mockResolvedValue(DETAIL_ROW),
        update: jest.fn().mockResolvedValue(DETAIL_ROW),
        delete: jest.fn().mockResolvedValue(DETAIL_ROW),
      },
      notificationRecipient: {
        deleteMany: jest.fn().mockResolvedValue({ count: 1 }),
        createMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      $transaction: jest.fn((argument: unknown) =>
        typeof argument === 'function'
          ? (argument as (tx: unknown) => unknown)(prisma)
          : Promise.all(argument as Promise<unknown>[]),
      ),
    };
    employees = {
      findStatus: jest.fn().mockResolvedValue('ACTIVE'),
      findExistingIds: jest.fn((ids: string[]) => Promise.resolve([...ids])),
    };

    const moduleRef: TestingModule = await Test.createTestingModule({
      providers: [
        NotificationCampaignService,
        { provide: PrismaService, useValue: prisma },
        { provide: EmployeeService, useValue: employees },
      ],
    }).compile();

    service = moduleRef.get(NotificationCampaignService);
  });

  describe('findAll', () => {
    it('summarises the audience rather than resolving it', async () => {
      const result = await service.findAll(defaultQuery());

      expect(result.items[0]).toEqual(
        expect.objectContaining({
          recipientType: CampaignRecipientType.EMPLOYEE,
          recipientCount: 1,
        }),
      );
      expect(result.items[0]).not.toHaveProperty('recipients');
    });

    it('reads the rows and the count in one transaction', async () => {
      await service.findAll(defaultQuery());

      expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    });

    it('searches subject and message, case-insensitively', async () => {
      await service.findAll(defaultQuery({ search: 'maintenance' }));

      const { where } = prisma.notificationCampaign.findMany.mock
        .calls[0][0] as {
        where: { AND: { OR?: unknown[] }[] };
      };

      expect(where.AND[0].OR).toEqual([
        { subject: { contains: 'maintenance', mode: 'insensitive' } },
        { message: { contains: 'maintenance', mode: 'insensitive' } },
      ]);
    });

    it('ANDs every filter rather than merging them', async () => {
      await service.findAll(
        defaultQuery({
          search: 'maintenance',
          status: NotificationCampaignStatus.SCHEDULED,
          severity: NotificationType.WARNING,
          priority: NotificationPriority.HIGH,
          sendEmail: true,
          sendNotification: false,
        }),
      );

      const { where } = prisma.notificationCampaign.findMany.mock
        .calls[0][0] as { where: { AND: unknown[] } };

      expect(where.AND).toHaveLength(6);
      expect(where.AND).toContainEqual({
        status: NotificationCampaignStatus.SCHEDULED,
      });
      expect(where.AND).toContainEqual({ sendEmail: true });
      expect(where.AND).toContainEqual({ sendNotification: false });
    });

    it('lets SENT be filtered on, even though it cannot be written', async () => {
      await service.findAll(
        defaultQuery({ status: NotificationCampaignStatus.SENT }),
      );

      const { where } = prisma.notificationCampaign.findMany.mock
        .calls[0][0] as { where: { AND: unknown[] } };

      expect(where.AND).toContainEqual({
        status: NotificationCampaignStatus.SENT,
      });
    });
  });

  describe('findOne', () => {
    it('resolves every recipient to a person', async () => {
      const campaign = await service.findOne('cmp-1');

      expect(campaign.recipients).toEqual([
        {
          id: 'rcp-1',
          recipientType: CampaignRecipientType.EMPLOYEE,
          employee: {
            id: 'emp-1',
            employeeCode: 'E-002',
            firstName: 'Radu',
            lastName: 'Popescu',
          },
        },
      ]);
    });

    it('reports a missing campaign as a 404', async () => {
      prisma.notificationCampaign.findUnique.mockResolvedValue(null);

      await expect(service.findOne('cmp-404')).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });

  describe('create — recipients', () => {
    it('writes one row for one employee', async () => {
      await service.create(admin, CREATE_BODY);

      expect(createdData().recipients.create).toEqual([
        {
          recipientType: CampaignRecipientType.EMPLOYEE,
          employeeId: 'emp-1',
        },
      ]);
    });

    it('writes one row per employee for several', async () => {
      await service.create(admin, {
        ...CREATE_BODY,
        employeeIds: ['emp-1', 'emp-2', 'emp-3'],
      });

      expect(createdData().recipients.create).toEqual([
        { recipientType: CampaignRecipientType.EMPLOYEE, employeeId: 'emp-1' },
        { recipientType: CampaignRecipientType.EMPLOYEE, employeeId: 'emp-2' },
        { recipientType: CampaignRecipientType.EMPLOYEE, employeeId: 'emp-3' },
      ]);
    });

    it('writes exactly ONE row for all employees, with a null employee', async () => {
      await service.create(admin, {
        ...CREATE_BODY,
        recipientType: CampaignRecipientType.ALL_EMPLOYEES,
        employeeIds: undefined,
      });

      expect(createdData().recipients.create).toEqual([
        {
          recipientType: CampaignRecipientType.ALL_EMPLOYEES,
          employeeId: null,
        },
      ]);
    });

    it('does not look a single employee up for an ALL_EMPLOYEES campaign', async () => {
      await service.create(admin, {
        ...CREATE_BODY,
        recipientType: CampaignRecipientType.ALL_EMPLOYEES,
        employeeIds: undefined,
      });

      expect(employees.findExistingIds).not.toHaveBeenCalled();
    });

    it('refuses employeeIds alongside ALL_EMPLOYEES rather than dropping them', async () => {
      await expect(
        messagesFrom(
          service.create(admin, {
            ...CREATE_BODY,
            recipientType: CampaignRecipientType.ALL_EMPLOYEES,
            employeeIds: ['emp-1'],
          }),
        ),
      ).resolves.toEqual([
        expect.stringContaining('employeeIds must not be sent'),
      ]);

      expect(prisma.notificationCampaign.create).not.toHaveBeenCalled();
    });

    it('refuses an EMPLOYEE campaign with no recipients', async () => {
      await expect(
        messagesFrom(
          service.create(admin, { ...CREATE_BODY, employeeIds: undefined }),
        ),
      ).resolves.toEqual([expect.stringContaining('employeeIds is required')]);

      expect(prisma.notificationCampaign.create).not.toHaveBeenCalled();
    });

    it('names every recipient that does not exist, in one message list', async () => {
      employees.findExistingIds.mockResolvedValue(['emp-1']);

      await expect(
        messagesFrom(
          service.create(admin, {
            ...CREATE_BODY,
            employeeIds: ['emp-1', 'emp-missing', 'emp-also-missing'],
          }),
        ),
      ).resolves.toEqual([
        'Recipient employee emp-missing does not exist',
        'Recipient employee emp-also-missing does not exist',
      ]);
    });

    it('asks the employees module rather than querying the table', async () => {
      await service.create(admin, CREATE_BODY);

      expect(employees.findExistingIds).toHaveBeenCalledWith(['emp-1']);
    });
  });

  describe('create — status and schedule', () => {
    it('stores an unscheduled campaign as a DRAFT', async () => {
      await service.create(admin, CREATE_BODY);

      expect(createdData()).toEqual(
        expect.objectContaining({
          status: NotificationCampaignStatus.DRAFT,
          scheduledAt: null,
          expiresAt: null,
        }),
      );
    });

    it('stores a scheduled campaign as SCHEDULED', async () => {
      await service.create(admin, { ...CREATE_BODY, scheduledAt: FUTURE });

      expect(createdData()).toEqual(
        expect.objectContaining({
          status: NotificationCampaignStatus.SCHEDULED,
          scheduledAt: new Date(FUTURE),
        }),
      );
    });

    it('never writes sentAt, whatever it was asked for', async () => {
      await service.create(admin, { ...CREATE_BODY, scheduledAt: FUTURE });

      expect(createdData()).not.toHaveProperty('sentAt');
    });

    it('refuses a schedule in the past', async () => {
      await expect(
        messagesFrom(
          service.create(admin, { ...CREATE_BODY, scheduledAt: PAST }),
        ),
      ).resolves.toEqual(['scheduledAt must be in the future']);
    });

    it('accepts an expiry later than the schedule', async () => {
      await service.create(admin, {
        ...CREATE_BODY,
        scheduledAt: FUTURE,
        expiresAt: LATER,
      });

      expect(createdData()).toEqual(
        expect.objectContaining({ expiresAt: new Date(LATER) }),
      );
    });

    it('refuses an expiry before the schedule', async () => {
      await expect(
        messagesFrom(
          service.create(admin, {
            ...CREATE_BODY,
            scheduledAt: LATER,
            expiresAt: FUTURE,
          }),
        ),
      ).resolves.toEqual(['expiresAt must be later than scheduledAt']);
    });

    it('refuses an expiry equal to the schedule — a campaign over before it begins', async () => {
      await expect(
        messagesFrom(
          service.create(admin, {
            ...CREATE_BODY,
            scheduledAt: FUTURE,
            expiresAt: FUTURE,
          }),
        ),
      ).resolves.toEqual(['expiresAt must be later than scheduledAt']);
    });

    it('refuses an expiry already past on a campaign with no schedule', async () => {
      await expect(
        messagesFrom(
          service.create(admin, { ...CREATE_BODY, expiresAt: PAST }),
        ),
      ).resolves.toEqual([
        'expiresAt must be in the future when the campaign has no scheduledAt',
      ]);
    });

    it('reports both date problems at once', async () => {
      await expect(
        messagesFrom(
          service.create(admin, {
            ...CREATE_BODY,
            scheduledAt: PAST,
            expiresAt: '2019-01-01T08:00:00.000Z',
          }),
        ),
      ).resolves.toHaveLength(2);
    });
  });

  describe('create — delivery and authorship', () => {
    it('refuses a campaign that would reach nobody by any channel', async () => {
      await expect(
        service.create(admin, {
          ...CREATE_BODY,
          sendEmail: false,
          sendNotification: false,
        }),
      ).rejects.toBeInstanceOf(BadRequestException);

      expect(prisma.notificationCampaign.create).not.toHaveBeenCalled();
    });

    it('checks the delivery methods before it touches the database', async () => {
      await expect(
        service.create(admin, {
          ...CREATE_BODY,
          sendEmail: false,
          sendNotification: false,
        }),
      ).rejects.toBeInstanceOf(BadRequestException);

      expect(employees.findStatus).not.toHaveBeenCalled();
    });

    it('records the caller as the author', async () => {
      await service.create(admin, CREATE_BODY);

      expect(createdData().createdByEmployeeId).toBe('emp-author');
    });

    it('refuses an account with no employee record, naming the header', async () => {
      await expect(
        messagesFrom(service.create(accountWithoutEmployee, CREATE_BODY)),
      ).resolves.toEqual([expect.stringContaining('x-employee-id')]);

      expect(prisma.notificationCampaign.create).not.toHaveBeenCalled();
    });

    it('refuses an author who does not exist, as a 400 rather than a 404', async () => {
      employees.findStatus.mockResolvedValue(null);

      await expect(service.create(admin, CREATE_BODY)).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });

    it('writes the campaign and its recipients in one statement', async () => {
      await service.create(admin, CREATE_BODY);

      expect(createdData().recipients).toBeDefined();
      expect(prisma.notificationRecipient.createMany).not.toHaveBeenCalled();
    });
  });

  describe('update', () => {
    const draft = {
      id: 'cmp-1',
      status: NotificationCampaignStatus.DRAFT,
      scheduledAt: null,
      expiresAt: null,
      sendEmail: true,
      sendNotification: true,
    };

    beforeEach(() => {
      // The facts read first, then the detail row the method returns.
      prisma.notificationCampaign.findUnique
        .mockResolvedValueOnce(draft)
        .mockResolvedValue(DETAIL_ROW);
    });

    it('applies a partial patch and leaves the rest alone', async () => {
      await service.update('cmp-1', { subject: 'Maintenance postponed' });

      expect(updatedData()).toEqual(
        expect.objectContaining({
          subject: 'Maintenance postponed',
          message: undefined,
          scheduledAt: undefined,
          expiresAt: undefined,
        }),
      );
    });

    it('schedules a draft by giving it a scheduledAt', async () => {
      await service.update('cmp-1', { scheduledAt: FUTURE });

      expect(updatedData()).toEqual(
        expect.objectContaining({
          scheduledAt: new Date(FUTURE),
          status: NotificationCampaignStatus.SCHEDULED,
        }),
      );
    });

    it('returns a scheduled campaign to DRAFT when the schedule is cleared', async () => {
      prisma.notificationCampaign.findUnique.mockReset();
      prisma.notificationCampaign.findUnique
        .mockResolvedValueOnce({
          ...draft,
          status: NotificationCampaignStatus.SCHEDULED,
          scheduledAt: new Date(FUTURE),
        })
        .mockResolvedValue(DETAIL_ROW);

      await service.update('cmp-1', { scheduledAt: null });

      expect(updatedData()).toEqual(
        expect.objectContaining({
          scheduledAt: null,
          status: NotificationCampaignStatus.DRAFT,
        }),
      );
    });

    it('cancels a campaign', async () => {
      await service.update('cmp-1', {
        status: NotificationCampaignStatus.CANCELLED,
      });

      expect(updatedData().status).toBe(NotificationCampaignStatus.CANCELLED);
    });

    it('refuses to edit a SENT campaign, naming the status', async () => {
      prisma.notificationCampaign.findUnique.mockReset();
      prisma.notificationCampaign.findUnique.mockResolvedValue({
        ...draft,
        status: NotificationCampaignStatus.SENT,
      });

      await expect(
        service.update('cmp-1', { subject: 'Too late' }),
      ).rejects.toBeInstanceOf(ConflictException);

      expect(prisma.notificationCampaign.update).not.toHaveBeenCalled();
    });

    it('refuses to edit a CANCELLED campaign', async () => {
      prisma.notificationCampaign.findUnique.mockReset();
      prisma.notificationCampaign.findUnique.mockResolvedValue({
        ...draft,
        status: NotificationCampaignStatus.CANCELLED,
      });

      await expect(
        service.update('cmp-1', { subject: 'Reviving this' }),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('reports a missing campaign as a 404', async () => {
      prisma.notificationCampaign.findUnique.mockReset();
      prisma.notificationCampaign.findUnique.mockResolvedValue(null);

      await expect(
        service.update('cmp-404', { subject: 'Nothing here' }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('judges the delivery methods against the stored pair', async () => {
      prisma.notificationCampaign.findUnique.mockReset();
      prisma.notificationCampaign.findUnique
        .mockResolvedValueOnce({ ...draft, sendNotification: false })
        .mockResolvedValue(DETAIL_ROW);

      await expect(
        service.update('cmp-1', { sendEmail: false }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('does not re-judge a stored schedule the clock has overtaken', async () => {
      prisma.notificationCampaign.findUnique.mockReset();
      prisma.notificationCampaign.findUnique
        .mockResolvedValueOnce({
          ...draft,
          status: NotificationCampaignStatus.SCHEDULED,
          scheduledAt: new Date(PAST),
        })
        .mockResolvedValue(DETAIL_ROW);

      // Late is not invalid: fixing a typo must not be refused because time
      // passed while the engine had not yet reached the campaign.
      await service.update('cmp-1', { subject: 'Corrected wording' });

      expect(prisma.notificationCampaign.update).toHaveBeenCalled();
    });

    it('checks the merged pair of dates, not only the one that moved', async () => {
      prisma.notificationCampaign.findUnique.mockReset();
      prisma.notificationCampaign.findUnique
        .mockResolvedValueOnce({ ...draft, expiresAt: new Date(FUTURE) })
        .mockResolvedValue(DETAIL_ROW);

      await expect(
        messagesFrom(service.update('cmp-1', { scheduledAt: LATER })),
      ).resolves.toEqual(['expiresAt must be later than scheduledAt']);
    });

    it('replaces the whole audience when a recipient type is sent', async () => {
      await service.update('cmp-1', {
        recipientType: CampaignRecipientType.EMPLOYEE,
        employeeIds: ['emp-7', 'emp-8'],
      });

      expect(prisma.notificationRecipient.deleteMany).toHaveBeenCalledWith({
        where: { campaignId: 'cmp-1' },
      });
      expect(prisma.notificationRecipient.createMany).toHaveBeenCalledWith({
        data: [
          {
            recipientType: CampaignRecipientType.EMPLOYEE,
            employeeId: 'emp-7',
            campaignId: 'cmp-1',
          },
          {
            recipientType: CampaignRecipientType.EMPLOYEE,
            employeeId: 'emp-8',
            campaignId: 'cmp-1',
          },
        ],
      });
    });

    it('switches an audience to ALL_EMPLOYEES as one row', async () => {
      await service.update('cmp-1', {
        recipientType: CampaignRecipientType.ALL_EMPLOYEES,
      });

      expect(prisma.notificationRecipient.createMany).toHaveBeenCalledWith({
        data: [
          {
            recipientType: CampaignRecipientType.ALL_EMPLOYEES,
            employeeId: null,
            campaignId: 'cmp-1',
          },
        ],
      });
    });

    it('leaves the audience alone when no recipient type is sent', async () => {
      await service.update('cmp-1', { subject: 'Only the wording' });

      expect(prisma.notificationRecipient.deleteMany).not.toHaveBeenCalled();
      expect(prisma.notificationRecipient.createMany).not.toHaveBeenCalled();
    });

    it('refuses employeeIds without a recipient type', async () => {
      await expect(
        messagesFrom(service.update('cmp-1', { employeeIds: ['emp-7'] })),
      ).resolves.toEqual([
        expect.stringContaining('employeeIds must be sent with recipientType'),
      ]);

      expect(prisma.notificationCampaign.update).not.toHaveBeenCalled();
    });

    it('replaces the recipients and updates the campaign in one transaction', async () => {
      await service.update('cmp-1', {
        recipientType: CampaignRecipientType.EMPLOYEE,
        employeeIds: ['emp-7'],
      });

      expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    });

    it('never writes sentAt or SENT', async () => {
      await service.update('cmp-1', { scheduledAt: FUTURE });

      expect(updatedData()).not.toHaveProperty('sentAt');
      expect(updatedData().status).not.toBe(NotificationCampaignStatus.SENT);
    });
  });

  describe('remove', () => {
    it('deletes a draft', async () => {
      prisma.notificationCampaign.findUnique.mockResolvedValue({
        id: 'cmp-1',
        status: NotificationCampaignStatus.DRAFT,
        scheduledAt: null,
        expiresAt: null,
        sendEmail: true,
        sendNotification: true,
      });

      await service.remove('cmp-1');

      expect(prisma.notificationCampaign.delete).toHaveBeenCalledWith({
        where: { id: 'cmp-1' },
      });
    });

    it('deletes a cancelled campaign — it never went out', async () => {
      prisma.notificationCampaign.findUnique.mockResolvedValue({
        id: 'cmp-1',
        status: NotificationCampaignStatus.CANCELLED,
        scheduledAt: null,
        expiresAt: null,
        sendEmail: true,
        sendNotification: true,
      });

      await service.remove('cmp-1');

      expect(prisma.notificationCampaign.delete).toHaveBeenCalled();
    });

    it('refuses to delete a SENT campaign', async () => {
      prisma.notificationCampaign.findUnique.mockResolvedValue({
        id: 'cmp-1',
        status: NotificationCampaignStatus.SENT,
        scheduledAt: null,
        expiresAt: null,
        sendEmail: true,
        sendNotification: true,
      });

      await expect(service.remove('cmp-1')).rejects.toBeInstanceOf(
        ConflictException,
      );

      expect(prisma.notificationCampaign.delete).not.toHaveBeenCalled();
    });

    it('reports a missing campaign as a 404', async () => {
      prisma.notificationCampaign.findUnique.mockResolvedValue(null);

      await expect(service.remove('cmp-404')).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });
});
