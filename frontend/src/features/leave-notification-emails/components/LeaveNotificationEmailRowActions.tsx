import { EllipsisIcon, PencilIcon, Trash2Icon } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { useCan } from '@/features/permissions/usePermissions';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

import type { LeaveNotificationEmail } from '../leave-notification-emails-api';
import { DeleteLeaveNotificationEmailDialog } from './DeleteLeaveNotificationEmailDialog';
import { LeaveNotificationEmailFormDialog } from './LeaveNotificationEmailFormDialog';

export interface LeaveNotificationEmailRowActionsProps {
  notificationEmail: LeaveNotificationEmail;
  /** Bubbled up so the list can settle onto a valid page after a removal. */
  onDeleted?: () => void;
}

/**
 * The per-row `…` menu: correct the address, or remove it.
 *
 * The same menu the leave-types rows use, for the same reasons — two buttons per
 * row would put a destructive control one mis-click from the row above it, and
 * the Base UI menu arrives keyboard-operable and focus-managed rather than
 * needing that arranged here. Its trigger is labelled with the address, so a
 * screen reader announces *which* row's menu is being opened; on a list where
 * every row looks alike, an unlabelled `…` would be five identical buttons.
 *
 * **Both items are gated on `LEAVES.CONFIGURE`**, where the leave-types menu
 * above splits its two on `LEAVES.EDIT` and `LEAVES.DELETE`. That is the
 * catalog's doing: the seed names "notification addresses" under `CONFIGURE` and
 * nowhere else, so correcting an address and removing one are the same act of
 * configuring where leave mail goes — and no tier should be able to do one and
 * not the other. Backend Feature 041 gates both verbs identically, which is why
 * this menu cannot offer something the API refuses.
 *
 * One key rather than two therefore means the trigger is all-or-nothing here:
 * when it is not held nothing renders at all, an empty menu being worse than no
 * menu. This is presentation only; the backend decides what it accepts.
 */
export const LeaveNotificationEmailRowActions = ({
  notificationEmail,
  onDeleted,
}: LeaveNotificationEmailRowActionsProps) => {
  const { t } = useTranslation();
  const [isEditing, setIsEditing] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const canAct = useCan({ permission: 'LEAVES.CONFIGURE' });

  if (!canAct) return null;

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label={t('leaveNotificationEmails.actions.menu', {
                email: notificationEmail.email,
              })}
            />
          }
        >
          <EllipsisIcon aria-hidden="true" />
        </DropdownMenuTrigger>

        <DropdownMenuContent align="end" className="w-44">
          <DropdownMenuItem onClick={() => setIsEditing(true)}>
            <PencilIcon aria-hidden="true" />
            {t('actions.edit')}
          </DropdownMenuItem>

          <DropdownMenuItem variant="destructive" onClick={() => setIsDeleting(true)}>
            <Trash2Icon aria-hidden="true" />
            {t('actions.delete')}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <LeaveNotificationEmailFormDialog
        open={isEditing}
        onOpenChange={setIsEditing}
        notificationEmail={notificationEmail}
      />

      <DeleteLeaveNotificationEmailDialog
        open={isDeleting}
        onOpenChange={setIsDeleting}
        notificationEmail={notificationEmail}
        onDeleted={onDeleted}
      />
    </>
  );
};
