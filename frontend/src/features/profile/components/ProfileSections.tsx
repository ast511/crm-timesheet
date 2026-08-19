import { useSuspenseProfile } from '../useProfile';
import { ProfileAccountCard } from './ProfileAccountCard';
import { ProfileAppearanceCard } from './ProfileAppearanceCard';
import { ProfileEmploymentCard } from './ProfileEmploymentCard';

/**
 * The three cards, and the one place the profile is read.
 *
 * Split from `ProfilePage` so that the page can state its heading and metadata
 * **outside** the `<Suspense>` boundary while this suspends inside it. A page
 * whose title flickers away and back while its content loads is the layout shift
 * the skeleton exists to prevent, moved up one level.
 *
 * ## The order is by who owns the data
 *
 * Account, then employment, then appearance: the two the company owns and the
 * person reads, then the one the person owns and changes. The single editable
 * field on the screen — the phone — sits inside the employment card because that
 * is the record it belongs to; see `ProfileEmploymentCard`.
 */
export const ProfileSections = () => {
  const profile = useSuspenseProfile();

  return (
    /*
     * `items-start` so each card is as tall as its own contents. Grid items
     * stretch by default, which gave the account card — four facts — the height
     * of the employment card's eight plus a form, and a card whose lower half is
     * empty reads as something that failed to load.
     */
    <div className="grid items-start gap-6 xl:grid-cols-2">
      <ProfileAccountCard account={profile.account} />
      <ProfileEmploymentCard employee={profile.employee} />

      {/*
       * Full width on the widest layout: the eight palette swatches and the five
       * radius tiles are a grid of their own, and squeezing them into half a
       * screen would wrap them into a column of pairs.
       */}
      <div className="xl:col-span-2">
        <ProfileAppearanceCard />
      </div>
    </div>
  );
};
