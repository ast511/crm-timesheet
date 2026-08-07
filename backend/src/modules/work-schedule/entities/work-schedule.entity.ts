import { toIsoTimestamp } from '../../../common/utils/date.util';
import type { Prisma } from '../../../generated/prisma/client';
import type { Weekday } from '../../../generated/prisma/enums';
import type { WorkScheduleModel } from '../../../generated/prisma/models';

/**
 * The working schedule as the API exposes it.
 *
 * It exists for the reason every other entity in this project does: the row and
 * the resource are two different contracts that only happen to agree today, and
 * returning `WorkScheduleModel` straight from a handler would publish every
 * column added to the table later, the moment it was added.
 *
 * Two differences are visible here rather than incidental:
 *
 * - **the hours are `number`, not `Decimal`.** The column type is exact
 *   arithmetic; the payload is JSON, where a `Decimal` instance would serialise
 *   as `{"s":1,"e":0,"d":[8]}` unless something converted it. {@link toHours}
 *   is that something, and it runs in exactly one place.
 * - **`id` is absent.** There is one configuration and its key is a constant,
 *   so publishing it would invite a client to address it — and every route in
 *   this module already addresses it without one.
 */
export interface WorkScheduleEntity {
  workingDays: Weekday[];
  /**
   * Which weekday a working week begins on. Added by Feature 030, which is the
   * first consumer that has to group days into weeks — see the schema comment on
   * the column for why it is configured rather than assumed.
   */
  weekStartsOn: Weekday;
  workStartTime: string;
  workEndTime: string;
  /**
   * The IANA zone the two wall-clock times above, and every calendar day in the
   * application, are read in. Published so a client can show the current value
   * and pre-fill the editor — without it the field would be writable through the
   * `PUT` and invisible to the form that has to send it back.
   */
  timezone: string;
  minHoursPerEntry: number;
  maxHoursPerEntry: number;
  maxHoursPerDay: number;
  standardHoursPerDay: number;
  standardHoursPerWeek: number;
  /** Recorded, published, and subtracted from nothing. See the module doc. */
  lunchBreakHours: number;
  createdAt: string;
  updatedAt: string;
}

/**
 * The columns every query in `WorkScheduleService` reads.
 *
 * A `select` rather than an `include`: `include` would drag the whole
 * `approvalEmails` collection into a response that has its own endpoint for
 * them, and would keep publishing every column added to `work_schedules`
 * later. `id` is read by neither — the service addresses the row by a constant,
 * so it already knows it.
 *
 * `satisfies Prisma.WorkScheduleSelect` checks the keys against the model
 * without widening the constant, so a column renamed in `schema.prisma` breaks
 * the build here instead of at runtime.
 */
export const WORK_SCHEDULE_PUBLIC_SELECT = {
  workingDays: true,
  weekStartsOn: true,
  workStartTime: true,
  workEndTime: true,
  timezone: true,
  minHoursPerEntry: true,
  maxHoursPerEntry: true,
  maxHoursPerDay: true,
  standardHoursPerDay: true,
  standardHoursPerWeek: true,
  lunchBreakHours: true,
  createdAt: true,
  updatedAt: true,
} as const satisfies Prisma.WorkScheduleSelect;

/**
 * A `work_schedules` row read through {@link WORK_SCHEDULE_PUBLIC_SELECT}.
 *
 * Spelled as a `Pick` of the model rather than as a free-standing interface, so
 * a `select` left off a query produces a row the mapper will not accept — the
 * same compile-time trip-wire the other modules use.
 */
export type PublicWorkScheduleRow = Pick<
  WorkScheduleModel,
  keyof typeof WORK_SCHEDULE_PUBLIC_SELECT
>;

/** Maps a `work_schedules` row onto the resource the endpoints return. */
export function toWorkScheduleEntity(
  schedule: PublicWorkScheduleRow,
): WorkScheduleEntity {
  return {
    workingDays: schedule.workingDays,
    weekStartsOn: schedule.weekStartsOn,
    workStartTime: schedule.workStartTime,
    workEndTime: schedule.workEndTime,
    timezone: schedule.timezone,
    minHoursPerEntry: toHours(schedule.minHoursPerEntry),
    maxHoursPerEntry: toHours(schedule.maxHoursPerEntry),
    maxHoursPerDay: toHours(schedule.maxHoursPerDay),
    standardHoursPerDay: toHours(schedule.standardHoursPerDay),
    standardHoursPerWeek: toHours(schedule.standardHoursPerWeek),
    lunchBreakHours: toHours(schedule.lunchBreakHours),
    createdAt: toIsoTimestamp(schedule.createdAt),
    updatedAt: toIsoTimestamp(schedule.updatedAt),
  };
}

/**
 * Renders a `decimal` column as the plain number a JSON body carries.
 *
 * The conversion is lossless in both directions here, and that is a property of
 * the column rather than of `Decimal`: `decimal(5, 2)` holds at most `999.99`,
 * and every two-decimal value in that range is exactly representable as a
 * double. Storage stays exact — the column is what the Timesheets module will
 * sum — while the wire stays a number a client can add up without a library.
 */
function toHours(value: Prisma.Decimal): number {
  return value.toNumber();
}
