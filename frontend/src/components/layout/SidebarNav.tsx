import { useRouterState } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';

import {
  SidebarGroup,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuSkeleton,
  useSidebar,
} from '@/components/ui/sidebar';
import { usePermissions } from '@/features/permissions/usePermissions';
import { findActiveTarget } from '@/features/workspace/navigation';
import { useWorkspace } from '@/features/workspace/useWorkspace';

import { SidebarNavItem } from './SidebarNavItem';

/** How many rows the skeleton stands in for. The personal menu's length. */
const SKELETON_ROWS = 5;

/**
 * The menu itself: the current workspace's permitted items, in order.
 *
 * It renders `useWorkspace().navigation`, which is
 * `getNavigation(permissions, workspace)` — so this component contains **no
 * permission logic at all**. It cannot: the filtering happens above it, from
 * F04's set, and the only thing here that knows about permissions is the
 * skeleton below.
 *
 * ## Why it re-renders when a role is revoked
 *
 * `usePermissions` is a TanStack Query hook, so every component that calls it —
 * `WorkspaceProvider`, above this one — re-renders when the cached set changes
 * identity. F04's re-sync replaces the set on a `403` and on returning to the
 * tab; the provider recomputes `getNavigation`; this renders a shorter menu.
 * There is nothing to subscribe to and nothing to invalidate here, which is the
 * whole reason the navigation is derived rather than held.
 *
 * ## The loading branch is a skeleton, not an empty menu
 *
 * `<Can>` renders nothing while the set is in flight, which is right for a
 * button and wrong for a menu: a sidebar that is briefly empty reads as an
 * account with no access, and then fills in. `usePermissions` reports
 * `isLoading` separately from "the set is empty" precisely so this distinction
 * can be drawn — F04 says so in as many words. In practice it is rarely seen,
 * because `/app`'s guard has already awaited the set before this mounts; it
 * matters on the first paint after a login, when the cache was just cleared.
 */
export const SidebarNav = () => {
  const { t } = useTranslation();
  const { navigation, workspace } = useWorkspace();
  const { isLoading } = usePermissions();
  const { state, isMobile } = useSidebar();
  const pathname = useRouterState({ select: (routerState) => routerState.location.pathname });

  const activeRoute = findActiveTarget(navigation, pathname)?.route;
  const collapsed = !isMobile && state === 'collapsed';

  return (
    <SidebarGroup>
      <SidebarGroupLabel>
        {t(workspace === 'team' ? 'workspace.team' : 'workspace.personal')}
      </SidebarGroupLabel>

      <SidebarMenu>
        {isLoading
          ? Array.from({ length: SKELETON_ROWS }, (_, row) => (
              <SidebarMenuSkeleton key={row} showIcon />
            ))
          : navigation.map((item) => (
              <SidebarNavItem
                key={item.titleKey}
                item={item}
                activeRoute={activeRoute}
                collapsed={collapsed}
              />
            ))}
      </SidebarMenu>
    </SidebarGroup>
  );
};
