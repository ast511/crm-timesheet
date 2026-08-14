import { createContext } from 'react';

import type { ColorMode, ColorScheme, CornerRadius, ResolvedColorMode } from './theme';

/** The two values the backend stores, as one object because they travel together. */
export interface ThemePreferences {
  colorScheme: ColorScheme;
  cornerRadius: CornerRadius;
}

export interface ThemeContextValue extends ThemePreferences {
  /** What the person asked for — including `system`. */
  colorMode: ColorMode;
  /** What `system` currently resolves to. This is what is on screen. */
  resolvedColorMode: ResolvedColorMode;

  /**
   * SEAM (profile / auth feature): apply the preferences read from
   * `GET /api/v1/profile/me`.
   *
   * Partial, so a settings screen can change one without restating the other.
   * Applying is all this does — persisting is a `PATCH /api/v1/profile/me`,
   * and that call belongs to the feature that owns the settings screen, not
   * here. Keeping the write out of the provider is what stops the theme layer
   * from acquiring an opinion about authentication.
   */
  setPreferences: (preferences: Partial<ThemePreferences>) => void;

  /** Client-only, persisted locally, never sent to the backend. */
  setColorMode: (mode: ColorMode) => void;
}

/**
 * `null` until a `ThemeProvider` is above the consumer — `useTheme` turns that
 * into a clear error rather than letting a component read defaults it was never
 * given.
 */
export const ThemeContext = createContext<ThemeContextValue | null>(null);
