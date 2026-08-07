import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsEnum,
  IsOptional,
  ValidateNested,
} from 'class-validator';

import { IsIsoDateString } from '../../../common/decorators/is-iso-date-string.decorator';
import { IsRelationId } from '../../../common/decorators/is-relation-id.decorator';
import { ValidateIfPresent } from '../../../common/decorators/validate-if-present.decorator';
import { TimesheetEntryType } from '../../../generated/prisma/enums';
import { TIMESHEET_MAX_ENTRIES } from '../timesheet-management.constants';
import {
  IsTimesheetEntryDescription,
  IsTimesheetEntryHours,
} from './timesheet-management-field.decorators';

/**
 * One line of a timesheet, as a client submits it.
 *
 * Deliberately **not** the stored row: there is no `id`, and that is the shape
 * decision the whole endpoint rests on. `PUT` replaces the set, so a client
 * describes the month it wants rather than the edits it is making, and every line
 * is written fresh. Ids on the way in would invite a client to believe it was
 * patching individual rows, which is a different endpoint with different rules —
 * and would make "what happens to a line whose id I did not send" a question the
 * API has to answer.
 */
export class TimesheetEntryInputDto {
  /**
   * The calendar day.
   *
   * An ISO-8601 string, kept as a string and parsed once in the service — see
   * `@IsIsoDateString()` for why converting here would accept `01/13/2020`, a
   * format whose meaning depends on which side of the Atlantic reads it.
   *
   * That it must fall inside the timesheet's own month, inside the employment
   * window, and on a day the company actually works are three rules that need the
   * header, the employee and the work schedule — so they belong to
   * `TimesheetFillService`.
   */
  @IsIsoDateString()
  readonly date!: string;

  /**
   * What the hours account for.
   *
   * `LEAVE` and `HOLIDAY` are accepted here and then checked hard: they must
   * match a day the fill-in engine has already decided is leave or a holiday, at
   * exactly the hours it computed. A client may therefore echo back the whole
   * month it was shown — which is what a form does — without being able to invent
   * an absence nobody approved.
   *
   * Refusing the two types outright would have been simpler and worse: a client
   * would have to strip them before every save, and one that forgot would silently
   * delete somebody's leave from their month.
   */
  @IsEnum(TimesheetEntryType)
  readonly type!: TimesheetEntryType;

  /**
   * How long, in hours. Greater than zero, at most two decimals.
   *
   * The *real* limits — the smallest and largest single entry, the daily ceiling,
   * the weekly one — are configured in the work schedule and applied by the
   * service. Nothing here knows how long a working day is.
   */
  @IsTimesheetEntryHours()
  readonly hours!: number;

  /**
   * The project the work was booked to.
   *
   * **Required for `WORK` and refused for the other two.** That is a rule about
   * two fields at once, so the service enforces it: `LEAVE` and `HOLIDAY` name no
   * project because nobody was working, and attributing an absence to a project
   * would put hours in that project's total that were never worked on it.
   *
   * Whether the project exists is a question for the database, and the service
   * asks it — every referenced id in one query rather than one per line.
   */
  @ValidateIfPresent()
  @IsRelationId()
  readonly projectId?: string;

  /** Optional, and blank collapses to `null` rather than being stored as `""`. */
  @IsOptional()
  @IsTimesheetEntryDescription()
  readonly description?: string | null;
}

/**
 * Body of `PUT /api/v1/timesheets/me/:id/entries`.
 *
 * **The complete month, not the changes to it.** Sending it replaces every line
 * the timesheet had; a day omitted is a day cleared. That is what makes the
 * endpoint idempotent — the same body sent twice leaves the same month — and it
 * is the same call Feature 023 makes for a leave request's replacement set and
 * Feature 027 for a campaign's audience, for the same reason: the rules are
 * statements about the *whole* set (the daily total, the weekly total, which days
 * are covered by leave), and judged one line at a time they could not be stated
 * at all.
 *
 * A `PUT` rather than a `PATCH` because of exactly that: the body is the complete
 * entry set and what is stored afterwards is what was sent, so there is no
 * request that leaves half a month written and no need to reason about which
 * lines a previous save happened to leave behind.
 *
 * An **empty array is legal** and clears the month. It is how somebody starts
 * over, and refusing it would leave "delete my last entry" as an operation with no
 * request that expresses it. What an empty month may *not* do is be submitted —
 * that is a lifecycle rule, checked at the submission.
 *
 * Accepted only while the timesheet is `DRAFT` or `REJECTED`; the service answers
 * a `409` naming the status otherwise. That is not an access rule dressed as a
 * state rule: a `SUBMITTED` month is under review and an `APPROVED` one is the
 * record of what the company agreed.
 */
export class SetTimesheetEntriesDto {
  /**
   * Every line the month should have.
   *
   * `@Type()` is required for the nested validation to run at all — without it
   * `class-transformer` hands `class-validator` plain objects and
   * `@ValidateNested({ each: true })` silently passes everything. It works
   * globally thanks to the `transform: true` option on the application's
   * `ValidationPipe`.
   *
   * The cap bounds the work one write can ask for; see
   * {@link TIMESHEET_MAX_ENTRIES}. There is no minimum — an empty month is a
   * legitimate thing to save.
   */
  @IsArray()
  @ArrayMaxSize(TIMESHEET_MAX_ENTRIES)
  @ValidateNested({ each: true })
  @Type(() => TimesheetEntryInputDto)
  readonly entries!: TimesheetEntryInputDto[];
}
