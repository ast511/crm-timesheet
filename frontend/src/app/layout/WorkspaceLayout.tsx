import { Outlet } from '@tanstack/react-router';

import { AppSidebar } from '@/components/layout/AppSidebar';

/**
 * The layout every authenticated screen will render inside: navigation beside
 * the content on desktop, a single column below `lg`.
 *
 * It is the layout only. The route it belongs to (`/app`) is where the guard
 * goes — see the seam in `src/routes/workspace.route.tsx`.
 */
export const WorkspaceLayout = () => (
  <div className="flex flex-1">
    <AppSidebar />
    <main className="min-w-0 flex-1 p-4 sm:p-6">
      <Outlet />
    </main>
  </div>
);
