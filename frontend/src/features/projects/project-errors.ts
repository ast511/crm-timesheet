import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';

import { toApiError } from '@/api/api-error';
import type { CommonKey } from '@/i18n/keys';
import { useApiErrorMessage } from '@/i18n/useApiErrorMessage';

/**
 * The two ways a write to `/projects` is refused, and why they need a sentence
 * of their own.
 *
 * `useApiErrorMessage` translates the envelope's `errorCode`. **This module
 * emits none**, exactly like the three settings screens before it:
 * `error-codes.constants.ts` holds the codes Feature 033 seeded — the generic
 * three, the auth ones and the account-lifecycle ones — and there is no
 * `PROJECT_*` among them, nor any code for a conflict at all. `ProjectService`
 * throws a bare `ConflictException`, and `all-exceptions.filter.ts` only ever
 * *assigns* a code for a `500` (`INTERNAL_ERROR`) or a `BadRequestException`
 * (`VALIDATION_ERROR`). A `409` from here therefore arrives with
 * `errorCode: null`, and the generic status fallback is "the operation
 * conflicts with existing data" — true, and telling nobody what to change.
 *
 * The endpoint documents exactly what a `409` means on each verb, so this
 * screen supplies the missing half from what the *contract* says rather than by
 * reading the message:
 *
 * - **create / update** — the `code` is already taken.
 * - **delete** — people are still on the project, or hours are still booked to
 *   it. The sentence says so and points at what was almost certainly meant:
 *   archive the project instead, which retires it without touching either.
 *
 * ## Unlike departments, the duplicate *can* mark a field
 *
 * `DepartmentService` has two unique columns and reports both collisions in one
 * array of English prose, so a department's `409` cannot say which field
 * collided without parsing a sentence the backend reserves the right to reword
 * — which is why `department-errors.ts` names both fields instead.
 *
 * **`Project.code` is the only unique column on this table.** `assertCodeIsFree`
 * is the sole source of a `409` on create and update, and the service says
 * outright that `name` is deliberately not treated as an identifier — two
 * clients can both have a "Website Redesign". So a `409` here is *necessarily*
 * about `code`, with no message-parsing and no guessing: `ProjectForm` marks
 * that input invalid, and this sentence explains it.
 *
 * That inference is the only thing keeping it honest, so it is worth stating
 * where it would break: a second unique index on this table would make the
 * marked field a guess again, and this module would have to fall back to
 * naming both. When the backend gives these `409`s an `errorCode` — ideally
 * with `params.field` — the codes go in the `errors` bundles beside every other
 * one and this file goes away, as `leave-type-errors.ts`,
 * `department-errors.ts` and `public-holiday-errors.ts` would.
 */
export type ProjectConflict = 'duplicateCode' | 'inUse';

const CONFLICT_STATUS = 409;

const CONFLICT_MESSAGE_KEYS = {
  duplicateCode: 'projects.errors.duplicateCode',
  inUse: 'projects.errors.inUse',
} as const satisfies Record<ProjectConflict, CommonKey>;

/** Whether this failure is the endpoint's expected `409`. */
export const isProjectConflict = (error: unknown): boolean =>
  toApiError(error).status === CONFLICT_STATUS;

/**
 * Describes a failed project write.
 *
 * ```ts
 * const describeError = useProjectErrorMessage('duplicateCode');
 * <FormAlert message={error === null ? undefined : describeError(error)} />
 * ```
 *
 * Everything that is not a `409` — a `400` with field errors, a `403`, a dead
 * network — falls through to `useApiErrorMessage` unchanged.
 */
export const useProjectErrorMessage = (
  conflict: ProjectConflict,
): ((error: unknown) => string) => {
  const { t } = useTranslation();
  const describeError = useApiErrorMessage();

  return useCallback(
    (error: unknown): string =>
      isProjectConflict(error) ? t(CONFLICT_MESSAGE_KEYS[conflict]) : describeError(error),
    [t, describeError, conflict],
  );
};
