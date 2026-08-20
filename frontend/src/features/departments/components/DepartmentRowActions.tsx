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

import type { Department } from '../departments-api';
import { DeleteDepartmentDialog } from './DeleteDepartmentDialog';
import { DepartmentFormDialog } from './DepartmentFormDialog';

export interface DepartmentRowActionsProps {
  department: Department;
  /** Bubbled up so the list can settle onto a valid page after a removal. */
  onDeleted?: () => void;
}

/**
 * The per-row `…` menu: edit and delete, behind one trigger.
 *
 * Two buttons in every row would double the width of the actions column and put
 * a destructive control one mis-click from the row above it. A menu keeps the
 * row narrow, gives each action a written label instead of an icon to decode,
 * and — because it is the Base UI menu — arrives keyboard-operable and correctly
 * focus-managed rather than needing that arranged here.
 *
 * ## The gating is per action, and the trigger disappears with them
 *
 * `DEPARTMENTS.EDIT` and `DEPARTMENTS.DELETE` are separate keys in the catalog,
 * so the two items are gated separately: an account that may rename a department
 * but not remove one sees one item, not a menu that refuses on click. When
 * neither is held there is nothing to open, so the trigger itself is not
 * rendered — an empty menu is worse than no menu.
 *
 * This is presentation only. The backend refuses the request regardless of what
 * this component draws.
 */
export const DepartmentRowActions = ({ department, onDeleted }: DepartmentRowActionsProps) => {
  const { t } = useTranslation();
  const [isEditing, setIsEditing] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const canAct = useCan({ anyOf: ['DEPARTMENTS.EDIT', 'DEPARTMENTS.DELETE'] });

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
                aria-label={t('departments.actions.menu', { name: department.name })}
              />
            }
          >
            <EllipsisIcon aria-hidden="true" />
          </DropdownMenuTrigger>

          <DropdownMenuContent align="end" className="w-44">
            <Can permission="DEPARTMENTS.EDIT">
              <DropdownMenuItem onClick={() => setIsEditing(true)}>
                <PencilIcon aria-hidden="true" />
                {t('actions.edit')}
              </DropdownMenuItem>
            </Can>

            <Can permission="DEPARTMENTS.DELETE">
              <DropdownMenuItem variant="destructive" onClick={() => setIsDeleting(true)}>
                <Trash2Icon aria-hidden="true" />
                {t('actions.delete')}
              </DropdownMenuItem>
            </Can>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <DepartmentFormDialog
        open={isEditing}
        onOpenChange={setIsEditing}
        department={department}
      />

      <DeleteDepartmentDialog
        open={isDeleting}
        onOpenChange={setIsDeleting}
        department={department}
        onDeleted={onDeleted}
      />
    </>
  );
};
