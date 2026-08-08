import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';

import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { SortOrder } from '../../common/enums/sort-order.enum';
import { PaginatedResult } from '../../common/interfaces/pagination.interface';
import { toDateKey } from '../../common/utils/date.util';
import {
  buildPaginatedResult,
  toSkipTake,
} from '../../common/utils/pagination.util';
import type { Prisma } from '../../generated/prisma/client';
import {
  TimesheetEntryType,
  TimesheetStatus,
} from '../../generated/prisma/enums';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateTimesheetDto } from './dto/create-timesheet.dto';
import { RejectTimesheetDto } from './dto/reject-timesheet.dto';
import { SetTimesheetEntriesDto } from './dto/set-timesheet-entries.dto';
import {
  MyTimesheetQueryDto,
  TimesheetQueryDto,
} from './dto/timesheet-query.dto';
import {
  TIMESHEET_LIST_SELECT,
  TimesheetListRowEntity,
  toTimesheetListRowEntity,
} from './entities/timesheet-list-row.entity';
import {
  NO_HOURS,
  TIMESHEET_DETAIL_SELECT,
  TimesheetEntity,
  TimesheetHours,
  TimesheetHoursByTimesheet,
  toTimesheetEntity,
} from './entities/timesheet.entity';
import {
  MonthPlan,
  PreparedEntry,
  TimesheetFillService,
} from './timesheet-fill.service';
import {
  ADMIN_VISIBLE_TIMESHEET_STATUSES,
  EDITABLE_TIMESHEET_STATUSES,
  REVIEWABLE_TIMESHEET_STATUS,
  STALENESS_CHECKED_STATUSES,
  SUBMITTABLE_TIMESHEET_STATUSES,
  TimesheetSortField,
  UNDELETABLE_TIMESHEET_STATUS,
} from './timesheet-management.constants';
import {
  NotFoundTimesheet,
  assertAdminVisible,
  assertAdministrative,
  assertMonthIsFillable,
  assertNotApproved,
  assertOwner,
  assertRejectionReasonGiven,
  assertStatusIs,
  describePeriod,
} from './timesheet-management.rules';
import {
  StaleReason,
  TimesheetNotificationService,
  TimesheetSubject,
} from './timesheet-notification.service';

/**
 * Makes PostgreSQL fold the case of both operands, so `pop` finds `Popescu`.
 * Extracted because getting it wrong on one of the comparisons below would
 * produce a search that quietly behaves differently from the others.
 */
const CASE_INSENSITIVE = { mode: 'insensitive' } as const;

/** The columns a transition or a delete has to know before it acts. */
const TIMESHEET_FACTS_SELECT = {
  id: true,
  employeeId: true,
  month: true,
  year: true,
  status: true,
  isStale: true,
  rejectionReason: true,
  updatedAt: true,
  employee: {
    select: { id: true, employeeCode: true, firstName: true, lastName: true },
  },
} as const satisfies Prisma.TimesheetSelect;

/** A timesheet as a rule is judged against it, without the presentation joins. */
type TimesheetFacts = Prisma.TimesheetGetPayload<{
  select: typeof TIMESHEET_FACTS_SELECT;
}>;

/**
 * The single month a report asks about.
 *
 * Added for Feature 031, whose every report is for one `(month, year)` — the same
 * pair this table is keyed on, which is why reporting can read whole periods
 * without a date range.
 */
export interface TimesheetPeriod {
  readonly month: number;
  readonly year: number;
}

/**
 * Hours booked to one project by one person, in one period.
 *
 * The row the project × employee matrix is folded from. `employeeId` rather than
 * `timesheetId`, because a report is about people: the timesheet is the document
 * the hours arrived on, and no reader cares which one.
 */
export interface TimesheetProjectHoursRow {
  readonly projectId: string;
  readonly employeeId: string;
  readonly hours: number;
}

/**
 * One person's approved hours on one calendar day.
 *
 * `dateKey` is `YYYY-MM-DD` taken from the stored calendar date with UTC
 * accessors — **not** re-interpreted through any zone. The column holds a
 * calendar day at UTC midnight, so passing it through a timezone would move a
 * day west of Greenwich into the previous column of the attendance grid.
 */
export interface TimesheetDayHoursRow {
  readonly employeeId: string;
  readonly dateKey: string;
  readonly hours: number;
}

/**
 * Where one person's month stands.
 *
 * `updatedAt` is a genuine **instant** and is handed over as a `Date` rather than
 * a rendered string, because which calendar day it falls on depends on the
 * company's timezone — and this service has no business knowing that. The
 * reporting module renders it against the Work Schedule's zone.
 */
export interface TimesheetStateRow {
  readonly employeeId: string;
  readonly status: TimesheetStatus;
  readonly updatedAt: Date;
}

/**
 * The lifecycle of a timesheet: who may move it where, and what it adds up to.
 *
 * The fill-in rules are **not** here — they are `TimesheetFillService`, which
 * reads the work schedule, the holidays, the leave and the employment window and
 * decides what may go on a day. This service owns the four transitions, the
 * ownership and visibility rules, and the hour aggregates, and it calls that
 * engine rather than reimplementing any part of it. Nothing is duplicated between
 * the two: there is exactly one function that validates a month and exactly one
 * place that moves a status.
 *
 * Six decisions worth naming:
 *
 * 1. **Every transition is a conditional `updateMany` guarded on the current
 *    status**, never a read followed by a write. `approve` updates
 *    `WHERE id = … AND status = 'submitted'`, so two administrators acting at the
 *    same moment resolve the same way the delivery engine's campaign claim does:
 *    the first moves one row, the second moves none and is told `409`. Reading the
 *    status and then writing it would leave exactly the window this closes — and
 *    it is not a theoretical one, since a review queue is a screen several people
 *    have open.
 * 2. **A notification is emitted only when a row actually moved.** The same
 *    `count === 1` that proves the transition happened is what gates the
 *    announcement, so a double submit produces one notification rather than two —
 *    the property Feature 027's `markSent` establishes for campaigns, applied to
 *    a lifecycle with four states instead of one.
 * 3. **`APPROVED` is immutable and is refused everywhere.** Editing, submitting,
 *    re-approving, rejecting and deleting all pass through `assertNotApproved` or
 *    a status guard that excludes it. There is no code path that writes an
 *    approved timesheet.
 * 4. **Ownership and visibility are domain rules in this service, not a guard.**
 *    A timesheet is filled by the person it is about and reviewed by somebody
 *    else; that is what a timesheet *is*, and it would be true under any
 *    permission system. See the module doc for why no `@RequirePermission` appears
 *    here.
 * 5. **Nothing is ever silently recomputed.** A dependency that changes under a
 *    draft raises `isStale` and notifies its owner; an approved month is frozen
 *    against its snapshot. No write in this file edits somebody's entries as a
 *    side effect of another module's activity — see {@link refreshStaleness}.
 * 6. **The hour aggregates are one `groupBy` per page**, never one per row, and
 *    they are computed rather than stored for the reason
 *    `EmployeeLeaveBalance.remainingDays` is computed: a stored total is a second
 *    home for a fact the entries already state.
 */
@Injectable()
export class TimesheetService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly fill: TimesheetFillService,
    private readonly notifications: TimesheetNotificationService,
  ) {}

  // ---------------------------------------------------------------------------
  // Owner endpoints — `/api/v1/timesheets/me`
  // ---------------------------------------------------------------------------

  /**
   * The caller's own timesheet for one period.
   *
   * **A `404` when they have not opened one yet, rather than an empty draft
   * shell**, and the choice is documented here because the feature left it open.
   * A shell would be a resource the client could not act on: it has no id, so it
   * cannot be sent entries or submitted, and the client's next call would have to
   * be `POST` anyway. Worse, it would be indistinguishable from a real empty
   * draft, so "have I started this month" — the one question this endpoint is
   * asked before anything else — would have no answer. The `404` says exactly what
   * is true and names the request that fixes it, the same call
   * `WorkScheduleService.find` makes for a configuration nobody has stored.
   *
   * Staleness is refreshed on the way out, because this is the read that precedes
   * every edit: if a leave request was approved since the month was filled, the
   * person about to open it is exactly who should be told.
   */
  async findOwn(
    user: CurrentUser,
    query: MyTimesheetQueryDto,
  ): Promise<TimesheetEntity> {
    const employeeId = requireEmployee(user);

    const timesheet = await this.prisma.timesheet.findUnique({
      where: {
        employeeId_month_year: {
          employeeId,
          month: query.month,
          year: query.year,
        },
      },
      select: TIMESHEET_DETAIL_SELECT,
    });

    if (timesheet === null) {
      throw new NotFoundTimesheet(
        `for ${describePeriod(query.month, query.year)}`,
      );
    }

    await this.refreshStaleness(timesheet.id);

    return this.toDetail(timesheet.id);
  }

  /**
   * Opens the caller's timesheet for a period, or returns the one they already
   * have.
   *
   * **Idempotent, and by the unique constraint rather than by a check.** A second
   * call for the same period returns the existing timesheet with the same id, so a
   * client that retries a request — or a person who clicks twice — never produces
   * a duplicate month. The lookup comes first so the common case is one round
   * trip, and the `upsert` is what closes the race between that lookup and the
   * insert: two simultaneous calls both find nothing, and only one insert lands on
   * the key.
   *
   * A fresh draft is **pre-populated** with the leave and the holidays the company
   * already knows about, so the employee fills in the days that are actually
   * theirs. No `WORK` line is invented — nothing in the system knows what anybody
   * did.
   *
   * The period is refused if it is in the future, and the employment window is
   * enforced per day by the fill-in engine rather than here: somebody who joined
   * on the 12th may open the month and log from the 12th, which a check on the
   * month as a whole could not express.
   */
  async openOwn(
    user: CurrentUser,
    dto: CreateTimesheetDto,
  ): Promise<TimesheetEntity> {
    const employeeId = requireEmployee(user);
    const now = new Date();

    assertMonthIsFillable(dto.month, dto.year, now);

    const existing = await this.prisma.timesheet.findUnique({
      where: {
        employeeId_month_year: { employeeId, month: dto.month, year: dto.year },
      },
      select: { id: true },
    });

    if (existing !== null) {
      await this.refreshStaleness(existing.id);

      return this.toDetail(existing.id);
    }

    const plan = await this.fill.planMonth(
      employeeId,
      dto.month,
      dto.year,
      now,
    );
    const prepopulated = this.fill.prepopulate(plan);

    // `upsert` rather than `create`: the read above answers the common case in one
    // round trip, and this is what makes two simultaneous first calls resolve to
    // one timesheet instead of one insert and one unique-violation `500`.
    const timesheet = await this.prisma.timesheet.upsert({
      where: {
        employeeId_month_year: { employeeId, month: dto.month, year: dto.year },
      },
      create: {
        employeeId,
        month: dto.month,
        year: dto.year,
        entries: { create: prepopulated.map(toEntryData) },
      },
      update: {},
      select: { id: true },
    });

    return this.toDetail(timesheet.id);
  }

  /**
   * Replaces the entry set of the caller's own timesheet.
   *
   * Idempotent: the same body sent twice leaves the same month. The whole set is
   * validated before anything is written and the write is one transaction, so a
   * month that is wrong on the 30th does not leave the first twenty-nine days
   * saved — and a failure halfway through cannot leave a month with no lines at
   * all.
   *
   * Deleting and re-creating the rows rather than diffing them is deliberate, and
   * it is the same call Feature 023 makes for a leave request's replacements and
   * Feature 027 for a campaign's audience: the set is at most a few hundred rows,
   * the rules are statements about the whole set, and a diff would be three code
   * paths where this is one.
   *
   * **Saving lowers `isStale`.** The flag means "something changed since you
   * filled this in", and the person has just filled it in again against the
   * dependencies as they now stand — which is precisely the resolution the flag
   * was asking for.
   */
  async setOwnEntries(
    user: CurrentUser,
    id: string,
    dto: SetTimesheetEntriesDto,
  ): Promise<TimesheetEntity> {
    const current = await this.findFactsOrThrow(id);

    assertOwner(user, current.employeeId);
    assertNotApproved(id, current.status);
    assertStatusIs(id, current.status, EDITABLE_TIMESHEET_STATUSES, 'edited');

    const plan = await this.planFor(current);
    const entries = await this.fill.assertEntriesAreValid(dto.entries, plan);

    await this.prisma.$transaction(async (tx) => {
      await tx.timesheetEntry.deleteMany({ where: { timesheetId: id } });
      await tx.timesheetEntry.createMany({
        data: entries.map((entry) => ({
          ...toEntryData(entry),
          timesheetId: id,
        })),
      });
      await tx.timesheet.update({
        where: { id },
        data: { isStale: false },
      });
    });

    return this.toDetail(id);
  }

  /**
   * Hands the caller's own timesheet in for review.
   *
   * `DRAFT → SUBMITTED` and `REJECTED → SUBMITTED`, and nothing else. Resubmitting
   * a refused month is the same operation as submitting a fresh one, which is why
   * there is one endpoint: the rules a month must satisfy do not depend on whether
   * somebody has already looked at it.
   *
   * The **stored** entries are re-validated rather than the ones a draft happened
   * to be saved with, and that is the point of validating at submission at all: a
   * draft may legitimately be saved in a state that could not be submitted — half
   * a month, a day over the ceiling somebody is still moving — and the calendar it
   * was saved against may have changed since.
   *
   * A month with no entries at all **is** submittable. That follows from the rule
   * that being under the daily norm is not a blocker, taken to its limit: six
   * hours on an eight-hour day is acceptable, and so is a month somebody genuinely
   * had nothing to log in. An administrator seeing a submitted month of zero hours
   * has all the information they need to reject it, which is a better answer than
   * this API deciding on their behalf.
   *
   * **Idempotent, and the announcement with it.** The transition is one
   * conditional `updateMany`, so a double submit moves no row the second time and
   * announces nothing — the administrators are told once.
   */
  async submitOwn(user: CurrentUser, id: string): Promise<TimesheetEntity> {
    const current = await this.findFactsOrThrow(id);

    assertOwner(user, current.employeeId);
    assertNotApproved(id, current.status);
    assertStatusIs(
      id,
      current.status,
      SUBMITTABLE_TIMESHEET_STATUSES,
      'submitted',
    );

    await this.assertStoredEntriesStillValid(current);

    const submittable: readonly TimesheetStatus[] =
      SUBMITTABLE_TIMESHEET_STATUSES;

    const { count } = await this.prisma.timesheet.updateMany({
      where: { id, status: { in: [...submittable] } },
      data: {
        status: TimesheetStatus.SUBMITTED,
        submittedAt: new Date(),
        // Cleared because it is no longer true: the month has just been checked
        // against the dependencies as they stand. The rejection reason is *not*
        // cleared — see the schema comment on the column.
        isStale: false,
      },
    });

    if (count === 1) {
      await this.notifications.announceSubmitted(toSubject(current));
    }

    return this.toDetail(id);
  }

  // ---------------------------------------------------------------------------
  // Administrative endpoints — `/api/v1/timesheets`
  // ---------------------------------------------------------------------------

  /**
   * One page of the review queue, narrowed by `search` and the three filters.
   *
   * **Drafts are excluded before any filter is applied**, so there is no query a
   * client can construct that returns one — including `?status=DRAFT`, which
   * intersects to nothing and answers an empty page rather than a `400` that would
   * confirm drafts exist.
   *
   * The rows and the total are read in a single `$transaction` so both see the
   * same snapshot: run separately, a submission arriving between them would
   * produce a `total` that does not describe the page just returned.
   *
   * The hour aggregates are read afterwards, in **one** `groupBy` for the whole
   * page rather than one per row. They are deliberately outside the transaction:
   * they describe the same timesheets and a concurrent edit cannot affect them,
   * because every status this list returns is one whose entries are frozen or
   * back with their owner.
   *
   * Staleness is **not** refreshed here, and that is a bounded decision rather
   * than an omission: recomputing it needs the work schedule, the holidays and the
   * leave for each row's month and employee, which is three queries per row. The
   * list reports the stored flag — raised whenever anybody last read the timesheet
   * — and the single-timesheet read is where it is brought up to date. The feature
   * document records the trade.
   */
  async findAll(
    user: CurrentUser,
    query: TimesheetQueryDto,
  ): Promise<PaginatedResult<TimesheetListRowEntity>> {
    assertAdministrative(user);

    const where = buildWhere(query);

    const [timesheets, total] = await this.prisma.$transaction([
      this.prisma.timesheet.findMany({
        where,
        orderBy: buildOrderBy(query.sortBy, query.sortOrder),
        select: TIMESHEET_LIST_SELECT,
        ...toSkipTake(query),
      }),
      this.prisma.timesheet.count({ where }),
    ]);

    const hours = await this.aggregateHours(timesheets.map(({ id }) => id));

    return buildPaginatedResult(
      timesheets.map((timesheet) =>
        toTimesheetListRowEntity(
          timesheet,
          hours.get(timesheet.id) ?? NO_HOURS,
        ),
      ),
      total,
      query,
    );
  }

  /**
   * One timesheet in full — the "see how it was filled" view the list omits.
   *
   * A `DRAFT` answers the same `404` as a timesheet that does not exist. That is
   * deliberate and it is the one place this feature prefers a `404` to a `403`:
   * distinguishing them would let an administrator discover that a colleague has
   * started their month, and on a screen that lists what is outstanding would
   * quietly invite them to ask about it.
   *
   * Staleness is refreshed, so a reviewer about to approve a month is told if the
   * calendar moved under it — which is exactly the moment that matters, since an
   * approval freezes what it approves.
   */
  async findOne(user: CurrentUser, id: string): Promise<TimesheetEntity> {
    assertAdministrative(user);

    const current = await this.findFactsOrThrow(id);

    assertAdminVisible(id, current.status, ADMIN_VISIBLE_TIMESHEET_STATUSES);

    await this.refreshStaleness(id);

    return this.toDetail(id);
  }

  /**
   * Approves a submitted month, and freezes it.
   *
   * Three things happen in one transaction, and each of them has to be there:
   *
   * 1. **The status moves, guarded on `SUBMITTED`.** A conditional `updateMany`,
   *    so two administrators pressing approve and reject at the same moment cannot
   *    produce a month that is both: the first moves one row, the second moves
   *    none and gets a `409` naming the status the timesheet now holds.
   * 2. **The `scheduleSnapshot` is captured.** The working days, the hour
   *    ceilings, the week start and the forced days as they stand *now* — because
   *    those are the rules the approval is a statement about. Without it, opening
   *    this approval in two years would judge it against a schedule nobody had
   *    when they agreed to it.
   * 3. **The owner is notified**, once, and only if the row moved.
   *
   * The snapshot is built *before* the transaction, from a plan that costs four
   * reads, so the transaction itself holds no locks while waiting on other
   * modules. It is a photograph of a configuration nobody is editing in the
   * milliseconds in between; a schedule change racing an approval leaves the
   * snapshot a moment stale, which is a fact about the same afternoon and not a
   * contradiction.
   */
  async approve(user: CurrentUser, id: string): Promise<TimesheetEntity> {
    assertAdministrative(user);

    const current = await this.findFactsOrThrow(id);

    assertNotApproved(id, current.status);
    assertStatusIs(
      id,
      current.status,
      [REVIEWABLE_TIMESHEET_STATUS],
      'approved',
    );

    const plan = await this.planFor(current);
    const snapshot = this.fill.buildScheduleSnapshot(plan);

    const { count } = await this.prisma.timesheet.updateMany({
      where: { id, status: REVIEWABLE_TIMESHEET_STATUS },
      data: {
        status: TimesheetStatus.APPROVED,
        reviewedAt: new Date(),
        reviewedByEmployeeId: user.employeeId,
        // Cast rather than typed as `InputJsonValue` at the source: the snapshot
        // is assembled from four other modules' shapes, and threading Prisma's
        // JSON input type back through the fill engine would make that engine
        // depend on the ORM to describe a photograph.
        scheduleSnapshot: snapshot as Prisma.InputJsonValue,
        // An approved month is frozen against its snapshot, so "a dependency
        // changed" is no longer a question anybody should be asked. See the
        // schema comment on `is_stale`.
        isStale: false,
      },
    });

    assertTransitionHappened(count, id, 'approved');

    await this.notifications.announceApproved(toSubject(current));

    return this.toDetail(id);
  }

  /**
   * Sends a submitted month back, with a reason.
   *
   * The same conditional transition as {@link approve} and guarded on the same
   * status, which is what makes "two administrators cannot approve and reject the
   * same timesheet" a property of the database rather than of the order the
   * requests happened to arrive in.
   *
   * The reason is **required** and reaches the owner in the notification. It is
   * stored on the timesheet as well, so the review history can say why a month
   * took two attempts — and it is deliberately not cleared when the month is
   * resubmitted.
   *
   * No snapshot is captured. A rejected month is going back to be changed, so
   * freezing the rules it was refused under would be preserving the context of a
   * decision that is about to be superseded.
   */
  async reject(
    user: CurrentUser,
    id: string,
    dto: RejectTimesheetDto,
  ): Promise<TimesheetEntity> {
    assertAdministrative(user);
    assertRejectionReasonGiven(dto.rejectionReason);

    const current = await this.findFactsOrThrow(id);

    assertNotApproved(id, current.status);
    assertStatusIs(
      id,
      current.status,
      [REVIEWABLE_TIMESHEET_STATUS],
      'rejected',
    );

    const { count } = await this.prisma.timesheet.updateMany({
      where: { id, status: REVIEWABLE_TIMESHEET_STATUS },
      data: {
        status: TimesheetStatus.REJECTED,
        reviewedAt: new Date(),
        reviewedByEmployeeId: user.employeeId,
        rejectionReason: dto.rejectionReason,
      },
    });

    assertTransitionHappened(count, id, 'rejected');

    await this.notifications.announceRejected(
      toSubject(current),
      dto.rejectionReason,
    );

    return this.toDetail(id);
  }

  /**
   * Deletes a timesheet that has not been approved.
   *
   * An `APPROVED` month is a `409`: it is the record of what the company agreed
   * somebody worked, and removing it would delete the only account of hours that
   * payroll and reporting are drawn from. Everything else may go — the same shape
   * Feature 027 gives a `SENT` campaign.
   *
   * The entries go with it, by the `ON DELETE CASCADE` on their foreign key. A
   * line says nothing once the month it belongs to is gone.
   *
   * A `DRAFT` is deletable by an administrator although they cannot *read* one,
   * and the asymmetry is deliberate rather than an oversight: reading a draft would
   * expose a half-finished month, while deleting one is the administrative
   * housekeeping the feature asks for — a timesheet opened for the wrong period,
   * or one belonging to somebody who has left. Nothing is disclosed by a delete
   * that succeeds, and the owner may simply open the month again.
   */
  async remove(user: CurrentUser, id: string): Promise<void> {
    assertAdministrative(user);

    const current = await this.findFactsOrThrow(id);

    if (current.status === UNDELETABLE_TIMESHEET_STATUS) {
      throw new ConflictException(
        `Timesheet ${id} has been approved and cannot be deleted: an approved month is the record of what the company agreed was worked`,
      );
    }

    await this.prisma.timesheet.delete({ where: { id } });
  }

  // ---------------------------------------------------------------------------
  // Reporting reads — Feature 031
  // ---------------------------------------------------------------------------

  /**
   * Hours booked to each project by each person, over one period.
   *
   * The three methods below are what the module doc promised: "Reporting will
   * read these tables eventually and will do it through `TimesheetService`."
   * They write nothing, decide nothing and check no access — the reporting
   * module applies its own administrative rule before it calls any of them, and
   * a read method that enforced one would be a second place where the answer to
   * "who may see this" lives.
   *
   * **`APPROVED` only, and `WORK` only.** An official report of what the company
   * worked cannot include a month somebody is still typing into or one an
   * administrator has refused, and leave and holiday lines are absence rather
   * than effort — counting them would inflate a project's hours with days
   * nobody was at work. Both filters are in the `WHERE` rather than applied
   * afterwards, so the database never sends a row that will be discarded.
   *
   * **Two queries, and the fold that needs them.** `employeeId` lives on
   * `timesheets` while `hours` lives on `timesheet_entries`, and Prisma's
   * `groupBy` cannot group by a column of a related table — so the entries are
   * grouped by `(timesheetId, projectId)` and the timesheets are read once to map
   * each id to its owner. That is two round trips whatever the size of the
   * period, and no entry is ever loaded: the summing is `SUM(hours)` in
   * PostgreSQL, not a reduce over rows in Node.
   *
   * An empty population short-circuits, since `IN ()` is a query asking about no
   * rows.
   */
  async findApprovedProjectHours(
    period: TimesheetPeriod,
    employeeIds: readonly string[],
    projectIds?: readonly string[],
  ): Promise<TimesheetProjectHoursRow[]> {
    const owners = await this.findApprovedOwners(period, employeeIds);

    if (owners.size === 0) {
      return [];
    }

    const grouped = await this.prisma.timesheetEntry.groupBy({
      by: ['timesheetId', 'projectId'],
      where: {
        timesheetId: { in: [...owners.keys()] },
        type: TimesheetEntryType.WORK,
        ...(projectIds === undefined
          ? {}
          : { projectId: { in: [...projectIds] } }),
      },
      _sum: { hours: true },
    });

    const rows: TimesheetProjectHoursRow[] = [];

    for (const row of grouped) {
      const employeeId = owners.get(row.timesheetId);

      // `projectId` is nullable on the model because leave and holiday lines
      // carry none. The `type` filter above already excludes those, so this is a
      // narrowing rather than a case that occurs.
      if (employeeId === undefined || row.projectId === null) {
        continue;
      }

      rows.push({
        projectId: row.projectId,
        employeeId,
        hours: row._sum.hours?.toNumber() ?? 0,
      });
    }

    return rows;
  }

  /**
   * Approved hours per person per calendar day, for the attendance grid.
   *
   * Grouped by `(timesheetId, date)` for the same reason and with the same two
   * queries as the method above. A day with no entries produces no row and is
   * mapped to "nothing recorded" by the caller, which is the honest shape: a
   * blank day and a day of zero hours are different statements, and inventing
   * rows here would erase the difference.
   */
  async findApprovedDailyHours(
    period: TimesheetPeriod,
    employeeIds: readonly string[],
  ): Promise<TimesheetDayHoursRow[]> {
    const owners = await this.findApprovedOwners(period, employeeIds);

    if (owners.size === 0) {
      return [];
    }

    const grouped = await this.prisma.timesheetEntry.groupBy({
      by: ['timesheetId', 'date'],
      where: {
        timesheetId: { in: [...owners.keys()] },
        type: TimesheetEntryType.WORK,
      },
      _sum: { hours: true },
    });

    const rows: TimesheetDayHoursRow[] = [];

    for (const row of grouped) {
      const employeeId = owners.get(row.timesheetId);

      if (employeeId === undefined) {
        continue;
      }

      rows.push({
        employeeId,
        // `toDateKey` reads UTC fields, which is correct here and would be wrong
        // for an instant — see the type's documentation.
        dateKey: toDateKey(row.date),
        hours: row._sum.hours?.toNumber() ?? 0,
      });
    }

    return rows;
  }

  /**
   * Where each person's month stands, in **every** state.
   *
   * The one reporting read that is not restricted to `APPROVED`, and deliberately
   * so: the status summary reports the status itself, so filtering by it would
   * leave the report unable to answer the question it exists for. A `DRAFT`
   * appears here although the administrative *list* never returns one — the
   * difference is that this produces a count and a label in a grid, not a
   * readable month, so nothing about a half-finished timesheet is exposed.
   *
   * An employee with no timesheet for the period simply has no row, and the
   * builder renders that as its own state rather than as a fourth status.
   */
  async findStatesForPeriod(
    period: TimesheetPeriod,
    employeeIds: readonly string[],
  ): Promise<TimesheetStateRow[]> {
    if (employeeIds.length === 0) {
      return [];
    }

    return this.prisma.timesheet.findMany({
      where: {
        month: period.month,
        year: period.year,
        employeeId: { in: [...employeeIds] },
      },
      select: { employeeId: true, status: true, updatedAt: true },
    });
  }

  /**
   * Which approved timesheet in the period belongs to whom.
   *
   * Shared by the two hour reads so the `APPROVED` rule is stated once. Returning
   * a `Map` rather than a list is what makes the fold above a lookup instead of a
   * scan per grouped row.
   */
  private async findApprovedOwners(
    period: TimesheetPeriod,
    employeeIds: readonly string[],
  ): Promise<Map<string, string>> {
    if (employeeIds.length === 0) {
      return new Map();
    }

    const timesheets = await this.prisma.timesheet.findMany({
      where: {
        month: period.month,
        year: period.year,
        status: TimesheetStatus.APPROVED,
        employeeId: { in: [...employeeIds] },
      },
      select: { id: true, employeeId: true },
    });

    return new Map(timesheets.map(({ id, employeeId }) => [id, employeeId]));
  }

  // ---------------------------------------------------------------------------
  // Shared
  // ---------------------------------------------------------------------------

  /**
   * Re-checks a draft or submitted month against its dependencies, and raises the
   * flag if they have moved.
   *
   * **The heart of the retroactive-change strategy, and it changes nothing.** It
   * compares what the fill-in engine would produce *today* — which days are
   * leave, which are holidays, how many hours each is worth — against the `LEAVE`
   * and `HOLIDAY` lines the timesheet actually holds, and re-runs the day and week
   * ceilings over the stored work. If either disagrees, the month is marked stale
   * and its owner is told once.
   *
   * Three properties are worth stating:
   *
   * - **It is exact, and needs no timestamps.** An earlier design compared
   *   `updatedAt` against the moment each dependency last changed, which raises the
   *   flag on every draft in the system when HR corrects a holiday in a different
   *   year. Comparing the *computed result* asks the only question that matters:
   *   would this month be filled differently now?
   * - **It never edits an entry.** A leave approved after the fact may mean a day
   *   of somebody's is now absence, or may mean nothing because they already
   *   accounted for it — and only the person who worked the month can say which.
   *   Rewriting their entries would mean opening a timesheet to find hours nobody
   *   entered, with nothing saying who changed them.
   * - **It announces once.** The flag is raised by a conditional `updateMany`
   *   guarded on `isStale: false`, so several concurrent reads of the same stale
   *   month produce one notification between them — the same `count === 1` gate
   *   every transition here uses.
   *
   * It runs on the single-timesheet reads only. `APPROVED` months are frozen
   * against their snapshot and `REJECTED` ones are already back with their owner
   * carrying a reason to act on, so neither is checked.
   *
   * **It never fails the read it is part of.** A work schedule that has been
   * deleted, or a month whose dependencies cannot be resolved, must not turn "show
   * me my timesheet" into a `500` — the advisory flag is worth strictly less than
   * the timesheet itself.
   */
  private async refreshStaleness(id: string): Promise<void> {
    const checked: readonly TimesheetStatus[] = STALENESS_CHECKED_STATUSES;

    const current = await this.prisma.timesheet.findUnique({
      where: { id },
      select: {
        ...TIMESHEET_FACTS_SELECT,
        entries: {
          select: {
            date: true,
            type: true,
            hours: true,
            projectId: true,
          },
        },
      },
    });

    if (
      current === null ||
      current.isStale ||
      !checked.includes(current.status)
    ) {
      return;
    }

    const reason = await this.detectStaleness(current);

    if (reason === null) {
      return;
    }

    const { count } = await this.prisma.timesheet.updateMany({
      where: { id, isStale: false },
      data: { isStale: true },
    });

    if (count === 1) {
      await this.notifications.announceStale(toSubject(current), reason);
    }
  }

  /**
   * What has changed under a month, or `null` if nothing has.
   *
   * The reason is reported at the granularity the owner can act on — leave, a
   * holiday, or the schedule — and is decided by *which* comparison failed rather
   * than by asking each dependency when it last changed. Leave is checked first
   * because it is by far the most common: it is the one dependency an individual
   * employee moves, and the other two are administrative acts.
   *
   * Swallows its own failures and answers `null`. See {@link refreshStaleness}.
   */
  private async detectStaleness(
    current: TimesheetFacts & {
      entries: readonly {
        date: Date;
        type: TimesheetEntryType;
        hours: Prisma.Decimal;
        projectId: string | null;
      }[];
    },
  ): Promise<StaleReason | null> {
    let plan: MonthPlan;

    try {
      plan = await this.planFor(current);
    } catch {
      // The work schedule has gone, or a dependency cannot be resolved. That is
      // not something the owner of a timesheet can act on, and it must not turn a
      // read into a 500.
      return null;
    }

    const stored = current.entries.filter(
      (entry) => entry.type !== TimesheetEntryType.WORK,
    );
    const expected = plan.forced;

    const storedKeys = new Set(
      stored.map((entry) =>
        forcedKey(entry.date, entry.type, entry.hours.toNumber()),
      ),
    );
    const expectedKeys = new Set(
      expected.map((entry) => forcedKey(entry.date, entry.type, entry.hours)),
    );

    if (!sameSet(storedKeys, expectedKeys)) {
      return differenceMentionsHoliday(stored, expected)
        ? 'a public holiday'
        : 'an approved leave request';
    }

    // The forced days agree, so anything wrong now is the schedule: a weekday no
    // longer worked, a ceiling lowered, an entry outside the new per-entry bounds.
    return (await this.storedWorkStillValid(current.entries, plan))
      ? null
      : 'the work schedule';
  }

  /**
   * Whether the stored work would still be accepted under the current rules.
   *
   * Run through the same engine a save goes through, on the stored entries rather
   * than on a body, so "is this month still valid" and "may this month be saved"
   * cannot drift into different answers. A `BadRequestException` here is not an
   * error to propagate — it is the answer.
   */
  private async storedWorkStillValid(
    entries: readonly {
      date: Date;
      type: TimesheetEntryType;
      hours: Prisma.Decimal;
      projectId: string | null;
    }[],
    plan: MonthPlan,
  ): Promise<boolean> {
    try {
      await this.fill.assertEntriesAreValid(
        entries
          .filter((entry) => entry.type === TimesheetEntryType.WORK)
          .map((entry) => ({
            date: entry.date.toISOString(),
            type: entry.type,
            hours: entry.hours.toNumber(),
            projectId: entry.projectId ?? undefined,
          })),
        plan,
      );

      return true;
    } catch (error) {
      if (error instanceof BadRequestException) {
        return false;
      }

      throw error;
    }
  }

  /**
   * Re-validates the stored entries at submission, so a month is judged against
   * the calendar as it is now.
   *
   * A draft may legitimately have been saved in a state that could not be
   * submitted, and the dependencies may have moved since. The message a caller
   * gets is the fill-in engine's own, naming every offending day at once, which is
   * what somebody looking at a month full of red needs.
   */
  private async assertStoredEntriesStillValid(
    current: TimesheetFacts,
  ): Promise<void> {
    const [plan, entries] = await Promise.all([
      this.planFor(current),
      this.prisma.timesheetEntry.findMany({
        where: {
          timesheetId: current.id,
          type: TimesheetEntryType.WORK,
        },
        select: { date: true, type: true, hours: true, projectId: true },
      }),
    ]);

    await this.fill.assertEntriesAreValid(
      entries.map((entry) => ({
        date: entry.date.toISOString(),
        type: entry.type,
        hours: entry.hours.toNumber(),
        projectId: entry.projectId ?? undefined,
      })),
      plan,
    );
  }

  /** The month plan for one timesheet, judged against the clock now. */
  private async planFor(current: {
    employeeId: string;
    month: number;
    year: number;
  }): Promise<MonthPlan> {
    return this.fill.planMonth(
      current.employeeId,
      current.month,
      current.year,
      new Date(),
    );
  }

  /**
   * The hours of several timesheets at once, split by entry type.
   *
   * **One `groupBy` for a whole page**, which is the whole reason the aggregates
   * are affordable as computed values. Grouping by `(timesheetId, type)` answers
   * all four figures in one round trip: the three categories come back as rows and
   * the total is their sum, so nothing is queried twice and no entry is fetched
   * merely to be added up.
   *
   * A timesheet with no entries produces no rows and is therefore absent from the
   * result; the caller maps it to {@link NO_HOURS}. That is the honest shape — a
   * month with nothing in it has no hours of any kind — and returning zeros from
   * here would mean inventing rows the database did not have.
   *
   * An empty id list short-circuits: `groupBy` over `IN ()` is a query asking
   * about no rows.
   */
  private async aggregateHours(
    ids: readonly string[],
  ): Promise<TimesheetHoursByTimesheet> {
    if (ids.length === 0) {
      return new Map();
    }

    const grouped = await this.prisma.timesheetEntry.groupBy({
      by: ['timesheetId', 'type'],
      where: { timesheetId: { in: [...ids] } },
      _sum: { hours: true },
    });

    const hours = new Map<string, TimesheetHours>();

    for (const row of grouped) {
      const current = hours.get(row.timesheetId) ?? { ...NO_HOURS };
      const sum = row._sum.hours?.toNumber() ?? 0;

      hours.set(row.timesheetId, {
        workedHours:
          current.workedHours +
          (row.type === TimesheetEntryType.WORK ? sum : 0),
        leaveHours:
          current.leaveHours +
          (row.type === TimesheetEntryType.LEAVE ? sum : 0),
        holidayHours:
          current.holidayHours +
          (row.type === TimesheetEntryType.HOLIDAY ? sum : 0),
        totalHours: current.totalHours + sum,
      });
    }

    return hours;
  }

  /**
   * One timesheet in full, with its totals.
   *
   * Every write returns through here rather than from the row it just wrote, so
   * the response of a `PUT`, a submission and an approval is byte-for-byte the
   * same resource `GET` returns. A client refreshing a screen from a write's
   * response cannot end up with a shape that differs from the one it would fetch.
   */
  private async toDetail(id: string): Promise<TimesheetEntity> {
    const timesheet = await this.prisma.timesheet.findUnique({
      where: { id },
      select: TIMESHEET_DETAIL_SELECT,
    });

    if (timesheet === null) {
      throw new NotFoundTimesheet(id);
    }

    const hours = await this.aggregateHours([id]);

    return toTimesheetEntity(timesheet, hours.get(id) ?? NO_HOURS);
  }

  /** Loads what a rule or a transition has to know, or reports it missing. */
  private async findFactsOrThrow(id: string): Promise<TimesheetFacts> {
    const timesheet = await this.prisma.timesheet.findUnique({
      where: { id },
      select: TIMESHEET_FACTS_SELECT,
    });

    if (timesheet === null) {
      throw new NotFoundTimesheet(id);
    }

    return timesheet;
  }
}

/**
 * The employee the caller is, or a `400` naming the header.
 *
 * `CurrentUser.employeeId` is nullable because not every account has an
 * employment record — a super-admin created to administer the system is the
 * obvious case — and a timesheet belongs to an employment record rather than to a
 * login. Rather than inventing an owner, the request is refused: an account with
 * no employee has no month to account for, and it has no hire date for the
 * fill-in engine to bound anything by.
 *
 * Feature 032 is the change this function said it was waiting for. The employee
 * id is now read from the caller's account rather than sent as a header, so the
 * refusal stopped being "you left something out" — nothing was left out — and
 * became "your account cannot do this": a `403` where this threw a `400`. The
 * same move `NotificationCampaignService.requireAuthor` and the
 * `@CurrentEmployeeId()` decorator made, so the one condition still has one
 * answer wherever it is asked.
 */
function requireEmployee(user: CurrentUser): string {
  if (user.employeeId === null) {
    throw new ForbiddenException(
      'A timesheet belongs to an employment record, and your account has none',
    );
  }

  return user.employeeId;
}

/**
 * Refuses a transition that moved no row.
 *
 * The other half of the optimistic-concurrency guard. The status was checked
 * before the update, so reaching this means somebody else moved the timesheet in
 * between — the second of two administrators pressing approve and reject at the
 * same moment. A `409` rather than a `500`, and the message says what happened
 * rather than only that something did, because the caller's screen is now showing
 * a status that is no longer true and the useful instruction is "reload".
 */
function assertTransitionHappened(
  count: number,
  id: string,
  action: string,
): void {
  if (count !== 1) {
    throw new ConflictException(
      `Timesheet ${id} could not be ${action}: it was reviewed by somebody else a moment ago. Reload it to see its current status.`,
    );
  }
}

/** The timesheet a notification is about. */
function toSubject(current: TimesheetFacts): TimesheetSubject {
  return {
    employeeId: current.employee.id,
    employeeCode: current.employee.employeeCode,
    firstName: current.employee.firstName,
    lastName: current.employee.lastName,
    month: current.month,
    year: current.year,
  };
}

/**
 * A forced line's identity: the day, the kind, and the hours.
 *
 * Exactly the three things that make a pre-populated line what it is, and
 * therefore exactly what has to match for a month to be up to date. The project
 * and the description are excluded on purpose: a holiday renamed from "Christmas"
 * to "Christmas Day" changes no hours and is not worth interrupting somebody's
 * month for.
 */
function forcedKey(
  date: Date,
  type: TimesheetEntryType,
  hours: number,
): string {
  return `${toDateKey(date)}|${type}|${String(hours)}`;
}

/** Whether two sets hold the same members. */
function sameSet(
  left: ReadonlySet<string>,
  right: ReadonlySet<string>,
): boolean {
  if (left.size !== right.size) {
    return false;
  }

  for (const value of left) {
    if (!right.has(value)) {
      return false;
    }
  }

  return true;
}

/**
 * Whether the disagreement between stored and expected forced lines involves a
 * holiday at all.
 *
 * Used only to word the notification, so an owner is told which of their
 * dependencies moved. A change touching both a holiday and a leave day reports
 * the holiday, because that is the administrative act and the one they cannot fix
 * themselves.
 */
function differenceMentionsHoliday(
  stored: readonly { type: TimesheetEntryType }[],
  expected: readonly { type: TimesheetEntryType }[],
): boolean {
  const countHolidays = (entries: readonly { type: TimesheetEntryType }[]) =>
    entries.filter((entry) => entry.type === TimesheetEntryType.HOLIDAY).length;

  return countHolidays(stored) !== countHolidays(expected);
}

/** One entry, in the shape Prisma writes. */
function toEntryData(entry: PreparedEntry) {
  return {
    date: entry.date,
    type: entry.type,
    hours: entry.hours,
    projectId: entry.projectId,
    leaveRequestId: entry.leaveRequestId,
    description: entry.description,
  };
}

/**
 * Builds the `WHERE` for the administrative list.
 *
 * **The visible-status filter is applied first and cannot be widened by a
 * client.** A `?status=` narrows the three an administrator may see rather than
 * replacing them, so `?status=DRAFT` intersects to nothing and returns an empty
 * page — the honest answer to "show me the drafts", which is that there are none
 * you can see.
 *
 * The other parameters are independent and combine with `AND`: `?month=9` narrows
 * whatever `?search=` matched rather than replacing it.
 *
 * `search` and `departmentId` both reach through the `employee` relation, since
 * neither the person's name nor their department is a column of this table. They
 * are written as separate `employee` filters rather than one merged object so that
 * adding a third never has to reason about how the others nest — the call
 * `LeaveRequestsService.buildWhere` makes.
 */
function buildWhere(query: TimesheetQueryDto): Prisma.TimesheetWhereInput {
  const visible: readonly TimesheetStatus[] = ADMIN_VISIBLE_TIMESHEET_STATUSES;
  const statuses =
    query.status === undefined
      ? [...visible]
      : visible.filter((status) => status === query.status);

  const filters: Prisma.TimesheetWhereInput[] = [{ status: { in: statuses } }];

  if (query.search !== undefined && query.search.length > 0) {
    filters.push({
      employee: {
        OR: [
          { employeeCode: { contains: query.search, ...CASE_INSENSITIVE } },
          { firstName: { contains: query.search, ...CASE_INSENSITIVE } },
          { lastName: { contains: query.search, ...CASE_INSENSITIVE } },
          {
            position: { name: { contains: query.search, ...CASE_INSENSITIVE } },
          },
        ],
      },
    });
  }

  if (query.month !== undefined) {
    filters.push({ month: query.month });
  }

  if (query.year !== undefined) {
    filters.push({ year: query.year });
  }

  if (query.departmentId !== undefined) {
    filters.push({ employee: { departmentId: query.departmentId } });
  }

  return { AND: filters };
}

/**
 * Orders by the requested column, then by `id`.
 *
 * The tie-break on `id` is what makes pagination safe: none of the sortable
 * values is unique — a status, a submission timestamp to the millisecond, even a
 * surname are all shared by many rows — so without it a record could repeat on one
 * page and vanish from the next.
 *
 * `employee` becomes the related employee's surname and then given name, which is
 * what a person means by "sort by employee"; `employeeId` would sort by cuid,
 * which is to say by nothing. Prisma expresses this as an ordering on a to-one
 * relation, so it stays a single query. The same call
 * `LeaveRequestsService.buildOrderBy` makes.
 */
function buildOrderBy(
  sortBy: TimesheetSortField,
  sortOrder: SortOrder,
): Prisma.TimesheetOrderByWithRelationInput[] {
  if (sortBy === 'employee') {
    return [
      { employee: { lastName: sortOrder } },
      { employee: { firstName: sortOrder } },
      { id: SortOrder.ASC },
    ];
  }

  return [{ [sortBy]: sortOrder }, { id: SortOrder.ASC }];
}
