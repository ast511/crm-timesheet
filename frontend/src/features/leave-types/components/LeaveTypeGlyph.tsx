import { createElement } from 'react';

import { cn } from '@/lib/utils';

import { leaveTypeIcon } from '../leave-type-icons';

export interface LeaveTypeGlyphProps {
  icon: string;
  /** `#RRGGBB`, or `null` when the type has no accent colour. */
  color: string | null;
  className?: string;
}

/**
 * The visual identity of a leave type: its icon, tinted with its colour.
 *
 * The colour comes from the database rather than from the theme, so it is
 * applied as an inline style — the one legitimate use of one in this
 * application, since a value chosen per record cannot be a Tailwind class. It
 * tints the glyph and a faint disc behind it rather than any text, so nothing
 * readable ever depends on a colour somebody picked without a contrast check.
 *
 * With no colour the glyph falls back to the theme's muted foreground, which is
 * a legitimate state rather than a missing value: `color` is optional in the
 * contract.
 *
 * `aria-hidden`, always. The icon repeats what the row's label and code already
 * say, and announcing "umbrella" before every leave type would be noise.
 */
export const LeaveTypeGlyph = ({ icon, color, className }: LeaveTypeGlyphProps) => (
  <span
    aria-hidden="true"
    className={cn(
      'inline-flex size-7 shrink-0 items-center justify-center rounded-md',
      color === null && 'bg-muted text-muted-foreground',
      className,
    )}
    style={color === null ? undefined : { backgroundColor: `${color}1F`, color }}
  >
    {/*
     * `createElement` rather than `<Icon />` over a local: the icon is *looked
     * up* in a module-level map, not created here — every name resolves to the
     * same stable component on every render — but assigning it to a capitalised
     * local reads to the compiler's lint rule as a component defined during
     * render, which would be a real bug if it were true.
     */}
    {createElement(leaveTypeIcon(icon), { className: 'size-4' })}
  </span>
);