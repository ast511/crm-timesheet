import { createRoute } from '@tanstack/react-router';

import { WorkspaceLayout } from '@/app/layout/WorkspaceLayout';
import { WorkspaceHomePage } from '@/app/pages/WorkspaceHomePage';

import { rootRoute } from './root.route';

/**
 * `/app` — the layout route every authenticated screen hangs off.
 *
 * SEAM (auth feature): the guard goes here, on the layout route, and nowhere
 * else. One `beforeLoad` covers every child, which is what stops a screen added
 * next year from being public because somebody forgot to protect it:
 *
 * ```ts
 * beforeLoad: ({ context, location }) => {
 *   if (!context.auth.isAuthenticated) {
 *     throw redirect({ to: '/login', search: { redirect: location.href } });
 *   }
 * }
 * ```
 *
 * SEAM (permissions feature): a child route that needs a specific permission
 * declares it in its own `beforeLoad` against the effective permissions on the
 * router context. Route-level checks are for *navigation*; a button inside a
 * screen is soft-gated in the component. Neither replaces the backend's
 * enforcement — both are about not offering somebody a door that will be shut
 * in their face.
 */
export const workspaceRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/app',
  component: WorkspaceLayout,
});

/** `/app` itself. Replaced by a real dashboard later. */
export const workspaceIndexRoute = createRoute({
  getParentRoute: () => workspaceRoute,
  path: '/',
  component: WorkspaceHomePage,
});
