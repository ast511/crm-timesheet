import { z } from 'zod';

import { toCalendarDateIso } from '@/lib/datetime';

import { PROJECT_PRIORITY_OPTIONS, PROJECT_STATUS_OPTIONS } from './projects-api';

/**
 * What the project form accepts, mirroring the backend's DTOs — and the richest
 * schema in this application so far: eleven fields, two enums, a colour, two
 * nullable calendar dates and a bounded integer.
 *
 * ## The rules are borrowed, never invented
 *
 * Every bound below is the backend's own, from `project.constants.ts` and the
 * `@IsProject*()` decorators in `dto/project-field.decorators.ts`:
 *
 * | Field | Rule | Backend constant |
 * | --- | --- | --- |
 * | `code` | required, ≤ 20, `A-Z0-9` with `-`/`_` separators, upper-cased | `PROJECT_CODE_MAX_LENGTH`, `PROJECT_CODE_PATTERN` |
 * | `name` | required, ≤ 100, trimmed | `PROJECT_NAME_MAX_LENGTH` |
 * | `clientName` | required, ≤ 100, trimmed, **no pattern** | `PROJECT_CLIENT_NAME_MAX_LENGTH` |
 * | `description` | optional, ≤ 500, blank becomes `null` | `PROJECT_DESCRIPTION_MAX_LENGTH` |
 * | `estimatedHours` | required whole number, 0 – 1 000 000 | `PROJECT_MIN/MAX_ESTIMATED_HOURS` |
 * | `color` | optional `#RRGGBB`, upper-cased, blank becomes `null` | `PROJECT_COLOR_PATTERN` |
 * | `projectStatus` / `projectPriority` | required, from the generated unions | `ProjectStatus`, `ProjectPriority` |
 * | `isArchived` | boolean | schema default `false` |
 * | `startDate` / `endDate` | optional, nullable, end not before start | `assertOrderedDateRange` |
 *
 * A browser rule **stricter** than the server's would refuse a value the API
 * would have accepted, which is the one direction a UX check must never err in.
 * This is validation for immediate feedback; the backend stays the authority,
 * and its `VALIDATION_ERROR` is still mapped back onto these fields.
 *
 * `clientName` deliberately has no pattern, for the reason the backend states:
 * a company name carries diacritics, ampersands, dots and legal suffixes
 * (`S.R.L.`, `& Co`), and every pattern narrow enough to be worth writing
 * eventually rejects a real customer. It is *required* rather than nullable
 * because an internal project names the company itself.
 *
 * ## The two enums come from the contract, not from this file
 *
 * `z.enum(PROJECT_STATUS_OPTIONS)` rather than a tuple of literals typed out
 * here. The options are derived in `projects-api.ts` from a
 * `Record<ProjectStatus, number>`, so a status added to the API is a compile
 * error at that record — and the schema, the select and the filter all follow
 * from the one list instead of three that can disagree.
 *
 * ## Dates cross the boundary as calendar dates
 *
 * The inputs hold `yyyy-MM-dd` — the value an `<input type="date">` reads and
 * writes, which is a day with no time and no zone. `toCalendarDateIso` appends
 * midnight **UTC** on the way out, matching how the backend parses the value and
 * how `formatCalendarDate` reads it back. No step of that consults the browser's
 * zone, which is the whole point: the classic defect here is 1 September stored,
 * or displayed, as 31 August.
 *
 * Unlike a public holiday, **both ends are optional** — the contract says a
 * project may be planned before its dates are known — so an empty input is
 * `null` rather than a failed required check, and clearing a date is a request
 * the API understands.
 */

export const PROJECT_CODE_MAX_LENGTH = 20;
export const PROJECT_CODE_PATTERN = /^[A-Z0-9]+([-_][A-Z0-9]+)*$/;
export const PROJECT_NAME_MAX_LENGTH = 100;
export const PROJECT_CLIENT_NAME_MAX_LENGTH = 100;
export const PROJECT_DESCRIPTION_MAX_LENGTH = 500;
export const PROJECT_MIN_ESTIMATED_HOURS = 0;
export const PROJECT_MAX_ESTIMATED_HOURS = 1_000_000;
/**
 * `#RRGGBB`, upper-case — one spelling only, as `PROJECT_COLOR_PATTERN` in the
 * backend has it. Not the three-digit shorthand, not a named colour, not
 * `rgb(...)`: a single stored format means every consumer parses it the same
 * way, and it is what the `varchar(7)` column is sized for.
 *
 * It is deliberately the same expression as `HEX_COLOR_PATTERN` in
 * `FormColorField` rather than an import of it. The control's copy decides when
 * the picker may be fed a value; this one is the *contract's* rule, borrowed
 * from `project.constants.ts`, and the two would have to be separated the day a
 * backend accepted something the shared control did not.
 */
export const PROJECT_COLOR_PATTERN = /^#[0-9A-F]{6}$/;

/** `2026-09-01` — what an `<input type="date">` holds. */
const CALENDAR_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

/** A whole number, before it is checked against the bounds. */
const WHOLE_NUMBER_PATTERN = /^\d+$/;

/** Every sentence the schema can produce, already translated. */
export interface ProjectValidationMessages {
  codeRequired: string;
  codeTooLong: string;
  codeInvalid: string;
  nameRequired: string;
  nameTooLong: string;
  clientNameRequired: string;
  clientNameTooLong: string;
  descriptionTooLong: string;
  estimatedHoursRequired: string;
  estimatedHoursInvalid: string;
  estimatedHoursOutOfRange: string;
  colorInvalid: string;
  startDateInvalid: string;
  endDateInvalid: string;
  endBeforeStart: string;
}

/**
 * An **optional** calendar date, as the date input spells it.
 *
 * Blank is not a missing value here, it is a statement — a project whose dates
 * are not settled yet — so it collapses to `null` rather than failing a
 * required check. The pattern is a guard against a browser that lets a partial
 * value through rather than the ordinary path; the control produces
 * `yyyy-MM-dd` or nothing.
 */
const optionalCalendarDate = (invalid: string) =>
  z
    .string()
    .trim()
    /*
     * `.refine` rather than `.regex`, and it lets the empty string through:
     * an empty field is the "no date" case and must not also be reported as
     * malformed.
     */
    .refine((value) => value === '' || CALENDAR_DATE_PATTERN.test(value), invalid)
    .transform((value): string | null => (value === '' ? null : toCalendarDateIso(value)));

/**
 * `estimatedHours` — a whole number of hours, and `0` is a real answer.
 *
 * The backend requires the number even though the column carries a
 * `@default(0)`, and states why: the default is the *database's* answer for
 * rows written outside the API, while over HTTP "not estimated yet" should be a
 * deliberate `0` rather than an omission nobody notices. So this is required
 * too, and the form's placeholder says what `0` means rather than pre-filling
 * an estimate nobody made.
 *
 * Each check is written so a single mistake produces a **single** message: an
 * empty field reports "enter a number" and not also "that is not a number", and
 * `12.5` reports "whole hours only" and not also "out of range".
 */
const estimatedHoursField = (messages: ProjectValidationMessages) =>
  z
    .string()
    .trim()
    .min(1, messages.estimatedHoursRequired)
    .refine(
      (value) => value === '' || WHOLE_NUMBER_PATTERN.test(value),
      messages.estimatedHoursInvalid,
    )
    .refine(
      (value) =>
        !WHOLE_NUMBER_PATTERN.test(value) ||
        (Number(value) >= PROJECT_MIN_ESTIMATED_HOURS &&
          Number(value) <= PROJECT_MAX_ESTIMATED_HOURS),
      messages.estimatedHoursOutOfRange,
    )
    .transform((value): number => Number(value));

export const createProjectSchema = (messages: ProjectValidationMessages) =>
  z
    .object({
      code: z
        .string()
        .trim()
        .min(1, messages.codeRequired)
        .max(PROJECT_CODE_MAX_LENGTH, messages.codeTooLong)
        /*
         * Upper-cased before the pattern runs, exactly as `IsProjectCode()`
         * does — so `crm-ts` is accepted and stored as `CRM-TS` rather than
         * refused for a rule the backend does not apply. The upper-casing is
         * normalisation, not cosmetics: PostgreSQL's unique index is
         * case-sensitive, and folding the case at the edge is what makes it a
         * real guarantee.
         */
        .transform((value) => value.toUpperCase())
        .refine((value) => PROJECT_CODE_PATTERN.test(value), messages.codeInvalid),

      name: z
        .string()
        .trim()
        .min(1, messages.nameRequired)
        .max(PROJECT_NAME_MAX_LENGTH, messages.nameTooLong),

      clientName: z
        .string()
        .trim()
        .min(1, messages.clientNameRequired)
        .max(PROJECT_CLIENT_NAME_MAX_LENGTH, messages.clientNameTooLong),

      description: z
        .string()
        .trim()
        .max(PROJECT_DESCRIPTION_MAX_LENGTH, messages.descriptionTooLong)
        /*
         * A cleared textarea posts `''`, which is not a shorter description but
         * the absence of one — the same conversion `IsProjectDescription`
         * performs. An `<input>` cannot express `null`, so it happens once,
         * here, and no component has to remember it.
         */
        .transform((value): string | null => (value === '' ? null : value)),

      estimatedHours: estimatedHoursField(messages),

      color: z
        .string()
        .trim()
        .transform((value): string | null => (value === '' ? null : value.toUpperCase()))
        .refine(
          (value) => value === null || PROJECT_COLOR_PATTERN.test(value),
          messages.colorInvalid,
        ),

      projectStatus: z.enum(PROJECT_STATUS_OPTIONS),
      projectPriority: z.enum(PROJECT_PRIORITY_OPTIONS),

      isArchived: z.boolean(),

      startDate: optionalCalendarDate(messages.startDateInvalid),
      endDate: optionalCalendarDate(messages.endDateInvalid),
    })
    .superRefine((values, ctx) => {
      /*
       * The one rule the backend checks across fields rather than on one
       * (`assertOrderedDateRange`), mirrored here so it is answered before a
       * request rather than by one.
       *
       * **Only when both ends are stated**, exactly as the service does: an
       * open end is not a violation but an unknown, and a `PATCH` that clears
       * `startDate` lifts the constraint rather than failing against a value
       * that is no longer there.
       *
       * The comparison is `<`, so a project that starts and ends on the same
       * day is allowed, as the backend allows it. Both values are full ISO
       * instants by this point — midnight UTC on both sides — so they sort
       * correctly as text, and no zone is consulted to compare two days.
       */
      if (
        values.startDate !== null &&
        values.endDate !== null &&
        values.endDate < values.startDate
      ) {
        ctx.addIssue({
          code: 'custom',
          path: ['endDate'],
          message: messages.endBeforeStart,
        });
      }
    });

export type ProjectSchema = ReturnType<typeof createProjectSchema>;

/** What the inputs hold — strings and booleans, before the transforms run. */
export type ProjectFormInput = z.input<ProjectSchema>;

/** What a valid submit produces — exactly the shape `POST`/`PATCH` accept. */
export type ProjectFormValues = z.output<ProjectSchema>;
