import type { QueryClient } from '@tanstack/react-query';
import { createRootRouteWithContext } from '@tanstack/react-router';

import { RootLayout } from '@/app/layout/RootLayout';
import type { AuthState } from '@/features/auth/auth-store';

/**
 * Everything a route loader or a guard can reach without importing a module.
 *
 * `queryClient` is here so a route can prefetch into the same cache the
 * components read from, rather than fetching twice.
 *
 * `auth` is the session, and it is on the context rather than read from the
 * store directly for one reason: `beforeLoad` is not a component and cannot
 * subscribe to anything, so the value it sees has to be *supplied* to it. It is
 * pushed in by `AppRouter` on every change (`<RouterProvider context={…}>`),
 * which is also what makes a change re-run the guards.
 *
 * ## Where the permissions ended up, and why not here (F04)
 *
 * This once carried a seam saying the effective permission keys belonged on
 * this object beside `auth`. They do not, and the reason is a difference
 * between the two that is invisible until it bites.
 *
 * `auth` can be *pushed* into the context because it is already known before
 * the router mounts — `AuthGate` holds the application back until it is. The
 * permission set is not: it is fetched per account, and the moment it is most
 * needed is the navigation immediately after a login, when the cache has just
 * been cleared and the answer has not arrived. A guard reading a pushed
 * snapshot at that moment reads an empty set and refuses a page the person is
 * entitled to.
 *
 * So the set is *awaited* instead, in `workspaceRoute`'s `beforeLoad`, and
 * returned as context for its children — see `src/routes/workspace.route.tsx`.
 * Every route that could need it is under `/app` by construction, since a
 * permission is meaningless without a session, so nothing above that route ever
 * has to ask. `AppRouter` still watches the set and invalidates the router when
 * it changes, which is what makes a mid-session demotion re-run these guards.
 */
export interface RouterContext {
  queryClient: QueryClient;
  auth: AuthState;
}

export const rootRoute = createRootRouteWithContext<RouterContext>()({
  component: RootLayout,
});
