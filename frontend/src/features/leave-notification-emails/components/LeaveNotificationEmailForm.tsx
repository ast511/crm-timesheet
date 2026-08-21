import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';

import { FormAlert } from '@/components/form/FormAlert';
import { FormField } from '@/components/form/FormField';
import { SubmitButton } from '@/components/form/SubmitButton';
import { Button } from '@/components/ui/button';
import { useApiErrorMessage } from '@/i18n/useApiErrorMessage';
import { rejectedFields } from '@/lib/form-errors';

import { isDuplicateEmailConflict } from '../leave-notification-email-errors';
import {
  EMAIL_MAX_LENGTH,
  type LeaveNotificationEmailFormInput,
  type LeaveNotificationEmailFormValues,
} from '../leave-notification-email-schemas';
import type { LeaveNotificationEmail } from '../leave-notification-emails-api';
import {
  useCreateLeaveNotificationEmail,
  useUpdateLeaveNotificationEmail,
} from '../useLeaveNotificationEmails';
import { useLeaveNotificationEmailSchemas } from '../useLeaveNotificationEmailSchemas';

/** The fields a `VALIDATION_ERROR` can be mapped back onto. There is one. */
const FIELDS = ['email'] as const;

const EMPTY_VALUES: LeaveNotificationEmailFormInput = { email: '' };

export interface LeaveNotificationEmailFormProps {
  /** The address being corrected, or `undefined` to add a new one. */
  notificationEmail?: LeaveNotificationEmail;
  /** Called once the write has succeeded — the dialog closes on it. */
  onSaved?: () => void;
  /** Rendered only when given: the inline add form has nothing to cancel to. */
  onCancel?: () => void;
}

/**
 * One form for both writes — a single email field.
 *
 * `POST` and `PATCH` take the same one field, so a second component would be the
 * same input kept in step by hand; which mutation runs follows from whether a
 * row was passed in. It is used in two places without changing shape: inline
 * under the section's heading to add an address, and inside a dialog to correct
 * one.
 *
 * ## The `409` is reported on the field, not in the alert
 *
 * F07 and F08 both put a duplicate in a form-level sentence naming every unique
 * column, because their `409` could have come from any of two or three and the
 * API says which only in English prose that must not be rendered. This resource
 * has **one** field, so there is nothing to disambiguate: the conflict is set on
 * `email`, where the value to change is. The reasoning is written out in
 * `leave-notification-email-errors.ts`.
 *
 * Everything that is *not* a duplicate — a `VALIDATION_ERROR` whose details name
 * the field, a `403`, a dead network — keeps the ordinary treatment: the field
 * is marked invalid where the envelope names it, and `FormAlert` carries the
 * translated `errorCode`. The alert is deliberately suppressed for the
 * duplicate, so one refusal is reported once rather than twice on a form with a
 * single input.
 */
export const LeaveNotificationEmailForm = ({
  notificationEmail,
  onSaved,
  onCancel,
}: LeaveNotificationEmailFormProps) => {
  const { t } = useTranslation();
  const { leaveNotificationEmailSchema } = useLeaveNotificationEmailSchemas();
  const describeError = useApiErrorMessage();

  const create = useCreateLeaveNotificationEmail();
  const update = useUpdateLeaveNotificationEmail();
  const isEdit = notificationEmail !== undefined;
  const mutation = isEdit ? update : create;

  const {
    register,
    handleSubmit,
    reset,
    setError,
    formState: { errors },
  } = useForm<LeaveNotificationEmailFormInput, unknown, LeaveNotificationEmailFormValues>({
    resolver: zodResolver(leaveNotificationEmailSchema),
    defaultValues: isEdit ? { email: notificationEmail.email } : EMPTY_VALUES,
  });

  const onError = (error: unknown) => {
    if (isDuplicateEmailConflict(error)) {
      setError('email', {
        type: 'server',
        message: t('leaveNotificationEmails.errors.duplicate'),
      });

      return;
    }

    for (const field of rejectedFields(error, FIELDS)) {
      setError(field, { type: 'server' });
    }
  };

  const onSubmit = handleSubmit((values: LeaveNotificationEmailFormValues) => {
    if (!isEdit) {
      create.mutate(values, {
        onSuccess: () => {
          /*
           * The inline form stays mounted, so it has to be emptied by hand —
           * unlike the dialog, which unmounts and re-reads its defaults. Adding
           * a second address should start from a blank field rather than from
           * the one just accepted.
           */
          reset(EMPTY_VALUES);
          onSaved?.();
        },
        onError,
      });

      return;
    }

    update.mutate(
      { id: notificationEmail.id, body: values },
      { onSuccess: () => onSaved?.(), onError },
    );
  });

  const alertMessage =
    mutation.error === null || isDuplicateEmailConflict(mutation.error)
      ? undefined
      : describeError(mutation.error);

  /*
   * `max-w-xl` because the field holds an email address, not a paragraph: a
   * single input stretched across a full-width card reads as a search bar and
   * puts its submit button a screen away from what it submits. The cap is inert
   * inside the edit dialog, which is already narrower.
   */
  return (
    <form onSubmit={onSubmit} noValidate className="grid max-w-xl gap-4">
      <FormAlert message={alertMessage} />

      <FormField
        label={t('leaveNotificationEmails.fields.email')}
        error={errors.email?.message}
        type="email"
        inputMode="email"
        maxLength={EMAIL_MAX_LENGTH}
        placeholder={t('leaveNotificationEmails.fields.emailPlaceholder')}
        autoComplete="off"
        spellCheck={false}
        {...register('email')}
      />

      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        {onCancel !== undefined && (
          <Button type="button" variant="outline" onClick={onCancel}>
            {t('actions.cancel')}
          </Button>
        )}
        <SubmitButton pending={mutation.isPending}>
          {isEdit ? t('actions.save') : t('leaveNotificationEmails.actions.add')}
        </SubmitButton>
      </div>
    </form>
  );
};
