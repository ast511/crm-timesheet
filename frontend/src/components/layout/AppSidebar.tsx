import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarRail,
  SidebarSeparator,
} from '@/components/ui/sidebar';
import { WorkspaceSwitcher } from '@/features/workspace/WorkspaceSwitcher';

import { SidebarBrand } from './SidebarBrand';
import { SidebarNav } from './SidebarNav';
import { SidebarUserMenu } from './SidebarUserMenu';

/**
 * The navigation region of the authenticated shell, assembled from four pieces
 * that each own one question.
 *
 * ```
 * SidebarHeader   SidebarBrand        which application is this
 *                 WorkspaceSwitcher   whose work am I looking at
 * SidebarContent  SidebarNav          what may I open          ← F04 decides
 * SidebarFooter   SidebarUserMenu     who am I, and how do I leave
 * ```
 *
 * `collapsible="icon"` is the sidebar-07 arrangement: an icon rail on desktop,
 * a sheet below `md`, and `SidebarRail` — the invisible strip along the edge —
 * as a second way to toggle it besides the header's trigger and `Ctrl/⌘ B`.
 *
 * **There is no `userRole` prop**, which is the one structural difference from
 * the mock this was ported from. That component took the role, computed a link
 * list from it, and passed it down; every consumer therefore had to be handed
 * the role too. Here the menu comes from the permission set through
 * `useWorkspace`, which reads it from context — so this file has no props at
 * all, and adding a screen to the navigation never touches it.
 */
export const AppSidebar = () => (
  <Sidebar collapsible="icon">
    <SidebarHeader>
      <SidebarBrand />
      <WorkspaceSwitcher />
    </SidebarHeader>

    <SidebarSeparator />

    <SidebarContent>
      <SidebarNav />
    </SidebarContent>

    <SidebarFooter>
      <SidebarUserMenu />
    </SidebarFooter>

    <SidebarRail />
  </Sidebar>
);
