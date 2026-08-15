import { createRoute, redirect } from '@tanstack/react-router';

import { WorkspaceLayout } from '@/app/layout/WorkspaceLayout';
import { WorkspaceHomePage } from '@/app/pages/WorkspaceHomePage';

import { rootRoute } from './root.route';

/**
 * `/app` — the layout route every authenticated screen hangs off, and the one
 * place authentication is checked.
 *
 * **The guard is here and nowhere else.** One `beforeLoad` covers every child,
 * present and future, which is what stops a screen added next year from being
 * public because somebody forgot to protect it. `beforeLoad` runs before the
 * component and before any loader, so a protected screen never renders for a
 * frame with nobody signed in — and never issues the request that would answer
 * `401`.
 *
 * It reads `context.auth`, which `AppRouter` keeps current. Two things follow
 * from that and are worth knowing before changing either:
 *
 * - The application does not mount the router until the session is known
 *   (`AuthGate`), so this never runs against `status: 'loading'` and never
 *   bounces a returning person whose refresh cookie was about to sign them in.
 * - When a session dies *mid-visit* — a refresh the backend refused —
 *   `AppRouter` invalidates the router, this runs again, and the person is sent
 *   here from wherever they were standing.
 *
 * `location.href` is recorded so signing in returns them to the screen they
 * asked for; `login.route.tsx` sanitises it before anything navigates to it.
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
  beforeLoad: ({ context, location }) => {
    if (!context.auth.isAuthenticated) {
      throw redirect({ to: '/login', search: { redirect: location.href } });
    }
  },
  component: WorkspaceLayout,
});

/** `/app` itself. Replaced by a real dashboard later. */
export const workspaceIndexRoute = createRoute({
  getParentRoute: () => workspaceRoute,
  path: '/',
  component: WorkspaceHomePage,
});
