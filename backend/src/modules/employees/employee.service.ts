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
 * One person, as a leave-balance generation run sees them.
 *
 * `hireDate` is the field that earns this its own type rather than a reuse of
 * `EmployeeEntity`: the caller pro-rates a first-year allocation from it, and it
 * is not in the public entity's shape as a `Date`. The three identifying fields
 * are there so a warning can name somebody the way the person reading it knows
 * them — `EMP-0007 (Popescu Ion)` rather than a cuid.
 */
export interface EmployeeGenerationCandidate {
  readonly id: string;
  readonly employeeCode: string;
  readonly firstName: string;
  readonly lastName: string;
  readonly hireDate: Date;
}

/**
 * The span of somebody's employment — the two dates a timesheet is bounded by.
 *
 * `terminationDate` is null while the person still works here, which is the
 * ordinary case, and the caller reads that as "up to today" rather than as "for
 * ever": Feature 030 bounds entries at `[hireDate, terminationDate ?? today]`.
 *
 * It earns its own type rather than reusing `EmployeeEntity` for the reason
 * {@link EmployeeGenerationCandidate} and {@link EmployeeDeliveryTarget} do: that
 * resource is shaped for a screen, carries three joined objects, and renders its
 * dates as strings — while every comparison the fill-in engine makes is between
 * `Date`s.
 */
export interface EmploymentWindow {
  readonly hireDate: Date;
  readonly terminationDate: Date | null;
}

/**
 * One person, as the Notification Delivery Engine has to reach them.
 *
 * Three fields, and each is here because a delivery channel needs it: the
 * employee id is what a campaign's audience names, the user id is what a
 * notification is addressed to, and the address is where an email goes. Nothing
 * else is read — a name would only be a second thing to keep in step with the
 * message the engine has already composed.
 *
 * It earns its own type rather than reusing `EmployeeEntity` for the reason
 * {@link EmployeeGenerationCandidate} does: that resource is shaped for a screen
 * and carries three joined objects, and a company-wide campaign would resolve a
 * department and a position per person to send them an email.
 */
export interface EmployeeDeliveryTarget {
  readonly employeeId: string;
  readonly userId: string;
  readonly email: string;
}

/**
 * One person, as a report has to print them.
 *
 * Added for Feature 031, and the fourth consumer-specific shape on this service
 * for the reason the other three exist: a report needs a name to head a column,
 * a code and a department to sub-label it with, and the employment window to
 * decide whether a day before somebody's start date counts as an absence or as
 * nothing at all. `EmployeeEntity` would additionally carry the user account,
 * the seniority, the status and three joined objects rendered as strings — none
 * of which a grid prints, and all of which a report of five hundred people would
 * pay for per row.
 *
 * The two dates are `Date`s rather than ISO strings, like {@link
 * EmploymentWindow} and for the same reason: every comparison made against them
 * is against another `Date`.
 */
export interface EmployeeReportRow {
  readonly id: string;
  readonly employeeCode: string;
  readonly firstName: string;
  readonly lastName: string;
  /**
   * The department and position are **not** nullable, because the columns are
   * not: an employee is defined by its three relations, and `department_id` and
   * `position_id` are both required. Typing them as optional here would invent a
   * case the schema forbids and force every report to handle it.
   */
  readonly departmentCode: string;
  readonly departmentName: string;
  readonly positionName: string;
  readonly hireDate: Date;
  readonly terminationDate: Date | null;
}

/** How a report narrows the population it covers. */
export interface EmployeeReportFilter {
  readonly departmentId?: string;
  readonly employeeId?: string;
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
    assertEmploymentSpanIsOrdered(dto.hireDate, dto.terminationDate);

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
        terminationDate: toNullableDate(dto.terminationDate),
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
    const current = await this.findEmploymentFactsOrThrow(id);

    // Judged against the employment span the patch would *leave behind*, not
    // against the fields the body happens to carry: `PATCH { terminationDate }`
    // is weighed against the stored `hireDate`, and moving the hire date of
    // somebody who has already left is weighed against the stored termination.
    assertEmploymentSpanIsOrdered(
      dto.hireDate ?? current.hireDate,
      dto.terminationDate === undefined
        ? current.terminationDate
        : dto.terminationDate,
    );

    await this.assertRelationsExist(dto, id);
    await this.assertEmployeeCodeIsFree(dto.employeeCode, id);

    const isBeingTerminated =
      dto.status === EmployeeStatus.TERMINATED &&
      current.status !== EmployeeStatus.TERMINATED;

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
          // `undefined` leaves it alone; an explicit `null` says the person is
          // not leaving after all, which has to stay undoable.
          terminationDate:
            dto.terminationDate === undefined
              ? undefined
              : toNullableDate(dto.terminationDate),
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
   *   are the ledger behind every leave request, and removing the person would
   *   leave those days unaccounted for.
   * - **Leave requests** record absences they asked for and were granted or
   *   refused. Deleting them to remove a personnel record would erase the
   *   explanation for the days their balances say were used.
   * - **Replacement nominations** record that this person was covering somebody
   *   else's work. They belong to *another* employee's request, so removing them
   *   would silently leave that request with less cover than it was approved
   *   with — possibly none.
   * - **Timesheets** record the months this person accounted for, and are the
   *   strongest of the five: they are what payroll and reporting are eventually
   *   drawn from, and an approved one is a month the company signed off. Added by
   *   Feature 030.
   *
   * `processedLeaveRequests` and `reviewedTimesheets` are deliberately **not**
   * counted, and that is the one asymmetry here. A decision survives the person
   * who made it: both foreign keys are `ON DELETE SET NULL` rather than
   * `RESTRICT`, `processedAt` and `reviewedAt` keep saying when each happened,
   * and counting them would make an administrator undeletable for as long as any
   * request or month they ever touched exists.
   *
   * The `409` asks the caller to clear whichever count is in the way, or to set
   * the employee's status to `TERMINATED` — which is what the enum is for, and a
   * decision only a human should make.
   *
   * Every count is part of the existence query, so the common case is one round
   * trip and a `404` and a `409` cannot be decided from two different snapshots.
   * All are also backed by `ON DELETE RESTRICT` in the schema: without this
   * check the database would refuse the delete anyway, but as a driver error
   * surfacing as a `500` rather than a message naming what is in the way.
   */
  async remove(id: string): Promise<void> {
    const employee = await this.prisma.employee.findUnique({
      where: { id },
      select: {
        _count: {
          select: {
            projectMemberships: true,
            leaveBalances: true,
            leaveRequests: true,
            leaveRequestReplacements: true,
            timesheets: true,
          },
        },
      },
    });

    if (employee === null) {
      throw new NotFoundException(notFoundMessage(id));
    }

    assertNothingReferences(id, employee._count);

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
   * Which of these employees exist, as a list of the ids that were found.
   *
   * Public for the reason {@link findStatus} is — this module owns the
   * `employees` table, so another module confirms a person through it rather
   * than by querying the table — and separate from it because the question is
   * genuinely different: `findStatus` asks about one person and answers with a
   * fact about them, while this asks about a *set* and answers which of it is
   * real. Feature 027's campaign recipients are the first caller: a campaign can
   * name up to two hundred people, and one `findStatus` per name would be two
   * hundred round trips to answer one question.
   *
   * It returns the ids that were found rather than the ones that were not,
   * because only the caller knows what a missing person means in its own request
   * — a `400` naming body fields, for a campaign — and what to say about it.
   * `id` alone is selected: the caller needs the answer, not the rows.
   *
   * Status is deliberately not filtered on. "Does this person exist" and "are
   * they still with the company" are different questions, and folding the second
   * in here would make a caller that only asked the first silently treat a
   * suspended employee as a typo.
   */
  async findExistingIds(ids: readonly string[]): Promise<string[]> {
    const employees = await this.prisma.employee.findMany({
      where: { id: { in: [...ids] } },
      select: { id: true },
    });

    return employees.map(({ id }) => id);
  }

  /**
   * The people a notification can actually be delivered to — either the ones
   * named, or the whole company.
   *
   * Public for the reason {@link findExistingIds} is: this module owns the
   * `employees` table, and the account and address behind each person are reached
   * through the `user` relation this service already selects rather than by the
   * engine querying two tables of its own. One query answers a whole audience.
   *
   * **The two cases resolve different sets on purpose**, and the asymmetry is the
   * decision worth recording:
   *
   * - **No ids — "everybody"** — excludes `TERMINATED` employees and nobody else.
   *   A company announcement is for the people who work here; somebody who left
   *   in July should not receive Monday's maintenance notice. Everyone else is
   *   included: an employee `ON_LEAVE` is exactly the person a "your timesheet is
   *   due" reminder is for, and `SUSPENDED` and `INACTIVE` describe people the
   *   company still employs. It is the same line {@link findGenerationCandidates}
   *   draws, for the same reason.
   * - **Ids given — "these people"** — resolves them whatever their status,
   *   because somebody chose them by name. Silently dropping a named recipient
   *   would leave the author believing an announcement reached somebody it did
   *   not; the campaign screen is where a leaver should not have been picked.
   *
   * The audience is resolved **when the campaign is sent**, which is what makes
   * Feature 027's single `ALL_EMPLOYEES` row correct: somebody hired between
   * composing and sending is included here, and somebody who left is not.
   *
   * Ordered by surname then given name, so a delivery run processes people in a
   * stable order — which is what makes a partially completed batch of emails
   * describable rather than arbitrary.
   */
  async findDeliveryTargets(
    ids?: readonly string[],
  ): Promise<EmployeeDeliveryTarget[]> {
    const employees = await this.prisma.employee.findMany({
      where:
        ids === undefined
          ? { status: { not: EmployeeStatus.TERMINATED } }
          : { id: { in: [...ids] } },
      orderBy: [{ lastName: SortOrder.ASC }, { firstName: SortOrder.ASC }],
      select: { id: true, user: { select: { id: true, email: true } } },
    });

    return employees.map((employee) => ({
      employeeId: employee.id,
      userId: employee.user.id,
      email: employee.user.email,
    }));
  }

  /**
   * The population one report covers, narrowed by the filters it was asked for.
   *
   * Added for Feature 031, which reads `employees` through this method rather
   * than querying the table — the rule every module here follows, and the reason
   * the reporting module imports this one.
   *
   * **Every employee is included by default, `TERMINATED` ones too**, and that is
   * the opposite call {@link findDeliveryTargets} makes. The difference is what
   * each is for: a notification is *sent to* somebody, so a leaver must be
   * excluded or the send fails; a report is *about* a month, and somebody who
   * left on the 20th worked the first three weeks of it. Excluding them would
   * silently drop their hours from a company total that payroll is reconciled
   * against, which is the one error a report must not make. The employment window
   * travels with each row so a builder can mark the days after they left as
   * outside employment rather than as absence.
   *
   * Ordered by surname then given name — the order the grids print their columns
   * in, so two reports of the same month put the same person in the same place.
   */
  async findForReporting(
    filter: EmployeeReportFilter = {},
  ): Promise<EmployeeReportRow[]> {
    const employees = await this.prisma.employee.findMany({
      where: {
        ...(filter.departmentId === undefined
          ? {}
          : { departmentId: filter.departmentId }),
        ...(filter.employeeId === undefined ? {} : { id: filter.employeeId }),
      },
      orderBy: [{ lastName: SortOrder.ASC }, { firstName: SortOrder.ASC }],
      select: {
        id: true,
        employeeCode: true,
        firstName: true,
        lastName: true,
        hireDate: true,
        terminationDate: true,
        department: { select: { code: true, name: true } },
        position: { select: { name: true } },
      },
    });

    return employees.map(({ department, position, ...employee }) => ({
      ...employee,
      departmentCode: department.code,
      departmentName: department.name,
      positionName: position.name,
    }));
  }

  /**
   * The people a year's leave balances should be generated for, or only the ones
   * named.
   *
   * **`TERMINATED` is the one status excluded, and it is the only one that
   * should be.** Somebody `ON_LEAVE` on 1 January needs next year's balances as
   * much as anybody — more, since they are already away — and `SUSPENDED` and
   * `INACTIVE` describe people the company still employs. Restricting this to
   * `ACTIVE` would leave exactly those people without balances and reproduce, in
   * a new place, the "0 days available" that Feature 024 exists to prevent.
   *
   * A leaver is different in kind: they will file no request for a year they
   * will not work, so a row for them would be a grant nobody can use. Note that
   * this is not the same as refusing to *allocate* to a leaver, which
   * `EmployeeLeaveBalancesService` still permits by hand — a person who left in
   * July had days in that year, and recording them has to stay possible.
   *
   * `hireDate` comes back because the caller pro-rates the first year's
   * allocation from it; `employeeCode` and the name because a warning about a
   * person has to name them the way the person reading it chose them.
   *
   * `ids` is matched as given: an id that names nobody simply does not come
   * back, which is how the caller detects it.
   */
  async findGenerationCandidates(
    ids?: readonly string[],
  ): Promise<EmployeeGenerationCandidate[]> {
    return this.prisma.employee.findMany({
      where: {
        status: { not: EmployeeStatus.TERMINATED },
        ...(ids === undefined ? {} : { id: { in: [...ids] } }),
      },
      orderBy: [{ lastName: SortOrder.ASC }, { firstName: SortOrder.ASC }],
      select: {
        id: true,
        employeeCode: true,
        firstName: true,
        lastName: true,
        hireDate: true,
      },
    });
  }

  /**
   * When somebody was hired and when they left, or `null` when there is no such
   * employee.
   *
   * Public for the reason {@link findStatus} and {@link findExistingIds} are:
   * this module owns the `employees` table, so another module asks it about a
   * person rather than querying the table. Feature 030 is the caller — a
   * timesheet entry is only acceptable inside
   * `[hireDate, terminationDate ?? today]`, and the fill-in engine needs both
   * ends as `Date`s to compare against the days somebody logged.
   *
   * It returns the two dates rather than the whole employee, on the same
   * principle `WorkScheduleService.findWorkingDays` follows: publishing
   * `findOne()` to a consumer would hand it three joined records it has no
   * business reading, and would make every column added to this table part of
   * the contract between the two modules.
   *
   * `null` for a missing employee rather than a thrown `404`, because only the
   * caller knows what an absent employee means in its own request.
   */
  async findEmploymentWindow(id: string): Promise<EmploymentWindow | null> {
    return this.prisma.employee.findUnique({
      where: { id },
      select: { hireDate: true, terminationDate: true },
    });
  }

  /**
   * The stored facts `update` has to merge its body into, or a `404` if the
   * employee is not there.
   *
   * Three columns and no joins: the existence check this method has always made,
   * the status that decides whether the write is a termination, and — since
   * Feature 030 added `terminationDate` — the two dates whose ordering has to be
   * judged against the state the patch would leave behind. The full record, with
   * its three joins, is read by the update itself.
   */
  private async findEmploymentFactsOrThrow(
    id: string,
  ): Promise<EmploymentWindow & { status: EmployeeStatus }> {
    const employee = await this.prisma.employee.findUnique({
      where: { id },
      select: { status: true, hireDate: true, terminationDate: true },
    });

    if (employee === null) {
      throw new NotFoundException(notFoundMessage(id));
    }

    return employee;
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

/** `null` stays `null`; anything else becomes the `Date` the column stores. */
function toNullableDate(value: string | null | undefined): Date | null {
  return value === undefined || value === null ? null : new Date(value);
}

/**
 * Rejects an employment span that ends before it begins.
 *
 * The comparison is `<`, so somebody hired and terminated on the same day — a
 * single day's contract, or a hire reversed the same afternoon — is allowed:
 * `terminationDate === hireDate` is not "before".
 *
 * A `400` rather than a `409`: nothing stored conflicts with the request, the
 * submitted span simply contradicts itself. The message is an array, the same
 * shape the `ValidationPipe` produces, so a form handles it with the code it
 * already has for field errors — the call `WorkScheduleService` makes for its
 * entry bounds.
 *
 * It matters beyond tidiness because Feature 030 bounds timesheet entries at
 * `[hireDate, terminationDate ?? today]`: an inverted span is an empty range, so
 * every day of every month would be refused with an explanation about employment
 * dates that the person filling the timesheet cannot act on.
 */
function assertEmploymentSpanIsOrdered(
  hireDate: string | Date,
  terminationDate: string | Date | null | undefined,
): void {
  if (terminationDate === null || terminationDate === undefined) {
    return;
  }

  if (new Date(terminationDate).getTime() < new Date(hireDate).getTime()) {
    throw new BadRequestException([
      'terminationDate must not be before hireDate',
    ]);
  }
}

/**
 * What each relation is called in the `409`, keyed by the count that guards it.
 *
 * A table rather than four `if` blocks, because the four differ only in a noun:
 * written out, the fourth copy is the one whose message says "leave balance"
 * while counting requests. Adding a relation to `remove` is adding a line here,
 * and the type makes forgetting one a build error rather than a silent hole.
 */
const REFERENCE_LABELS = {
  projectMemberships: 'project membership',
  leaveBalances: 'leave balance',
  leaveRequests: 'leave request',
  leaveRequestReplacements: 'leave request replacement',
  timesheets: 'timesheet',
} as const;

/**
 * Refuses to delete an employee anything still points at.
 *
 * The counts are reported one at a time rather than all at once — unlike the
 * missing-relation checks above, which return an array — because this is not a
 * form the caller can correct field by field. It is a single answer: this record
 * is referenced, and here is the first thing in the way.
 */
function assertNothingReferences(
  id: string,
  counts: Record<keyof typeof REFERENCE_LABELS, number>,
): void {
  for (const [relation, label] of Object.entries(REFERENCE_LABELS)) {
    const count = counts[relation as keyof typeof REFERENCE_LABELS];

    if (count > 0) {
      throw new ConflictException(
        `Employee ${id} cannot be deleted while ${count} ${label}(s) reference it`,
      );
    }
  }
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
