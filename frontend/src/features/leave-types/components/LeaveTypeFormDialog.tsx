import { useTranslation } from 'react-i18next';

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

import type { LeaveType } from '../leave-types-api';
import { LeaveTypeForm } from './LeaveTypeForm';

export interface LeaveTypeFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The row being edited, or `undefined` to create a new one. */
  leaveType?: LeaveType;
}

/**
 * The form in a dialog — a modal rather than a page, because a leave type is a
 * dozen short fields and leaving the list to fill them in would cost the
 * context of the other types the new one has to sit beside.
 *
 * ## The form is mounted only while the dialog is open
 *
 * That is what makes `defaultValues` correct without a `reset` effect:
 * `react-hook-form` reads them once, at mount, so a closed-and-reopened dialog
 * gets a form freshly initialised from the current row rather than one still
 * holding what was typed into a different one. It also means an abandoned edit
 * leaves nothing behind.
 *
 * The dialog scrolls internally rather than growing past the viewport, which is
 * what keeps it usable on a phone: the header stays where it is and the buttons
 * are reachable at the end of the fields.
 */
export const LeaveTypeFormDialog = ({
  open,
  onOpenChange,
  leaveType,
}: LeaveTypeFormDialogProps) => {
  const { t } = useTranslation();
  const isEdit = leaveType !== undefined;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85dvh] gap-4 overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {isEdit ? t('leaveTypes.form.editTitle') : t('leaveTypes.form.createTitle')}
          </DialogTitle>
          <DialogDescription>
            {isEdit
              ? t('leaveTypes.form.editDescription')
              : t('leaveTypes.form.createDescription')}
          </DialogDescription>
        </DialogHeader>

        <LeaveTypeForm
          leaveType={leaveType}
          onSaved={() => onOpenChange(false)}
          onCancel={() => onOpenChange(false)}
        />
      </DialogContent>
    </Dialog>
  );
};