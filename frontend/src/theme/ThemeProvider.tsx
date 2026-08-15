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
  DEFAULT_COLOR_SCHEME,
  DEFAULT_CORNER_RADIUS,
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
   * Where the preferences start before anybody has signed in.
   *
   * These are the backend's own column defaults (`DEFAULT` and `MEDIUM`), so an
   * anonymous visitor and a brand-new account see the same thing. Once the
   * profile feature exists it calls `setPreferences` with what
   * `GET /api/v1/profile/me` returned; nothing here needs to change for that to
   * work, which is the point of taking them as props.
   */
  defaultPreferences?: ThemePreferences;
}

/**
 * Applies the three theme inputs to `<html>` and exposes the two setters.
 *
 * It holds state and writes CSS variables. It does not read the profile, does
 * not write it back, and knows nothing about authentication — those are the
 * profile feature's job through {@link ThemeContextValue.setPreferences}.
 *
 * The first paint is not this component's doing either: the inline script in
 * `index.html` puts the stored colour mode on `<html>` before any module loads,
 * so the page never flashes light before turning dark. This provider takes over
 * from there and is the only thing that touches the theme afterwards.
 */
export const ThemeProvider = ({ children, defaultPreferences }: ThemeProviderProps) => {
  const [preferences, setPreferencesState] = useState<ThemePreferences>(
    () =>
      defaultPreferences ?? {
        colorScheme: DEFAULT_COLOR_SCHEME,
        cornerRadius: DEFAULT_CORNER_RADIUS,
      },
  );

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

  const setPreferences = useCallback((next: Partial<ThemePreferences>) => {
    setPreferencesState((current) => ({ ...current, ...next }));
  }, []);

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
      setPreferences,
      setColorMode,
      setColorModeScope,
    }),
    [preferences, colorMode, resolvedColorMode, colorModeScope, setPreferences, setColorMode],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
};
