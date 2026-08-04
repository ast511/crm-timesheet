import { Injectable } from '@nestjs/common';

import { Weekday } from '../../generated/prisma/enums';
import { PublicHolidayService } from '../public-holidays/public-holiday.service';
import { WorkScheduleService } from '../work-schedule/work-schedule.service';
import { MS_PER_DAY } from './leave-request.constants';

/**
 * `Date.getUTCDay()` counts from Sunday; the `Weekday` enum is declared
 * Monday-first, because that is the order the business works in. This array is
 * the one place the two vocabularies are reconciled — indexed by the number
 * `getUTCDay()` returns, so the translation is a lookup rather than arithmetic
 * somebody has to re-derive at each call site.
 */
const WEEKDAY_BY_UTC_DAY: readonly Weekday[] = [
  Weekday.SUNDAY,
  Weekday.MONDAY,
  Weekday.TUESDAY,
  Weekday.WEDNESDAY,
  Weekday.THURSDAY,
  Weekday.FRIDAY,
  Weekday.SATURDAY,
];

/**
 * Counts working days over a span, against a company calendar loaded once.
 *
 * It is an object rather than a method because the answer depends on two tables
 * that do not change between the rows of one page: the work schedule and the
 * public holidays. A list of fifty requests needs fifty counts and exactly two
 * queries, and this is the shape that makes that true without any caller having
 * to remember it.
 */
export interface WorkingDayCalculator {
  /**
   * How many working days lie between two dates, both ends inclusive.
   *
   * Returns `0` for a span that contains none — a Saturday-to-Sunday request, or
   * one wholly inside a shutdown. That is an honest answer rather than an error;
   * whether a request consuming nothing is acceptable is a rule for the caller.
   */
  countBetween(startDate: Date, endDate: Date): number;

  /** Whether one particular date is worked. */
  isWorkingDay(date: Date): boolean;
}

/**
 * The whole of "how many days of leave is this actually", in one place.
 *
 * **Nothing about the answer is stored**, which is the decision the rest of this
 * feature is built on. A span's working-day count depends on three things the
 * company keeps editing — which weekdays it works, which days it is closed, and
 * the span itself — so a column holding the number would freeze an answer its
 * own inputs could later contradict. Correcting a public holiday HR entered on
 * the wrong date would leave every request that spanned it carrying a count
 * nothing in the database agrees with, and no reader could say which of the two
 * was right. Computing it means the count is always a statement about the
 * calendar as it is now.
 *
 * The four things the calculation considers, and where each comes from:
 *
 * - **Which weekdays the company works** — `WorkSchedule.workingDays`, read
 *   through `WorkScheduleService`. Feature 016 wrote that configuration and said
 *   nothing would compute against it until a feature had a reason to; this is
 *   that feature.
 * - **Saturdays and Sundays** — excluded *because they are not in
 *   `workingDays`*, not by a rule of their own. That is deliberate: a company
 *   that works Saturdays says so in its schedule, and a hard-coded weekend rule
 *   would then contradict the configuration on every request. One source of
 *   truth, and the weekend is a consequence of it.
 * - **Public holidays** — every day covered by a holiday in force that year,
 *   read through `PublicHolidayService.findYear`, which Feature 019 made
 *   historically correct: a request in 2026 is counted against the holidays 2026
 *   actually had, not against today's calendar.
 * - **The span**, both ends inclusive, matching how the dates are stored.
 *
 * Everything is computed in UTC on both sides. The columns are `timestamp` and a
 * client posting `2026-09-07` gets UTC midnight, so reading a local weekday
 * would make the count depend on where the server is deployed — a Monday west of
 * Greenwich would be the previous Sunday, and a five-day request would come back
 * as four. The same reasoning `occurrenceSpanIn` rests on.
 */
@Injectable()
export class WorkingDaysService {
  constructor(
    private readonly workSchedule: WorkScheduleService,
    private readonly publicHolidays: PublicHolidayService,
  ) {}

  /**
   * Loads the company calendar for the years given, and returns something that
   * can count any span inside them.
   *
   * The years are asked for up front rather than discovered per span, because
   * that is what collapses a page of requests into two queries. A caller passes
   * the union of the years its spans touch — {@link yearsSpannedBy} builds that
   * set — and every `countBetween` afterwards is pure arithmetic.
   *
   * **A span outside the loaded years is not an error and is not special-cased.**
   * Its holidays simply were not loaded, so those days would count as worked.
   * Every caller in this module derives its year set from the same spans it then
   * counts, so the case does not arise; stating it here is what keeps that a
   * property somebody can check rather than an assumption.
   *
   * Throws the work-schedule module's `404` when no schedule has been
   * configured. That is the honest answer — without knowing which weekdays the
   * company works, a day count is not a number this service can guess — and the
   * message says exactly which request to send to fix it.
   */
  async createCalculator(
    years: Iterable<number>,
  ): Promise<WorkingDayCalculator> {
    const [workingDays, closedDates] = await Promise.all([
      this.workSchedule.findWorkingDays(),
      this.findClosedDates(years),
    ]);

    return buildCalculator(new Set(workingDays), closedDates);
  }

  /**
   * Every calendar date the company is closed, across the years given, as
   * `YYYY-MM-DD` keys.
   *
   * The years are read concurrently, and each holiday's span is expanded into
   * one key per day it covers — a `Set` rather than a list of ranges, so the
   * per-day question below is a hash lookup instead of a scan over every
   * holiday. A holiday spanning New Year appears in the year it begins and
   * contributes its days to both, which is why the expansion works from the span
   * rather than from the year it was filed under.
   */
  private async findClosedDates(years: Iterable<number>): Promise<Set<string>> {
    const calendars = await Promise.all(
      [...years].map((year) => this.publicHolidays.findYear(year)),
    );

    const closedDates = new Set<string>();

    for (const occurrence of calendars.flat()) {
      const start = new Date(occurrence.startDate);
      const end = new Date(occurrence.endDate);

      for (let day = start.getTime(); day <= end.getTime(); day += MS_PER_DAY) {
        closedDates.add(toDateKey(new Date(day)));
      }
    }

    return closedDates;
  }
}

/**
 * The counting itself, over a calendar that has already been loaded.
 *
 * A free function closing over the two sets, rather than a class: it holds no
 * dependencies, does no I/O, and every question it answers is decided by its two
 * arguments — which is what makes the rule testable without a database.
 *
 * The walk is day by day. An arithmetic shortcut — whole weeks times the working
 * days in one, plus the remainder — would be faster and would then need its own
 * correction for holidays, which do not distribute evenly over weeks; at the
 * span lengths this feature admits (a year at most, capped by
 * `LEAVE_REQUEST_MAX_SPAN_DAYS`) the loop is a few hundred hash lookups, and
 * being obviously right is worth more than being fast here.
 */
function buildCalculator(
  workingDays: ReadonlySet<Weekday>,
  closedDates: ReadonlySet<string>,
): WorkingDayCalculator {
  const isWorkingDay = (date: Date): boolean =>
    workingDays.has(WEEKDAY_BY_UTC_DAY[date.getUTCDay()]) &&
    !closedDates.has(toDateKey(date));

  return {
    isWorkingDay,
    countBetween(startDate: Date, endDate: Date): number {
      let count = 0;

      // `<=` because both ends are inclusive: a one-day request stores the same
      // date twice and must come out as one day, not zero.
      for (
        let day = startDate.getTime();
        day <= endDate.getTime();
        day += MS_PER_DAY
      ) {
        if (isWorkingDay(new Date(day))) {
          count += 1;
        }
      }

      return count;
    },
  };
}

/**
 * Every calendar year a set of spans touches.
 *
 * Built from both ends of each span rather than from the start alone, so a
 * request running from December into January loads both years' holidays — the
 * case a "year of the start date" shortcut gets wrong, and gets wrong silently,
 * by counting January's holidays as ordinary working days.
 */
export function yearsSpannedBy(
  spans: readonly { startDate: Date; endDate: Date }[],
): Set<number> {
  const years = new Set<number>();

  for (const { startDate, endDate } of spans) {
    for (
      let year = startDate.getUTCFullYear();
      year <= endDate.getUTCFullYear();
      year += 1
    ) {
      years.add(year);
    }
  }

  return years;
}

/** `2026-09-07` — the UTC calendar date, which is what "a day off" means. */
function toDateKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}
