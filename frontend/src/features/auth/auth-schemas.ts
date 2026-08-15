import { z } from 'zod';

/**
 * What the four auth forms accept, as Zod schemas.
 *
 * ## The bounds are the backend's, borrowed rather than invented
 *
 * | Rule | Value | Where it comes from |
 * | --- | --- | --- |
 * | email length | 254 | RFC 5321, enforced by the backend's `@IsEmailAddress()` |
 * | password floor | 8 | `PASSWORD_MIN_LENGTH` — NIST SP 800-63B's minimum |
 * | password ceiling | 72 | `MAX_PASSWORD_BYTES` — bcrypt's own truncation point |
 *
 * Two deliberate asymmetries follow the backend's own reasoning:
 *
 * - **The login form does not enforce the floor.** `LoginDto` does not either,
 *   and for a good reason: a password *policy* belongs where a password is
 *   chosen, not where one is checked. Refusing to send a seven-character
 *   password would lock out an account whose password predates the policy, and
 *   would tell an anonymous visitor what the policy is.
 * - **The ceiling is characters here and bytes there.** bcrypt truncates on
 *   bytes, so 72 emoji are 288 of them and the backend is right to count that
 *   way. A browser counting characters is the friendlier approximation and is
 *   never *stricter* than the server, which is the direction a UX check should
 *   err in — the request still goes, and the backend still decides.
 *
 * ## Messages are injected, not written here
 *
 * A schema with Romanian strings baked in would be a second translation system
 * living outside `locales/`, and would print Romanian at an English-speaking
 * user. The factories take the sentences and `useAuthSchemas` supplies them
 * from the bundles, so the rules live in one place and the words in another.
 * Frontend validation remains UX only — `CLAUDE.md` is explicit that the
 * backend is the security boundary, and none of this protects anything.
 */

export const EMAIL_MAX_LENGTH = 254;
export const PASSWORD_MIN_LENGTH = 8;
export const PASSWORD_MAX_LENGTH = 72;

/** Every sentence the schemas below can produce, already translated. */
export interface AuthValidationMessages {
  emailRequired: string;
  emailInvalid: string;
  emailTooLong: string;
  passwordRequired: string;
  passwordTooShort: string;
  passwordTooLong: string;
  passwordMismatch: string;
}

const emailField = (messages: AuthValidationMessages) =>
  z
    .string()
    .trim()
    .min(1, messages.emailRequired)
    .max(EMAIL_MAX_LENGTH, messages.emailTooLong)
    .pipe(z.email(messages.emailInvalid));

/** A password being *set*: the floor applies. */
const newPasswordField = (messages: AuthValidationMessages) =>
  z
    .string()
    .min(1, messages.passwordRequired)
    .min(PASSWORD_MIN_LENGTH, messages.passwordTooShort)
    .max(PASSWORD_MAX_LENGTH, messages.passwordTooLong);

export const createLoginSchema = (messages: AuthValidationMessages) =>
  z.object({
    email: emailField(messages),
    password: z
      .string()
      .min(1, messages.passwordRequired)
      .max(PASSWORD_MAX_LENGTH, messages.passwordTooLong),
  });

export const createForgotPasswordSchema = (messages: AuthValidationMessages) =>
  z.object({ email: emailField(messages) });

/**
 * Choosing a password: reset and activation share this exactly.
 *
 * **One schema for both**, even though the two endpoints name the field
 * differently — `newPassword` on `POST /auth/reset-password`, `password` on
 * `POST /auth/activate`. That difference is a wire detail, and `auth-api.ts` is
 * where a wire detail belongs; the *form* is the same form, asked twice, and
 * giving it two schemas would be two places to change the password rules.
 *
 * `confirmPassword` exists only in the browser. The backend has no such field
 * and should not: typing a password twice catches a typo *before* the request
 * is sent, which is the only place it can be caught, and an API demanding both
 * would be validating that a client rendered its form correctly.
 */
export const createSetPasswordSchema = (messages: AuthValidationMessages) =>
  z
    .object({
      password: newPasswordField(messages),
      confirmPassword: z.string().min(1, messages.passwordRequired),
    })
    .refine((values) => values.password === values.confirmPassword, {
      path: ['confirmPassword'],
      error: messages.passwordMismatch,
    });

export type LoginValues = z.infer<ReturnType<typeof createLoginSchema>>;
export type ForgotPasswordValues = z.infer<ReturnType<typeof createForgotPasswordSchema>>;
export type SetPasswordValues = z.infer<ReturnType<typeof createSetPasswordSchema>>;
