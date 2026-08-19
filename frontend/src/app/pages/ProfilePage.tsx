import { useTranslation } from 'react-i18next';

import { FadeIn } from '@/components/motion/FadeIn';
import { QueryBoundary } from '@/components/QueryBoundary';
import { ProfileSections } from '@/features/profile/components/ProfileSections';
import { ProfileSkeleton } from '@/features/profile/components/ProfileSkeleton';
import { usePageMeta } from '@/hooks/usePageMeta';

/**
 * `/app/profile` — the signed-in person's own account and employment record.
 *
 * ## Almost all of it already existed
 *
 * F05 built `GET /profile/me` as a query, the hooks that read it and the
 * mutation that writes the theme, because the header needed a username and the
 * palette had to survive a reload. What was missing was the screen: this page,
 * its route, and the account menu's link to it. Nothing here re-fetches, re-types
 * or re-wraps any of that — `useSuspenseProfile` reads the same cache entry the
 * shell was already painted from.
 *
 * ## The heading is outside the boundary and the cards are inside it
 *
 * `usePageMeta` and the `<h1>` state facts that do not depend on the response —
 * this is the profile page whether or not the profile has arrived — so they
 * render immediately and stay put while `ProfileSections` suspends into a
 * skeleton shaped like itself. Putting them inside would make the title flicker
 * on exactly the reload the skeleton exists to smooth.
 *
 * `QueryBoundary` also supplies the error boundary a suspended query needs: a
 * failed profile load renders `QueryErrorState` with a retry rather than taking
 * the shell down with it.
 */
export const ProfilePage = () => {
  const { t } = useTranslation();

  usePageMeta({
    title: t('pages.profile.title'),
    description: t('pages.profile.description'),
  });

  return (
    <FadeIn className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-xl font-semibold tracking-tight">{t('pages.profile.title')}</h1>
        <p className="text-sm text-muted-foreground">{t('pages.profile.description')}</p>
      </div>

      <QueryBoundary fallback={<ProfileSkeleton />}>
        <ProfileSections />
      </QueryBoundary>
    </FadeIn>
  );
};
