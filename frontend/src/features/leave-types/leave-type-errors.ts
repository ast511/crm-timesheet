import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';

import { toApiError } from '@/api/api-error';
import type { CommonKey } from '@/i18n/keys';
import { useApiErrorMessage } from '@/i18n/useApiErrorMessage';

/**
 * The two ways a write to `/leave-types` is refused, and why they need a
 * sentence of their own.
 *
 * `useApiErrorMessage` translates the envelope's `errorCode`. This module was
 * written before the backend's error-code catalogue (Feature 033), so its
 * `409`s carry **no code** — only a status and an English message written for a
 * log, which must never be rendered. The generic fallback for a `409` is
 * therefore "the operation conflicts with existing data", which is true and
 * tells nobody what to do next.
 *
 * The endpoint documents exactly what a `409` means on each verb, so this
 * screen supplies the missing half from what the contract says rather than by
 * reading the message:
 *
 * - **create / update** — `code`, `label` or `reportMarker` is already taken.
 *   Those three are the only unique fields, so the conflict cannot be anything
 *   else. Which of the three it was is only stated in the English message, so
 *   the sentence names all three rather than guessing at one and marking the
 *   wrong field red.
 * - **delete** — a balance or a leave request still references the type. The
 *   sentence says so and points at the action that was almost certainly meant:
 *   deactivate it instead.
 *
 * Everything that is not a `409` — a `400` with field errors, a `403`, a dead
 * network — falls through to `useApiErrorMessage` unchanged. When the backend
 * eventually gives these two an `errorCode`, the codes go in the `errors`
 * bundles beside every other code and this file becomes a delete.
 */
export type LeaveTypeConflict = 'duplicate' | 'inUse';

const CONFLICT_STATUS = 409;

const CONFLICT_MESSAGE_KEYS = {
  duplicate: 'leaveTypes.errors.duplicate',
  inUse: 'leaveTypes.errors.inUse',
} as const satisfies Record<LeaveTypeConflict, CommonKey>;

/**
 * Describes a failed leave-type write.
 *
 * ```ts
 * const describeError = useLeaveTypeErrorMessage('duplicate');
 * <FormAlert message={error === null ? undefined : describeError(error)} />
 * ```
 */
export const useLeaveTypeErrorMessage = (
  conflict: LeaveTypeConflict,
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
