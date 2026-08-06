import { Injectable } from '@nestjs/common';

import { AdministrativeRole } from '../../common/constants/role.constants';
import { SortOrder } from '../../common/enums/sort-order.enum';
import { toSkipTake } from '../../common/utils/pagination.util';
import type { Prisma } from '../../generated/prisma/client';
import {
  NotificationCategory,
  NotificationPriority,
  NotificationRecipientType,
  NotificationType,
  NotificationWorkspace,
} from '../../generated/prisma/enums';
import { PrismaService } from '../../prisma/prisma.service';
import { NotificationQueryDto } from './dto/notification-query.dto';
import {
  NOTIFICATION_PUBLIC_SELECT,
  NotificationRow,
} from './entities/notification.entity';
import { NotificationSortField } from './notification.constants';

/**
 * Makes PostgreSQL fold the case of both operands, so `leave` finds `Leave`.
 * Extracted because getting it wrong on one of the two comparisons below would
 * produce a search that matched titles case-insensitively and bodies exactly.
 */
const CASE_INSENSITIVE = { mode: 'insensitive' } as const;

/**
 * Who is reading, expressed as the set of notifications they may see.
 *
 * A discriminated union rather than one object with two optional fields,
 * because the two workspaces are answered by genuinely different questions: the
 * personal one matches an account, the administrative one matches a role. With
 * optional fields, every function here would have to re-check which of them was
 * populated, and a caller could construct an audience that says nothing.
 *
 * This is the module's *domain* input for "what may this person see". The
 * service builds one from the caller and hands it over; turning it into a
 * `WHERE` is this file's job and happens nowhere else.
 */
export type NotificationAudience =
  | {
      readonly workspace: typeof NotificationWorkspace.PERSONAL;
      readonly userId: string;
    }
  | {
      readonly workspace: typeof NotificationWorkspace.ADMINISTRATIVE;
      readonly role: AdministrativeRole;
    };

/** The columns a notification is created from, already validated by the service. */
export interface CreateNotificationData {
  readonly workspace: NotificationWorkspace;
  readonly recipientType: NotificationRecipientType;
  readonly recipientUserId: string | null;
  readonly recipientRole: AdministrativeRole | null;
  readonly title: string;
  readonly message: string;
  readonly category: NotificationCategory;
  readonly type: NotificationType;
  readonly priority: NotificationPriority;
}

/**
 * Every Prisma query about notifications, and nothing else.
 *
 * The first repository in this project. The other modules put their queries
 * straight into their service, which was right for them: a departments service
 * is a handful of `findMany` calls whose `WHERE` is the query DTO, and a layer
 * between it and Prisma would have been a file that forwarded arguments. This
 * module earns one, for a specific reason.
 *
 * **The visibility filter is the reason.** "What may this person see" is one
 * predicate — a workspace plus either an account or a role, ORed with that
 * workspace's broadcasts — and it is needed by *seven* operations: both lists,
 * the single read, marking one read, marking all read, deleting one, and
 * deleting all. Written inline it would be seven copies of a condition whose
 * every clause is a way to leak somebody else's mail, and the copy that
 * eventually forgot the `workspace` term would show administrative broadcasts to
 * every employee. {@link audienceFilter} is that predicate, written once.
 *
 * The seam it creates is worth stating: **`Prisma` is not imported by the
 * service**. The service reasons in audiences, ids and DTOs; every `where`,
 * `orderBy`, `select` and `$transaction` is here. That is what the feature's
 * architecture asks for, and it also means a change of ORM would touch this file
 * and no other in the module.
 */
@Injectable()
export class NotificationRepository {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * One page of what an audience may see, narrowed by the query's filters.
   *
   * The rows and the total are read in a single `$transaction` so both see the
   * same snapshot: run separately, a notification arriving between them would
   * produce a `total` that does not describe the page just returned — and on a
   * feed that gains rows constantly, that is not a rare race.
   */
  async findPage(
    audience: NotificationAudience,
    query: NotificationQueryDto,
  ): Promise<[NotificationRow[], number]> {
    const where = this.visibleWhere(audience, query);

    return this.prisma.$transaction([
      this.prisma.notification.findMany({
        where,
        orderBy: buildOrderBy(query.sortBy, query.sortOrder),
        select: NOTIFICATION_PUBLIC_SELECT,
        ...toSkipTake(query),
      }),
      this.prisma.notification.count({ where }),
    ]);
  }

  /**
   * One notification, if one of the audiences may see it.
   *
   * Takes a *list* of audiences because a single request can span both
   * workspaces: an administrator addressing `GET /notifications/:id` may be
   * reading their own personal notification or a back-office one, and which it
   * is cannot be known before the row is read. An ordinary employee is given a
   * single-element list, so the same query answers both cases.
   *
   * `findFirst` rather than `findUnique`, because the visibility condition is
   * part of the lookup rather than a check made afterwards. That is what makes a
   * notification the caller may not see indistinguishable from one that does not
   * exist — the service turns `null` into a `404` either way.
   */
  async findVisible(
    id: string,
    audiences: readonly NotificationAudience[],
  ): Promise<NotificationRow | null> {
    return this.prisma.notification.findFirst({
      where: { id, OR: audiences.map((audience) => audienceFilter(audience)) },
      select: NOTIFICATION_PUBLIC_SELECT,
    });
  }

  /** Writes a notification the service has already found legal. */
  async create(data: CreateNotificationData): Promise<NotificationRow> {
    return this.prisma.notification.create({
      data: { ...data },
      select: NOTIFICATION_PUBLIC_SELECT,
    });
  }

  /**
   * Writes several notifications the service has already found legal, in one
   * statement, and returns them.
   *
   * Added for the Notification Delivery Engine, which fans a single announcement
   * out to one row per employee: a company of a thousand people is a thousand
   * notifications, and a thousand `create` calls would be a thousand round trips
   * to say one thing.
   *
   * `createManyAndReturn` rather than `createMany`, because the rows are needed
   * afterwards — each one is announced over its recipient's socket, and an id
   * generated by the database is what a client uses to mark it read. It is
   * PostgreSQL-only, which this project is.
   *
   * An empty list is answered without a query. Prisma would accept it, but a
   * campaign with no resolvable recipients is a normal state — everybody who was
   * named has left — rather than something to ask the database about.
   */
  async createMany(
    data: readonly CreateNotificationData[],
  ): Promise<NotificationRow[]> {
    if (data.length === 0) {
      return [];
    }

    return this.prisma.notification.createManyAndReturn({
      data: data.map((notification) => ({ ...notification })),
      select: NOTIFICATION_PUBLIC_SELECT,
    });
  }

  /**
   * How many of an audience's notifications are unread.
   *
   * The badge, answered by the same visibility predicate every other operation
   * uses — which is the whole reason it is here rather than in the engine that
   * displays it. A count written elsewhere would be the copy that forgot the
   * `workspace` term and reported the back-office backlog to every employee.
   *
   * `count` rather than a page with `limit=1` read for its `meta.total`: it
   * fetches no row, which matters because this runs on every create, every read
   * and every delete.
   */
  async countUnread(audience: NotificationAudience): Promise<number> {
    return this.prisma.notification.count({
      where: { ...audienceFilter(audience), isRead: false },
    });
  }

  /**
   * Raises the read flag on one notification, and records when.
   *
   * `isRead` and `readAt` are written in the same statement and never
   * independently, which is what keeps "read at some point but we do not know
   * when" out of the table.
   *
   * Marking an already-read notification read again is *not* an error and does
   * not move `readAt`. The operation is idempotent on purpose: a client that
   * opens a notification twice, or two tabs that open it at once, are not
   * mistakes worth a `409`, and rewriting the timestamp would replace the moment
   * somebody first read it with the moment they last clicked.
   */
  async markRead(id: string, readAt: Date): Promise<NotificationRow> {
    return this.prisma.notification.update({
      where: { id },
      data: { isRead: true, readAt },
      select: NOTIFICATION_PUBLIC_SELECT,
    });
  }

  /**
   * Raises the flag on everything an audience can see and has not read yet, and
   * reports how many rows moved.
   *
   * The `isRead: false` term is what makes the count meaningful and the
   * timestamps honest: without it, "mark all read" would rewrite `readAt` on
   * every notification the person had already read, and would report a number
   * that answered "how many can I see" rather than "how many did this change".
   */
  async markAllRead(
    audience: NotificationAudience,
    readAt: Date,
  ): Promise<number> {
    const { count } = await this.prisma.notification.updateMany({
      where: { ...audienceFilter(audience), isRead: false },
      data: { isRead: true, readAt },
    });

    return count;
  }

  /**
   * Deletes one notification, addressed by an id the service has already
   * confirmed is visible to the caller.
   */
  async deleteById(id: string): Promise<void> {
    await this.prisma.notification.delete({ where: { id } });
  }

  /** Deletes everything an audience can see, and reports how many rows went. */
  async deleteAll(audience: NotificationAudience): Promise<number> {
    const { count } = await this.prisma.notification.deleteMany({
      where: audienceFilter(audience),
    });

    return count;
  }

  /** The visibility predicate, narrowed by the list filters. */
  private visibleWhere(
    audience: NotificationAudience,
    query: NotificationQueryDto,
  ): Prisma.NotificationWhereInput {
    const filters = buildFilters(query);

    return filters.length === 0
      ? audienceFilter(audience)
      : { AND: [audienceFilter(audience), ...filters] };
  }
}

/**
 * What one audience may see — the predicate the whole module rests on.
 *
 * Each branch is a workspace plus a two-armed `OR`: what is addressed to this
 * person specifically, and what is broadcast to their whole workspace.
 *
 * - **Personal**: notifications addressed to this account by `recipientUserId`,
 *   and every `ALL_USERS` announcement.
 * - **Administrative**: notifications addressed to this role by
 *   `recipientRole`, and every `ADMINISTRATIVE_USERS` announcement.
 *
 * The `workspace` term is not redundant with the recipient types, even though
 * the legal pairings make it look that way. It is the guarantee that survives a
 * row written before a rule existed or by something other than this service: a
 * `USER` notification somehow filed as `ADMINISTRATIVE` stays out of the
 * personal list rather than leaking into it because its recipient type happened
 * to match.
 *
 * The recipient type is named explicitly on the addressed arm —
 * `recipientType: USER` alongside `recipientUserId` — rather than relying on the
 * id being null elsewhere. Same argument: the query states the shape it means
 * instead of inferring it from a column being empty.
 */
function audienceFilter(
  audience: NotificationAudience,
): Prisma.NotificationWhereInput {
  if (audience.workspace === NotificationWorkspace.PERSONAL) {
    return {
      workspace: NotificationWorkspace.PERSONAL,
      OR: [
        {
          recipientType: NotificationRecipientType.USER,
          recipientUserId: audience.userId,
        },
        { recipientType: NotificationRecipientType.ALL_USERS },
      ],
    };
  }

  return {
    workspace: NotificationWorkspace.ADMINISTRATIVE,
    OR: [
      {
        recipientType: NotificationRecipientType.ROLE,
        recipientRole: audience.role,
      },
      { recipientType: NotificationRecipientType.ADMINISTRATIVE_USERS },
    ],
  };
}

/**
 * The five list filters, as conditions to be ANDed with the visibility
 * predicate.
 *
 * Returned as an array rather than an object so the caller can combine them with
 * the audience without either having to reason about how the other's conditions
 * nest — and, more importantly, so the search's own `OR` cannot collide with the
 * audience's. Merged into one object literal, the second `OR` key would silently
 * replace the first and the endpoint would return every notification in the
 * database whose title matched.
 *
 * The parameters are independent and combine with `AND`: `?priority=HIGH`
 * narrows whatever `?search=` matched rather than replacing it.
 */
function buildFilters({
  search,
  category,
  type,
  priority,
  isRead,
}: NotificationQueryDto): Prisma.NotificationWhereInput[] {
  const filters: Prisma.NotificationWhereInput[] = [];

  if (search !== undefined && search.length > 0) {
    filters.push({
      OR: [
        { title: { contains: search, ...CASE_INSENSITIVE } },
        { message: { contains: search, ...CASE_INSENSITIVE } },
      ],
    });
  }

  if (category !== undefined) {
    filters.push({ category });
  }

  if (type !== undefined) {
    filters.push({ type });
  }

  if (priority !== undefined) {
    filters.push({ priority });
  }

  if (isRead !== undefined) {
    filters.push({ isRead });
  }

  return filters;
}

/**
 * Orders by the requested column, then by `id`.
 *
 * The tie-break on `id` is what makes pagination safe: none of the three
 * sortable values is unique — a priority is shared by most rows, and a batch of
 * notifications written by one event can share a `createdAt` to the millisecond
 * — so without it a record could repeat on one page and vanish from the next.
 *
 * The tie-break runs `desc` when the sort does, unlike the other modules' fixed
 * `asc`. Those lists default to ascending, so the two agree there anyway; here
 * the default is newest-first, and a `createdAt desc` page whose ties resolved
 * ascending would interleave a simultaneous batch backwards.
 */
function buildOrderBy(
  sortBy: NotificationSortField,
  sortOrder: SortOrder,
): Prisma.NotificationOrderByWithRelationInput[] {
  return [{ [sortBy]: sortOrder }, { id: sortOrder }];
}
