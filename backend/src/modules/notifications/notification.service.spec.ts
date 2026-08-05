import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';

import { CurrentUser } from '../../common/decorators/current-user.decorator';
import {
  NotificationCategory,
  NotificationPriority,
  NotificationRecipientType,
  NotificationType,
  NotificationWorkspace,
  UserRole,
} from '../../generated/prisma/enums';
import { UserService } from '../users/user.service';
import { NotificationQueryDto } from './dto/notification-query.dto';
import { NotificationRepository } from './notification.repository';
import { NotificationService } from './notification.service';

const employee: CurrentUser = {
  userId: 'usr-1',
  employeeId: 'emp-1',
  role: UserRole.USER,
  administrativeAccess: false,
};

const hr: CurrentUser = {
  userId: 'usr-9',
  employeeId: 'emp-9',
  role: UserRole.HR,
  administrativeAccess: true,
};

/** A row as `NOTIFICATION_PUBLIC_SELECT` returns it. */
const ROW = {
  id: 'ntf-1',
  workspace: NotificationWorkspace.PERSONAL,
  recipientType: NotificationRecipientType.USER,
  recipientUserId: 'usr-1',
  recipientRole: null,
  title: 'Leave approved',
  message: 'Your leave has been approved.',
  category: NotificationCategory.LEAVE,
  type: NotificationType.SUCCESS,
  priority: NotificationPriority.MEDIUM,
  isRead: false,
  readAt: null,
  createdAt: new Date('2026-08-05T10:00:00.000Z'),
  updatedAt: new Date('2026-08-05T10:00:00.000Z'),
};

const CREATE_BODY = {
  workspace: NotificationWorkspace.PERSONAL,
  recipientType: NotificationRecipientType.USER,
  recipientUserId: 'usr-1',
  title: 'Leave approved',
  message: 'Your leave has been approved.',
  category: NotificationCategory.LEAVE,
  type: NotificationType.SUCCESS,
  priority: NotificationPriority.MEDIUM,
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

describe('NotificationService', () => {
  let service: NotificationService;
  let repository: {
    findPage: jest.Mock;
    findVisible: jest.Mock;
    create: jest.Mock;
    markRead: jest.Mock;
    markAllRead: jest.Mock;
    deleteById: jest.Mock;
    deleteAll: jest.Mock;
  };
  let users: { findEmployeeLink: jest.Mock };

  const query = (): NotificationQueryDto =>
    ({ page: 1, limit: 20 }) as NotificationQueryDto;

  beforeEach(async () => {
    repository = {
      findPage: jest.fn().mockResolvedValue([[ROW], 1]),
      findVisible: jest.fn().mockResolvedValue(ROW),
      create: jest.fn().mockResolvedValue(ROW),
      markRead: jest.fn().mockResolvedValue({
        ...ROW,
        isRead: true,
        readAt: new Date('2026-08-05T12:00:00.000Z'),
      }),
      markAllRead: jest.fn().mockResolvedValue(3),
      deleteById: jest.fn().mockResolvedValue(undefined),
      deleteAll: jest.fn().mockResolvedValue(7),
    };
    users = {
      findEmployeeLink: jest.fn().mockResolvedValue({ employeeId: null }),
    };

    const moduleRef: TestingModule = await Test.createTestingModule({
      providers: [
        NotificationService,
        { provide: NotificationRepository, useValue: repository },
        { provide: UserService, useValue: users },
      ],
    }).compile();

    service = moduleRef.get(NotificationService);
  });

  describe('the personal workspace', () => {
    it('scopes the page to the caller’s account', async () => {
      await service.findPersonal(employee, query());

      expect(repository.findPage).toHaveBeenCalledWith(
        { workspace: NotificationWorkspace.PERSONAL, userId: 'usr-1' },
        expect.anything(),
      );
    });

    it('is open to an administrator too — they receive their own leave decisions', async () => {
      await service.findPersonal(hr, query());

      expect(repository.findPage).toHaveBeenCalledWith(
        { workspace: NotificationWorkspace.PERSONAL, userId: 'usr-9' },
        expect.anything(),
      );
    });

    it('returns the shared pagination envelope', async () => {
      const page = await service.findPersonal(employee, query());

      expect(page.items).toHaveLength(1);
      expect(page.meta).toMatchObject({ total: 1, page: 1 });
      expect(page.items[0].createdAt).toBe('2026-08-05T10:00:00.000Z');
    });
  });

  describe('the administrative workspace', () => {
    it('scopes the page to the caller’s role', async () => {
      await service.findAdministrative(hr, query());

      expect(repository.findPage).toHaveBeenCalledWith(
        { workspace: NotificationWorkspace.ADMINISTRATIVE, role: UserRole.HR },
        expect.anything(),
      );
    });

    it.each([
      [
        'findAdministrative',
        () => service.findAdministrative(employee, query()),
      ],
      [
        'markAllAdministrativeRead',
        () => service.markAllAdministrativeRead(employee),
      ],
      [
        'removeAllAdministrative',
        () => service.removeAllAdministrative(employee),
      ],
    ])('refuses an ordinary employee on %s', async (_name, call) => {
      // A 403 rather than a 404: the workspace is not a secret, and pretending
      // the route is missing would send an administrator whose role header was
      // wrong to look for a typo in the path.
      await expect(call()).rejects.toThrow(ForbiddenException);
    });

    it('does not query at all when access is refused', async () => {
      await expect(
        service.findAdministrative(employee, query()),
      ).rejects.toThrow();

      expect(repository.findPage).not.toHaveBeenCalled();
    });
  });

  describe('reading one notification', () => {
    it('offers an ordinary employee their personal audience only', async () => {
      await service.findOne(employee, 'ntf-1');

      expect(repository.findVisible).toHaveBeenCalledWith('ntf-1', [
        { workspace: NotificationWorkspace.PERSONAL, userId: 'usr-1' },
      ]);
    });

    it('offers an administrator both, so one id route serves both inboxes', async () => {
      await service.findOne(hr, 'ntf-1');

      expect(repository.findVisible).toHaveBeenCalledWith('ntf-1', [
        { workspace: NotificationWorkspace.PERSONAL, userId: 'usr-9' },
        { workspace: NotificationWorkspace.ADMINISTRATIVE, role: UserRole.HR },
      ]);
    });

    it('reports a notification it cannot see as missing, not as forbidden', async () => {
      // Distinguishing the two would make this endpoint a way to confirm that a
      // message was sent to somebody else.
      repository.findVisible.mockResolvedValue(null);

      await expect(service.findOne(employee, 'ntf-2')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('marking as read', () => {
    it('raises the flag and records the moment', async () => {
      const notification = await service.markRead(employee, 'ntf-1');

      expect(repository.markRead).toHaveBeenCalledWith(
        'ntf-1',
        expect.any(Date),
      );
      expect(notification.isRead).toBe(true);
      expect(notification.readAt).toBe('2026-08-05T12:00:00.000Z');
    });

    it('is idempotent, and does not move readAt on a second call', async () => {
      const alreadyRead = {
        ...ROW,
        isRead: true,
        readAt: new Date('2026-08-05T11:00:00.000Z'),
      };
      repository.findVisible.mockResolvedValue(alreadyRead);

      const notification = await service.markRead(employee, 'ntf-1');

      expect(repository.markRead).not.toHaveBeenCalled();
      expect(notification.readAt).toBe('2026-08-05T11:00:00.000Z');
    });

    it('checks visibility before writing', async () => {
      repository.findVisible.mockResolvedValue(null);

      await expect(service.markRead(employee, 'ntf-2')).rejects.toThrow(
        NotFoundException,
      );
      expect(repository.markRead).not.toHaveBeenCalled();
    });

    it('reports how many rows a bulk mark moved', async () => {
      await expect(service.markAllPersonalRead(employee)).resolves.toEqual({
        affected: 3,
      });
    });
  });

  describe('deleting', () => {
    it('checks visibility before deleting', async () => {
      repository.findVisible.mockResolvedValue(null);

      await expect(service.remove(employee, 'ntf-2')).rejects.toThrow(
        NotFoundException,
      );
      expect(repository.deleteById).not.toHaveBeenCalled();
    });

    it('deletes one the caller can see', async () => {
      await service.remove(employee, 'ntf-1');

      expect(repository.deleteById).toHaveBeenCalledWith('ntf-1');
    });

    it('reports how many rows a bulk delete removed', async () => {
      await expect(service.removeAllPersonal(employee)).resolves.toEqual({
        affected: 7,
      });
      expect(repository.deleteAll).toHaveBeenCalledWith({
        workspace: NotificationWorkspace.PERSONAL,
        userId: 'usr-1',
      });
    });
  });

  describe('creating — the addressing rules', () => {
    it('accepts PERSONAL + USER with a recipient', async () => {
      await service.create(CREATE_BODY);

      expect(repository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          recipientUserId: 'usr-1',
          recipientRole: null,
        }),
      );
    });

    it('accepts PERSONAL + ALL_USERS with neither', async () => {
      await service.create({
        ...CREATE_BODY,
        recipientType: NotificationRecipientType.ALL_USERS,
        recipientUserId: undefined,
      });

      expect(repository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          recipientUserId: null,
          recipientRole: null,
        }),
      );
    });

    it('accepts ADMINISTRATIVE + ROLE with a role', async () => {
      await service.create({
        ...CREATE_BODY,
        workspace: NotificationWorkspace.ADMINISTRATIVE,
        recipientType: NotificationRecipientType.ROLE,
        recipientUserId: undefined,
        recipientRole: UserRole.HR,
      });

      expect(repository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          recipientUserId: null,
          recipientRole: UserRole.HR,
        }),
      );
    });

    it('accepts ADMINISTRATIVE + ADMINISTRATIVE_USERS with neither', async () => {
      await service.create({
        ...CREATE_BODY,
        workspace: NotificationWorkspace.ADMINISTRATIVE,
        recipientType: NotificationRecipientType.ADMINISTRATIVE_USERS,
        recipientUserId: undefined,
      });

      expect(repository.create).toHaveBeenCalled();
    });

    it.each([
      [NotificationWorkspace.PERSONAL, NotificationRecipientType.ROLE],
      [
        NotificationWorkspace.PERSONAL,
        NotificationRecipientType.ADMINISTRATIVE_USERS,
      ],
      [NotificationWorkspace.ADMINISTRATIVE, NotificationRecipientType.USER],
      [
        NotificationWorkspace.ADMINISTRATIVE,
        NotificationRecipientType.ALL_USERS,
      ],
    ])('refuses %s + %s', async (workspace, recipientType) => {
      await expect(
        service.create({
          ...CREATE_BODY,
          workspace,
          recipientType,
          recipientUserId: undefined,
        }),
      ).rejects.toThrow(BadRequestException);

      expect(repository.create).not.toHaveBeenCalled();
    });

    it('requires recipientUserId when the type is USER', async () => {
      await expect(
        messagesFrom(
          service.create({ ...CREATE_BODY, recipientUserId: undefined }),
        ),
      ).resolves.toEqual([
        'recipientUserId is required when recipientType is USER',
      ]);
    });

    it('requires recipientRole when the type is ROLE', async () => {
      await expect(
        messagesFrom(
          service.create({
            ...CREATE_BODY,
            workspace: NotificationWorkspace.ADMINISTRATIVE,
            recipientType: NotificationRecipientType.ROLE,
            recipientUserId: undefined,
          }),
        ),
      ).resolves.toEqual([
        'recipientRole is required when recipientType is ROLE',
      ]);
    });

    it('refuses recipientUserId on a broadcast rather than storing it', async () => {
      // Storing it would leave a later reader unable to tell whether the message
      // was meant for everybody or for one person; dropping it silently would
      // let the caller believe they had addressed somebody.
      await expect(
        messagesFrom(
          service.create({
            ...CREATE_BODY,
            recipientType: NotificationRecipientType.ALL_USERS,
          }),
        ),
      ).resolves.toEqual([
        'recipientUserId must not be sent when recipientType is ALL_USERS',
      ]);
    });

    it('refuses recipientRole on a USER notification', async () => {
      await expect(
        messagesFrom(
          service.create({ ...CREATE_BODY, recipientRole: UserRole.HR }),
        ),
      ).resolves.toEqual([
        'recipientRole must not be sent when recipientType is USER',
      ]);
    });

    it('reports both addressing problems at once', async () => {
      // An array, the same shape the ValidationPipe produces, so a form can mark
      // each offending field instead of surfacing the second problem only after
      // the first is fixed.
      await expect(
        messagesFrom(
          service.create({
            ...CREATE_BODY,
            recipientType: NotificationRecipientType.ALL_USERS,
            recipientRole: UserRole.HR,
          }),
        ),
      ).resolves.toHaveLength(2);
    });

    it('rejects a recipient who does not exist, as a 400 naming the field', async () => {
      users.findEmployeeLink.mockResolvedValue(null);

      await expect(messagesFrom(service.create(CREATE_BODY))).resolves.toEqual([
        'recipientUserId names user usr-1, who does not exist',
      ]);
      expect(repository.create).not.toHaveBeenCalled();
    });

    it('reads the account through UserService rather than the users table', async () => {
      await service.create(CREATE_BODY);

      expect(users.findEmployeeLink).toHaveBeenCalledWith('usr-1');
    });

    it('does not look up an account for a broadcast', async () => {
      await service.create({
        ...CREATE_BODY,
        recipientType: NotificationRecipientType.ALL_USERS,
        recipientUserId: undefined,
      });

      expect(users.findEmployeeLink).not.toHaveBeenCalled();
    });
  });
});
