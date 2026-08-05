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
import {
  EmployeeGenerationCandidate,
  EmployeeService,
} from '../employees/employee.service';
import {
  LeaveTypeGenerationPolicy,
  LeaveTypesService,
} from '../leave-configuration/leave-types.service';
import { CreateEmployeeLeaveBalanceDto } from './dto/create-employee-leave-balance.dto';
import { EmployeeLeaveBalanceQueryDto } from './dto/employee-leave-balance-query.dto';
import { GenerateLeaveBalancesDto } from './dto/generate-leave-balances.dto';
import { UpdateEmployeeLeaveBalanceDto } from './dto/update-employee-leave-balance.dto';
import {
  LeaveBalanceSortField,
  MONTHS_PER_YEAR,
} from './employee-leave-balance.constants';
import {
  computeRemainingDays,
  EmployeeLeaveBalanceEntity,
  LEAVE_BALANCE_PUBLIC_SELECT,
  toLeaveBalanceEntity,
} from './entities/employee-leave-balance.entity';
import { LeaveBalanceGenerationReport } from './entities/leave-balance-generation-report.entity';

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
 * One year's balance, reduced to what a consumer needs to draw on it.
 *
 * `remainingDays` is the computed value, never a column — see
 * {@link computeRemainingDays}. The three stored numbers are deliberately not
 * published here: a caller consuming leave has no business writing
 * `allocatedDays`, and handing it the row would invite exactly that.
 */
export interface AvailableLeaveBalance {
  readonly id: string;
  readonly year: number;
  readonly remainingDays: number;
}

/**
 * The narrowing every consumption question shares: one person, one kind of
 * leave, and the last year that may be drawn on.
 */
export interface BalanceConsumptionScope {
  readonly employeeId: string;
  readonly leaveTypeId: string;
  /**
   * The latest year a balance may be taken from, inclusive — in practice the
   * year the leave itself falls in. See {@link EmployeeLeaveBalancesService.findAvailable}
   * for why a later year is not merely unhelpful but wrong.
   */
  readonly upToYear: number;
}

/**
 * Every rule about leave balances lives here; the controller only routes.
 *
 * Three of them are what make this more than another CRUD shape:
 *
 * 1. **`remainingDays` is never stored.** It is
 *    `allocatedDays + carriedOverDays - usedDays - expiredDays`, computed by
 *    `computeRemainingDays` on the way out of every endpoint. The four columns
 *    are the single source of truth; nothing in this service writes a fifth
 *    number, and no DTO accepts one.
 * 2. **A balance is identified by a triple**, not by a set of editable fields:
 *    one employee, one leave type, one year. That is a unique constraint in the
 *    schema and a `409` here, and it is why `PATCH` cannot move a balance
 *    between employees, types or years — see `UpdateEmployeeLeaveBalanceDto`.
 * 3. **No number here was invented by the application.** Feature 022 stated this
 *    as "nothing is granted automatically", when `POST` was the only way a
 *    balance could come into being. Feature 024's {@link generate} creates them
 *    in bulk and does not weaken the rule: every figure it writes is the leave
 *    type's `defaultAllocatedDays`, which HR configured, and a type that states
 *    no default produces no balance and a warning saying so. What the rule
 *    forbids is a number nobody decided, and there is still no path to one.
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
        expiredDays: dto.expiredDays,
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
        expiredDays: dto.expiredDays,
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

  /**
   * Opens a year: creates the balances that are missing, and closes the year
   * before it against each leave type's carry-over policy.
   *
   * The answer to the two questions HR asks that `POST` alone could not — "we
   * hired somebody, give them their balances" and "it is January, open the new
   * year" — which turn out to be one operation with different scopes. A new hire
   * has no previous year, so nothing is closed; everybody else does, so it is.
   *
   * **This does not contradict "nothing is granted automatically".** Every
   * number it writes was stated by a person: `defaultAllocatedDays` on the leave
   * type is the entitlement HR configured, and a type that states nothing
   * produces no row and a warning saying so. What the rule forbids is the
   * application inventing a figure, and there is no path here that does.
   *
   * Four decisions shape the rest:
   *
   * 1. **Existing balances are never touched.** A row already filed for `year`
   *    is counted as `skipped` and left exactly as it is, because it may hold a
   *    figure somebody negotiated. That is what makes the endpoint re-runnable —
   *    run it in December, run it again in January when three more people have
   *    joined — and re-running is how it is meant to be used.
   * 2. **Closing the old year expires days rather than moving them.** Balances
   *    are drawn oldest year first and availability reads every year up to the
   *    one requested, so last year's remainder is *already* spendable; what a
   *    carry-over cap needs is to take back the part above it. Copying survivors
   *    into `carriedOverDays` would leave the old row still reporting them and
   *    hand the employee each day twice. See {@link computeRemainingDays}.
   * 3. **A problem warns, it does not fail.** One leave type without a default
   *    must not cost the other three their run, and one stale id in a list of
   *    two hundred must not cost the rest. Everything possible is done and the
   *    remainder is reported in words. The exceptions are the two things that
   *    make the request itself unanswerable, which are a `400`: a year outside
   *    the bounds, caught by the DTO, and nothing at all in scope.
   * 4. **The whole run is one transaction.** A partially opened year — some
   *    people holding 2027 balances, others not, some 2026 rows capped and
   *    others not — is the state nobody could reason about afterwards, and the
   *    one a retry could not fix.
   */
  async generate(
    dto: GenerateLeaveBalancesDto,
  ): Promise<LeaveBalanceGenerationReport> {
    const warnings: string[] = [];

    const [employees, policies] = await Promise.all([
      this.employees.findGenerationCandidates(dto.employeeIds),
      this.leaveTypes.findGenerationPolicies(dto.leaveTypeIds),
    ]);

    warnings.push(...missingIdWarnings(dto, employees, policies));

    const eligible = employees.filter(
      (employee) => employee.hireDate.getUTCFullYear() <= dto.year,
    );

    warnings.push(
      ...unhiredWarning(employees.length - eligible.length, dto.year),
    );

    // Resolved after the employees are narrowed, because the warning about a
    // type with no default states how many people it cost — a number that is
    // only correct once the unhired have been dropped.
    const allocatable = resolveAllocatableTypes(
      { leaveTypeIds: dto.leaveTypeIds, employeeCount: eligible.length },
      policies,
      warnings,
    );

    if (eligible.length === 0 || allocatable.length === 0) {
      return emptyReport(dto, warnings);
    }

    return this.runGeneration(dto, eligible, allocatable, warnings);
  }

  /**
   * The half of {@link generate} that touches the database, once the scope is
   * settled.
   *
   * Split out so the rules above read as rules rather than as preamble to a
   * transaction, and so the two reads that plan the run are visibly outside it:
   * both years are loaded in one query, the whole plan is computed in memory,
   * and only then is anything written.
   *
   * `createMany` runs with `skipDuplicates`, which is not a substitute for the
   * `skipped` count but a guard beneath it. The count comes from the rows read a
   * moment ago; `skipDuplicates` is what makes a `POST` landing in between a
   * no-op instead of a unique-violation that would roll back an entire January.
   */
  private async runGeneration(
    dto: GenerateLeaveBalancesDto,
    employees: readonly EmployeeGenerationCandidate[],
    types: readonly AllocatableLeaveType[],
    warnings: string[],
  ): Promise<LeaveBalanceGenerationReport> {
    const previousYear = dto.year - 1;

    const existing = await this.prisma.employeeLeaveBalance.findMany({
      where: {
        year: { in: [previousYear, dto.year] },
        employeeId: { in: employees.map(({ id }) => id) },
        leaveTypeId: { in: types.map(({ id }) => id) },
      },
      select: {
        id: true,
        employeeId: true,
        leaveTypeId: true,
        year: true,
        allocatedDays: true,
        carriedOverDays: true,
        usedDays: true,
        expiredDays: true,
      },
    });

    const alreadyOpen = new Set(
      existing
        .filter((balance) => balance.year === dto.year)
        .map((balance) => pairKey(balance.employeeId, balance.leaveTypeId)),
    );

    const creations = planCreations(dto.year, employees, types, alreadyOpen);
    const expiries = planExpiries(
      existing.filter((balance) => balance.year === previousYear),
      types,
    );

    const report: LeaveBalanceGenerationReport = {
      year: dto.year,
      created: creations.length,
      skipped: employees.length * types.length - creations.length,
      expiredFromPreviousYear: expiries.reduce(
        (total, { days }) => total + days,
        0,
      ),
      expiredBalances: expiries.length,
      dryRun: dto.dryRun === true,
      warnings,
    };

    if (report.dryRun) {
      return report;
    }

    const created = await this.prisma.$transaction(async (tx) => {
      const { count } = await tx.employeeLeaveBalance.createMany({
        data: creations,
        skipDuplicates: true,
      });

      // Sequential rather than concurrent: `Promise.all` over these would
      // interleave writes inside one transaction for no gain, and the count is
      // bounded by how many people held a balance last year.
      for (const { id, days } of expiries) {
        await tx.employeeLeaveBalance.update({
          where: { id },
          data: { expiredDays: { increment: days } },
        });
      }

      return count;
    });

    return {
      ...report,
      created,
      skipped: report.skipped + creations.length - created,
    };
  }

  /**
   * The balances a request may draw on, oldest year first, each with what is
   * left in it.
   *
   * Feature 022 said this module would grow methods like this one when a feature
   * had a reason to ask, rather than guessing at their shape in advance. Feature
   * 023 is that feature, and it asks two things: how much is available, and take
   * it. Both live here rather than in the leave-requests module, so
   * `employee_leave_balances` keeps exactly one owner and `usedDays` keeps
   * exactly one writer.
   *
   * **Oldest first is the whole ordering, and it is not cosmetic.** Days carried
   * over from earlier years expire before this year's do, so consuming the
   * newest first would quietly let the oldest lapse unused — the employee would
   * lose days they were entitled to, and nothing in the data would say why.
   *
   * **`upToYear` bounds the other end, and that bound is a rule rather than a
   * convenience.** A balance for a year later than the leave is next year's
   * entitlement, already entered by HR; spending it on this year's absence would
   * let somebody take twenty-one days in September and have HR discover in
   * January that the year had already been drawn. Leave taken in a year is paid
   * for by that year or by one before it.
   *
   * Rows with nothing left are dropped rather than returned as zero: a consumer
   * walking the list should not have to skip them, and an overdrawn balance — a
   * negative remainder, which Feature 022 deliberately allows — must never be
   * treated as a debt the next year's allocation silently settles.
   *
   * `client` defaults to the pooled connection so a read-only caller needs to
   * know nothing about transactions; {@link consume} passes its own so the check
   * and the write see one snapshot.
   */
  async findAvailable(
    { employeeId, leaveTypeId, upToYear }: BalanceConsumptionScope,
    client: Prisma.TransactionClient = this.prisma,
  ): Promise<AvailableLeaveBalance[]> {
    const balances = await client.employeeLeaveBalance.findMany({
      where: { employeeId, leaveTypeId, year: { lte: upToYear } },
      orderBy: { year: SortOrder.ASC },
      select: {
        id: true,
        year: true,
        allocatedDays: true,
        carriedOverDays: true,
        usedDays: true,
        expiredDays: true,
      },
    });

    return balances
      .map((balance) => ({
        id: balance.id,
        year: balance.year,
        remainingDays: computeRemainingDays(balance),
      }))
      .filter(({ remainingDays }) => remainingDays > 0);
  }

  /**
   * How many days are available in total, across every year that may be drawn
   * on.
   *
   * The question a request asks *before* it is approved — a `PENDING` request
   * has to be refused for insufficient leave at the moment it is filed, not
   * weeks later when somebody clicks approve — and the reason this is separate
   * from {@link consume} rather than folded into it.
   */
  async countAvailableDays(scope: BalanceConsumptionScope): Promise<number> {
    const balances = await this.findAvailable(scope);

    return balances.reduce(
      (total, { remainingDays }) => total + remainingDays,
      0,
    );
  }

  /**
   * Draws `days` from the balances, oldest year first, and records it.
   *
   * The only writer of `usedDays` outside `POST` and `PATCH` on a balance, and
   * the single place the consumption rule exists. It walks the list
   * {@link findAvailable} returns, taking as much from each year as that year has
   * left before moving to the next, so a five-day absence backed by two days
   * carried over from 2025 spends those two and three of 2026's.
   *
   * **`tx` is required, not optional.** Approving a request writes the request's
   * status and every balance it consumes, and either all of that happens or none
   * of it does: a status written without the deduction would give somebody free
   * leave, and a deduction written without the status would take days for an
   * absence no record shows. The caller owns that transaction because the caller
   * is what makes it atomic — the same call `ProjectMemberService.closeOpenMemberships`
   * makes.
   *
   * The availability is re-read *inside* the transaction rather than passed in
   * from the caller's earlier check. Between filing a request and approving it,
   * another approval may have consumed the same balance, and a check made
   * against the older snapshot would overdraw it. The `400` this throws on a
   * shortfall is therefore a real answer HR can act on, not a redundant guard.
   *
   * The updates are sequential rather than concurrent, and deliberately so:
   * `Promise.all` over them would issue interleaved writes inside one
   * transaction for no gain, since at most a handful of years are ever touched.
   */
  async consume(
    scope: BalanceConsumptionScope,
    days: number,
    tx: Prisma.TransactionClient,
  ): Promise<void> {
    const balances = await this.findAvailable(scope, tx);
    const available = balances.reduce(
      (total, { remainingDays }) => total + remainingDays,
      0,
    );

    if (available < days) {
      throw new BadRequestException([
        insufficientLeaveMessage(available, days),
      ]);
    }

    let outstanding = days;

    for (const balance of balances) {
      if (outstanding === 0) {
        break;
      }

      const taken = Math.min(balance.remainingDays, outstanding);

      await tx.employeeLeaveBalance.update({
        where: { id: balance.id },
        data: { usedDays: { increment: taken } },
      });

      outstanding -= taken;
    }
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
 * Reported when a request asks for more leave than the employee holds.
 *
 * It states both numbers, because "not enough leave" alone leaves the person
 * unable to act: knowing they have four days and asked for five tells them to
 * shorten the request, and tells HR whether an allocation is missing.
 *
 * Exported so the leave-requests module reports a shortfall it detects before
 * approval in the same words this one reports a shortfall detected during it —
 * two messages for one condition would read as two different problems.
 */
export function insufficientLeaveMessage(
  available: number,
  requested: number,
): string {
  return `Insufficient leave: ${String(requested)} working day(s) requested, ${String(available)} day(s) available`;
}

/**
 * A leave type that can actually seed a balance: active, and with a default to
 * seed it from.
 *
 * The `null` is gone from `defaultAllocatedDays`, which is the whole reason this
 * type exists rather than reusing {@link LeaveTypeGenerationPolicy}. Narrowing
 * once, where the warning is produced, means nothing downstream has to re-check
 * it or decide what a missing default means — the planner takes a number because
 * by then there is one.
 */
interface AllocatableLeaveType {
  readonly id: string;
  readonly code: string;
  readonly defaultAllocatedDays: number;
  readonly allowsCarryOver: boolean;
  readonly maxCarryOverDays: number | null;
}

/** One year-end write-off: which balance, and how many days it loses. */
interface PlannedExpiry {
  readonly id: string;
  readonly days: number;
}

/** Identifies an (employee, leave type) pair within one year's plan. */
function pairKey(employeeId: string, leaveTypeId: string): string {
  return `${employeeId}:${leaveTypeId}`;
}

/**
 * Narrows the policies to the types a run can allocate from, warning about each
 * one it drops.
 *
 * Two reasons to drop a type, and they are reported differently on purpose:
 *
 * - **Retired.** Warned about only when the caller named it explicitly. An id in
 *   the body is something a person typed and is owed an answer about; a retired
 *   type swept up by the default set is skipped in silence, because nobody asked
 *   and a warning per retired type would be noise on every January run.
 * - **No `defaultAllocatedDays`.** Always warned about, whether named or not,
 *   and this is the warning the whole report exists for. A type in this state
 *   silently produces no balances, and the first anybody hears of it is an
 *   employee being told they have `0` days available — which is exactly the
 *   failure this feature was written to stop. It names the code, because HR
 *   picked "SICK_LEAVE" from a list, and says how many people it affected.
 */
function resolveAllocatableTypes(
  {
    leaveTypeIds,
    employeeCount,
  }: { leaveTypeIds?: string[]; employeeCount: number },
  policies: readonly LeaveTypeGenerationPolicy[],
  warnings: string[],
): AllocatableLeaveType[] {
  const named = leaveTypeIds !== undefined;
  const allocatable: AllocatableLeaveType[] = [];

  for (const policy of policies) {
    if (!policy.isActive) {
      if (named) {
        warnings.push(
          `Leave type ${policy.code} has been retired and was skipped`,
        );
      }

      continue;
    }

    if (policy.defaultAllocatedDays === null) {
      warnings.push(
        `Leave type ${policy.code} has no defaultAllocatedDays; ${String(employeeCount)} employee(s) were not given a balance for it`,
      );

      continue;
    }

    allocatable.push({
      id: policy.id,
      code: policy.code,
      defaultAllocatedDays: policy.defaultAllocatedDays,
      allowsCarryOver: policy.allowsCarryOver,
      maxCarryOverDays: policy.maxCarryOverDays,
    });
  }

  return allocatable;
}

/**
 * Reports each requested id that came back with nothing.
 *
 * Named per id rather than as a count, because an id is what the caller has to
 * go and fix. An employee and a leave type fail differently and say so: a type
 * either exists or does not, while an employee id may also have been dropped for
 * being `TERMINATED`, and claiming they do not exist would send somebody looking
 * for a record that is right there.
 */
function missingIdWarnings(
  { employeeIds, leaveTypeIds }: GenerateLeaveBalancesDto,
  employees: readonly EmployeeGenerationCandidate[],
  policies: readonly LeaveTypeGenerationPolicy[],
): string[] {
  const foundEmployees = new Set(employees.map(({ id }) => id));
  const foundTypes = new Set(policies.map(({ id }) => id));

  return [
    ...(employeeIds ?? [])
      .filter((id) => !foundEmployees.has(id))
      .map(
        (id) =>
          `Employee ${id} does not exist or has been terminated, and was skipped`,
      ),
    ...(leaveTypeIds ?? [])
      .filter((id) => !foundTypes.has(id))
      .map((id) => `Leave type ${id} does not exist, and was skipped`),
  ];
}

/**
 * Reports the people who were dropped for not having been hired yet.
 *
 * Aggregated into one line rather than one per person, because unlike a bad id
 * there is nothing to fix: generating 2026 for somebody who starts in 2027 is a
 * question with no sensible answer, and the count is there so a run that
 * produced fewer balances than expected explains itself.
 */
function unhiredWarning(count: number, year: number): string[] {
  if (count === 0) {
    return [];
  }

  return [
    `${String(count)} employee(s) are hired after ${String(year)} and were skipped`,
  ];
}

/** The report for a run with nothing in scope; the warnings say why. */
function emptyReport(
  dto: GenerateLeaveBalancesDto,
  warnings: string[],
): LeaveBalanceGenerationReport {
  return {
    year: dto.year,
    created: 0,
    skipped: 0,
    expiredFromPreviousYear: 0,
    expiredBalances: 0,
    dryRun: dto.dryRun === true,
    warnings,
  };
}

/**
 * The rows to insert: every (employee, type) pair that has no balance for the
 * year yet.
 *
 * `usedDays`, `carriedOverDays` and `expiredDays` are left to the schema's `0`
 * rather than stated. `carriedOverDays` in particular is deliberate and is the
 * decision most likely to be mistaken for an oversight: the days that survive a
 * year-end stay in the year they belong to, and writing them here as well would
 * count each of them twice.
 */
function planCreations(
  year: number,
  employees: readonly EmployeeGenerationCandidate[],
  types: readonly AllocatableLeaveType[],
  alreadyOpen: ReadonlySet<string>,
): Prisma.EmployeeLeaveBalanceCreateManyInput[] {
  const creations: Prisma.EmployeeLeaveBalanceCreateManyInput[] = [];

  for (const employee of employees) {
    for (const type of types) {
      if (alreadyOpen.has(pairKey(employee.id, type.id))) {
        continue;
      }

      creations.push({
        employeeId: employee.id,
        leaveTypeId: type.id,
        year,
        allocatedDays: proRatedAllocation(
          type.defaultAllocatedDays,
          employee,
          year,
        ),
      });
    }
  }

  return creations;
}

/**
 * The allocation for one person's first year, reduced to the part of it they
 * will work.
 *
 * `round(defaultAllocatedDays × monthsRemaining ÷ 12)`, counting the month of
 * hire as worked — somebody who starts on 15 July gets July. Applied only in the
 * year the person was hired; every year after that is the full entitlement.
 *
 * Rounded rather than floored, because the arithmetic is an estimate of a
 * contractual figure and rounding the estimate down would systematically
 * under-grant. HR corrects the exceptions with a `PATCH`, which is where a
 * figure that came from a contract rather than from a formula belongs.
 */
function proRatedAllocation(
  defaultAllocatedDays: number,
  { hireDate }: EmployeeGenerationCandidate,
  year: number,
): number {
  if (hireDate.getUTCFullYear() !== year) {
    return defaultAllocatedDays;
  }

  // `getUTCMonth()` is zero-based, so a July hire leaves 12 - 6 = 6 months:
  // July through December, inclusive of the month they started.
  const monthsRemaining = MONTHS_PER_YEAR - hireDate.getUTCMonth();

  return Math.round((defaultAllocatedDays * monthsRemaining) / MONTHS_PER_YEAR);
}

/**
 * What each of the previous year's balances loses to its type's carry-over
 * policy.
 *
 * `expire = remaining - min(remaining, cap)`, with the cap being `0` for a type
 * that carries nothing over and `remaining` itself for one with no ceiling. Two
 * properties of that formula are worth stating, because both are relied on
 * elsewhere:
 *
 * - **It is idempotent.** Expiring down to a cap leaves nothing above the cap,
 *   so a second run finds `remaining` already at or below it and takes nothing
 *   more. That is what lets the endpoint be re-run without a guard against
 *   having been run before.
 * - **It never runs on an overdrawn balance.** A negative remainder is skipped
 *   outright, because `remaining - keep` would otherwise be a *negative* expiry
 *   that handed days back to somebody who had already taken too many.
 *
 * A balance whose type is not in scope is skipped: this run was not asked about
 * that type, and closing a year nobody mentioned would be a write the caller did
 * not request.
 */
function planExpiries(
  previousYear: readonly {
    id: string;
    leaveTypeId: string;
    allocatedDays: number;
    carriedOverDays: number;
    usedDays: number;
    expiredDays: number;
  }[],
  types: readonly AllocatableLeaveType[],
): PlannedExpiry[] {
  const policies = new Map(types.map((type) => [type.id, type]));
  const expiries: PlannedExpiry[] = [];

  for (const balance of previousYear) {
    const policy = policies.get(balance.leaveTypeId);

    if (policy === undefined) {
      continue;
    }

    const remaining = computeRemainingDays(balance);

    if (remaining <= 0) {
      continue;
    }

    const keep = carryOverAllowance(policy, remaining);
    const days = remaining - keep;

    if (days > 0) {
      expiries.push({ id: balance.id, days });
    }
  }

  return expiries;
}

/** How much of a remainder one leave type's policy lets through a year-end. */
function carryOverAllowance(
  { allowsCarryOver, maxCarryOverDays }: AllocatableLeaveType,
  remaining: number,
): number {
  if (!allowsCarryOver) {
    return 0;
  }

  return maxCarryOverDays === null
    ? remaining
    : Math.min(remaining, maxCarryOverDays);
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
