import { useCallback } from 'react';
import type { FieldValues, Path, UseFormSetError } from 'react-hook-form';
import { useTranslation } from 'react-i18next';

import { ERRORS_NAMESPACE } from '@/i18n/config';
import { rejectedFields } from '@/lib/form-errors';

/**
 * Marks every field the backend refused, with a sentence on each one.
 *
 * @param error the failure the mutation reported
 * @param fields the form's fields, in the spelling the API uses
 * @param setError the form's own `setError`
 */
export type MarkRejectedFields<TFieldValues extends FieldValues> = (
  error: unknown,
  fields: readonly Path<TFieldValues>[],
  setError: UseFormSetError<TFieldValues>,
) => void;

/**
 * The server half of a form's validation, applied to its inputs.
 *
 * ```tsx
 * const markRejectedFields = useServerFieldErrors<DepartmentFormInput>();
 * // …
 * onError: (error) => markRejectedFields(error, FIELDS, setError),
 * ```
 *
 * ## Why this exists rather than a loop at each call site
 *
 * Every form used to write the loop itself, and every one of them wrote it the
 * same wrong way:
 *
 * ```ts
 * setError(field, { type: 'server' }); // no message
 * ```
 *
 * `FormField` — like `FormTextareaField`, `FormSelectField` and the rest —
 * derives `aria-invalid` from whether there **is** a message, because that is
 * the only thing it can derive it from. So an error with a bare `type` put the
 * field into `react-hook-form`'s invalid state, which blocks the submit, while
 * leaving the input styled and *announced as valid*: somebody using a screen
 * reader was told the field was fine, given no error text to hear, and left with
 * a save that quietly refused. F11 found it on `/projects` and fixed the
 * duplicate-code path there; the loop underneath was the same bug in six other
 * forms, so the fix belongs here, once, where no future form can reintroduce it.
 *
 * The sentence is deliberately generic — `errors:field.rejected`, "the server
 * did not accept this value". The backend's own per-field lines are English
 * written for a log and must never be rendered (see `rejectedFields` and
 * `api-error.ts`), so what the field can honestly say is *that* it was refused,
 * while the form-level `FormAlert` says *why* the request failed, translated
 * from the `errorCode`. The two are different sentences doing different jobs, so
 * nothing is printed twice: the alert points at the marked fields, and each
 * marked field is now genuinely marked.
 */
export const useServerFieldErrors = <
  TFieldValues extends FieldValues,
>(): MarkRejectedFields<TFieldValues> => {
  const { t } = useTranslation(ERRORS_NAMESPACE);

  return useCallback<MarkRejectedFields<TFieldValues>>(
    (error, fields, setError) => {
      const message = t('field.rejected');

      for (const field of rejectedFields(error, fields)) {
        setError(field, { type: 'server', message });
      }
    },
    [t],
  );
};
