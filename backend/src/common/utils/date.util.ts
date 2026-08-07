import { Weekday } from '../../generated/prisma/enums';

/**
 * The project's single definition of "a timestamp in an API payload":
 * ISO-8601, in UTC.
 *
 * Small on purpose. It exists so the format is a decision recorded in one file
 * rather than a `toISOString()` call repeated at every producer — the error
 * envelope today, response DTOs that expose `createdAt` / `updatedAt`
 * tomorrow.
 *
 * It also holds the *calendar* facts more than one module needs — which weekday
 * a date is, how far it is into its week, and what its date key is — for the
 * reason `@IsRelationId()` moved into `common/decorators`: the first consumer
 * being a leave request is not a reason to file a statement about `Date` inside
 * the leave module.
 *
 * **Nothing here decides policy.** Which days are worked and which weekday a week
 * begins on are `WorkSchedule.workingDays` and `WorkSchedule.weekStartsOn` —
 * configuration, per deployment — and these functions take them as arguments
 * rather than assuming them.
 */

/** Renders a date as an ISO-8601 UTC string. Defaults to the current time. */
export function toIsoTimestamp(date: Date = new Date()): string {
  return date.toISOString();
}

/**
 * The same rendering for a column that may hold no date at all.
 *
 * Separate from {@link toIsoTimestamp} rather than folded into it, because that
 * function defaults an *absent* argument to "now" — exactly the wrong answer for
 * a `null` a nullable column deliberately stores. Feature 011 is the first
 * resource with optional dates (`Project.startDate` / `endDate`); the vacations
 * and time-entry features have more, so the null-handling is written once here
 * instead of as a ternary in each entity mapper.
 */
export function toNullableIsoTimestamp(date: Date | null): string | null {
  return date === null ? null : toIsoTimestamp(date);
}

/**
 * `Date.getUTCDay()` counts from Sunday; the `Weekday` enum is declared
 * Monday-first, because that is the order a European calendar renders. This
 * array is the one place the two vocabularies are reconciled — indexed by the
 * number `getUTCDay()` returns, so the translation is a lookup rather than
 * arithmetic somebody has to re-derive at each call site.
 *
 * **The order here is a spelling, not a policy.** It says nothing about which
 * day a *working week* begins on: that is
 * `WorkSchedule.weekStartsOn`, configured per deployment, because the week
 * begins on Sunday in much of the world and on Saturday in some of it. Nothing
 * in this file groups days into weeks.
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
 * Which weekday a date falls on, named the way `WorkSchedule.workingDays` names
 * one.
 *
 * **Read in UTC, always.** The date columns in this schema hold UTC midnight for
 * a calendar day a client posted as `2026-09-07`, so reading a *local* weekday
 * would make the answer depend on where the server is deployed: a Monday west of
 * Greenwich is the previous Sunday, which turns a perfectly ordinary working day
 * into a weekend and refuses an entry somebody made correctly.
 *
 * It lives here rather than in either module that asks, because two of them now
 * do — `WorkingDaysService` counts the working days in a leave span, and
 * `TimesheetFillService` decides whether a day may be logged at all — and a
 * second copy of the lookup would be the one that eventually started at Monday.
 *
 * It answers *which day this is* and nothing about whether that day is worked.
 * Only `WorkSchedule.workingDays` says that, which is what lets a company that
 * works Saturdays configure it rather than argue with a constant.
 */
export function weekdayOf(date: Date): Weekday {
  return WEEKDAY_BY_UTC_DAY[date.getUTCDay()];
}

/**
 * How far a date is past the start of its week, in whole days, given the weekday
 * the week begins on.
 *
 * `0` on the first day of the week and `6` on the last, for **any**
 * `weekStartsOn` — which is the whole reason it takes one. Grouping timesheet
 * days into weeks with a Monday baked in would split the week of a company that
 * begins on Sunday across two buckets, and a weekly ceiling checked over half a
 * week each time is a ceiling nothing enforces.
 *
 * Pure arithmetic over the two `Weekday` positions, `mod 7`, so no calendar walk
 * and no date construction is involved: the caller subtracts this many days to
 * find the start of the week the date belongs to.
 */
export function daysSinceWeekStart(date: Date, weekStartsOn: Weekday): number {
  const WEEK_LENGTH = WEEKDAY_BY_UTC_DAY.length;

  const dayIndex = WEEKDAY_BY_UTC_DAY.indexOf(weekdayOf(date));
  const startIndex = WEEKDAY_BY_UTC_DAY.indexOf(weekStartsOn);

  return (dayIndex - startIndex + WEEK_LENGTH) % WEEK_LENGTH;
}

/**
 * `2026-09-07` — the UTC calendar date, without the time nobody entered.
 *
 * The key every per-day lookup in this project is built on: a `Set` or a `Map` of
 * these answers "is the company closed that day" as a hash lookup instead of a
 * scan over every holiday span. Shared for the same reason {@link weekdayOf} is —
 * two modules were slicing the same ten characters off the same ISO string.
 */
export function toDateKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}
