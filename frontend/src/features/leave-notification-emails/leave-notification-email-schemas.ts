import { z } from 'zod';

/**
 * What the notification-address form accepts — one field, mirroring the
 * backend's DTOs.
 *
 * ## The rules are borrowed, never invented
 *
 * | Field | Rule | Backend source |
 * | --- | --- | --- |
 * | `email` | required, ≤ 254, a valid address, trimmed and lower-cased | `@IsEmailAddress()`, `EMAIL_MAX_LENGTH` |
 *
 * A browser rule **stricter** than the server's would refuse a value the API
 * would have accepted, which is the one direction a UX check must never err in.
 * This is validation for immediate feedback; the backend stays the authority,
 * and its `VALIDATION_ERROR` is still mapped back onto the field.
 *
 * ## The lower-casing is the deliberate match with the DTO's `@Transform`
 *
 * `normalizeEmailAddress` trims and lower-cases before anything is stored or
 * compared, because PostgreSQL's unique index is case-sensitive while every
 * mail server treats one mailbox as one mailbox. Folding here too means the
 * value this form sends is the value that gets stored — so `HR@firma.ro`
 * conflicts with an existing `hr@firma.ro` rather than looking like a different
 * address right up until the `409` arrives.
 *
 * `EMAIL_MAX_LENGTH` is re-declared here rather than imported from
 * `auth-schemas.ts`: it is the RFC 5321 forward-path bound, a property of email
 * itself, and the backend keeps it in `common/constants/email.constants.ts` for
 * the same reason — a feature that happens to need it should not depend on the
 * authentication feature to get it.
 */

export const EMAIL_MAX_LENGTH = 254;

/** Every sentence the schema can produce, already translated. */
export interface LeaveNotificationEmailValidationMessages {
  emailRequired: string;
  emailInvalid: string;
  emailTooLong: string;
}

export const createLeaveNotificationEmailSchema = (
  messages: LeaveNotificationEmailValidationMessages,
) =>
  z.object({
    email: z
      .string()
      .trim()
      .min(1, messages.emailRequired)
      .max(EMAIL_MAX_LENGTH, messages.emailTooLong)
      .pipe(z.email(messages.emailInvalid))
      .transform((value) => value.toLowerCase()),
  });

export type LeaveNotificationEmailSchema = ReturnType<
  typeof createLeaveNotificationEmailSchema
>;

/** What the input holds — a string, before the transforms run. */
export type LeaveNotificationEmailFormInput = z.input<LeaveNotificationEmailSchema>;

/** What a valid submit produces — exactly the shape `POST`/`PATCH` accept. */
export type LeaveNotificationEmailFormValues = z.output<LeaveNotificationEmailSchema>;
