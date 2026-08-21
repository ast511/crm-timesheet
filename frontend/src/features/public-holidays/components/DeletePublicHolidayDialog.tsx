import { useTranslation } from 'react-i18next';

import { FormAlert } from '@/components/form/FormAlert';
import { SubmitButton } from '@/components/form/SubmitButton';
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { useApiErrorMessage } from '@/i18n/useApiErrorMessage';

import type { PublicHoliday } from '../public-holidays-api';
import { useDeletePublicHoliday } from '../usePublicHolidays';

export interface DeletePublicHolidayDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  holiday: PublicHoliday;
  /** Called after the row is gone, so the list can settle onto a valid page. */
  onDeleted?: () => void;
}

/**
 * The confirmation a delete has to pass through.
 *
 * It is an `AlertDialog` rather than a `Dialog` on purpose: this one cannot be
 * dismissed by clicking the backdrop or pressing Escape, so the question is
 * answered rather than waved away — which is the whole difference between the
 * two primitives, and the reason a destructive action uses this one.
 *
 * ## The confirmation carries a warning the sibling screens do not need
 *
 * Nothing refers to a public holiday — the table has no relations — so unlike a
 * leave type or a department, this delete has no `409` to refuse it and cannot
 * be blocked by data that depends on it. That makes it *more* dangerous rather
 * than less: the row goes, and with it the recorded reason that a day in a past
 * year was not worked.
 *
 * So the description says what the endpoint's own documentation says — delete
 * is for a row entered by mistake, and a holiday that was real and has since
 * been repealed is an edit to `validToYear`, which keeps the history the
 * validity range exists to preserve. The alternative is named in the sentence
 * rather than left for somebody to think of afterwards.
 *
 * ## The failure still keeps the dialog open
 *
 * There is no expected refusal here, only the unexpected ones — a `404` for a
 * row a colleague deleted a moment ago, a `403`, a dead network — so the
 * message comes straight from `useApiErrorMessage` with no conflict sentence of
 * its own. It is rendered here, where the person is looking, and the dialog
 * stays open: closing it and leaving a toast to explain a row that is still in
 * the list is exactly the "half-deleted" state to avoid.
 */
export const DeletePublicHolidayDialog = ({
  open,
  onOpenChange,
  holiday,
  onDeleted,
}: DeletePublicHolidayDialogProps) => {
  const { t } = useTranslation();
  const describeError = useApiErrorMessage();
  const remove = useDeletePublicHoliday();

  /*
   * The mutation outlives the dialog — this component stays mounted while only
   * the popup is portalled in and out — so a refusal has to be cleared on the
   * way out. Without it, reopening the dialog would show the error from the
   * *previous* attempt as though the new one had already failed. (The form
   * dialog needs no equivalent: its form unmounts with the portal.)
   */
  const handleOpenChange = (next: boolean) => {
    if (!next) remove.reset();
    onOpenChange(next);
  };

  const onConfirm = () => {
    remove.mutate(
      { id: holiday.id, name: holiday.name },
      {
        onSuccess: () => {
          handleOpenChange(false);
          onDeleted?.();
        },
      },
    );
  };

  return (
    <AlertDialog open={open} onOpenChange={handleOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{t('publicHolidays.delete.title')}</AlertDialogTitle>
          <AlertDialogDescription>
            {t('publicHolidays.delete.description', { name: holiday.name })}
          </AlertDialogDescription>
        </AlertDialogHeader>

        <FormAlert message={remove.error === null ? undefined : describeError(remove.error)} />

        <AlertDialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => handleOpenChange(false)}
            disabled={remove.isPending}
          >
            {t('actions.cancel')}
          </Button>
          <SubmitButton
            type="button"
            variant="destructive"
            pending={remove.isPending}
            onClick={onConfirm}
          >
            {t('actions.delete')}
          </SubmitButton>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
};
