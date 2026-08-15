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
 * SEAM (permissions feature): the effective permission keys from
 * `GET /api/v1/permissions/me/effective` belong on the same object, so a route
 * can require one and a component can soft-gate a button on the same source.
 */
export interface RouterContext {
  queryClient: QueryClient;
  auth: AuthState;
}

export const rootRoute = createRootRouteWithContext<RouterContext>()({
  component: RootLayout,
});
