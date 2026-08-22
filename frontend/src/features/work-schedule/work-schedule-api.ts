import { apiDelete, apiGet, apiPost, apiPut } from '@/api/client';
import type { components } from '@/api/generated/openapi';

import { DEFAULT_TIMEZONE } from './work-schedule-timezones';

/**
 * `/api/v1/work-schedule` — the company's working week, its hour rules, and the
 * addresses a completed timesheet is sent to.
 *
 * **A singleton, and every call here follows from that.** The URL carries no id
 * because there is one configuration and nothing to choose between; there is no
 * list endpoint, no `POST` that creates it and no `PATCH` that amends it. One
 * `GET` reads the whole thing and one `PUT` replaces the whole thing — sending
 * the same body twice leaves the same state, which is what `PUT` means.
 *
 * The addresses are a sub-resource — `/work-schedule/emails`, never
 * `/timesheet-approval-emails?workScheduleId=…` — so the scope is in the path
 * and nothing echoes it back.
 *
 * ## `GET` answers `404` before anything has been stored
 *
 * That is a documented, legitimate state on a fresh deployment rather than a
 * failure, and the backend says so: *"A `404` means no configuration has been
 * stored yet."* `isWorkScheduleMissing` below is how the query layer tells that
 * apart from a real error, so the screen can offer an empty form to fill in
 * instead of an error state with a retry button that would never help.
 */

/** The configuration, exactly as `GET /work-schedule` returns it. */
export type WorkSchedule = components['schemas']['WorkScheduleEntity'];

/** One approval address. */
export type TimesheetApprovalEmail = components['schemas']['TimesheetApprovalEmailEntity'];

/** The body of `POST /work-schedule/emails`. `{ email }` and nothing else. */
export type CreateTimesheetApprovalEmail =
  components['schemas']['CreateTimesheetApprovalEmailDto'];

/**
 * A weekday, read off the entity rather than written out.
 *
 * `weekStartsOn` is the single-valued field, so its type *is* the enum — using
 * it here means a weekday renamed in the backend is a compile error in this
 * file the day the types are regenerated, which a locally declared union could
 * never be.
 */
export type Weekday = WorkSchedule['weekStartsOn'];

/**
 * The body of `PUT /work-schedule`, with **one field re-typed from the entity**.
 *
 * The generated `UpdateWorkScheduleDto` declares `workingDays` as
 * `Weekday[][]` — an array of arrays. That is a defect in the published
 * document, not the contract: the backend's DTO property is `readonly
 * workingDays!: Weekday[]`, the entity that comes back is `Weekday[]`, and the
 * service stores a flat array. The nesting comes from `@IsWorkingDays()`
 * decorating the property with a bare `ApiProperty({ minItems, uniqueItems })`,
 * which overrides the Nest CLI plugin's inferred array type and leaves Swagger
 * wrapping the inferred one a second time.
 *
 * So `workingDays` is taken from {@link WorkSchedule} — the half of the same
 * contract that is right — and everything else from the generated body. Nothing
 * is hand-written: both halves are still the contract, and a field added to
 * either arrives here on the next `npm run gen:api`. The one cast this costs is
 * confined to {@link saveWorkSchedule}, and the fix belongs on the backend's
 * decorator (see the feature document).
 */
type GeneratedUpdateWorkSchedule = components['schemas']['UpdateWorkScheduleDto'];

export type UpdateWorkSchedule = Omit<GeneratedUpdateWorkSchedule, 'workingDays'> & {
  workingDays: WorkSchedule['workingDays'];
};

/**
 * The week, in the order the backend stores and returns it.
 *
 * Monday first, which is `Weekday`'s own declaration order and what
 * `compareWeekdays` sorts into — so the toggles read in the order the response
 * will come back in, and a saved configuration does not re-order itself under
 * the pointer.
 *
 * The list cannot be *derived* from the contract, because a type is not a value
 * — but it is checked against it. {@link AllWeekdaysAreListed} fails to compile
 * if the contract ever gains a weekday this array omits, which is the failure
 * worth catching: a day the company could work and this screen could not offer.
 */
export const WEEKDAYS = [
  'MONDAY',
  'TUESDAY',
  'WEDNESDAY',
  'THURSDAY',
  'FRIDAY',
  'SATURDAY',
  'SUNDAY',
] as const satisfies readonly Weekday[];

/** Compile-time proof that {@link WEEKDAYS} covers the contract's enum. */
export type AllWeekdaysAreListed = Exclude<Weekday, (typeof WEEKDAYS)[number]> extends never
  ? true
  : never;

/**
 * The bounds the hour fields are checked against, mirroring
 * `work-schedule.constants.ts`.
 *
 * Physical limits rather than policy, as the backend puts it: a day has 24
 * hours whoever is configuring it, and a week has 168. `HOURS_DECIMAL_PLACES`
 * mirrors the `decimal(5,2)` columns — a third decimal is rejected by name
 * rather than silently rounded into what gets stored.
 */
export const MAX_HOURS_PER_DAY = 24;
export const MAX_HOURS_PER_WEEK = 168;
export const HOURS_DECIMAL_PLACES = 2;

/**
 * What "reset to the defaults" fills the form with.
 *
 * **There is no defaults endpoint, and this does not invent one.** The values
 * are the configuration backend Feature 016 documents as its example and
 * `prisma/seeds/work-schedule.seed.ts` seeds — a Monday-to-Friday, nine-to-six
 * company — plus `MONDAY` for `weekStartsOn`, which is the column's own default.
 *
 * Resetting is therefore a **form** action and not a request: it fills the
 * inputs and leaves them dirty, and nothing is stored until the person presses
 * Save. That is the honest behaviour for a value this screen is guessing rather
 * than reading, and it means a mis-click is undone by navigating away.
 *
 * `timezone` is here too, since F12's amendment made it an ordinary field of
 * this form. It is `DEFAULT_TIMEZONE` — the same literal the column defaults to
 * — so a fresh deployment is offered what it would have been given anyway, and
 * a **reset on a configured company still refills the zone that company chose**:
 * `WorkScheduleForm` resets to the *loaded* configuration's zone rather than to
 * this one, precisely because restoring "the defaults" must not re-interpret
 * which calendar day every recorded instant falls on. See {@link toWorkScheduleFormInput}.
 */
export const WORK_SCHEDULE_DEFAULTS = {
  workingDays: ['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY'],
  weekStartsOn: 'MONDAY',
  workStartTime: '09:00',
  workEndTime: '18:00',
  minHoursPerEntry: 0.5,
  maxHoursPerEntry: 8,
  maxHoursPerDay: 8,
  standardHoursPerDay: 8,
  standardHoursPerWeek: 40,
  lunchBreakHours: 1,
  timezone: DEFAULT_TIMEZONE,
} as const satisfies UpdateWorkSchedule;

/** The configuration. Throws a `404` while none has been stored. */
export const fetchWorkSchedule = (signal?: AbortSignal): Promise<WorkSchedule> =>
  apiGet('/api/v1/work-schedule', { signal });

/**
 * Replaces the configuration, creating it on the first call.
 *
 * The body is complete — every hour rule, both times, the working days and
 * `weekStartsOn` — because this is a `PUT`. The service writes every column
 * from it, so a field left out of the body is a field left out of the
 * configuration.
 *
 * **`timezone` is an ordinary field of the body**, and always present in it.
 * F12 shipped without a control for it — the mock drew none — and round-tripped
 * the loaded value instead; F12's amendment made it editable, because the zone
 * is what the backend interprets every calendar day and day/week boundary in,
 * and this application is deployed in more than one country. A company that
 * cannot state its zone has every hour, day and week computed against somebody
 * else's.
 *
 * The DTO would still accept its absence — an omitted `timezone` is documented
 * as "leave unchanged" — but sending it keeps this a genuine whole-object
 * replace, it means the screen cannot lose the value even if that DTO exception
 * is ever withdrawn, and it makes the round-trip *visible*: the value that goes
 * back up is the one the person can see on screen, rather than one carried
 * silently beside the form. See `work-schedule-timezones.ts` for where the
 * options come from.
 */
export const saveWorkSchedule = (body: UpdateWorkSchedule): Promise<WorkSchedule> =>
  apiPut('/api/v1/work-schedule', {
    /*
     * The one cast the `workingDays` note above buys: the generated body type
     * asks for `Weekday[][]`, the API accepts and this function is given
     * `Weekday[]`. Casting here rather than widening `UpdateWorkSchedule` keeps
     * every caller — the form, the schema, the defaults — typed against what
     * the wire actually carries.
     */
    body: body as unknown as GeneratedUpdateWorkSchedule,
  });

/**
 * Every approval address, ordered by address.
 *
 * Unpaginated, unlike the leave-notification addresses F10 renders: this
 * endpoint returns the whole list, because it is bounded by a configured
 * maximum rather than by a page size. So there is no pager here and no `page`
 * in the query key.
 */
export const fetchTimesheetApprovalEmails = (
  signal?: AbortSignal,
): Promise<TimesheetApprovalEmail[]> => apiGet('/api/v1/work-schedule/emails', { signal });

/**
 * Adds an address. Answers `201` with the stored row — trimmed and lower-cased,
 * as the DTO decided — or a `409` when it is already on the list.
 */
export const createTimesheetApprovalEmail = (
  body: CreateTimesheetApprovalEmail,
): Promise<TimesheetApprovalEmail> => apiPost('/api/v1/work-schedule/emails', { body });

/**
 * Removes one address. A hard delete: an address here is a routing rule rather
 * than a record of anything that happened, so nothing refers back to it and
 * there is no in-use `409` to handle.
 *
 * Answers `200` with `data: null` rather than `204`, so the client reads the
 * same envelope it reads everywhere else.
 */
export const deleteTimesheetApprovalEmail = (id: string) =>
  apiDelete('/api/v1/work-schedule/emails/{id}', { path: { id } });
