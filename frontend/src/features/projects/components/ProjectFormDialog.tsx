import { useTranslation } from 'react-i18next';

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

import type { Project } from '../projects-api';
import { ProjectForm } from './ProjectForm';

export interface ProjectFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The row being edited, or `undefined` to create a new one. */
  project?: Project;
}

/**
 * The form in a dialog — a modal rather than a page, because the list behind it
 * is what answers the question the form raises: whether `CRM-TS` is already
 * taken, and what the codes on this team look like. Leaving the list to fill in
 * eleven fields would cost exactly that context.
 *
 * It is the longest form in the application, so the dialog scrolls internally
 * rather than growing past the viewport: the header stays where it is and the
 * buttons remain reachable at the end of the fields, which is what keeps it
 * usable on a phone.
 *
 * ## The form is mounted only while the dialog is open
 *
 * That is what makes `defaultValues` correct without a `reset` effect:
 * `react-hook-form` reads them once, at mount, so a closed-and-reopened dialog
 * gets a form freshly initialised from the current row rather than one still
 * holding what was typed into a different one. It also means an abandoned edit
 * leaves nothing behind — including the mutation's error, which unmounts with
 * it.
 */
export const ProjectFormDialog = ({ open, onOpenChange, project }: ProjectFormDialogProps) => {
  const { t } = useTranslation();
  const isEdit = project !== undefined;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85dvh] gap-4 overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>
            {isEdit ? t('projects.form.editTitle') : t('projects.form.createTitle')}
          </DialogTitle>
          <DialogDescription>
            {isEdit
              ? t('projects.form.editDescription')
              : t('projects.form.createDescription')}
          </DialogDescription>
        </DialogHeader>

        <ProjectForm
          project={project}
          onSaved={() => onOpenChange(false)}
          onCancel={() => onOpenChange(false)}
        />
      </DialogContent>
    </Dialog>
  );
};
