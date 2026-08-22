import { zodResolver } from '@hookform/resolvers/zod';
import { PlusIcon } from 'lucide-react';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';

import { FormAlert } from '@/components/form/FormAlert';
import { FormField } from '@/components/form/FormField';
import { SubmitButton } from '@/components/form/SubmitButton';
import { Button } from '@/components/ui/button';
import { useServerFieldErrors } from '@/hooks/useServerFieldErrors';
import { useApiErrorMessage } from '@/i18n/useApiErrorMessage';

import {
  EMAIL_MAX_LENGTH,
  type TimesheetApprovalEmailFormInput,
  type TimesheetApprovalEmailFormValues,
} from '../timesheet-approval-email-schemas';
import { useCreateTimesheetApprovalEmail } from '../useTimesheetApprovalEmails';
import { useWorkScheduleSchemas } from '../useWorkScheduleSchemas';
import { isDuplicateApprovalEmailConflict } from '../work-schedule-errors';

/** The fields a `VALIDATION_ERROR` can be mapped back onto. There is one. */
const FIELDS = ['email'] as const;

const EMPTY_VALUES: TimesheetApprovalEmailFormInput = { email: '' };

/**
 * "Adaugă adresa de email" — a button that becomes a field.
 *
 * ## Why this one is disclosed and F10's is always open
 *
 * The leave-notification section makes its add form permanently visible,
 * because the form *is* how that section explains itself: the list has no other
 * affordance, and a labelled input tells the reader what the rows are before
 * anything is clicked.
 *
 * Here the addresses render as chips inside a card that already carries a title
 * and a sentence saying what the list does, so the explaining is done. A
 * permanently open field would sit under them adding a third of the card's
 * height for something used once or twice a year. The mock makes the same call,
 * and it is the right one for this layout rather than an inconsistency with F10.
 *
 * `autoFocus` on disclosure is what keeps that honest for the keyboard: pressing
 * the button puts the caret in the field it just revealed, so the control is one
 * key away rather than one key plus a tab through whatever the browser decides
 * comes next. Cancelling returns to the button.
 *
 * ## The `409` goes on the field
 *
 * One input, one way to be refused — the address is already on the list — so the
 * sentence belongs on the value to change rather than in a form-level alert
 * pointing at the only input on screen. The alert is suppressed for that case so
 * one refusal is reported once. Everything else — a `VALIDATION_ERROR`, a `403`,
 * a dead network — keeps the ordinary treatment.
 */
export const TimesheetApprovalEmailAddForm = () => {
  const { t } = useTranslation();
  const { timesheetApprovalEmailSchema } = useWorkScheduleSchemas();
  const describeError = useApiErrorMessage();
  const markRejectedFields = useServerFieldErrors<TimesheetApprovalEmailFormInput>();
  const create = useCreateTimesheetApprovalEmail();

  const [isAdding, setIsAdding] = useState(false);

  const {
    register,
    handleSubmit,
    reset,
    setError,
    formState: { errors },
  } = useForm<TimesheetApprovalEmailFormInput, unknown, TimesheetApprovalEmailFormValues>({
    resolver: zodResolver(timesheetApprovalEmailSchema),
    defaultValues: EMPTY_VALUES,
  });

  const close = () => {
    setIsAdding(false);
    reset(EMPTY_VALUES);
    create.reset();
  };

  const onSubmit = handleSubmit((values: TimesheetApprovalEmailFormValues) => {
    create.mutate(values, {
      onSuccess: () => {
        /*
         * The field is emptied but the form stays open: adding two addresses in
         * one sitting is the common case, and closing after each would put the
         * disclosure button between them.
         */
        reset(EMPTY_VALUES);
      },
      onError: (error) => {
        if (isDuplicateApprovalEmailConflict(error)) {
          setError('email', {
            type: 'server',
            message: t('workSchedule.emails.errors.duplicate'),
          });

          return;
        }

        markRejectedFields(error, FIELDS, setError);
      },
    });
  });

  if (!isAdding) {
    return (
      /* `self-start` so the button is the width of its label rather than the
       * width of the card: the parent is a flex column, which would otherwise
       * stretch it edge to edge and make a small action look like a banner. */
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="self-start"
        onClick={() => setIsAdding(true)}
      >
        <PlusIcon aria-hidden="true" />
        {t('workSchedule.emails.actions.add')}
      </Button>
    );
  }

  const alertMessage =
    create.error === null || isDuplicateApprovalEmailConflict(create.error)
      ? undefined
      : describeError(create.error);

  return (
    <form onSubmit={onSubmit} noValidate className="grid max-w-xl gap-4">
      <FormAlert message={alertMessage} />

      {/*
       * `autoFocus` is defensible here and rarely is elsewhere: the input did
       * not exist a moment ago, and it exists because the person pressed the
       * button that reveals it. Focus follows their click rather than being
       * taken from wherever they were.
       */}
      <FormField
        autoFocus
        label={t('workSchedule.emails.fields.email')}
        error={errors.email?.message}
        type="email"
        inputMode="email"
        maxLength={EMAIL_MAX_LENGTH}
        placeholder={t('workSchedule.emails.fields.emailPlaceholder')}
        autoComplete="off"
        spellCheck={false}
        {...register('email')}
      />

      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Button type="button" variant="outline" onClick={close}>
          {t('actions.cancel')}
        </Button>
        <SubmitButton pending={create.isPending}>
          {t('workSchedule.emails.actions.confirmAdd')}
        </SubmitButton>
      </div>
    </form>
  );
};
