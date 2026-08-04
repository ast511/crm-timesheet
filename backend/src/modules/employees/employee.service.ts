import {
  BadRequestException,
  ConflictException,
  forwardRef,
  Inject,
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
import { EmployeeStatus } from '../../generated/prisma/enums';
import { PrismaService } from '../../prisma/prisma.service';
import { DepartmentService } from '../departments/department.service';
import { PositionService } from '../positions/position.service';
import { ProjectMemberService } from '../project-members/project-member.service';
import { UserService } from '../users/user.service';
import { CreateEmployeeDto } from './dto/create-employee.dto';
import { EmployeeQueryDto } from './dto/employee-query.dto';
import { UpdateEmployeeDto } from './dto/update-employee.dto';
import { EmployeeSortField } from './employee.constants';
import {
  EMPLOYEE_PUBLIC_SELECT,
  EmployeeEntity,
  toEmployeeEntity,
} from './entities/employee.entity';

/**
 * Makes PostgreSQL fold the case of both operands, so `pop` finds `Popescu`.
 * Extracted because getting it wrong on one of the comparisons below would
 * produce a search or a duplicate check that quietly behaves differently from
 * the others.
 */
const CASE_INSENSITIVE = { mode: 'insensitive' } as const;

/** The foreign keys a write may carry; `undefined` means "not changing". */
interface EmployeeRelationIds {
  readonly userId?: string;
  readonly departmentId?: string;
  readonly positionId?: string;
}

/**
 * Every rule about employees lives here; the controller only routes.
 *
 * What makes this module more than a fourth copy of the same CRUD shape is that
 * an employee is defined by three relations rather than by its own columns, and
 * three concerns follow from that:
 *
 * 1. **A referenced row has to exist before it can be pointed at.** The
 *    database would say so too, but as a foreign-key violation surfacing as a
 *    `500`; asking first turns it into a `400` naming the field.
 * 2. **A user belongs to exactly one employee.** `Employee.userId` is unique,
 *    so linking an account a second time is a conflict, not a validation error,
 *    and is reported as one.
 * 3. **Terminating somebody is not just a column change.** An employee who has
 *    left the company cannot still be on a project, so `TERMINATED` also ends
 *    their open memberships — see {@link EmployeeService.update}. This is the
 *    first place in the codebase where writing one resource writes another.
 *
 * The three referenced tables are read through the services that own them —
 * `UserService`, `DepartmentService`, `PositionService` — which is the hand-off
 * Features 007, 008 and 009 each wrote into their module. Only the employee
 * query itself reaches those tables directly, through the `select` in
 * {@link EMPLOYEE_PUBLIC_SELECT}, because composing a joined read out of
 * separate service calls would be one round trip per employee per relation.
 */
@Injectable()
export class EmployeeService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly users: UserService,
    private readonly departments: DepartmentService,
    private readonly positions: PositionService,
    // `forwardRef` because the dependency is mutual: memberships ask this
    // service about a person, and this service asks them to close when that
    // person is terminated. See `ProjectMemberService`'s constructor for why
    // the write lives there rather than here.
    @Inject(forwardRef(() => ProjectMemberService))
    private readonly projectMembers: ProjectMemberService,
  ) {}

  /**
   * One page of employees, narrowed by `search` and the five filters, ordered
   * by `sortBy`.
   *
   * The rows and the total are read in a single `$transaction` so both see the
   * same snapshot: run separately, a concurrent insert between them would
   * produce a `total` that does not describe the page just returned.
   */
  async findAll(
    query: EmployeeQueryDto,
  ): Promise<PaginatedResult<EmployeeEntity>> {
    const where = buildWhere(query);

    const [employees, total] = await this.prisma.$transaction([
      this.prisma.employee.findMany({
        where,
        orderBy: buildOrderBy(query.sortBy, query.sortOrder),
        select: EMPLOYEE_PUBLIC_SELECT,
        ...toSkipTake(query),
      }),
      this.prisma.employee.count({ where }),
    ]);

    return buildPaginatedResult(employees.map(toEmployeeEntity), total, query);
  }

  async findOne(id: string): Promise<EmployeeEntity> {
    const employee = await this.prisma.employee.findUnique({
      where: { id },
      select: EMPLOYEE_PUBLIC_SELECT,
    });

    if (employee === null) {
      throw new NotFoundException(notFoundMessage(id));
    }

    return toEmployeeEntity(employee);
  }

  /**
   * Creates an employee, once everything it references is known to be there.
   *
   * The relations are checked before the code, so the escalation is ordered:
   * a body pointing at rows that do not exist is a `400`, and only a body that
   * is otherwise sound can go on to conflict with an existing employee.
   */
  async create(dto: CreateEmployeeDto): Promise<EmployeeEntity> {
    await this.assertRelationsExist(dto);
    await this.assertEmployeeCodeIsFree(dto.employeeCode);

    const created = await this.prisma.employee.create({
      data: {
        employeeCode: dto.employeeCode,
        firstName: dto.firstName,
        lastName: dto.lastName,
        phone: dto.phone,
        // The DTO guarantees an ISO-8601 string; this is the one place it
        // becomes the `Date` the `timestamp` column stores.
        hireDate: new Date(dto.hireDate),
        userId: dto.userId,
        departmentId: dto.departmentId,
        positionId: dto.positionId,
        seniority: dto.seniority,
        status: dto.status,
        canReplaceOthers: dto.canReplaceOthers,
      },
      select: EMPLOYEE_PUBLIC_SELECT,
    });

    return toEmployeeEntity(created);
  }

  /**
   * Applies a partial update.
   *
   * Existence is checked first, so patching a missing id reports the missing id
   * rather than a complaint about the body. Then the same two checks creation
   * makes, on whichever fields the patch actually carries: a relation that is
   * not changing is not re-read, and a body with no `employeeCode` costs no
   * uniqueness query.
   *
   * The employee's own id is excluded from both, so re-sending the values it
   * already holds is not a conflict with itself.
   *
   * **A status becoming `TERMINATED` also ends the person's open project
   * memberships**, because somebody who has left the company cannot still be on
   * a project — the invariant `ProjectMemberService` documents. Three things
   * about how that is done are deliberate:
   *
   * - **It is one transaction.** Either the employee is terminated and their
   *   memberships close, or neither happens. Two separate writes could leave a
   *   terminated employee on a project if the second one failed, which is the
   *   exact state this feature exists to prevent.
   * - **`leftAt` is the employee's own `updatedAt`,** read back from the same
   *   transaction rather than a second `new Date()`. The membership ends at the
   *   moment the person was terminated, not a few milliseconds after it.
   * - **Only a *transition* triggers it.** Re-sending `TERMINATED` on somebody
   *   already terminated changes nothing, so it must not stamp a fresh `leftAt`
   *   on memberships created since — which is why the stored status is read
   *   first, and why {@link findStatusOrThrow} replaced the plain existence
   *   check.
   *
   * The reverse is not symmetrical: moving an employee back to `ACTIVE` does not
   * reopen anything. Which projects somebody rejoins is not derivable from the
   * fact that they returned, so it stays an explicit decision — a `PATCH` on the
   * membership, or a new one.
   */
  async update(id: string, dto: UpdateEmployeeDto): Promise<EmployeeEntity> {
    const currentStatus = await this.findStatusOrThrow(id);

    await this.assertRelationsExist(dto, id);
    await this.assertEmployeeCodeIsFree(dto.employeeCode, id);

    const isBeingTerminated =
      dto.status === EmployeeStatus.TERMINATED &&
      currentStatus !== EmployeeStatus.TERMINATED;

    const updated = await this.prisma.$transaction(async (tx) => {
      const employee = await tx.employee.update({
        where: { id },
        // `undefined` is omitted from the UPDATE by Prisma, so an absent field
        // is left alone while an explicit `null` phone clears the column.
        data: {
          employeeCode: dto.employeeCode,
          firstName: dto.firstName,
          lastName: dto.lastName,
          phone: dto.phone,
          hireDate:
            dto.hireDate === undefined ? undefined : new Date(dto.hireDate),
          userId: dto.userId,
          departmentId: dto.departmentId,
          positionId: dto.positionId,
          seniority: dto.seniority,
          status: dto.status,
          canReplaceOthers: dto.canReplaceOthers,
        },
        select: EMPLOYEE_PUBLIC_SELECT,
      });

      if (isBeingTerminated) {
        await this.projectMembers.closeOpenMemberships(
          id,
          employee.updatedAt,
          tx,
        );
      }

      return employee;
    });

    return toEmployeeEntity(updated);
  }

  /**
   * Hard-deletes an employee nothing depends on.
   *
   * Two relations are counted rather than cascaded, for the same reason and with
   * different consequences:
   *
   * - **Project memberships** record that this person worked on that project,
   *   and deleting them to remove a personnel record would rewrite the project's
   *   history.
   * - **Leave balances** record what this person was granted and has taken. They
   *   are the ledger behind every leave request the next feature will judge, and
   *   removing the person would leave those days unaccounted for.
   *
   * The `409` asks the caller to clear whichever of the two is in the way, or to
   * set the employee's status to `TERMINATED` — which is what the enum is for,
   * and a decision only a human should make.
   *
   * Both counts are part of the existence query, so the common case is one round
   * trip and a `404` and a `409` cannot be decided from two different snapshots.
   * Both are also backed by `ON DELETE RESTRICT` in the schema: without this
   * check the database would refuse the delete anyway, but as a driver error
   * surfacing as a `500` rather than a message naming what is in the way.
   */
  async remove(id: string): Promise<void> {
    const employee = await this.prisma.employee.findUnique({
      where: { id },
      select: {
        _count: { select: { projectMemberships: true, leaveBalances: true } },
      },
    });

    if (employee === null) {
      throw new NotFoundException(notFoundMessage(id));
    }

    const { projectMemberships, leaveBalances } = employee._count;

    if (projectMemberships > 0) {
      throw new ConflictException(
        `Employee ${id} cannot be deleted while ${projectMemberships} project membership(s) reference it`,
      );
    }

    if (leaveBalances > 0) {
      throw new ConflictException(
        `Employee ${id} cannot be deleted while ${leaveBalances} leave balance(s) reference it`,
      );
    }

    await this.prisma.employee.delete({ where: { id } });
  }

  /**
   * This employee's status, or `null` when there is no such employee.
   *
   * Public because the project-members feature has to confirm an employee
   * before assigning them to a project, and this module owns the `employees`
   * table — the same hand-off `DepartmentService`, `PositionService` and
   * `ProjectService` each make with their `exists`.
   *
   * It answers with the status rather than a boolean because "is this person
   * there" and "are they still with the company" are now both asked at the same
   * moment, by the same caller, and one query answers both. `null` for a missing
   * employee rather than a thrown `404`: the caller knows what an absent
   * employee means in its own request — a `400` naming a body field, for
   * project members — while here it could only guess.
   *
   * One column is selected: the caller needs an answer, not a row.
   */
  async findStatus(id: string): Promise<EmployeeStatus | null> {
    const employee = await this.prisma.employee.findUnique({
      where: { id },
      select: { status: true },
    });

    return employee?.status ?? null;
  }

  /**
   * The stored status, or a `404` if the employee is not there.
   *
   * Built on {@link findStatus}, which asks exactly the same question. It is
   * what `update` needs before writing: the existence check it has always made,
   * plus the one value that decides whether this write is a termination. The
   * full record — with its three joins — is read by the update itself.
   */
  private async findStatusOrThrow(id: string): Promise<EmployeeStatus> {
    const status = await this.findStatus(id);

    if (status === null) {
      throw new NotFoundException(notFoundMessage(id));
    }

    return status;
  }

  /**
   * Rejects a body that points at rows which do not exist, or at a user another
   * employee already holds.
   *
   * The three lookups run concurrently, and every missing reference is reported
   * at once — as an array, the same shape the `ValidationPipe` produces — so a
   * form can mark each offending input instead of discovering the second
   * problem only after fixing the first. A missing reference is a `400` rather
   * than a `404`: the employee being addressed is fine, it is the submitted
   * body that names something that is not there.
   *
   * The link check is separate and comes second, because it is a different kind
   * of answer: the account exists, it is simply taken. `Employee.userId` is
   * unique, so this is the read half of a check the database also enforces —
   * the index closes the race between this query and the write, while this
   * query is what turns a foreign-key error into a message naming the employee
   * currently holding the account.
   *
   * `excludeEmployeeId` is the employee being updated, which is not a conflict
   * with itself when a patch re-sends the `userId` it already has.
   */
  private async assertRelationsExist(
    { userId, departmentId, positionId }: EmployeeRelationIds,
    excludeEmployeeId?: string,
  ): Promise<void> {
    const [link, departmentExists, positionExists] = await Promise.all([
      // `undefined` distinguishes "not asked" from the `null` the service
      // returns for "no such account".
      userId === undefined ? undefined : this.users.findEmployeeLink(userId),
      departmentId === undefined ? true : this.departments.exists(departmentId),
      positionId === undefined ? true : this.positions.exists(positionId),
    ]);

    const missing: string[] = [];

    if (userId !== undefined && link === null) {
      missing.push(`User ${userId} does not exist`);
    }

    if (!departmentExists) {
      missing.push(`Department ${departmentId} does not exist`);
    }

    if (!positionExists) {
      missing.push(`Position ${positionId} does not exist`);
    }

    if (missing.length > 0) {
      throw new BadRequestException(missing);
    }

    const linkedEmployeeId = link?.employeeId ?? null;

    if (linkedEmployeeId !== null && linkedEmployeeId !== excludeEmployeeId) {
      throw new ConflictException(
        `User ${userId} is already linked to employee ${linkedEmployeeId}`,
      );
    }
  }

  /**
   * Rejects an employee code already taken by another employee.
   *
   * The comparison is case-insensitive because `emp-0001` and `EMP-0001` are
   * the same code to a human, while PostgreSQL's unique index sees two rows.
   * That index still backs this check for the exact-case race between the read
   * and the write — and the DTO upper-cases before either, so in practice the
   * gap is closed.
   *
   * `excludeId` is the employee being updated, which must not conflict with
   * itself. An absent code — a patch that does not touch it — skips the query.
   */
  private async assertEmployeeCodeIsFree(
    employeeCode?: string,
    excludeId?: string,
  ): Promise<void> {
    if (employeeCode === undefined) {
      return;
    }

    const conflict = await this.prisma.employee.findFirst({
      where: {
        employeeCode: { equals: employeeCode, ...CASE_INSENSITIVE },
        ...(excludeId === undefined ? {} : { NOT: { id: excludeId } }),
      },
      select: { id: true },
    });

    if (conflict !== null) {
      throw new ConflictException(
        `An employee with code "${employeeCode}" already exists`,
      );
    }
  }
}

/** Message used for every 404 path, so they cannot drift apart. */
function notFoundMessage(id: string): string {
  return `Employee ${id} was not found`;
}

/**
 * Builds the `WHERE` for the list endpoint.
 *
 * The parameters are independent and combine with `AND`: `?status=ACTIVE`
 * narrows whatever `?search=` matched rather than replacing it. Returns
 * `undefined` — not an empty object — when nothing was requested, because
 * `undefined` is what `findMany` and `count` both read as "no filter", and the
 * two must agree or the total would not describe the page.
 *
 * The two id filters are compared exactly. They are opaque keys a client copies
 * from a previous response, not something anybody types, so folding their case
 * would only make the comparison slower.
 */
function buildWhere({
  search,
  departmentId,
  positionId,
  seniority,
  status,
  canReplaceOthers,
}: EmployeeQueryDto): Prisma.EmployeeWhereInput | undefined {
  const filters: Prisma.EmployeeWhereInput[] = [];

  if (search !== undefined && search.length > 0) {
    filters.push({
      OR: [
        { employeeCode: { contains: search, ...CASE_INSENSITIVE } },
        { firstName: { contains: search, ...CASE_INSENSITIVE } },
        { lastName: { contains: search, ...CASE_INSENSITIVE } },
      ],
    });
  }

  if (departmentId !== undefined) {
    filters.push({ departmentId });
  }

  if (positionId !== undefined) {
    filters.push({ positionId });
  }

  if (seniority !== undefined) {
    filters.push({ seniority });
  }

  if (status !== undefined) {
    filters.push({ status });
  }

  if (canReplaceOthers !== undefined) {
    filters.push({ canReplaceOthers });
  }

  return filters.length === 0 ? undefined : { AND: filters };
}

/**
 * Orders by the requested column, then by `id`.
 *
 * The tie-break is what makes pagination safe: of the five sortable columns
 * only `employeeCode` is unique, and two people sharing a surname or a hire
 * date could otherwise be returned in a different relative order on each query,
 * letting a record repeat on one page and vanish from the next.
 */
function buildOrderBy(
  sortBy: EmployeeSortField,
  sortOrder: SortOrder,
): Prisma.EmployeeOrderByWithRelationInput[] {
  return [{ [sortBy]: sortOrder }, { id: SortOrder.ASC }];
}
