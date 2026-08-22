import { cn } from '@/lib/utils';

export interface WeekdayToggleProps {
  /** `Luni` — the accessible name at every width. */
  label: string;
  /** `Lu` — always visible; the only text below `sm`. */
  short: string;
  pressed: boolean;
  onToggle: () => void;
  disabled?: boolean;
}

/**
 * One weekday, as a real toggle button.
 *
 * ## Why this is a `<button>` with `aria-pressed` and not a checkbox
 *
 * Both would be defensible; what would not be is the mock's `<div>`-styled
 * button with neither. The control has two states and toggling it takes effect
 * on the spot, which is what `aria-pressed` describes — a checkbox would
 * announce "checked", which reads as a selection awaiting a submit, and this one
 * does await a submit but so does every other field on the form. Keeping it a
 * button also means Enter *and* Space activate it natively, and the focus ring,
 * the disabled state and the tab order all come free.
 *
 * The accessible name is the **full** day name and does not change with the
 * viewport. The long label is hidden below `sm` to keep seven controls on a
 * phone without scrolling, and `aria-label` is what stops a screen reader
 * announcing "Lu" there and "Luni Lu" above it. The visible text is therefore
 * marked `aria-hidden` — it is a second rendering of the name in the accessible
 * one, not extra information.
 *
 * ## Selection is not signalled by colour alone
 *
 * `CLAUDE.md` forbids that, and `aria-pressed` alone would not satisfy it for
 * somebody who can see the screen. So a selected day is filled *and* ringed
 * *and* raised, and an unselected one is visibly recessed — three differences,
 * one of which survives greyscale.
 */
export const WeekdayToggle = ({
  label,
  short,
  pressed,
  onToggle,
  disabled = false,
}: WeekdayToggleProps) => (
  <button
    type="button"
    aria-pressed={pressed}
    aria-label={label}
    disabled={disabled}
    onClick={onToggle}
    className={cn(
      'flex flex-col items-center justify-center gap-0.5 rounded-lg border-2 px-1 py-2.5',
      'transition-colors focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none',
      'disabled:pointer-events-none disabled:opacity-50 sm:px-3 sm:py-3',
      pressed
        ? 'border-primary bg-primary text-primary-foreground shadow-sm'
        : 'border-border bg-muted/50 text-muted-foreground hover:border-primary/50 hover:text-foreground',
    )}
  >
    <span aria-hidden="true" className="hidden text-xs font-medium sm:block">
      {label}
    </span>
    <span aria-hidden="true" className="text-base font-bold sm:text-lg">
      {short}
    </span>
  </button>
);
