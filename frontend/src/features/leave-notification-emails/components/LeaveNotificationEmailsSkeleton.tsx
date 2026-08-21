import { Skeleton } from '@/components/ui/skeleton';

export interface LeaveNotificationEmailsSkeletonProps {
  /** Rows to draw. Three, because that is what a configured list usually holds. */
  rows?: number;
}

const DEFAULT_ROWS = 3;

const range = (length: number): number[] => Array.from({ length }, (_, index) => index);

/**
 * The `<Suspense>` fallback for the address list.
 *
 * Shaped like the list rather than replaced by a spinner: the same row height,
 * the same icon-then-text arrangement, the same trailing action button. That is
 * what a skeleton is for — the section is the same height before and after the
 * data arrives, so the page does not jump under the pointer.
 *
 * `DataTableSkeleton` is not reused because this section is not a `DataTable`:
 * it has no toolbar, no header row and no card list, and a placeholder for
 * controls that will never appear would be a promise the real component breaks.
 */
export const LeaveNotificationEmailsSkeleton = ({
  rows = DEFAULT_ROWS,
}: LeaveNotificationEmailsSkeletonProps) => (
  <div className="flex flex-col divide-y" aria-hidden="true">
    {range(rows).map((row) => (
      <div key={row} className="flex items-center justify-between gap-3 py-3">
        <div className="flex min-w-0 flex-1 items-center gap-3">
          <Skeleton className="size-4 shrink-0 rounded-sm" />
          <Skeleton className="h-4 w-full max-w-56" />
        </div>
        <Skeleton className="size-8 shrink-0 rounded-md" />
      </div>
    ))}
  </div>
);
