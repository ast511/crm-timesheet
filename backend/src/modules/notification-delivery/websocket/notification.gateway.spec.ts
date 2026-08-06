import { Socket } from 'socket.io';

import {
  CURRENT_USER_HEADER,
  CURRENT_USER_ROLE_HEADER,
} from '../../../common/decorators/current-user.decorator';
import { CURRENT_EMPLOYEE_HEADER } from '../../../common/decorators/current-employee-id.decorator';
import {
  NotificationWorkspace,
  UserRole,
} from '../../../generated/prisma/enums';
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

const HEADERS = {
  [CURRENT_USER_HEADER]: 'usr-1',
  [CURRENT_USER_ROLE_HEADER]: UserRole.USER,
  [CURRENT_EMPLOYEE_HEADER]: 'emp-1',
};

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

describe('NotificationGateway', () => {
  let gateway: NotificationGateway;
  let registry: WebsocketUserRegistryService;
  let emit: jest.Mock;
  let to: jest.Mock;
  let sockets: Map<string, { disconnect: jest.Mock }>;

  beforeEach(() => {
    registry = new WebsocketUserRegistryService();
    gateway = new NotificationGateway(registry);

    emit = jest.fn();
    to = jest.fn(() => ({ emit }));
    sockets = new Map();

    // What Nest assigns once the adapter has built the namespace.
    Reflect.set(gateway, 'server', { to, sockets });
  });

  describe('handleConnection', () => {
    it('joins the caller to their own room and to the personal workspace', () => {
      const client = socketOf('sock-1');

      gateway.handleConnection(asSocket(client));

      expect(client.join).toHaveBeenCalledWith([
        'user:emp-1',
        'workspace:PERSONAL',
      ]);
      expect(registry.findByUserId('usr-1')?.socketId).toBe('sock-1');
    });

    // The three header rules are Feature 026's, reused rather than re-implemented.
    it.each([
      ['no headers at all', {}],
      ['no user id', { [CURRENT_USER_ROLE_HEADER]: UserRole.ADMIN }],
      ['no role', { [CURRENT_USER_HEADER]: 'usr-1' }],
      [
        'a role the schema does not know',
        { ...HEADERS, [CURRENT_USER_ROLE_HEADER]: 'OVERLORD' },
      ],
    ])('refuses a handshake with %s', (_case, headers) => {
      const client = socketOf('sock-1', headers);

      gateway.handleConnection(asSocket(client));

      expect(client.disconnect).toHaveBeenCalledWith(true);
      expect(client.join).not.toHaveBeenCalled();
      expect(registry.size).toBe(0);
    });

    it('tells a refused client which header it left out, on the error channel', () => {
      const client = socketOf('sock-1', {
        [CURRENT_USER_ROLE_HEADER]: UserRole.USER,
        [CURRENT_EMPLOYEE_HEADER]: 'emp-1',
      });

      gateway.handleConnection(asSocket(client));

      expect(client.emit).toHaveBeenCalledWith(ERROR_EVENT, {
        message: expect.stringContaining(CURRENT_USER_HEADER) as string,
      });
    });

    // Every room here is keyed by employee, so an account with no employment
    // record has nothing this engine would ever send it.
    it('refuses an account with no employee record, naming the header', () => {
      const client = socketOf('sock-1', {
        [CURRENT_USER_HEADER]: 'usr-1',
        [CURRENT_USER_ROLE_HEADER]: UserRole.SUPERADMIN,
      });

      gateway.handleConnection(asSocket(client));

      expect(client.emit).toHaveBeenCalledWith(ERROR_EVENT, {
        message: expect.stringContaining(CURRENT_EMPLOYEE_HEADER) as string,
      });
      expect(client.disconnect).toHaveBeenCalledWith(true);
    });

    // A browser cannot set headers on a WebSocket upgrade, so the same three
    // names are accepted in the handshake `auth` payload.
    it('reads the identity from the auth payload when it carries one', () => {
      const client = socketOf(
        'sock-1',
        {},
        {
          [CURRENT_USER_HEADER]: 'usr-9',
          [CURRENT_USER_ROLE_HEADER]: UserRole.HR,
          [CURRENT_EMPLOYEE_HEADER]: 'emp-9',
        },
      );

      gateway.handleConnection(asSocket(client));

      expect(client.join).toHaveBeenCalledWith([
        'user:emp-9',
        'workspace:PERSONAL',
      ]);
      expect(registry.findByUserId('usr-9')?.administrativeAccess).toBe(true);
    });

    // Whichever channel names an identity is the one that is read, whole: merging
    // them key by key would let a client claim one account in its headers and
    // another in its auth payload.
    it('lets the auth payload replace the headers rather than merge with them', () => {
      const client = socketOf('sock-1', HEADERS, {
        [CURRENT_USER_HEADER]: 'usr-9',
      });

      gateway.handleConnection(asSocket(client));

      expect(client.disconnect).toHaveBeenCalledWith(true);
      expect(registry.size).toBe(0);
    });

    it('disconnects the socket the same account already held', () => {
      const first = socketOf('sock-1');
      const second = socketOf('sock-2');
      const stale = { disconnect: jest.fn() };

      gateway.handleConnection(asSocket(first));
      sockets.set('sock-1', stale);
      gateway.handleConnection(asSocket(second));

      expect(stale.disconnect).toHaveBeenCalledWith(true);
      expect(registry.findByUserId('usr-1')?.socketId).toBe('sock-2');
    });

    it('survives a displaced socket the server no longer knows about', () => {
      gateway.handleConnection(asSocket(socketOf('sock-1')));

      expect(() =>
        gateway.handleConnection(asSocket(socketOf('sock-2'))),
      ).not.toThrow();
    });
  });

  describe('handleDisconnect', () => {
    it('forgets the connection', () => {
      const client = socketOf('sock-1');

      gateway.handleConnection(asSocket(client));
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
    const connectAs = (role: UserRole): FakeSocket => {
      const client = socketOf('sock-1', {
        ...HEADERS,
        [CURRENT_USER_ROLE_HEADER]: role,
      });

      gateway.handleConnection(asSocket(client));
      client.join.mockClear();

      return client;
    };

    it('moves an administrator to the administrative workspace without reconnecting', () => {
      const client = connectAs(UserRole.ADMIN);

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

    it('keeps the caller in their own room while the workspace changes', () => {
      const client = connectAs(UserRole.HR);

      gateway.switchWorkspace(asSocket(client), {
        workspace: NotificationWorkspace.ADMINISTRATIVE,
      });

      expect(client.leave).not.toHaveBeenCalledWith('user:emp-1');
    });

    it('refuses the administrative workspace to an ordinary employee, and leaves them where they were', () => {
      const client = connectAs(UserRole.USER);

      const ack = gateway.switchWorkspace(asSocket(client), {
        workspace: NotificationWorkspace.ADMINISTRATIVE,
      });

      expect(ack.success).toBe(false);
      expect(ack.workspace).toBe(NotificationWorkspace.PERSONAL);
      expect(ack.message).toContain(CURRENT_USER_ROLE_HEADER);
      expect(client.leave).not.toHaveBeenCalled();
      expect(registry.findBySocketId('sock-1')?.workspace).toBe(
        NotificationWorkspace.PERSONAL,
      );
    });

    it('lets an administrator switch back to their personal inbox', () => {
      const client = connectAs(UserRole.SUPERADMIN);

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

    it('does nothing when the workspace is already the current one', () => {
      const client = connectAs(UserRole.USER);

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
      (_case, payload) => {
        const client = connectAs(UserRole.ADMIN);

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
    it('sends to the room of the employee holding that account', () => {
      gateway.handleConnection(asSocket(socketOf('sock-1')));

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
