import { z } from 'zod';

import { toCalendarDateIso } from '@/lib/datetime';

import type { HolidayType } from './public-holidays-api';

/**
 * What the public-holiday form accepts, mirroring the backend's DTOs — and the
 * first schema in this application whose shape depends on one of its own
 * fields.
 *
 * ## The rules are borrowed, never invented
 *
 * Every bound below is the backend's own, from `public-holiday.constants.ts`
 * and the `@IsPublicHoliday*()` decorators in
 * `dto/public-holiday-field.decorators.ts`:
 *
 * | Field | Rule | Backend constant |
 * | --- | --- | --- |
 * | `name` | required, ≤ 100, trimmed, case preserved | `PUBLIC_HOLIDAY_NAME_MAX_LENGTH` |
 * | `description` | optional, ≤ 500, blank becomes `null` | `PUBLIC_HOLIDAY_DESCRIPTION_MAX_LENGTH` |
 * | `type` | required, `FIXED` \| `VARIABLE` | `HolidayType` |
 * | `isNational` | boolean | schema default `true` |
 * | `startDate` / `endDate` | required, both ends inclusive, end not before start | `assertOrderedSpan` |
 * | `validFromYear` / `validToYear` | `FIXED` only, 1970–2100, either end open | `PUBLIC_HOLIDAY_MIN_YEAR` / `MAX_YEAR` |
 *
 * A browser rule **stricter** than the server's would refuse a value the API
 * would have accepted, which is the one direction a UX check must never err in.
 * This is validation for immediate feedback; the backend stays the authority,
 * and its `VALIDATION_ERROR` is still mapped back onto these fields.
 *
 * ## The type-conditional, and why it lives in the transform
 *
 * `validFromYear` and `validToYear` are a **`FIXED`-only pair**. On a
 * `VARIABLE` holiday the backend answers `400`: that row already *is* one year,
 * named by its `startDate`, so a range on it would be a second statement of the
 * same fact, free to disagree with the first (`assertValidityBelongsToType`).
 *
 * The form hides the two inputs when the type is `VARIABLE`, but hiding a
 * control is a rendering decision and this is a contract. So the schema's
 * **output is a discriminated union**: the `VARIABLE` branch does not carry the
 * keys at all, which makes "never send a validity range on a variable holiday"
 * something the type system enforces rather than something a component
 * remembers. A stale value left in the form after a type change cannot reach
 * the wire, because there is nowhere in the output for it to go.
 *
 * On `PATCH` the two omissions mean different things, and both are what is
 * wanted. Omitting the keys on a `VARIABLE` body lets `mergeFacts` clear the
 * stored range — which is what reclassifying a holiday *should* do. Sending
 * them on a `FIXED` body, `null` included, is what lets a range be re-opened;
 * an absent key would leave the old bound in place, and clearing a field would
 * be indistinguishable from not touching it.
 *
 * ## Dates cross the boundary as calendar dates
 *
 * The inputs hold `yyyy-MM-dd` — the value an `<input type="date">` reads and
 * writes, which is a day with no time and no zone, exactly what a holiday is.
 * `toCalendarDateIso` appends midnight **UTC** on the way out, matching how the
 * backend parses the value and how `formatCalendarDate` reads it back. No step
 * of that consults the browser's zone, which is the whole point: the classic
 * defect here is 1 January stored, or displayed, as 31 December.
 */

export const PUBLIC_HOLIDAY_NAME_MAX_LENGTH = 100;
export const PUBLIC_HOLIDAY_DESCRIPTION_MAX_LENGTH = 500;
export const PUBLIC_HOLIDAY_MIN_YEAR = 1970;
export const PUBLIC_HOLIDAY_MAX_YEAR = 2100;

/** `2026-01-01` — what an `<input type="date">` holds. */
const CALENDAR_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

/** A four-digit year, before it is checked against the bounds. */
const YEAR_PATTERN = /^\d{4}$/;

/** Every sentence the schema can produce, already translated. */
export interface PublicHolidayValidationMessages {
  nameRequired: string;
  nameTooLong: string;
  descriptionTooLong: string;
  startDateRequired: string;
  startDateInvalid: string;
  endDateRequired: string;
  endDateInvalid: string;
  endBeforeStart: string;
  yearInvalid: string;
  yearOutOfRange: string;
  validToBeforeValidFrom: string;
}

/**
 * A required calendar date, as the date input spells it.
 *
 * Two messages rather than one: an empty field and a malformed one are
 * different mistakes, and "choose a date" is not useful advice to somebody who
 * already did. The pattern is a guard against a browser that lets a partial
 * value through rather than the ordinary path — the control produces
 * `yyyy-MM-dd` or nothing.
 */
const calendarDateField = (required: string, invalid: string) =>
  z
    .string()
    .trim()
    .min(1, required)
    /*
     * `.refine` rather than `.regex`, and it lets the empty string through:
     * Zod does not stop at the first failing check, so an empty field would
     * otherwise report *both* "choose a date" and "that is not a date" — two
     * messages for one blank input, of which the second is nonsense.
     */
    .refine((value) => value === '' || CALENDAR_DATE_PATTERN.test(value), invalid);

/**
 * One end of the validity range: a bounded year, or blank for "open".
 *
 * Blank is not a missing value here, it is a *statement* — a holiday with no
 * `validFromYear` has always applied — so it collapses to `null` rather than
 * failing a required check. The bounds are the ones the calendar endpoints
 * accept, which is why the backend uses them: a version valid from a year no
 * calendar can ask about would be a row nothing could ever return.
 */
const yearField = (messages: PublicHolidayValidationMessages) =>
  z
    .string()
    .trim()
    .refine((value) => value === '' || YEAR_PATTERN.test(value), messages.yearInvalid)
    /*
     * Deliberately silent unless the value is *shaped* like a year: Zod runs
     * every check, so `20` would otherwise be reported as both malformed and
     * out of range — the second of which is only true because of the first.
     */
    .refine(
      (value) =>
        !YEAR_PATTERN.test(value) ||
        (Number(value) >= PUBLIC_HOLIDAY_MIN_YEAR && Number(value) <= PUBLIC_HOLIDAY_MAX_YEAR),
      messages.yearOutOfRange,
    )
    .transform((value): number | null => (value === '' ? null : Number(value)));

export const createPublicHolidaySchema = (messages: PublicHolidayValidationMessages) =>
  z
    .object({
      name: z
        .string()
        .trim()
        .min(1, messages.nameRequired)
        .max(PUBLIC_HOLIDAY_NAME_MAX_LENGTH, messages.nameTooLong),

      description: z
        .string()
        .trim()
        .max(PUBLIC_HOLIDAY_DESCRIPTION_MAX_LENGTH, messages.descriptionTooLong)
        /*
         * A cleared textarea posts `''`, which is not a shorter description but
         * the absence of one — the same conversion `IsPublicHolidayDescription`
         * performs. An `<input>` cannot express `null`, so it happens once,
         * here, and no component has to remember it.
         */
        .transform((value): string | null => (value === '' ? null : value)),

      type: z.enum(['FIXED', 'VARIABLE']),

      isNational: z.boolean(),

      startDate: calendarDateField(messages.startDateRequired, messages.startDateInvalid),
      endDate: calendarDateField(messages.endDateRequired, messages.endDateInvalid),

      validFromYear: yearField(messages),
      validToYear: yearField(messages),
    })
    .superRefine((values, ctx) => {
      /*
       * The two rules the backend checks across fields rather than on one
       * (`assertOrderedSpan`, `assertOrderedValidity`), mirrored here so they
       * are answered before a request rather than by one. Both comparisons use
       * `<`: a one-day holiday stores the same date twice and a range valid for
       * exactly one year has both ends equal, and neither is a violation.
       *
       * `yyyy-MM-dd` sorts correctly as text — fixed-width, most significant
       * part first — so the span needs no parsing to be compared.
       */
      if (values.endDate < values.startDate) {
        ctx.addIssue({
          code: 'custom',
          path: ['endDate'],
          message: messages.endBeforeStart,
        });
      }

      /*
       * Only when both ends are stated: an open end is not a violation but an
       * unknown. Skipped entirely on a variable holiday, whose range is about
       * to be dropped and which cannot have one anyway.
       */
      if (
        values.type === 'FIXED' &&
        values.validFromYear !== null &&
        values.validToYear !== null &&
        values.validToYear < values.validFromYear
      ) {
        ctx.addIssue({
          code: 'custom',
          path: ['validToYear'],
          message: messages.validToBeforeValidFrom,
        });
      }
    })
    .transform((values) => {
      const shared = {
        name: values.name,
        description: values.description,
        isNational: values.isNational,
        startDate: toCalendarDateIso(values.startDate),
        endDate: toCalendarDateIso(values.endDate),
      };

      /*
       * `isRecurring` is deliberately absent from both branches. The backend
       * derives it from `type` and rejects a value that contradicts one, so
       * stating it would be a second spelling of a fact already sent — with a
       * `400` waiting if the two ever drift apart.
       */
      return values.type === 'VARIABLE'
        ? ({ ...shared, type: 'VARIABLE' } as const)
        : ({
            ...shared,
            type: 'FIXED',
            validFromYear: values.validFromYear,
            validToYear: values.validToYear,
          } as const);
    });

export type PublicHolidaySchema = ReturnType<typeof createPublicHolidaySchema>;

/** What the inputs hold — strings, before the transforms run. */
export type PublicHolidayFormInput = z.input<PublicHolidaySchema>;

/** What a valid submit produces — exactly the shape `POST`/`PATCH` accept. */
export type PublicHolidayFormValues = z.output<PublicHolidaySchema>;

/** The two options the type field offers, in the order they are shown. */
export const HOLIDAY_TYPE_OPTIONS: readonly HolidayType[] = ['FIXED', 'VARIABLE'];
