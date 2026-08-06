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
import { CreateReminderDto } from './dto/create-reminder.dto';
import { ReminderQueryDto } from './dto/reminder-query.dto';
import { UpdateReminderDto } from './dto/update-reminder.dto';
import {
  REMINDER_PUBLIC_SELECT,
  ReminderEntity,
  ReminderRow,
  toReminderEntity,
} from './entities/reminder.entity';
import { ReminderSortField } from './notification-management.constants';
import { assertDeliveryMethodChosen } from './notification-management.rules';

/**
 * Makes PostgreSQL fold the case of both operands, so `timesheet` finds
 * `Timesheet`. Extracted because getting it wrong on one of the comparisons
 * below would produce a search or a duplicate check that quietly behaves
 * differently from the others.
 */
const CASE_INSENSITIVE = { mode: 'insensitive' } as const;

/**
 * Every rule about reminder rules lives here; the controller only routes.
 *
 * Two things are worth naming, because they are what makes this something other
 * than another copy of the same CRUD shape:
 *
 * 1. **A reminder is a rule, not a message.** Nothing here schedules anything,
 *    sends anything or writes a notification. The Notification Delivery Engine
 *    reads these rows, works out which deadlines are `daysBeforeDeadline` away
 *    and produces the messages; this service records what the company wants.
 *    Changing "7 days" to "5 days" is therefore an ordinary `UPDATE` rather than
 *    a rescheduling, which is the whole benefit of keeping the two apart.
 * 2. **`enabled` is a column, not a delete.** Switching a rule off keeps its
 *    wording, its offset and its name instead of making somebody retype them
 *    next quarter — the same call `LeaveType.isActive` makes.
 *
 * There is no repository. The notification centre has one because "what may this
 * person see" is a single predicate that seven of its operations need, and every
 * inline copy of it would be a way to leak somebody else's mail; here the
 * queries share nothing but a table name, so a repository would be a file that
 * forwarded arguments — which Feature 006 was explicit about not writing.
 */
@Injectable()
export class ReminderService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * One page of reminders, narrowed by `search` and the three filters, ordered
   * by `sortBy`.
   *
   * The rows and the total are read in a single `$transaction` so both see the
   * same snapshot: run separately, a concurrent insert between them would
   * produce a `total` that does not describe the page just returned.
   */
  async findAll(
    query: ReminderQueryDto,
  ): Promise<PaginatedResult<ReminderEntity>> {
    const where = buildWhere(query);

    const [reminders, total] = await this.prisma.$transaction([
      this.prisma.reminder.findMany({
        where,
        orderBy: buildOrderBy(query.sortBy, query.sortOrder),
        select: REMINDER_PUBLIC_SELECT,
        ...toSkipTake(query),
      }),
      this.prisma.reminder.count({ where }),
    ]);

    return buildPaginatedResult(reminders.map(toReminderEntity), total, query);
  }

  async findOne(id: string): Promise<ReminderEntity> {
    return toReminderEntity(await this.findOrThrow(id));
  }

  /**
   * Creates a reminder rule.
   *
   * The delivery check runs against the submitted pair, which on a create is the
   * whole truth: both fields carry defaults, so a body that mentions neither is
   * `sendNotification: true` and passes.
   */
  async create(dto: CreateReminderDto): Promise<ReminderEntity> {
    assertDeliveryMethodChosen(dto.sendEmail, dto.sendNotification);
    await this.assertNameIsFree(dto.name);

    const created = await this.prisma.reminder.create({
      data: {
        name: dto.name,
        description: dto.description,
        enabled: dto.enabled,
        daysBeforeDeadline: dto.daysBeforeDeadline,
        subject: dto.subject,
        message: dto.message,
        severity: dto.severity,
        priority: dto.priority,
        sendEmail: dto.sendEmail,
        sendNotification: dto.sendNotification,
      },
      select: REMINDER_PUBLIC_SELECT,
    });

    return toReminderEntity(created);
  }

  /**
   * Applies a partial update, **disabling included**: `{ "enabled": false }` is
   * how a reminder is switched off, and there is no separate endpoint for it —
   * `enabled` is a property of the rule rather than an event in its life.
   *
   * Existence is checked before uniqueness so that patching a missing id reports
   * the missing id, rather than a conflict with whichever reminder happens to
   * own the submitted name.
   *
   * The delivery check is made against the **merged** pair rather than the
   * submitted one. `{ "sendEmail": false }` is a perfectly good body on a
   * reminder that still sends notifications and a fatal one on a reminder that
   * does not, and neither field is wrong on its own — which is exactly why the
   * rule cannot live on the DTO.
   */
  async update(id: string, dto: UpdateReminderDto): Promise<ReminderEntity> {
    const current = await this.findOrThrow(id);

    assertDeliveryMethodChosen(
      dto.sendEmail ?? current.sendEmail,
      dto.sendNotification ?? current.sendNotification,
    );

    if (dto.name !== undefined) {
      await this.assertNameIsFree(dto.name, id);
    }

    const updated = await this.prisma.reminder.update({
      where: { id },
      // `undefined` is omitted from the UPDATE by Prisma, so an absent field is
      // left alone while an explicit `null` clears the nullable `description`.
      data: {
        name: dto.name,
        description: dto.description,
        enabled: dto.enabled,
        daysBeforeDeadline: dto.daysBeforeDeadline,
        subject: dto.subject,
        message: dto.message,
        severity: dto.severity,
        priority: dto.priority,
        sendEmail: dto.sendEmail,
        sendNotification: dto.sendNotification,
      },
      select: REMINDER_PUBLIC_SELECT,
    });

    return toReminderEntity(updated);
  }

  /**
   * Hard-deletes a reminder rule.
   *
   * Unconditional, and it can afford to be: nothing points at a reminder. It
   * produces no rows, owns no history and is referenced by no foreign key, so
   * removing one leaves nothing dangling — unlike a leave type, which is
   * `409`-guarded because balances and requests record what it meant.
   *
   * Whatever the delivery engine has already sent from this rule is a
   * `Notification`, and notifications carry their own text: deleting the rule
   * they came from does not unsay them, and the guard this method does not need
   * is the reason. Disabling is still the better answer for a rule somebody may
   * want back — see {@link update}.
   */
  async remove(id: string): Promise<void> {
    await this.findOrThrow(id);

    await this.prisma.reminder.delete({ where: { id } });
  }

  /**
   * Every rule that is switched on, in the order they fire.
   *
   * The Notification Delivery Engine's read, and the method Feature 027 said
   * would be written by the caller that needed it rather than in advance. It
   * belongs here rather than in the engine because this module owns `reminders`:
   * the engine asks "which rules are live", not "what does this table look like".
   *
   * `enabled: false` is filtered in the query rather than by the caller, because
   * a paused rule is not a rule the engine should reason about at all — a filter
   * applied later is the one that eventually gets forgotten and fires a reminder
   * somebody switched off last quarter.
   *
   * Ordered by `daysBeforeDeadline` descending, which is the order the rules
   * actually fire in — a week out before three days out before the day itself —
   * so a log of a run reads as the escalation it is.
   */
  async findEnabled(): Promise<ReminderRow[]> {
    return this.prisma.reminder.findMany({
      where: { enabled: true },
      orderBy: [{ daysBeforeDeadline: SortOrder.DESC }, { id: SortOrder.ASC }],
      select: REMINDER_PUBLIC_SELECT,
    });
  }

  /** Loads a reminder by id or reports it missing. */
  private async findOrThrow(id: string): Promise<ReminderRow> {
    const reminder = await this.prisma.reminder.findUnique({
      where: { id },
      select: REMINDER_PUBLIC_SELECT,
    });

    if (reminder === null) {
      throw new NotFoundException(notFoundMessage(id));
    }

    return reminder;
  }

  /**
   * Rejects a name already taken by another reminder.
   *
   * The comparison is case-insensitive because `Timesheet due` and `timesheet
   * due` are the same rule to a human, while PostgreSQL's unique index sees two
   * rows. That index still backs this check for the exact-case race between the
   * read and the write; closing the case-variant race as well would need a
   * `citext` column or a functional index, which is a schema change and out of
   * scope here — the same position `LeaveTypesService` records for its `label`.
   *
   * `excludeId` is the reminder being updated, which must not conflict with
   * itself.
   */
  private async assertNameIsFree(
    name: string,
    excludeId?: string,
  ): Promise<void> {
    const conflict = await this.prisma.reminder.findFirst({
      where: {
        name: { equals: name, ...CASE_INSENSITIVE },
        ...(excludeId === undefined ? {} : { NOT: { id: excludeId } }),
      },
      select: { id: true },
    });

    if (conflict !== null) {
      throw new ConflictException(`A reminder named "${name}" already exists`);
    }
  }
}

/** Message used for every 404 path, so they cannot drift apart. */
function notFoundMessage(id: string): string {
  return `Reminder ${id} was not found`;
}

/**
 * Builds the `WHERE` for the list endpoint.
 *
 * The parameters are independent and combine with `AND`: `?enabled=true`
 * narrows whatever `?search=` matched rather than replacing it. Returns
 * `undefined` — not an empty object — when nothing was requested, because
 * `undefined` is what `findMany` and `count` both read as "no filter", and the
 * two must agree or the total would not describe the page.
 */
function buildWhere({
  search,
  enabled,
  severity,
  priority,
}: ReminderQueryDto): Prisma.ReminderWhereInput | undefined {
  const filters: Prisma.ReminderWhereInput[] = [];

  if (search !== undefined && search.length > 0) {
    filters.push({
      OR: [
        { name: { contains: search, ...CASE_INSENSITIVE } },
        { subject: { contains: search, ...CASE_INSENSITIVE } },
      ],
    });
  }

  if (enabled !== undefined) {
    filters.push({ enabled });
  }

  if (severity !== undefined) {
    filters.push({ severity });
  }

  if (priority !== undefined) {
    filters.push({ priority });
  }

  return filters.length === 0 ? undefined : { AND: filters };
}

/**
 * Orders by the requested column, then by `id`.
 *
 * The tie-break is what makes pagination safe: none of the three sortable values
 * is unique — a priority is shared by most rows, and two reminders configured in
 * one sitting can share a `createdAt` to the millisecond — so without it a
 * record could repeat on one page and vanish from the next.
 */
function buildOrderBy(
  sortBy: ReminderSortField,
  sortOrder: SortOrder,
): Prisma.ReminderOrderByWithRelationInput[] {
  return [{ [sortBy]: sortOrder }, { id: SortOrder.ASC }];
}
