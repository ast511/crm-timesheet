import { LanguagesIcon } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { LANGUAGES, storeLanguage, type Language } from '@/i18n/config';

/**
 * Switches between Romanian and English.
 *
 * The choice is remembered on the device and never sent to the backend: there
 * is no `language` column, and backend Feature 039 argues against inventing one
 * before something reads it.
 */
export const LanguageSwitcher = () => {
  const { t, i18n } = useTranslation();

  const change = (language: Language) => {
    storeLanguage(language);
    void i18n.changeLanguage(language);
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button variant="ghost" size="icon-sm" aria-label={t('language.label')}>
            <LanguagesIcon aria-hidden="true" />
          </Button>
        }
      />
      <DropdownMenuContent align="end">
        <DropdownMenuRadioGroup
          value={i18n.resolvedLanguage ?? ''}
          onValueChange={(value) => change(value as Language)}
        >
          {LANGUAGES.map((language) => (
            <DropdownMenuRadioItem key={language} value={language}>
              {t(`language.${language}`)}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
};
