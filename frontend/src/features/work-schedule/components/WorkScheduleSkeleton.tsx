import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';

import { WEEKDAYS } from '../work-schedule-api';

/** The eight half-width inputs of the hours grid, under the timezone field. */
const HOURS_FIELDS = Array.from({ length: 8 }, (_, index) => index);

/**
 * The `<Suspense>` fallback for the whole screen.
 *
 * Shaped like the three cards it stands in for — seven day toggles in a row, a
 * two-column grid of eight fields, a row of chips — rather than a spinner, so
 * nothing shifts when the configuration arrives. `CLAUDE.md` asks for exactly
 * this: a skeleton that mirrors the real component, because the failure it
 * prevents is layout shift rather than boredom.
 *
 * The toggle count comes from `WEEKDAYS`, so the placeholder cannot drift from
 * the control it imitates the day the contract's enum changes.
 *
 * `DataTableSkeleton` is deliberately not reused. This screen has no table, and
 * a placeholder for a toolbar and a header row that never appear would be a
 * promise the real page breaks.
 */
export const WorkScheduleSkeleton = () => (
  <div className="flex flex-col gap-6" aria-hidden="true">
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between gap-2">
          <Skeleton className="h-5 w-48" />
          <Skeleton className="h-5 w-28 rounded-md" />
        </div>
        <Skeleton className="h-4 w-full max-w-md" />
      </CardHeader>
      <CardContent className="flex flex-col gap-6">
        <div className="flex gap-2">
          <Skeleton className="h-8 w-28 rounded-md" />
          <Skeleton className="h-8 w-32 rounded-md" />
        </div>
        <div className="grid grid-cols-7 gap-1.5 sm:gap-2">
          {WEEKDAYS.map((weekday) => (
            <Skeleton key={weekday} className="h-14 rounded-lg sm:h-16" />
          ))}
        </div>
        <Skeleton className="h-16 w-full rounded-lg" />
      </CardContent>
    </Card>

    <Card>
      <CardHeader>
        <Skeleton className="h-5 w-56" />
        <Skeleton className="h-4 w-full max-w-md" />
      </CardHeader>
      <CardContent className="flex flex-col gap-6">
        <div className="grid gap-5 md:grid-cols-2">
          {/* The timezone combobox, which spans both columns in the real card. */}
          <div className="grid gap-2 md:col-span-2">
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-9 w-full rounded-md" />
            <Skeleton className="h-3 w-full max-w-sm" />
          </div>

          {HOURS_FIELDS.map((field) => (
            <div key={field} className="grid gap-2">
              <Skeleton className="h-4 w-40" />
              <Skeleton className="h-9 w-full rounded-md" />
              <Skeleton className="h-3 w-52" />
            </div>
          ))}
        </div>
        <div className="flex gap-3">
          <Skeleton className="h-9 w-44 rounded-md" />
          <Skeleton className="h-9 w-56 rounded-md" />
        </div>
      </CardContent>
    </Card>

    <Card>
      <CardHeader>
        <Skeleton className="h-5 w-72" />
        <Skeleton className="h-4 w-full max-w-md" />
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="flex flex-wrap gap-2">
          <Skeleton className="h-8 w-44 rounded-md" />
          <Skeleton className="h-8 w-52 rounded-md" />
        </div>
        <Skeleton className="h-8 w-48 rounded-md" />
      </CardContent>
    </Card>
  </div>
);
