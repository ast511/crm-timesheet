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

import type { LeaveNotificationEmail } from '../leave-notification-emails-api';
import { useDeleteLeaveNotificationEmail } from '../useLeaveNotificationEmails';

export interface DeleteLeaveNotificationEmailDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  notificationEmail: LeaveNotificationEmail;
  /** Called after the row is gone, so the list can settle onto a valid page. */
  onDeleted?: () => void;
}

/**
 * The confirmation a removal has to pass through.
 *
 * An `AlertDialog` rather than a `Dialog`, so it cannot be dismissed by the
 * backdrop or by Escape: the question is answered rather than waved away. That
 * matters more here than the size of the record suggests — removing an address
 * silently stops a mailbox receiving leave requests, and nothing on this screen
 * afterwards would say that it used to.
 *
 * ## What can go wrong, and where it is said
 *
 * Unlike the leave types above, **nothing refuses this delete**: an address is a
 * routing rule rather than something other rows point at, so the endpoint
 * documents only a `404` — the row somebody else removed while this dialog was
 * open. There is no `409` to explain, so the message is the plain translated
 * envelope, rendered here rather than as a toast for the reason F07 gives:
 * closing the dialog and leaving a toast to explain a row that is still in the
 * list is exactly the half-deleted state to avoid.
 */
export const DeleteLeaveNotificationEmailDialog = ({
  open,
  onOpenChange,
  notificationEmail,
  onDeleted,
}: DeleteLeaveNotificationEmailDialogProps) => {
  const { t } = useTranslation();
  const describeError = useApiErrorMessage();
  const remove = useDeleteLeaveNotificationEmail();

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
      { id: notificationEmail.id, email: notificationEmail.email },
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
          <AlertDialogTitle>{t('leaveNotificationEmails.delete.title')}</AlertDialogTitle>
          <AlertDialogDescription>
            {t('leaveNotificationEmails.delete.description', {
              email: notificationEmail.email,
            })}
          </AlertDialogDescription>
        </AlertDialogHeader>

        <FormAlert
          message={remove.error === null ? undefined : describeError(remove.error)}
        />

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
