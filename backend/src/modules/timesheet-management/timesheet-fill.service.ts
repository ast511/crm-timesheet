import { BadRequestException, Injectable } from '@nestjs/common';

import {
  daysSinceWeekStart,
  toDateKey,
  weekdayOf,
} from '../../common/utils/date.util';
import {
  LeaveHalfDayPortion,
  TimesheetEntryType,
} from '../../generated/prisma/enums';
import { EmployeeService } from '../employees/employee.service';
import {
  ApprovedLeaveDay,
  LeaveRequestsService,
} from '../leave-requests/leave-requests.service';
import { ProjectService } from '../projects/project.service';
import { PublicHolidayService } from '../public-holidays/public-holiday.service';
import { WorkScheduleEntity } from '../work-schedule/entities/work-schedule.entity';
import { WorkScheduleService } from '../work-schedule/work-schedule.service';
import { describePeriod } from './timesheet-management.rules';

/** Whole days, in milliseconds. The columns hold UTC instants, so this is exact. */
const MS_PER_DAY = 86_400_000;

/**
 * A line the fill-in engine produces rather than the employee.
 *
 * `LEAVE` and `HOLIDAY` only — see {@link TimesheetFillService} for why those two
 * are not the employee's to write. The `hours` come from the work schedule and
 * never from a constant.
 */
export interface ForcedEntry {
  readonly dateKey: string;
  readonly date: Date;
  /**
   * `LEAVE` or `HOLIDAY`, never `WORK`.
   *
   * Spelled as an `Exclude` of the enum rather than as the two members, because
   * Prisma emits its enums as const objects with a companion type alias — so
   * `TimesheetEntryType.LEAVE` is a value and not a type. Deriving the narrowing
   * from the enum keeps it in step: adding a fourth entry type makes this a build
   * error here, which is exactly where somebody should be asked whether the new
   * type is the engine's or the employee's.
   */
  readonly type: Exclude<TimesheetEntryType, typeof TimesheetEntryType.WORK>;
  readonly hours: number;
  /** The approved absence a `LEAVE` line is justified by; null on a holiday. */
  readonly leaveRequestId: string | null;
  /** `Annual Leave (first half)`, `Christmas Day` — what a client renders. */
  readonly description: string;
}

/** One calendar day of the month, and everything that decides what may go on it. */
export interface TimesheetDay {
  readonly date: Date;
  readonly dateKey: string;
  /**
   * Whether this weekday is worked at all, per `WorkSchedule.workingDays`.
   *
   * **There is no weekend rule anywhere in this module.** A company that works
   * Saturdays lists Saturday in its schedule and this is `true`; a company that
   * works Monday to Sunday makes it `true` for all seven. The alternative — a
   * `getUTCDay() === 0 || === 6` somewhere — would contradict the configuration
   * screen on every request, and the first deployment outside western Europe
   * would find it the hard way.
   */
  readonly isWorkingDay: boolean;
  /** Whether the person was employed here that day. */
  readonly isWithinEmployment: boolean;
  /** The lines the engine writes for this day, if any. */
  readonly forced: readonly ForcedEntry[];
  /** The hours those lines already take up. */
  readonly forcedHours: number;
  /**
   * Which week this day belongs to, as the date key of the week's first day.
   *
   * Computed from `WorkSchedule.weekStartsOn`, never from a hard-coded Monday.
   * The weekly ceiling is summed over these groups, so a company whose week
   * begins on Sunday has its week counted as one bucket rather than split across
   * two — which is the difference between a ceiling that applies and one that
   * silently never binds.
   */
  readonly weekKey: string;
}

/**
 * Everything one month is judged against, resolved once.
 *
 * Built by {@link TimesheetFillService.planMonth} from four sources and then used
 * without further queries: the validation walks the entries against this map, and
 * the pre-population reads its forced lines. That is what keeps filling in a
 * month four round trips rather than four per day.
 */
export interface MonthPlan {
  readonly month: number;
  readonly year: number;
  readonly days: ReadonlyMap<string, TimesheetDay>;
  /** Every forced line in the month, in day order. */
  readonly forced: readonly ForcedEntry[];
  /** The configuration this plan was computed from. Frozen at approval. */
  readonly schedule: WorkScheduleEntity;
}

/** One line as it will be stored, with its date already parsed. */
export interface PreparedEntry {
  readonly date: Date;
  readonly type: TimesheetEntryType;
  readonly hours: number;
  readonly projectId: string | null;
  readonly leaveRequestId: string | null;
  readonly description: string | null;
}

/** What a client sends for one line; the shape `SetTimesheetEntriesDto` carries. */
export interface EntryInput {
  readonly date: string;
  readonly type: TimesheetEntryType;
  readonly hours: number;
  readonly projectId?: string;
  readonly description?: string | null;
}

/**
 * The fill-in rule engine: what may go on a day, and what the company puts there
 * whether or not anybody asks.
 *
 * It is a separate service from `TimesheetService` on purpose, and the split is
 * along a real seam rather than by file size. This one **reads four other
 * modules and writes nothing**; the lifecycle service owns the transitions and
 * touches none of these rules. Neither duplicates the other: the only way to
 * validate a month is {@link assertEntriesAreValid}, and the only thing that
 * moves a status is the other service.
 *
 * The four sources, and what each decides:
 *
 * | Source | Decides |
 * | --- | --- |
 * | `WorkScheduleService` | which weekdays are loggable, where a week starts, the per-entry, per-day and per-week ceilings, what a full day is worth |
 * | `PublicHolidayService` | which days the company was closed, and under which name |
 * | `LeaveRequestsService` | which days are approved absence, and whether a day is half or whole |
 * | `EmployeeService` | the window `[hireDate, terminationDate ?? today]` the month must sit inside |
 *
 * **Every limit is configuration and none is a constant.** There is no `8`, no
 * `40`, no `4` for a half day and no test for Saturday anywhere in this file.
 * That is not tidiness: a company on a seven-hour day, a company that works
 * weekends and a company whose week begins on Sunday are all ordinary, and each
 * of them would be silently mis-validated by a constant that looked reasonable
 * when it was written.
 *
 * **Two rules are enforced by refusing rather than by correcting**, and the
 * distinction runs through the whole engine:
 *
 * 1. The forced lines — leave and holidays — are *written by the engine*. A
 *    client may echo them back and must echo them back unchanged; it may not
 *    invent, move or resize one.
 * 2. Everything else is the employee's, and is refused with a message naming the
 *    day rather than being clamped to fit. A day silently trimmed from nine hours
 *    to eight would be the API changing what somebody said they did.
 *
 * Every problem in one request is reported at once, as an array — the same shape
 * the `ValidationPipe` produces — so a form marks every offending day instead of
 * surfacing the second mistake only after the first is fixed. A month is filled
 * in one screen, and one error at a time would be thirty round trips.
 */
@Injectable()
export class TimesheetFillService {
  constructor(
    private readonly workSchedule: WorkScheduleService,
    private readonly publicHolidays: PublicHolidayService,
    private readonly leaveRequests: LeaveRequestsService,
    private readonly employees: EmployeeService,
    private readonly projects: ProjectService,
  ) {}

  /**
   * Resolves everything one month is judged against.
   *
   * Four reads, three of them concurrent — the schedule, the holidays and the
   * leave are independent of each other, and a month should not pay for them in
   * series. The employment window is folded into the same batch.
   *
   * A month straddling two calendar years cannot happen (a month is inside one
   * year), so exactly one year of holidays is loaded; a holiday *span* running
   * from December into January is still handled, because the expansion works from
   * each occurrence's own dates rather than from the year it was filed under.
   *
   * Throws the work-schedule module's `404` when nothing has been configured.
   * That is the honest answer — without knowing which weekdays the company works
   * and how long a day is, no month can be judged — and the message names the
   * request that fixes it, so somebody meeting this while filling a timesheet is
   * told what is actually missing.
   */
  async planMonth(
    employeeId: string,
    month: number,
    year: number,
    now: Date,
  ): Promise<MonthPlan> {
    const span = monthSpan(month, year);

    const [schedule, holidays, leave, employment] = await Promise.all([
      this.workSchedule.find(),
      this.publicHolidays.findYear(year),
      this.leaveRequests.findApprovedInSpan(employeeId, span),
      this.employees.findEmploymentWindow(employeeId),
    ]);

    const closedDays = expandHolidays(holidays, span);
    const workingDays = new Set(schedule.workingDays);

    // The upper bound is the day the person left, or today for somebody still
    // here: a month may be filled up to the moment it has actually happened, and
    // no further. `hireDate` is the lower bound and is always known.
    const employedFrom = employment?.hireDate ?? null;
    const employedTo = employment?.terminationDate ?? now;

    const days = new Map<string, TimesheetDay>();
    const forced: ForcedEntry[] = [];

    for (
      let time = span.startDate.getTime();
      time <= span.endDate.getTime();
      time += MS_PER_DAY
    ) {
      const date = new Date(time);
      const dateKey = toDateKey(date);
      const isWorkingDay = workingDays.has(weekdayOf(date));
      const isWithinEmployment =
        employedFrom !== null &&
        date.getTime() >= startOfDay(employedFrom) &&
        date.getTime() <= startOfDay(employedTo);

      // A day nobody works, or a day outside the employment, carries nothing —
      // not even a holiday. Booking Christmas for somebody who joined in March
      // would put hours in a month they were not here for.
      const dayForced =
        isWorkingDay && isWithinEmployment
          ? buildForcedEntries(date, dateKey, closedDays, leave, schedule)
          : [];

      forced.push(...dayForced);
      days.set(dateKey, {
        date,
        dateKey,
        isWorkingDay,
        isWithinEmployment,
        forced: dayForced,
        forcedHours: sumHours(dayForced),
        weekKey: weekKeyOf(date, schedule),
      });
    }

    return { month, year, days, forced, schedule };
  }

  /**
   * The lines a brand-new draft starts with: the leave and the holidays, and
   * nothing else.
   *
   * A month opens already knowing what the company knows — that the 25th is
   * Christmas and that somebody booked the second week off — so the employee fills
   * in the days that are actually theirs to account for. It writes no `WORK`
   * lines, because nothing in the system knows what anybody did.
   */
  prepopulate(plan: MonthPlan): PreparedEntry[] {
    return plan.forced.map(toPreparedEntry);
  }

  /**
   * Turns a submitted entry set into the rows to store, or refuses it.
   *
   * **The forced lines are taken from the plan, never from the body.** Whatever a
   * client sent for a leave or a holiday day is checked against what the engine
   * computed and then discarded in favour of it, so the stored hours are the
   * company's answer rather than the client's copy of it — and a client that is
   * one save behind a newly approved leave cannot overwrite it.
   *
   * The `WORK` lines are the employee's and are stored as sent, once every rule
   * has passed. The whole set is judged before anything is written, so a month
   * that is wrong on the 30th does not leave the first twenty-nine days saved.
   *
   * Called by both `PUT .../entries` and the submission, deliberately: a draft may
   * be saved in a state that could not be submitted — that is what a draft is for
   * — but the *rules about a day* are the same at both moments, and having two
   * spellings of them would be the second one that eventually let something
   * through. What the submission adds is checked there, not here.
   */
  async assertEntriesAreValid(
    inputs: readonly EntryInput[],
    plan: MonthPlan,
  ): Promise<PreparedEntry[]> {
    const problems: string[] = [];
    const work: PreparedEntry[] = [];
    const echoedForced = new Map<string, EntryInput[]>();

    for (const input of inputs) {
      const date = new Date(input.date);
      const dateKey = toDateKey(date);
      const day = plan.days.get(dateKey);

      if (day === undefined) {
        problems.push(
          `${dateKey} is not in ${describePeriod(plan.month, plan.year)}`,
        );
        continue;
      }

      if (!this.assertDayLoggable(day, problems)) {
        continue;
      }

      if (input.type === TimesheetEntryType.WORK) {
        this.collectWorkEntry(input, date, day, plan, work, problems);
        continue;
      }

      // A leave or holiday line the client echoed back. It is checked against the
      // plan and then dropped: the engine's own copy is what gets stored.
      push(echoedForced, dateKey, input);
    }

    this.assertEchoedForcedMatch(echoedForced, plan, problems);
    assertDailyTotals(work, plan, problems);
    assertWeeklyTotals(work, plan, problems);

    await this.assertProjectsExist(work, problems);

    if (problems.length > 0) {
      throw new BadRequestException(problems);
    }

    return [...plan.forced.map(toPreparedEntry), ...work];
  }

  /**
   * The context an approval freezes, as the JSON `scheduleSnapshot` holds.
   *
   * **A photograph, not data.** Nothing queries inside it and nothing joins to
   * it; it exists so an approval can be explained years later, when the live work
   * schedule no longer resembles the one the month was signed off under. Without
   * it, opening a 2026 approval in 2028 would judge it against 2028's rules and
   * report violations of a policy that did not exist when somebody agreed to it.
   *
   * It carries the configuration *and* the forced days, because both were inputs
   * to the decision: "why does the 25th say 8 hours of holiday" is answered by the
   * second, and "why was 9 hours on the 3rd acceptable" by the first.
   */
  buildScheduleSnapshot(plan: MonthPlan): Record<string, unknown> {
    return {
      capturedFor: { month: plan.month, year: plan.year },
      workingDays: plan.schedule.workingDays,
      weekStartsOn: plan.schedule.weekStartsOn,
      standardHoursPerDay: plan.schedule.standardHoursPerDay,
      standardHoursPerWeek: plan.schedule.standardHoursPerWeek,
      maxHoursPerDay: plan.schedule.maxHoursPerDay,
      minHoursPerEntry: plan.schedule.minHoursPerEntry,
      maxHoursPerEntry: plan.schedule.maxHoursPerEntry,
      forcedDays: plan.forced.map((entry) => ({
        date: entry.dateKey,
        type: entry.type,
        hours: entry.hours,
        description: entry.description,
      })),
    };
  }

  /**
   * Whether a day may carry any entry at all, recording why not when it may not.
   *
   * Two refusals with genuinely different messages, because they send the caller
   * to two different places: a day outside the employment is a date somebody
   * mistyped or a month they should not be filling, and a non-working day is the
   * work schedule saying the company is closed. Telling somebody "you cannot log
   * the 5th" without which of the two is a support ticket.
   *
   * Returns `false` rather than throwing, so one bad day does not hide the other
   * twenty-nine.
   */
  private assertDayLoggable(day: TimesheetDay, problems: string[]): boolean {
    if (!day.isWithinEmployment) {
      problems.push(
        `${day.dateKey} falls outside this employee's employment and cannot be logged`,
      );

      return false;
    }

    if (!day.isWorkingDay) {
      problems.push(
        `${day.dateKey} is a ${weekdayOf(day.date)} and is not a working day in the configured work schedule, so nothing can be logged on it`,
      );

      return false;
    }

    return true;
  }

  /**
   * Checks one `WORK` line and keeps it, or records what is wrong with it.
   *
   * Three rules, each from configuration:
   *
   * - **a project is required.** `WORK` without one is time booked to nothing,
   *   which no report can attribute.
   * - **the entry is within the per-entry bounds**, `minHoursPerEntry` to
   *   `maxHoursPerEntry`. These are what stop a month of one-minute entries and a
   *   single line claiming a whole week.
   * - **the day still has room once the forced lines are counted.** A day
   *   already half taken by leave leaves half the ceiling, which is the case the
   *   half-day feature exists for.
   *
   * The daily and weekly *totals* are checked afterwards, over the whole set,
   * because they are statements about several lines at once.
   */
  private collectWorkEntry(
    input: EntryInput,
    date: Date,
    day: TimesheetDay,
    plan: MonthPlan,
    work: PreparedEntry[],
    problems: string[],
  ): void {
    const { minHoursPerEntry, maxHoursPerEntry } = plan.schedule;

    if (input.projectId === undefined) {
      problems.push(`${day.dateKey}: projectId is required on a WORK entry`);

      return;
    }

    if (input.hours < minHoursPerEntry || input.hours > maxHoursPerEntry) {
      problems.push(
        `${day.dateKey}: an entry must be between ${String(minHoursPerEntry)} and ${String(maxHoursPerEntry)} hours, per the configured work schedule`,
      );

      return;
    }

    work.push({
      date,
      type: TimesheetEntryType.WORK,
      hours: input.hours,
      projectId: input.projectId,
      leaveRequestId: null,
      description: input.description ?? null,
    });
  }

  /**
   * Refuses a leave or holiday line the company did not put there.
   *
   * **This is where "you cannot mark a day as leave without an approved request"
   * is enforced**, and the message says exactly that, naming the day and the
   * request to file. It is the rule most likely to be met by a real person: they
   * were away, they know they were away, and the leave request is the thing they
   * forgot.
   *
   * Three failures, all reported per day:
   *
   * - a `LEAVE` line on a day with no approved absence — the case above;
   * - a `HOLIDAY` line on a day the company was open;
   * - a line whose hours differ from the engine's, which is a client trying to
   *   resize an absence. The hours come from the work schedule, and a person who
   *   thinks a leave day is worth different hours needs the schedule changed, not
   *   the timesheet.
   *
   * A day whose forced lines the client simply *omitted* is not an error: the
   * engine writes them regardless, so a client that strips locked rows before
   * saving still gets a correct month. Only a contradiction is refused.
   */
  private assertEchoedForcedMatch(
    echoed: ReadonlyMap<string, EntryInput[]>,
    plan: MonthPlan,
    problems: string[],
  ): void {
    for (const [dateKey, inputs] of echoed) {
      const expected = plan.days.get(dateKey)?.forced ?? [];

      for (const input of inputs) {
        const match = expected.find(
          (entry) => entry.type === input.type && entry.hours === input.hours,
        );

        if (match !== undefined) {
          continue;
        }

        if (expected.some((entry) => entry.type === input.type)) {
          problems.push(
            `${dateKey}: the hours of a ${input.type} entry are set from the work schedule and cannot be changed`,
          );
          continue;
        }

        problems.push(
          input.type === TimesheetEntryType.LEAVE
            ? `${dateKey} cannot be marked as leave: there is no approved leave request covering it. File the leave request first, and it will appear on the timesheet once it is approved.`
            : `${dateKey} is not a public holiday and cannot be marked as one`,
        );
      }
    }
  }

  /**
   * Rejects work booked to a project that is not there.
   *
   * The **distinct** ids are checked, in one query, because a month naming the
   * same three projects on twenty days is three questions and not sixty. A `400`
   * rather than a `404`: the timesheet being addressed is fine, it is the
   * submitted body that names something absent.
   *
   * The projects are read through `ProjectService` rather than by querying
   * `projects` here, which is the rule every module in this project follows.
   */
  private async assertProjectsExist(
    work: readonly PreparedEntry[],
    problems: string[],
  ): Promise<void> {
    const projectIds = [
      ...new Set(
        work
          .map(({ projectId }) => projectId)
          .filter((projectId): projectId is string => projectId !== null),
      ),
    ];

    if (projectIds.length === 0) {
      return;
    }

    const known = new Set(await this.projects.findExistingIds(projectIds));

    for (const projectId of projectIds) {
      if (!known.has(projectId)) {
        problems.push(`Project ${projectId} does not exist`);
      }
    }
  }
}

/**
 * The first and last day of a month, both at UTC midnight and both inclusive.
 *
 * The same convention `leave_requests` and `public_holidays` store, so a span
 * from this function can be handed straight to the leave overlap query without a
 * translation step that would eventually get the boundary wrong.
 */
export function monthSpan(
  month: number,
  year: number,
): { startDate: Date; endDate: Date } {
  return {
    startDate: new Date(Date.UTC(year, month - 1, 1)),
    // Day 0 of the next month is the last day of this one, which also gets
    // February and the leap years right without a table.
    endDate: new Date(Date.UTC(year, month, 0)),
  };
}

/**
 * Every date the company is closed inside the span, as `YYYY-MM-DD` keys mapped
 * to the holiday's name.
 *
 * A `Map` rather than a list of ranges, so the per-day question is a hash lookup
 * instead of a scan over every holiday. The name is kept because it becomes the
 * entry's description — a client renders "Christmas Day", not "holiday".
 */
function expandHolidays(
  holidays: readonly { name: string; startDate: string; endDate: string }[],
  span: { startDate: Date; endDate: Date },
): ReadonlyMap<string, string> {
  const closed = new Map<string, string>();

  for (const holiday of holidays) {
    const start = new Date(holiday.startDate);
    const end = new Date(holiday.endDate);

    for (
      let time = start.getTime();
      time <= end.getTime();
      time += MS_PER_DAY
    ) {
      if (time < span.startDate.getTime() || time > span.endDate.getTime()) {
        continue;
      }

      closed.set(toDateKey(new Date(time)), holiday.name);
    }
  }

  return closed;
}

/**
 * What the company puts on one day whether or not the employee asks: a holiday,
 * an approved absence, or nothing.
 *
 * **A holiday wins over leave, and only one of the two is ever written.** Somebody
 * on annual leave over Christmas was not working either way, and booking both
 * would double the day — putting sixteen hours on a day nobody worked and
 * breaking the daily ceiling with lines the employee cannot remove. Which of the
 * two is recorded matters to reporting, and "the office was closed" is the truer
 * account of the day: nobody spent leave to be absent from a day the company was
 * shut.
 *
 * The hours are **always** from the schedule: a full day is
 * `standardHoursPerDay`, and a half day is half of it. There is no `4` here, and
 * a company that moves to a seven-hour day gets three and a half without anybody
 * editing this file.
 */
function buildForcedEntries(
  date: Date,
  dateKey: string,
  closedDays: ReadonlyMap<string, string>,
  leave: readonly ApprovedLeaveDay[],
  schedule: WorkScheduleEntity,
): ForcedEntry[] {
  const holidayName = closedDays.get(dateKey);

  if (holidayName !== undefined) {
    return [
      {
        dateKey,
        date,
        type: TimesheetEntryType.HOLIDAY,
        hours: schedule.standardHoursPerDay,
        leaveRequestId: null,
        description: holidayName,
      },
    ];
  }

  const absence = leave.find(
    (request) =>
      date.getTime() >= startOfDay(request.startDate) &&
      date.getTime() <= startOfDay(request.endDate),
  );

  if (absence === undefined) {
    return [];
  }

  return [
    {
      dateKey,
      date,
      type: TimesheetEntryType.LEAVE,
      hours: absence.isHalfDay
        ? schedule.standardHoursPerDay / 2
        : schedule.standardHoursPerDay,
      leaveRequestId: absence.id,
      description: describeAbsence(absence),
    },
  ];
}

/** `Annual Leave (first half)` — the leave type, and which half if it is one. */
function describeAbsence(absence: ApprovedLeaveDay): string {
  if (!absence.isHalfDay) {
    return absence.leaveTypeLabel;
  }

  const half =
    absence.halfDayPortion === LeaveHalfDayPortion.FIRST_HALF
      ? 'first half'
      : 'second half';

  return `${absence.leaveTypeLabel} (${half})`;
}

/**
 * Refuses a day whose lines add up to more than the configured ceiling.
 *
 * The check is over the **whole day at once** — every `WORK` line plus whatever
 * the engine forced onto it — which is the reason it runs here rather than per
 * entry: three hours on one project and six on another are each perfectly legal
 * and together are not, and no per-line rule could say so.
 *
 * `maxHoursPerDay` is the ceiling and it is configured. A day *under* the
 * standard is not an error and is never reported: six hours on an eight-hour day
 * is a short day, and refusing to save one would make a draft impossible to build
 * up over a week.
 */
function assertDailyTotals(
  work: readonly PreparedEntry[],
  plan: MonthPlan,
  problems: string[],
): void {
  const byDay = new Map<string, number>();

  for (const entry of work) {
    const dateKey = toDateKey(entry.date);

    byDay.set(dateKey, (byDay.get(dateKey) ?? 0) + entry.hours);
  }

  for (const [dateKey, workedHours] of byDay) {
    const day = plan.days.get(dateKey);

    if (day === undefined) {
      continue;
    }

    const total = round(workedHours + day.forcedHours);

    if (total > plan.schedule.maxHoursPerDay) {
      problems.push(
        `${dateKey}: ${String(total)} hours exceeds the configured maximum of ${String(plan.schedule.maxHoursPerDay)} hours per day` +
          (day.forcedHours > 0
            ? ` (${String(day.forcedHours)} of which are leave or holiday hours that cannot be removed)`
            : ''),
      );
    }
  }
}

/**
 * Refuses a week whose lines add up to more than the configured ceiling.
 *
 * Two things about how a week is decided, and both are the point:
 *
 * 1. **Where the week starts is configuration.** Days are grouped by
 *    `WorkSchedule.weekStartsOn` — see {@link weekKeyOf} — so a company whose
 *    working week begins on Sunday has its week counted as one bucket. A Monday
 *    assumed here would split that company's week in two, and a ceiling checked
 *    over half a week each time is a ceiling that never binds.
 * 2. **Only the part of the week inside this month counts.** A week straddling
 *    the 1st is validated on the days that belong to *this* timesheet, because the
 *    other days belong to another timesheet this request cannot see and must not
 *    guess at. It is a deliberate under-approximation: a person could exceed a
 *    weekly ceiling across a month boundary and no single request would notice.
 *    The alternative — reading the neighbouring month — would make one timesheet's
 *    validity depend on another's contents, so that saving September could start
 *    failing because somebody edited August. That trade is recorded in the feature
 *    document rather than hidden here.
 *
 * The forced hours count towards the week exactly as they do towards the day: a
 * week with two days of approved leave has less room for work, which is the
 * honest arithmetic.
 */
function assertWeeklyTotals(
  work: readonly PreparedEntry[],
  plan: MonthPlan,
  problems: string[],
): void {
  const byWeek = new Map<string, number>();

  for (const day of plan.days.values()) {
    if (day.forcedHours > 0) {
      byWeek.set(day.weekKey, (byWeek.get(day.weekKey) ?? 0) + day.forcedHours);
    }
  }

  for (const entry of work) {
    const day = plan.days.get(toDateKey(entry.date));

    if (day === undefined) {
      continue;
    }

    byWeek.set(day.weekKey, (byWeek.get(day.weekKey) ?? 0) + entry.hours);
  }

  for (const [weekKey, hours] of byWeek) {
    const total = round(hours);

    if (total > plan.schedule.standardHoursPerWeek) {
      problems.push(
        `The week beginning ${weekKey}: ${String(total)} hours exceeds the configured maximum of ${String(plan.schedule.standardHoursPerWeek)} hours per week, counting only the days of this week that fall in ${describePeriod(plan.month, plan.year)}`,
      );
    }
  }
}

/**
 * Which week a date belongs to, as the date key of that week's first day.
 *
 * The key may fall in the previous month — a week beginning on the 29th of
 * September contains the 1st of October — and that is correct and deliberate: it
 * is what makes the two ends of a straddling week group together instead of
 * becoming two half-weeks. Only the days inside the month contribute hours to it;
 * see {@link assertWeeklyTotals}.
 */
function weekKeyOf(date: Date, schedule: WorkScheduleEntity): string {
  const offset = daysSinceWeekStart(date, schedule.weekStartsOn);

  return toDateKey(new Date(date.getTime() - offset * MS_PER_DAY));
}

/** The engine's own line, in the shape the lifecycle service persists. */
function toPreparedEntry(entry: ForcedEntry): PreparedEntry {
  return {
    date: entry.date,
    type: entry.type,
    hours: entry.hours,
    projectId: null,
    leaveRequestId: entry.leaveRequestId,
    description: entry.description,
  };
}

function sumHours(entries: readonly { hours: number }[]): number {
  return round(entries.reduce((total, { hours }) => total + hours, 0));
}

/**
 * Rounds a running total to the two decimals the column stores.
 *
 * The values themselves are exact in the database — `decimal(5, 2)` — but they
 * are summed here as doubles, where `0.1 + 0.2` is famously not `0.3`. Without
 * this, a day of `2.4 + 2.4 + 3.2` would come out a hair above `8` and be refused
 * against an eight-hour ceiling it exactly meets. Rounding to the stored
 * precision before comparing is what makes the boundary behave the way the person
 * entering it expects.
 */
function round(value: number): number {
  return Math.round(value * 100) / 100;
}

/** The UTC midnight of a date, so two calendar days compare as days. */
function startOfDay(date: Date): number {
  return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
}

/** Appends to a list held in a map, creating the list on first use. */
function push<T>(map: Map<string, T[]>, key: string, value: T): void {
  const existing = map.get(key);

  if (existing === undefined) {
    map.set(key, [value]);

    return;
  }

  existing.push(value);
}
