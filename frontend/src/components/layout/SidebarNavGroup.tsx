import { Link } from '@tanstack/react-router';
import { ChevronRightIcon, type LucideIcon } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import {
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
} from '@/components/ui/sidebar';
import type { NavChild, NavRoute } from '@/features/workspace/navigation';
import type { CommonKey } from '@/i18n/keys';

import { SidebarPopoverMenu } from './SidebarPopoverMenu';

export interface SidebarNavGroupProps {
  titleKey: CommonKey;
  icon: LucideIcon;
  /** Already filtered by permission — a group with none of these is not rendered. */
  items: readonly NavChild[];
  activeRoute: NavRoute | undefined;
  /** The sidebar is an icon rail, so the children cannot expand in place. */
  collapsed: boolean;
}

/**
 * A navigation group, in whichever of its two shapes the sidebar has room for.
 *
 * Expanded, it is a `Collapsible` whose children appear beneath it. Collapsed to
 * the icon rail that arrangement is *unavailable* — `SidebarMenuSub` carries
 * `group-data-[collapsible=icon]:hidden` in the block's own stylesheet, so a
 * group rendered this way in the rail would be a button that expands into
 * nothing — and the children come out sideways instead, in
 * `SidebarPopoverMenu`.
 *
 * ## `defaultOpen` is frozen at mount, and a browser insisted
 *
 * The obvious version passes `defaultOpen={holdsActive}` straight through, and
 * Base UI answers with a warning the moment somebody navigates: *"a component
 * is changing the default open state of an uncontrolled Collapsible after being
 * initialized"*. It is right to complain — "default" means the value at mount,
 * and a prop that keeps changing is a controlled component wearing an
 * uncontrolled component's API.
 *
 * The two honest readings are both worse than freezing it:
 *
 * - **Controlled from `holdsActive`** would snap the group shut the instant the
 *   person navigated *out* of it, and force it open when they navigated in —
 *   taking away the choice the disclosure exists to give them.
 * - **Remounting on a `key`** would reset the group on every navigation, which
 *   is the same loss with extra steps.
 *
 * Freezing gives the behaviour actually wanted: a group holding the current
 * screen starts open, and afterwards it is however the person left it. The
 * value is re-taken when the component genuinely remounts, which is what
 * switching workspace does — so a deep link into `/app/team/settings/permissions`
 * still arrives with Settings expanded.
 */
export const SidebarNavGroup = ({
  titleKey,
  icon: Icon,
  items,
  activeRoute,
  collapsed,
}: SidebarNavGroupProps) => {
  const { t } = useTranslation();
  const title = t(titleKey);
  const holdsActive = items.some((child) => child.route === activeRoute);

  /** The mount-time answer, kept. See the note above. */
  const [initiallyOpen] = useState(holdsActive);

  if (collapsed) {
    return (
      <SidebarMenuItem>
        <SidebarPopoverMenu title={title} items={items}>
          <SidebarMenuButton isActive={holdsActive}>
            <Icon aria-hidden className="size-4" />
            <span>{title}</span>
          </SidebarMenuButton>
        </SidebarPopoverMenu>
      </SidebarMenuItem>
    );
  }

  return (
    <SidebarMenuItem>
      <Collapsible defaultOpen={initiallyOpen} className="group/collapsible">
        <CollapsibleTrigger
          render={
            <SidebarMenuButton isActive={holdsActive} className="w-full">
              <Icon aria-hidden className="size-4" />
              <span>{title}</span>
              <ChevronRightIcon
                aria-hidden="true"
                className="ml-auto transition-transform duration-200 group-data-open/collapsible:rotate-90"
              />
            </SidebarMenuButton>
          }
        />
        <CollapsibleContent>
          <SidebarMenuSub>
            {items.map((child) => (
              <SidebarMenuSubItem key={child.route}>
                <SidebarMenuSubButton
                  isActive={activeRoute === child.route}
                  render={<Link to={child.route} />}
                >
                  <span>{t(child.titleKey)}</span>
                </SidebarMenuSubButton>
              </SidebarMenuSubItem>
            ))}
          </SidebarMenuSub>
        </CollapsibleContent>
      </Collapsible>
    </SidebarMenuItem>
  );
};
