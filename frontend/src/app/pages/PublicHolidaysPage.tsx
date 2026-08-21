import { useTranslation } from 'react-i18next';

import { DataTableSkeleton } from '@/components/data-table/DataTableSkeleton';
import { FadeIn } from '@/components/motion/FadeIn';
import { QueryBoundary } from '@/components/QueryBoundary';
import { PublicHolidayCreateButton } from '@/features/public-holidays/components/PublicHolidayCreateButton';
import { PublicHolidaysTable } from '@/features/public-holidays/components/PublicHolidaysTable';
import { usePageMeta } from '@/hooks/usePageMeta';

/** The table has six columns and asks for twenty rows a page. */
const SKELETON_COLUMNS = 6;
const SKELETON_ROWS = 8;

/**
 * `/app/team/settings/public-holidays` — the days the company is closed.
 *
 * Deliberately identical in shape to `LeaveTypesPage` and `DepartmentsPage`,
 * because the three are sibling settings screens and should feel like it. The
 * only differences are the i18n keys, the permission resource and the
 * skeleton's column count.
 *
 * ## The heading is outside the boundary, the list is inside it
 *
 * `usePageMeta` and the `<h1>` state facts that do not depend on the response —
 * this is the holidays screen whether or not the first page has arrived — so
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
 * ## The route's guard is `PUBLIC_HOLIDAYS.EDIT`, and that is not a slip
 *
 * The two settings screens before this one open on their resource's
 * `PAGE_ACCESS`. This one does not, and the sidebar agrees with it: **every
 * employee holds `PUBLIC_HOLIDAYS.PAGE_ACCESS`**, because that is the key that
 * opens their own holiday calendar under `/app/public-holidays`. Guarding an
 * administrative screen with it would put this page in front of the entire
 * company. What makes a screen a *team* screen is maintaining the calendar
 * rather than reading it, so the route asks for `EDIT` — the same reasoning
 * `TEAM_NAVIGATION` records for the timesheets item, and the same resource
 * either way.
 *
 * The guard runs in `team.routes.tsx` before this component mounts, so nothing
 * here re-checks it. What the page does gate is the actions: creating, editing
 * and deleting each carry their own key.
 */
export const PublicHolidaysPage = () => {
  const { t } = useTranslation();

  usePageMeta({
    title: t('pages.settingsPublicHolidays.title'),
    description: t('pages.settingsPublicHolidays.description'),
  });

  return (
    <FadeIn className="flex flex-col gap-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex flex-col gap-1">
          <h1 className="text-xl font-semibold tracking-tight">
            {t('pages.settingsPublicHolidays.title')}
          </h1>
          <p className="text-sm text-muted-foreground">
            {t('pages.settingsPublicHolidays.description')}
          </p>
        </div>

        <PublicHolidayCreateButton />
      </div>

      <QueryBoundary
        fallback={<DataTableSkeleton rows={SKELETON_ROWS} columns={SKELETON_COLUMNS} />}
      >
        <PublicHolidaysTable />
      </QueryBoundary>
    </FadeIn>
  );
};
