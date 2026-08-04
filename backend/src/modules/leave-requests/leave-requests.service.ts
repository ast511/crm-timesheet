import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import { CURRENT_EMPLOYEE_HEADER } from '../../common/decorators/current-employee-id.decorator';
import { SortOrder } from '../../common/enums/sort-order.enum';
import { PaginatedResult } from '../../common/interfaces/pagination.interface';
import {
  buildPaginatedResult,
  toSkipTake,
} from '../../common/utils/pagination.util';
import type { Prisma } from '../../generated/prisma/client';
import { LeaveRequestStatus } from '../../generated/prisma/enums';
import { PrismaService } from '../../prisma/prisma.service';
import {
  EmployeeLeaveBalancesService,
  insufficientLeaveMessage,
} from '../employee-leave-balances/employee-leave-balances.service';
import { EmployeeService } from '../employees/employee.service';
import { LeaveTypesService } from '../leave-configuration/leave-types.service';
import { CreateLeaveRequestDto } from './dto/create-leave-request.dto';
import {
  LeaveRequestFilterQueryDto,
  LeaveRequestQueryDto,
  MyLeaveRequestQueryDto,
} from './dto/leave-request-query.dto';
import { UpdateLeaveRequestStatusDto } from './dto/update-leave-request-status.dto';
import { UpdateLeaveRequestDto } from './dto/update-leave-request.dto';
import {
  LEAVE_REQUEST_PUBLIC_SELECT,
  LeaveRequestEntity,
  LeaveSpan,
  MY_LEAVE_REQUEST_SELECT,
  MyLeaveRequestEntity,
  toLeaveRequestEntity,
  toMyLeaveRequestEntity,
} from './entities/leave-request.entity';
import {
  LEAVE_REQUEST_DECISIONS_REQUIRING_REASON,
  LEAVE_REQUEST_MAX_SPAN_DAYS,
  LEAVE_REQUEST_MAX_YEAR,
  LEAVE_REQUEST_MIN_YEAR,
  LeaveRequestDecision,
  LeaveRequestSortField,
  MS_PER_DAY,
  MyLeaveRequestSortField,
} from './leave-request.constants';
import { WorkingDaysService, yearsSpannedBy } from './working-days.service';

/**
 * Makes PostgreSQL fold the case of both operands, so `pop` finds `Popescu`.
 * Extracted because getting it wrong on one of the comparisons below would
 * produce a search that quietly behaves differently from the others.
 */
const CASE_INSENSITIVE = { mode: 'insensitive' } as const;

/**
 * Everything a request's rules are judged against, with both dates already
 * parsed and the replacement set already resolved.
 *
 * It exists because on `PATCH` none of these values can be read off the body
 * alone: a request that moves only `endDate` is judged against the `startDate`
 * already stored, and one that changes `leaveTypeId` changes which balance is
 * drawn on. Assembling the *resulting* request first, then judging that, is what
 * lets `create` and `update` share one set of rules instead of two spellings of
 * them — the same shape `PublicHolidayService` uses.
 */
interface LeaveRequestFacts extends LeaveSpan {
  readonly employeeId: string;
  readonly leaveTypeId: string;
  readonly replacementEmployeeIds: readonly string[];
}

/** The stored columns a `PATCH` merges its body into. */
interface StoredRequestFacts extends LeaveSpan {
  readonly id: string;
  readonly employeeId: string;
  readonly leaveTypeId: string;
  readonly status: LeaveRequestStatus;
  readonly replacementEmployeeIds: string[];
}

/**
 * Every rule about leave requests lives here; the two controllers only route.
 *
 * This is the first module in the project that *changes another module's data*
 * as a consequence of its own writes — approving a request moves
 * `employee_leave_balances.used_days` — and most of what follows is shaped by
 * that. Six decisions are worth naming:
 *
 * 1. **`requestedWorkingDays` is computed, never stored.** It depends on the
 *    work schedule, the public holidays and the span, all three of which the
 *    company keeps editing. A column would freeze an answer its own inputs could
 *    later contradict, and no reader could say which was right. Every read
 *    recomputes it — once per page, not once per row, because
 *    `WorkingDaysService` loads the calendar and then counts.
 * 2. **The state machine has exactly one transition: out of `PENDING`.** A
 *    decided request is read-only to everybody, employee and HR alike. That is
 *    not a convenience: `APPROVED` has already taken days out of a balance, so
 *    re-deciding it would either deduct twice or leave a deduction behind. It is
 *    also why `CANCELLED` never touches balances — only a request that never
 *    consumed anything can reach it.
 * 3. **Approval and the deduction are one transaction.** Either the status is
 *    written and the days come out, or neither happens. Two writes could leave
 *    somebody with approved leave nobody paid for.
 * 4. **Balances are consumed oldest year first, and never from a later year
 *    than the leave.** Both halves are `EmployeeLeaveBalancesService.consume`'s;
 *    this module supplies the year and the day count and does not touch the
 *    ledger itself, so `used_days` keeps exactly one writer.
 * 5. **Every referenced table is read through the service that owns it** —
 *    `EmployeeService`, `LeaveTypesService`, `EmployeeLeaveBalancesService`,
 *    `WorkScheduleService` and `PublicHolidayService` (the last two through
 *    `WorkingDaysService`). Only `leave_requests` and its replacements are
 *    queried directly here.
 * 6. **Nothing here authenticates or authorises.** The `/me` endpoints trust the
 *    `x-employee-id` header and the HR endpoints check nothing at all, which is
 *    the honest shape of an API whose auth feature has not been written — half
 *    an access check reads as protection while providing none. What the `/me`
 *    methods *do* enforce is ownership: a request belonging to somebody else is
 *    a `404`, not a `403`, so the endpoint cannot be used to discover that a
 *    request exists.
 */
@Injectable()
export class LeaveRequestsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly employees: EmployeeService,
    private readonly leaveTypes: LeaveTypesService,
    private readonly balances: EmployeeLeaveBalancesService,
    private readonly workingDays: WorkingDaysService,
  ) {}

  // ---------------------------------------------------------------------------
  // Employee endpoints — `/api/v1/me/leave-requests`
  // ---------------------------------------------------------------------------

  /**
   * One page of the caller's own requests.
   *
   * The employee is confirmed first, so an unknown `x-employee-id` is a `404`
   * naming them rather than an empty page that looks like "you have taken no
   * leave" — the same thing a scoped URL buys over the filter it replaces.
   *
   * The rows and the total are read in a single `$transaction` so both see the
   * same snapshot: run separately, a concurrent insert between them would
   * produce a `total` that does not describe the page just returned.
   */
  async findOwn(
    employeeId: string,
    query: MyLeaveRequestQueryDto,
  ): Promise<PaginatedResult<MyLeaveRequestEntity>> {
    await this.assertEmployeeExists(employeeId);

    const where: Prisma.LeaveRequestWhereInput = {
      AND: [{ employeeId }, ...buildFilters(query)],
    };

    const [requests, total] = await this.prisma.$transaction([
      this.prisma.leaveRequest.findMany({
        where,
        orderBy: buildOwnOrderBy(query.sortBy, query.sortOrder),
        select: MY_LEAVE_REQUEST_SELECT,
        ...toSkipTake(query),
      }),
      this.prisma.leaveRequest.count({ where }),
    ]);

    return buildPaginatedResult(
      await this.withWorkingDays(requests, toMyLeaveRequestEntity),
      total,
      query,
    );
  }

  /**
   * One of the caller's own requests.
   *
   * A request belonging to somebody else answers the same `404` as one that does
   * not exist. That is deliberate: distinguishing them would make this endpoint
   * a way to confirm that a colleague has leave pending, which is the one thing a
   * `/me` route must not leak.
   */
  async findOwnOne(
    employeeId: string,
    id: string,
  ): Promise<MyLeaveRequestEntity> {
    const request = await this.prisma.leaveRequest.findFirst({
      where: { id, employeeId },
      select: MY_LEAVE_REQUEST_SELECT,
    });

    if (request === null) {
      throw new NotFoundException(notFoundMessage(id));
    }

    return this.toEntityWithWorkingDays(request, toMyLeaveRequestEntity);
  }

  /**
   * Files a request, and — if its leave type needs no approval — grants it in
   * the same breath.
   *
   * The order of the checks is the escalation the API promises: a body that
   * contradicts itself or points at rows that are not there is a `400`, a
   * request that clashes with leave already approved is a `409`, and only a
   * request that is sound in every other way is finally weighed against the
   * balance.
   *
   * **Automatic approval** — `LeaveType.requiresApproval = false` — writes
   * `APPROVED` and consumes the days immediately, inside the same transaction
   * that creates the request. `processedAt` is set because the decision happened
   * at a moment; `processedById` stays `null` because no person made it, and
   * those two columns together are the only way to tell an automatic approval
   * from a human one afterwards.
   *
   * **Manual approval** — the default — writes `PENDING` and touches no balance.
   * The balance is still *checked*, and that is not redundant: refusing a
   * request for insufficient leave the moment it is filed is far more useful
   * than refusing it a fortnight later when HR clicks approve. The check is made
   * again inside the approving transaction, against a snapshot that may have
   * moved.
   */
  async createOwn(
    employeeId: string,
    dto: CreateLeaveRequestDto,
  ): Promise<MyLeaveRequestEntity> {
    await this.assertEmployeeExists(employeeId);

    const facts: LeaveRequestFacts = {
      employeeId,
      leaveTypeId: dto.leaveTypeId,
      startDate: new Date(dto.startDate),
      endDate: new Date(dto.endDate),
      replacementEmployeeIds: dto.replacementEmployeeIds,
    };

    const policy = await this.assertRequestIsValid(facts);
    const requestedDays = await this.countAndAssertWorkingDays(facts);

    await this.assertBalanceCovers(facts, requestedDays);

    const approvedOnCreation = !policy.requiresApproval;

    const created = await this.prisma.$transaction(async (tx) => {
      const request = await tx.leaveRequest.create({
        data: {
          employeeId,
          leaveTypeId: facts.leaveTypeId,
          startDate: facts.startDate,
          endDate: facts.endDate,
          reason: dto.reason,
          status: approvedOnCreation
            ? LeaveRequestStatus.APPROVED
            : LeaveRequestStatus.PENDING,
          // Set for an automatic approval and left null for a pending request.
          // `processedById` stays null in both cases: nobody decided.
          processedAt: approvedOnCreation ? new Date() : null,
          replacements: {
            create: facts.replacementEmployeeIds.map((id) => ({
              employeeId: id,
            })),
          },
        },
        select: MY_LEAVE_REQUEST_SELECT,
      });

      if (approvedOnCreation) {
        await this.consume(facts, requestedDays, tx);
      }

      return request;
    });

    return this.toEntityWithWorkingDays(created, toMyLeaveRequestEntity);
  }

  /**
   * Edits one of the caller's own requests, while it is still `PENDING`.
   *
   * Every rule is re-checked against the request the patch would *leave behind*,
   * not against the fields the body happens to carry: `PATCH { endDate }` is
   * judged against the stored `startDate`, the working days are recounted, and
   * the balance is re-tested against the new total.
   *
   * No balance is touched, and none needs to be. A `PENDING` request has
   * consumed nothing — that is what `PENDING` means here — so there is no
   * deduction to reverse and no ordering problem to get wrong. It is the whole
   * reason editing is confined to this state.
   *
   * The replacement set is replaced wholesale when the body carries one, and
   * left alone when it does not. Deleting and re-creating the rows rather than
   * diffing them is deliberate: the table has no surrogate key, the set is at
   * most a handful of rows, and a diff would be three code paths where this is
   * one.
   */
  async updateOwn(
    employeeId: string,
    id: string,
    dto: UpdateLeaveRequestDto,
  ): Promise<MyLeaveRequestEntity> {
    const current = await this.findOwnOrThrow(employeeId, id);

    assertStillPending(current.status, 'edited');

    const facts: LeaveRequestFacts = {
      employeeId,
      leaveTypeId: dto.leaveTypeId ?? current.leaveTypeId,
      startDate:
        dto.startDate === undefined
          ? current.startDate
          : new Date(dto.startDate),
      endDate:
        dto.endDate === undefined ? current.endDate : new Date(dto.endDate),
      replacementEmployeeIds:
        dto.replacementEmployeeIds ?? current.replacementEmployeeIds,
    };

    await this.assertRequestIsValid(facts, id);

    const requestedDays = await this.countAndAssertWorkingDays(facts);

    await this.assertBalanceCovers(facts, requestedDays);

    const updated = await this.prisma.$transaction(async (tx) => {
      if (dto.replacementEmployeeIds !== undefined) {
        await tx.leaveRequestReplacement.deleteMany({
          where: { leaveRequestId: id },
        });
        await tx.leaveRequestReplacement.createMany({
          data: dto.replacementEmployeeIds.map((employee) => ({
            leaveRequestId: id,
            employeeId: employee,
          })),
        });
      }

      return tx.leaveRequest.update({
        where: { id },
        // `undefined` is omitted from the UPDATE by Prisma, so an absent field
        // is left alone while an explicit `null` clears the nullable `reason`.
        data: {
          leaveTypeId: dto.leaveTypeId,
          startDate: dto.startDate === undefined ? undefined : facts.startDate,
          endDate: dto.endDate === undefined ? undefined : facts.endDate,
          reason: dto.reason,
        },
        select: MY_LEAVE_REQUEST_SELECT,
      });
    });

    return this.toEntityWithWorkingDays(updated, toMyLeaveRequestEntity);
  }

  /**
   * Withdraws one of the caller's own requests, while it is still `PENDING`.
   *
   * A hard delete, as the feature specifies, and it is safe for exactly the
   * reason editing is: a `PENDING` request has consumed nothing, so removing it
   * rewrites no balance and leaves no days unaccounted for.
   *
   * The replacements go with it, by the `ON DELETE CASCADE` on their foreign key
   * — the only cascade in this schema. A nomination says nothing once the
   * request it belongs to is gone.
   *
   * A request that has been decided is a `409` rather than a delete, and that is
   * the difference between withdrawing something nobody has acted on and erasing
   * a decision somebody took. Erasing an approved absence would leave its
   * deduction in the balance with nothing to explain it.
   */
  async removeOwn(employeeId: string, id: string): Promise<void> {
    const current = await this.findOwnOrThrow(employeeId, id);

    assertStillPending(current.status, 'deleted');

    await this.prisma.leaveRequest.delete({ where: { id } });
  }

  // ---------------------------------------------------------------------------
  // HR/Admin endpoints — `/api/v1/leave-requests`
  // ---------------------------------------------------------------------------

  /**
   * One page of everybody's requests, narrowed by `search` and the five filters.
   *
   * Defaults to the current year, which `LeaveRequestQueryDto` supplies as a
   * property initialiser rather than this method as a fallback — so the value is
   * visible in the DTO alongside the rule it bends, and the service never has
   * two sources for one parameter.
   */
  async findAll(
    query: LeaveRequestQueryDto,
  ): Promise<PaginatedResult<LeaveRequestEntity>> {
    const where = buildWhere(query);

    const [requests, total] = await this.prisma.$transaction([
      this.prisma.leaveRequest.findMany({
        where,
        orderBy: buildOrderBy(query.sortBy, query.sortOrder),
        select: LEAVE_REQUEST_PUBLIC_SELECT,
        ...toSkipTake(query),
      }),
      this.prisma.leaveRequest.count({ where }),
    ]);

    return buildPaginatedResult(
      await this.withWorkingDays(requests, toLeaveRequestEntity),
      total,
      query,
    );
  }

  async findOne(id: string): Promise<LeaveRequestEntity> {
    const request = await this.prisma.leaveRequest.findUnique({
      where: { id },
      select: LEAVE_REQUEST_PUBLIC_SELECT,
    });

    if (request === null) {
      throw new NotFoundException(notFoundMessage(id));
    }

    return this.toEntityWithWorkingDays(request, toLeaveRequestEntity);
  }

  /**
   * Records HR's decision, and moves the balance when that decision is
   * `APPROVED`.
   *
   * The one method in this project that writes two modules' tables in one
   * transaction on purpose, and the four rules it keeps:
   *
   * - **Only a `PENDING` request can be decided.** A second decision is a `409`
   *   naming the status the request already holds. Without it, approving twice
   *   would deduct twice, and cancelling an approval would leave the first
   *   deduction behind with nothing to explain it — which is exactly why
   *   `REJECTED` and `CANCELLED` can promise never to touch a balance.
   * - **`REJECTED` and `CANCELLED` move nothing.** There is no branch here that
   *   writes a balance for either, which is a stronger statement than a
   *   comment: the deduction happens in one place, under one condition.
   * - **`APPROVED` re-checks the overlap and the balance.** Time passed between
   *   the request being filed and this call, and another approval may have
   *   consumed the same days or claimed the same dates. Checking again against
   *   the transaction's own snapshot is what makes the earlier check an early
   *   warning rather than the guarantee.
   * - **The days are recounted, not remembered.** The company calendar may have
   *   changed since the request was filed — a public holiday corrected, a
   *   working day added — and the deduction should reflect the calendar as it
   *   is, which is the same argument for not storing the count in the first
   *   place.
   *
   * The decider comes from the `x-employee-id` header rather than the body, so a
   * client cannot sign somebody else's name to a decision, and `processedAt`
   * comes from this transaction rather than from the client's clock.
   */
  async decide(
    processedById: string,
    id: string,
    dto: UpdateLeaveRequestStatusDto,
  ): Promise<LeaveRequestEntity> {
    await this.assertProcessorExists(processedById);

    const current = await this.findWithReplacementsOrThrow(id);

    assertStillPending(current.status, 'decided on');
    assertDecisionReasonMatches(dto);

    const facts: LeaveRequestFacts = {
      employeeId: current.employeeId,
      leaveTypeId: current.leaveTypeId,
      startDate: current.startDate,
      endDate: current.endDate,
      replacementEmployeeIds: current.replacementEmployeeIds,
    };

    const approving = dto.status === LeaveRequestStatus.APPROVED;

    if (approving) {
      await this.assertNoApprovedOverlap(facts, id);
    }

    const requestedDays = approving ? await this.countWorkingDays(facts) : 0;

    const decided = await this.prisma.$transaction(async (tx) => {
      const request = await tx.leaveRequest.update({
        where: { id },
        data: {
          status: dto.status,
          processedById,
          processedAt: new Date(),
          decisionReason: dto.decisionReason ?? null,
        },
        select: LEAVE_REQUEST_PUBLIC_SELECT,
      });

      if (approving) {
        await this.consume(facts, requestedDays, tx);
      }

      return request;
    });

    return this.toEntityWithWorkingDays(decided, toLeaveRequestEntity);
  }

  // ---------------------------------------------------------------------------
  // Shared rules
  // ---------------------------------------------------------------------------

  /**
   * Every rule that does not need the day count, applied to the request a write
   * would leave behind.
   *
   * Shared by `createOwn` and `updateOwn` so the two cannot drift into enforcing
   * different things — a patch that moves a span has to be judged exactly as
   * harshly as the request that first stated it.
   *
   * Returns the leave type's policy, because the caller needs
   * `requiresApproval` immediately afterwards and re-reading it would be a
   * second round trip for a fact this method has already fetched.
   *
   * `excludeRequestId` is the request being patched, which must not conflict
   * with itself.
   */
  private async assertRequestIsValid(
    facts: LeaveRequestFacts,
    excludeRequestId?: string,
  ): Promise<{ requiresApproval: boolean }> {
    assertOrderedSpan(facts);
    assertSpanIsBounded(facts);
    assertYearsAreInRange(facts);

    const policy = await this.assertLeaveTypeAccepts(facts.leaveTypeId);

    await this.assertReplacementsAreAvailable(facts, excludeRequestId);
    await this.assertNoApprovedOverlap(facts, excludeRequestId);

    return policy;
  }

  /**
   * Rejects a leave type that is missing or retired.
   *
   * Two different answers for two different problems, both `400`: a missing type
   * is a body naming something that is not there, and an inactive one is a body
   * naming something real that no longer accepts requests. Neither is a `404` —
   * the resource being addressed is fine, it is the submitted body that is
   * wrong.
   *
   * The `isActive` check is what makes retiring a type mean anything. Feature
   * 021 made it a flag rather than a delete so leave already recorded against a
   * retired type keeps its meaning; refusing *new* requests is the other half of
   * that, and until this feature nothing enforced it.
   */
  private async assertLeaveTypeAccepts(
    leaveTypeId: string,
  ): Promise<{ requiresApproval: boolean }> {
    const policy = await this.leaveTypes.findPolicy(leaveTypeId);

    if (policy === null) {
      throw new BadRequestException([
        `Leave type ${leaveTypeId} does not exist`,
      ]);
    }

    if (!policy.isActive) {
      throw new BadRequestException([
        `Leave type ${leaveTypeId} has been retired and no longer accepts requests`,
      ]);
    }

    return policy;
  }

  /**
   * Rejects a replacement set that cannot cover the absence.
   *
   * Three rules, and each of them fails for a different reason:
   *
   * - **Nobody may replace themselves.** A person who is away is not covering
   *   their own work, and accepting it would let a request satisfy the
   *   "at least one replacement" rule while nominating nobody at all.
   * - **Every replacement must exist.** A `400` naming each missing id rather
   *   than a foreign-key violation surfacing as a `500`.
   * - **No replacement may already be on approved leave over the same days.**
   *   Cover that is itself away is not cover. Only `APPROVED` leave counts: a
   *   colleague's `PENDING` request may yet be refused, and blocking on it would
   *   let an unanswered request veto somebody else's.
   *
   * All three are reported at once, as an array — the same shape the
   * `ValidationPipe` produces — so a form can mark every offending name instead
   * of surfacing the second problem only after the first is fixed. The
   * replacements are named by employee code and surname rather than by id,
   * because the person reading the message chose them from a list of names.
   *
   * The two queries run concurrently: they are independent, and a request with
   * several replacements would otherwise pay for them in series.
   */
  private async assertReplacementsAreAvailable(
    facts: LeaveRequestFacts,
    excludeRequestId?: string,
  ): Promise<void> {
    const replacementIds = [...facts.replacementEmployeeIds];

    if (replacementIds.includes(facts.employeeId)) {
      throw new BadRequestException([
        'replacementEmployeeIds must not contain the requesting employee',
      ]);
    }

    const [known, busy] = await Promise.all([
      this.prisma.employee.findMany({
        where: { id: { in: replacementIds } },
        select: { id: true },
      }),
      this.prisma.leaveRequest.findMany({
        where: {
          employeeId: { in: replacementIds },
          status: LeaveRequestStatus.APPROVED,
          ...overlapFilter(facts),
          ...(excludeRequestId === undefined
            ? {}
            : { NOT: { id: excludeRequestId } }),
        },
        select: {
          startDate: true,
          endDate: true,
          employee: {
            select: { employeeCode: true, firstName: true, lastName: true },
          },
        },
      }),
    ]);

    const knownIds = new Set(known.map(({ id }) => id));
    const problems = replacementIds
      .filter((id) => !knownIds.has(id))
      .map((id) => `Replacement employee ${id} does not exist`);

    for (const conflict of busy) {
      problems.push(
        `Replacement ${describeEmployee(conflict.employee)} is already on approved leave from ${toIsoDate(conflict.startDate)} to ${toIsoDate(conflict.endDate)}`,
      );
    }

    if (problems.length > 0) {
      throw new BadRequestException(problems);
    }
  }

  /**
   * Rejects a request that overlaps leave the same person has already had
   * approved.
   *
   * A `409` rather than a `400`: the submitted body is perfectly well formed,
   * it conflicts with something already in the database — which is the
   * distinction every other module in this project draws between the two codes.
   *
   * Only `APPROVED` requests block. Two `PENDING` requests over the same days
   * are not yet a contradiction — HR will approve one and refuse the other — and
   * refusing the second at filing time would make the first one's mere existence
   * a decision nobody took.
   *
   * `excludeRequestId` is the request being patched or approved, which of course
   * overlaps itself.
   */
  private async assertNoApprovedOverlap(
    facts: LeaveRequestFacts,
    excludeRequestId?: string,
  ): Promise<void> {
    const conflict = await this.prisma.leaveRequest.findFirst({
      where: {
        employeeId: facts.employeeId,
        status: LeaveRequestStatus.APPROVED,
        ...overlapFilter(facts),
        ...(excludeRequestId === undefined
          ? {}
          : { NOT: { id: excludeRequestId } }),
      },
      select: { id: true, startDate: true, endDate: true },
    });

    if (conflict !== null) {
      throw new ConflictException(
        `This period overlaps approved leave request ${conflict.id}, from ${toIsoDate(conflict.startDate)} to ${toIsoDate(conflict.endDate)}`,
      );
    }
  }

  /**
   * The working days in a span, and a `400` when there are none.
   *
   * A request covering only weekends and public holidays consumes nothing and
   * grants nothing — the person was already not working those days. Storing it
   * would put a row in the ledger that deducts zero and means zero, and would
   * let somebody "book" a bank holiday. The message names the reason rather than
   * only the rule, because the caller's mistake is almost always a date they
   * picked without looking at the calendar.
   */
  private async countAndAssertWorkingDays(
    facts: LeaveRequestFacts,
  ): Promise<number> {
    const requestedDays = await this.countWorkingDays(facts);

    if (requestedDays === 0) {
      throw new BadRequestException([
        'The requested period contains no working days: every day in it is a non-working weekday or a public holiday',
      ]);
    }

    return requestedDays;
  }

  /** The working days in one span, against the company calendar. */
  private async countWorkingDays(span: LeaveSpan): Promise<number> {
    const calculator = await this.workingDays.createCalculator(
      yearsSpannedBy([span]),
    );

    return calculator.countBetween(span.startDate, span.endDate);
  }

  /**
   * Rejects a request the employee cannot pay for.
   *
   * Run before the request is written, whether or not it will be approved
   * straight away, because "you do not have enough leave" is an answer somebody
   * needs while they are still choosing dates — not a fortnight later when HR
   * opens it. For a request that *will* be approved on creation this is the same
   * check `consume` makes moments later inside the transaction; the duplication
   * is deliberate, since only the one inside the transaction is a guarantee and
   * only this one is timely.
   */
  private async assertBalanceCovers(
    facts: LeaveRequestFacts,
    requestedDays: number,
  ): Promise<void> {
    const available = await this.balances.countAvailableDays(
      toConsumptionScope(facts),
    );

    if (available < requestedDays) {
      throw new BadRequestException([
        insufficientLeaveMessage(available, requestedDays),
      ]);
    }
  }

  /** Moves the days out of the balances, oldest year first. */
  private async consume(
    facts: LeaveRequestFacts,
    requestedDays: number,
    tx: Prisma.TransactionClient,
  ): Promise<void> {
    await this.balances.consume(toConsumptionScope(facts), requestedDays, tx);
  }

  /**
   * Confirms the caller is somebody, or reports them missing.
   *
   * A `404`, because on a `/me` route the caller *is* the resource: an unknown
   * `x-employee-id` means the collection being addressed does not exist, which
   * is not the same as it being empty.
   */
  private async assertEmployeeExists(employeeId: string): Promise<void> {
    const status = await this.employees.findStatus(employeeId);

    if (status === null) {
      throw new NotFoundException(`Employee ${employeeId} was not found`);
    }
  }

  /**
   * Confirms whoever is deciding exists.
   *
   * A `400` naming the header rather than the `404` its `/me` counterpart
   * throws, and the difference matters on this route: a `404` on
   * `PATCH /leave-requests/:id/status` would be indistinguishable from "no such
   * request", sending the caller to look at the wrong thing.
   */
  private async assertProcessorExists(processedById: string): Promise<void> {
    const status = await this.employees.findStatus(processedById);

    if (status === null) {
      throw new BadRequestException([
        `${CURRENT_EMPLOYEE_HEADER} names employee ${processedById}, who does not exist`,
      ]);
    }
  }

  /** Loads one of the caller's own requests, with what a patch needs to merge. */
  private async findOwnOrThrow(
    employeeId: string,
    id: string,
  ): Promise<StoredRequestFacts> {
    const request = await this.prisma.leaveRequest.findFirst({
      where: { id, employeeId },
      select: STORED_FACTS_SELECT,
    });

    if (request === null) {
      throw new NotFoundException(notFoundMessage(id));
    }

    return toStoredFacts(request);
  }

  /** The same, addressed by id alone, for the HR decision endpoint. */
  private async findWithReplacementsOrThrow(
    id: string,
  ): Promise<StoredRequestFacts> {
    const request = await this.prisma.leaveRequest.findUnique({
      where: { id },
      select: STORED_FACTS_SELECT,
    });

    if (request === null) {
      throw new NotFoundException(notFoundMessage(id));
    }

    return toStoredFacts(request);
  }

  /**
   * Maps a page of rows, counting every span against **one** company calendar.
   *
   * This is the shape that keeps `requestedWorkingDays` affordable. The years
   * the page touches are collected first, the schedule and the holidays are read
   * once for all of them, and every row is then counted by arithmetic. A count
   * per row would be two queries per row.
   *
   * An empty page short-circuits, which also means a list endpoint answers
   * normally on a system whose work schedule has not been configured yet:
   * there is nothing to count, so there is nothing to ask the schedule about.
   */
  private async withWorkingDays<TRow extends LeaveSpan, TEntity>(
    rows: readonly TRow[],
    toEntity: (row: TRow, requestedWorkingDays: number) => TEntity,
  ): Promise<TEntity[]> {
    if (rows.length === 0) {
      return [];
    }

    const calculator = await this.workingDays.createCalculator(
      yearsSpannedBy(rows),
    );

    return rows.map((row) =>
      toEntity(row, calculator.countBetween(row.startDate, row.endDate)),
    );
  }

  /** The single-row case of {@link withWorkingDays}. */
  private async toEntityWithWorkingDays<TRow extends LeaveSpan, TEntity>(
    row: TRow,
    toEntity: (row: TRow, requestedWorkingDays: number) => TEntity,
  ): Promise<TEntity> {
    const [entity] = await this.withWorkingDays([row], toEntity);

    return entity;
  }
}

/**
 * The columns a merge and a decision need — the stored request, without the
 * presentation fields.
 *
 * Separate from the two public selects because it answers a different question:
 * those describe what a client is shown, this describes what a rule is judged
 * against. Reading the public select here would drag four joins into a check
 * that needs five scalars and a list of ids.
 */
const STORED_FACTS_SELECT = {
  id: true,
  employeeId: true,
  leaveTypeId: true,
  startDate: true,
  endDate: true,
  status: true,
  replacements: { select: { employeeId: true } },
} as const satisfies Prisma.LeaveRequestSelect;

/** Flattens the replacement rows into the id list every rule works with. */
function toStoredFacts(request: {
  id: string;
  employeeId: string;
  leaveTypeId: string;
  startDate: Date;
  endDate: Date;
  status: LeaveRequestStatus;
  replacements: { employeeId: string }[];
}): StoredRequestFacts {
  return {
    id: request.id,
    employeeId: request.employeeId,
    leaveTypeId: request.leaveTypeId,
    startDate: request.startDate,
    endDate: request.endDate,
    status: request.status,
    replacementEmployeeIds: request.replacements.map(
      ({ employeeId }) => employeeId,
    ),
  };
}

/** Message used for every 404 path, so they cannot drift apart. */
function notFoundMessage(id: string): string {
  return `Leave request ${id} was not found`;
}

/**
 * The scope a request draws its balance from.
 *
 * `upToYear` is the year the absence **ends** in, which is the decision that
 * keeps a request from spending next year's entitlement. A leave running from
 * December into January may draw on the new year, because the January days
 * genuinely belong to it; a leave wholly inside 2026 may not touch the 2027
 * allocation HR has already entered, however empty 2026 has become.
 */
function toConsumptionScope({
  employeeId,
  leaveTypeId,
  endDate,
}: LeaveRequestFacts): {
  employeeId: string;
  leaveTypeId: string;
  upToYear: number;
} {
  return { employeeId, leaveTypeId, upToYear: endDate.getUTCFullYear() };
}

/**
 * The `WHERE` fragment that finds requests touching a span.
 *
 * Two comparisons, both inclusive, and the pair is the whole overlap rule: two
 * spans intersect when each begins on or before the other ends. Written once
 * because the requester's own overlap check and the replacements' availability
 * check are the same question asked of different people, and two spellings of it
 * would eventually disagree about the boundary — a request starting on the day
 * another ends is an overlap, since both ends are inclusive.
 */
function overlapFilter({
  startDate,
  endDate,
}: LeaveSpan): Prisma.LeaveRequestWhereInput {
  return { startDate: { lte: endDate }, endDate: { gte: startDate } };
}

/**
 * Rejects a request that ends before it starts.
 *
 * The comparison is `<`, so a one-day absence — where both ends are the same
 * date — is allowed: `endDate === startDate` is not "before".
 *
 * A `400` rather than a `409`: nothing in the database conflicts with this
 * request, the submitted span simply contradicts itself. The message is an
 * array, the same shape the `ValidationPipe` produces, so a form handles it with
 * the code it already has for field errors.
 */
function assertOrderedSpan({ startDate, endDate }: LeaveSpan): void {
  if (endDate.getTime() < startDate.getTime()) {
    throw new BadRequestException(['endDate must not be before startDate']);
  }
}

/**
 * Rejects a span longer than a year.
 *
 * Leave is granted and budgeted per calendar year everywhere this company
 * operates, so an absence longer than that is a mistyped date rather than a
 * request somebody meant to file. It is also what keeps the day-by-day walk in
 * `WorkingDaysService` bounded: no caller can make the loop run longer than this.
 */
function assertSpanIsBounded({ startDate, endDate }: LeaveSpan): void {
  const days =
    Math.round((endDate.getTime() - startDate.getTime()) / MS_PER_DAY) + 1;

  if (days > LEAVE_REQUEST_MAX_SPAN_DAYS) {
    throw new BadRequestException([
      `The requested period must not exceed ${String(LEAVE_REQUEST_MAX_SPAN_DAYS)} days`,
    ]);
  }
}

/**
 * Rejects a span in a year no balance could exist for.
 *
 * The same bounds `?year=` and the leave balances use, applied to the dates
 * themselves so `0206-09-07` — a plausible slip for `2026-09-07` — is a `400`
 * naming the field rather than a request nobody can ever find and a balance
 * lookup that silently returns nothing.
 */
function assertYearsAreInRange({ startDate, endDate }: LeaveSpan): void {
  for (const date of [startDate, endDate]) {
    const year = date.getUTCFullYear();

    if (year < LEAVE_REQUEST_MIN_YEAR || year > LEAVE_REQUEST_MAX_YEAR) {
      throw new BadRequestException([
        `Dates must fall between ${String(LEAVE_REQUEST_MIN_YEAR)} and ${String(LEAVE_REQUEST_MAX_YEAR)}`,
      ]);
    }
  }
}

/**
 * Rejects any write to a request that has already been decided.
 *
 * One function for all three callers — edit, delete and decide — because the
 * rule is genuinely the same one, and the `action` argument is only there so the
 * message says what the caller was trying to do. Three copies would have been
 * three chances to allow one of them by accident, and the whole balance story
 * rests on this: a decided request never changes, so an approval's deduction can
 * never be duplicated or orphaned.
 *
 * A `409` rather than a `403`: this is not about who is asking, it is about the
 * state the request is in. Nobody may edit an approved request, including the
 * administrator who approved it.
 */
function assertStillPending(status: LeaveRequestStatus, action: string): void {
  if (status !== LeaveRequestStatus.PENDING) {
    throw new ConflictException(
      `A leave request can only be ${action} while it is PENDING; this one is ${status}`,
    );
  }
}

/**
 * Rejects a decision whose explanation does not match it.
 *
 * Both directions are enforced, and the second is the less obvious one:
 *
 * - `REJECTED` and `CANCELLED` **require** a reason, because "no" without one is
 *   not an answer the employee can act on — they cannot tell whether to shorten
 *   the request, move it, or go and talk to somebody.
 * - `APPROVED` **refuses** one. A stored explanation on a granted request would
 *   be read as a caveat, and nothing in the API would say whether the leave was
 *   conditional.
 *
 * The check lives here rather than on the DTO because it is a rule about two
 * fields at once, judged against the resolved status — the same call
 * `WorkScheduleService` makes for its entry bounds.
 */
function assertDecisionReasonMatches({
  status,
  decisionReason,
}: {
  status: LeaveRequestDecision;
  decisionReason?: string | null;
}): void {
  const required = LEAVE_REQUEST_DECISIONS_REQUIRING_REASON.includes(status);
  const given = decisionReason !== undefined && decisionReason !== null;

  if (required && !given) {
    throw new BadRequestException([
      `decisionReason is required when the status is ${status}`,
    ]);
  }

  if (!required && given) {
    throw new BadRequestException([
      `decisionReason must not be sent when the status is ${status}`,
    ]);
  }
}

/**
 * Builds the filters both list endpoints share.
 *
 * Returned as an array rather than an object so `findOwn` can prepend its own
 * mandatory scope with `AND` and `findAll` can append its three, without either
 * having to reason about how the other's conditions nest.
 */
function buildFilters({
  year,
  leaveTypeId,
  status,
}: LeaveRequestFilterQueryDto): Prisma.LeaveRequestWhereInput[] {
  const filters: Prisma.LeaveRequestWhereInput[] = [];

  if (year !== undefined) {
    // Matched against the year the absence *begins* in, and as a half-open
    // range in UTC — so the last instant of 31 December is included without the
    // query naming it, and a request spanning New Year is counted once, under
    // the year it started. The same call `PublicHolidayService` makes.
    filters.push({
      startDate: {
        gte: new Date(Date.UTC(year, 0, 1)),
        lt: new Date(Date.UTC(year + 1, 0, 1)),
      },
    });
  }

  if (leaveTypeId !== undefined) {
    filters.push({ leaveTypeId });
  }

  if (status !== undefined) {
    filters.push({ status });
  }

  return filters;
}

/**
 * Builds the `WHERE` for the HR list.
 *
 * The parameters are independent and combine with `AND`: `?status=PENDING`
 * narrows whatever `?search=` matched rather than replacing it. Returns
 * `undefined` — not an empty object — when nothing was requested, because
 * `undefined` is what `findMany` and `count` both read as "no filter", and the
 * two must agree or the total would not describe the page. In practice `year`
 * always has a value here, so the `undefined` branch is reached only if that
 * default is ever removed; it is written anyway so the two lists share one
 * shape.
 *
 * `search` and `departmentId` both reach through the `employee` relation, since
 * neither the person's name nor their department is a column of this table.
 * Prisma renders each as a correlated condition on the joined row; they are
 * written as two separate `employee` filters rather than one merged object so
 * that adding a third never has to reason about how the others nest.
 */
function buildWhere(
  query: LeaveRequestQueryDto,
): Prisma.LeaveRequestWhereInput | undefined {
  const filters = buildFilters(query);
  const { search, departmentId, employeeId } = query;

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

  if (departmentId !== undefined) {
    filters.push({ employee: { departmentId } });
  }

  if (employeeId !== undefined) {
    filters.push({ employeeId });
  }

  return filters.length === 0 ? undefined : { AND: filters };
}

/**
 * Orders an employee's own requests by the requested column, then by `id`.
 *
 * The tie-break on `id` is what makes pagination safe: none of the sortable
 * values is unique — a status, and even a start date, are shared by many rows —
 * so without it a record could repeat on one page and vanish from the next.
 */
function buildOwnOrderBy(
  sortBy: MyLeaveRequestSortField,
  sortOrder: SortOrder,
): Prisma.LeaveRequestOrderByWithRelationInput[] {
  return [{ [sortBy]: sortOrder }, { id: SortOrder.ASC }];
}

/**
 * The same, plus the one value that is not a column of this table.
 *
 * `employee` becomes the related employee's surname and then given name, which
 * is what a person means by "sort by employee" — `employeeId` would sort by
 * cuid, which is to say by nothing. Prisma expresses this as an ordering on a
 * to-one relation, so it stays a single query.
 */
function buildOrderBy(
  sortBy: LeaveRequestSortField,
  sortOrder: SortOrder,
): Prisma.LeaveRequestOrderByWithRelationInput[] {
  if (sortBy === 'employee') {
    return [
      { employee: { lastName: sortOrder } },
      { employee: { firstName: sortOrder } },
      { id: SortOrder.ASC },
    ];
  }

  return buildOwnOrderBy(sortBy, sortOrder);
}

/** `EMP-0007 (Popescu Ion)` — how a person is named in an error message. */
function describeEmployee({
  employeeCode,
  firstName,
  lastName,
}: {
  employeeCode: string;
  firstName: string;
  lastName: string;
}): string {
  return `${employeeCode} (${lastName} ${firstName})`;
}

/** `2026-09-07` — the UTC calendar date, without the time nobody entered. */
function toIsoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}
