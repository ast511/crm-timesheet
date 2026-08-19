import { useRouterState } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';

import { ColorModeToggle } from '@/components/ColorModeToggle';
import { LanguageSwitcher } from '@/components/LanguageSwitcher';
import { ThemePaletteDialog } from '@/components/theme/ThemePaletteDialog';
import { Separator } from '@/components/ui/separator';
import { SidebarTrigger } from '@/components/ui/sidebar';
import { SignOutButton } from '@/features/auth/components/SignOutButton';
import { useAuth } from '@/features/auth/useAuth';
import { useDisplayName } from '@/features/profile/useProfile';
import { findActiveTarget } from '@/features/workspace/navigation';
import { useWorkspace } from '@/features/workspace/useWorkspace';

/**
 * The header of the **authenticated** application, rendered by
 * `WorkspaceLayout` and by nothing else.
 *
 * ```
 * ⌘  Section title                    🌐  ☀  🎨  │  me@company.ro  ⇥
 * ```
 *
 * Left: the sidebar trigger — the mobile way in, since the sidebar is a sheet
 * below `md` and there is no rail to grab — and the name of the screen.
 *
 * Right, in the order they are needed: the language, light/dark, the palette,
 * and the account. `LanguageSwitcher` and `ColorModeToggle` are F02's and F03's
 * and are reused unchanged; `ThemePaletteDialog` is the seam F03 left here,
 * filled in.
 *
 * ## The section title comes from the navigation, not from the route
 *
 * `findActiveTarget` reads the same permission-filtered menu the sidebar
 * renders, so the header names exactly the item the sidebar has highlighted —
 * one lookup, two consumers, no route-to-label map to keep in step with the
 * menu. A screen that is not in the menu (`/app/not-authorized`) falls back to
 * the application's name rather than inventing a heading for itself.
 *
 * This is the *section* title. The document title is a separate statement made
 * by the page itself through `usePageMeta`, and the two agree because they
 * translate the same key.
 *
 * ## The account strip is here and the account *menu* is in the sidebar
 *
 * Both were asked for and both are built. The strip is the address and the way
 * out at a glance, at the width where a sidebar footer may be behind a sheet;
 * `SidebarUserMenu` is the fuller identity, with the role and the profile entry.
 * They overlap in one control — sign out — and that is noted in the feature
 * document as something to settle rather than something that settled itself.
 */
export const AppHeader = () => {
  const { t } = useTranslation();
  const { user } = useAuth();
  const displayName = useDisplayName();
  const { navigation } = useWorkspace();
  const pathname = useRouterState({ select: (routerState) => routerState.location.pathname });

  const activeTitleKey = findActiveTarget(navigation, pathname)?.titleKey;

  return (
    <header className="sticky top-0 z-10 flex h-14 shrink-0 items-center gap-2 border-b bg-background/95 px-3 backdrop-blur supports-backdrop-filter:bg-background/80 sm:px-4">
      <SidebarTrigger aria-label={t('sidebar.toggle')} />

      <Separator orientation="vertical" className="mr-1 h-4" />

      <h1 className="min-w-0 truncate text-sm font-semibold tracking-tight sm:text-base">
        {activeTitleKey === undefined ? t('app.name') : t(activeTitleKey)}
      </h1>

      <nav className="ml-auto flex items-center gap-1">
        <LanguageSwitcher />
        <ColorModeToggle />
        <ThemePaletteDialog />

        {/*
         * The account strip starts at `sm`. On a phone the three controls above
         * plus a labelled "sign out" leave the section title with about a word,
         * and the way out is already in the sidebar sheet two taps away — so
         * the narrow layout drops the copy rather than shrinking the heading
         * that says where you are.
         */}
        {user !== null && (
          <div className="hidden items-center gap-1 sm:flex">
            <Separator orientation="vertical" className="mx-1 h-4" />
            {/*
             * The username, from `GET /profile/me` — the only endpoint that
             * publishes it, since `AuthUserEntity` carries an address and a role
             * and nothing else. `useDisplayName` falls back to the address for
             * an account that has no username set, because the field is
             * nullable in the contract and an empty header is worse than an
             * address.
             */}
            <span className="hidden max-w-40 truncate text-sm text-muted-foreground lg:inline">
              {displayName}
            </span>
            <SignOutButton />
          </div>
        )}
      </nav>
    </header>
  );
};
