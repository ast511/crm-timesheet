import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';

/**
 * The `<Suspense>` fallback for {@link HealthStatusCard}, shaped like it.
 *
 * Each feature ships its own skeleton for exactly this reason: a generic
 * placeholder is the wrong height, so the page moves when the data lands. This
 * one is a card with a title, a subtitle and two rows — which is what arrives.
 */
export const HealthStatusCardSkeleton = () => (
  <Card aria-hidden="true">
    <CardHeader className="gap-2">
      <Skeleton className="h-5 w-40" />
      <Skeleton className="h-4 w-64 max-w-full" />
    </CardHeader>
    <CardContent>
      <div className="grid grid-cols-[minmax(6rem,auto)_1fr] gap-x-4 gap-y-2">
        <Skeleton className="h-4 w-20" />
        <Skeleton className="h-4 w-16" />
        <Skeleton className="h-4 w-20" />
        <Skeleton className="h-4 w-24" />
      </div>
    </CardContent>
  </Card>
);
