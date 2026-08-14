import { useTranslation } from 'react-i18next';

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';

import { useHealthQuery } from './useHealthQuery';

/**
 * Renders the API's liveness answer.
 *
 * It exists to prove the foundation works end to end, and it is also the
 * worked example of the conventions: a feature folder holding its query hook,
 * its component and its skeleton; data through `useSuspenseQuery`; no
 * `useEffect` fetching; text through `t()`.
 */
export const HealthStatusCard = () => {
  const { t } = useTranslation();
  const { data } = useHealthQuery();

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('health.title')}</CardTitle>
        <CardDescription>{t('health.description')}</CardDescription>
      </CardHeader>
      <CardContent>
        <dl className="grid grid-cols-[minmax(6rem,auto)_1fr] gap-x-4 gap-y-2 text-sm">
          <dt className="text-muted-foreground">{t('health.status')}</dt>
          <dd className="font-medium">{data.status}</dd>
          <dt className="text-muted-foreground">{t('health.service')}</dt>
          <dd className="font-medium">{data.service}</dd>
        </dl>
      </CardContent>
    </Card>
  );
};
