import { Outlet } from '@tanstack/react-router';

import { PublicHeader } from '@/components/layout/PublicHeader';
import { ColorModeScope } from '@/theme/ColorModeScope';

/**
 * Everything reachable without a session: the landing page and the four
 * authentication screens.
 *
 * Two things make this area what it is, and both are declared right here rather
 * than repeated on five pages:
 *
 * - **`<ColorModeScope scope="device">`** — light/dark follows the operating
 *   system, whatever anybody previously stored. See `theme/theme.ts` for why a
 *   stored preference has no owner on a login screen.
 * - **`PublicHeader`** — a logo and a language, and no way to change a theme.
 *
 * It is a **pathless layout route** (`id: 'public'`, no `path`), so it groups
 * these screens without appearing in any URL: `/login` is still `/login`. That
 * is the same shape `workspaceRoute` uses for the authenticated half — one
 * route owning one area's shell and one area's rules — and it means a public
 * screen added later inherits both by being put in the right place in the tree,
 * rather than by remembering to render two components.
 */
export const PublicLayout = () => (
  <>
    <ColorModeScope scope="device" />
    <PublicHeader />
    <Outlet />
  </>
);
