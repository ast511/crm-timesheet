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

import { useLeaveTypeErrorMessage } from '../leave-type-errors';
import type { LeaveType } from '../leave-types-api';
import { useDeleteLeaveType } from '../useLeaveTypes';

export interface DeleteLeaveTypeDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  leaveType: LeaveType;
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
 * ## The failure keeps the dialog open
 *
 * A leave type that any balance or leave request still names is refused with a
 * `409`, and that is the *expected* outcome for most rows rather than an edge
 * case. The message is rendered here, where the person is looking, and the
 * dialog stays open — closing it and leaving a toast to explain a row that is
 * still in the list is exactly the "half-deleted" state to avoid. The sentence
 * also names what was almost certainly meant instead: deactivate the type,
 * which retires it without touching anything recorded against it.
 */
export const DeleteLeaveTypeDialog = ({
  open,
  onOpenChange,
  leaveType,
  onDeleted,
}: DeleteLeaveTypeDialogProps) => {
  const { t } = useTranslation();
  const describeError = useLeaveTypeErrorMessage('inUse');
  const remove = useDeleteLeaveType();

  /*
   * The mutation outlives the dialog — this component stays mounted while only
   * the popup is portalled in and out — so a refusal has to be cleared on the
   * way out. Without it, reopening the dialog would show the error from the
   * *previous* attempt as though the new one had already failed.
   */
  const handleOpenChange = (next: boolean) => {
    if (!next) remove.reset();
    onOpenChange(next);
  };

  const onConfirm = () => {
    remove.mutate(
      { id: leaveType.id, label: leaveType.label },
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
          <AlertDialogTitle>{t('leaveTypes.delete.title')}</AlertDialogTitle>
          <AlertDialogDescription>
            {t('leaveTypes.delete.description', { label: leaveType.label })}
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