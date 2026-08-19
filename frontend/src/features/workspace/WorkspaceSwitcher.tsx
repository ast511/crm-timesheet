import { Building2Icon, ChevronsUpDownIcon, UserIcon, type LucideIcon } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { SidebarMenu, SidebarMenuButton, SidebarMenuItem, useSidebar } from '@/components/ui/sidebar';
import type { CommonKey } from '@/i18n/keys';

import { useWorkspace } from './useWorkspace';
import { WORKSPACES, type Workspace } from './workspace';

interface WorkspaceFace {
  icon: LucideIcon;
  nameKey: CommonKey;
  hintKey: CommonKey;
}

/** How each workspace introduces itself. The only presentation in this file. */
const FACES: Record<Workspace, WorkspaceFace> = {
  personal: { icon: UserIcon, nameKey: 'workspace.personal', hintKey: 'workspace.personalHint' },
  team: { icon: Building2Icon, nameKey: 'workspace.team', hintKey: 'workspace.teamHint' },
};

/**
 * The control at the top of the sidebar that says which workspace is open, and
 * — for somebody who has two — opens the other.
 *
 * Ported from the mock's `TeamSwitcher`, with the thing that decides it
 * replaced. The mock read `useRootPathSegment()` and branched on `"admin"`,
 * `"hr"` and `"user"`, which meant three strings deciding a question the
 * backend answers with fifty-five permissions, and a `hr`-shaped URL prefix
 * deciding it a second time. Here the answer is `canUseTeam`, which is "does
 * anything in the team menu survive the permission filter" — see
 * `navigation.ts`.
 *
 * ## Somebody with one workspace gets a label, not a disabled menu
 *
 * A dropdown that opens onto a single entry is a control that does nothing, and
 * a *disabled* control is worse: it advertises a workspace the person cannot
 * have and gives them nothing to do about it. For a plain employee this renders
 * the same row without a trigger, without the chevron, and without a menu —
 * which reads as a heading, because that is what it is.
 *
 * That branch is also the mid-session demotion in miniature: F04's re-sync
 * empties the team menu, `canUseTeam` turns false, and the control becomes a
 * label under an administrator who is no longer one. Nothing here watches for
 * it.
 */
export const WorkspaceSwitcher = () => {
  const { t } = useTranslation();
  const { isMobile } = useSidebar();
  const { workspace, canUseTeam, switchWorkspace } = useWorkspace();

  const active = FACES[workspace];
  const ActiveIcon = active.icon;

  const face = (
    <>
      <div className="flex aspect-square size-6 items-center justify-center rounded-md bg-sidebar-primary text-sidebar-primary-foreground">
        <ActiveIcon aria-hidden="true" className="size-3.5" />
      </div>
      <div className="grid flex-1 text-left leading-tight">
        <span className="truncate text-sm font-medium">{t(active.nameKey)}</span>
        <span className="truncate text-xs text-sidebar-foreground/70">{t(active.hintKey)}</span>
      </div>
    </>
  );

  if (!canUseTeam) {
    return (
      <SidebarMenu>
        <SidebarMenuItem>
          {/*
           * Not a `SidebarMenuButton`: this is not a button. It borrows the
           * button's box so the row lines up with the one an administrator
           * sees, and stops there.
           */}
          <div className="flex h-12 w-full items-center gap-2 overflow-hidden rounded-md p-2 group-data-[collapsible=icon]:size-8! group-data-[collapsible=icon]:p-2!">
            {face}
          </div>
        </SidebarMenuItem>
      </SidebarMenu>
    );
  }

  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <SidebarMenuButton
                size="lg"
                aria-label={t('workspace.switch')}
                className="data-open:bg-sidebar-accent data-open:text-sidebar-accent-foreground"
              >
                {face}
                <ChevronsUpDownIcon aria-hidden="true" className="ml-auto" />
              </SidebarMenuButton>
            }
          />
          <DropdownMenuContent
            className="min-w-56"
            align="start"
            side={isMobile ? 'bottom' : 'right'}
            sideOffset={4}
          >
            {/*
             * The label is inside the group it labels, and Base UI insists:
             * `DropdownMenuLabel` is `Menu.GroupLabel`, which throws without a
             * `Menu.Group` above it. Radix — what the mock used — allowed a bare
             * label, so this is one of the places the port could not be a copy.
             */}
            <DropdownMenuGroup>
              <DropdownMenuLabel className="text-xs text-muted-foreground">
                {t('workspace.label')}
              </DropdownMenuLabel>

              {WORKSPACES.map((candidate) => {
                const { icon: Icon, nameKey, hintKey } = FACES[candidate];

                return (
                  <DropdownMenuItem
                    key={candidate}
                    onClick={() => switchWorkspace(candidate)}
                    className="gap-2"
                  >
                    <div className="flex size-6 items-center justify-center rounded-md border">
                      <Icon aria-hidden="true" className="size-3.5 shrink-0" />
                    </div>
                    <div className="grid leading-tight">
                      <span className="text-sm">{t(nameKey)}</span>
                      <span className="text-xs text-muted-foreground">{t(hintKey)}</span>
                    </div>
                  </DropdownMenuItem>
                );
              })}
            </DropdownMenuGroup>
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarMenuItem>
    </SidebarMenu>
  );
};
