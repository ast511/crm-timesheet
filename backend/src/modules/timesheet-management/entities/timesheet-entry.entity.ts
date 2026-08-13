import { toIsoTimestamp } from '../../../common/utils/date.util';
import type { Prisma } from '../../../generated/prisma/client';
import { TimesheetEntryType } from '../../../generated/prisma/enums';
import type {
  ProjectModel,
  TimesheetEntryModel,
} from '../../../generated/prisma/models';

/**
 * The project a line was booked to, as a timesheet names one.
 *
 * Checked against a `Pick` of the owning module's row, so renaming a column in
 * `schema.prisma` breaks the build here instead of producing a nested object
 * with a field that no longer exists — see `EmployeeEntity` for why Feature 038
 * turned these from aliases into classes checked against the same `Pick`.
 *
 * `code`, `name` and `clientName` and nothing else: a timesheet row renders "what
 * was this, and who is it for". The status, the priority, the budget and the
 * colour belong to the project screen, and publishing them here would make every
 * column added to `projects` part of a timesheet's contract.
 */
export class TimesheetProjectSummary implements Pick<
  ProjectModel,
  'id' | 'code' | 'name' | 'clientName'
> {
  id!: string;
  code!: string;
  name!: string;
  clientName!: string;
}

/**
 * One line of a timesheet, as the API exposes it.
 *
 * Three differences from the `timesheet_entries` row:
 *
 * 1. **`projectId` is gone**, replaced by the project it points at, so a client
 *    renders a row without a second request. Nothing is lost — the nested object
 *    carries its `id`, which is what a form posts back.
 * 2. **`hours` is a `number`, not a `Decimal`.** The column is exact arithmetic;
 *    the payload is JSON, where a `Decimal` instance would serialise as
 *    `{"s":1,"e":0,"d":[8]}` unless something converted it. The same call
 *    `WorkScheduleEntity` makes, and the conversion is lossless in both
 *    directions because `decimal(5, 2)` tops out at `999.99`.
 * 3. **`isLocked` is here and is in no column.** See below.
 */
export class TimesheetEntryEntity {
  id!: string;
  /** The calendar day, ISO-8601 at UTC midnight. */
  date!: string;
  type!: TimesheetEntryType;
  hours!: number;
  /** The project, or `null` on a `LEAVE` or `HOLIDAY` line — nobody was working. */
  project!: TimesheetProjectSummary | null;
  /**
   * The approved absence a `LEAVE` line is justified by; `null` on the other two.
   *
   * An id rather than the request itself, because a timesheet screen does not
   * render a leave request — it renders that the day was leave. The id is what a
   * client follows to `GET /api/v1/me/leave-requests/:id` if somebody clicks.
   */
  leaveRequestId!: string | null;
  description!: string | null;
  /**
   * Whether this line is the fill-in engine's rather than the employee's.
   *
   * **Derived from `type`, and published anyway.** `LEAVE` and `HOLIDAY` lines
   * are produced from the approved leave requests and the public holidays, and
   * their type and hours are refused on the way in — see `TimesheetFillService`.
   * A client has to draw them differently: greyed, without a delete button, with
   * the project picker hidden.
   *
   * It is a field rather than a rule the frontend re-derives because the rule is
   * this module's and will change here first — the day a fourth entry type
   * exists, a client that had hard-coded "leave and holiday are locked" would
   * silently offer an editable row the API then refuses.
   */
  isLocked!: boolean;
  createdAt!: string;
  updatedAt!: string;
}

/**
 * The columns every entry read in this module selects.
 *
 * A `select` rather than an `include`, and here that choice does real work: this
 * row joins to `projects`, and `include` would return every column of it —
 * budget, colour, archive flag — and would keep publishing every column added
 * later.
 *
 * `satisfies Prisma.TimesheetEntrySelect` checks the keys against the model
 * without widening the constant, so a column renamed in `schema.prisma` breaks
 * the build here instead of at runtime.
 *
 * `timesheetId` is deliberately not selected: an entry is only ever read through
 * its timesheet, which already knows its own id, so publishing it would repeat
 * the parent on every child.
 */
export const TIMESHEET_ENTRY_PUBLIC_SELECT = {
  id: true,
  date: true,
  type: true,
  hours: true,
  leaveRequestId: true,
  description: true,
  project: { select: { id: true, code: true, name: true, clientName: true } },
  createdAt: true,
  updatedAt: true,
} as const satisfies Prisma.TimesheetEntrySelect;

/**
 * A `timesheet_entries` row read through {@link TIMESHEET_ENTRY_PUBLIC_SELECT}.
 *
 * Spelled as a `Pick` of the scalars plus the nested shape, so a `select` left
 * off a query produces a row the mapper will not accept — the same compile-time
 * trip-wire every module here uses.
 */
export type TimesheetEntryRow = Pick<
  TimesheetEntryModel,
  | 'id'
  | 'date'
  | 'type'
  | 'hours'
  | 'leaveRequestId'
  | 'description'
  | 'createdAt'
  | 'updatedAt'
> & {
  project: TimesheetProjectSummary | null;
};

/** Maps a `timesheet_entries` row onto the resource the endpoints return. */
export function toTimesheetEntryEntity(
  entry: TimesheetEntryRow,
): TimesheetEntryEntity {
  return {
    id: entry.id,
    date: toIsoTimestamp(entry.date),
    type: entry.type,
    hours: toHours(entry.hours),
    project:
      entry.project === null
        ? null
        : {
            id: entry.project.id,
            code: entry.project.code,
            name: entry.project.name,
            clientName: entry.project.clientName,
          },
    leaveRequestId: entry.leaveRequestId,
    description: entry.description,
    isLocked: isLockedType(entry.type),
    createdAt: toIsoTimestamp(entry.createdAt),
    updatedAt: toIsoTimestamp(entry.updatedAt),
  };
}

/**
 * Which entry types the employee does not own.
 *
 * The single statement of the rule, read by the mapper above and by the fill-in
 * engine's refusals, so what a client is *told* is locked and what the API
 * actually refuses cannot drift apart.
 */
export function isLockedType(type: TimesheetEntryType): boolean {
  return type !== TimesheetEntryType.WORK;
}

/**
 * Renders a `decimal` column as the plain number a JSON body carries.
 *
 * The same conversion `WorkScheduleEntity` makes, and lossless for the same
 * reason: `decimal(5, 2)` holds at most `999.99`, and every two-decimal value in
 * that range is exactly representable as a double. Storage stays exact — these
 * are the numbers the daily and weekly ceilings are compared against — while the
 * wire stays a number a client can add up without a library.
 */
function toHours(value: Prisma.Decimal): number {
  return value.toNumber();
}
