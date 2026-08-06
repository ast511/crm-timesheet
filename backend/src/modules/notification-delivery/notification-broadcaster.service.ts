import { Injectable, Logger, OnModuleInit } from '@nestjs/common';

import { CurrentUser } from '../../common/decorators/current-user.decorator';
import {
  NotificationRecipientType,
  NotificationWorkspace,
} from '../../generated/prisma/enums';
import { NotificationEntity } from '../notifications/entities/notification.entity';
import { NotificationEventPublisher } from '../notifications/notification-events';
import { NotificationService } from '../notifications/notification.service';
import { NotificationGateway } from './websocket/notification.gateway';
import {
  SERVER_EVENTS,
  NotificationBulkPayload,
  NotificationDeletedPayload,
  NotificationEventPayload,
  NotificationUnreadCountPayload,
} from './websocket/websocket-events';
import {
  ConnectedUser,
  WebsocketUserRegistryService,
} from './websocket/websocket-user-registry.service';

/**
 * Turns "something happened to a notification" into the events a client sees.
 *
 * **The implementation of the notification centre's outbound port, and the one
 * component that decides who an event is for.** The gateway knows rooms and
 * sockets; `NotificationService` knows rows; this knows the thing neither of them
 * should: that an `ALL_USERS` announcement changes the badge of everybody
 * currently connected, that a `ROLE` notification concerns one role, and that a
 * person who is offline needs no event at all.
 *
 * It registers itself with `NotificationService` on startup, which is what keeps
 * the dependency running one way — the engine imports the centre, and the centre
 * has never heard of a socket. See {@link NotificationEventPublisher}.
 *
 * Three properties are the design:
 *
 * 1. **One change, one event per client.** A campaign that writes eight hundred
 *    notifications produces eight hundred `notification.created` events, each to
 *    the one person it is for, and **one** `notification.unreadCount` per
 *    connected person — not one per notification. That is the difference between
 *    a badge that updates and a client that processes the same number eight
 *    hundred times.
 * 2. **Nothing here may throw.** The port's contract is `void`, and a socket that
 *    has gone away must not turn a stored notification into a `500`. Every
 *    method is synchronous and the count refresh — which is a query — is
 *    deliberately fire-and-forget, with its own catch. A badge that arrives a
 *    moment late is a badge; a badge that fails the write that caused it is a
 *    bug.
 * 3. **Only connected people are counted.** The unread count is a query per
 *    affected connection, so the work is bounded by who is actually looking at
 *    the application rather than by how many people the company employs.
 */
@Injectable()
export class NotificationBroadcaster
  implements NotificationEventPublisher, OnModuleInit
{
  private readonly logger = new Logger(NotificationBroadcaster.name);

  constructor(
    private readonly notifications: NotificationService,
    private readonly gateway: NotificationGateway,
    private readonly registry: WebsocketUserRegistryService,
  ) {}

  /**
   * Plugs the engine into the notification centre.
   *
   * `onModuleInit` rather than a constructor call, so registration happens once
   * the container has finished building both sides rather than while it is still
   * assembling this one.
   */
  onModuleInit(): void {
    this.notifications.registerEventPublisher(this);
  }

  /**
   * Announces notifications that now exist, and refreshes the badges they moved.
   *
   * The two loops are separate on purpose: the first is per *notification* —
   * every one of them is a distinct thing a client should add to its list — and
   * the second is per *person*, so somebody who received four notifications from
   * one campaign is told their new count once.
   */
  created(notifications: readonly NotificationEntity[]): void {
    for (const notification of notifications) {
      this.emit(notification, SERVER_EVENTS.CREATED, { notification });
    }

    this.refreshCounts(notifications);
  }

  /** Announces one notification as read, and refreshes the reader's badge. */
  read(notification: NotificationEntity): void {
    this.emit(notification, SERVER_EVENTS.READ, { notification });
    this.refreshCounts([notification]);
  }

  /** Announces one notification as gone, and refreshes the badge it left. */
  deleted(notification: NotificationEntity): void {
    const payload: NotificationDeletedPayload = {
      id: notification.id,
      workspace: notification.workspace,
    };

    this.emit(notification, SERVER_EVENTS.DELETED, payload);
    this.refreshCounts([notification]);
  }

  /**
   * Announces a whole workspace changing at once, to the person who changed it.
   *
   * "Mark all read" and "empty the inbox" are the caller's own operations over
   * their own audience, so the event goes to them and to nobody else — even
   * though the rows may have included a broadcast that other people can also see.
   * That is a consequence of Feature 026's shared read state rather than of this
   * method, and it is recorded there; when notifications gain per-user read rows
   * the operation becomes genuinely personal and this event will be exactly right.
   */
  bulkChanged(
    user: CurrentUser,
    workspace: NotificationWorkspace,
    affected: number,
  ): void {
    const payload: NotificationBulkPayload = { workspace, affected };

    this.gateway.emitToUser(user.userId, SERVER_EVENTS.UPDATED, payload);

    const connection = this.registry.findByUserId(user.userId);

    if (connection !== null) {
      this.refresh(connection, workspace);
    }
  }

  /**
   * Sends one notification's event to whoever it concerns.
   *
   * A notification addressed to one account goes to that account's own room; a
   * broadcast and a role-addressed notification go to the workspace room, because
   * the set of people they concern is the set of people reading that workspace.
   * Which of the two applies is read off `recipientType`, the same column
   * `NotificationRepository`'s visibility predicate is built on — so a client
   * receives exactly the notifications a `GET` of the same workspace would have
   * returned.
   */
  private emit(
    notification: NotificationEntity,
    event: string,
    payload: NotificationEventPayload | NotificationDeletedPayload,
  ): void {
    if (
      notification.recipientType === NotificationRecipientType.USER &&
      notification.recipientUserId !== null
    ) {
      this.gateway.emitToUser(notification.recipientUserId, event, payload);

      return;
    }

    this.gateway.emitToWorkspace(notification.workspace, event, payload);
  }

  /**
   * Refreshes the unread badge of everybody a batch of notifications concerns.
   *
   * The affected people are collected into a map keyed by user account *before*
   * anything is counted, so a person who appears in the batch several times — the
   * common case for a campaign that produced one notification per person, or for
   * two broadcasts written at once — is counted once and told once.
   */
  private refreshCounts(notifications: readonly NotificationEntity[]): void {
    const affected = new Map<
      string,
      { connection: ConnectedUser; workspace: NotificationWorkspace }
    >();

    for (const notification of notifications) {
      for (const connection of this.audienceOf(notification)) {
        affected.set(`${connection.userId}:${notification.workspace}`, {
          connection,
          workspace: notification.workspace,
        });
      }
    }

    for (const { connection, workspace } of affected.values()) {
      this.refresh(connection, workspace);
    }
  }

  /**
   * Which connected people one notification concerns.
   *
   * The same four cases the notification centre's visibility predicate answers,
   * asked of the registry instead of the database: a directly addressed
   * notification concerns one account, a personal broadcast concerns everybody, a
   * role notification concerns that role, and an administrative broadcast
   * concerns everybody with administrative access.
   *
   * People who are not connected are simply absent from the answer. Their
   * notification is stored and their badge is right the next time they open the
   * application, which is what makes this layer an optimisation rather than a
   * source of truth.
   */
  private audienceOf(notification: NotificationEntity): ConnectedUser[] {
    switch (notification.recipientType) {
      case NotificationRecipientType.USER:
        return connectionOrNone(
          notification.recipientUserId === null
            ? null
            : this.registry.findByUserId(notification.recipientUserId),
        );

      case NotificationRecipientType.ROLE:
        return this.registry
          .all()
          .filter(({ role }) => role === notification.recipientRole);

      case NotificationRecipientType.ADMINISTRATIVE_USERS:
        return this.registry
          .all()
          .filter(({ administrativeAccess }) => administrativeAccess);

      default:
        return this.registry.all();
    }
  }

  /**
   * Counts one person's unread notifications in one workspace and sends them the
   * number.
   *
   * Deliberately not awaited by its callers: the port's methods return `void`
   * because a badge must never be on the critical path of the write that moved
   * it. The failure is caught here rather than becoming an unhandled rejection —
   * a count that could not be taken is a badge that stays stale until the next
   * event, which is a far smaller problem than the one it would otherwise cause.
   */
  private refresh(
    connection: ConnectedUser,
    workspace: NotificationWorkspace,
  ): void {
    void this.notifications
      .countUnread(toCurrentUser(connection), workspace)
      .then((count) => {
        const payload: NotificationUnreadCountPayload = { workspace, count };

        this.gateway.emitToUser(
          connection.userId,
          SERVER_EVENTS.UNREAD_COUNT,
          payload,
        );
      })
      .catch((error: unknown) => {
        this.logger.error(
          `Refreshing the unread count for employee ${connection.employeeId} failed`,
          error instanceof Error
            ? (error.stack ?? error.message)
            : String(error),
        );
      });
  }
}

/**
 * A connection, as the notification centre describes a caller.
 *
 * `CurrentUser` is what `NotificationService` builds its audiences from, and a
 * connection holds every field of it — which is not a coincidence: the handshake
 * produced it through the same `resolveCurrentUser` an HTTP request goes through,
 * so the count a socket receives is the count the same person would get from
 * `GET /notifications?isRead=false`.
 */
function toCurrentUser(connection: ConnectedUser): CurrentUser {
  return {
    userId: connection.userId,
    employeeId: connection.employeeId,
    role: connection.role,
    administrativeAccess: connection.administrativeAccess,
  };
}

function connectionOrNone(connection: ConnectedUser | null): ConnectedUser[] {
  return connection === null ? [] : [connection];
}
