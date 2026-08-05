import { Test, TestingModule } from '@nestjs/testing';

import { SortOrder } from '../../common/enums/sort-order.enum';
import {
  NotificationCategory,
  NotificationRecipientType,
  NotificationWorkspace,
  UserRole,
} from '../../generated/prisma/enums';
import { PrismaService } from '../../prisma/prisma.service';
import { NotificationQueryDto } from './dto/notification-query.dto';
import {
  NotificationAudience,
  NotificationRepository,
} from './notification.repository';

const personal: NotificationAudience = {
  workspace: NotificationWorkspace.PERSONAL,
  userId: 'usr-1',
};

const administrative: NotificationAudience = {
  workspace: NotificationWorkspace.ADMINISTRATIVE,
  role: UserRole.HR,
};

/**
 * What a personal caller may see: their own `USER` notifications and every
 * `ALL_USERS` announcement, inside the personal workspace and nowhere else.
 */
const PERSONAL_FILTER = {
  workspace: NotificationWorkspace.PERSONAL,
  OR: [
    {
      recipientType: NotificationRecipientType.USER,
      recipientUserId: 'usr-1',
    },
    { recipientType: NotificationRecipientType.ALL_USERS },
  ],
};

/** The same for an administrative caller, matched on their role. */
const ADMINISTRATIVE_FILTER = {
  workspace: NotificationWorkspace.ADMINISTRATIVE,
  OR: [
    {
      recipientType: NotificationRecipientType.ROLE,
      recipientRole: UserRole.HR,
    },
    { recipientType: NotificationRecipientType.ADMINISTRATIVE_USERS },
  ],
};

/**
 * The visibility predicate is the one thing in this module whose every clause is
 * a way to read somebody else's mail, so it is asserted against the `where`
 * Prisma is actually handed rather than through the rows a mock returns.
 */
describe('NotificationRepository', () => {
  let repository: NotificationRepository;
  let notification: {
    findMany: jest.Mock;
    findFirst: jest.Mock;
    count: jest.Mock;
    create: jest.Mock;
    update: jest.Mock;
    updateMany: jest.Mock;
    delete: jest.Mock;
    deleteMany: jest.Mock;
  };

  const query = (overrides: Partial<NotificationQueryDto> = {}) =>
    ({
      page: 1,
      limit: 20,
      sortBy: 'createdAt',
      sortOrder: SortOrder.DESC,
      ...overrides,
    }) as NotificationQueryDto;

  beforeEach(async () => {
    notification = {
      findMany: jest.fn().mockResolvedValue([]),
      findFirst: jest.fn().mockResolvedValue(null),
      count: jest.fn().mockResolvedValue(0),
      create: jest.fn().mockResolvedValue({}),
      update: jest.fn().mockResolvedValue({}),
      updateMany: jest.fn().mockResolvedValue({ count: 3 }),
      delete: jest.fn().mockResolvedValue({}),
      deleteMany: jest.fn().mockResolvedValue({ count: 5 }),
    };

    const prisma = {
      notification,
      // The real client runs the array and returns both results; the mock only
      // has to preserve that shape for `findPage`.
      $transaction: jest.fn((operations: Promise<unknown>[]) =>
        Promise.all(operations),
      ),
    };

    const moduleRef: TestingModule = await Test.createTestingModule({
      providers: [
        NotificationRepository,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();

    repository = moduleRef.get(NotificationRepository);
  });

  describe('the visibility predicate', () => {
    it('scopes a personal page to the account and the broadcasts', async () => {
      await repository.findPage(personal, query());

      expect(notification.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: PERSONAL_FILTER }),
      );
    });

    it('scopes an administrative page to the role and the broadcasts', async () => {
      await repository.findPage(administrative, query());

      expect(notification.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: ADMINISTRATIVE_FILTER }),
      );
    });

    it('always names the workspace, so a mis-filed row cannot leak across', async () => {
      // Not redundant with the recipient types, even though the legal pairings
      // make it look so: it is the guarantee that survives a row written before
      // the rule existed or by something other than this service.
      await repository.findPage(personal, query());

      const [{ where }] = notification.findMany.mock.calls[0] as [
        { where: { workspace: string } },
      ];

      expect(where.workspace).toBe(NotificationWorkspace.PERSONAL);
    });

    it('counts over exactly the same predicate as the page', async () => {
      // If the two ever diverged, `total` would not describe the rows returned.
      await repository.findPage(
        personal,
        query({ category: NotificationCategory.LEAVE }),
      );

      const [{ where: rows }] = notification.findMany.mock.calls[0] as [
        { where: unknown },
      ];
      const [{ where: total }] = notification.count.mock.calls[0] as [
        { where: unknown },
      ];

      expect(total).toEqual(rows);
    });

    it('offers both audiences when a single lookup spans two workspaces', async () => {
      await repository.findVisible('ntf-1', [personal, administrative]);

      expect(notification.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'ntf-1', OR: [PERSONAL_FILTER, ADMINISTRATIVE_FILTER] },
        }),
      );
    });
  });

  describe('filters', () => {
    it('leaves the predicate alone when nothing was asked for', async () => {
      await repository.findPage(personal, query());

      expect(notification.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: PERSONAL_FILTER }),
      );
    });

    it('ANDs the filters with the audience rather than merging them', async () => {
      // Merged into one object, the search's own `OR` key would silently replace
      // the audience's and the endpoint would return every notification in the
      // database whose title matched.
      await repository.findPage(personal, query({ search: 'leave' }));

      expect(notification.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            AND: [
              PERSONAL_FILTER,
              {
                OR: [
                  { title: { contains: 'leave', mode: 'insensitive' } },
                  { message: { contains: 'leave', mode: 'insensitive' } },
                ],
              },
            ],
          },
        }),
      );
    });

    it('searches the message as well as the title', async () => {
      await repository.findPage(personal, query({ search: 'EMP-0007' }));

      const [{ where }] = notification.findMany.mock.calls[0] as [
        { where: { AND: { OR: unknown[] }[] } },
      ];

      expect(where.AND[1].OR).toHaveLength(2);
    });

    it('combines several filters with AND', async () => {
      await repository.findPage(
        personal,
        query({ category: NotificationCategory.LEAVE, isRead: false }),
      );

      const [{ where }] = notification.findMany.mock.calls[0] as [
        { where: { AND: unknown[] } },
      ];

      expect(where.AND).toEqual([
        PERSONAL_FILTER,
        { category: NotificationCategory.LEAVE },
        { isRead: false },
      ]);
    });

    it('treats isRead=false as a filter rather than as "not set"', async () => {
      await repository.findPage(personal, query({ isRead: false }));

      const [{ where }] = notification.findMany.mock.calls[0] as [
        { where: { AND: unknown[] } },
      ];

      expect(where.AND).toContainEqual({ isRead: false });
    });
  });

  describe('ordering', () => {
    it('tie-breaks on id, so a record cannot repeat across pages', async () => {
      await repository.findPage(personal, query());

      expect(notification.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          orderBy: [{ createdAt: SortOrder.DESC }, { id: SortOrder.DESC }],
        }),
      );
    });

    it('turns the tie-break with the sort rather than fixing it ascending', async () => {
      await repository.findPage(
        personal,
        query({ sortBy: 'priority', sortOrder: SortOrder.ASC }),
      );

      expect(notification.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          orderBy: [{ priority: SortOrder.ASC }, { id: SortOrder.ASC }],
        }),
      );
    });
  });

  describe('writes', () => {
    it('marks one read with both columns in the same statement', async () => {
      const readAt = new Date('2026-08-05T12:00:00.000Z');

      await repository.markRead('ntf-1', readAt);

      expect(notification.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'ntf-1' },
          data: { isRead: true, readAt },
        }),
      );
    });

    it('marks read only what is unread, so the count and the timestamps mean something', async () => {
      const readAt = new Date('2026-08-05T12:00:00.000Z');

      await expect(repository.markAllRead(personal, readAt)).resolves.toBe(3);

      expect(notification.updateMany).toHaveBeenCalledWith({
        where: { ...PERSONAL_FILTER, isRead: false },
        data: { isRead: true, readAt },
      });
    });

    it('deletes everything the audience can see, read or not', async () => {
      await expect(repository.deleteAll(administrative)).resolves.toBe(5);

      expect(notification.deleteMany).toHaveBeenCalledWith({
        where: ADMINISTRATIVE_FILTER,
      });
    });
  });
});
