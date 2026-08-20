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

import { useDepartmentErrorMessage } from '../department-errors';
import type { Department } from '../departments-api';
import { useDeleteDepartment } from '../useDepartments';

export interface DeleteDepartmentDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  department: Department;
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
 * A department any employee is still assigned to is refused with a `409`, and
 * that is the *expected* outcome for most rows rather than an edge case —
 * `DepartmentService.remove()` counts employees before it deletes, and the
 * backend's own reasoning is that a department with staff is a reporting
 * dimension for their history, so removing it would either orphan those rows or
 * delete people to delete a label.
 *
 * The message is therefore rendered here, where the person is looking, and the
 * dialog stays open — closing it and leaving a toast to explain a row that is
 * still in the list is exactly the "half-deleted" state to avoid. The sentence
 * also names both ways out: reassign the employees, or deactivate the department
 * to retire it without touching anything recorded against it.
 */
export const DeleteDepartmentDialog = ({
  open,
  onOpenChange,
  department,
  onDeleted,
}: DeleteDepartmentDialogProps) => {
  const { t } = useTranslation();
  const describeError = useDepartmentErrorMessage('inUse');
  const remove = useDeleteDepartment();

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
      { id: department.id, name: department.name },
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
          <AlertDialogTitle>{t('departments.delete.title')}</AlertDialogTitle>
          <AlertDialogDescription>
            {t('departments.delete.description', { name: department.name })}
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
