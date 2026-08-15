import { useEffect } from 'react';

import type { ColorModeScope as Scope } from './theme';
import { useTheme } from './useTheme';

export interface ColorModeScopeProps {
  scope: Scope;
}

/**
 * Declares whose light/dark preference the screens below it honour.
 *
 * Rendered by a layout, once, and by nothing else:
 *
 * ```tsx
 * <ColorModeScope scope="device" />   // PublicLayout — the operating system's
 * <ColorModeScope scope="account" />  // WorkspaceLayout — the person's choice
 * ```
 *
 * **Why a component rather than a prop on `ThemeProvider`.** The provider sits
 * above the router — it has to, because the theme applies to the boot spinner
 * and to the router itself — so it cannot read the current route. The layouts
 * *are* the route, and each one already knows which area it is. Declaring it
 * where it is known beats deriving it from a path a second time, and beats
 * threading a prop down through everything in between.
 *
 * **It has no cleanup, deliberately.** Restoring some previous value on unmount
 * would be guessing: there is no meaningful "previous scope", only the scope of
 * whichever layout is now on screen — and that layout declares its own. React
 * runs the outgoing tree's effect cleanups before the incoming tree's setups in
 * the same commit, so the last declaration always wins and always belongs to
 * what is visible.
 *
 * It renders nothing. The effect is the whole component.
 */
export const ColorModeScope = ({ scope }: ColorModeScopeProps) => {
  const { setColorModeScope } = useTheme();

  useEffect(() => {
    setColorModeScope(scope);
  }, [scope, setColorModeScope]);

  return null;
};
