import { useTranslation } from 'react-i18next';

import { useUpdateThemePreferences } from '@/features/profile/useProfile';
import type { ThemePreferences } from '@/theme/theme-context';
import { useTheme } from '@/theme/useTheme';

import { ColorSchemePicker } from './ColorSchemePicker';
import { RadiusPicker } from './RadiusPicker';

/**
 * The palette and the corner radius, as two labelled pickers wired to the
 * account.
 *
 * Extracted from `ThemePaletteDialog` by F06, which needed the same two
 * controls on the profile page. Copying them would have been the start of the
 * exact failure F05 describes for the mock's `ThemeCustomizer`: a second theme
 * UI beside the first, agreeing today and drifting later. There is one, and both
 * surfaces render it.
 *
 * It renders a **fragment of two sections** rather than a container, so each
 * caller keeps its own spacing — the dialog stacks a third section (the
 * preview) after these, the profile card does not.
 *
 * ## The value is read from `useTheme()`, not held here
 *
 * `useTheme()` reports what is actually on `<html>`, which during the flight of
 * a mutation is the optimistic value and after it the stored one. So there is no
 * local state to keep in step, and two of these mounted at once — which cannot
 * happen today but costs nothing to be true — would show the same thing.
 *
 * ## There is no Save button, and nothing to save
 *
 * `useUpdateThemePreferences` writes `PATCH /api/v1/profile/me` and applies the
 * change by writing the profile cache the theme is rendered from. Applying and
 * persisting are one action; a refused request rolls the palette back and says
 * so. See `features/profile/useProfile.ts`.
 */
export const ThemePreferenceFields = () => {
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
    <>
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
    </>
  );
};
