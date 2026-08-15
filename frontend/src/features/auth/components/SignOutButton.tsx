import { LogOutIcon } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';

import { useLogout } from '../auth-mutations';

/**
 * Sign out.
 *
 * Deliberately a bare button rather than an account menu: a menu belongs with
 * the layout feature that will also hold navigation, the avatar and the profile
 * link, and building half of it here would be scaffolding somebody has to
 * unpick. What this feature owes the application is the *action*, reachable and
 * correct.
 *
 * Disabled while in flight so a second click cannot start a second revocation
 * of a token the first one has already spent.
 */
export const SignOutButton = () => {
  const { t } = useTranslation();
  const logoutMutation = useLogout();

  return (
    <Button
      variant="ghost"
      size="sm"
      disabled={logoutMutation.isPending}
      onClick={() => {
        logoutMutation.mutate();
      }}
    >
      {logoutMutation.isPending ? <Spinner size="sm" /> : <LogOutIcon aria-hidden="true" />}
      {t('auth.signOut')}
    </Button>
  );
};
