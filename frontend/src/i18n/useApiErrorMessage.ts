import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';

import { toApiError } from '@/api/api-error';

import { ERRORS_NAMESPACE } from './config';

/**
 * `t()` narrowed to a plain string key.
 *
 * Everywhere else in this application a mistyped translation key is a compile
 * error, and that is the point of `i18n/i18next.d.ts`. Here it cannot be: the
 * key is an error code the backend chose at runtime, and the catalogue is
 * knowingly incomplete — a code with no entry yet is an expected state that the
 * fallback chain below handles, not a bug to be caught by the compiler.
 *
 * So the cast is confined to this one function, with `i18n.exists` doing at
 * runtime what the type system does everywhere else.
 */
type LooseTranslate = (key: string, options?: Record<string, unknown>) => string;

/**
 * Turns anything thrown by the API layer into a sentence a person can read.
 *
 * ```tsx
 * const describeError = useApiErrorMessage();
 * if (error) return <p role="alert">{describeError(error)}</p>;
 * ```
 *
 * The order is deliberate, and the last step is the one that matters:
 *
 * 1. **`errors:<ERROR_CODE>`**, interpolated with the envelope's `params`. The
 *    stable, translatable half of the contract.
 * 2. **`errors:fallback.network`** when the request never reached the API.
 * 3. **`errors:fallback.status.<code>`** — for the modules written before the
 *    backend's error-code catalogue existed, which answer with no code at all.
 *    The backend documents that absence as part of the contract, so this branch
 *    is a requirement rather than defensive padding.
 * 4. **`errors:fallback.unknown`**.
 *
 * What it never does is render `error.message`. That string is English written
 * for a log, the backend reserves the right to reword it, and showing it to a
 * Romanian-speaking user would be a bug in every language.
 */
export const useApiErrorMessage = (): ((error: unknown) => string) => {
  const { t, i18n } = useTranslation(ERRORS_NAMESPACE);

  return useCallback(
    (error: unknown): string => {
      const translate = t as unknown as LooseTranslate;
      const apiError = toApiError(error);

      if (apiError.errorCode && i18n.exists(apiError.errorCode, { ns: ERRORS_NAMESPACE })) {
        return translate(apiError.errorCode, apiError.params);
      }

      if (apiError.isNetworkError) {
        return translate('fallback.network');
      }

      const statusKey = `fallback.status.${apiError.status}`;

      if (apiError.status !== null && i18n.exists(statusKey, { ns: ERRORS_NAMESPACE })) {
        return translate(statusKey);
      }

      return translate('fallback.unknown');
    },
    [t, i18n],
  );
};
