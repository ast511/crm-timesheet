import { IsIn, IsOptional, MaxLength } from 'class-validator';

import { IsRelationId } from '../../../common/decorators/is-relation-id.decorator';
import { Trim } from '../../../common/decorators/trim.decorator';
import { SortQueryDto } from '../../../common/dto/sort-query.dto';
import { TimesheetStatus } from '../../../generated/prisma/enums';
import {
  DEFAULT_TIMESHEET_SORT_FIELD,
  TIMESHEET_SEARCH_MAX_LENGTH,
  TIMESHEET_SORT_FIELDS,
  TimesheetSortField,
} from '../timesheet-management.constants';
import {
  IsTimesheetQueryMonth,
  IsTimesheetQueryYear,
} from './timesheet-management-field.decorators';

/**
 * Query parameters of `GET /api/v1/timesheets/me?month=&year=`.
 *
 * **Both are required**, and that is the point of the endpoint: a timesheet is
 * one person's account of *one* month, so "my timesheet" without a period names
 * nothing. Defaulting to the current month was the obvious alternative and was
 * rejected — a client that forgot the parameters would silently get a different
 * month on the 1st than it got on the 31st, and the bug would surface as somebody
 * filling in the wrong month.
 *
 * There is no pagination and no sorting, because there is at most one row: the
 * `(employee_id, month, year)` unique constraint is what makes that a guarantee
 * rather than an expectation.
 */
export class MyTimesheetQueryDto {
  @IsTimesheetQueryMonth()
  readonly month!: number;

  @IsTimesheetQueryYear()
  readonly year!: number;
}

/**
 * Query parameters of `GET /api/v1/timesheets` — the administrative review list.
 *
 * Extends `SortQueryDto`, so `page`, `limit` and `sortOrder` are inherited from
 * Feature 006 rather than redeclared, and only `sortBy` — whose legal values
 * differ per resource — is stated here.
 *
 * **`month` and `year` are optional here and required on `/me`**, and the
 * asymmetry is not an oversight. The employee's endpoint is about one month; the
 * administrator's is a queue, and "everything still waiting, whatever month it is
 * for" is the query somebody actually runs on a Monday morning. Requiring a
 * period would make the most useful reading of this list impossible to ask for.
 *
 * **There is no `?status=DRAFT`, and asking for one returns nothing rather than
 * failing.** The status filter narrows a set that never contained drafts — see
 * `ADMIN_VISIBLE_TIMESHEET_STATUSES` — so the parameter is validated against the
 * whole enum and then intersected with what is visible. Rejecting `DRAFT` outright
 * would have been a `400` that confirms drafts exist; returning an empty page is
 * the honest answer to "show me the drafts", which is: you cannot see any.
 *
 * **There is no `?employeeId=`.** Feature 015 established that a scope belongs in
 * the URL rather than in a filter, and one person's timesheets are reached
 * through their own `/me` endpoints. A second way to ask the same question would
 * be exactly the duplication that feature removed.
 */
export class TimesheetQueryDto extends SortQueryDto {
  /**
   * `?search=` — matched against the employee's name, code and position.
   *
   * Case-insensitive and trimmed. Bounded so a huge term cannot be pushed into a
   * `LIKE` scan; an empty string after trimming is treated as no search rather
   * than as a term that matches everything.
   */
  @IsOptional()
  @Trim()
  @MaxLength(TIMESHEET_SEARCH_MAX_LENGTH)
  readonly search?: string;

  /** `?month=` — narrows to one period. Combines with `year` by `AND`. */
  @IsOptional()
  @IsTimesheetQueryMonth()
  readonly month?: number;

  @IsOptional()
  @IsTimesheetQueryYear()
  readonly year?: number;

  /**
   * `?status=` — where the month stands.
   *
   * Validated against the whole `TimesheetStatus` enum rather than only the three
   * an administrator can see, so the parameter means the same thing here as
   * everywhere else in the API. What it can actually *return* is decided by the
   * service, which intersects it with the visible set.
   */
  @IsOptional()
  @IsIn(Object.values(TimesheetStatus))
  readonly status?: TimesheetStatus;

  /**
   * `?departmentId=` — the organisational unit the owner belongs to.
   *
   * Reaches through the `employee` relation, since a department is not a column
   * of this table. Compared exactly: it is an opaque key a client copies from a
   * previous response, not something anybody types, so folding its case would
   * only make the comparison slower.
   *
   * It is spelled `departmentId` rather than `teamId` for the reason Feature 029
   * gives for naming its permission resource `DEPARTMENTS`: there is no team in
   * this system, and a parameter named after a screen that does not exist would
   * leave a client filtering by something they cannot find.
   */
  @IsOptional()
  @IsRelationId()
  readonly departmentId?: string;

  /**
   * `?sortBy=` — one of a closed list, because the value reaches Prisma's
   * `orderBy` key.
   *
   * The default is a property initialiser, the same technique `PaginationQueryDto`
   * uses: an absent parameter leaves it in place, so the service always receives a
   * concrete column and never has to apply a fallback of its own.
   *
   * `totalHours` is not among them, and the reason is worth reading before
   * assuming it was forgotten — see {@link TIMESHEET_SORT_FIELDS}.
   */
  @IsOptional()
  @IsIn(TIMESHEET_SORT_FIELDS)
  readonly sortBy: TimesheetSortField = DEFAULT_TIMESHEET_SORT_FIELD;
}
