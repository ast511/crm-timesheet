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

import { useDeleteTimesheetApprovalEmail } from '../useTimesheetApprovalEmails';
import type { TimesheetApprovalEmail } from '../work-schedule-api';

export interface DeleteTimesheetApprovalEmailDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  approvalEmail: TimesheetApprovalEmail;
}

/**
 * The confirmation a removal has to pass through.
 *
 * ## Why a chip's little `×` still opens a dialog
 *
 * The mock removes on the first click. That is right for a store and wrong for
 * this: the click is against a `DELETE` that cannot be undone, on a control
 * about four millimetres wide sitting inside a row of near-identical ones — and
 * what it silently stops is a mailbox receiving timesheets for approval.
 * Nothing on this screen afterwards would say that it used to. The failure mode
 * of a mis-click is an approval queue nobody is watching, discovered at the end
 * of a month.
 *
 * An `AlertDialog` rather than a `Dialog`, so it cannot be dismissed by the
 * backdrop or by Escape: the question is answered rather than waved away.
 *
 * ## What can go wrong, and where it is said
 *
 * Nothing refuses this delete — an address is a routing rule rather than
 * something other rows point at, so the endpoint documents only a `404`, the row
 * somebody else removed while this dialog was open. There is no `409` to
 * explain, so the message is the plain translated envelope, rendered here rather
 * than as a toast: closing the dialog and leaving a toast to explain a chip that
 * is still on screen is exactly the half-deleted state to avoid.
 */
export const DeleteTimesheetApprovalEmailDialog = ({
  open,
  onOpenChange,
  approvalEmail,
}: DeleteTimesheetApprovalEmailDialogProps) => {
  const { t } = useTranslation();
  const describeError = useApiErrorMessage();
  const remove = useDeleteTimesheetApprovalEmail();

  /*
   * The mutation outlives the dialog — this component stays mounted while only
   * the popup is portalled in and out — so a refusal has to be cleared on the
   * way out, or reopening would show the previous attempt's failure as though
   * the new one had already failed.
   */
  const handleOpenChange = (next: boolean) => {
    if (!next) remove.reset();
    onOpenChange(next);
  };

  const onConfirm = () => {
    remove.mutate(
      { id: approvalEmail.id, email: approvalEmail.email },
      { onSuccess: () => handleOpenChange(false) },
    );
  };

  return (
    <AlertDialog open={open} onOpenChange={handleOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{t('workSchedule.emails.delete.title')}</AlertDialogTitle>
          <AlertDialogDescription>
            {t('workSchedule.emails.delete.description', { email: approvalEmail.email })}
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
