import { NotificationWorkspace } from '../../../generated/prisma/enums';
import { NotificationEntity } from '../../notifications/entities/notification.entity';

/**
 * The gateway's published vocabulary: what a client may send, what the server
 * sends back, and the shape of each payload.
 *
 * Written as constants rather than as string literals at each emit, for the
 * reason every closed vocabulary in this project is: a name misspelled at one of
 * two call sites produces an event nobody listens for and no error anywhere.
 *
 * The dotted spelling — `notification.created` rather than `notificationCreated`
 * — is deliberate and matches the client event's plain `switchWorkspace`: server
 * events name a *resource and what happened to it*, client events name a
 * *command*. A client subscribing to everything about notifications can match on
 * the prefix.
 */

/**
 * What the client may send.
 *
 * `connection` and `disconnect` are Socket.IO's own lifecycle events and are
 * handled by `OnGatewayConnection` / `OnGatewayDisconnect` rather than by a
 * `@SubscribeMessage`, so the only *message* a client sends is this one.
 */
export const CLIENT_EVENTS = {
  SWITCH_WORKSPACE: 'switchWorkspace',
} as const;

/**
 * What the server sends.
 *
 * Five events, and each has exactly one producer — which is the property that
 * keeps "never emit duplicate websocket events" true rather than hoped for:
 *
 * | Event | Emitted when | By |
 * | --- | --- | --- |
 * | `notification.created` | one notification was written | `NotificationService.create` / `createMany`, through the publisher |
 * | `notification.read` | one notification was marked read | `NotificationService.markRead` |
 * | `notification.deleted` | one notification was removed | `NotificationService.remove` |
 * | `notification.updated` | a whole workspace changed at once — "read all", "delete all" | `markAll*Read` / `removeAll*` |
 * | `notification.unreadCount` | any of the above changed somebody's badge | the broadcaster, once per affected person |
 *
 * `notification.updated` is the bulk event rather than a second spelling of
 * `read`: a "mark everything read" over three hundred rows has no single
 * notification to name, and emitting three hundred `notification.read` events to
 * say one thing is exactly the duplication the business rule forbids. Its
 * payload carries the workspace and how many rows moved, which is what a client
 * needs to decide between patching its list and refetching it.
 */
export const SERVER_EVENTS = {
  CREATED: 'notification.created',
  UPDATED: 'notification.updated',
  DELETED: 'notification.deleted',
  READ: 'notification.read',
  UNREAD_COUNT: 'notification.unreadCount',
} as const;

/**
 * Nest's own error channel for WebSockets, reused for a refused handshake.
 *
 * Not a sixth domain event: `WsExceptionsHandler` already emits `exception` when
 * a message handler throws, so a connection refused for the same kind of reason
 * — headers that do not say who is calling — arrives on the channel a client is
 * already listening to. Inventing `notification.error` beside it would give one
 * concern two names.
 */
export const ERROR_EVENT = 'exception';

/**
 * A notification the client should add to, or replace in, its list.
 *
 * The whole entity rather than an id, because the alternative is a fetch per
 * event on a screen that is already open — and the entity is the same shape
 * `GET /notifications` returns, so a client renders it with the code it has.
 */
export interface NotificationEventPayload {
  readonly notification: NotificationEntity;
}

/**
 * A notification the client should drop from its list.
 *
 * An id and a workspace rather than the entity: the row is gone by the time this
 * is sent, and re-sending what was deleted would invite a client to render it.
 */
export interface NotificationDeletedPayload {
  readonly id: string;
  readonly workspace: NotificationWorkspace;
}

/** A whole workspace changed at once; `affected` is how many rows moved. */
export interface NotificationBulkPayload {
  readonly workspace: NotificationWorkspace;
  readonly affected: number;
}

/**
 * The authoritative unread badge for one workspace.
 *
 * A count rather than a delta, so a client that missed an event — a reconnect, a
 * tab that was asleep — recovers on the next one instead of drifting.
 */
export interface NotificationUnreadCountPayload {
  readonly workspace: NotificationWorkspace;
  readonly count: number;
}

/** What `switchWorkspace` carries. */
export interface SwitchWorkspacePayload {
  readonly workspace: NotificationWorkspace;
}

/**
 * What `switchWorkspace` answers with.
 *
 * An acknowledgement rather than a fire-and-forget, because the request can be
 * refused — an ordinary employee cannot enter the administrative workspace — and
 * a client that switched tabs needs to know whether it is now looking at a feed
 * it will never receive events for.
 */
export interface SwitchWorkspaceAck {
  readonly success: boolean;
  readonly workspace: NotificationWorkspace;
  readonly room: string;
  /** Present only when `success` is false. */
  readonly message?: string;
}
