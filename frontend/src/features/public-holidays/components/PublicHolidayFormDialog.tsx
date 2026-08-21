import { useTranslation } from 'react-i18next';

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

import type { PublicHoliday } from '../public-holidays-api';
import { PublicHolidayForm } from './PublicHolidayForm';

export interface PublicHolidayFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The row being edited, or `undefined` to create a new one. */
  holiday?: PublicHoliday;
}

/**
 * The form in a dialog — a modal rather than a page, because a holiday is a
 * handful of short fields and leaving the list to fill them in would cost the
 * context of the days it has to sit beside. Which matters more here than on the
 * two settings screens before it: whether 1 January is already taken is a
 * question the list behind the dialog answers.
 *
 * ## The form is mounted only while the dialog is open
 *
 * That is what makes `defaultValues` correct without a `reset` effect:
 * `react-hook-form` reads them once, at mount, so a closed-and-reopened dialog
 * gets a form freshly initialised from the current row rather than one still
 * holding what was typed into a different one. It also means an abandoned edit
 * leaves nothing behind — including the mutation's error, which unmounts with
 * it, and the type-conditional fields, which start from the row's own type.
 *
 * The dialog scrolls internally rather than growing past the viewport, which is
 * what keeps it usable on a phone: the header stays where it is and the buttons
 * are reachable at the end of the fields. It matters more here than on the
 * sibling screens, since a `FIXED` holiday shows two extra inputs.
 */
export const PublicHolidayFormDialog = ({
  open,
  onOpenChange,
  holiday,
}: PublicHolidayFormDialogProps) => {
  const { t } = useTranslation();
  const isEdit = holiday !== undefined;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85dvh] gap-4 overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {isEdit ? t('publicHolidays.form.editTitle') : t('publicHolidays.form.createTitle')}
          </DialogTitle>
          <DialogDescription>
            {isEdit
              ? t('publicHolidays.form.editDescription')
              : t('publicHolidays.form.createDescription')}
          </DialogDescription>
        </DialogHeader>

        <PublicHolidayForm
          holiday={holiday}
          onSaved={() => onOpenChange(false)}
          onCancel={() => onOpenChange(false)}
        />
      </DialogContent>
    </Dialog>
  );
};
