import { Switch as SwitchPrimitive } from '@base-ui/react/switch';

import { cn } from '@/lib/utils';

/**
 * A two-state toggle, from the same Base UI kit the rest of `ui/` is built on.
 *
 * Base UI renders the visible control as a `<span>` with a hidden `<input>`
 * beside it, which is what makes it focusable, operable with Space, announced
 * as a switch, and submittable inside a `<form>` — none of which a `<div>` with
 * an `onClick` would be.
 *
 * The state attributes are Base UI's own (`data-checked` / `data-unchecked`),
 * not Radix's `data-state`, so the styling here is not portable to a Radix
 * switch and should not be copied to one.
 */
export const Switch = ({ className, ...props }: SwitchPrimitive.Root.Props) => (
  <SwitchPrimitive.Root
    data-slot="switch"
    className={cn(
      'inline-flex h-5 w-9 shrink-0 items-center rounded-full border border-transparent p-px shadow-xs transition-colors outline-none focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 data-checked:bg-primary data-unchecked:bg-input dark:data-unchecked:bg-input/60',
      className,
    )}
    {...props}
  >
    <SwitchPrimitive.Thumb
      data-slot="switch-thumb"
      className="pointer-events-none block size-4 rounded-full bg-background shadow-sm ring-0 transition-transform data-checked:translate-x-4 data-unchecked:translate-x-0 dark:data-checked:bg-primary-foreground"
    />
  </SwitchPrimitive.Root>
);