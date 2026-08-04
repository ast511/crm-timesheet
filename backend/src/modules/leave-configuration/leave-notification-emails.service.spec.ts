import { ConflictException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';

import { SortOrder } from '../../common/enums/sort-order.enum';
import { PrismaService } from '../../prisma/prisma.service';
import { LeaveNotificationEmailQueryDto } from './leave-notification-emails/dto/leave-notification-email-query.dto';
import { LeaveNotificationEmailRow } from './leave-notification-emails/entities/leave-notification-email.entity';
import { LeaveNotificationEmailsService } from './leave-notification-emails.service';

/** A row as PostgreSQL returns it — `Date` objects, not strings. */
const EMAIL_ROW: LeaveNotificationEmailRow = {
  id: 'lne-1',
  email: 'hr@example.com',
  createdAt: new Date('2026-08-04T09:00:00.000Z'),
  updatedAt: new Date('2026-08-04T09:30:00.000Z'),
};

/** The same row once mapped for the API. */
const EMAIL_ENTITY = {
  id: 'lne-1',
  email: 'hr@example.com',
  createdAt: '2026-08-04T09:00:00.000Z',
  updatedAt: '2026-08-04T09:30:00.000Z',
};

const defaultQuery = (
  overrides: Partial<LeaveNotificationEmailQueryDto> = {},
): LeaveNotificationEmailQueryDto =>
  Object.assign(
    new LeaveNotificationEmailQueryDto(),
    overrides,
  ) as LeaveNotificationEmailQueryDto;

describe('LeaveNotificationEmailsService', () => {
  let service: LeaveNotificationEmailsService;
  let prisma: {
    leaveNotificationEmail: {
      findMany: jest.Mock;
      findFirst: jest.Mock;
      findUnique: jest.Mock;
      count: jest.Mock;
      create: jest.Mock;
      update: jest.Mock;
      delete: jest.Mock;
    };
    $transaction: jest.Mock;
  };

  beforeEach(async () => {
    prisma = {
      leaveNotificationEmail: {
        findMany: jest.fn(),
        findFirst: jest.fn(),
        findUnique: jest.fn(),
        count: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
      },
      $transaction: jest.fn((operations: Promise<unknown>[]) =>
        Promise.all(operations),
      ),
    };

    const moduleRef: TestingModule = await Test.createTestingModule({
      providers: [
        LeaveNotificationEmailsService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();

    service = moduleRef.get(LeaveNotificationEmailsService);
  });

  describe('findAll', () => {
    beforeEach(() => {
      prisma.leaveNotificationEmail.findMany.mockResolvedValue([EMAIL_ROW]);
      prisma.leaveNotificationEmail.count.mockResolvedValue(1);
    });

    it('returns the mapped page with its metadata', async () => {
      const result = await service.findAll(defaultQuery());

      expect(result).toEqual({
        items: [EMAIL_ENTITY],
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

    it('searches the address case-insensitively', async () => {
      await service.findAll(defaultQuery({ search: 'HR' }));

      expect(prisma.leaveNotificationEmail.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { email: { contains: 'HR', mode: 'insensitive' } },
        }),
      );
    });

    /** The rows and the count must agree, so both get the same `where`. */
    it('applies no filter when nothing was searched for', async () => {
      await service.findAll(defaultQuery());

      expect(prisma.leaveNotificationEmail.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: undefined }),
      );
      expect(prisma.leaveNotificationEmail.count).toHaveBeenCalledWith({
        where: undefined,
      });
    });

    it('orders by the requested column and breaks ties on id', async () => {
      await service.findAll(
        defaultQuery({ sortBy: 'createdAt', sortOrder: SortOrder.DESC }),
      );

      expect(prisma.leaveNotificationEmail.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
        }),
      );
    });
  });

  describe('create', () => {
    it('stores an address nobody has added yet', async () => {
      prisma.leaveNotificationEmail.findFirst.mockResolvedValue(null);
      prisma.leaveNotificationEmail.create.mockResolvedValue(EMAIL_ROW);

      await expect(
        service.create({ email: 'hr@example.com' }),
      ).resolves.toEqual(EMAIL_ENTITY);
    });

    it('rejects an address already on the list with a 409', async () => {
      prisma.leaveNotificationEmail.findFirst.mockResolvedValue({
        id: 'lne-1',
      });

      await expect(
        service.create({ email: 'hr@example.com' }),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(prisma.leaveNotificationEmail.create).not.toHaveBeenCalled();
    });

    /** `HR@` and `hr@` are one mailbox, while the unique index sees two rows. */
    it('compares addresses case-insensitively', async () => {
      prisma.leaveNotificationEmail.findFirst.mockResolvedValue(null);
      prisma.leaveNotificationEmail.create.mockResolvedValue(EMAIL_ROW);

      await service.create({ email: 'hr@example.com' });

      expect(prisma.leaveNotificationEmail.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            email: { equals: 'hr@example.com', mode: 'insensitive' },
          },
        }),
      );
    });
  });

  describe('update', () => {
    it('reports a missing id before it looks for a conflict', async () => {
      prisma.leaveNotificationEmail.findUnique.mockResolvedValue(null);

      await expect(
        service.update('nope', { email: 'hr@example.com' }),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(prisma.leaveNotificationEmail.findFirst).not.toHaveBeenCalled();
    });

    /** Re-submitting an unedited form must not conflict with itself. */
    it('excludes the row being patched from the duplicate check', async () => {
      prisma.leaveNotificationEmail.findUnique.mockResolvedValue({
        id: 'lne-1',
      });
      prisma.leaveNotificationEmail.findFirst.mockResolvedValue(null);
      prisma.leaveNotificationEmail.update.mockResolvedValue(EMAIL_ROW);

      await service.update('lne-1', { email: 'hr@example.com' });

      expect(prisma.leaveNotificationEmail.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ NOT: { id: 'lne-1' } }),
        }),
      );
    });

    it('rejects an address another row already holds', async () => {
      prisma.leaveNotificationEmail.findUnique.mockResolvedValue({
        id: 'lne-1',
      });
      prisma.leaveNotificationEmail.findFirst.mockResolvedValue({
        id: 'lne-2',
      });

      await expect(
        service.update('lne-1', { email: 'payroll@example.com' }),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(prisma.leaveNotificationEmail.update).not.toHaveBeenCalled();
    });

    /** An empty body is a request that changes nothing, not a 400. */
    it('leaves the row alone when the body mentions nothing', async () => {
      prisma.leaveNotificationEmail.findUnique.mockResolvedValue({
        id: 'lne-1',
      });
      prisma.leaveNotificationEmail.update.mockResolvedValue(EMAIL_ROW);

      await expect(service.update('lne-1', {})).resolves.toEqual(EMAIL_ENTITY);
      expect(prisma.leaveNotificationEmail.findFirst).not.toHaveBeenCalled();
      expect(prisma.leaveNotificationEmail.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: { email: undefined } }),
      );
    });
  });

  describe('remove', () => {
    it('deletes an address that exists', async () => {
      prisma.leaveNotificationEmail.findUnique.mockResolvedValue({
        id: 'lne-1',
      });

      await service.remove('lne-1');

      expect(prisma.leaveNotificationEmail.delete).toHaveBeenCalledWith({
        where: { id: 'lne-1' },
      });
    });

    it('reports an unknown id as a 404 and deletes nothing', async () => {
      prisma.leaveNotificationEmail.findUnique.mockResolvedValue(null);

      await expect(service.remove('nope')).rejects.toBeInstanceOf(
        NotFoundException,
      );
      expect(prisma.leaveNotificationEmail.delete).not.toHaveBeenCalled();
    });
  });
});
