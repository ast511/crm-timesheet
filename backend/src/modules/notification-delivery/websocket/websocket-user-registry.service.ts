import { Injectable } from '@nestjs/common';

import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import {
  NotificationWorkspace,
  UserRole,
} from '../../../generated/prisma/enums';
import { DEFAULT_WORKSPACE } from './websocket.constants';

/**
 * One live connection: who is on the other end of it, and what they are looking
 * at.
 *
 * `employeeId` is `string` rather than the nullable one `CurrentUser` carries,
 * because a connection without an employment record is refused at the handshake
 * — every room this feature has is keyed by employee. Narrowing it here is what
 * lets the gateway build a room name without a null check at every emit.
 */
export interface ConnectedUser {
  readonly socketId: string;
  readonly userId: string;
  readonly employeeId: string;
  readonly role: UserRole;
  readonly administrativeAccess: boolean;
  /** The workspace this connection is currently reading. */
  readonly workspace: NotificationWorkspace;
}

/**
 * Who is connected right now, and on which socket.
 *
 * **In memory, and deliberately so.** This is presence, not data: it describes
 * the state of TCP connections held by *this* process and is meaningless the
 * moment the process ends. Persisting it would produce a table whose every row
 * is a lie after a restart — and the notifications themselves are already
 * durable, which is the whole point of the notification centre. A client that
 * was offline reads its inbox on the next `GET`; the socket only saves it from
 * having to poll.
 *
 * **One connection per person, which is the feature's stated rule.** Registering
 * a second socket for the same account returns the first, so the gateway can
 * disconnect it. That is what keeps "each connected user owns one active socket
 * connection" a property of this class rather than a convention every caller has
 * to remember, and it is why the two maps are private: an index that can be
 * updated from outside is an index that eventually disagrees with itself.
 *
 * Lookups by **user account** and rooms keyed by **employee** is not an
 * inconsistency but the reason this class exists. A notification is addressed to
 * a `users.id` and a campaign to an `employees.id`; every connection knows both,
 * so the translation is a map lookup here instead of a database join at every
 * emit.
 *
 * The consequence worth stating: this works for one process. A second instance
 * behind a load balancer holds its own registry and its own sockets, so an event
 * raised on instance A never reaches a client connected to instance B. The fix
 * is Socket.IO's Redis adapter and it is a configuration change rather than a
 * redesign — see the feature document.
 */
@Injectable()
export class WebsocketUserRegistryService {
  /** Every live connection, by socket id. The authoritative map. */
  private readonly connections = new Map<string, ConnectedUser>();

  /** Which socket a user account currently holds. An index over the above. */
  private readonly socketIdByUserId = new Map<string, string>();

  /**
   * Records a connection and reports the one it displaced, if any.
   *
   * The previous connection is *returned* rather than disconnected here, because
   * closing a socket is the gateway's business and this class holds no socket —
   * it holds ids. That split is what lets the whole rule be unit-tested without
   * a server.
   *
   * The displaced entry is removed from both maps before the new one is written,
   * so a reconnect from the same account can never leave the index pointing at a
   * socket that is about to be closed.
   */
  register(
    user: CurrentUser & { employeeId: string },
    socketId: string,
  ): { connection: ConnectedUser; displaced: ConnectedUser | null } {
    const displaced = this.findByUserId(user.userId);

    if (displaced !== null) {
      this.unregister(displaced.socketId);
    }

    const connection: ConnectedUser = {
      socketId,
      userId: user.userId,
      employeeId: user.employeeId,
      role: user.role,
      administrativeAccess: user.administrativeAccess,
      workspace: DEFAULT_WORKSPACE,
    };

    this.connections.set(socketId, connection);
    this.socketIdByUserId.set(user.userId, socketId);

    return { connection, displaced };
  }

  /**
   * Forgets a connection.
   *
   * The user index is only cleared when it still points at *this* socket. A
   * displaced connection's `disconnect` arrives after the replacement has
   * already registered, and clearing the index unconditionally would drop a live
   * connection's entry — the client would stay connected and stop receiving
   * anything addressed to them by name.
   */
  unregister(socketId: string): ConnectedUser | null {
    const connection = this.connections.get(socketId);

    if (connection === undefined) {
      return null;
    }

    this.connections.delete(socketId);

    if (this.socketIdByUserId.get(connection.userId) === socketId) {
      this.socketIdByUserId.delete(connection.userId);
    }

    return connection;
  }

  /** The connection on this socket, or `null` if it is not registered. */
  findBySocketId(socketId: string): ConnectedUser | null {
    return this.connections.get(socketId) ?? null;
  }

  /** The connection this account currently holds, or `null` if it is offline. */
  findByUserId(userId: string): ConnectedUser | null {
    const socketId = this.socketIdByUserId.get(userId);

    return socketId === undefined ? null : this.findBySocketId(socketId);
  }

  /**
   * Moves a connection to another workspace.
   *
   * Returns the updated connection, or `null` when the socket is not registered
   * — which is not a failure worth throwing over: a `switchWorkspace` racing a
   * disconnect is an ordinary thing for a client to do.
   *
   * The stored entry is replaced rather than mutated, so `ConnectedUser` can stay
   * `readonly` and a caller holding one is holding a snapshot rather than a
   * reference that changes under it.
   */
  setWorkspace(
    socketId: string,
    workspace: NotificationWorkspace,
  ): ConnectedUser | null {
    const connection = this.findBySocketId(socketId);

    if (connection === null) {
      return null;
    }

    const moved: ConnectedUser = { ...connection, workspace };

    this.connections.set(socketId, moved);

    return moved;
  }

  /**
   * Every live connection.
   *
   * Used to work out who a broadcast changed the unread count for: an
   * `ALL_USERS` announcement moves everybody's badge, and only the people
   * actually connected need to be told. Returns a copy, so a caller iterating it
   * while a disconnect arrives is not iterating a map that is being written to.
   */
  all(): ConnectedUser[] {
    return [...this.connections.values()];
  }

  /** How many connections this process is holding. */
  get size(): number {
    return this.connections.size;
  }
}
