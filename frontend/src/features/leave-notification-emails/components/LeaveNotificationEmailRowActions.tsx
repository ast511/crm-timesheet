import { EllipsisIcon, PencilIcon, Trash2Icon } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { Can } from '@/features/permissions/Can';
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
 * `LEAVES.EDIT` and `LEAVES.DELETE` gate the two items separately, and when
 * neither is held the trigger is not rendered at all — an empty menu is worse
 * than no menu. This is presentation only; the backend decides what it accepts.
 */
export const LeaveNotificationEmailRowActions = ({
  notificationEmail,
  onDeleted,
}: LeaveNotificationEmailRowActionsProps) => {
  const { t } = useTranslation();
  const [isEditing, setIsEditing] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const canAct = useCan({ anyOf: ['LEAVES.EDIT', 'LEAVES.DELETE'] });

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
          <Can permission="LEAVES.EDIT">
            <DropdownMenuItem onClick={() => setIsEditing(true)}>
              <PencilIcon aria-hidden="true" />
              {t('actions.edit')}
            </DropdownMenuItem>
          </Can>

          <Can permission="LEAVES.DELETE">
            <DropdownMenuItem variant="destructive" onClick={() => setIsDeleting(true)}>
              <Trash2Icon aria-hidden="true" />
              {t('actions.delete')}
            </DropdownMenuItem>
          </Can>
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
