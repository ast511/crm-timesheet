import { Link } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';

import { ColorModeToggle } from '@/components/ColorModeToggle';
import { LanguageSwitcher } from '@/components/LanguageSwitcher';
import { SignOutButton } from '@/features/auth/components/SignOutButton';
import { useAuth } from '@/features/auth/useAuth';

/**
 * The header of the **authenticated** application, rendered by
 * `WorkspaceLayout` and by nothing else.
 *
 * It used to be shared with the public screens, on the argument that language
 * and light/dark were "equally relevant on a login screen and on a timesheet".
 * The first half of that held and the second did not: a stored light/dark
 * choice belongs to a person, and on a login form there is not one yet. The
 * public screens now have their own header (`PublicHeader`) with a logo and a
 * language and no theme control at all.
 *
 * What is left here is everything that needs somebody signed in to make sense:
 *
 * - **`ColorModeToggle`** — light / dark / system, stored on the device.
 * - **`LanguageSwitcher`** — also on the device, also never sent to the API.
 * - The address and the way out.
 *
 * SEAM (profile feature): the palette and corner-radius pickers of backend
 * Feature 039 belong beside the mode toggle, and belong *here* rather than in
 * `PublicHeader` for the same reason the mode toggle does — they are read from
 * and written to an account. `ThemeProvider.setPreferences` is what they call.
 *
 * SEAM (layout feature F04): the address and `SignOutButton` are the contents
 * of an account menu that does not exist yet. F04 owns the avatar, the profile
 * link and the navigation; this is the action without the container.
 */
export const AppHeader = () => {
  const { t } = useTranslation();
  const { user } = useAuth();

  return (
    <header className="sticky top-0 z-10 flex h-14 items-center gap-4 border-b bg-background/95 px-4 backdrop-blur supports-backdrop-filter:bg-background/80">
      <Link to="/app" className="font-semibold tracking-tight">
        {t('app.name')}
      </Link>

      <nav className="ml-auto flex items-center gap-1">
        {user !== null && (
          <span className="hidden truncate text-sm text-muted-foreground sm:inline">
            {user.email}
          </span>
        )}
        <LanguageSwitcher />
        <ColorModeToggle />
        {user !== null && <SignOutButton />}
      </nav>
    </header>
  );
};
