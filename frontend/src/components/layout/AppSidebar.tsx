import { useTranslation } from 'react-i18next';

/**
 * The navigation region.
 *
 * Deliberately empty. Real navigation is a list of the screens a person is
 * allowed to open, and both halves of that — the screens and the permission
 * check — belong to later features. Hidden below `lg`, where the shell is a
 * single column.
 */
export const AppSidebar = () => {
  const { t } = useTranslation();

  return (
    <aside className="hidden w-56 shrink-0 border-r p-4 lg:block">
      <p className="text-sm text-muted-foreground">{t('shell.sidebarPlaceholder')}</p>
    </aside>
  );
};
