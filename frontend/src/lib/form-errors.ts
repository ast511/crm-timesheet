import { toApiError } from '@/api/api-error';

/**
 * Which of a form's fields the backend rejected.
 *
 * `CLAUDE.md` asks that a `VALIDATION_ERROR` be surfaced *in the form*, mapped
 * onto its inputs where possible, and this is the "where possible" part. The
 * envelope's `details` is one line per rejected field from the global
 * `ValidationPipe`, and every line begins with the property name:
 *
 * ```jsonc
 * { "errorCode": "VALIDATION_ERROR",
 *   "message": ["email must be an email", "password should not be empty"] }
 * ```
 *
 * So the field names are recoverable, and this returns the ones a given form
 * actually has — anything else is a property the form does not render and
 * cannot highlight.
 *
 * **What it deliberately does not return is the text.** Those lines are English
 * written for a log, exactly like the envelope's `message`, and the backend
 * reserves the right to reword them. The caller marks the field invalid and the
 * form-level alert says what happened, translated by `errorCode`.
 *
 * In practice this fires rarely: the Zod schema mirrors the backend's rules, so
 * a request that reaches the server with an invalid field is one the browser
 * was not asked to check — which is the case worth handling, and the reason
 * frontend validation is documented as UX rather than as protection.
 */
export const rejectedFields = <TField extends string>(
  error: unknown,
  fields: readonly TField[],
): TField[] => {
  const apiError = toApiError(error);

  if (apiError.errorCode !== 'VALIDATION_ERROR') return [];

  return fields.filter((field) =>
    apiError.details.some((detail) => detail.startsWith(`${field} `)),
  );
};
