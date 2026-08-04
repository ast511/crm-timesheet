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
import { CreateLeaveTypeDto } from './leave-types/dto/create-leave-type.dto';
import { LeaveTypeQueryDto } from './leave-types/dto/leave-type-query.dto';
import { UpdateLeaveTypeDto } from './leave-types/dto/update-leave-type.dto';
import {
  LEAVE_TYPE_PUBLIC_SELECT,
  LeaveTypeEntity,
  LeaveTypeRow,
  toLeaveTypeEntity,
} from './leave-types/entities/leave-type.entity';
import { LeaveTypeSortField } from './leave-types/leave-type.constants';

/**
 * Makes PostgreSQL fold the case of both operands, so `annual` finds `ANNUAL`.
 * Extracted because getting it wrong on one of the comparisons below would
 * produce a search or a duplicate check that quietly behaves differently from
 * the others.
 */
const CASE_INSENSITIVE = { mode: 'insensitive' } as const;

/** The unique fields a leave type can collide on. */
type UniqueLeaveTypeFields = Pick<UpdateLeaveTypeDto, 'code' | 'label'>;

/**
 * Every rule about leave types lives here; the controller only routes.
 *
 * Two of them are worth naming, because they are what makes this module
 * something other than another copy of the same CRUD shape:
 *
 * 1. **A leave type is a definition, not an entitlement.**
 *    `defaultAllocatedDays` is a number a future form will be pre-filled with,
 *    and nothing in this service writes it anywhere else. Changing it therefore
 *    cannot alter what an employee has already been granted — the days somebody
 *    actually holds are a balance, owned by a later feature, and keeping the two
 *    apart is what lets the suggestion be revised without rewriting history.
 * 2. **Nothing here computes anything.** No day is counted, no balance is
 *    derived, no request is judged. This module configures; Leave Requests and
 *    Leave Balances will read the configuration and act on it. It is the same
 *    division `WorkScheduleService` and `PublicHolidayService` keep.
 */
@Injectable()
export class LeaveTypesService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * One page of leave types, narrowed by `search` and the three filters, ordered
   * by `sortBy`.
   *
   * The rows and the total are read in a single `$transaction` so both see the
   * same snapshot: run separately, a concurrent insert between them would
   * produce a `total` that does not describe the page just returned.
   */
  async findAll(
    query: LeaveTypeQueryDto,
  ): Promise<PaginatedResult<LeaveTypeEntity>> {
    const where = buildWhere(query);

    const [leaveTypes, total] = await this.prisma.$transaction([
      this.prisma.leaveType.findMany({
        where,
        orderBy: buildOrderBy(query.sortBy, query.sortOrder),
        select: LEAVE_TYPE_PUBLIC_SELECT,
        ...toSkipTake(query),
      }),
      this.prisma.leaveType.count({ where }),
    ]);

    return buildPaginatedResult(
      leaveTypes.map(toLeaveTypeEntity),
      total,
      query,
    );
  }

  async findOne(id: string): Promise<LeaveTypeEntity> {
    return toLeaveTypeEntity(await this.findOrThrow(id));
  }

  async create(dto: CreateLeaveTypeDto): Promise<LeaveTypeEntity> {
    await this.assertCodeAndLabelAreFree(dto);

    const created = await this.prisma.leaveType.create({
      data: {
        code: dto.code,
        label: dto.label,
        icon: dto.icon,
        color: dto.color,
        description: dto.description,
        defaultAllocatedDays: dto.defaultAllocatedDays,
        requiresApproval: dto.requiresApproval,
        isPaid: dto.isPaid,
        isActive: dto.isActive,
      },
      select: LEAVE_TYPE_PUBLIC_SELECT,
    });

    return toLeaveTypeEntity(created);
  }

  /**
   * Applies a partial update.
   *
   * Existence is checked before uniqueness so that patching a missing id reports
   * the missing id, rather than a conflict with whichever leave type happens to
   * own the submitted code.
   */
  async update(id: string, dto: UpdateLeaveTypeDto): Promise<LeaveTypeEntity> {
    await this.findOrThrow(id);
    await this.assertCodeAndLabelAreFree(dto, id);

    const updated = await this.prisma.leaveType.update({
      where: { id },
      // `undefined` is omitted from the UPDATE by Prisma, so an absent field is
      // left alone while an explicit `null` clears one of the three nullable
      // columns.
      data: {
        code: dto.code,
        label: dto.label,
        icon: dto.icon,
        color: dto.color,
        description: dto.description,
        defaultAllocatedDays: dto.defaultAllocatedDays,
        requiresApproval: dto.requiresApproval,
        isPaid: dto.isPaid,
        isActive: dto.isActive,
      },
      select: LEAVE_TYPE_PUBLIC_SELECT,
    });

    return toLeaveTypeEntity(updated);
  }

  /**
   * Hard-deletes a leave type nothing depends on.
   *
   * Feature 021 wrote this method without a guard and said one belonged to
   * "the feature that creates the relation, where it can count the rows it
   * introduced". Feature 022 is that feature: `EmployeeLeaveBalance` points here,
   * so balances are counted now, exactly the way `DepartmentService.remove`
   * counts employees.
   *
   * A balance records what somebody was granted of *this* kind of leave and a
   * request records an absence taken against it; deleting the type would leave
   * both belonging to nothing. Feature 023 added the second relation, and it is
   * counted here for the same reason and in the same breath.
   *
   * The `409` asks the caller to remove whatever is in the way first, or — far
   * more likely what they meant — to set `isActive: false`, which retires the
   * type without touching anything recorded against it. Since Feature 023 that
   * flag actually stops new requests, so retiring is now a complete answer
   * rather than a half one. `DELETE` remains for a row entered by mistake.
   *
   * Both counts are part of the existence query, so the common case is one round
   * trip and a `404` and a `409` cannot be decided from two different snapshots.
   * The `ON DELETE RESTRICT` on each foreign key backs the same rule from the
   * database's side: without this check the delete would still fail, but as a
   * driver error surfacing as a `500` rather than a message naming the problem.
   */
  async remove(id: string): Promise<void> {
    const leaveType = await this.prisma.leaveType.findUnique({
      where: { id },
      select: { _count: { select: { balances: true, requests: true } } },
    });

    if (leaveType === null) {
      throw new NotFoundException(notFoundMessage(id));
    }

    const { balances, requests } = leaveType._count;

    if (balances > 0) {
      throw new ConflictException(
        `Leave type ${id} cannot be deleted while ${balances} employee leave balance(s) reference it. Set isActive to false to retire it instead`,
      );
    }

    if (requests > 0) {
      throw new ConflictException(
        `Leave type ${id} cannot be deleted while ${requests} leave request(s) reference it. Set isActive to false to retire it instead`,
      );
    }

    await this.prisma.leaveType.delete({ where: { id } });
  }

  /**
   * Whether a leave type with this id exists.
   *
   * Public because the employee-leave-balances module has to confirm a type
   * before recording a grant against it, and this module owns the `leave_types`
   * table — the same hand-off `DepartmentService`, `PositionService` and
   * `ProjectService` each make with their own `exists`. It returns a boolean
   * rather than throwing, because the caller knows what a missing type means in
   * its own request — a `400` naming a body field — while here it could only
   * guess.
   *
   * `id` alone is selected: the caller needs a yes or a no, not a row.
   */
  async exists(id: string): Promise<boolean> {
    const leaveType = await this.prisma.leaveType.findUnique({
      where: { id },
      select: { id: true },
    });

    return leaveType !== null;
  }

  /**
   * The two facts a leave request has to know about a type before it can be
   * filed against it, or `null` when there is no such type.
   *
   * Public for the reason {@link exists} is, and it does not replace it: the
   * balances module asks only whether a type is there, while Feature 023 asks
   * two further things and would otherwise need a second round trip or — worse —
   * a query into `leave_types` from another module.
   *
   * - `requiresApproval` decides the whole shape of the write. `false` means the
   *   request is created `APPROVED` and the days come out of the balance
   *   immediately; `true` means it is created `PENDING` and nothing is deducted
   *   until somebody decides. This is the column Feature 021 added and said
   *   nothing here would act on — and nothing here does. The branch is the
   *   caller's; this only reports the fact.
   * - `isActive` is what makes retiring a type actually stop new requests. A
   *   retired type keeps answering for the leave already recorded against it,
   *   which is why it is a flag rather than a delete, and refusing new requests
   *   is the other half of that.
   *
   * `null` for a missing type rather than a thrown `404`: the caller knows what
   * an absent type means in its own request — a `400` naming a body field — while
   * here it could only guess.
   */
  async findPolicy(
    id: string,
  ): Promise<{ requiresApproval: boolean; isActive: boolean } | null> {
    return this.prisma.leaveType.findUnique({
      where: { id },
      select: { requiresApproval: true, isActive: true },
    });
  }

  /** Loads a leave type by id or reports it missing. */
  private async findOrThrow(id: string): Promise<LeaveTypeRow> {
    const leaveType = await this.prisma.leaveType.findUnique({
      where: { id },
      select: LEAVE_TYPE_PUBLIC_SELECT,
    });

    if (leaveType === null) {
      throw new NotFoundException(notFoundMessage(id));
    }

    return leaveType;
  }

  /**
   * Rejects a code or a label already taken by another leave type.
   *
   * Both fields are checked in one query, and both conflicts are reported at
   * once — as an array, the same shape the `ValidationPipe` produces — so a form
   * can mark each offending input instead of discovering the second problem only
   * after fixing the first.
   *
   * The comparison is case-insensitive because `Annual Leave` and `annual leave`
   * are the same leave type to a human, while PostgreSQL's unique index sees two
   * rows. That index still backs this check for the exact-case race between the
   * read and the write — and the DTO folds `code` to upper case before either,
   * so for codes the gap is closed; a case-variant race on `label` would need a
   * citext column or a functional index, which is a schema change and out of
   * scope here.
   *
   * `excludeId` is the leave type being updated, which must not conflict with
   * itself.
   */
  private async assertCodeAndLabelAreFree(
    { code, label }: UniqueLeaveTypeFields,
    excludeId?: string,
  ): Promise<void> {
    const candidates: Prisma.LeaveTypeWhereInput[] = [];

    if (code !== undefined) {
      candidates.push({ code: { equals: code, ...CASE_INSENSITIVE } });
    }

    if (label !== undefined) {
      candidates.push({ label: { equals: label, ...CASE_INSENSITIVE } });
    }

    // A patch touching neither field has nothing to collide with.
    if (candidates.length === 0) {
      return;
    }

    const conflicts = await this.prisma.leaveType.findMany({
      where: {
        OR: candidates,
        ...(excludeId === undefined ? {} : { NOT: { id: excludeId } }),
      },
      select: { code: true, label: true },
    });

    if (conflicts.length === 0) {
      return;
    }

    throw new ConflictException(describeConflicts(conflicts, { code, label }));
  }
}

/** Message used for every 404 path, so they cannot drift apart. */
function notFoundMessage(id: string): string {
  return `Leave type ${id} was not found`;
}

/**
 * Builds the `WHERE` for the list endpoint.
 *
 * The parameters are independent and combine with `AND`: `?isPaid=false`
 * narrows whatever `?search=` matched rather than replacing it. Returns
 * `undefined` — not an empty object — when nothing was requested, because
 * `undefined` is what `findMany` and `count` both read as "no filter", and the
 * two must agree or the total would not describe the page.
 */
function buildWhere({
  search,
  isActive,
  requiresApproval,
  isPaid,
}: LeaveTypeQueryDto): Prisma.LeaveTypeWhereInput | undefined {
  const filters: Prisma.LeaveTypeWhereInput[] = [];

  if (search !== undefined && search.length > 0) {
    filters.push({
      OR: [
        { code: { contains: search, ...CASE_INSENSITIVE } },
        { label: { contains: search, ...CASE_INSENSITIVE } },
      ],
    });
  }

  if (isActive !== undefined) {
    filters.push({ isActive });
  }

  if (requiresApproval !== undefined) {
    filters.push({ requiresApproval });
  }

  if (isPaid !== undefined) {
    filters.push({ isPaid });
  }

  return filters.length === 0 ? undefined : { AND: filters };
}

/**
 * Orders by the requested column, then by `id`.
 *
 * The tie-break is what makes pagination safe: `createdAt` is not unique and
 * `defaultAllocatedDays` is neither unique nor even always present, so two rows
 * sharing a value could otherwise be returned in a different relative order on
 * each query, letting a record repeat on one page and vanish from the next.
 */
function buildOrderBy(
  sortBy: LeaveTypeSortField,
  sortOrder: SortOrder,
): Prisma.LeaveTypeOrderByWithRelationInput[] {
  return [{ [sortBy]: sortOrder }, { id: SortOrder.ASC }];
}

/** Names which of the submitted fields are already taken. */
function describeConflicts(
  conflicts: readonly UniqueLeaveTypeFields[],
  { code, label }: UniqueLeaveTypeFields,
): string[] {
  const messages: string[] = [];

  if (
    code !== undefined &&
    conflicts.some((it) => equalsIgnoringCase(it.code, code))
  ) {
    messages.push(`A leave type with code "${code}" already exists`);
  }

  if (
    label !== undefined &&
    conflicts.some((it) => equalsIgnoringCase(it.label, label))
  ) {
    messages.push(`A leave type with label "${label}" already exists`);
  }

  // Reached only if PostgreSQL and JavaScript disagree about case folding for
  // some character; the row is a genuine conflict either way, so it is reported
  // rather than swallowed into a 500.
  return messages.length > 0
    ? messages
    : ['A leave type with this code or label already exists'];
}

function equalsIgnoringCase(left: string | undefined, right: string): boolean {
  return left?.toLowerCase() === right.toLowerCase();
}
