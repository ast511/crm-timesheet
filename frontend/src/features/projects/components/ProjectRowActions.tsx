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

import type { Project } from '../projects-api';
import { DeleteProjectDialog } from './DeleteProjectDialog';
import { ProjectFormDialog } from './ProjectFormDialog';

export interface ProjectRowActionsProps {
  project: Project;
  /** Bubbled up so the list can settle onto a valid page after a removal. */
  onDeleted?: () => void;
}

/**
 * The per-row `…` menu: edit and delete, behind one trigger.
 *
 * Two buttons in every row would widen the actions column and put a destructive
 * control one mis-click from the row above it. A menu keeps the row narrow,
 * gives each action a written label instead of an icon to decode, and — because
 * it is the Base UI menu — arrives keyboard-operable and correctly
 * focus-managed rather than needing that arranged here.
 *
 * ## The gating is per action, and the trigger disappears with them
 *
 * `PROJECTS.EDIT` and `PROJECTS.DELETE` are separate keys in the catalog, so
 * the two items are gated separately: an account that may correct a project's
 * dates but not remove one sees one item, not a menu that refuses on click.
 * When neither is held there is nothing to open, so the trigger itself is not
 * rendered — an empty menu is worse than no menu.
 *
 * This is presentation only, and on this resource that is worth saying plainly:
 * `ProjectController` carries **no `@RequirePermission()` on any verb**, so the
 * backend does not currently refuse a write from an account that lacks these
 * keys the way it refuses one to `/permissions`. Hiding the controls is the
 * whole of the enforcement today. The route guard, the sidebar and this menu
 * agree on `PROJECTS`, and the gap is recorded in the feature document rather
 * than papered over here — a frontend cannot fix it, and pretending otherwise
 * would be worse than naming it.
 */
export const ProjectRowActions = ({ project, onDeleted }: ProjectRowActionsProps) => {
  const { t } = useTranslation();
  const [isEditing, setIsEditing] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const canAct = useCan({ anyOf: ['PROJECTS.EDIT', 'PROJECTS.DELETE'] });

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
                aria-label={t('projects.actions.menu', { name: project.name })}
              />
            }
          >
            <EllipsisIcon aria-hidden="true" />
          </DropdownMenuTrigger>

          <DropdownMenuContent align="end" className="w-44">
            <Can permission="PROJECTS.EDIT">
              <DropdownMenuItem onClick={() => setIsEditing(true)}>
                <PencilIcon aria-hidden="true" />
                {t('actions.edit')}
              </DropdownMenuItem>
            </Can>

            <Can permission="PROJECTS.DELETE">
              <DropdownMenuItem variant="destructive" onClick={() => setIsDeleting(true)}>
                <Trash2Icon aria-hidden="true" />
                {t('actions.delete')}
              </DropdownMenuItem>
            </Can>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <ProjectFormDialog open={isEditing} onOpenChange={setIsEditing} project={project} />

      <DeleteProjectDialog
        open={isDeleting}
        onOpenChange={setIsDeleting}
        project={project}
        onDeleted={onDeleted}
      />
    </>
  );
};
