import { UnauthorizedException } from '@nestjs/common';
import { Socket } from 'socket.io';

import { isAdministrativeRole } from '../../../common/constants/role.constants';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import {
  NotificationWorkspace,
  UserRole,
} from '../../../generated/prisma/enums';
import { AuthService } from '../../auth/auth.service';
import { NotificationGateway } from './notification.gateway';
import { ERROR_EVENT, SERVER_EVENTS } from './websocket-events';
import { WebsocketUserRegistryService } from './websocket-user-registry.service';

/** A socket, with only the parts this gateway touches. */
interface FakeSocket {
  id: string;
  handshake: {
    headers: Record<string, unknown>;
    auth: Record<string, unknown>;
  };
  join: jest.Mock;
  leave: jest.Mock;
  emit: jest.Mock;
  disconnect: jest.Mock;
}

/**
 * The tokens this spec hands out, and who each one stands for.
 *
 * Since Feature 032 a handshake presents an access token rather than three
 * identity headers, and `AuthService` is what turns one into a caller. Stubbing
 * that method is the whole of the change here: what the gateway does with the
 * caller — the rooms, the displacement, the workspace rules — is unchanged, and
 * so are the assertions about it.
 */
const CALLERS: Record<string, CurrentUser> = {
  'token-user-1': {
    userId: 'usr-1',
    employeeId: 'emp-1',
    role: UserRole.USER,
    administrativeAccess: false,
  },
  'token-hr-9': {
    userId: 'usr-9',
    employeeId: 'emp-9',
    role: UserRole.HR,
    administrativeAccess: true,
  },
  'token-no-employee': {
    userId: 'usr-2',
    employeeId: null,
    role: UserRole.SUPERADMIN,
    administrativeAccess: true,
  },
};

/** `Authorization: Bearer …`, the fallback a non-browser client may use. */
const HEADERS = { authorization: 'Bearer token-user-1' };

const socketOf = (
  id: string,
  headers: Record<string, unknown> = HEADERS,
  auth: Record<string, unknown> = {},
): FakeSocket => ({
  id,
  handshake: { headers, auth },
  join: jest.fn(),
  leave: jest.fn(),
  emit: jest.fn(),
  disconnect: jest.fn(),
});

const asSocket = (socket: FakeSocket): Socket => socket as unknown as Socket;

/**
 * A caller with a chosen role, reachable by a token minted for this test.
 *
 * `administrativeAccess` is derived from the role rather than passed, exactly as
 * `toCurrentUser` derives it, so no test can construct an ordinary employee
 * holding administrative access.
 */
const tokenFor = (user: CurrentUser): string => {
  const token = `token-${user.userId}-${user.role}`;

  CALLERS[token] = user;

  return token;
};

describe('NotificationGateway', () => {
  let gateway: NotificationGateway;
  let registry: WebsocketUserRegistryService;
  let emit: jest.Mock;
  let to: jest.Mock;
  let sockets: Map<string, { disconnect: jest.Mock }>;

  beforeEach(() => {
    registry = new WebsocketUserRegistryService();
    gateway = new NotificationGateway(registry, {
      authenticate: (token: string) => {
        const user = CALLERS[token];

        if (user === undefined) {
          throw new UnauthorizedException('Invalid or expired access token');
        }

        return Promise.resolve(user);
      },
    } as unknown as AuthService);

    emit = jest.fn();
    to = jest.fn(() => ({ emit }));
    sockets = new Map();

    // What Nest assigns once the adapter has built the namespace.
    Reflect.set(gateway, 'server', { to, sockets });
  });

  describe('handleConnection', () => {
    it('joins the caller to their own room and to the personal workspace', async () => {
      const client = socketOf('sock-1');

      await gateway.handleConnection(asSocket(client));

      expect(client.join).toHaveBeenCalledWith([
        'user:emp-1',
        'workspace:PERSONAL',
      ]);
      expect(registry.findByUserId('usr-1')?.socketId).toBe('sock-1');
    });

    /**
     * The header rules this block used to enumerate are gone with the headers.
     * What is left is the one question a handshake can now get wrong: does it
     * present a token this server signed. `AuthService` answers it, and it
     * answers it identically for an HTTP request — which is the whole reason the
     * gateway calls that method rather than parsing anything itself.
     */
    it.each([
      ['no credential at all', {}, {}],
      ['a token nobody issued', { authorization: 'Bearer forged' }, {}],
      ['a bare token with no scheme', { authorization: 'token-user-1' }, {}],
      [
        'a token in the auth payload that nobody issued',
        {},
        { token: 'forged' },
      ],
      ['a non-string token in the auth payload', {}, { token: 42 }],
    ])('refuses a handshake with %s', async (_case, headers, auth) => {
      const client = socketOf('sock-1', headers, auth);

      await gateway.handleConnection(asSocket(client));

      expect(client.disconnect).toHaveBeenCalledWith(true);
      expect(client.join).not.toHaveBeenCalled();
      expect(registry.size).toBe(0);
    });

    it('tells a refused client why, on the error channel', async () => {
      const client = socketOf('sock-1', {});

      await gateway.handleConnection(asSocket(client));

      expect(client.emit).toHaveBeenCalledWith(ERROR_EVENT, {
        message: expect.stringContaining('access token') as string,
      });
    });

    // Every room here is keyed by employee, so an account with no employment
    // record has nothing this engine would ever send it.
    it('refuses an authenticated account with no employee record', async () => {
      const client = socketOf('sock-1', {
        authorization: 'Bearer token-no-employee',
      });

      await gateway.handleConnection(asSocket(client));

      expect(client.emit).toHaveBeenCalledWith(ERROR_EVENT, {
        message: expect.stringContaining('no employee record') as string,
      });
      expect(client.disconnect).toHaveBeenCalledWith(true);
    });

    // A browser cannot set headers on a WebSocket upgrade, so the token is also
    // accepted in the handshake `auth` payload.
    it('reads the token from the auth payload when it carries one', async () => {
      const client = socketOf('sock-1', {}, { token: 'token-hr-9' });

      await gateway.handleConnection(asSocket(client));

      expect(client.join).toHaveBeenCalledWith([
        'user:emp-9',
        'workspace:PERSONAL',
      ]);
      expect(registry.findByUserId('usr-9')?.administrativeAccess).toBe(true);
    });

    // Whichever channel carries a credential is the one that is read, outright:
    // a client presenting two would otherwise have one verified and the other
    // logged.
    it('lets the auth payload replace the header rather than merge with it', async () => {
      const client = socketOf('sock-1', HEADERS, { token: 'forged' });

      await gateway.handleConnection(asSocket(client));

      expect(client.disconnect).toHaveBeenCalledWith(true);
      expect(registry.size).toBe(0);
    });

    it('disconnects the socket the same account already held', async () => {
      const first = socketOf('sock-1');
      const second = socketOf('sock-2');
      const stale = { disconnect: jest.fn() };

      await gateway.handleConnection(asSocket(first));
      sockets.set('sock-1', stale);
      await gateway.handleConnection(asSocket(second));

      expect(stale.disconnect).toHaveBeenCalledWith(true);
      expect(registry.findByUserId('usr-1')?.socketId).toBe('sock-2');
    });

    it('survives a displaced socket the server no longer knows about', async () => {
      await gateway.handleConnection(asSocket(socketOf('sock-1')));

      await expect(
        gateway.handleConnection(asSocket(socketOf('sock-2'))),
      ).resolves.toBeUndefined();
    });
  });

  describe('handleDisconnect', () => {
    it('forgets the connection', async () => {
      const client = socketOf('sock-1');

      await gateway.handleConnection(asSocket(client));
      gateway.handleDisconnect(asSocket(client));

      expect(registry.size).toBe(0);
    });

    it('does nothing for a socket that was never registered', () => {
      expect(() =>
        gateway.handleDisconnect(asSocket(socketOf('sock-unknown'))),
      ).not.toThrow();
    });
  });

  describe('switchWorkspace', () => {
    const connectAs = async (role: UserRole): Promise<FakeSocket> => {
      const client = socketOf('sock-1', {
        authorization: `Bearer ${tokenFor({
          userId: 'usr-1',
          employeeId: 'emp-1',
          role,
          administrativeAccess: isAdministrativeRole(role),
        })}`,
      });

      await gateway.handleConnection(asSocket(client));
      client.join.mockClear();

      return client;
    };

    it('moves an administrator to the administrative workspace without reconnecting', async () => {
      const client = await connectAs(UserRole.ADMIN);

      const ack = gateway.switchWorkspace(asSocket(client), {
        workspace: NotificationWorkspace.ADMINISTRATIVE,
      });

      expect(ack).toEqual({
        success: true,
        workspace: NotificationWorkspace.ADMINISTRATIVE,
        room: 'workspace:ADMINISTRATIVE',
      });
      expect(client.leave).toHaveBeenCalledWith('workspace:PERSONAL');
      expect(client.join).toHaveBeenCalledWith('workspace:ADMINISTRATIVE');
      expect(client.disconnect).not.toHaveBeenCalled();
      expect(registry.findBySocketId('sock-1')?.workspace).toBe(
        NotificationWorkspace.ADMINISTRATIVE,
      );
    });

    it('keeps the caller in their own room while the workspace changes', async () => {
      const client = await connectAs(UserRole.HR);

      gateway.switchWorkspace(asSocket(client), {
        workspace: NotificationWorkspace.ADMINISTRATIVE,
      });

      expect(client.leave).not.toHaveBeenCalledWith('user:emp-1');
    });

    it('refuses the administrative workspace to an ordinary employee, and leaves them where they were', async () => {
      const client = await connectAs(UserRole.USER);

      const ack = gateway.switchWorkspace(asSocket(client), {
        workspace: NotificationWorkspace.ADMINISTRATIVE,
      });

      expect(ack.success).toBe(false);
      expect(ack.workspace).toBe(NotificationWorkspace.PERSONAL);
      expect(ack.message).toContain(UserRole.USER);
      expect(client.leave).not.toHaveBeenCalled();
      expect(registry.findBySocketId('sock-1')?.workspace).toBe(
        NotificationWorkspace.PERSONAL,
      );
    });

    it('lets an administrator switch back to their personal inbox', async () => {
      const client = await connectAs(UserRole.SUPERADMIN);

      gateway.switchWorkspace(asSocket(client), {
        workspace: NotificationWorkspace.ADMINISTRATIVE,
      });
      const ack = gateway.switchWorkspace(asSocket(client), {
        workspace: NotificationWorkspace.PERSONAL,
      });

      expect(ack.success).toBe(true);
      expect(client.leave).toHaveBeenLastCalledWith('workspace:ADMINISTRATIVE');
      expect(client.join).toHaveBeenLastCalledWith('workspace:PERSONAL');
    });

    it('does nothing when the workspace is already the current one', async () => {
      const client = await connectAs(UserRole.USER);

      const ack = gateway.switchWorkspace(asSocket(client), {
        workspace: NotificationWorkspace.PERSONAL,
      });

      expect(ack.success).toBe(true);
      expect(client.leave).not.toHaveBeenCalled();
      expect(client.join).not.toHaveBeenCalled();
    });

    it.each([
      ['an unknown workspace', { workspace: 'MARKETING' }],
      ['no payload', undefined],
      ['a payload with no workspace', {}],
    ])(
      'refuses %s with an acknowledgement rather than an exception',
      async (_case, payload) => {
        const client = await connectAs(UserRole.ADMIN);

        const ack = gateway.switchWorkspace(
          asSocket(client),
          payload as { workspace: NotificationWorkspace } | undefined,
        );

        expect(ack.success).toBe(false);
        expect(ack.message).toContain('workspace must be one of');
      },
    );

    it('refuses a socket that is not registered', () => {
      const ack = gateway.switchWorkspace(asSocket(socketOf('sock-ghost')), {
        workspace: NotificationWorkspace.PERSONAL,
      });

      expect(ack.success).toBe(false);
      expect(ack.message).toContain('not registered');
    });
  });

  describe('emitToUser', () => {
    it('sends to the room of the employee holding that account', async () => {
      await gateway.handleConnection(asSocket(socketOf('sock-1')));

      gateway.emitToUser('usr-1', SERVER_EVENTS.UNREAD_COUNT, { count: 3 });

      expect(to).toHaveBeenCalledWith('user:emp-1');
      expect(emit).toHaveBeenCalledWith(SERVER_EVENTS.UNREAD_COUNT, {
        count: 3,
      });
    });

    // The notification is already stored; the socket only saves a client from
    // polling for it.
    it('drops the event when the account is not connected', () => {
      gateway.emitToUser('usr-absent', SERVER_EVENTS.CREATED, {});

      expect(to).not.toHaveBeenCalled();
    });
  });

  describe('emitToWorkspace', () => {
    it('sends to the workspace room', () => {
      gateway.emitToWorkspace(
        NotificationWorkspace.ADMINISTRATIVE,
        SERVER_EVENTS.CREATED,
        { id: 'ntf-1' },
      );

      expect(to).toHaveBeenCalledWith('workspace:ADMINISTRATIVE');
      expect(emit).toHaveBeenCalledWith(SERVER_EVENTS.CREATED, {
        id: 'ntf-1',
      });
    });
  });

  describe('when the socket layer is not available', () => {
    // A notification that could not be announced is still a notification that
    // was stored: letting a socket error escape would turn a delivered campaign
    // into a 500.
    it('swallows an emit failure', () => {
      to.mockImplementation(() => {
        throw new Error('socket closed');
      });

      expect(() =>
        gateway.emitToWorkspace(
          NotificationWorkspace.PERSONAL,
          SERVER_EVENTS.CREATED,
          {},
        ),
      ).not.toThrow();
    });

    it('does nothing before a server exists', () => {
      Reflect.set(gateway, 'server', undefined);

      expect(() =>
        gateway.emitToWorkspace(
          NotificationWorkspace.PERSONAL,
          SERVER_EVENTS.CREATED,
          {},
        ),
      ).not.toThrow();
    });
  });
});
