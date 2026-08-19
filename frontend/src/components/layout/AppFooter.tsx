import { useTranslation } from 'react-i18next';

/**
 * The quiet line at the bottom of every authenticated screen.
 *
 * It is inside `SidebarInset`, below the routed content, so it sits at the foot
 * of the *page* rather than of the viewport — a sticky footer would take a
 * fixed slice of a phone screen from the thing somebody came to read.
 *
 * **No theme control and no navigation.** Both already exist above it, and a
 * second copy in the footer would be a second place to look for a setting.
 * `mt-auto` is what keeps it at the bottom of a short page without pinning it.
 *
 * ## There is no version number, deliberately
 *
 * `package.json` says `0.0.0` and nothing sets it; printing that would be a
 * fact the application states about itself that happens to be untrue. A real
 * one needs a build-time value injected through `vite.config.ts`, which is a
 * change to the build rather than to this component — noted in the feature
 * document.
 */
export const AppFooter = () => {
  const { t } = useTranslation();

  return (
    <footer className="mt-auto border-t px-3 py-4 sm:px-6">
      <p className="text-center text-xs text-muted-foreground sm:text-left">
        {t('footer.copyright', { year: new Date().getFullYear() })}
      </p>
    </footer>
  );
};
