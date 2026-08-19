import { PaletteIcon } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { useUpdateThemePreferences } from '@/features/profile/useProfile';
import type { ThemePreferences } from '@/theme/theme-context';
import { useTheme } from '@/theme/useTheme';

import { ColorSchemePicker } from './ColorSchemePicker';
import { RadiusPicker } from './RadiusPicker';
import { ThemePreview } from './ThemePreview';

/**
 * The palette and corner-radius picker, behind the header's palette button.
 *
 * It drives **the existing theme system and only that**. Both pickers call
 * `ThemeProvider.setPreferences`, which puts the `theme-*` class and `--radius`
 * on `<html>`; nothing here writes a CSS variable, keeps a copy of the current
 * palette, or knows what colour violet is. That is the difference between this
 * and the mock's `ThemeCustomizer`, which carried its own provider, its own
 * `localStorage` key and its own list of hex values — a second theme system
 * beside the first.
 *
 * The change applies on click rather than on a Save button, because there is
 * nothing to save: the whole page is the preview, and a dialog that made you
 * confirm a colour you can already see would be asking about something you have
 * already decided.
 *
 * ## Light/dark is deliberately not here
 *
 * It is next door, in `ColorModeToggle`, and the split is the one `theme.ts`
 * argues for at length: the palette and the radius belong to a person and are
 * stored on the account, while light versus dark belongs to where they are
 * sitting and is stored on the device. Putting the three in one dialog would
 * imply they travel together, and then one of them would not.
 *
 * ## It persists, and applying is how
 *
 * Both pickers call `PATCH /api/v1/profile/me` (backend Feature 039) through
 * {@link useUpdateThemePreferences}, which writes the new value into the
 * profile cache optimistically. The theme is *rendered from* that cache — see
 * `AppProviders`' `ThemedApp` — so the optimistic write is what repaints the
 * screen. There is no separate "apply now, save later" path that could disagree
 * with the server, and a refused request rolls the palette back and says so.
 *
 * That is why the value shown by each picker comes from `useTheme()` rather
 * than from local state: `useTheme()` reports what is actually on `<html>`,
 * which during the flight of a mutation is the optimistic value and after it is
 * the stored one.
 */
export const ThemePaletteDialog = () => {
  const { t } = useTranslation();
  const { colorScheme, cornerRadius } = useTheme();
  const updatePreferences = useUpdateThemePreferences();

  /**
   * Every change from either picker, in one place.
   *
   * `Partial`, so a picker changes one preference without restating the other —
   * the endpoint accepts a partial body, so nothing has to be read back and
   * resent.
   */
  const applyPreferences = (next: Partial<ThemePreferences>): void => {
    updatePreferences.mutate(next);
  };

  return (
    <Dialog>
      <DialogTrigger
        render={
          <Button variant="ghost" size="icon-sm" aria-label={t('theme.open')}>
            <PaletteIcon aria-hidden="true" />
          </Button>
        }
      />

      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{t('theme.title')}</DialogTitle>
          <DialogDescription>{t('theme.description')}</DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-6">
          <section className="flex flex-col gap-3">
            <h3 className="text-sm font-medium">{t('theme.colorScheme')}</h3>
            <ColorSchemePicker
              value={colorScheme}
              onChange={(scheme) => applyPreferences({ colorScheme: scheme })}
            />
          </section>

          <section className="flex flex-col gap-3">
            <h3 className="text-sm font-medium">{t('theme.cornerRadius')}</h3>
            <RadiusPicker
              value={cornerRadius}
              onChange={(radius) => applyPreferences({ cornerRadius: radius })}
            />
          </section>

          <section className="flex flex-col gap-3">
            <h3 className="text-sm font-medium">{t('theme.preview')}</h3>
            <ThemePreview />
          </section>
        </div>
      </DialogContent>
    </Dialog>
  );
};
