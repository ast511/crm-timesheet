import { ChevronsUpDownIcon, LogOutIcon, UserRoundIcon } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { SidebarMenu, SidebarMenuButton, SidebarMenuItem, useSidebar } from '@/components/ui/sidebar';
import { useLogout } from '@/features/auth/auth-mutations';
import { useAuth } from '@/features/auth/useAuth';

/** The first two letters of the address, which is all the identity we have. */
const initialsOf = (email: string): string => email.slice(0, 2).toUpperCase();

/**
 * Who is signed in, at the bottom of the sidebar, with the way out.
 *
 * The mock's `NavUser`, minus the parts that assumed a different application:
 * its avatar image (`AuthUserEntity` carries no picture and no display name —
 * only an address and a role), and its three hard-coded routes built by
 * concatenating a role into a path.
 *
 * ## It states the role, and F04 is why that is worth doing
 *
 * `useAuth().user.role` is re-read by the permission re-sync alongside the
 * permission set, on the same `403` and the same return-to-tab. So a demoted
 * administrator does not sit here labelled "Administrator" while their menu
 * quietly shortens — the two correct together, which is the whole reason F04's
 * handler re-reads `/auth/me` rather than only refetching permissions.
 *
 * This is also what "the sidebar collapses to the user menu" means for somebody
 * who loses every permission mid-session: `SidebarNav` renders an empty list
 * and this stays, because knowing who you are signed in as and being able to
 * leave are not permissions.
 *
 * The profile entry is present and disabled: the screen it opens belongs to the
 * feature that reads `GET /profile/me`, and offering a menu item that navigates
 * nowhere would be worse than one that says it is not ready yet.
 */
export const SidebarUserMenu = () => {
  const { t } = useTranslation();
  const { isMobile } = useSidebar();
  const { user } = useAuth();
  const logoutMutation = useLogout();

  if (user === null) return null;

  const identity = (
    <>
      <Avatar className="size-8 rounded-md">
        <AvatarFallback className="rounded-md text-xs">{initialsOf(user.email)}</AvatarFallback>
      </Avatar>
      <div className="grid flex-1 text-left leading-tight">
        <span className="truncate text-sm font-medium">{user.email}</span>
        <span className="truncate text-xs text-sidebar-foreground/70">
          {t(`roles.${user.role}`)}
        </span>
      </div>
    </>
  );

  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <SidebarMenuButton
                size="lg"
                aria-label={t('account.menu')}
                className="data-open:bg-sidebar-accent data-open:text-sidebar-accent-foreground"
              >
                {identity}
                <ChevronsUpDownIcon aria-hidden="true" className="ml-auto" />
              </SidebarMenuButton>
            }
          />
          <DropdownMenuContent
            className="min-w-56"
            align="end"
            side={isMobile ? 'bottom' : 'right'}
            sideOffset={4}
          >
            {/*
             * The identity is a `Menu.GroupLabel` and therefore has to sit
             * inside a `Menu.Group`, which Base UI enforces at runtime and
             * Radix — the mock's library — did not. Labelling the account
             * actions with whose account they are is the right grouping anyway.
             */}
            <DropdownMenuGroup>
              <DropdownMenuLabel className="font-normal">
                <div className="flex items-center gap-2">{identity}</div>
              </DropdownMenuLabel>

              <DropdownMenuSeparator />

              <DropdownMenuItem disabled>
                <UserRoundIcon aria-hidden="true" />
                <div className="grid leading-tight">
                  <span>{t('account.profile')}</span>
                  <span className="text-xs text-muted-foreground">{t('account.unavailable')}</span>
                </div>
              </DropdownMenuItem>

              <DropdownMenuSeparator />

              {/*
               * Disabled while in flight, for the reason `SignOutButton` gives:
               * a second click would start a second revocation of a token the
               * first one has already spent.
               */}
              <DropdownMenuItem
                disabled={logoutMutation.isPending}
                onClick={() => {
                  logoutMutation.mutate();
                }}
              >
                <LogOutIcon aria-hidden="true" />
                {t('auth.signOut')}
              </DropdownMenuItem>
            </DropdownMenuGroup>
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarMenuItem>
    </SidebarMenu>
  );
};
