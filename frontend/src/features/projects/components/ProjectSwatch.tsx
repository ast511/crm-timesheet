import { cn } from '@/lib/utils';

export interface ProjectSwatchProps {
  /** `#RRGGBB`, or `null` when the project has no accent colour. */
  color: string | null;
  className?: string;
}

/**
 * The project's accent colour, as a small square beside its code.
 *
 * The colour comes from the database rather than from the theme, so it is
 * applied as an inline style — the same legitimate exception `LeaveTypeGlyph`
 * takes, since a value chosen per record cannot be a Tailwind class.
 *
 * ## Nothing readable depends on it
 *
 * The swatch tints a nine-pixel square and nothing else. No text is coloured by
 * it, so a colour somebody picked without a contrast check cannot make anything
 * unreadable, and `CLAUDE.md`'s "never rely on colour alone" is satisfied by
 * construction: the code sits next to it and is the actual identifier. The
 * colour is a way to recognise a project you already know at a glance — in this
 * list, and later in a timesheet grid — not a way to tell two apart.
 *
 * With no colour it falls back to a bordered, muted square rather than
 * disappearing: `color` is optional in the contract, and a missing swatch would
 * shift the code left on some rows and not others. `aria-hidden`, always — it
 * repeats the code beside it, and announcing "blue" before every project would
 * be noise.
 */
export const ProjectSwatch = ({ color, className }: ProjectSwatchProps) => (
  <span
    aria-hidden="true"
    className={cn(
      'inline-block size-3 shrink-0 rounded-sm',
      color === null && 'border border-dashed border-muted-foreground/50 bg-muted',
      className,
    )}
    style={color === null ? undefined : { backgroundColor: color }}
  />
);
