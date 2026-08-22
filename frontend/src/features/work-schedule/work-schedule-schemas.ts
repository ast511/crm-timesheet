import { z } from 'zod';

import {
  HOURS_DECIMAL_PLACES,
  MAX_HOURS_PER_DAY,
  MAX_HOURS_PER_WEEK,
  WEEKDAYS,
  type UpdateWorkSchedule,
} from './work-schedule-api';
import { isSupportedTimezone } from './work-schedule-timezones';

/**
 * What the configuration form accepts, mirroring `UpdateWorkScheduleDto` and
 * the rules `WorkScheduleService` enforces.
 *
 * ## The rules are borrowed, never invented
 *
 * | Field | Rule | Backend source |
 * | --- | --- | --- |
 * | `workingDays` | at least one, each a real weekday, no duplicates | `@ArrayNotEmpty()`, `@ArrayUnique()`, `@IsEnum(Weekday, { each: true })` |
 * | `weekStartsOn` | a weekday, and **not required to be a working one** | `@IsWeekStartsOn()` — a payroll week may begin on a day nobody works |
 * | `workStartTime` / `workEndTime` | `HH:mm`, 24-hour, zero-padded | `WORK_TIME_PATTERN` |
 * | the five per-day hour fields | `> 0`, `≤ 24`, at most two decimals | `@IsHours()` |
 * | `standardHoursPerWeek` | the same, bounded by `168` | `@IsWeeklyHours()` |
 * | `lunchBreakHours` | `≥ 0` — zero is a valid answer | `@IsLunchBreakHours()` |
 * | `maxHoursPerEntry > minHoursPerEntry` | strictly greater | `assertEntryRangeIsOrdered`, a `400` |
 * | `timezone` | a name the runtime's tz database holds | `isSupportedTimezone`, built from the same `Intl` call |
 *
 * A browser rule **stricter** than the server's would refuse a value the API
 * would have accepted, which is the one direction a UX check must never err in.
 * Two rules that look like they belong here are therefore deliberately absent,
 * and live in `work-schedule-advisories.ts` as non-blocking notes instead — see
 * that file for which, and why.
 *
 * ## Notably not checked: that the end of the day is after its start
 *
 * The mock's schema refused it. This one must not, and the backend's decorator
 * says why in as many words: *"A shift that runs 22:00 to 06:00 crosses midnight
 * and is a real schedule."* Refusing it here would make this screen unable to
 * describe a company that works nights, and would do it with a message claiming
 * the configuration was invalid when the API would have stored it happily.
 *
 * ## The hour fields are strings in the form and numbers on the wire
 *
 * The same arrangement `estimatedHoursField` uses in `project-schemas.ts`, for
 * the same reason: `valueAsNumber` turns an empty input into `NaN`, which reads
 * back as "expected number, received nan" rather than "enter a number". Holding
 * the string and transforming on the way out means each mistake produces exactly
 * one message — an empty field says it is required and not also that it is not a
 * number, and `8.125` says "at most two decimals" and not also "out of range".
 */

/** `09:00`, `18:30`, `00:00` — anchored, so `9:00` and `24:00` are refused. */
export const WORK_TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;

/** A non-negative decimal with at most as many places as the column holds. */
const HOURS_PATTERN = new RegExp(`^\\d+(\\.\\d{1,${HOURS_DECIMAL_PLACES}})?$`);

/** Every sentence the schema can produce, already translated. */
export interface WorkScheduleValidationMessages {
  workingDaysRequired: string;
  timeRequired: string;
  timeInvalid: string;
  hoursRequired: string;
  hoursInvalid: string;
  /** For the five fields that must be greater than zero, bounded by the day. */
  hoursOutOfRange: string;
  /** The same, bounded by the week. */
  weeklyHoursOutOfRange: string;
  /**
   * The lunch break, which may be zero — so its sentence says "between 0 and",
   * where the others say "greater than 0". One message for both would be wrong
   * for one of them, and a range is exactly the thing a person needs stated
   * precisely.
   */
  lunchHoursOutOfRange: string;
  maxEntryNotAboveMin: string;
  timezoneRequired: string;
  /**
   * For a zone name this runtime does not know. Reachable by a person only
   * through a stale form or an autofill — the control offers nothing else — but
   * the rule is stated because the value is too consequential to take on trust.
   */
  timezoneUnsupported: string;
}

/**
 * One hour field.
 *
 * @param max the upper bound — 24 for a day, 168 for a week
 * @param allowZero `true` only for the lunch break, which may legitimately be
 *   zero: "this company has no lunch break" is a configuration somebody may
 *   state, and `@IsLunchBreakHours()` accepts it where `@IsHours()` would not.
 */
const hoursField = (
  messages: WorkScheduleValidationMessages,
  max: number,
  allowZero: boolean,
  outOfRangeMessage: string,
) =>
  z
    .string()
    .trim()
    .min(1, messages.hoursRequired)
    .refine((value) => HOURS_PATTERN.test(value), messages.hoursInvalid)
    .refine(
      (value) =>
        !HOURS_PATTERN.test(value) ||
        ((allowZero ? Number(value) >= 0 : Number(value) > 0) && Number(value) <= max),
      outOfRangeMessage,
    )
    .transform((value): number => Number(value));

const workTimeField = (messages: WorkScheduleValidationMessages) =>
  z
    .string()
    .trim()
    .min(1, messages.timeRequired)
    .refine((value) => value === '' || WORK_TIME_PATTERN.test(value), messages.timeInvalid);

export const createWorkScheduleSchema = (messages: WorkScheduleValidationMessages) =>
  z
    .object({
      /*
       * `z.enum(WEEKDAYS)` rather than seven literals written out: the list is
       * checked against the contract's own enum in `work-schedule-api.ts`, so
       * the schema, the toggles and the `weekStartsOn` select all follow from
       * one array instead of three that can disagree.
       *
       * There is no uniqueness check, because the control cannot produce a
       * duplicate — a toggle either includes a day or it does not. The backend's
       * `@ArrayUnique()` still guards the endpoint against a body this form did
       * not build.
       */
      workingDays: z.array(z.enum(WEEKDAYS)).min(1, messages.workingDaysRequired),

      weekStartsOn: z.enum(WEEKDAYS),

      workStartTime: workTimeField(messages),
      workEndTime: workTimeField(messages),

      minHoursPerEntry: hoursField(messages, MAX_HOURS_PER_DAY, false, messages.hoursOutOfRange),
      maxHoursPerEntry: hoursField(messages, MAX_HOURS_PER_DAY, false, messages.hoursOutOfRange),
      maxHoursPerDay: hoursField(messages, MAX_HOURS_PER_DAY, false, messages.hoursOutOfRange),
      standardHoursPerDay: hoursField(
        messages,
        MAX_HOURS_PER_DAY,
        false,
        messages.hoursOutOfRange,
      ),
      standardHoursPerWeek: hoursField(
        messages,
        MAX_HOURS_PER_WEEK,
        false,
        messages.weeklyHoursOutOfRange,
      ),
      lunchBreakHours: hoursField(
        messages,
        MAX_HOURS_PER_DAY,
        true,
        messages.lunchHoursOutOfRange,
      ),

      /*
       * Checked against `isSupportedTimezone`, which is the browser's own tz
       * database — the same expression the backend's `isSupportedTimezone`
       * builds its set from. So this is not a stricter rule than the server's
       * dressed up as a UX check: it is the *same* rule, evaluated a runtime
       * earlier. The one way the two can disagree is two tz databases of
       * different ages, and there the backend still decides; see
       * `work-schedule-timezones.ts`.
       *
       * Not trimmed into the value the way the hour fields are. The control
       * offers canonical names and nothing else, and an exact match is what the
       * backend performs — a silently trimmed value would be this form quietly
       * correcting a zone rather than storing the one that was chosen.
       */
      timezone: z
        .string()
        .min(1, messages.timezoneRequired)
        .refine(
          /*
           * The empty case is excused here so it is reported once — by the
           * `min(1)` above and not also as an unsupported zone. `workTimeField`
           * skips its pattern the same way, for the reason this file states
           * about the hour fields: a person reads the first sentence and acts
           * on it, and a second one contradicting nothing only adds noise.
           */
          (value) => value === '' || isSupportedTimezone(value),
          messages.timezoneUnsupported,
        ),
    })
    .superRefine((values, ctx) => {
      /*
       * The one rule the backend checks across fields rather than on one
       * (`assertEntryRangeIsOrdered`), mirrored here so it is answered before a
       * request rather than by one.
       *
       * The comparison is `<=`, exactly as the service's is: equal bounds are
       * refused too, because a range admitting one duration is not a range and
       * the rule as stated is *greater than*.
       *
       * The message goes on `maxHoursPerEntry` — the field the backend names in
       * its own `400`, and the one a person is more likely to have meant to
       * change.
       */
      if (values.maxHoursPerEntry <= values.minHoursPerEntry) {
        ctx.addIssue({
          code: 'custom',
          path: ['maxHoursPerEntry'],
          message: messages.maxEntryNotAboveMin,
        });
      }
    });

export type WorkScheduleSchema = ReturnType<typeof createWorkScheduleSchema>;

/** What the inputs hold — strings and a weekday array, before the transforms. */
export type WorkScheduleFormInput = z.input<WorkScheduleSchema>;

/** What a valid submit produces — the complete `PUT` body. */
export type WorkScheduleFormValues = z.output<WorkScheduleSchema>;

/**
 * What {@link toWorkScheduleFormInput} can be initialised from: the `PUT` body,
 * with `timezone` **required** rather than the contract's optional.
 *
 * Both callers already satisfy it — `WorkScheduleEntity` declares a
 * non-nullable `timezone`, and `WORK_SCHEDULE_DEFAULTS` carries
 * `DEFAULT_TIMEZONE`. Stating it here is what makes "the field always has a
 * value to show" a compile-time fact rather than a habit: an optional zone
 * would leave the combobox unset on a screen where an unset zone is not a
 * legitimate configuration.
 */
export type WorkScheduleFormSource = Omit<UpdateWorkSchedule, 'timezone'> & {
  timezone: string;
};

/**
 * A stored configuration — or the documented defaults — as the values the
 * inputs hold.
 *
 * The one place numbers become strings, which is the direction the transforms
 * in this file do not cover: they run on the way *out*. Doing it here means the
 * form is initialised, re-initialised after a save and reset through the same
 * function, so the three cannot produce three different shapes.
 *
 * `timezone` is read like every other field since F12's amendment. It is what
 * makes the round-trip the original feature performed *visible*: the value goes
 * into a control the person can see, and comes back out of it on Save, so there
 * is no longer a field travelling beside the form that a future edit could drop.
 */
export const toWorkScheduleFormInput = (
  schedule: WorkScheduleFormSource,
): WorkScheduleFormInput => ({
  workingDays: [...schedule.workingDays],
  weekStartsOn: schedule.weekStartsOn,
  workStartTime: schedule.workStartTime,
  workEndTime: schedule.workEndTime,
  minHoursPerEntry: String(schedule.minHoursPerEntry),
  maxHoursPerEntry: String(schedule.maxHoursPerEntry),
  maxHoursPerDay: String(schedule.maxHoursPerDay),
  standardHoursPerDay: String(schedule.standardHoursPerDay),
  standardHoursPerWeek: String(schedule.standardHoursPerWeek),
  lunchBreakHours: String(schedule.lunchBreakHours),
  timezone: schedule.timezone,
});

/**
 * The fields a `VALIDATION_ERROR` can be mapped back onto, in the spelling the
 * API uses — which is the same spelling the form uses, since both come from the
 * DTO.
 *
 * `timezone` is on the list since F12's amendment. It has to be: the backend
 * refuses an unknown zone with a `400` naming that field, and there is now a
 * control on screen the person can use to correct it. Before, a rejection would
 * have named a value nothing on the page could change.
 */
export const WORK_SCHEDULE_FIELDS = [
  'workingDays',
  'weekStartsOn',
  'workStartTime',
  'workEndTime',
  'minHoursPerEntry',
  'maxHoursPerEntry',
  'maxHoursPerDay',
  'standardHoursPerDay',
  'standardHoursPerWeek',
  'lunchBreakHours',
  'timezone',
] as const satisfies readonly (keyof WorkScheduleFormInput)[];
