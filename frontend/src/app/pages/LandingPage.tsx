import { Link } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';

import { Button } from '@/components/ui/button';

/**
 * The public landing route.
 *
 * A placeholder. It becomes the sign-in entry point when the authentication
 * feature lands.
 */
export const LandingPage = () => {
  const { t } = useTranslation();

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col justify-center gap-4 p-6">
      <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">{t('landing.title')}</h1>
      <p className="text-muted-foreground">{t('landing.body')}</p>
      <div>
        <Link to="/app">
          <Button>{t('actions.openWorkspace')}</Button>
        </Link>
      </div>
    </main>
  );
};
