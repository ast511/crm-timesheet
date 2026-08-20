import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';

import { toApiError } from '@/api/api-error';
import type { CommonKey } from '@/i18n/keys';
import { useApiErrorMessage } from '@/i18n/useApiErrorMessage';

/**
 * The two ways a write to `/departments` is refused, and why they need a
 * sentence of their own.
 *
 * `useApiErrorMessage` translates the envelope's `errorCode`. **This module
 * emits none**, exactly like `/leave-types`: `error-codes.constants.ts` holds
 * the eleven codes Feature 033 seeded — the generic three, the auth ones and the
 * account-lifecycle ones — and there is no `DEPARTMENT_*` among them, nor any
 * code for a conflict at all. `DepartmentService` throws a bare
 * `ConflictException`, and `all-exceptions.filter.ts` only ever *assigns* a code
 * for a `500` (`INTERNAL_ERROR`) or a `BadRequestException`
 * (`VALIDATION_ERROR`). A `409` from here therefore arrives with `errorCode:
 * null`, and the generic status fallback is "the operation conflicts with
 * existing data" — true, and telling nobody what to change.
 *
 * The endpoint documents exactly what a `409` means on each verb, so this screen
 * supplies the missing half from what the *contract* says rather than by reading
 * the message:
 *
 * - **create / update** — `code` or `name` is already taken. Those two are the
 *   only unique columns, so the conflict cannot be anything else.
 * - **delete** — employees are still assigned to the department. The sentence
 *   says so and points at what was almost certainly meant: reassign them, or
 *   deactivate the department to retire it without touching their history.
 *
 * ## Why the duplicate does not mark one field
 *
 * `DepartmentService.describeConflicts()` is more helpful than the leave-types
 * equivalent — it reports *both* collisions at once, as an array with one entry
 * per offending field. But those entries are English prose written for a log
 * (`A department with code "DEV" already exists`), which `CLAUDE.md` forbids
 * rendering and the backend documents as free to be reworded at any time. There
 * is no `errorCode` and no `params` naming the field, so which one collided is
 * recoverable *only* by pattern-matching that sentence.
 *
 * `rejectedFields` is not a way around it either: it deliberately gates on
 * `errorCode === 'VALIDATION_ERROR'`, and its own contract is that a detail line
 * *starts with the property name* — which these do not.
 *
 * So this follows F07's choice rather than inventing a second convention:
 * parsing the English is forbidden, guessing a field would mark the wrong input
 * red, and the third option is to say what is true. The sentence names both
 * fields because the API named neither.
 *
 * Both of these are deletions-in-waiting. When the backend gives this module's
 * `409`s an `errorCode` — ideally with `params.field` on the duplicate — the
 * codes go in the `errors` bundles beside every other one, the form marks the
 * right field, and this file goes away.
 */
export type DepartmentConflict = 'duplicate' | 'inUse';

const CONFLICT_STATUS = 409;

const CONFLICT_MESSAGE_KEYS = {
  duplicate: 'departments.errors.duplicate',
  inUse: 'departments.errors.inUse',
} as const satisfies Record<DepartmentConflict, CommonKey>;

/**
 * Describes a failed department write.
 *
 * ```ts
 * const describeError = useDepartmentErrorMessage('duplicate');
 * <FormAlert message={error === null ? undefined : describeError(error)} />
 * ```
 *
 * Everything that is not a `409` — a `400` with field errors, a `403`, a dead
 * network — falls through to `useApiErrorMessage` unchanged.
 */
export const useDepartmentErrorMessage = (
  conflict: DepartmentConflict,
): ((error: unknown) => string) => {
  const { t } = useTranslation();
  const describeError = useApiErrorMessage();

  return useCallback(
    (error: unknown): string =>
      toApiError(error).status === CONFLICT_STATUS
        ? t(CONFLICT_MESSAGE_KEYS[conflict])
        : describeError(error),
    [t, describeError, conflict],
  );
};
