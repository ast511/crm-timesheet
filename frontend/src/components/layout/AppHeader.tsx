import { Link } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';

import { ColorModeToggle } from '@/components/ColorModeToggle';
import { LanguageSwitcher } from '@/components/LanguageSwitcher';

/**
 * The application header.
 *
 * A placeholder in everything except the two controls, which are real. Search,
 * notifications and the account menu arrive with the features that own them —
 * an account menu with nobody signed in would be scaffolding pretending to be a
 * feature.
 */
export const AppHeader = () => {
  const { t } = useTranslation();

  return (
    <header className="sticky top-0 z-10 flex h-14 items-center gap-4 border-b bg-background/95 px-4 backdrop-blur supports-[backdrop-filter]:bg-background/80">
      <Link to="/" className="font-semibold tracking-tight">
        {t('app.name')}
      </Link>

      <nav className="ml-auto flex items-center gap-1">
        <LanguageSwitcher />
        <ColorModeToggle />
      </nav>
    </header>
  );
};
