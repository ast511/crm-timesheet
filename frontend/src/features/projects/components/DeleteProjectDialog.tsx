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

import { useProjectErrorMessage } from '../project-errors';
import type { Project } from '../projects-api';
import { useDeleteProject } from '../useProjects';

export interface DeleteProjectDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  project: Project;
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
 * ## The `409` here is the expected answer, not an edge case
 *
 * This is the strongest refusal of the four settings screens. The service
 * counts **memberships** and **timesheet entries** before deleting, and either
 * one blocks it: the first records who worked on the project, the second the
 * hours booked against it — on months the company may already have signed off
 * and invoiced. Both are backed by `ON DELETE RESTRICT`, so the check exists to
 * produce a message naming what is in the way instead of a driver error
 * surfacing as a `500`.
 *
 * So a delete on any project that has been *used* will be refused, and the way
 * past it is not a harder delete. It is `isArchived`, which retires the project
 * from new work while leaving every hour booked to it intact — named in the
 * description rather than left for somebody to think of afterwards, and offered
 * as a switch in the form one menu item away.
 *
 * ## The failure keeps the dialog open
 *
 * `useProjectErrorMessage('inUse')` turns the coded-less `409` into the
 * sentence that says which relations block it; everything else — a `404` for a
 * row a colleague deleted a moment ago, a `403`, a dead network — falls through
 * to the generic message. Either way it is rendered here, where the person is
 * looking, and the dialog stays open: closing it and leaving a toast to explain
 * a row that is still in the list is exactly the "half-deleted" state to avoid.
 */
export const DeleteProjectDialog = ({
  open,
  onOpenChange,
  project,
  onDeleted,
}: DeleteProjectDialogProps) => {
  const { t } = useTranslation();
  const describeError = useProjectErrorMessage('inUse');
  const remove = useDeleteProject();

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
      { id: project.id, name: project.name },
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
          <AlertDialogTitle>{t('projects.delete.title')}</AlertDialogTitle>
          <AlertDialogDescription>
            {t('projects.delete.description', { name: project.name })}
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
