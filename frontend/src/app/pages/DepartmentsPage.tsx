import { useTranslation } from 'react-i18next';

import { DataTableSkeleton } from '@/components/data-table/DataTableSkeleton';
import { FadeIn } from '@/components/motion/FadeIn';
import { QueryBoundary } from '@/components/QueryBoundary';
import { DepartmentCreateButton } from '@/features/departments/components/DepartmentCreateButton';
import { DepartmentsTable } from '@/features/departments/components/DepartmentsTable';
import { usePageMeta } from '@/hooks/usePageMeta';

/** The table has five columns and asks for twenty rows a page. */
const SKELETON_COLUMNS = 5;
const SKELETON_ROWS = 8;

/**
 * `/app/team/settings/departments` — the organisational units employees belong
 * to.
 *
 * Deliberately identical in shape to `LeaveTypesPage`, because the two are
 * sibling settings screens and should feel like it. The only differences are the
 * i18n keys, the permission resource and the skeleton's column count.
 *
 * ## The heading is outside the boundary, the list is inside it
 *
 * `usePageMeta` and the `<h1>` state facts that do not depend on the response —
 * this is the departments screen whether or not the first page has arrived — so
 * they render immediately and stay put while the table suspends into a skeleton
 * shaped like itself. The create button is outside for the same reason: it opens
 * an empty form and needs nothing loaded.
 *
 * `QueryBoundary` also supplies the error boundary the suspended query needs. A
 * failed load renders `QueryErrorState` — the backend's `errorCode`, translated,
 * with a retry — rather than taking the shell down, and it is visibly a *failure*
 * rather than an empty list. That is what keeps the failure case and the empty
 * case apart by construction: a thrown query cannot render as an empty list.
 *
 * The route already refuses anybody without `DEPARTMENTS.PAGE_ACCESS` before
 * this component mounts (`requirePermission` in `team.routes.tsx`), so nothing
 * here re-checks it. What the page does gate is the actions: creating, editing
 * and deleting each carry their own key.
 */
export const DepartmentsPage = () => {
  const { t } = useTranslation();

  usePageMeta({
    title: t('pages.settingsDepartments.title'),
    description: t('pages.settingsDepartments.description'),
  });

  return (
    <FadeIn className="flex flex-col gap-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex flex-col gap-1">
          <h1 className="text-xl font-semibold tracking-tight">
            {t('pages.settingsDepartments.title')}
          </h1>
          <p className="text-sm text-muted-foreground">
            {t('pages.settingsDepartments.description')}
          </p>
        </div>

        <DepartmentCreateButton />
      </div>

      <QueryBoundary
        fallback={<DataTableSkeleton rows={SKELETON_ROWS} columns={SKELETON_COLUMNS} />}
      >
        <DepartmentsTable />
      </QueryBoundary>
    </FadeIn>
  );
};
