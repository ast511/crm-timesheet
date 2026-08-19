import { ConstructionIcon } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { FadeIn } from '@/components/motion/FadeIn';
import { usePageMeta } from '@/hooks/usePageMeta';
import type { CommonKey } from '@/i18n/keys';

export interface WorkspacePlaceholderPageProps {
  /** Key of the page's name in the `common` bundle. */
  titleKey: CommonKey;
  /** Key of its meta description, which doubles as the on-screen subtitle. */
  descriptionKey: CommonKey;
}

/**
 * What every screen the navigation points at renders until the feature that
 * owns it is built.
 *
 * F05 is the shell — the sidebar, the workspaces, the header and the footer —
 * and a shell needs somewhere for its links to go. One component covers all
 * twelve of them rather than twelve identical stubs, because a stub is not a
 * screen and multiplying it would be twelve files to delete later instead of
 * one line per route.
 *
 * It is deliberately not empty: it names itself and sets its own metadata
 * through the mechanism every real screen will use, so the titles, the header's
 * section label and the menu can all be checked now against the thing they will
 * describe later.
 */
export const WorkspacePlaceholderPage = ({
  titleKey,
  descriptionKey,
}: WorkspacePlaceholderPageProps) => {
  const { t } = useTranslation();
  const title = t(titleKey);
  const description = t(descriptionKey);

  usePageMeta({ title, description });

  return (
    <FadeIn className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-xl font-semibold tracking-tight">{title}</h1>
        <p className="text-sm text-muted-foreground">{description}</p>
      </div>

      <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed p-8 text-center sm:p-12">
        <ConstructionIcon aria-hidden="true" className="size-6 text-muted-foreground" />
        <p className="max-w-sm text-sm text-muted-foreground">{t('shell.placeholder')}</p>
      </div>
    </FadeIn>
  );
};
