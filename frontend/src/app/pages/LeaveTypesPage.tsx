import { useTranslation } from 'react-i18next';

import { DataTableSkeleton } from '@/components/data-table/DataTableSkeleton';
import { FadeIn } from '@/components/motion/FadeIn';
import { QueryBoundary } from '@/components/QueryBoundary';
import { LeaveTypeCreateButton } from '@/features/leave-types/components/LeaveTypeCreateButton';
import { LeaveTypesTable } from '@/features/leave-types/components/LeaveTypesTable';
import { usePageMeta } from '@/hooks/usePageMeta';

/** The table has nine columns and asks for twenty rows a page. */
const SKELETON_COLUMNS = 9;
const SKELETON_ROWS = 8;

/**
 * `/app/team/settings/leave-types` — the kinds of leave the company recognises.
 *
 * ## The heading is outside the boundary, the list is inside it
 *
 * `usePageMeta` and the `<h1>` state facts that do not depend on the response —
 * this is the leave-types screen whether or not the first page has arrived — so
 * they render immediately and stay put while the table suspends into a skeleton
 * shaped like itself. The create button is outside for the same reason: it opens
 * an empty form and needs nothing loaded.
 *
 * `QueryBoundary` also supplies the error boundary the suspended query needs. A
 * failed load renders `QueryErrorState` — the backend's `errorCode`, translated,
 * with a retry — rather than taking the shell down, and it is visibly a
 * *failure* rather than an empty list.
 *
 * The route already refuses anybody without `LEAVES.PAGE_ACCESS` before this
 * component mounts (`requirePermission` in `team.routes.tsx`), so nothing here
 * re-checks it. What the page does gate is the actions: creating, editing and
 * deleting each carry their own key.
 */
export const LeaveTypesPage = () => {
  const { t } = useTranslation();

  usePageMeta({
    title: t('pages.settingsLeaveTypes.title'),
    description: t('pages.settingsLeaveTypes.description'),
  });

  return (
    <FadeIn className="flex flex-col gap-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex flex-col gap-1">
          <h1 className="text-xl font-semibold tracking-tight">
            {t('pages.settingsLeaveTypes.title')}
          </h1>
          <p className="text-sm text-muted-foreground">
            {t('pages.settingsLeaveTypes.description')}
          </p>
        </div>

        <LeaveTypeCreateButton />
      </div>

      <QueryBoundary
        fallback={<DataTableSkeleton rows={SKELETON_ROWS} columns={SKELETON_COLUMNS} />}
      >
        <LeaveTypesTable />
      </QueryBoundary>
    </FadeIn>
  );
};