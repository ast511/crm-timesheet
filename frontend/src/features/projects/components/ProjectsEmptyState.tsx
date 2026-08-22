import { FolderKanbanIcon } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { ProjectCreateButton } from './ProjectCreateButton';

/**
 * What the screen says when the company has configured no projects at all.
 *
 * It replaces the whole table rather than showing an empty one, and the
 * distinction it draws is the one that matters: **nothing here yet** is not *no
 * results for what you asked*. A search or a filter that matches nothing keeps
 * the toolbar and the table and says so inside it — the term is still in the
 * box, the filters are still set, and clearing them is the obvious next move.
 * An unconfigured list has nothing to clear and no rows to page through, so a
 * toolbar over an empty table would offer controls for data that does not
 * exist.
 *
 * The sentence says what a project is *for* here, which on this screen is worth
 * the words: an empty project list is not merely an empty settings page, it is
 * a timesheet nobody can fill in, because a timesheet line points at a project.
 *
 * The only thing to do is add the first one, so the call to action is the
 * content. For somebody without `PROJECTS.CREATE` the button renders nothing
 * and the explanation stands on its own — which is correct: they can see the
 * list is empty and that filling it is not their job.
 */
export const ProjectsEmptyState = () => {
  const { t } = useTranslation();

  return (
    <div className="flex flex-col items-center gap-4 rounded-lg border border-dashed px-6 py-12 text-center">
      <span
        aria-hidden="true"
        className="flex size-12 items-center justify-center rounded-full bg-muted text-muted-foreground"
      >
        <FolderKanbanIcon className="size-6" />
      </span>

      <div className="flex flex-col gap-1">
        <h2 className="font-medium">{t('projects.empty.title')}</h2>
        <p className="max-w-prose text-sm text-muted-foreground">
          {t('projects.empty.description')}
        </p>
      </div>

      <ProjectCreateButton />
    </div>
  );
};
