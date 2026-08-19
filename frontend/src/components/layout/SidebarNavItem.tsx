import { Link } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';

import { SidebarMenuButton, SidebarMenuItem } from '@/components/ui/sidebar';
import type { NavItem, NavRoute } from '@/features/workspace/navigation';

import { SidebarNavGroup } from './SidebarNavGroup';

export interface SidebarNavItemProps {
  item: NavItem;
  /** The route the current URL resolves to, or `undefined` off the menu. */
  activeRoute: NavRoute | undefined;
  /** The sidebar is an icon rail. Not the same as "not expanded" — see below. */
  collapsed: boolean;
}

/**
 * One row of the sidebar: a link, or — delegated to `SidebarNavGroup` — a group
 * that opens into its children.
 *
 * The fork is `item.children === undefined`, which is why `NavItem` is a union
 * rather than one shape with two optional fields: the narrowing gives the link
 * arm a `route` that is definitely there.
 *
 * `collapsed` is passed in rather than read from `useSidebar` here because the
 * caller has to distinguish it from `state === 'collapsed'`: on mobile the
 * sidebar is a full-width sheet whose `state` still reports whatever the
 * desktop rail was last left at, and a sheet has all the room in the world.
 *
 * ## Links carry a tooltip, groups do not
 *
 * In the rail a link is an unlabelled icon, so the tooltip is the only thing
 * naming it. A collapsed group is not unlabelled — hovering opens its popover,
 * which is titled — and a tooltip racing a popover out of the same hover is two
 * things appearing where the person asked for one.
 */
export const SidebarNavItem = ({ item, activeRoute, collapsed }: SidebarNavItemProps) => {
  const { t } = useTranslation();

  if (item.children !== undefined) {
    return (
      <SidebarNavGroup
        titleKey={item.titleKey}
        icon={item.icon}
        items={item.children}
        activeRoute={activeRoute}
        collapsed={collapsed}
      />
    );
  }

  const title = t(item.titleKey);
  const Icon = item.icon;

  return (
    <SidebarMenuItem>
      <SidebarMenuButton
        tooltip={title}
        isActive={activeRoute === item.route}
        render={<Link to={item.route} />}
      >
        <Icon aria-hidden className="size-4" />
        <span>{title}</span>
      </SidebarMenuButton>
    </SidebarMenuItem>
  );
};
