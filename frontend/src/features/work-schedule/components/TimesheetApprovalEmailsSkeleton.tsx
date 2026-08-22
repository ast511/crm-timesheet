import { Skeleton } from '@/components/ui/skeleton';

/** Widths that read as addresses of different lengths rather than three clones. */
const CHIP_WIDTHS = ['w-44', 'w-52', 'w-36'] as const;

/**
 * The `<Suspense>` fallback for the address chips.
 *
 * Shaped like the chips rather than replaced by a spinner: the same height, the
 * same wrapping row, three of them at three plausible widths. The card is
 * therefore the same height before and after the data arrives, so the page does
 * not jump under the pointer.
 */
export const TimesheetApprovalEmailsSkeleton = () => (
  <div className="flex flex-wrap gap-2" aria-hidden="true">
    {CHIP_WIDTHS.map((width) => (
      <Skeleton key={width} className={`h-8 rounded-md ${width}`} />
    ))}
  </div>
);
