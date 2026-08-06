import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import {
  NotificationWorkspace,
  UserRole,
} from '../../../generated/prisma/enums';
import { WebsocketUserRegistryService } from './websocket-user-registry.service';

const caller = (
  overrides: Partial<CurrentUser & { employeeId: string }> = {},
): CurrentUser & { employeeId: string } => ({
  userId: 'usr-1',
  employeeId: 'emp-1',
  role: UserRole.USER,
  administrativeAccess: false,
  ...overrides,
});

describe('WebsocketUserRegistryService', () => {
  let registry: WebsocketUserRegistryService;

  beforeEach(() => {
    registry = new WebsocketUserRegistryService();
  });

  describe('register', () => {
    it('records the connection and starts it in the personal workspace', () => {
      const { connection, displaced } = registry.register(caller(), 'sock-1');

      expect(displaced).toBeNull();
      expect(connection).toEqual({
        socketId: 'sock-1',
        userId: 'usr-1',
        employeeId: 'emp-1',
        role: UserRole.USER,
        administrativeAccess: false,
        workspace: NotificationWorkspace.PERSONAL,
      });
      expect(registry.size).toBe(1);
    });

    it('carries the administrative flag through, rather than re-deriving it', () => {
      const { connection } = registry.register(
        caller({ role: UserRole.HR, administrativeAccess: true }),
        'sock-1',
      );

      expect(connection.administrativeAccess).toBe(true);
      expect(connection.role).toBe(UserRole.HR);
    });

    it('keeps two different people apart', () => {
      registry.register(caller(), 'sock-1');
      registry.register(
        caller({ userId: 'usr-2', employeeId: 'emp-2' }),
        'sock-2',
      );

      expect(registry.size).toBe(2);
      expect(registry.findByUserId('usr-1')?.socketId).toBe('sock-1');
      expect(registry.findByUserId('usr-2')?.socketId).toBe('sock-2');
    });

    // The feature's rule: one active socket per person. Without it a client that
    // reconnects on every route change accumulates sockets and receives each
    // notification once per stale connection.
    it('displaces the socket the same account already held', () => {
      registry.register(caller(), 'sock-1');

      const { connection, displaced } = registry.register(caller(), 'sock-2');

      expect(displaced?.socketId).toBe('sock-1');
      expect(connection.socketId).toBe('sock-2');
      expect(registry.size).toBe(1);
      expect(registry.findBySocketId('sock-1')).toBeNull();
      expect(registry.findByUserId('usr-1')?.socketId).toBe('sock-2');
    });

    it('displaces on the account rather than on the employee record', () => {
      registry.register(caller(), 'sock-1');

      const { displaced } = registry.register(
        caller({ userId: 'usr-2' }),
        'sock-2',
      );

      expect(displaced).toBeNull();
      expect(registry.size).toBe(2);
    });
  });

  describe('unregister', () => {
    it('forgets a connection and reports what it forgot', () => {
      registry.register(caller(), 'sock-1');

      expect(registry.unregister('sock-1')?.employeeId).toBe('emp-1');
      expect(registry.size).toBe(0);
      expect(registry.findByUserId('usr-1')).toBeNull();
    });

    it('answers null for a socket it never knew', () => {
      expect(registry.unregister('sock-unknown')).toBeNull();
    });

    // The ordering that matters: a displaced socket's `disconnect` arrives after
    // its replacement has already registered. Clearing the index unconditionally
    // would drop the live connection's entry, and the client would stay connected
    // while silently stopping to receive anything addressed to them.
    it('leaves the live connection alone when a displaced socket disconnects late', () => {
      registry.register(caller(), 'sock-1');
      registry.register(caller(), 'sock-2');

      registry.unregister('sock-1');

      expect(registry.findByUserId('usr-1')?.socketId).toBe('sock-2');
      expect(registry.size).toBe(1);
    });
  });

  describe('setWorkspace', () => {
    it('moves a connection and answers with the moved one', () => {
      registry.register(caller({ administrativeAccess: true }), 'sock-1');

      const moved = registry.setWorkspace(
        'sock-1',
        NotificationWorkspace.ADMINISTRATIVE,
      );

      expect(moved?.workspace).toBe(NotificationWorkspace.ADMINISTRATIVE);
      expect(registry.findBySocketId('sock-1')?.workspace).toBe(
        NotificationWorkspace.ADMINISTRATIVE,
      );
    });

    // A `switchWorkspace` racing a disconnect is an ordinary thing for a client
    // to do, not a failure worth throwing over.
    it('answers null for a socket that is not registered', () => {
      expect(
        registry.setWorkspace('sock-1', NotificationWorkspace.ADMINISTRATIVE),
      ).toBeNull();
    });

    it('replaces the stored entry rather than mutating the snapshot a caller holds', () => {
      const { connection } = registry.register(caller(), 'sock-1');

      registry.setWorkspace('sock-1', NotificationWorkspace.ADMINISTRATIVE);

      expect(connection.workspace).toBe(NotificationWorkspace.PERSONAL);
    });
  });

  describe('all', () => {
    it('lists every live connection', () => {
      registry.register(caller(), 'sock-1');
      registry.register(
        caller({ userId: 'usr-2', employeeId: 'emp-2' }),
        'sock-2',
      );

      expect(registry.all().map(({ userId }) => userId)).toEqual([
        'usr-1',
        'usr-2',
      ]);
    });

    it('answers with a copy, so a disconnect during iteration is safe', () => {
      registry.register(caller(), 'sock-1');

      const snapshot = registry.all();
      registry.unregister('sock-1');

      expect(snapshot).toHaveLength(1);
      expect(registry.all()).toHaveLength(0);
    });
  });
});
