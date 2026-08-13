import { OmitType } from '@nestjs/swagger';

import type { Prisma } from '../../../generated/prisma/client';
import {
  TIMESHEET_BASE_SELECT,
  TimesheetBaseRow,
  TimesheetEntity,
  TimesheetHours,
  toTimesheetBase,
} from './timesheet.entity';

/**
 * One row of the administrative review list: whose month it is, where it stands,
 * and what it adds up to.
 *
 * **Everything a reviewer needs to triage, and not one entry.** That is the
 * deliberate omission and the reason this type exists beside
 * {@link TimesheetEntity}: a page of a hundred months, each with thirty days and
 * several lines a day, would carry three thousand nested objects to render a
 * table whose widest column says "168.00". The lines are what `GET
 * /timesheets/:id` is for, and that is the screen somebody opens when a row looks
 * wrong.
 *
 * The four hour figures **are** here, and that is the other half of the same
 * decision. They are what makes a row triageable — a month showing 40 worked
 * hours and 128 of leave needs no click, and one showing 210 needs one
 * immediately — and they cost one `groupBy` for the whole page rather than a
 * query per row.
 *
 * `employee` carries the department and the position because the list filters and
 * searches on them: a client that can narrow by department has to be able to show
 * which one each row belongs to, and searching by position means nothing if the
 * position is invisible.
 *
 * `scheduleSnapshot` is absent. It is a JSON blob per row, read by nobody
 * triaging, and a hundred copies of a configuration would be the largest thing on
 * the page.
 *
 * `OmitType` rather than the `Omit<…>` alias this was until Feature 038, and it
 * is the same subtraction: the helper produces a real class whose instance type
 * is `Omit<TimesheetEntity, 'entries' | 'scheduleSnapshot'>` and whose schema
 * the documentation can reference. Naming the two removed fields still fails the
 * build if either is renamed on `TimesheetEntity`, which is the property that
 * made the alias worth writing in the first place.
 */
export class TimesheetListRowEntity extends OmitType(TimesheetEntity, [
  'entries',
  'scheduleSnapshot',
] as const) {}

/**
 * What the administrative list reads: the header and its two joined records.
 *
 * The same base as the detail select, with neither the entries nor the snapshot.
 * Declared as a distinct constant rather than reused directly so that adding a
 * column to one view is a deliberate act on the other — a list and a detail
 * screen answer different questions, and the day they diverge this is the line
 * that changes.
 */
export const TIMESHEET_LIST_SELECT = {
  ...TIMESHEET_BASE_SELECT,
} as const satisfies Prisma.TimesheetSelect;

/** A row read through {@link TIMESHEET_LIST_SELECT}. */
export type TimesheetListRow = TimesheetBaseRow;

/**
 * Maps a row and its totals onto the resource the list returns.
 *
 * The totals come from the caller's single `groupBy` rather than from a query
 * here — see {@link TimesheetHours} — and a timesheet with no lines is mapped
 * with zeros rather than omitted, because a submitted month that accounts for
 * nothing is exactly the row a reviewer most needs to see.
 */
export function toTimesheetListRowEntity(
  timesheet: TimesheetListRow,
  hours: TimesheetHours,
): TimesheetListRowEntity {
  return { ...toTimesheetBase(timesheet), ...hours };
}
