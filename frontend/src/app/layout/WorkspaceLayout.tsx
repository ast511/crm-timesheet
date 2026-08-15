import { Outlet } from '@tanstack/react-router';

import { AppHeader } from '@/components/layout/AppHeader';
import { AppSidebar } from '@/components/layout/AppSidebar';
import { ColorModeScope } from '@/theme/ColorModeScope';

/**
 * The layout every authenticated screen renders inside: a header across the
 * top, navigation beside the content on desktop, a single column below `lg`.
 *
 * It declares `<ColorModeScope scope="account">`, which is where the person's
 * stored light/dark choice comes back into effect — the public area runs on the
 * device's setting, and this is the boundary between the two.
 *
 * It is the layout only. The route it belongs to (`/app`) is where the guard
 * lives, in `src/routes/workspace.route.tsx`.
 */
export const WorkspaceLayout = () => (
  <>
    <ColorModeScope scope="account" />
    <AppHeader />
    <div className="flex flex-1">
      <AppSidebar />
      <main className="min-w-0 flex-1 p-4 sm:p-6">
        <Outlet />
      </main>
    </div>
  </>
);
