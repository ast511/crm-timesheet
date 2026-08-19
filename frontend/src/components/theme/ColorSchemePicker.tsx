import { CheckIcon } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { cn } from '@/lib/utils';
import { COLOR_SCHEMES, COLOR_SCHEME_CLASS, type ColorScheme } from '@/theme/theme';
import { useTheme } from '@/theme/useTheme';

export interface ColorSchemePickerProps {
  value: ColorScheme;
  onChange: (scheme: ColorScheme) => void;
}

/**
 * The eight palettes, as eight swatches.
 *
 * ## The swatches take their colour from the stylesheet, not from this file
 *
 * The mock hard-coded eight `hsl(...)` strings beside the eight names, and they
 * were already wrong: the application's palettes are `oklch`, and a swatch
 * copied from somewhere else is a promise about a colour that nothing keeps.
 * `index.css` says it plainly — "nothing in JavaScript references a colour" —
 * and this is the screen most tempted to break that.
 *
 * So each swatch **wears its own palette class** and paints itself with
 * `bg-primary`. `.theme-violet` on the swatch redefines `--primary` for that
 * element's subtree, exactly as it does on `<html>`, and the circle inside
 * resolves to whatever `index.css` currently says violet is. Add a ninth
 * palette to the backend and the picker shows it correctly with no edit here.
 *
 * `DEFAULT` maps to no class, which is the right answer for the same reason it
 * is on `<html>`: the default palette *is* the base `:root` declaration, so
 * wearing nothing shows it.
 *
 * The `dark` class is applied to the swatch alongside the palette when the
 * application is in dark mode, because the stylesheet's dark variants are
 * written as `.dark.theme-violet` — both classes on one element. Without it,
 * every swatch in a dark dialog would preview the light palette.
 */
export const ColorSchemePicker = ({ value, onChange }: ColorSchemePickerProps) => {
  const { t } = useTranslation();
  const { resolvedColorMode } = useTheme();

  return (
    <div
      role="radiogroup"
      aria-label={t('theme.colorScheme')}
      className="grid grid-cols-2 gap-2 sm:grid-cols-4"
    >
      {COLOR_SCHEMES.map((scheme) => {
        const selected = scheme === value;

        return (
          <button
            key={scheme}
            type="button"
            role="radio"
            aria-checked={selected}
            onClick={() => onChange(scheme)}
            className={cn(
              'relative flex h-20 flex-col items-center justify-center gap-2 rounded-md border-2 p-2 text-xs transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring',
              selected
                ? 'border-primary bg-primary/5'
                : 'border-border hover:border-muted-foreground/40 hover:bg-muted/50',
            )}
          >
            <span
              aria-hidden="true"
              className={cn(
                'size-6 rounded-full border border-border/50 bg-primary shadow-sm',
                resolvedColorMode === 'dark' && 'dark',
                COLOR_SCHEME_CLASS[scheme],
              )}
            />
            <span className="font-medium">{t(`theme.schemes.${scheme}`)}</span>
            {selected && (
              <CheckIcon aria-hidden="true" className="absolute top-1 right-1 size-3 text-primary" />
            )}
          </button>
        );
      })}
    </div>
  );
};
