import { createRoute, redirect } from '@tanstack/react-router';

import { WorkspaceLayout } from '@/app/layout/WorkspaceLayout';
import { WorkspaceHomePage } from '@/app/pages/WorkspaceHomePage';
import { loadEffectivePermissions } from '@/features/permissions/permissions-query';
import { loadProfile } from '@/features/profile/profile-query';

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
 * ## It also loads the permissions, and hands them down (F04)
 *
 * The second half of `beforeLoad` resolves the effective permission set and
 * **returns it**, which TanStack Router merges into the context of every child.
 * So a child route gating on a permission (`requirePermission(…)`) is
 * synchronous and can never see a half-loaded set — the parent has already
 * awaited it.
 *
 * That ordering is the whole design. Awaiting here rather than reading a
 * snapshot pushed in from React removes the race that would otherwise decide
 * every navigation made before the first fetch answers: at the moment somebody
 * signs in, the query cache has just been cleared and the set is not there yet,
 * so a guard reading a live snapshot would refuse a page the person is
 * perfectly entitled to. It is the same class of mistake `AuthGate` exists to
 * prevent for the session, solved the way the router offers rather than by
 * holding the whole application back a second time.
 *
 * The cost is bounded: `ensureQueryData` is a cache read once the set is
 * loaded, so this is one request per session, and usually zero by the time a
 * guard asks — `AppRouter` mounts an observer as soon as somebody is
 * authenticated, which normally starts the request first.
 *
 * `context.auth.user` is non-null here because the check above threw
 * otherwise; the guard clause below states that for the compiler rather than
 * asserting it.
 */
export const workspaceRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/app',
  beforeLoad: async ({ context, location }) => {
    if (!context.auth.isAuthenticated || context.auth.user === null) {
      throw redirect({ to: '/login', search: { redirect: location.href } });
    }

    /*
     * The profile is awaited beside the permissions, and for a related reason.
     *
     * It carries the username the header shows and the palette and corner
     * radius the whole application is painted with, so a shell that mounted
     * before it arrived would render an address for one frame and a name the
     * next, in the default theme and then the chosen one. Both are `ensureQueryData`,
     * so this is one request each per session and a cache read thereafter.
     *
     * Only the permissions are returned as context: a route guard has a reason
     * to read them, and nothing gates on a profile. The theme and the header
     * read it through `useProfile`, from the same cache entry this filled.
     */
    const [permissions] = await Promise.all([
      loadEffectivePermissions(context.queryClient, context.auth.user.id),
      loadProfile(context.queryClient, context.auth.user.id),
    ]);

    return { permissions };
  },
  component: WorkspaceLayout,
});

/** `/app` itself. Replaced by a real dashboard later. */
export const workspaceIndexRoute = createRoute({
  getParentRoute: () => workspaceRoute,
  path: '/',
  component: WorkspaceHomePage,
});
