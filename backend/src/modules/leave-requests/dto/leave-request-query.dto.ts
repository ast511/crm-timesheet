import { IsEnum, IsIn, IsOptional, IsString, MaxLength } from 'class-validator';

import { IsRelationId } from '../../../common/decorators/is-relation-id.decorator';
import { Trim } from '../../../common/decorators/trim.decorator';
import { SortQueryDto } from '../../../common/dto/sort-query.dto';
import { LeaveRequestStatus } from '../../../generated/prisma/enums';
import {
  DEFAULT_LEAVE_REQUEST_SORT_FIELD,
  LEAVE_REQUEST_SEARCH_MAX_LENGTH,
  LEAVE_REQUEST_SORT_FIELDS,
  LeaveRequestSortField,
  MY_LEAVE_REQUEST_SORT_FIELDS,
  MyLeaveRequestSortField,
} from '../leave-request.constants';
import { IsLeaveRequestQueryYear } from './leave-request-field.decorators';

/**
 * The three filters both leave-request lists accept, and nothing else.
 *
 * Extracted so `year`, `leaveTypeId` and `status` behave identically on the
 * employee's list and on HR's; two independent classes would have drifted the
 * first time one of them gained a bound. It extends `SortQueryDto` for `page`,
 * `limit` and `sortOrder`, which are shared by every list in the API.
 *
 * **`sortBy` is deliberately not here**, even though both subclasses have one.
 * The two accept different columns — only HR's list can order by employee — and
 * class-validator inherits a parent's constraints, so an `@IsIn` on the narrower
 * list declared here would go on rejecting `employee` in the subclass that is
 * supposed to allow it. Each list declares its own.
 *
 * Exported although no route binds it, because the service's shared
 * `buildFilters` takes exactly this shape. Typing that parameter as one of the
 * two concrete DTOs would have made the other unusable — their `sortBy` types
 * are deliberately incompatible — and a `Pick` of three field names would have
 * been the same class, spelled in a way that stops tracking it.
 */
export class LeaveRequestFilterQueryDto extends SortQueryDto {
  /**
   * Exact year, matched against the year the absence **begins** in.
   *
   * A request running from December into January belongs to the year it started,
   * and appears once. Counting it under both would report two absences where
   * there is one — the same call `PublicHolidayService` makes for a variable
   * holiday spanning New Year, and made the same way so the two do not disagree.
   */
  @IsOptional()
  @IsLeaveRequestQueryYear()
  readonly year?: number;

  /**
   * Exact leave type. An id matching no leave type is not an error: it simply
   * matches no request, and an empty page is the honest answer to "what was
   * taken of a leave type that does not exist".
   *
   * Named `leaveTypeId` rather than `leaveType`, matching
   * `EmployeeLeaveBalanceQueryDto`: the value is an id, and a parameter whose
   * name suggests a code would invite clients to send `ANNUAL`.
   */
  @IsOptional()
  @IsRelationId()
  readonly leaveTypeId?: string;

  /**
   * Exact lifecycle state.
   *
   * `@IsEnum` over the full `LeaveRequestStatus`, including `PENDING` — unlike
   * the status *body*, which refuses it. Filtering for what is still waiting is
   * the single most useful thing this parameter does; what it must not do is
   * *set* that state.
   */
  @IsOptional()
  @IsEnum(LeaveRequestStatus)
  readonly status?: LeaveRequestStatus;
}

/**
 * Query string of `GET /api/v1/me/leave-requests`:
 * `?page=2&limit=50&year=2026&leaveTypeId=…&status=PENDING&sortBy=startDate`.
 *
 * `sortBy` carries its default as a property initialiser, the same technique
 * every other query DTO uses: an absent parameter leaves the initialiser in
 * place, so the service always receives a concrete ordering and never has to
 * apply a fallback of its own. The three inherited filters have no initialiser —
 * for them, absent means "do not filter", which is not a value they could carry.
 *
 * **There is no `employeeId`.** The scope is the caller, from
 * `@CurrentEmployeeId()`; offering it as a filter as well would be two ways to
 * ask one question, and the second would let anybody read anybody's leave by
 * typing an id.
 *
 * `year` is **not** defaulted here, unlike on the HR list. An employee files a
 * few dozen requests in a whole career, so narrowing their own history by
 * default would hide records for no gain — and there would then be no parameter
 * meaning "all of them". The HR list makes the opposite call for the opposite
 * reason; see {@link LeaveRequestQueryDto}.
 */
export class MyLeaveRequestQueryDto extends LeaveRequestFilterQueryDto {
  /** Column to order by; only the enumerated ones reach Prisma's `orderBy`. */
  @IsOptional()
  @IsIn(MY_LEAVE_REQUEST_SORT_FIELDS)
  readonly sortBy: MyLeaveRequestSortField = DEFAULT_LEAVE_REQUEST_SORT_FIELD;
}

/**
 * Query string of `GET /api/v1/leave-requests` — the HR/Admin list.
 *
 * Everything the employee's own list accepts, plus the three parameters that
 * only mean something when the rows are about different people: a text search, a
 * department and an employee.
 *
 * **`year` is defaulted to the current year here**, which is the one place this
 * module departs from the rule `EmployeeLeaveBalanceQueryDto` states — that a
 * filter should never take the place of a default, because then no parameter can
 * say "all of them". The reason it is right here and wrong there is growth:
 * balances are one row per person per type per year and HR reads them a year at
 * a time anyway, while this table gains a row for every absence every employee
 * ever takes, and is opened by somebody asking "who is off". Unfiltered, that
 * first page would eventually be years of history nobody scrolled to. The cost
 * is real and stated: there is no way to ask for every year at once. See the
 * feature document for the parameter to add if that turns out to matter.
 */
export class LeaveRequestQueryDto extends LeaveRequestFilterQueryDto {
  /**
   * The current year unless one is asked for.
   *
   * Redeclared for the initialiser alone — the bounds and the coercion are
   * inherited, because class-validator applies a parent's constraints to a
   * property a subclass overrides. Restating `@IsLeaveRequestQueryYear()` here
   * would register the same three rules twice and report a bad year twice.
   *
   * The default is computed per instance rather than captured once at module
   * load: a process running across midnight on 31 December would otherwise keep
   * defaulting to the year it started in, and would go on doing so until
   * somebody restarted it.
   */
  override readonly year: number = new Date().getUTCFullYear();

  /**
   * Case-insensitive substring matched against the **employee's**
   * `employeeCode`, `firstName` and `lastName`.
   *
   * The searchable text belongs to the related row rather than to this one: a
   * request is two dates and a status, and nobody looks one up by typing
   * `approved`. The leave type is not searched either — it is a closed
   * vocabulary, so `?leaveTypeId=` answers that exactly, where a substring would
   * guess.
   *
   * `reason` is deliberately not searched. It is free text an employee wrote
   * about their own absence, and making it findable across the company would
   * turn a note into a record everybody queries.
   *
   * Absent and empty are the same thing — an empty term would match every row,
   * which is what the endpoint already does without it.
   */
  @IsOptional()
  @Trim()
  @IsString()
  @MaxLength(LEAVE_REQUEST_SEARCH_MAX_LENGTH)
  readonly search?: string;

  /**
   * Exact department, matched through the employee.
   *
   * A request has no department of its own — the person does — so this narrows
   * on `employee.departmentId`. That is what makes "who in Development is off
   * this year" one request rather than a client fetching the department's
   * employees and filtering requests by hand.
   */
  @IsOptional()
  @IsRelationId()
  readonly departmentId?: string;

  /**
   * One person's requests, read by HR rather than by that person.
   *
   * It is a filter here and not on `/me` because here it genuinely narrows a
   * cross-cutting list, while there it would be a second way to state a scope
   * the header already fixed. The two endpoints answer different questions: this
   * one is "show me Ion's leave", `/me` is "show me mine".
   */
  @IsOptional()
  @IsRelationId()
  readonly employeeId?: string;

  /** The wider list, which adds ordering by the person. */
  @IsOptional()
  @IsIn(LEAVE_REQUEST_SORT_FIELDS)
  readonly sortBy: LeaveRequestSortField = DEFAULT_LEAVE_REQUEST_SORT_FIELD;
}
