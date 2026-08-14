import { useTranslation } from 'react-i18next';

import { QueryBoundary } from '@/components/QueryBoundary';
import { HealthStatusCard } from '@/features/health/HealthStatusCard';
import { HealthStatusCardSkeleton } from '@/features/health/HealthStatusCardSkeleton';

/**
 * The placeholder screen behind `/app`, and the end-to-end proof that the
 * foundation works: a typed request against the generated contract, through the
 * app's axios instance, cached by TanStack Query, suspended into a skeleton
 * that matches the card it becomes.
 *
 * Real screens replace it.
 */
export const WorkspaceHomePage = () => {
  const { t } = useTranslation();

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-xl font-semibold tracking-tight">{t('nav.workspace')}</h1>

      <div className="max-w-md">
        <QueryBoundary fallback={<HealthStatusCardSkeleton />}>
          <HealthStatusCard />
        </QueryBoundary>
      </div>
    </div>
  );
};
