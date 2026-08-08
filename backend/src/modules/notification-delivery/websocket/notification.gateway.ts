import { Logger } from '@nestjs/common';
import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  OnGatewayDisconnect,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { Namespace, Socket } from 'socket.io';

import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { AuthService } from '../../auth/auth.service';
import { readAccessToken } from '../../auth/jwt-auth.guard';
import { NotificationWorkspace } from '../../../generated/prisma/enums';
import {
  CLIENT_EVENTS,
  ERROR_EVENT,
  SwitchWorkspaceAck,
  SwitchWorkspacePayload,
} from './websocket-events';
import {
  ConnectedUser,
  WebsocketUserRegistryService,
} from './websocket-user-registry.service';
import {
  DEFAULT_WORKSPACE,
  NOTIFICATION_NAMESPACE,
  userRoom,
  workspaceRoom,
} from './websocket.constants';

/**
 * Where a handshake carries its access token, in the `auth` payload.
 *
 * **A browser cannot set headers on a WebSocket upgrade** — the API simply has
 * no way to — so `io(url, { auth: { token } })` is how a real client
 * authenticates, and `Authorization: Bearer …` is the fallback a Node or
 * Postman client may use instead. Feature 028 accepted the three identity
 * headers in this same payload for the same reason; Feature 032 replaced the
 * three with one token, and the shape of the accommodation is unchanged.
 */
const HANDSHAKE_TOKEN_KEY = 'token';

/**
 * The real-time half of the notification delivery engine.
 *
 * **The only component in this application that touches Socket.IO.** Nothing
 * else imports `socket.io`, holds a `Server`, joins a room or calls `emit` —
 * the same rule `EmailService` sets for Nodemailer, and for the same reason:
 * the day this becomes a Redis-backed cluster, or something other than
 * Socket.IO, one file changes.
 *
 * It is also deliberately *dumb* about notifications. It knows rooms, sockets
 * and who is connected; it does not know what a notification is, when one should
 * be sent or who should receive it. `NotificationBroadcaster` answers those and
 * calls the two `emitTo…` methods below, which is what keeps "the engine decides,
 * the gateway delivers" a structural fact rather than a convention.
 *
 * Four decisions worth naming:
 *
 * 1. **The caller comes from `AuthService.authenticate`, unchanged.** Feature 028
 *    reused Feature 026's header placeholder here rather than re-implementing it;
 *    Feature 032 replaced that placeholder with a token and this call moved with
 *    it, to the very method `JwtAuthGuard` calls on every HTTP request. So a
 *    socket and a request agree about what a token means, about whether its
 *    signature is good, and about whether the account behind it is still active —
 *    and they agree because there is one implementation, not two that were
 *    written to match. A second copy is the one that would still be honouring a
 *    deactivated account next week, and on a connection that lives for hours that
 *    matters more here than anywhere else. Nothing is hardcoded and no user is
 *    assumed — a handshake that does not present a valid token is refused.
 * 2. **A connection without an employment record is refused.** Every room here is
 *    keyed by employee, because that is the vocabulary campaigns and reminders
 *    address people in. An account with no `employees` row — a super-admin
 *    created to administer the system — has nothing this engine would ever send
 *    it, so refusing is honest where inventing a room would be theatre.
 * 3. **One socket per account.** A second connection displaces the first, which
 *    is then disconnected. Without it a client that reconnected on every route
 *    change would accumulate sockets and receive each notification once per stale
 *    connection — the duplicate-event failure the business rules forbid, arriving
 *    through the back door.
 * 4. **The workspace is a room, not a filter.** A connection is in exactly one of
 *    `workspace:PERSONAL` / `workspace:ADMINISTRATIVE` at a time, so a broadcast
 *    is one `emit` to a room rather than a scan over every socket deciding who
 *    should see it — and an administrator reading their personal inbox does not
 *    receive back-office announcements they are not looking at.
 *
 * **Authentication happens once, at the handshake**, and that is the honest
 * shape of a persistent connection rather than a shortcut. A socket presents its
 * credential when it opens; there is no per-message header to re-check, and the
 * global `JwtAuthGuard` deliberately passes non-HTTP contexts through for that
 * reason. What it costs is a window: a connection authenticated at 09:00 with a
 * fifteen-minute access token keeps receiving notifications after that token
 * would have expired, and after the account behind it was deactivated, until
 * something disconnects it. It is the socket-shaped version of the trade-off
 * `RefreshToken` in `schema.prisma` describes, and it is wider — hours rather
 * than minutes. Closing it needs the server to drop the sockets of a deactivated
 * account, which is recorded as a follow-up in FEATURES/032 rather than guessed
 * at here.
 *
 * *Authorization* is still not implemented, exactly as it is not on the HTTP
 * side. The one check that exists — the administrative workspace — is not
 * authorization arriving early: it is what `ADMINISTRATIVE_USERS` *means*, and
 * Feature 026 makes the same check on the same workspace over HTTP.
 */
@WebSocketGateway({ namespace: NOTIFICATION_NAMESPACE })
export class NotificationGateway
  implements OnGatewayConnection, OnGatewayDisconnect
{
  private readonly logger = new Logger(NotificationGateway.name);

  /**
   * Assigned by Nest once the adapter has created the server.
   *
   * Optional rather than definitely-assigned, because every emit has to survive
   * being called before a server exists: a unit test constructs this class
   * directly, and a notification created during startup must not turn into a
   * crash because nothing is listening yet. {@link emitToRoom} is the one place
   * that checks.
   */
  @WebSocketServer()
  private readonly server?: Namespace;

  constructor(
    private readonly registry: WebsocketUserRegistryService,
    private readonly authService: AuthService,
  ) {}

  /**
   * Accepts a connection, or refuses it.
   *
   * The order is the escalation a client can act on: who are you (a `401`-shaped
   * message on the error channel if the handshake presents no valid token), then
   * do you have an employment record, and only then are rooms joined and the
   * connection recorded.
   *
   * Rooms are joined *after* the registry write, so a displaced socket is already
   * out of the index before the new one starts receiving — the alternative leaves
   * a window in which one account is in its own room twice.
   *
   * **Asynchronous since Feature 032**, because authenticating a token reads the
   * account from the database. Socket.IO does not wait for this handler, so a
   * client that emits immediately on `connect` can have a message arrive before
   * its socket is registered. That message is refused with the acknowledgement
   * `switchWorkspace` already returns for an unregistered socket — "reconnect
   * before switching workspace" — rather than silently mishandled, which is why
   * the ordering is acceptable rather than merely unavoidable.
   */
  async handleConnection(client: Socket): Promise<void> {
    const user = await this.resolveClient(client);

    if (user === null) {
      return;
    }

    const { connection, displaced } = this.registry.register(user, client.id);

    if (displaced !== null) {
      this.disconnectDisplaced(displaced);
    }

    void client.join([
      userRoom(connection.employeeId),
      workspaceRoom(DEFAULT_WORKSPACE),
    ]);

    this.logger.log(
      `Socket connected for employee ${connection.employeeId} in ${connection.workspace}`,
    );
  }

  /**
   * Forgets a closed connection.
   *
   * Socket.IO removes a disconnected socket from its rooms itself, so there is
   * nothing to leave — only the registry entry to drop, and only when it still
   * belongs to this socket. A socket that was never registered (a refused
   * handshake) unregisters to `null` and is not logged twice.
   */
  handleDisconnect(client: Socket): void {
    const connection = this.registry.unregister(client.id);

    if (connection !== null) {
      this.logger.log(
        `Socket disconnected for employee ${connection.employeeId}`,
      );
    }
  }

  /**
   * Moves a live connection to the other workspace — without reconnecting, which
   * is the requirement this event exists for.
   *
   * A client switching between the personal inbox and the back-office one keeps
   * its socket, its identity and its `user:{employeeId}` room; only the workspace
   * room changes. Reconnecting instead would drop every event raised in the
   * moments between the two connections.
   *
   * Refused for a caller whose role is not administrative, with an acknowledgement
   * rather than a thrown exception: the client asked a question, and "no, and here
   * is why" is the answer. The connection stays exactly where it was, so a refused
   * switch cannot leave a client in no workspace at all.
   */
  @SubscribeMessage(CLIENT_EVENTS.SWITCH_WORKSPACE)
  switchWorkspace(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: SwitchWorkspacePayload | undefined,
  ): SwitchWorkspaceAck {
    const connection = this.registry.findBySocketId(client.id);

    if (connection === null) {
      return refusal(
        DEFAULT_WORKSPACE,
        'This socket is not registered; reconnect before switching workspace',
      );
    }

    const workspace = readWorkspace(payload);

    if (workspace === null) {
      return refusal(
        connection.workspace,
        `workspace must be one of: ${Object.values(NotificationWorkspace).join(', ')}`,
      );
    }

    if (
      workspace === NotificationWorkspace.ADMINISTRATIVE &&
      !connection.administrativeAccess
    ) {
      return refusal(
        connection.workspace,
        `The administrative workspace is available to administrative roles only; this account holds ${connection.role}`,
      );
    }

    if (workspace !== connection.workspace) {
      void client.leave(workspaceRoom(connection.workspace));
      void client.join(workspaceRoom(workspace));
      this.registry.setWorkspace(client.id, workspace);
    }

    return {
      success: true,
      workspace,
      room: workspaceRoom(workspace),
    };
  }

  /**
   * Sends an event to one person's own sockets.
   *
   * Addressed by **user account**, because that is what a notification carries,
   * and delivered to the `user:{employeeId}` room, because that is what a client
   * can reason about. The registry is what bridges the two; an offline account
   * simply has no connection and the event is dropped — the notification is
   * already stored, and the inbox is read on the next `GET`.
   */
  emitToUser(userId: string, event: string, payload: unknown): void {
    const connection = this.registry.findByUserId(userId);

    if (connection === null) {
      return;
    }

    this.emitToRoom(userRoom(connection.employeeId), event, payload);
  }

  /** Sends an event to everybody currently reading one workspace. */
  emitToWorkspace(
    workspace: NotificationWorkspace,
    event: string,
    payload: unknown,
  ): void {
    this.emitToRoom(workspaceRoom(workspace), event, payload);
  }

  /**
   * The one `emit` in the application.
   *
   * Every failure is swallowed and logged rather than propagated, and that is the
   * rule the whole real-time layer rests on: a notification that could not be
   * announced is still a notification that was stored, and letting a socket error
   * escape would turn a successful leave approval — or a delivered campaign — into
   * a 500. The same call Feature 025 asks every email caller to make.
   */
  private emitToRoom(room: string, event: string, payload: unknown): void {
    if (this.server === undefined) {
      return;
    }

    try {
      this.server.to(room).emit(event, payload);
    } catch (error) {
      this.logger.error(
        `Emitting ${event} to ${room} failed`,
        toLogDetail(error),
      );
    }
  }

  /**
   * Who is on the other end, or `null` after the connection has been refused.
   *
   * Refusing is an `exception` event followed by a disconnect, rather than a
   * silent close: a client whose token is missing or expired would otherwise see
   * a connection that opens and immediately drops, with nothing to read.
   */
  private async resolveClient(
    client: Socket,
  ): Promise<(CurrentUser & { employeeId: string }) | null> {
    let user: CurrentUser;

    try {
      user = await this.authService.authenticate(readHandshakeToken(client));
    } catch (error) {
      this.refuse(client, describeRefusal(error));

      return null;
    }

    if (user.employeeId === null) {
      this.refuse(
        client,
        'Real-time notifications are addressed to an employee, and this account has no employee record',
      );

      return null;
    }

    return { ...user, employeeId: user.employeeId };
  }

  private refuse(client: Socket, message: string): void {
    client.emit(ERROR_EVENT, { message });
    client.disconnect(true);
  }

  /**
   * Closes the socket an account was holding before it reconnected.
   *
   * Looked up through the server rather than kept as a reference in the registry,
   * so that class stays a map of ids and can be tested without a socket. A socket
   * the server no longer knows about has already gone, which is the ordinary case
   * for a network that dropped.
   */
  private disconnectDisplaced(displaced: ConnectedUser): void {
    this.server?.sockets.get(displaced.socketId)?.disconnect(true);

    this.logger.log(
      `Replaced the socket held by employee ${displaced.employeeId}`,
    );
  }
}

/**
 * The access token a handshake presents.
 *
 * The `auth` payload wins over the header, because it is the channel a browser
 * can actually use — see {@link HANDSHAKE_TOKEN_KEY}. It wins outright rather
 * than being merged with anything: a client that sends both would otherwise be
 * presenting two credentials, and choosing between them silently is how one gets
 * verified while the other gets logged.
 *
 * The header path reuses `readAccessToken`, the exact function `JwtAuthGuard`
 * uses, so `Authorization: Bearer …` is parsed identically on both sides —
 * including the refusal of a header sent twice, which arrives here as an array
 * for the same reason it does over HTTP.
 *
 * A non-string in `auth.token` — a number, an object, an array — is passed
 * through as an empty string rather than coerced, so it fails verification like
 * any other bad token instead of becoming `"[object Object]"` on its way to a
 * signature check.
 */
function readHandshakeToken(client: Socket): string {
  const auth = client.handshake.auth as Record<string, unknown>;
  const claimed = auth[HANDSHAKE_TOKEN_KEY];

  if (claimed !== undefined) {
    return typeof claimed === 'string' ? claimed.trim() : '';
  }

  return readAccessToken(client.handshake);
}

/**
 * The workspace a `switchWorkspace` payload names, or `null` when it names none.
 *
 * Checked against the enum here rather than by a DTO and the global
 * `ValidationPipe`: a rejected message would become an `exception` event with no
 * acknowledgement, and this handler's contract is that a client always gets an
 * answer to the question it asked.
 */
function readWorkspace(
  payload: SwitchWorkspacePayload | undefined,
): NotificationWorkspace | null {
  const workspace = payload?.workspace;

  return typeof workspace === 'string' && isWorkspace(workspace)
    ? workspace
    : null;
}

function isWorkspace(value: string): value is NotificationWorkspace {
  return (Object.values(NotificationWorkspace) as string[]).includes(value);
}

function refusal(
  workspace: NotificationWorkspace,
  message: string,
): SwitchWorkspaceAck {
  return { success: false, workspace, room: workspaceRoom(workspace), message };
}

/**
 * The message a refused handshake reports.
 *
 * `resolveCurrentUser` raises a `BadRequestException` whose payload is the array
 * the `ValidationPipe` produces, so the wording a client sees over a socket is
 * the wording it sees over HTTP for the same mistake.
 */
function describeRefusal(error: unknown): string {
  const response = (error as { response?: { message?: unknown } } | undefined)
    ?.response;
  const message = response?.message;

  if (Array.isArray(message)) {
    return message.join(', ');
  }

  return typeof message === 'string' ? message : 'The handshake was refused';
}

/** A stack when there is one, the value itself otherwise. */
function toLogDetail(error: unknown): string {
  return error instanceof Error
    ? (error.stack ?? error.message)
    : String(error);
}
