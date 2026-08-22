import { z } from 'zod';

/**
 * What the approval-address form accepts — one field, mirroring
 * `CreateTimesheetApprovalEmailDto`.
 *
 * | Field | Rule | Backend source |
 * | --- | --- | --- |
 * | `email` | required, ≤ 254, valid, trimmed, **lower-cased** | `@IsEmailAddress()`, `EMAIL_MAX_LENGTH` |
 *
 * The lower-casing is the deliberate match with the DTO's transform, and the
 * argument is F10's unchanged: PostgreSQL's unique index is case-sensitive while
 * every mail server treats one mailbox as one mailbox, so folding here means the
 * value this form sends is the value that gets stored — and `HR@firma.ro`
 * collides with an existing `hr@firma.ro` instead of looking like a new address
 * right up until the `409`.
 *
 * `EMAIL_MAX_LENGTH` is re-declared rather than imported from another feature:
 * it is the RFC 5321 forward-path bound, a property of email itself, and the
 * backend keeps it in `common/constants/email.constants.ts` for the same reason
 * — a feature that happens to need it should not depend on an unrelated one to
 * get it.
 */

export const EMAIL_MAX_LENGTH = 254;

export interface TimesheetApprovalEmailValidationMessages {
  emailRequired: string;
  emailInvalid: string;
  emailTooLong: string;
}

export const createTimesheetApprovalEmailSchema = (
  messages: TimesheetApprovalEmailValidationMessages,
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

export type TimesheetApprovalEmailSchema = ReturnType<
  typeof createTimesheetApprovalEmailSchema
>;

/** What the input holds — a string, before the transforms run. */
export type TimesheetApprovalEmailFormInput = z.input<TimesheetApprovalEmailSchema>;

/** What a valid submit produces — exactly the shape `POST` accepts. */
export type TimesheetApprovalEmailFormValues = z.output<TimesheetApprovalEmailSchema>;
