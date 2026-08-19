import { cva, type VariantProps } from 'class-variance-authority';
import type { ComponentProps } from 'react';

import { cn } from '@/lib/utils';

const badgeVariants = cva(
  "inline-flex w-fit shrink-0 items-center justify-center gap-1 rounded-md border px-1.5 py-0.5 text-xs font-medium whitespace-nowrap [&>svg]:pointer-events-none [&>svg:not([class*='size-'])]:size-3",
  {
    variants: {
      variant: {
        default: 'border-transparent bg-primary text-primary-foreground',
        secondary: 'border-transparent bg-secondary text-secondary-foreground',
        outline: 'border-border text-foreground',
        muted: 'border-transparent bg-muted text-muted-foreground',
        destructive: 'border-transparent bg-destructive/10 text-destructive',
      },
    },
    defaultVariants: {
      variant: 'default',
    },
  },
);

export interface BadgeProps
  extends ComponentProps<'span'>,
    VariantProps<typeof badgeVariants> {}

/**
 * A small, non-interactive label for a status or a flag.
 *
 * Every variant is drawn from the theme tokens rather than from fixed colours,
 * so a badge follows the palette the account chose (F02/F05) and keeps its
 * contrast in both light and dark. There is deliberately no `success` green:
 * "active" is the primary colour of whatever palette is in use, and a hard-coded
 * green would be the one element on screen that ignores the theme.
 *
 * `CLAUDE.md` asks that colour never carry meaning alone, so a badge always
 * holds text — the variant is emphasis, not the message.
 */
export const Badge = ({ className, variant, ...props }: BadgeProps) => (
  <span data-slot="badge" className={cn(badgeVariants({ variant }), className)} {...props} />
);

export { badgeVariants };