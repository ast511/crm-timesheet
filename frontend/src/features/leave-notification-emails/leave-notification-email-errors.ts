import { toApiError } from '@/api/api-error';

/**
 * The one way a write to `/leave-notification-emails` is refused, and why it is
 * handled here rather than in the `errors` bundle.
 *
 * `useApiErrorMessage` translates the envelope's `errorCode`. **This module
 * emits none**, exactly like `/leave-types` and `/departments`:
 * `LeaveNotificationEmailsService` throws a bare `ConflictException`, and
 * `all-exceptions.filter.ts` only ever *assigns* a code for a `500` or a
 * `BadRequestException`. A `409` from here therefore arrives with `errorCode:
 * null`, and the generic status fallback — "the operation conflicts with
 * existing data" — is true and tells nobody what to change.
 *
 * No code is invented for it. What is inferred is only what the *contract*
 * documents: `POST` and `PATCH` each declare exactly one `409`, and the service
 * raises it in exactly one place — `assertEmailIsFree`, on a case-insensitive
 * match against the `email` column. So a `409` on this endpoint cannot mean
 * anything but "this address is already on the list".
 *
 * ## And here, unlike F07 and F08, the message goes on the field
 *
 * Those two screens name every unique field in a sentence instead of marking
 * one, because their `409` could have come from any of two or three columns and
 * the API says which only in English prose that must not be rendered. **This
 * resource has one field.** There is nothing to disambiguate, so the conflict is
 * reported on `email` — where the person is already looking, and where the value
 * to change actually is — rather than in a form-level alert that would point at
 * the only input on screen.
 *
 * This is a deletion-in-waiting. When the backend gives this `409` an
 * `errorCode`, the code goes in the `errors` bundles beside every other one and
 * this file goes away.
 */

const CONFLICT_STATUS = 409;

/**
 * True when the API refused a write because the address is already configured.
 *
 * ```ts
 * if (isDuplicateEmailConflict(error)) {
 *   setError('email', { type: 'server', message: t('…errors.duplicate') });
 * }
 * ```
 *
 * Everything else — a `VALIDATION_ERROR`, a `404` on a row somebody else just
 * removed, a `403`, a dead network — answers `false` and falls through to
 * `useApiErrorMessage` unchanged.
 */
export const isDuplicateEmailConflict = (error: unknown): boolean =>
  toApiError(error).status === CONFLICT_STATUS;
