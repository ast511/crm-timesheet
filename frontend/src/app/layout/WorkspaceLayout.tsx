import { Outlet } from '@tanstack/react-router';

import { AppFooter } from '@/components/layout/AppFooter';
import { AppHeader } from '@/components/layout/AppHeader';
import { AppSidebar } from '@/components/layout/AppSidebar';
import { SidebarInset, SidebarProvider } from '@/components/ui/sidebar';
import { WorkspaceProvider } from '@/features/workspace/WorkspaceProvider';
import { ColorModeScope } from '@/theme/ColorModeScope';

/**
 * The layout every authenticated screen renders inside.
 *
 * ```
 * SidebarProvider ─┬─ AppSidebar     brand · workspace · nav · account
 *                  └─ SidebarInset ─┬─ AppHeader
 *                                   ├─ <Outlet/>      the routed screen
 *                                   └─ AppFooter
 * ```
 *
 * ## One layout, parameterised — not one per role
 *
 * There is a single authenticated shell and there is meant to be exactly one.
 * Everything that differs between an employee and an administrator is a
 * *value* read from context — the permission set (F04) and the workspace
 * derived from the URL — rather than a different component tree. The mock this
 * was ported from had a layout per role and five navigation lists to go with
 * them, which is how two of those lists came to disagree about what HR could
 * see. Nothing here branches on a role, and there is no prop to pass one
 * through.
 *
 * ## What the two providers are for
 *
 * `SidebarProvider` is the shadcn block's own: it owns open/collapsed, remembers
 * it in a cookie, decides sheet-versus-rail from the viewport, and binds
 * `Ctrl/⌘ B`.
 *
 * `WorkspaceProvider` owns which workspace is open and which items the person
 * may see. It is *inside* the router — it reads the location — and outside
 * everything that consumes the menu, which is the sidebar and the header both.
 *
 * ## `ColorModeScope`, unchanged from F03
 *
 * `scope="account"` is where the person's stored light/dark choice comes back
 * into effect. The public area runs on the device's setting; this is the
 * boundary between the two, and it stays declared here because the layout is
 * the thing that knows which area it is.
 *
 * It is the layout only. The route it belongs to (`/app`) is where the
 * authentication guard and the permission load live, in
 * `src/routes/workspace.route.tsx`.
 */
export const WorkspaceLayout = () => (
  <>
    <ColorModeScope scope="account" />

    <WorkspaceProvider>
      <SidebarProvider>
        <AppSidebar />

        <SidebarInset>
          <AppHeader />

          <div className="flex min-w-0 flex-1 flex-col">
            <div className="flex-1 p-4 sm:p-6">
              <Outlet />
            </div>

            <AppFooter />
          </div>
        </SidebarInset>
      </SidebarProvider>
    </WorkspaceProvider>
  </>
);
