import {
  IsTimesheetBodyMonth,
  IsTimesheetBodyYear,
} from './timesheet-management-field.decorators';

/**
 * Body of `POST /api/v1/timesheets/me`.
 *
 * Two fields, and that is the whole of it: a timesheet is identified by a person
 * and a period, and the person is the caller.
 *
 * **There is no `employeeId`, and sending one is a `400`.** The timesheet is
 * opened by whoever is calling, named by the `x-employee-id` header through
 * `@CurrentUser()`. Putting the owner in the body would make "whose month is
 * this" a value a client chooses per request — precisely what it stops being once
 * authentication exists — and would make `/me` a lie in the meantime. The global
 * `ValidationPipe` runs with `forbidNonWhitelisted`, so a client that tries is
 * told rather than having the field silently ignored.
 *
 * **There is no `status` either.** A timesheet is opened as a `DRAFT` and moves
 * only through the transitions the lifecycle allows; a body that could name a
 * status would let somebody submit or approve a month by creating it.
 *
 * **And there are no entries.** Opening a month and filling it in are two
 * requests on purpose: the second is idempotent and replaces the whole set, so
 * folding it into the first would give the entry rules two entry points, one of
 * which only ever runs once.
 *
 * That the period must not be in the future, and that the caller must have been
 * employed during it, need the clock and the database — so they belong to the
 * service, which is the only place that can ask.
 */
export class CreateTimesheetDto {
  /** `1`–`12`. January is `1`, matching the URL parameters and the column. */
  @IsTimesheetBodyMonth()
  readonly month!: number;

  @IsTimesheetBodyYear()
  readonly year!: number;
}
