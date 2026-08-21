import { useTranslation } from 'react-i18next';

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

import type { LeaveNotificationEmail } from '../leave-notification-emails-api';
import { LeaveNotificationEmailForm } from './LeaveNotificationEmailForm';

export interface LeaveNotificationEmailFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The address being corrected. */
  notificationEmail: LeaveNotificationEmail;
}

/**
 * The edit form, in a dialog.
 *
 * Adding happens inline and correcting happens here, which is not an
 * inconsistency: the inline form belongs to the section, while an edit belongs
 * to a *row* — and an input that appears inside a list, shifting everything
 * under it, is harder to follow than a modal that says which address it is
 * about.
 *
 * The form is mounted only while the dialog is open, which is what makes
 * `defaultValues` correct without a `reset` effect: `react-hook-form` reads them
 * once, at mount, so reopening on a different row initialises from that row
 * rather than holding what was typed into another. An abandoned edit leaves
 * nothing behind, including the mutation's error.
 */
export const LeaveNotificationEmailFormDialog = ({
  open,
  onOpenChange,
  notificationEmail,
}: LeaveNotificationEmailFormDialogProps) => {
  const { t } = useTranslation();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85dvh] gap-4 overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t('leaveNotificationEmails.form.editTitle')}</DialogTitle>
          <DialogDescription>
            {t('leaveNotificationEmails.form.editDescription')}
          </DialogDescription>
        </DialogHeader>

        <LeaveNotificationEmailForm
          notificationEmail={notificationEmail}
          onSaved={() => onOpenChange(false)}
          onCancel={() => onOpenChange(false)}
        />
      </DialogContent>
    </Dialog>
  );
};
