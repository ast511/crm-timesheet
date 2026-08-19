import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';

/** One card of labelled rows, standing in for the account or the employment card. */
const DetailCardSkeleton = ({ rows }: { rows: number }) => (
  <Card aria-hidden="true">
    <CardHeader className="gap-2">
      <Skeleton className="h-5 w-32" />
      <Skeleton className="h-4 w-56 max-w-full" />
    </CardHeader>
    <CardContent>
      <div className="grid gap-3 sm:grid-cols-[minmax(7rem,auto)_1fr] sm:gap-x-6">
        {Array.from({ length: rows }, (_, row) => (
          <div key={row} className="grid gap-0.5 sm:contents">
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-4 w-40 max-w-full" />
          </div>
        ))}
      </div>
    </CardContent>
  </Card>
);

/**
 * The `<Suspense>` fallback for {@link ProfileSections}, shaped like it.
 *
 * The same two-column grid, the same three cards, and four and eight rows
 * respectively — the number of facts the account and the employment record
 * actually have — so the page does not jump when the profile lands.
 *
 * In practice it is rarely seen: `workspaceRoute` awaits the profile before the
 * shell mounts, so arriving here from anywhere inside the application finds it
 * cached. It is what a hard reload of `/app/profile` shows for the length of one
 * request, and what a refetch after `staleTime` would show.
 */
export const ProfileSkeleton = () => (
  <div className="grid items-start gap-6 xl:grid-cols-2">
    <DetailCardSkeleton rows={4} />
    <DetailCardSkeleton rows={8} />

    <div className="xl:col-span-2">
      <Card aria-hidden="true">
        <CardHeader className="gap-2">
          <Skeleton className="h-5 w-28" />
          <Skeleton className="h-4 w-64 max-w-full" />
        </CardHeader>
        <CardContent className="gap-6">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {Array.from({ length: 8 }, (_, swatch) => (
              <Skeleton key={swatch} className="h-20" />
            ))}
          </div>
          <div className="grid grid-cols-5 gap-2">
            {Array.from({ length: 5 }, (_, tile) => (
              <Skeleton key={tile} className="h-16" />
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  </div>
);
