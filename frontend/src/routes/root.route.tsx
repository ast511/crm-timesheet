import type { QueryClient } from '@tanstack/react-query';
import { createRootRouteWithContext } from '@tanstack/react-router';

import { RootLayout } from '@/app/layout/RootLayout';

/**
 * Everything a route loader or a guard can reach without importing a module.
 *
 * `queryClient` is here so a route can prefetch into the same cache the
 * components read from, rather than fetching twice.
 *
 * SEAM (auth feature): add `auth: AuthContext` — the signed-in account and
 * whether there is one. A guard then reads it in `beforeLoad` and redirects,
 * which is the only correct place for that check: it runs *before* the route's
 * component and its loader, so a protected screen never renders for a moment
 * with nobody signed in.
 *
 * SEAM (permissions feature): the effective permission keys from
 * `GET /api/v1/permissions/me/effective` belong on the same object, so a route
 * can require one and a component can soft-gate a button on the same source.
 */
export interface RouterContext {
  queryClient: QueryClient;
}

export const rootRoute = createRootRouteWithContext<RouterContext>()({
  component: RootLayout,
});
