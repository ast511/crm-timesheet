import { z } from 'zod';

/**
 * What the profile form accepts. One field, and that is the whole feature.
 *
 * `UpdateProfileDto` — the complete list of what a person may change about
 * themselves — has three properties, two of which are the palette and the corner
 * radius the theme pickers write. Everything a form could ask for is therefore
 * the phone number, and the backend explains why at length: every other fact on
 * a profile screen is an identity fact, an organisational fact or a credential,
 * and each is changed elsewhere by somebody entitled to.
 *
 * ## The rules are the backend's, borrowed rather than invented
 *
 * | Rule | Value | Where it comes from |
 * | --- | --- | --- |
 * | max length | 30 | `EMPLOYEE_PHONE_MAX_LENGTH`, via `@IsEmployeePhone()` |
 * | trimmed | yes | the same decorator's `@Transform` |
 * | blank → cleared | yes | the same, and `phone` is nullable in the column |
 *
 * **There is deliberately no format check**, matching the backend decision
 * rather than improving on it: the column holds whatever a person typed, in
 * whichever national convention, and a regex tight enough to be worth writing
 * eventually rejects somebody's real number. A browser rule stricter than the
 * server's would refuse a value the API would have accepted, which is the one
 * direction a UX check must never err in.
 *
 * ## Blank means "clear it", and the schema says so in the type
 *
 * The input is a `<input type="tel">`, so an emptied field posts `''`. That is
 * not a shorter phone number — it is the absence of one, and the request that
 * expresses it is `phone: null`. The transform below does that conversion once,
 * here, so the form component never has to remember it and the mutation is
 * handed exactly what the wire wants. The backend folds `''` to `null` as well;
 * sending the honest value rather than relying on that is what keeps the
 * intention visible in the request.
 */

/** `EMPLOYEE_PHONE_MAX_LENGTH` in `backend/src/modules/employees/employee.constants.ts`. */
export const PHONE_MAX_LENGTH = 30;

/** Every sentence the schema below can produce, already translated. */
export interface ProfileValidationMessages {
  phoneTooLong: string;
}

export const createProfilePhoneSchema = (messages: ProfileValidationMessages) =>
  z.object({
    phone: z
      .string()
      .trim()
      .max(PHONE_MAX_LENGTH, messages.phoneTooLong)
      .transform((value): string | null => (value.length === 0 ? null : value)),
  });

/** What the form's inputs hold — a string, before the transform runs. */
export type ProfilePhoneInput = z.input<ReturnType<typeof createProfilePhoneSchema>>;

/** What a valid submit produces — `null` for a cleared number. */
export type ProfilePhoneValues = z.output<ReturnType<typeof createProfilePhoneSchema>>;
