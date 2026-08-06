import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { NotificationWorkspace } from '../../generated/prisma/enums';
import { NotificationEntity } from './entities/notification.entity';

/**
 * What this module tells the outside world when its table changes.
 *
 * **A port, declared by the consumer.** The notification centre knows *that*
 * something happened to a notification; it does not know, and must not know,
 * that somewhere there is a WebSocket, a room called `user:emp-1` or a badge to
 * refresh. The Notification Delivery Engine implements this interface and
 * registers itself through {@link NotificationService.registerEventPublisher};
 * nothing here imports the engine.
 *
 * That direction is the one Features 026 and 027 both promised and is what keeps
 * the dependency graph acyclic: **the engine imports the centre, never the
 * reverse.** Had this module instead injected a gateway, storing a notification
 * would depend on a socket library, a scheduler and an SMTP client — four
 * reasons to change a table of stored messages.
 *
 * Registration rather than dependency injection is deliberate. A Nest provider
 * token would have had to be declared in *some* module's `providers`, and
 * whichever module that was would have imported the other: either the centre
 * imports the engine (the cycle above) or the engine declares a provider the
 * centre must already know how to inject. A method the engine calls on startup
 * has neither problem, and it makes the seam visible in one line of the engine's
 * module rather than spread across two `@Module` decorators.
 *
 * Every method returns `void` and none may throw: an announcement that could not
 * be announced is still a notification that was stored, and a socket failure must
 * not turn a successful mark-read into a 500. {@link NotificationService} guards
 * the call as well, so the rule holds even for a publisher that forgets it.
 */
export interface NotificationEventPublisher {
  /**
   * One or more notifications now exist.
   *
   * A list rather than one call per row, because a company-wide campaign creates
   * a notification per employee in one write and the badge each of them sees
   * should be recalculated once. Per-row calls would produce one unread-count
   * event per notification per person — the duplicate emission the engine's
   * business rules forbid.
   */
  created(notifications: readonly NotificationEntity[]): void;

  /** One notification was marked read. */
  read(notification: NotificationEntity): void;

  /** One notification was deleted. It no longer exists when this is called. */
  deleted(notification: NotificationEntity): void;

  /**
   * A whole workspace changed at once — "mark all read", "empty the inbox".
   *
   * The caller is named rather than the rows, because there are no rows left to
   * name: `affected` is how many moved, and the workspace says which list to
   * refetch. The `user` is who asked, which is also whose badge changed.
   */
  bulkChanged(
    user: CurrentUser,
    workspace: NotificationWorkspace,
    affected: number,
  ): void;
}
