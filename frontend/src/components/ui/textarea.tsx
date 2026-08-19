import type { ComponentProps } from 'react';

import { cn } from '@/lib/utils';

/**
 * The multi-line counterpart of `Input`, styled from the same tokens so the two
 * sit together in a form without one looking borrowed.
 *
 * `field-sizing-content` lets the box grow with what is typed, with `min-h`
 * keeping it from collapsing to a single line before anything is.
 */
export const Textarea = ({ className, ...props }: ComponentProps<'textarea'>) => (
  <textarea
    data-slot="textarea"
    className={cn(
      'flex field-sizing-content min-h-16 w-full rounded-md border border-input bg-transparent px-3 py-2 text-base shadow-xs transition-[color,box-shadow] outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 md:text-sm dark:bg-input/30 dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40',
      className,
    )}
    {...props}
  />
);