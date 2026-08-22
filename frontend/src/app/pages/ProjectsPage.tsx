import { useTranslation } from 'react-i18next';

import { DataTableSkeleton } from '@/components/data-table/DataTableSkeleton';
import { FadeIn } from '@/components/motion/FadeIn';
import { QueryBoundary } from '@/components/QueryBoundary';
import { ProjectCreateButton } from '@/features/projects/components/ProjectCreateButton';
import { ProjectsTable } from '@/features/projects/components/ProjectsTable';
import { usePageMeta } from '@/hooks/usePageMeta';

/** The table has seven columns and asks for twenty rows a page. */
const SKELETON_COLUMNS = 7;
const SKELETON_ROWS = 8;

/**
 * `/app/team/settings/projects` — the work the company bills.
 *
 * Deliberately identical in shape to `LeaveTypesPage`, `DepartmentsPage` and
 * `PublicHolidaysPage`, because the four are sibling settings screens and
 * should feel like it. The only differences are the i18n keys, the permission
 * resource and the skeleton's column count.
 *
 * ## The heading is outside the boundary, the list is inside it
 *
 * `usePageMeta` and the `<h1>` state facts that do not depend on the response —
 * this is the projects screen whether or not the first page has arrived — so
 * they render immediately and stay put while the table suspends into a skeleton
 * shaped like itself. The create button is outside for the same reason: it
 * opens an empty form and needs nothing loaded.
 *
 * `QueryBoundary` also supplies the error boundary the suspended query needs. A
 * failed load renders `QueryErrorState` — the backend's `errorCode`, translated,
 * with a retry — rather than taking the shell down, and it is visibly a
 * *failure* rather than an empty list. That is what keeps the failure case and
 * the empty case apart by construction: a thrown query cannot render as an
 * empty list.
 *
 * ## Gating, and the one asymmetry worth naming
 *
 * The route guard is `PROJECTS.EDIT` and was already, from the placeholder this
 * page replaces — `TEAM_NAVIGATION` gates the sidebar item identically, and the
 * two have to agree or a visible menu entry leads to a refusal. `EDIT` rather
 * than `PAGE_ACCESS` is the same judgement F09 made for holidays and F05 made
 * for team timesheets: maintaining a shared configuration is the administrative
 * act, and page-access keys are held further down the roles than the people who
 * should be changing this.
 *
 * Inside the page each action carries its own key — `PROJECTS.CREATE` on the
 * button, `.EDIT` and `.DELETE` on the row menu — so opening the screen and
 * changing it are separate entitlements.
 *
 * **`GET /projects` is deliberately not gated at all, and must stay that way.**
 * `ProjectController` declares no `@RequirePermission()`, which for the list
 * route is a property to preserve rather than an oversight: the timesheet's
 * project picker reads it for every employee, and the `USER` baseline holds no
 * `PROJECTS.*` key. Gating it would empty that picker. This screen is gated in
 * the router and the sidebar instead, which is where a settings screen's
 * audience is decided.
 *
 * The guard runs in `team.routes.tsx` before this component mounts, so nothing
 * here re-checks it.
 */
export const ProjectsPage = () => {
  const { t } = useTranslation();

  usePageMeta({
    title: t('pages.settingsProjects.title'),
    description: t('pages.settingsProjects.description'),
  });

  return (
    <FadeIn className="flex flex-col gap-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex flex-col gap-1">
          <h1 className="text-xl font-semibold tracking-tight">
            {t('pages.settingsProjects.title')}
          </h1>
          <p className="text-sm text-muted-foreground">
            {t('pages.settingsProjects.description')}
          </p>
        </div>

        <ProjectCreateButton />
      </div>

      <QueryBoundary
        fallback={<DataTableSkeleton rows={SKELETON_ROWS} columns={SKELETON_COLUMNS} />}
      >
        <ProjectsTable />
      </QueryBoundary>
    </FadeIn>
  );
};
