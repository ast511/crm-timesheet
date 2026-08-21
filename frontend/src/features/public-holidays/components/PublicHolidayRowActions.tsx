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

import type { PublicHoliday } from '../public-holidays-api';
import { DeletePublicHolidayDialog } from './DeletePublicHolidayDialog';
import { PublicHolidayFormDialog } from './PublicHolidayFormDialog';

export interface PublicHolidayRowActionsProps {
  holiday: PublicHoliday;
  /** Bubbled up so the list can settle onto a valid page after a removal. */
  onDeleted?: () => void;
}

/**
 * The per-row `…` menu: edit and delete, behind one trigger.
 *
 * Two buttons in every row would double the width of the actions column and put
 * a destructive control one mis-click from the row above it. A menu keeps the
 * row narrow, gives each action a written label instead of an icon to decode,
 * and — because it is the Base UI menu — arrives keyboard-operable and
 * correctly focus-managed rather than needing that arranged here.
 *
 * ## The gating is per action, and the trigger disappears with them
 *
 * `PUBLIC_HOLIDAYS.EDIT` and `PUBLIC_HOLIDAYS.DELETE` are separate keys in the
 * catalog, so the two items are gated separately: an account that may correct a
 * holiday's date but not remove one sees one item, not a menu that refuses on
 * click. When neither is held there is nothing to open, so the trigger itself
 * is not rendered — an empty menu is worse than no menu.
 *
 * This is presentation only. The backend refuses the request regardless of what
 * this component draws.
 */
export const PublicHolidayRowActions = ({
  holiday,
  onDeleted,
}: PublicHolidayRowActionsProps) => {
  const { t } = useTranslation();
  const [isEditing, setIsEditing] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const canAct = useCan({ anyOf: ['PUBLIC_HOLIDAYS.EDIT', 'PUBLIC_HOLIDAYS.DELETE'] });

  if (!canAct) return null;

  return (
    <>
      <div className="flex justify-end">
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label={t('publicHolidays.actions.menu', { name: holiday.name })}
              />
            }
          >
            <EllipsisIcon aria-hidden="true" />
          </DropdownMenuTrigger>

          <DropdownMenuContent align="end" className="w-44">
            <Can permission="PUBLIC_HOLIDAYS.EDIT">
              <DropdownMenuItem onClick={() => setIsEditing(true)}>
                <PencilIcon aria-hidden="true" />
                {t('actions.edit')}
              </DropdownMenuItem>
            </Can>

            <Can permission="PUBLIC_HOLIDAYS.DELETE">
              <DropdownMenuItem variant="destructive" onClick={() => setIsDeleting(true)}>
                <Trash2Icon aria-hidden="true" />
                {t('actions.delete')}
              </DropdownMenuItem>
            </Can>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <PublicHolidayFormDialog open={isEditing} onOpenChange={setIsEditing} holiday={holiday} />

      <DeletePublicHolidayDialog
        open={isDeleting}
        onOpenChange={setIsDeleting}
        holiday={holiday}
        onDeleted={onDeleted}
      />
    </>
  );
};
