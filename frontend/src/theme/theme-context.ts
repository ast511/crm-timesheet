import { createContext } from 'react';

import type {
  ColorMode,
  ColorModeScope,
  ColorScheme,
  CornerRadius,
  ResolvedColorMode,
} from './theme';

/** The two values the backend stores, as one object because they travel together. */
export interface ThemePreferences {
  colorScheme: ColorScheme;
  cornerRadius: CornerRadius;
}

export interface ThemeContextValue extends ThemePreferences {
  /** What the person asked for — including `system`. */
  colorMode: ColorMode;
  /**
   * What is actually on screen.
   *
   * In the `device` scope this is the operating system's setting regardless of
   * {@link colorMode}, which is how the public screens stay out of a stored
   * preference that does not belong to whoever is looking at them.
   */
  resolvedColorMode: ResolvedColorMode;
  /** Whose preference the current screen honours. See {@link ColorModeScope}. */
  colorModeScope: ColorModeScope;

  /**
   * Declared by a layout, through `<ColorModeScope>` — not called directly.
   *
   * There is no cleanup and none is needed: exactly one layout is mounted at a
   * time and each declares its own scope, so the value is always the one the
   * visible area asked for.
   */
  setColorModeScope: (scope: ColorModeScope) => void;

  /*
   * There is no `setPreferences` here any more, and its absence is the point.
   *
   * It used to be the seam through which the profile feature would apply the
   * account's stored palette and radius. Filling that seam exposed what was
   * wrong with it: a setter implies this provider *holds* the preferences,
   * which would make two copies of one value — React's and the server's — with
   * nothing deciding which is right. The symptom was the obvious one. A palette
   * chosen through the setter survived the click and not the reload.
   *
   * The account's copy is now the only copy: `ThemeProvider` receives it as a
   * prop, and the picker changes the theme by writing to the profile cache the
   * prop is read from (`features/profile/useProfile.ts`). Applying and
   * persisting became one action, so there is no longer an "apply without
   * saving" for a setter to express.
   */

  /** Client-only, persisted locally, never sent to the backend. */
  setColorMode: (mode: ColorMode) => void;
}

/**
 * `null` until a `ThemeProvider` is above the consumer — `useTheme` turns that
 * into a clear error rather than letting a component read defaults it was never
 * given.
 */
export const ThemeContext = createContext<ThemeContextValue | null>(null);
