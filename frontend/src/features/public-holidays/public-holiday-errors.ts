import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';

import { toApiError } from '@/api/api-error';
import type { CommonKey } from '@/i18n/keys';
import { useApiErrorMessage } from '@/i18n/useApiErrorMessage';

import type { HolidayType } from './public-holidays-api';

/**
 * The two ways a write to `/public-holidays` is refused, and why they need a
 * sentence of their own.
 *
 * `useApiErrorMessage` translates the envelope's `errorCode`. **This module
 * emits none**, exactly like `/leave-types` and `/departments`:
 * `error-codes.constants.ts` holds the eleven codes Feature 033 seeded — the
 * generic three, the auth ones and the account-lifecycle ones — and there is no
 * `PUBLIC_HOLIDAY_*` among them, nor any code for a conflict at all.
 * `PublicHolidayService` throws a bare `ConflictException`, and
 * `all-exceptions.filter.ts` only ever *assigns* a code for a `500`
 * (`INTERNAL_ERROR`) or a `BadRequestException` (`VALIDATION_ERROR`). A `409`
 * from here therefore arrives with `errorCode: null`, and the generic status
 * fallback is "the operation conflicts with existing data" — true, and telling
 * nobody what to change.
 *
 * ## Unlike departments, the screen knows which rule refused it
 *
 * `/departments` had one conflict sentence naming both unique columns, because
 * a `409` there could have been either and the API named neither. Here the two
 * conflicts belong to the two *types*, and the type is a field the person just
 * chose — so the right sentence follows from the form rather than from parsing
 * the English `message`, which `CLAUDE.md` forbids and the backend documents as
 * free to be reworded:
 *
 * - **`FIXED`** — another recurring holiday already falls on that month and
 *   day *in overlapping years*. Both halves matter, and the sentence says so:
 *   the year inside the date is disregarded, the validity range is not, so the
 *   way out is usually a `validFromYear` / `validToYear` that does not overlap
 *   the existing version rather than a different day.
 * - **`VARIABLE`** — a holiday of that name already starts on that date. Name
 *   *and* date, never name alone: "Paște" is expected once a year, and the
 *   collision is with this year's entry specifically.
 *
 * Neither marks a field, and that is the same call F07 and F08 made. The
 * conflict is between a *combination* of fields and a row that already exists —
 * on `FIXED` it is the day and the year range together — so there is no single
 * input to turn red, and `rejectedFields` does not apply anyway: it gates on
 * `errorCode === 'VALIDATION_ERROR'`, which a `409` is not.
 *
 * Both of these are deletions-in-waiting. When the backend gives this module's
 * `409`s an `errorCode`, the codes go in the `errors` bundles beside every
 * other one and this file goes away.
 *
 * ## What is *not* here: the `400`s
 *
 * `assertOrderedSpan`, `assertOrderedValidity` and
 * `assertValidityBelongsToType` all throw `BadRequestException` with a message
 * array whose lines start with the offending property (`endDate must not be
 * before startDate`). Those arrive as an ordinary `VALIDATION_ERROR`, so
 * `rejectedFields` maps them onto the right input with no help from this file —
 * which is why the form checks the same three rules in Zod and these rarely
 * fire at all.
 */

const CONFLICT_STATUS = 409;

const CONFLICT_MESSAGE_KEYS = {
  FIXED: 'publicHolidays.errors.duplicateFixed',
  VARIABLE: 'publicHolidays.errors.duplicateVariable',
} as const satisfies Record<HolidayType, CommonKey>;

/**
 * Describes a failed public-holiday write, given the type being saved.
 *
 * ```ts
 * const describeError = usePublicHolidayErrorMessage(watch('type'));
 * <FormAlert message={error === null ? undefined : describeError(error)} />
 * ```
 *
 * The type is the form's current one rather than the one that was submitted,
 * which is the more useful of the two: changing it changes which duplicate rule
 * applies, so the alert describes the refusal that is still in force for what
 * is now on screen.
 *
 * Everything that is not a `409` — a `400` with field errors, a `403`, a dead
 * network — falls through to `useApiErrorMessage` unchanged.
 */
export const usePublicHolidayErrorMessage = (
  type: HolidayType,
): ((error: unknown) => string) => {
  const { t } = useTranslation();
  const describeError = useApiErrorMessage();

  return useCallback(
    (error: unknown): string =>
      toApiError(error).status === CONFLICT_STATUS
        ? t(CONFLICT_MESSAGE_KEYS[type])
        : describeError(error),
    [t, describeError, type],
  );
};
