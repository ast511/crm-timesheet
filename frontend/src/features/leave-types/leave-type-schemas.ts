import { z } from 'zod';

/**
 * What the leave-type form accepts, mirroring the backend's DTOs.
 *
 * ## The rules are borrowed, never invented
 *
 * Every bound below is the backend's own, from
 * `leave-type.constants.ts` and the `@IsLeaveType*()` decorators:
 *
 * | Field | Rule | Backend constant |
 * | --- | --- | --- |
 * | `code` | required, ≤ 20, `A-Z0-9` with `-`/`_` separators, upper-cased | `LEAVE_TYPE_CODE_MAX_LENGTH`, `LEAVE_TYPE_CODE_PATTERN` |
 * | `label` | required, ≤ 100, trimmed | `LEAVE_TYPE_LABEL_MAX_LENGTH` |
 * | `reportMarker` | required, 1–3 of `A-Z0-9`, upper-cased | `LEAVE_TYPE_REPORT_MARKER_*` |
 * | `icon` | required, ≤ 50 | `LEAVE_TYPE_ICON_MAX_LENGTH` |
 * | `color` | optional, `#RRGGBB`, upper-cased | `LEAVE_TYPE_COLOR_PATTERN` |
 * | `description` | optional, ≤ 500 | `LEAVE_TYPE_DESCRIPTION_MAX_LENGTH` |
 * | `defaultAllocatedDays` | optional integer 0–366 | `LEAVE_TYPE_MIN/MAX_ALLOCATED_DAYS` |
 * | `maxCarryOverDays` | optional integer 0–366 | the same two |
 *
 * A browser rule **stricter** than the server's would refuse a value the API
 * would have accepted, which is the one direction a UX check must never err in.
 * This is validation for immediate feedback; the backend stays the authority,
 * and its `VALIDATION_ERROR` is still mapped back onto these fields.
 *
 * ## Empty is `null`, and the schema is where that is decided
 *
 * Four fields are nullable in the contract, and every one of them means
 * something specific when it is absent: no accent colour, no description, *no
 * suggested allocation* (which is not a suggestion of zero), and *no carry-over
 * ceiling* (which is not a ceiling of zero). An `<input>` cannot express `null`
 * — it produces `''` — so the conversion happens once, here, and the form
 * component never has to remember it. `0` typed deliberately survives as `0`.
 */

export const LEAVE_TYPE_CODE_MAX_LENGTH = 20;
export const LEAVE_TYPE_CODE_PATTERN = /^[A-Z0-9]+([-_][A-Z0-9]+)*$/;
export const LEAVE_TYPE_LABEL_MAX_LENGTH = 100;
export const LEAVE_TYPE_REPORT_MARKER_MAX_LENGTH = 3;
export const LEAVE_TYPE_REPORT_MARKER_PATTERN = /^[A-Z0-9]{1,3}$/;
export const LEAVE_TYPE_ICON_MAX_LENGTH = 50;
export const LEAVE_TYPE_COLOR_LENGTH = 7;
export const LEAVE_TYPE_COLOR_PATTERN = /^#[0-9A-F]{6}$/;
export const LEAVE_TYPE_DESCRIPTION_MAX_LENGTH = 500;
export const LEAVE_TYPE_MIN_ALLOCATED_DAYS = 0;
export const LEAVE_TYPE_MAX_ALLOCATED_DAYS = 366;

/** Every sentence the schema can produce, already translated. */
export interface LeaveTypeValidationMessages {
  codeRequired: string;
  codeTooLong: string;
  codeInvalid: string;
  labelRequired: string;
  labelTooLong: string;
  reportMarkerRequired: string;
  reportMarkerInvalid: string;
  iconRequired: string;
  colorInvalid: string;
  descriptionTooLong: string;
  daysInvalid: string;
  daysRange: string;
}

/**
 * A whole-day count that may be left blank.
 *
 * `<input type="number">` hands `react-hook-form` a string, so the parse lives
 * here rather than in the component: blank is `null`, anything else must be a
 * whole number inside the backend's bounds. `Number('abc')` is `NaN`, which
 * `Number.isInteger` rejects — so a stray character is a field message rather
 * than a `NaN` on the wire.
 */
const optionalDayCount = (messages: LeaveTypeValidationMessages) =>
  z
    .string()
    .trim()
    .transform((value): number | null => (value === '' ? null : Number(value)))
    .refine((value) => value === null || Number.isInteger(value), messages.daysInvalid)
    .refine(
      (value) =>
        value === null ||
        (value >= LEAVE_TYPE_MIN_ALLOCATED_DAYS && value <= LEAVE_TYPE_MAX_ALLOCATED_DAYS),
      messages.daysRange,
    );

export const createLeaveTypeSchema = (messages: LeaveTypeValidationMessages) =>
  z.object({
    code: z
      .string()
      .trim()
      .min(1, messages.codeRequired)
      .max(LEAVE_TYPE_CODE_MAX_LENGTH, messages.codeTooLong)
      // Upper-cased before the pattern runs, exactly as the DTO's `@Transform`
      // does — so a lower-case code is accepted and stored upper-cased rather
      // than rejected for a rule the backend does not apply.
      .transform((value) => value.toUpperCase())
      .refine((value) => LEAVE_TYPE_CODE_PATTERN.test(value), messages.codeInvalid),

    label: z
      .string()
      .trim()
      .min(1, messages.labelRequired)
      .max(LEAVE_TYPE_LABEL_MAX_LENGTH, messages.labelTooLong),

    reportMarker: z
      .string()
      .trim()
      .min(1, messages.reportMarkerRequired)
      .transform((value) => value.toUpperCase())
      .refine(
        (value) => LEAVE_TYPE_REPORT_MARKER_PATTERN.test(value),
        messages.reportMarkerInvalid,
      ),

    icon: z.string().trim().min(1, messages.iconRequired).max(LEAVE_TYPE_ICON_MAX_LENGTH),

    color: z
      .string()
      .trim()
      .transform((value): string | null => (value === '' ? null : value.toUpperCase()))
      .refine(
        (value) => value === null || LEAVE_TYPE_COLOR_PATTERN.test(value),
        messages.colorInvalid,
      ),

    description: z
      .string()
      .trim()
      .max(LEAVE_TYPE_DESCRIPTION_MAX_LENGTH, messages.descriptionTooLong)
      .transform((value): string | null => (value === '' ? null : value)),

    defaultAllocatedDays: optionalDayCount(messages),
    maxCarryOverDays: optionalDayCount(messages),

    allowsCarryOver: z.boolean(),
    requiresApproval: z.boolean(),
    isPaid: z.boolean(),
    isActive: z.boolean(),
  });

export type LeaveTypeSchema = ReturnType<typeof createLeaveTypeSchema>;

/** What the inputs hold — strings, before the transforms run. */
export type LeaveTypeFormInput = z.input<LeaveTypeSchema>;

/** What a valid submit produces — exactly the shape `POST`/`PATCH` accept. */
export type LeaveTypeFormValues = z.output<LeaveTypeSchema>;