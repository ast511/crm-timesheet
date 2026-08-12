import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Put,
  Query,
} from '@nestjs/common';

import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { PaginatedResult } from '../../common/interfaces/pagination.interface';
import { RequirePermission } from '../authorization/decorators/require-permission.decorator';
import { CreateTimesheetDto } from './dto/create-timesheet.dto';
import { RejectTimesheetDto } from './dto/reject-timesheet.dto';
import { SetTimesheetEntriesDto } from './dto/set-timesheet-entries.dto';
import {
  MyTimesheetQueryDto,
  TimesheetQueryDto,
} from './dto/timesheet-query.dto';
import { TimesheetListRowEntity } from './entities/timesheet-list-row.entity';
import { TimesheetEntity } from './entities/timesheet.entity';
import { TimesheetService } from './timesheet.service';

/**
 * `/api/v1/timesheets` — the monthly account of somebody's work, and the review
 * of it. The prefix and the version come from `configureApp`, so only the
 * resource segment is declared here.
 *
 * **One controller, two audiences**, which is a departure from the two-controller
 * shape Feature 023 uses for leave requests and is deliberate rather than
 * inconsistent. There, `/me/leave-requests` and `/leave-requests` are two
 * *collections*: one is a person's own requests, the other is every request in the
 * company, and they return different payloads. Here the owner's routes are a
 * *sub-resource of the same collection* — `/timesheets/me` is one row of
 * `/timesheets` — so splitting them across two files would put
 * `POST /timesheets/me/:id/submit` and `POST /timesheets/:id/approve`, two halves
 * of one state machine, where a reader of either could not see the other.
 *
 * The `/me` segment comes **first** in every owner route and never carries an
 * employee id, which is the rule Feature 015 established: a scope belongs in the
 * URL rather than in a filter, and there is no second way to ask the same
 * question. There is no `GET /timesheets?employeeId=`, and there should not be.
 *
 * **Route ordering matters here**, and it is the reason `me` is declared before
 * `:id`. Nest matches in declaration order, so a `@Get(':id')` above
 * `@Get('me')` would swallow `/timesheets/me` and answer "timesheet `me` was not
 * found". The owner routes are therefore all declared first, together.
 *
 * Who is calling comes from `@CurrentUser()` — three headers when this was
 * written, the account behind a validated access token since Feature 032, and
 * not a line of this file changed for that, which is what the seam was for. It
 * is passed to the service on every route, because unlike
 * the notification campaigns *every* timesheet operation depends on who is
 * asking: an owner fills and submits, an administrator approves and rejects, and
 * neither may do the other's. Those checks are in the service as domain rules —
 * see `timesheet-management.rules.ts` — and not as a guard.
 *
 * **The two review actions gained a permission gate in Feature 035**, and the
 * rules underneath them did not move. `POST /:id/approve` and
 * `POST /:id/reject` carry `@RequirePermission('TIMESHEET.APPROVE')`; the
 * service still runs `assertAdministrative`, `assertAdminVisible` and
 * `assertStatusIs` on exactly the same paths, so a caller who holds the
 * permission and sends a `DRAFT` still gets the `404` and one who sends an
 * `APPROVED` month still gets the `409`. That is the layering this project
 * intends everywhere: the gate answers "may this account sign off timesheets",
 * the domain rules answer "may this timesheet be signed off, by this caller,
 * now".
 *
 * `assertAdministrative` was deliberately **kept rather than replaced** — the
 * opposite of the call Feature 035 made for reporting, and for a reason worth
 * stating. Its purpose is not to name a tier of staff: it is what stops an
 * employee approving their own month, which is the one thing this lifecycle must
 * never permit by accident, and it also guards `GET /timesheets`, `GET /:id` and
 * `DELETE /:id` — routes this feature did not gate. Dropping it from two of the
 * five would have left the review queue protected by a rule that approval no
 * longer used. The gate is therefore additive here, and what it buys is the
 * ability to *narrow*: `TIMESHEET.APPROVE` can be revoked from one particular
 * administrator through the permissions screen, and that now works. It cannot
 * *widen* below the administrative roles — granting it to a plain `USER` leaves
 * `assertAdministrative` refusing — and extending approval to non-administrative
 * staff is a decision that should be made deliberately rather than fall out of a
 * checkbox.
 *
 * The other three routes are ungated, and behave exactly as before. Migrating
 * them is a later, per-module step; see `PermissionsGuard`.
 *
 * Every method is a one-line delegation on purpose, and `id` is taken as a plain
 * string: ids are cuids, so `ParseUUIDPipe` would reject valid ones.
 */
@Controller('timesheets')
export class TimesheetController {
  constructor(private readonly timesheets: TimesheetService) {}

  // ---------------------------------------------------------------------------
  // The owner's own timesheet. Declared first so `me` is matched before `:id`.
  // ---------------------------------------------------------------------------

  /**
   * `GET /timesheets/me?month=&year=` — the caller's own month, in full.
   *
   * Both parameters are required: a timesheet is one person's account of *one*
   * month, so "my timesheet" without a period names nothing.
   *
   * A `404` when they have not opened the month yet, rather than an empty draft
   * shell — see `TimesheetService.findOwn` for the whole argument. The client's
   * answer to that `404` is `POST /timesheets/me`.
   *
   * Reading it also brings `isStale` up to date, so the person about to edit their
   * month is the one told that a dependency moved under it.
   */
  @Get('me')
  findOwn(
    @CurrentUser() user: CurrentUser,
    @Query() query: MyTimesheetQueryDto,
  ): Promise<TimesheetEntity> {
    return this.timesheets.findOwn(user, query);
  }

  /**
   * `POST /timesheets/me` — opens the caller's timesheet for a period.
   *
   * **Idempotent**: a second call for the same month returns the existing
   * timesheet rather than a duplicate or a `409`, which the
   * `(employee_id, month, year)` unique constraint makes a guarantee rather than
   * an expectation. A client may therefore call it unconditionally instead of
   * probing with a `GET` first.
   *
   * The new draft arrives already carrying the approved leave and the public
   * holidays for the month; the employee fills in the days that are theirs.
   *
   * Answers 201; Nest applies it to `@Post` without a `@HttpCode`. It answers 201
   * on the second call too, which is the one place this idempotence is visible —
   * the body is what matters, and it is the same timesheet.
   */
  @Post('me')
  openOwn(
    @CurrentUser() user: CurrentUser,
    @Body() dto: CreateTimesheetDto,
  ): Promise<TimesheetEntity> {
    return this.timesheets.openOwn(user, dto);
  }

  /**
   * `PUT /timesheets/me/:id/entries` — replaces the month's lines.
   *
   * A `PUT` on a sub-resource rather than a `PATCH` on the timesheet, because the
   * body is the **complete** entry set: a day omitted is a day cleared, and the
   * same body sent twice leaves the same month. Modelling it as a patch would
   * invite a client to send three lines and expect the other twenty-seven to
   * survive, which is a different endpoint with different rules.
   *
   * Allowed only while the timesheet is `DRAFT` or `REJECTED`; a `409` naming the
   * status otherwise, and a `403` if it is not the caller's.
   */
  @Put('me/:id/entries')
  setOwnEntries(
    @CurrentUser() user: CurrentUser,
    @Param('id') id: string,
    @Body() dto: SetTimesheetEntriesDto,
  ): Promise<TimesheetEntity> {
    return this.timesheets.setOwnEntries(user, id, dto);
  }

  /**
   * `POST /timesheets/me/:id/submit` — hands the month in for review.
   *
   * `DRAFT → SUBMITTED` and `REJECTED → SUBMITTED` are the same operation and the
   * same endpoint: resubmitting a refused month is not a different act, and the
   * rules it must satisfy do not depend on whether somebody has already looked at
   * it.
   *
   * A sub-resource `POST` rather than a `PATCH` writing a status, and that is the
   * call Feature 027 declined to make for campaigns — `PATCH { status:
   * "CANCELLED" }` there, because a campaign's status is *derived* and cancelling
   * is the one value a client may state. A timesheet's status is not derived from
   * anything: it is a state machine with named transitions, each with its own
   * preconditions, its own side effects and — for the rejection — its own body.
   * Exposing it as a writable field would invite `{ "status": "APPROVED" }` from
   * the person whose timesheet it is.
   *
   * The full validation runs here, against the calendar as it is now. Every
   * offending day is reported at once.
   */
  @Post('me/:id/submit')
  submitOwn(
    @CurrentUser() user: CurrentUser,
    @Param('id') id: string,
  ): Promise<TimesheetEntity> {
    return this.timesheets.submitOwn(user, id);
  }

  // ---------------------------------------------------------------------------
  // The administrative review queue.
  // ---------------------------------------------------------------------------

  /**
   * `GET /timesheets` — the review queue, paginated, searchable and filterable.
   *
   * **Never returns a draft**, whatever is asked for: a half-finished month is
   * private to the person filling it in. `?status=DRAFT` answers an empty page
   * rather than a `400`, which is the honest response to a question whose answer
   * is "none that you can see".
   *
   * Each row carries the four hour figures — worked, leave, holiday and total —
   * because that is what makes a row triageable without opening it. It carries no
   * entries, for the reason `GET /notification-campaigns` carries no recipients: a
   * page of a hundred months would otherwise be three thousand nested objects to
   * render a table.
   */
  @Get()
  findAll(
    @CurrentUser() user: CurrentUser,
    @Query() query: TimesheetQueryDto,
  ): Promise<PaginatedResult<TimesheetListRowEntity>> {
    return this.timesheets.findAll(user, query);
  }

  /**
   * `GET /timesheets/:id` — one month in full: the header and every line.
   *
   * The "see how it was filled" view the list deliberately omits. A `DRAFT`
   * answers the same `404` as a timesheet that does not exist, so the endpoint
   * cannot be used to discover that a colleague has started their month.
   */
  @Get(':id')
  findOne(
    @CurrentUser() user: CurrentUser,
    @Param('id') id: string,
  ): Promise<TimesheetEntity> {
    return this.timesheets.findOne(user, id);
  }

  /**
   * `POST /timesheets/:id/approve` — accepts a submitted month, and freezes it.
   *
   * **No body**, deliberately: an approval carries nothing a client could state,
   * and an optional "note" would be stored as a caveat on a month that was
   * approved without qualification — the same argument Feature 023 makes for
   * refusing `decisionReason` on an approved leave request.
   *
   * Guarded on `SUBMITTED` inside the update itself, so two administrators acting
   * at the same moment cannot produce a month that is both approved and rejected:
   * the second gets a `409` telling them to reload.
   *
   * The month is immutable afterwards, and its `scheduleSnapshot` records the
   * rules it was judged by.
   */
  @Post(':id/approve')
  @RequirePermission('TIMESHEET.APPROVE')
  approve(
    @CurrentUser() user: CurrentUser,
    @Param('id') id: string,
  ): Promise<TimesheetEntity> {
    return this.timesheets.approve(user, id);
  }

  /**
   * `POST /timesheets/:id/reject` — sends a submitted month back, with a reason.
   *
   * The reason is **required**, which is why this transition has a body and the
   * approval does not. It reaches the owner in the notification and is stored on
   * the timesheet, where it survives the resubmission.
   *
   * Guarded on `SUBMITTED` in the same way as the approval, and against the same
   * race.
   */
  @Post(':id/reject')
  @RequirePermission('TIMESHEET.APPROVE')
  reject(
    @CurrentUser() user: CurrentUser,
    @Param('id') id: string,
    @Body() dto: RejectTimesheetDto,
  ): Promise<TimesheetEntity> {
    return this.timesheets.reject(user, id, dto);
  }

  /**
   * `DELETE /timesheets/:id` — removes a month that has not been approved.
   *
   * A `409` on an approved one: it is the record of what the company agreed
   * somebody worked. The lines go with the header, by the cascade on their foreign
   * key.
   *
   * Answers 200 with `{ "success": true, "data": null }` rather than 204, the call
   * Feature 006 made so a client reads the same two fields whatever it called.
   */
  @Delete(':id')
  remove(
    @CurrentUser() user: CurrentUser,
    @Param('id') id: string,
  ): Promise<void> {
    return this.timesheets.remove(user, id);
  }
}
