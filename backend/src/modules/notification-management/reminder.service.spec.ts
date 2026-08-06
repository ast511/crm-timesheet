import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';

import { SortOrder } from '../../common/enums/sort-order.enum';
import {
  NotificationPriority,
  NotificationType,
} from '../../generated/prisma/enums';
import { PrismaService } from '../../prisma/prisma.service';
import { ReminderQueryDto } from './dto/reminder-query.dto';
import { ReminderRow } from './entities/reminder.entity';
import { ReminderService } from './reminder.service';

/** A row as PostgreSQL returns it — `Date` objects, not strings. */
const REMINDER: ReminderRow = {
  id: 'rmd-1',
  name: 'Timesheet due in 3 days',
  description: 'Nudge everybody before the monthly deadline.',
  enabled: true,
  daysBeforeDeadline: 3,
  subject: 'Your timesheet is due in 3 days',
  message: 'Please complete your timesheet before the end of the month.',
  severity: NotificationType.WARNING,
  priority: NotificationPriority.MEDIUM,
  sendEmail: false,
  sendNotification: true,
  createdAt: new Date('2026-08-05T10:00:00.000Z'),
  updatedAt: new Date('2026-08-05T11:30:00.000Z'),
};

/** The same row once mapped for the API. */
const REMINDER_ENTITY = {
  id: 'rmd-1',
  name: 'Timesheet due in 3 days',
  description: 'Nudge everybody before the monthly deadline.',
  enabled: true,
  daysBeforeDeadline: 3,
  subject: 'Your timesheet is due in 3 days',
  message: 'Please complete your timesheet before the end of the month.',
  severity: NotificationType.WARNING,
  priority: NotificationPriority.MEDIUM,
  sendEmail: false,
  sendNotification: true,
  createdAt: '2026-08-05T10:00:00.000Z',
  updatedAt: '2026-08-05T11:30:00.000Z',
};

const CREATE_BODY = {
  name: 'Timesheet due in 3 days',
  description: 'Nudge everybody before the monthly deadline.',
  enabled: true,
  daysBeforeDeadline: 3,
  subject: 'Your timesheet is due in 3 days',
  message: 'Please complete your timesheet before the end of the month.',
  severity: NotificationType.WARNING,
  priority: NotificationPriority.MEDIUM,
  sendEmail: false,
  sendNotification: true,
};

const defaultQuery = (overrides: Partial<ReminderQueryDto> = {}) =>
  Object.assign(new ReminderQueryDto(), overrides) as ReminderQueryDto;

describe('ReminderService', () => {
  let service: ReminderService;
  let prisma: {
    reminder: {
      findMany: jest.Mock;
      findUnique: jest.Mock;
      findFirst: jest.Mock;
      count: jest.Mock;
      create: jest.Mock;
      update: jest.Mock;
      delete: jest.Mock;
    };
    $transaction: jest.Mock;
  };

  beforeEach(async () => {
    prisma = {
      reminder: {
        findMany: jest.fn().mockResolvedValue([REMINDER]),
        findUnique: jest.fn().mockResolvedValue(REMINDER),
        // No name conflict unless a test says otherwise.
        findFirst: jest.fn().mockResolvedValue(null),
        count: jest.fn().mockResolvedValue(1),
        create: jest.fn().mockResolvedValue(REMINDER),
        update: jest.fn().mockResolvedValue(REMINDER),
        delete: jest.fn().mockResolvedValue(REMINDER),
      },
      $transaction: jest.fn((operations: Promise<unknown>[]) =>
        Promise.all(operations),
      ),
    };

    const moduleRef: TestingModule = await Test.createTestingModule({
      providers: [
        ReminderService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();

    service = moduleRef.get(ReminderService);
  });

  describe('findAll', () => {
    it('returns the mapped page with its metadata', async () => {
      const result = await service.findAll(defaultQuery());

      expect(result).toEqual({
        items: [REMINDER_ENTITY],
        meta: {
          page: 1,
          limit: 20,
          total: 1,
          totalPages: 1,
          hasPreviousPage: false,
          hasNextPage: false,
        },
      });
    });

    it('reads the rows and the count in one transaction, so the total describes the page', async () => {
      await service.findAll(defaultQuery());

      expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    });

    it('passes no filter when nothing was asked for', async () => {
      await service.findAll(defaultQuery());

      expect(prisma.reminder.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: undefined }),
      );
      expect(prisma.reminder.count).toHaveBeenCalledWith({ where: undefined });
    });

    it('searches name and subject, case-insensitively, and not the body', async () => {
      await service.findAll(defaultQuery({ search: 'timesheet' }));

      const { where } = prisma.reminder.findMany.mock.calls[0][0] as {
        where: { AND: { OR?: unknown[] }[] };
      };

      expect(where.AND[0].OR).toEqual([
        { name: { contains: 'timesheet', mode: 'insensitive' } },
        { subject: { contains: 'timesheet', mode: 'insensitive' } },
      ]);
    });

    it('ANDs the filters rather than merging them', async () => {
      await service.findAll(
        defaultQuery({
          search: 'timesheet',
          enabled: true,
          severity: NotificationType.WARNING,
          priority: NotificationPriority.HIGH,
        }),
      );

      const { where } = prisma.reminder.findMany.mock.calls[0][0] as {
        where: { AND: unknown[] };
      };

      expect(where.AND).toHaveLength(4);
      expect(where.AND).toContainEqual({ enabled: true });
      expect(where.AND).toContainEqual({ severity: NotificationType.WARNING });
      expect(where.AND).toContainEqual({ priority: NotificationPriority.HIGH });
    });

    it('applies the same filter to the count as to the page', async () => {
      await service.findAll(defaultQuery({ enabled: false }));

      const page = prisma.reminder.findMany.mock.calls[0][0] as {
        where: unknown;
      };
      const count = prisma.reminder.count.mock.calls[0][0] as {
        where: unknown;
      };

      expect(count.where).toEqual(page.where);
    });

    it('tie-breaks the ordering on id, so a record cannot repeat across pages', async () => {
      await service.findAll(
        defaultQuery({ sortBy: 'priority', sortOrder: SortOrder.DESC }),
      );

      expect(prisma.reminder.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          orderBy: [{ priority: SortOrder.DESC }, { id: SortOrder.ASC }],
        }),
      );
    });
  });

  describe('findOne', () => {
    it('returns the mapped reminder', async () => {
      await expect(service.findOne('rmd-1')).resolves.toEqual(REMINDER_ENTITY);
    });

    it('reports a missing reminder as a 404', async () => {
      prisma.reminder.findUnique.mockResolvedValue(null);

      await expect(service.findOne('rmd-404')).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });

  describe('create', () => {
    it('stores every field it was given', async () => {
      await expect(service.create(CREATE_BODY)).resolves.toEqual(
        REMINDER_ENTITY,
      );

      expect(prisma.reminder.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: CREATE_BODY }),
      );
    });

    it('accepts 0 days, which is the deadline itself', async () => {
      await service.create({ ...CREATE_BODY, daysBeforeDeadline: 0 });

      expect(prisma.reminder.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ daysBeforeDeadline: 0 }),
        }),
      );
    });

    it('refuses a name another reminder already holds, case-insensitively', async () => {
      prisma.reminder.findFirst.mockResolvedValue({ id: 'rmd-9' });

      await expect(service.create(CREATE_BODY)).rejects.toBeInstanceOf(
        ConflictException,
      );
      expect(prisma.reminder.create).not.toHaveBeenCalled();
    });

    it('folds case when it looks for that conflict', async () => {
      await service.create(CREATE_BODY);

      expect(prisma.reminder.findFirst).toHaveBeenCalledWith({
        where: {
          name: { equals: CREATE_BODY.name, mode: 'insensitive' },
        },
        select: { id: true },
      });
    });

    it('refuses a reminder that would reach nobody', async () => {
      await expect(
        service.create({
          ...CREATE_BODY,
          sendEmail: false,
          sendNotification: false,
        }),
      ).rejects.toBeInstanceOf(BadRequestException);

      expect(prisma.reminder.create).not.toHaveBeenCalled();
    });

    it('checks the delivery methods before it touches the database', async () => {
      await expect(
        service.create({
          ...CREATE_BODY,
          sendEmail: false,
          sendNotification: false,
        }),
      ).rejects.toBeInstanceOf(BadRequestException);

      expect(prisma.reminder.findFirst).not.toHaveBeenCalled();
    });
  });

  describe('update', () => {
    it('applies a partial patch and leaves the rest alone', async () => {
      await service.update('rmd-1', { subject: 'Timesheet due tomorrow' });

      expect(prisma.reminder.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'rmd-1' },
          data: expect.objectContaining({
            subject: 'Timesheet due tomorrow',
            name: undefined,
            daysBeforeDeadline: undefined,
          }),
        }),
      );
    });

    it('disables a reminder without deleting it', async () => {
      await service.update('rmd-1', { enabled: false });

      expect(prisma.reminder.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ enabled: false }),
        }),
      );
      expect(prisma.reminder.delete).not.toHaveBeenCalled();
    });

    it('re-enables one just as plainly', async () => {
      prisma.reminder.findUnique.mockResolvedValue({
        ...REMINDER,
        enabled: false,
      });

      await service.update('rmd-1', { enabled: true });

      expect(prisma.reminder.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ enabled: true }),
        }),
      );
    });

    it('clears the description on an explicit null', async () => {
      await service.update('rmd-1', { description: null });

      expect(prisma.reminder.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ description: null }),
        }),
      );
    });

    it('reports a missing reminder as a 404 before checking anything else', async () => {
      prisma.reminder.findUnique.mockResolvedValue(null);

      await expect(
        service.update('rmd-404', { name: 'Taken' }),
      ).rejects.toBeInstanceOf(NotFoundException);

      expect(prisma.reminder.findFirst).not.toHaveBeenCalled();
    });

    it('does not let a reminder conflict with itself', async () => {
      await service.update('rmd-1', { name: 'Timesheet due in 3 days' });

      expect(prisma.reminder.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ NOT: { id: 'rmd-1' } }),
        }),
      );
    });

    it('does not look for a conflict when the patch leaves the name alone', async () => {
      await service.update('rmd-1', { enabled: false });

      expect(prisma.reminder.findFirst).not.toHaveBeenCalled();
    });

    it('judges the delivery methods against the stored pair, not the submitted one', async () => {
      prisma.reminder.findUnique.mockResolvedValue({
        ...REMINDER,
        sendEmail: true,
        sendNotification: false,
      });

      // Turning email off is fine on a reminder that also notifies, and fatal
      // on one that does not. Neither field is wrong on its own.
      await expect(
        service.update('rmd-1', { sendEmail: false }),
      ).rejects.toBeInstanceOf(BadRequestException);

      expect(prisma.reminder.update).not.toHaveBeenCalled();
    });

    it('allows turning one method off while the other stays on', async () => {
      prisma.reminder.findUnique.mockResolvedValue({
        ...REMINDER,
        sendEmail: true,
        sendNotification: true,
      });

      await service.update('rmd-1', { sendEmail: false });

      expect(prisma.reminder.update).toHaveBeenCalled();
    });
  });

  describe('remove', () => {
    it('deletes a reminder', async () => {
      await service.remove('rmd-1');

      expect(prisma.reminder.delete).toHaveBeenCalledWith({
        where: { id: 'rmd-1' },
      });
    });

    it('reports a missing reminder as a 404 rather than deleting nothing', async () => {
      prisma.reminder.findUnique.mockResolvedValue(null);

      await expect(service.remove('rmd-404')).rejects.toBeInstanceOf(
        NotFoundException,
      );

      expect(prisma.reminder.delete).not.toHaveBeenCalled();
    });
  });

  // The Notification Delivery Engine's read, added by the caller that needed it.
  describe('findEnabled', () => {
    it('filters in the query rather than leaving it to the caller', async () => {
      await expect(service.findEnabled()).resolves.toEqual([REMINDER]);

      expect(prisma.reminder.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { enabled: true } }),
      );
    });

    // A week out, then three days out, then the day itself: a log of a run reads
    // as the escalation it is.
    it('orders the rules the way they fire', async () => {
      await service.findEnabled();

      expect(
        (
          prisma.reminder.findMany.mock.calls[0][0] as {
            orderBy: Record<string, string>[];
          }
        ).orderBy[0],
      ).toEqual({ daysBeforeDeadline: 'desc' });
    });

    it('is not paginated — the engine wants every live rule', async () => {
      await service.findEnabled();

      const call = prisma.reminder.findMany.mock.calls[0][0] as Record<
        string,
        unknown
      >;

      expect(call).not.toHaveProperty('take');
      expect(call).not.toHaveProperty('skip');
    });
  });
});
