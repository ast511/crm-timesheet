import { IsOptional } from 'class-validator';

import { IsRelationId } from '../../../common/decorators/is-relation-id.decorator';
import {
  IsReportClientName,
  IsReportMonth,
  IsReportYear,
} from './reporting-field.decorators';

/**
 * Body of `POST /api/v1/reports/:reportType/preview` and of
 * `POST /api/v1/reports/:reportType/export`.
 *
 * **One DTO for all five reports**, and the filters that do not apply to a given
 * report are simply ignored by its builder rather than rejected. That is a
 * deliberate call and it is worth stating, because the strict alternative is
 * tempting: five DTOs, each accepting exactly its own filters, so
 * `?projectId=` on the leave calendar is a `400`.
 *
 * It was not taken because the endpoint is one endpoint. A client rendering the
 * report menu builds one filter panel and posts the same body whichever report
 * the user picked; five shapes would mean the panel had to know which fields to
 * strip per report — that is, the frontend would have to re-implement this
 * table — and switching report type with filters already set would start
 * failing. The narrowing that *does* matter is documented per field below, and
 * the feature document states it per report.
 *
 * **Why `POST` for a read.** These parameters are a body rather than a query
 * string because the export produces a file and the preview is its dry run, and
 * the two must take identical parameters or the parity guarantee is a fiction.
 * A `GET` returning a streamed attachment is also the one shape browsers and
 * proxies cache most eagerly, which is exactly wrong for a document regenerated
 * from live data on every request.
 *
 * Unknown properties never reach this class — the global `ValidationPipe` runs
 * with `forbidNonWhitelisted`, so a typo is a `400` rather than a filter that
 * silently did nothing.
 */
export class ReportQueryDto {
  /**
   * The month, `1`–`12`. **Required.**
   *
   * Every one of the five reports is about a single month, so a report without a
   * period names nothing. Defaulting to the current month was the obvious
   * alternative and was rejected for the reason `MyTimesheetQueryDto` rejects it:
   * a client that forgot the parameter would silently get a different document on
   * the 1st than on the 31st, and the bug would surface as somebody filing the
   * wrong month's report.
   */
  @IsReportMonth()
  readonly month!: number;

  /** The year. **Required**, for the same reason. */
  @IsReportYear()
  readonly year!: number;

  /**
   * `departmentId` — restricts every report to one organisational unit.
   *
   * It is spelled `departmentId` rather than `teamId`, and that is not a
   * shortening. **There is no team in this system**: `Employee` belongs to a
   * `Department` and to a `Position`, and nothing anywhere models a team. A
   * parameter named after a resource that does not exist would leave a client
   * filtering by something it can never look up — the same call Feature 029 makes
   * naming its permission resource `DEPARTMENTS`, and Feature 030 its timesheet
   * filter.
   */
  @IsOptional()
  @IsRelationId()
  readonly departmentId?: string;

  /**
   * `employeeId` — restricts every report to one person.
   *
   * Meaningful on all five: a one-row attendance sheet or leave calendar is a
   * perfectly ordinary thing to want, and on the two hour matrices it answers
   * "what did this person work on".
   */
  @IsOptional()
  @IsRelationId()
  readonly employeeId?: string;

  /**
   * `projectId` — restricts the two hour matrices to one project.
   *
   * Ignored by reports 2, 3 and 4, which are about days rather than about work
   * booked to something. Filtering an attendance sheet by project would be asking
   * "which days did this person attend, considering only one project", and a day
   * is not divisible that way — somebody present is present.
   */
  @IsOptional()
  @IsRelationId()
  readonly projectId?: string;

  /**
   * `clientName` — restricts the two hour matrices to one customer.
   *
   * **A name and not an id, because this application has no client entity.**
   * `Project.clientName` is a required text column: it is what report 1 groups
   * its bands by and what report 5 prints in its second column, and there is no
   * `clients` table to hold a key into. A `clientId` parameter would name a
   * resource that does not exist — the same reason "Cod subproiect" does not
   * appear on report 1 although the mock-ups show it, and the same call Feature
   * 030 made when it dropped `taskId` for want of a `Task` model.
   *
   * Compared exactly and case-insensitively by the service, so `acme` finds
   * `Acme` but `Acme` does not also select `Acme Holdings`.
   */
  @IsOptional()
  @IsReportClientName()
  readonly clientName?: string;
}
