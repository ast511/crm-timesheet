import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';

export interface DataTableSkeletonProps {
  /** Match the page size the screen asks for, so the placeholder is the right height. */
  rows?: number;
  columns?: number;
}

const DEFAULT_ROWS = 8;
const DEFAULT_COLUMNS = 5;

const range = (length: number): number[] => Array.from({ length }, (_, index) => index);

/**
 * The `<Suspense>` fallback for a screen built on `DataTable`.
 *
 * It mirrors the real component rather than replacing it with a spinner: a
 * toolbar bar, a header row, N body rows on desktop, N cards below `lg`, and a
 * pagination line. That is the whole point of a skeleton — the page is the same
 * height and the same shape before and after the data arrives, so nothing jumps
 * under the pointer when it does.
 *
 * A screen with an unusual layout should provide its own skeleton instead;
 * this one is correct for anything that renders a plain `DataTable`.
 */
export const DataTableSkeleton = ({
  rows = DEFAULT_ROWS,
  columns = DEFAULT_COLUMNS,
}: DataTableSkeletonProps) => (
  <div className="flex flex-col gap-4" aria-hidden="true">
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <Skeleton className="h-9 w-full sm:max-w-xs" />
      <Skeleton className="h-8 w-28" />
    </div>

    <div className="hidden overflow-hidden rounded-lg border lg:block">
      <div className="flex gap-4 border-b bg-muted/40 p-3">
        {range(columns).map((column) => (
          <Skeleton key={column} className="h-4 flex-1" />
        ))}
      </div>
      {range(rows).map((row) => (
        <div key={row} className="flex gap-4 border-b p-3 last:border-b-0">
          {range(columns).map((column) => (
            <Skeleton key={column} className="h-4 flex-1" />
          ))}
        </div>
      ))}
    </div>

    <div className="flex flex-col gap-3 lg:hidden">
      {range(rows).map((row) => (
        <Card key={row}>
          <CardContent className="flex flex-col gap-2">
            {range(Math.min(columns, 4)).map((line) => (
              <div key={line} className="flex items-center gap-4">
                <Skeleton className="h-3 w-24" />
                <Skeleton className="h-3 flex-1" />
              </div>
            ))}
          </CardContent>
        </Card>
      ))}
    </div>

    <div className="flex items-center justify-between">
      <Skeleton className="h-4 w-40" />
      <Skeleton className="h-8 w-44" />
    </div>
  </div>
);
