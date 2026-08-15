import { createRoute } from '@tanstack/react-router';

import { NotAuthorizedPage } from '@/app/pages/NotAuthorizedPage';
import {
  isPermissionKeyShaped,
  type PermissionKey,
} from '@/features/permissions/permission-keys';

import { workspaceRoute } from './workspace.route';

export interface NotAuthorizedSearch {
  /**
   * The keys the refused route required, comma-separated — **a string, not the
   * parsed array**, and that is the whole of the note below.
   */
  required: string;
}

/**
 * `/app/not-authorized` — where `requirePermission` sends somebody it refused.
 *
 * ## It is inside `/app`, and that is the point
 *
 * It hangs off `workspaceRoute`, so it inherits the authentication guard and
 * the authenticated layout: a signed-out visitor who opens this URL gets
 * `/login`, not a page explaining a permission they cannot be missing because
 * they have no account in play. It declares no requirement of its own, which
 * would otherwise be the one genuinely amusing bug available in this feature.
 *
 * ## `validateSearch` is a sanitiser, for the same reason `/login`'s is
 *
 * `?required=` is written into a URL by the guard and read back out by a page
 * that renders it. Between those two moments anybody can edit it. React escapes
 * what it renders, so this is not about injection — it is about not printing an
 * arbitrary sentence in the application's own voice, on a page whose subject is
 * what the application will and will not let you do.
 *
 * So each entry has to *look like a permission key* — `RESOURCE.ACTION`,
 * screaming snake case — and anything else is dropped. That does not verify the
 * key exists, and does not need to: the page names it as "what this route asked
 * for", which is exactly what it is.
 *
 * ## The schema keeps a string, and a browser found out why
 *
 * The first version parsed `?required=` into a `PermissionKey[]`, which is the
 * shape the page wants and reads better everywhere. It produced a URL of
 * `?required=["PROJECTS.VIEW"]` — and then a page that named no permission at
 * all.
 *
 * **TanStack Router writes the *validated* search back into the address bar**
 * on a client-side navigation. So a `validateSearch` that changes the shape of
 * a value does not merely parse it: it re-serialises the parsed form into the
 * URL, and on the next parse `typeof search.required === 'string'` is false,
 * every key fails the filter, and the list arrives empty. The screen still
 * renders — it just quietly stops saying the one thing it exists to say, and
 * only on the redirect that comes from a mid-session change rather than on a
 * fresh page load, which is the harder of the two to notice.
 *
 * A search schema therefore has to round-trip: `parse(serialise(x))` must equal
 * `x`. Keeping the wire form and splitting it in the component below is the
 * cheapest way to guarantee that, and it keeps the sanitising in the one place
 * the router runs before anything reads the value.
 */
export const notAuthorizedRoute = createRoute({
  getParentRoute: () => workspaceRoute,
  path: '/not-authorized',
  validateSearch: (search: Record<string, unknown>): NotAuthorizedSearch => ({
    required:
      typeof search.required === 'string'
        ? search.required.split(',').filter(isPermissionKeyShaped).join(',')
        : '',
  }),
  /*
   * The route reads its own search parameter and hands the page a prop — the
   * arrangement `login.route.tsx` explains: a page under a pathless parent
   * would otherwise have to name a route id that is not its URL.
   *
   * The split happens here rather than in `validateSearch` for the round-trip
   * reason above. Every entry has already passed `isPermissionKeyShaped`, so
   * the cast states what the filter established rather than assuming it.
   */
  component: () => {
    const { required } = notAuthorizedRoute.useSearch();

    return (
      <NotAuthorizedPage
        required={required === '' ? [] : (required.split(',') as PermissionKey[])}
      />
    );
  },
});
