import { NotificationWorkspace } from '../../../generated/prisma/enums';

/**
 * The names and shapes of the real-time layer, in one place.
 *
 * Room names are the part that matters most here: they are a contract between
 * this gateway and every client that subscribes, and a prefix spelled two ways
 * would produce a room nobody is in and an event nobody receives. They are built
 * by the two functions below and by nothing else.
 */

/**
 * The Socket.IO namespace clients connect to.
 *
 * The default one, so a client connects to the server's origin without a path
 * segment to remember. A named namespace would be worth it the day a second,
 * unrelated real-time feature exists — a chat, a presence indicator — because
 * namespaces are what keeps two features' events from arriving at each other's
 * listeners. There is one feature, so there is one namespace.
 */
export const NOTIFICATION_NAMESPACE = '/';

/** `user:{employeeId}` — everything addressed to one person. */
const USER_ROOM_PREFIX = 'user:';

/** `workspace:PERSONAL` / `workspace:ADMINISTRATIVE` — the two broadcasts. */
const WORKSPACE_ROOM_PREFIX = 'workspace:';

/**
 * The room holding one person's own sockets.
 *
 * Keyed by **employee** rather than by user account, which is the one place this
 * feature's addressing differs from the notification centre's. A notification is
 * addressed to a `users.id`; a campaign is addressed to an `employees.id`; and a
 * room name is something a client and a log both have to read, so it is spelled
 * in the vocabulary the screens use. The registry holds both ids for every
 * connection, so emitting to a user account is a lookup rather than a join.
 */
export function userRoom(employeeId: string): string {
  return `${USER_ROOM_PREFIX}${employeeId}`;
}

/**
 * The room holding every socket currently reading one workspace.
 *
 * A connection is in exactly one of these at a time — that is what makes
 * `switchWorkspace` a `leave` followed by a `join` rather than a filter applied
 * at emit time, and it is why an administrator reading their personal inbox does
 * not receive back-office broadcasts they are not looking at.
 */
export function workspaceRoom(workspace: NotificationWorkspace): string {
  return `${WORKSPACE_ROOM_PREFIX}${workspace}`;
}

/**
 * The workspace a connection starts in.
 *
 * `PERSONAL`, because every account has one and no role check is needed to enter
 * it. Starting in `ADMINISTRATIVE` would mean deciding at connection time
 * whether the caller may be there, and refusing the connection over a workspace
 * they had not asked for.
 */
export const DEFAULT_WORKSPACE: NotificationWorkspace =
  NotificationWorkspace.PERSONAL;
