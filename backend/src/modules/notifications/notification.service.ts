import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';

import { AdministrativeRole } from '../../common/constants/role.constants';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { PaginatedResult } from '../../common/interfaces/pagination.interface';
import { buildPaginatedResult } from '../../common/utils/pagination.util';
import {
  NotificationRecipientType,
  NotificationWorkspace,
} from '../../generated/prisma/enums';
import { UserService } from '../users/user.service';
import { CreateNotificationDto } from './dto/create-notification.dto';
import { NotificationQueryDto } from './dto/notification-query.dto';
import {
  NotificationEntity,
  toNotificationEntity,
} from './entities/notification.entity';
import { NotificationEventPublisher } from './notification-events';
import {
  ROLE_ADDRESSED_RECIPIENT_TYPE,
  USER_ADDRESSED_RECIPIENT_TYPE,
  WORKSPACE_RECIPIENT_TYPES,
} from './notification.constants';
import {
  CreateNotificationData,
  NotificationAudience,
  NotificationRepository,
} from './notification.repository';

/**
 * How many notifications a bulk operation touched.
 *
 * Returned by "mark all read" and by both "delete all" endpoints, because
 * `{ "data": null }` would leave a client unable to tell "nothing was unread"
 * from "the request did nothing" — and on a destructive operation that is
 * exactly the thing a person wants confirmed.
 */
export interface NotificationBulkResult {
  readonly affected: number;
}

/**
 * Every rule about notifications lives here; the two controllers only route and
 * the repository only queries.
 *
 * This module **stores and serves** notifications. It does not produce them, and
 * that separation is the feature's central decision rather than a staging
 * convenience — see the feature document. Nothing here sends an email, opens a
 * socket, schedules a job or reacts to a leave request being approved.
 *
 * Five decisions worth naming:
 *
 * 1. **Visibility is never computed twice.** The only way to reach a
 *    notification is through an audience — the repository's one predicate for
 *    "what may this person see" — and every read, write and delete goes through
 *    it. There is no code path that loads a notification by id and then decides
 *    whether the caller should have it.
 * 2. **Invisible is indistinguishable from absent.** A notification the caller
 *    may not see is a `404`, not a `403`, so `GET /notifications/:id` cannot be
 *    used to discover that a notification exists — the same call
 *    `LeaveRequestsService` makes for somebody else's request.
 * 3. **The administrative workspace is a `403`, and it is not RBAC.** Opening
 *    the back-office inbox as an ordinary employee is refused, and that check is
 *    what `ADMINISTRATIVE_USERS` *means*: without it every employee would
 *    receive the back-office broadcasts, because that recipient type matches
 *    anybody who asks. Which menus each administrative role sees is a later
 *    feature and is not decided here — all three roles see the same workspace.
 * 4. **Addressing is validated as one rule.** Which workspace/recipient pairings
 *    are legal, and which of `recipientUserId` / `recipientRole` each requires,
 *    are the same rule and are enforced in one method against
 *    `WORKSPACE_RECIPIENT_TYPES`.
 * 5. **Nothing here authenticates.** The caller comes from headers, through
 *    `@CurrentUser()`, and any caller may claim any account and any role. That
 *    is the honest shape of an API whose auth feature has not been written; half
 *    an access check reads as protection while providing none.
 *
 * **The known limitation**, stated here because it is the first thing a reader
 * of this class should know: `isRead` is one column on the notification row, so
 * a broadcast — `ALL_USERS` or `ADMINISTRATIVE_USERS` — has one read flag shared
 * by everybody who can see it. The first person to read a company announcement
 * marks it read for all of them, and deleting one removes it for all of them.
 * That is the model this feature was specified with; correcting it needs a
 * per-user `notification_reads` table, which the feature document describes.
 */
@Injectable()
export class NotificationService {
  private readonly logger = new Logger(NotificationService.name);

  /**
   * Where changes to this table are announced, once something is listening.
   *
   * `null` until the Notification Delivery Engine registers itself — see
   * {@link registerEventPublisher} — and `null` forever in a deployment or a test
   * that boots the centre without the engine. That is the property that keeps
   * this module standalone: notifications are stored, read and cleared exactly
   * the same way whether or not anybody is watching.
   */
  private publisher: NotificationEventPublisher | null = null;

  constructor(
    private readonly notifications: NotificationRepository,
    private readonly users: UserService,
  ) {}

  /**
   * Registers the one component that announces changes to this table.
   *
   * Called once, by the delivery engine's module, on startup. A method rather
   * than an injected provider because injection would have required one of the
   * two modules to import the other, and the direction Features 026 and 027 both
   * committed to is that **the engine imports the centre and never the reverse** —
   * see {@link NotificationEventPublisher} for the whole argument.
   *
   * Last registration wins. There is exactly one caller, and a rule that silently
   * kept the first would make a hot-reloaded engine stop emitting with nothing to
   * explain it.
   */
  registerEventPublisher(publisher: NotificationEventPublisher): void {
    this.publisher = publisher;
  }

  // ---------------------------------------------------------------------------
  // Personal workspace — `/api/v1/notifications`
  // ---------------------------------------------------------------------------

  /**
   * One page of the caller's personal notifications: what is addressed to them
   * by name, plus every `ALL_USERS` announcement.
   *
   * Open to every role. An administrator is also an employee as far as this
   * workspace is concerned — their leave is approved and their timesheet is due
   * like anybody's — so there is no check here beyond knowing who is calling.
   */
  async findPersonal(
    user: CurrentUser,
    query: NotificationQueryDto,
  ): Promise<PaginatedResult<NotificationEntity>> {
    return this.findPage(personalAudience(user), query);
  }

  /** Marks every unread personal notification of the caller as read. */
  async markAllPersonalRead(
    user: CurrentUser,
  ): Promise<NotificationBulkResult> {
    return this.markAllRead(user, personalAudience(user));
  }

  /**
   * Deletes every personal notification of the caller.
   *
   * Read and unread alike: this is "clear my inbox", and an operation that
   * silently spared the unread ones would leave a list the person believed they
   * had emptied.
   */
  async removeAllPersonal(user: CurrentUser): Promise<NotificationBulkResult> {
    return this.removeAll(user, personalAudience(user));
  }

  // ---------------------------------------------------------------------------
  // Administrative workspace — `/api/v1/administrative/notifications`
  // ---------------------------------------------------------------------------

  /**
   * One page of the administrative inbox: what is addressed to the caller's role,
   * plus every `ADMINISTRATIVE_USERS` announcement.
   *
   * All three administrative roles see the same workspace. A `ROLE` notification
   * addressed to `HR` reaches HR and nobody else — not because a permission says
   * so, but because that is what addressing it to a role means.
   */
  async findAdministrative(
    user: CurrentUser,
    query: NotificationQueryDto,
  ): Promise<PaginatedResult<NotificationEntity>> {
    return this.findPage(this.administrativeAudience(user), query);
  }

  /** Marks every unread administrative notification the caller can see as read. */
  async markAllAdministrativeRead(
    user: CurrentUser,
  ): Promise<NotificationBulkResult> {
    return this.markAllRead(user, this.administrativeAudience(user));
  }

  /** Deletes every administrative notification the caller can see. */
  async removeAllAdministrative(
    user: CurrentUser,
  ): Promise<NotificationBulkResult> {
    return this.removeAll(user, this.administrativeAudience(user));
  }

  /**
   * How many notifications in one workspace the caller has not read.
   *
   * The number behind an unread badge, and the reason it is a method here rather
   * than a page request with `?limit=1&isRead=false`: the delivery engine
   * recalculates it after every create, read and delete, and fetching a row
   * nobody displays would be the most frequent query in the application.
   *
   * The administrative workspace answers a `403` for a caller whose role has no
   * access, exactly as the list does — the audience is built by the same method,
   * so "which workspaces may this person count" cannot drift from "which
   * workspaces may this person read".
   */
  async countUnread(
    user: CurrentUser,
    workspace: NotificationWorkspace,
  ): Promise<number> {
    const audience =
      workspace === NotificationWorkspace.PERSONAL
        ? personalAudience(user)
        : this.administrativeAudience(user);

    return this.notifications.countUnread(audience);
  }

  // ---------------------------------------------------------------------------
  // Addressed by id — either workspace
  // ---------------------------------------------------------------------------

  /**
   * One notification, from whichever workspace the caller can see it in.
   *
   * There is no separate `GET /administrative/notifications/:id`, and there
   * should not be: an id identifies a notification, not a workspace, so a second
   * route would only differ in which of the two lookups it refused to perform —
   * and a client holding an id would have to know which workspace it came from
   * to choose the right URL.
   */
  async findOne(user: CurrentUser, id: string): Promise<NotificationEntity> {
    return toNotificationEntity(await this.findVisibleOrThrow(user, id));
  }

  /**
   * Marks one notification as read, setting `readAt` to now.
   *
   * Visibility is confirmed first, so marking somebody else's notification read
   * is the same `404` as marking one that does not exist. The timestamp comes
   * from the server rather than the client, for the reason every other decided-at
   * column in this project does: a client's clock is not a fact about when
   * something happened here.
   *
   * Marking an already-read notification read again succeeds and changes
   * nothing, `readAt` included. Two tabs opening one message is not a mistake
   * worth a `409`, and rewriting the timestamp would replace the moment somebody
   * first read it with the moment they last clicked.
   */
  async markRead(user: CurrentUser, id: string): Promise<NotificationEntity> {
    const notification = await this.findVisibleOrThrow(user, id);

    if (notification.isRead) {
      return toNotificationEntity(notification);
    }

    const read = toNotificationEntity(
      await this.notifications.markRead(id, new Date()),
    );

    // Announced only when something actually moved. Emitting on the idempotent
    // path would tell a client its badge changed when it did not, and two tabs
    // opening one message would produce two events for one change.
    this.publish((events) => {
      events.read(read);
    });

    return read;
  }

  /**
   * Deletes one notification the caller can see.
   *
   * A hard delete, and for a broadcast that means for everybody — see the note
   * on this class. For a notification addressed to one person it means what it
   * says: they dismissed their own message.
   */
  async remove(user: CurrentUser, id: string): Promise<void> {
    const notification = await this.findVisibleOrThrow(user, id);

    await this.notifications.deleteById(notification.id);

    // Announced from the row read before the delete, because there is nothing
    // left to read afterwards and a client needs to know *which* notification to
    // drop from a list it is already displaying.
    this.publish((events) => {
      events.deleted(toNotificationEntity(notification));
    });
  }

  // ---------------------------------------------------------------------------
  // Creation — temporary
  // ---------------------------------------------------------------------------

  /**
   * Creates a notification.
   *
   * **A temporary endpoint.** Notifications will be produced by the Notification
   * Delivery Engine from events the application already records; this exists so
   * the centre can be exercised before that engine is written, and it goes away
   * when the engine arrives. It is validated properly regardless, because the
   * shape it accepts is the shape the engine will write, and a lax placeholder
   * would put rows in the table that every later reader had to cope with.
   *
   * It deliberately checks nothing about *who* is creating. There is no
   * authentication to check against, and refusing on the basis of a claimed
   * header would read as protection while providing none.
   *
   * The order of the checks is the escalation the API promises: a body whose
   * four addressing fields do not form a legal combination is a `400` naming the
   * combination, and only a body that is well formed is finally weighed against
   * the `users` table.
   */
  async create(dto: CreateNotificationDto): Promise<NotificationEntity> {
    const recipient = assertAddressingIsValid(dto);

    if (recipient.recipientUserId !== null) {
      await this.assertRecipientExists(recipient.recipientUserId);
    }

    const created = toNotificationEntity(
      await this.notifications.create({
        workspace: dto.workspace,
        recipientType: dto.recipientType,
        recipientUserId: recipient.recipientUserId,
        recipientRole: recipient.recipientRole,
        title: dto.title,
        message: dto.message,
        category: dto.category,
        type: dto.type,
        priority: dto.priority,
      }),
    );

    this.publish((events) => {
      events.created([created]);
    });

    return created;
  }

  /**
   * Creates several notifications at once, applying the same addressing rules to
   * every one of them.
   *
   * **The Notification Delivery Engine's entry point into this table**, and the
   * reason it exists rather than the engine writing rows itself: a campaign
   * addressed to a thousand employees is a thousand notifications, and the
   * four-combination addressing rule has to hold for each. Written in the engine,
   * that rule would have a second enforcement point and one of the two would
   * eventually be the lenient one.
   *
   * Three properties are what make it more than a loop over {@link create}:
   *
   * 1. **Every entry is validated before any is written.** A batch is all or
   *    nothing, so a campaign cannot half-deliver because its four hundredth
   *    recipient was malformed.
   * 2. **The recipients are confirmed in one query**, not one per row. A thousand
   *    `findEmployeeLink` calls to answer "do these accounts exist" is a thousand
   *    round trips; the distinct ids go to `UserService.findExistingIds` once.
   * 3. **One insert, and one announcement.** The rows are written by a single
   *    statement and handed to the publisher as a list, so each recipient's
   *    unread count is recalculated once however many notifications they received.
   *
   * An empty list is a no-op that returns an empty list. A campaign whose audience
   * resolved to nobody is a normal state — everybody named has left the company —
   * rather than an error, and it is the same call `EmailService.sendMany` makes.
   */
  async createMany(
    dtos: readonly CreateNotificationDto[],
  ): Promise<NotificationEntity[]> {
    if (dtos.length === 0) {
      return [];
    }

    const rows: CreateNotificationData[] = dtos.map((dto) => {
      const recipient = assertAddressingIsValid(dto);

      return {
        workspace: dto.workspace,
        recipientType: dto.recipientType,
        recipientUserId: recipient.recipientUserId,
        recipientRole: recipient.recipientRole,
        title: dto.title,
        message: dto.message,
        category: dto.category,
        type: dto.type,
        priority: dto.priority,
      };
    });

    await this.assertRecipientsExist(rows);

    const created = (await this.notifications.createMany(rows)).map(
      toNotificationEntity,
    );

    this.publish((events) => {
      events.created(created);
    });

    return created;
  }

  // ---------------------------------------------------------------------------
  // Shared
  // ---------------------------------------------------------------------------

  /** One page of an audience's notifications. */
  private async findPage(
    audience: NotificationAudience,
    query: NotificationQueryDto,
  ): Promise<PaginatedResult<NotificationEntity>> {
    const [notifications, total] = await this.notifications.findPage(
      audience,
      query,
    );

    return buildPaginatedResult(
      notifications.map(toNotificationEntity),
      total,
      query,
    );
  }

  private async markAllRead(
    user: CurrentUser,
    audience: NotificationAudience,
  ): Promise<NotificationBulkResult> {
    const affected = await this.notifications.markAllRead(audience, new Date());

    this.announceBulkChange(user, audience, affected);

    return { affected };
  }

  private async removeAll(
    user: CurrentUser,
    audience: NotificationAudience,
  ): Promise<NotificationBulkResult> {
    const affected = await this.notifications.deleteAll(audience);

    this.announceBulkChange(user, audience, affected);

    return { affected };
  }

  /**
   * Announces a bulk change, unless nothing moved.
   *
   * The `affected === 0` guard is what keeps a client from refetching a list
   * that is identical to the one it is showing: "mark all read" on an inbox with
   * nothing unread is a legitimate request that changes nothing, and an event for
   * it would be noise every open tab has to process.
   */
  private announceBulkChange(
    user: CurrentUser,
    audience: NotificationAudience,
    affected: number,
  ): void {
    if (affected === 0) {
      return;
    }

    this.publish((events) => {
      events.bulkChanged(user, audience.workspace, affected);
    });
  }

  /**
   * Hands a change to whatever is listening, and never lets it break the write
   * that caused it.
   *
   * Every announcement in this class goes through here, so the guarantee is
   * stated once: a socket that has gone away, a publisher that throws, a
   * serialisation that fails — none of them may turn a stored notification into a
   * `500`. It is the rule Feature 025 asks every email caller to apply, applied
   * here on the callers' behalf because there is exactly one place to apply it.
   *
   * The publisher is also expected to be defensive itself; this is the belt to
   * its braces, and it is what lets `registerEventPublisher` accept an
   * implementation this module cannot see.
   */
  private publish(
    announce: (events: NotificationEventPublisher) => void,
  ): void {
    if (this.publisher === null) {
      return;
    }

    try {
      announce(this.publisher);
    } catch (error) {
      this.logger.error(
        'Announcing a notification change failed',
        error instanceof Error ? (error.stack ?? error.message) : String(error),
      );
    }
  }

  /**
   * Loads a notification the caller may see, or reports it missing.
   *
   * The caller is offered every audience they hold — their personal one always,
   * and the administrative one when their role has access — so a single route
   * serves both workspaces without the client having to know which one an id
   * belongs to.
   *
   * A notification that exists but belongs to another audience answers the same
   * `404` as one that does not exist. Distinguishing them would make this
   * endpoint a way to confirm that a message was sent, which is precisely what a
   * scoped read must not leak.
   */
  private async findVisibleOrThrow(user: CurrentUser, id: string) {
    const audiences: NotificationAudience[] = [personalAudience(user)];

    if (user.administrativeAccess) {
      audiences.push(this.administrativeAudience(user));
    }

    const notification = await this.notifications.findVisible(id, audiences);

    if (notification === null) {
      throw new NotFoundException(`Notification ${id} was not found`);
    }

    return notification;
  }

  /**
   * The caller's administrative audience, or a `403`.
   *
   * A `403` rather than the `404` the by-id lookups answer with, and the
   * difference is deliberate: those hide whether a particular notification
   * exists, while the *workspace* is not a secret — its URL is in the API
   * documentation, and pretending the route is missing would send an
   * administrator whose role header was wrong to look for a typo in the path.
   *
   * The check narrows `UserRole` to `AdministrativeRole` at the same time, which
   * is what lets the audience be built without a cast: the type says the role in
   * it has already been checked.
   */
  private administrativeAudience(user: CurrentUser): NotificationAudience {
    if (!user.administrativeAccess) {
      throw new ForbiddenException(
        `The administrative notification workspace is available to administrative roles only; this account holds ${user.role}`,
      );
    }

    return {
      workspace: NotificationWorkspace.ADMINISTRATIVE,
      // Safe by the guard above: `administrativeAccess` is `true` exactly when
      // the role is one of `ADMINISTRATIVE_ROLES`, which is what the narrower
      // type means. It is asserted rather than re-derived so the two cannot
      // disagree about which roles qualify.
      role: user.role as AdministrativeRole,
    };
  }

  /**
   * Rejects a notification addressed to an account that does not exist.
   *
   * A `400` rather than a `404`: the resource being addressed — the notifications
   * collection — is fine, it is the submitted body that names something absent.
   * The same call `LeaveRequestsService` makes for a missing leave type.
   *
   * The account is read through `UserService` rather than by querying `users`
   * here, which is the rule every module in this project follows: the module that
   * owns a table is the only one that reads it, and for `users` that rule is what
   * keeps "never return the password hash" enforceable in one place.
   * `findEmployeeLink` is the existence check that module already exposes; only
   * its `null` answer is used here.
   */
  private async assertRecipientExists(recipientUserId: string): Promise<void> {
    const account = await this.users.findEmployeeLink(recipientUserId);

    if (account === null) {
      throw new BadRequestException([
        `recipientUserId names user ${recipientUserId}, who does not exist`,
      ]);
    }
  }

  /**
   * Rejects a batch naming an account that is not there, in one query.
   *
   * The bulk counterpart of {@link assertRecipientExists}, and separate from it
   * for the reason `EmployeeService.findExistingIds` is separate from
   * `findStatus`: one asks about a person, the other asks about a set. A thousand
   * single lookups would be a thousand round trips to answer one question.
   *
   * Every missing account is reported at once, as an array, and each id is named
   * once however many notifications addressed it — a campaign that reached a
   * deleted account should say so once rather than four hundred times.
   *
   * Rows addressing nobody in particular — the two broadcasts and the
   * role-addressed notifications — contribute no ids and cost no query.
   */
  private async assertRecipientsExist(
    rows: readonly CreateNotificationData[],
  ): Promise<void> {
    const recipientUserIds = [
      ...new Set(
        rows
          .map(({ recipientUserId }) => recipientUserId)
          .filter((userId): userId is string => userId !== null),
      ),
    ];

    if (recipientUserIds.length === 0) {
      return;
    }

    const known = new Set(await this.users.findExistingIds(recipientUserIds));
    const problems = recipientUserIds
      .filter((userId) => !known.has(userId))
      .map(
        (userId) => `recipientUserId names user ${userId}, who does not exist`,
      );

    if (problems.length > 0) {
      throw new BadRequestException(problems);
    }
  }
}

/** The caller's personal audience. Every role has one. */
function personalAudience(user: CurrentUser): NotificationAudience {
  return {
    workspace: NotificationWorkspace.PERSONAL,
    userId: user.userId,
  };
}

/**
 * The addressing rule, all of it, in one place.
 *
 * Three things have to hold, and they are one rule rather than three because
 * each answer decides the next:
 *
 * 1. **The workspace must accept the recipient type.** Four of the eight
 *    pairings are legal; `WORKSPACE_RECIPIENT_TYPES` is the table.
 * 2. **`USER` requires `recipientUserId` and refuses `recipientRole`.**
 * 3. **`ROLE` requires `recipientRole` and refuses `recipientUserId`.** The two
 *    broadcasts refuse both.
 *
 * The refusals matter as much as the requirements. A `ROLE` notification
 * carrying a `recipientUserId` is not merely untidy — the field would be stored,
 * and a later reader could not tell whether the message was meant for a role or
 * for a person. Silently dropping it would be worse still: the caller would
 * believe they had addressed somebody.
 *
 * Every problem is reported at once, as an array — the same shape the
 * `ValidationPipe` produces — so a form can mark each offending field instead of
 * surfacing the second problem only after the first is fixed.
 *
 * Returns the two columns as they should be *stored*, with `undefined` resolved
 * to `null`, so the caller writes what this function decided rather than
 * re-reading the DTO and reapplying the same reasoning.
 */
function assertAddressingIsValid(dto: CreateNotificationDto): {
  recipientUserId: string | null;
  recipientRole: AdministrativeRole | null;
} {
  const { workspace, recipientType, recipientUserId, recipientRole } = dto;
  const allowed: readonly NotificationRecipientType[] =
    WORKSPACE_RECIPIENT_TYPES[workspace];

  if (!allowed.includes(recipientType)) {
    throw new BadRequestException([
      `recipientType ${recipientType} is not valid in the ${workspace} workspace; it accepts: ${allowed.join(', ')}`,
    ]);
  }

  const problems: string[] = [];
  const needsUser = recipientType === USER_ADDRESSED_RECIPIENT_TYPE;
  const needsRole = recipientType === ROLE_ADDRESSED_RECIPIENT_TYPE;

  if (needsUser && recipientUserId === undefined) {
    problems.push(requiredFor('recipientUserId', recipientType));
  }

  if (!needsUser && recipientUserId !== undefined) {
    problems.push(refusedFor('recipientUserId', recipientType));
  }

  if (needsRole && recipientRole === undefined) {
    problems.push(requiredFor('recipientRole', recipientType));
  }

  if (!needsRole && recipientRole !== undefined) {
    problems.push(refusedFor('recipientRole', recipientType));
  }

  if (problems.length > 0) {
    throw new BadRequestException(problems);
  }

  return {
    recipientUserId: recipientUserId ?? null,
    recipientRole: recipientRole ?? null,
  };
}

function requiredFor(
  field: string,
  recipientType: NotificationRecipientType,
): string {
  return `${field} is required when recipientType is ${recipientType}`;
}

function refusedFor(
  field: string,
  recipientType: NotificationRecipientType,
): string {
  return `${field} must not be sent when recipientType is ${recipientType}`;
}
