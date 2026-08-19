import { useTranslation } from 'react-i18next';

import { QueryBoundary } from '@/components/QueryBoundary';
import { HealthStatusCard } from '@/features/health/HealthStatusCard';
import { HealthStatusCardSkeleton } from '@/features/health/HealthStatusCardSkeleton';
import { usePageMeta } from '@/hooks/usePageMeta';

/**
 * The dashboard, behind `/app`, and the end-to-end proof that the foundation
 * works: a typed request against the generated contract, through the app's
 * axios instance, cached by TanStack Query, suspended into a skeleton that
 * matches the card it becomes.
 *
 * ## The route it serves is the one screen under `/app` with no requirement
 *
 * Its menu item asks for `DASHBOARD.PAGE_ACCESS` — the same key a real
 * dashboard would enforce — but `workspaceIndexRoute` itself declares none,
 * deliberately. `/app` is where a refusal offers to send somebody back to
 * (`NotAuthorizedPage`), and where `/app/team` lands anybody with no team
 * workspace; a guard here would let the way out of the refusal screen be the
 * thing that refuses them, which is a loop rather than an explanation.
 *
 * The permission still does something: revoke it and the dashboard disappears
 * from the sidebar, which is the honest half of the statement. Making the
 * screen unreachable as well is a decision for the feature that builds a real
 * dashboard and can give it somewhere else to send people.
 *
 * Real dashboard content replaces the health card.
 */
export const WorkspaceHomePage = () => {
  const { t } = useTranslation();

  usePageMeta({
    title: t('pages.dashboard.title'),
    description: t('pages.dashboard.description'),
  });

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-xl font-semibold tracking-tight">{t('pages.dashboard.title')}</h1>

      <div className="max-w-md">
        <QueryBoundary fallback={<HealthStatusCardSkeleton />}>
          <HealthStatusCard />
        </QueryBoundary>
      </div>
    </div>
  );
};
