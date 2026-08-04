import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import { SortOrder } from '../../common/enums/sort-order.enum';
import { PaginatedResult } from '../../common/interfaces/pagination.interface';
import {
  buildPaginatedResult,
  toSkipTake,
} from '../../common/utils/pagination.util';
import type { Prisma } from '../../generated/prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateLeaveNotificationEmailDto } from './leave-notification-emails/dto/create-leave-notification-email.dto';
import { LeaveNotificationEmailQueryDto } from './leave-notification-emails/dto/leave-notification-email-query.dto';
import { UpdateLeaveNotificationEmailDto } from './leave-notification-emails/dto/update-leave-notification-email.dto';
import {
  LEAVE_NOTIFICATION_EMAIL_PUBLIC_SELECT,
  LeaveNotificationEmailEntity,
  toLeaveNotificationEmailEntity,
} from './leave-notification-emails/entities/leave-notification-email.entity';
import { LeaveNotificationEmailSortField } from './leave-notification-emails/leave-notification-email.constants';

/**
 * Makes PostgreSQL fold the case of both operands, so `HR@` finds `hr@`.
 * Extracted because getting it wrong on one of the comparisons below would
 * produce a search or a duplicate check that quietly behaves differently from
 * the other.
 */
const CASE_INSENSITIVE = { mode: 'insensitive' } as const;

/**
 * Every rule about leave notification addresses lives here; the controller only
 * routes.
 *
 * The list is a routing rule and nothing else: it says who should hear about
 * leave activity, and this module neither sends mail nor decides what would be
 * worth sending. Email delivery is a later feature, and it will read this list
 * rather than keep one of its own — which is why the service is exported.
 */
@Injectable()
export class LeaveNotificationEmailsService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * One page of addresses, narrowed by `search`, ordered by `sortBy`.
   *
   * The rows and the total are read in a single `$transaction` so both see the
   * same snapshot: run separately, a concurrent insert between them would
   * produce a `total` that does not describe the page just returned.
   */
  async findAll(
    query: LeaveNotificationEmailQueryDto,
  ): Promise<PaginatedResult<LeaveNotificationEmailEntity>> {
    const where = buildSearchFilter(query.search);

    const [notificationEmails, total] = await this.prisma.$transaction([
      this.prisma.leaveNotificationEmail.findMany({
        where,
        orderBy: buildOrderBy(query.sortBy, query.sortOrder),
        select: LEAVE_NOTIFICATION_EMAIL_PUBLIC_SELECT,
        ...toSkipTake(query),
      }),
      this.prisma.leaveNotificationEmail.count({ where }),
    ]);

    return buildPaginatedResult(
      notificationEmails.map(toLeaveNotificationEmailEntity),
      total,
      query,
    );
  }

  /**
   * Adds an address.
   *
   * The address is checked for a duplicate before the insert so the answer is a
   * `409` naming it, rather than the driver error a unique violation would
   * otherwise surface as a `500`.
   */
  async create(
    dto: CreateLeaveNotificationEmailDto,
  ): Promise<LeaveNotificationEmailEntity> {
    await this.assertEmailIsFree(dto.email);

    const created = await this.prisma.leaveNotificationEmail.create({
      data: { email: dto.email },
      select: LEAVE_NOTIFICATION_EMAIL_PUBLIC_SELECT,
    });

    return toLeaveNotificationEmailEntity(created);
  }

  /**
   * Corrects an address in place.
   *
   * Existence is checked before uniqueness so that patching a missing id reports
   * the missing id, rather than a conflict with whichever row happens to own the
   * submitted address. `excludeId` then keeps a request that re-sends the
   * address a row already holds from conflicting with itself — re-submitting an
   * unedited form is not an error.
   */
  async update(
    id: string,
    dto: UpdateLeaveNotificationEmailDto,
  ): Promise<LeaveNotificationEmailEntity> {
    await this.assertExists(id);

    if (dto.email !== undefined) {
      await this.assertEmailIsFree(dto.email, id);
    }

    const updated = await this.prisma.leaveNotificationEmail.update({
      where: { id },
      // `undefined` is omitted from the UPDATE by Prisma, so a body that
      // mentions nothing leaves the row exactly as it was.
      data: { email: dto.email },
      select: LEAVE_NOTIFICATION_EMAIL_PUBLIC_SELECT,
    });

    return toLeaveNotificationEmailEntity(updated);
  }

  /**
   * Removes one address.
   *
   * A hard delete: an address on this list is a routing rule, not a record of
   * anything that happened, so nothing refers back to it and removing it
   * rewrites no history. Existence is checked first so an unknown id is a `404`
   * rather than Prisma's `P2025`.
   */
  async remove(id: string): Promise<void> {
    await this.assertExists(id);

    await this.prisma.leaveNotificationEmail.delete({ where: { id } });
  }

  /** Confirms the row is there, or reports it missing. */
  private async assertExists(id: string): Promise<void> {
    const notificationEmail =
      await this.prisma.leaveNotificationEmail.findUnique({
        where: { id },
        select: { id: true },
      });

    if (notificationEmail === null) {
      throw new NotFoundException(
        `Leave notification email ${id} was not found`,
      );
    }
  }

  /**
   * Rejects an address already on the list.
   *
   * The comparison is case-insensitive because `HR@company.com` and
   * `hr@company.com` are one mailbox to every mail server, while PostgreSQL's
   * unique index sees two rows. That index still backs this check for the
   * exact-case race between the read and the write — and the DTO lower-cases
   * before either, so in practice the gap is closed.
   *
   * `excludeId` is the row being patched, which must not conflict with itself.
   */
  private async assertEmailIsFree(
    email: string,
    excludeId?: string,
  ): Promise<void> {
    const conflict = await this.prisma.leaveNotificationEmail.findFirst({
      where: {
        email: { equals: email, ...CASE_INSENSITIVE },
        ...(excludeId === undefined ? {} : { NOT: { id: excludeId } }),
      },
      select: { id: true },
    });

    if (conflict !== null) {
      throw new ConflictException(
        `The leave notification email "${email}" has already been added`,
      );
    }
  }
}

/**
 * Builds the `WHERE` for `?search=`.
 *
 * Returns `undefined` — not an empty object — when there is nothing to search
 * for, because `undefined` is what `findMany` and `count` both read as "no
 * filter", and the two must agree or the total would not describe the page.
 */
function buildSearchFilter(
  search?: string,
): Prisma.LeaveNotificationEmailWhereInput | undefined {
  if (search === undefined || search.length === 0) {
    return undefined;
  }

  return { email: { contains: search, ...CASE_INSENSITIVE } };
}

/**
 * Orders by the requested column, then by `id`.
 *
 * The tie-break is what makes pagination safe: `createdAt` is not unique — two
 * addresses added by the same import share it — so without it a record could
 * repeat on one page and vanish from the next.
 */
function buildOrderBy(
  sortBy: LeaveNotificationEmailSortField,
  sortOrder: SortOrder,
): Prisma.LeaveNotificationEmailOrderByWithRelationInput[] {
  return [{ [sortBy]: sortOrder }, { id: SortOrder.ASC }];
}
