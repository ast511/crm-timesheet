import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';

export interface PageMeta {
  /** The page's own name, already translated. `TimeSheet | ` is prepended. */
  title: string;
  /** A page-specific meta description, already translated. */
  description: string;
}

/**
 * Sets `document.title` and the meta description for the screen that calls it.
 *
 * ```ts
 * usePageMeta({
 *   title: t('pages.timesheet.title'),
 *   description: t('pages.timesheet.description'),
 * });
 * ```
 *
 * `CLAUDE.md` asks for one reusable mechanism rather than `document.title =`
 * scattered through components, and for the title to read
 * `TimeSheet | <page name>`. This is that mechanism, and it is the only thing in
 * the application that writes either value. F04 deliberately left it unbuilt —
 * `NotAuthorizedPage` stayed silent rather than become a precedent nobody chose
 * — so it arrives here, with the shell the titles describe.
 *
 * ## It takes translated strings, not keys
 *
 * A key would make this hook reach for `t` on the caller's behalf and pick the
 * namespace for it. Taking the finished string keeps the translation where the
 * page's other strings already are, and makes the re-render on a language
 * change fall out for free: `t(…)` returns something new, the dependency
 * changes, the effect runs again. The base name is the one string this hook
 * looks up itself, because it is the same on every page.
 *
 * ## There is no cleanup, and that is a decision
 *
 * Restoring a previous title on unmount would mean deciding what "previous"
 * means during a navigation, where the outgoing page's cleanup runs before the
 * incoming page's effect — so the correct value would be written, then
 * overwritten by a stale one, then written again. Instead **every route
 * component calls this hook**, so the next screen always states its own
 * metadata and there is nothing to restore.
 *
 * The static `<title>` and `<meta name="description">` in `index.html` are the
 * fallback for the moment before React has mounted, and for nothing else.
 */
export const usePageMeta = ({ title, description }: PageMeta): void => {
  const { t } = useTranslation();
  const appName = t('app.name');

  useEffect(() => {
    document.title = `${appName} | ${title}`;

    const meta = document.querySelector('meta[name="description"]');

    if (meta !== null) meta.setAttribute('content', description);
  }, [appName, title, description]);
};
