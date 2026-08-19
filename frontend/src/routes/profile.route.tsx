import { createRoute } from '@tanstack/react-router';

import { ProfilePage } from '@/app/pages/ProfilePage';

import { workspaceRoute } from './workspace.route';

/**
 * `/app/profile` — the account screen, in the personal workspace.
 *
 * ## Why `/app/profile` and not `/profile`
 *
 * The brief asked for "a `/profile` route in the authenticated area", and in
 * this route tree those are the same sentence: `workspaceRoute` carries the
 * **only** authentication guard, deliberately, so that a screen added next year
 * cannot be public because somebody forgot to protect it. A top-level `/profile`
 * would be a second place that check has to be written, and the first one
 * anybody would forget to update. Hanging off `/app` is how a screen becomes
 * authenticated here.
 *
 * It also settles which workspace the page is in without deciding anything:
 * `workspaceForPath` reads the `/app/team` prefix, this is not under it, so the
 * sidebar keeps the personal menu — which is right. Your own account is your own
 * work, not administration.
 *
 * ## It declares no permission, and that is the whole rule
 *
 * Every other screen under `/app` names a `PermissionRequirement` matching its
 * menu item's. This one has no menu item and no requirement: a profile is the
 * caller's own record, `GET /profile/me` cannot name anybody else, and a
 * permission gating it would be a permission that can be revoked to lock
 * somebody out of their own phone number. Authentication is the entire
 * authorization, and the parent already did it.
 *
 * `workspaceIndexRoute` is the only other route under `/app` with no
 * requirement, for a different reason (F05 explains it). Two exceptions, both
 * argued, and neither is "we forgot".
 */
export const profileRoute = createRoute({
  getParentRoute: () => workspaceRoute,
  path: '/profile',
  component: ProfilePage,
});
