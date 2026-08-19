import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from 'react';

import { ThemeContext, type ThemePreferences } from './theme-context';
import {
  applyTheme,
  getSystemColorMode,
  isAccountThemePath,
  readStoredColorMode,
  storeColorMode,
  subscribeToSystemColorScheme,
  type ColorMode,
  type ColorModeScope,
} from './theme';

export interface ThemeProviderProps {
  children: ReactNode;
  /**
   * The palette and corner radius to apply — **supplied, not held.**
   *
   * This provider used to keep them in `useState` behind a `setPreferences`,
   * with a seam saying the profile feature would call it once the account's
   * stored values could be read. That arrangement was replaced rather than
   * filled in, because the seam had a flaw that only shows on a reload: two
   * copies of the same value, one in React and one on the server, and nothing
   * deciding which is right. A palette applied through the setter survived the
   * click and not the refresh.
   *
   * So the server's copy is the only copy. `AppProviders` passes what
   * `useStoredThemePreferences()` reads from `GET /profile/me`, and the picker
   * changes the theme by writing to that same cache — see
   * `features/profile/useProfile.ts`. This component is left doing exactly what
   * it always claimed to: applying three inputs to `<html>`, knowing nothing
   * about authentication and nothing about the API.
   */
  preferences: ThemePreferences;
}

/**
 * Applies the three theme inputs to `<html>`.
 *
 * Two of them come from the account (the palette and the corner radius, passed
 * in) and one from the device (light/dark, owned here because there is nowhere
 * else it belongs — see `theme.ts` on why it is never sent to the backend).
 *
 * The first paint is not this component's doing: the inline script in
 * `index.html` puts the stored colour mode on `<html>` before any module loads,
 * so the page never flashes light before turning dark. This provider takes over
 * from there and is the only thing that touches the theme afterwards.
 */
export const ThemeProvider = ({ children, preferences }: ThemeProviderProps) => {
  const [colorMode, setColorModeState] = useState<ColorMode>(readStoredColorMode);

  /**
   * Seeded from the URL rather than from a default, so React's first paint
   * agrees with the pre-paint script in `index.html` — which decides by the
   * same rule and has already put a class on `<html>`. Starting at `account`
   * and correcting once a layout mounts would be a visible flash on exactly the
   * screen this scoping exists to protect.
   *
   * `<ColorModeScope>` takes over from here; this initial value only has to be
   * right for the first frame.
   */
  const [colorModeScope, setColorModeScope] = useState<ColorModeScope>(() =>
    isAccountThemePath(window.location.pathname) ? 'account' : 'device',
  );

  /**
   * The operating system's setting, read as an external store rather than
   * copied into state by an effect.
   *
   * `prefers-color-scheme` genuinely *is* external state that changes on its
   * own — a laptop switching to dark at sunset — and mirroring it into
   * `useState` from a `useEffect` would render once with the stale value and
   * again with the right one. `useSyncExternalStore` subscribes to it directly
   * and there is nothing to keep in step.
   */
  const systemColorMode = useSyncExternalStore(subscribeToSystemColorScheme, getSystemColorMode);

  /**
   * The `device` scope ignores {@link colorMode} entirely — it does not reset
   * it, override it, or write to it. The stored choice is left exactly as it
   * was, unread, and comes back into effect the moment an authenticated screen
   * declares the `account` scope. A public screen is a gap in the preference's
   * application, not an edit to it.
   */
  const resolvedColorMode =
    colorModeScope === 'device' || colorMode === 'system' ? systemColorMode : colorMode;

  useEffect(() => {
    applyTheme({ ...preferences, resolvedColorMode });
  }, [preferences, resolvedColorMode]);

  const setColorMode = useCallback((mode: ColorMode) => {
    storeColorMode(mode);
    setColorModeState(mode);
  }, []);

  const value = useMemo(
    () => ({
      ...preferences,
      colorMode,
      resolvedColorMode,
      colorModeScope,
      setColorMode,
      setColorModeScope,
    }),
    [preferences, colorMode, resolvedColorMode, colorModeScope, setColorMode],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
};
