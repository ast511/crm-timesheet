import { useContext } from 'react';

import { ThemeContext, type ThemeContextValue } from './theme-context';

/**
 * Reads the current theme and the two setters.
 *
 * Kept in its own file so `ThemeProvider.tsx` exports only a component, which
 * is what keeps React Fast Refresh working for it.
 */
export const useTheme = (): ThemeContextValue => {
  const context = useContext(ThemeContext);

  if (context === null) {
    throw new Error('useTheme must be used within a ThemeProvider.');
  }

  return context;
};
