import {
  BadRequestException,
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
import { EmployeeService } from '../employees/employee.service';
import { LeaveTypesService } from '../leave-configuration/leave-types.service';
import { CreateEmployeeLeaveBalanceDto } from './dto/create-employee-leave-balance.dto';
import { EmployeeLeaveBalanceQueryDto } from './dto/employee-leave-balance-query.dto';
import { UpdateEmployeeLeaveBalanceDto } from './dto/update-employee-leave-balance.dto';
import { LeaveBalanceSortField } from './employee-leave-balance.constants';
import {
  EmployeeLeaveBalanceEntity,
  LEAVE_BALANCE_PUBLIC_SELECT,
  toLeaveBalanceEntity,
} from './entities/employee-leave-balance.entity';

/**
 * Makes PostgreSQL fold the case of both operands, so `pop` finds `Popescu`.
 * Extracted because getting it wrong on one of the comparisons below would
 * produce a search that quietly behaves differently from the others.
 */
const CASE_INSENSITIVE = { mode: 'insensitive' } as const;

/** The triple that identifies a balance, and that may collide. */
interface BalanceKey {
  readonly employeeId: string;
  readonly leaveTypeId: string;
  readonly year: number;
}

/**
 * Every rule about leave balances lives here; the controller only routes.
 *
 * Three of them are what make this more than another CRUD shape:
 *
 * 1. **`remainingDays` is never stored.** It is
 *    `allocatedDays + carriedOverDays - usedDays`, computed by
 *    `computeRemainingDays` on the way out of every endpoint. The three columns
 *    are the single source of truth; nothing in this service writes a fourth
 *    number, and no DTO accepts one.
 * 2. **A balance is identified by a triple**, not by a set of editable fields:
 *    one employee, one leave type, one year. That is a unique constraint in the
 *    schema and a `409` here, and it is why `PATCH` cannot move a balance
 *    between employees, types or years — see `UpdateEmployeeLeaveBalanceDto`.
 * 3. **Nothing is granted automatically.** There is no code path that creates a
 *    balance except `POST`, and creating an employee does not reach this module
 *    at all. Leave is negotiated, and a number the system invented would be
 *    indistinguishable from one somebody agreed to.
 *
 * The two referenced tables are read through the services that own them —
 * `EmployeeService` and `LeaveTypesService` — which is the hand-off every module
 * since Feature 007 has written. Only the balance query itself reaches those
 * tables directly, through the `select` in {@link LEAVE_BALANCE_PUBLIC_SELECT},
 * because composing a joined read out of separate service calls would be one
 * round trip per balance per relation.
 */
@Injectable()
export class EmployeeLeaveBalancesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly employees: EmployeeService,
    private readonly leaveTypes: LeaveTypesService,
  ) {}

  /**
   * One page of balances, narrowed by `search` and the three filters, ordered by
   * `sortBy`.
   *
   * The rows and the total are read in a single `$transaction` so both see the
   * same snapshot: run separately, a concurrent insert between them would
   * produce a `total` that does not describe the page just returned.
   */
  async findAll(
    query: EmployeeLeaveBalanceQueryDto,
  ): Promise<PaginatedResult<EmployeeLeaveBalanceEntity>> {
    const where = buildWhere(query);

    const [balances, total] = await this.prisma.$transaction([
      this.prisma.employeeLeaveBalance.findMany({
        where,
        orderBy: buildOrderBy(query.sortBy, query.sortOrder),
        select: LEAVE_BALANCE_PUBLIC_SELECT,
        ...toSkipTake(query),
      }),
      this.prisma.employeeLeaveBalance.count({ where }),
    ]);

    return buildPaginatedResult(
      balances.map(toLeaveBalanceEntity),
      total,
      query,
    );
  }

  async findOne(id: string): Promise<EmployeeLeaveBalanceEntity> {
    const balance = await this.prisma.employeeLeaveBalance.findUnique({
      where: { id },
      select: LEAVE_BALANCE_PUBLIC_SELECT,
    });

    if (balance === null) {
      throw new NotFoundException(notFoundMessage(id));
    }

    return toLeaveBalanceEntity(balance);
  }

  /**
   * Allocates leave, once both referenced rows are known to be there and the
   * triple is free.
   *
   * The relations are checked before the duplicate, so the escalation is
   * ordered: a body pointing at rows that do not exist is a `400`, and only a
   * body that is otherwise sound can go on to conflict with an existing balance.
   */
  async create(
    dto: CreateEmployeeLeaveBalanceDto,
  ): Promise<EmployeeLeaveBalanceEntity> {
    await this.assertRelationsExist(dto);
    await this.assertBalanceIsFree(dto);

    const created = await this.prisma.employeeLeaveBalance.create({
      data: {
        employeeId: dto.employeeId,
        leaveTypeId: dto.leaveTypeId,
        year: dto.year,
        allocatedDays: dto.allocatedDays,
        carriedOverDays: dto.carriedOverDays,
        usedDays: dto.usedDays,
        notes: dto.notes,
      },
      select: LEAVE_BALANCE_PUBLIC_SELECT,
    });

    return toLeaveBalanceEntity(created);
  }

  /**
   * Applies a partial update to the numbers.
   *
   * No relation check and no duplicate check, and neither is an omission: the
   * DTO cannot carry `employeeId`, `leaveTypeId` or `year`, so the triple this
   * balance is filed under cannot move and cannot collide with another row.
   * What is left to validate is the shape of three integers, which the DTO has
   * already done.
   *
   * Existence is checked first so patching a missing id reports the missing id
   * rather than Prisma's `P2025` surfacing as a `500`.
   */
  async update(
    id: string,
    dto: UpdateEmployeeLeaveBalanceDto,
  ): Promise<EmployeeLeaveBalanceEntity> {
    await this.assertExists(id);

    const updated = await this.prisma.employeeLeaveBalance.update({
      where: { id },
      // `undefined` is omitted from the UPDATE by Prisma, so an absent field is
      // left alone while an explicit `null` clears the nullable `notes`.
      data: {
        allocatedDays: dto.allocatedDays,
        carriedOverDays: dto.carriedOverDays,
        usedDays: dto.usedDays,
        notes: dto.notes,
      },
      select: LEAVE_BALANCE_PUBLIC_SELECT,
    });

    return toLeaveBalanceEntity(updated);
  }

  /**
   * Hard-deletes a balance.
   *
   * Nothing refers to a balance yet, so there is no count to guard the delete
   * with. Existence is checked first so an unknown id is a `404` naming it
   * rather than Prisma's `P2025` surfacing as a `500`.
   *
   * **This changes when leave requests arrive.** A request approved against this
   * balance is the reason `usedDays` is what it is, and deleting the balance
   * would leave those days unexplained. The guard belongs to the feature that
   * creates the relation, where it can count the rows it introduced — the same
   * note Feature 021 left on leave types, which this feature has now honoured.
   */
  async remove(id: string): Promise<void> {
    await this.assertExists(id);

    await this.prisma.employeeLeaveBalance.delete({ where: { id } });
  }

  /** Confirms the balance is there, or reports it missing. */
  private async assertExists(id: string): Promise<void> {
    const balance = await this.prisma.employeeLeaveBalance.findUnique({
      where: { id },
      select: { id: true },
    });

    if (balance === null) {
      throw new NotFoundException(notFoundMessage(id));
    }
  }

  /**
   * Rejects a body that points at an employee or a leave type which does not
   * exist.
   *
   * The two lookups run concurrently, and both missing references are reported
   * at once — as an array, the same shape the `ValidationPipe` produces — so a
   * form can mark each offending input instead of discovering the second problem
   * only after fixing the first. A missing reference is a `400` rather than a
   * `404`: the balance being created is fine, it is the submitted body that
   * names something that is not there.
   *
   * The employee is confirmed through `findStatus`, which is the question that
   * module exposes; the status it returns is deliberately ignored. **Allocating
   * leave to a terminated employee is allowed**, because a balance is a record
   * of what a year held and somebody who left in July still had days in that
   * year — refusing would make the leaver's own year unrecordable, which is the
   * opposite of what a ledger is for.
   */
  private async assertRelationsExist({
    employeeId,
    leaveTypeId,
  }: BalanceKey): Promise<void> {
    const [employeeStatus, leaveTypeExists] = await Promise.all([
      this.employees.findStatus(employeeId),
      this.leaveTypes.exists(leaveTypeId),
    ]);

    const missing: string[] = [];

    if (employeeStatus === null) {
      missing.push(`Employee ${employeeId} does not exist`);
    }

    if (!leaveTypeExists) {
      missing.push(`Leave type ${leaveTypeId} does not exist`);
    }

    if (missing.length > 0) {
      throw new BadRequestException(missing);
    }
  }

  /**
   * Rejects a second balance for the same employee, leave type and year.
   *
   * The rule the feature is built on: Ion Popescu holds exactly one Annual Leave
   * balance for 2026. Two would each be a partial truth, and no reader could say
   * which one the year's entitlement was — or whether it was their sum.
   *
   * The lookup is a `findUnique` on the compound key rather than a `findFirst`
   * with three conditions, so it reads the unique index directly and cannot
   * drift from the constraint it is checking. That index is also what closes the
   * race between this read and the insert; this query exists to turn the driver
   * error into a `409` naming all three values.
   */
  private async assertBalanceIsFree({
    employeeId,
    leaveTypeId,
    year,
  }: BalanceKey): Promise<void> {
    const conflict = await this.prisma.employeeLeaveBalance.findUnique({
      where: {
        employeeId_leaveTypeId_year: { employeeId, leaveTypeId, year },
      },
      select: { id: true },
    });

    if (conflict !== null) {
      throw new ConflictException(
        `Employee ${employeeId} already has a ${year} balance for leave type ${leaveTypeId}`,
      );
    }
  }
}

/** Message used for every 404 path, so they cannot drift apart. */
function notFoundMessage(id: string): string {
  return `Employee leave balance ${id} was not found`;
}

/**
 * Builds the `WHERE` for the list endpoint.
 *
 * The parameters are independent and combine with `AND`: `?year=2026` narrows
 * whatever `?search=` matched rather than replacing it. Returns `undefined` —
 * not an empty object — when nothing was requested, because `undefined` is what
 * `findMany` and `count` both read as "no filter", and the two must agree or the
 * total would not describe the page.
 *
 * `search` and `departmentId` both reach through the `employee` relation, since
 * neither the person's name nor their department is a column of this table.
 * Prisma renders each as a correlated condition on the joined row; they are
 * written as two separate `employee` filters rather than one merged object so
 * that adding a third never has to reason about how the others nest.
 */
function buildWhere({
  search,
  year,
  leaveTypeId,
  departmentId,
}: EmployeeLeaveBalanceQueryDto):
  Prisma.EmployeeLeaveBalanceWhereInput | undefined {
  const filters: Prisma.EmployeeLeaveBalanceWhereInput[] = [];

  if (search !== undefined && search.length > 0) {
    filters.push({
      employee: {
        OR: [
          { employeeCode: { contains: search, ...CASE_INSENSITIVE } },
          { firstName: { contains: search, ...CASE_INSENSITIVE } },
          { lastName: { contains: search, ...CASE_INSENSITIVE } },
        ],
      },
    });
  }

  if (year !== undefined) {
    filters.push({ year });
  }

  if (leaveTypeId !== undefined) {
    filters.push({ leaveTypeId });
  }

  if (departmentId !== undefined) {
    filters.push({ employee: { departmentId } });
  }

  return filters.length === 0 ? undefined : { AND: filters };
}

/**
 * Orders by the requested column, then by `id`.
 *
 * `employee` is the one value that is not a column here: it becomes the related
 * employee's surname and then given name, which is what a person means by "sort
 * by employee" — `employeeId` would sort by cuid, which is to say by nothing.
 * Prisma expresses this as an ordering on a to-one relation, so it stays a
 * single query.
 *
 * The tie-break on `id` is what makes pagination safe: none of the sortable
 * values is unique — a year, a day count and even a full name are all shared by
 * many rows — so without it a record could repeat on one page and vanish from
 * the next.
 */
function buildOrderBy(
  sortBy: LeaveBalanceSortField,
  sortOrder: SortOrder,
): Prisma.EmployeeLeaveBalanceOrderByWithRelationInput[] {
  if (sortBy === 'employee') {
    return [
      { employee: { lastName: sortOrder } },
      { employee: { firstName: sortOrder } },
      { id: SortOrder.ASC },
    ];
  }

  return [{ [sortBy]: sortOrder }, { id: SortOrder.ASC }];
}
