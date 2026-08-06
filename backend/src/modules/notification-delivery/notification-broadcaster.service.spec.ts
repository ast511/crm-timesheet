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
import { NotificationEntity } from '../notifications/entities/notification.entity';
import { NotificationService } from '../notifications/notification.service';
import { NotificationBroadcaster } from './notification-broadcaster.service';
import { NotificationGateway } from './websocket/notification.gateway';
import { SERVER_EVENTS } from './websocket/websocket-events';
import { WebsocketUserRegistryService } from './websocket/websocket-user-registry.service';

const notificationOf = (
  overrides: Partial<NotificationEntity> = {},
): NotificationEntity => ({
  id: 'ntf-1',
  workspace: NotificationWorkspace.PERSONAL,
  recipientType: NotificationRecipientType.USER,
  recipientUserId: 'usr-1',
  recipientRole: null,
  title: 'Planned maintenance',
  message: 'The system will be unavailable on Saturday morning.',
  category: NotificationCategory.GENERAL,
  type: NotificationType.INFO,
  priority: NotificationPriority.MEDIUM,
  isRead: false,
  readAt: null,
  createdAt: '2026-08-05T10:00:00.000Z',
  updatedAt: '2026-08-05T10:00:00.000Z',
  ...overrides,
});

const caller = (overrides: Partial<CurrentUser> = {}): CurrentUser => ({
  userId: 'usr-1',
  employeeId: 'emp-1',
  role: UserRole.USER,
  administrativeAccess: false,
  ...overrides,
});

/** Lets a test wait for the fire-and-forget count refresh to settle. */
const settle = () => new Promise((resolve) => setImmediate(resolve));

describe('NotificationBroadcaster', () => {
  let broadcaster: NotificationBroadcaster;
  let registry: WebsocketUserRegistryService;
  let notifications: {
    registerEventPublisher: jest.Mock;
    countUnread: jest.Mock;
  };
  let gateway: { emitToUser: jest.Mock; emitToWorkspace: jest.Mock };

  const connect = (
    userId: string,
    employeeId: string,
    role: UserRole = UserRole.USER,
  ) =>
    registry.register(
      {
        userId,
        employeeId,
        role,
        administrativeAccess: role !== UserRole.USER,
      },
      `sock-${userId}`,
    );

  beforeEach(async () => {
    registry = new WebsocketUserRegistryService();
    notifications = {
      registerEventPublisher: jest.fn(),
      countUnread: jest.fn().mockResolvedValue(4),
    };
    gateway = { emitToUser: jest.fn(), emitToWorkspace: jest.fn() };

    const moduleRef: TestingModule = await Test.createTestingModule({
      providers: [
        NotificationBroadcaster,
        { provide: NotificationService, useValue: notifications },
        { provide: NotificationGateway, useValue: gateway },
        { provide: WebsocketUserRegistryService, useValue: registry },
      ],
    }).compile();

    broadcaster = moduleRef.get(NotificationBroadcaster);
  });

  // The seam that keeps the dependency running one way: the engine plugs itself
  // into the centre, and the centre has never heard of a socket.
  it('registers itself with the notification centre on startup', () => {
    broadcaster.onModuleInit();

    expect(notifications.registerEventPublisher).toHaveBeenCalledWith(
      broadcaster,
    );
  });

  describe('created', () => {
    it('sends a directly addressed notification to its own recipient', async () => {
      connect('usr-1', 'emp-1');
      const notification = notificationOf();

      broadcaster.created([notification]);
      await settle();

      expect(gateway.emitToUser).toHaveBeenCalledWith(
        'usr-1',
        SERVER_EVENTS.CREATED,
        { notification },
      );
      expect(gateway.emitToWorkspace).not.toHaveBeenCalled();
    });

    it('sends a broadcast to the workspace room', async () => {
      const notification = notificationOf({
        recipientType: NotificationRecipientType.ALL_USERS,
        recipientUserId: null,
      });

      broadcaster.created([notification]);
      await settle();

      expect(gateway.emitToWorkspace).toHaveBeenCalledWith(
        NotificationWorkspace.PERSONAL,
        SERVER_EVENTS.CREATED,
        { notification },
      );
    });

    it('refreshes the recipient unread count with the authoritative number', async () => {
      connect('usr-1', 'emp-1');

      broadcaster.created([notificationOf()]);
      await settle();

      expect(notifications.countUnread).toHaveBeenCalledWith(
        caller(),
        NotificationWorkspace.PERSONAL,
      );
      expect(gateway.emitToUser).toHaveBeenCalledWith(
        'usr-1',
        SERVER_EVENTS.UNREAD_COUNT,
        { workspace: NotificationWorkspace.PERSONAL, count: 4 },
      );
    });

    // The rule that makes a company-wide campaign survivable on the client: one
    // `created` per notification, one `unreadCount` per person.
    it('counts once per person however many notifications they received', async () => {
      connect('usr-1', 'emp-1');

      broadcaster.created([
        notificationOf({ id: 'ntf-1' }),
        notificationOf({ id: 'ntf-2' }),
        notificationOf({ id: 'ntf-3' }),
      ]);
      await settle();

      const created = gateway.emitToUser.mock.calls.filter(
        ([, event]) => event === SERVER_EVENTS.CREATED,
      );
      const counts = gateway.emitToUser.mock.calls.filter(
        ([, event]) => event === SERVER_EVENTS.UNREAD_COUNT,
      );

      expect(created).toHaveLength(3);
      expect(counts).toHaveLength(1);
    });

    it('gives each of two people their own count', async () => {
      connect('usr-1', 'emp-1');
      connect('usr-2', 'emp-2');

      broadcaster.created([
        notificationOf({ id: 'ntf-1', recipientUserId: 'usr-1' }),
        notificationOf({ id: 'ntf-2', recipientUserId: 'usr-2' }),
      ]);
      await settle();

      expect(notifications.countUnread).toHaveBeenCalledTimes(2);
    });

    // The notification is stored; the socket only saves a client from polling.
    it('costs nothing when nobody is connected', async () => {
      broadcaster.created([notificationOf()]);
      await settle();

      expect(notifications.countUnread).not.toHaveBeenCalled();
    });

    it('refreshes everybody connected for a personal broadcast', async () => {
      connect('usr-1', 'emp-1');
      connect('usr-2', 'emp-2');

      broadcaster.created([
        notificationOf({
          recipientType: NotificationRecipientType.ALL_USERS,
          recipientUserId: null,
        }),
      ]);
      await settle();

      expect(notifications.countUnread).toHaveBeenCalledTimes(2);
    });

    it('refreshes only the addressed role for a role notification', async () => {
      connect('usr-1', 'emp-1', UserRole.HR);
      connect('usr-2', 'emp-2', UserRole.ADMIN);

      broadcaster.created([
        notificationOf({
          workspace: NotificationWorkspace.ADMINISTRATIVE,
          recipientType: NotificationRecipientType.ROLE,
          recipientUserId: null,
          recipientRole: UserRole.HR,
        }),
      ]);
      await settle();

      expect(notifications.countUnread).toHaveBeenCalledTimes(1);
      expect(notifications.countUnread).toHaveBeenCalledWith(
        expect.objectContaining({ userId: 'usr-1' }),
        NotificationWorkspace.ADMINISTRATIVE,
      );
    });

    it('refreshes only administrative callers for an administrative broadcast', async () => {
      connect('usr-1', 'emp-1', UserRole.USER);
      connect('usr-2', 'emp-2', UserRole.ADMIN);

      broadcaster.created([
        notificationOf({
          workspace: NotificationWorkspace.ADMINISTRATIVE,
          recipientType: NotificationRecipientType.ADMINISTRATIVE_USERS,
          recipientUserId: null,
        }),
      ]);
      await settle();

      expect(notifications.countUnread).toHaveBeenCalledTimes(1);
      expect(notifications.countUnread).toHaveBeenCalledWith(
        expect.objectContaining({ userId: 'usr-2' }),
        NotificationWorkspace.ADMINISTRATIVE,
      );
    });
  });

  describe('read and deleted', () => {
    beforeEach(() => {
      connect('usr-1', 'emp-1');
    });

    it('announces a notification as read and refreshes the badge', async () => {
      const notification = notificationOf({ isRead: true });

      broadcaster.read(notification);
      await settle();

      expect(gateway.emitToUser).toHaveBeenCalledWith(
        'usr-1',
        SERVER_EVENTS.READ,
        { notification },
      );
      expect(notifications.countUnread).toHaveBeenCalled();
    });

    // The row is gone by the time this is sent, so re-sending it would invite a
    // client to render it.
    it('announces a deletion with the id alone', async () => {
      broadcaster.deleted(notificationOf());
      await settle();

      expect(gateway.emitToUser).toHaveBeenCalledWith(
        'usr-1',
        SERVER_EVENTS.DELETED,
        { id: 'ntf-1', workspace: NotificationWorkspace.PERSONAL },
      );
    });
  });

  describe('bulkChanged', () => {
    it('tells the caller their workspace changed, and how much', async () => {
      connect('usr-1', 'emp-1');

      broadcaster.bulkChanged(caller(), NotificationWorkspace.PERSONAL, 12);
      await settle();

      expect(gateway.emitToUser).toHaveBeenCalledWith(
        'usr-1',
        SERVER_EVENTS.UPDATED,
        { workspace: NotificationWorkspace.PERSONAL, affected: 12 },
      );
      expect(gateway.emitToUser).toHaveBeenCalledWith(
        'usr-1',
        SERVER_EVENTS.UNREAD_COUNT,
        { workspace: NotificationWorkspace.PERSONAL, count: 4 },
      );
    });

    it('does not try to count for somebody who is not connected', async () => {
      broadcaster.bulkChanged(caller(), NotificationWorkspace.PERSONAL, 12);
      await settle();

      expect(notifications.countUnread).not.toHaveBeenCalled();
    });
  });

  // A badge that arrives late is a badge; a badge that fails the write that
  // caused it is a bug.
  describe('when a count cannot be taken', () => {
    it('swallows the failure rather than rejecting', async () => {
      connect('usr-1', 'emp-1');
      notifications.countUnread.mockRejectedValue(new Error('database down'));

      expect(() => {
        broadcaster.created([notificationOf()]);
      }).not.toThrow();
      await settle();

      const counts = gateway.emitToUser.mock.calls.filter(
        ([, event]) => event === SERVER_EVENTS.UNREAD_COUNT,
      );

      expect(counts).toHaveLength(0);
    });
  });
});
