import { cva, type VariantProps } from 'class-variance-authority';
import { Loader2Icon } from 'lucide-react';
import type { ComponentProps } from 'react';
import { useTranslation } from 'react-i18next';

import { cn } from '@/lib/utils';

/**
 * Sizes are **semantic, not pixel values**, so a spinner in a button and a
 * spinner on the boot screen stay related when the scale is adjusted.
 */
const spinnerVariants = cva('animate-spin', {
  variants: {
    size: {
      sm: 'size-3',
      md: 'size-4',
      lg: 'size-6',
      xl: 'size-10',
    },
  },
  defaultVariants: { size: 'md' },
});

export interface SpinnerProps
  extends ComponentProps<'span'>,
    VariantProps<typeof spinnerVariants> {
  /** Announced to screen readers. Defaults to the translated "Loading…". */
  label?: string;
}

/**
 * A spinner for **punctual** waits: a submitting button, the initial app boot,
 * an action in flight.
 *
 * It is the wrong choice for content that has a known shape — a list, a card
 * grid, a table. Those get a skeleton mirroring their own layout inside a
 * `<Suspense>` boundary, so nothing shifts when the data arrives. A spinner
 * there is a blank rectangle followed by a jump.
 *
 * `role="status"` with an off-screen label is what makes the wait perceivable
 * to somebody who cannot see it spin; the icon itself is hidden from the
 * accessibility tree so it is not announced twice.
 */
export const Spinner = ({ className, size, label, ...props }: SpinnerProps) => {
  const { t } = useTranslation();

  return (
    <span
      data-slot="spinner"
      role="status"
      className={cn('inline-flex items-center justify-center text-current', className)}
      {...props}
    >
      <Loader2Icon aria-hidden="true" className={cn(spinnerVariants({ size }))} />
      <span className="sr-only">{label ?? t('state.loading')}</span>
    </span>
  );
};
