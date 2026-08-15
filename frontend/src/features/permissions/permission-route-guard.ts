import { redirect } from '@tanstack/react-router';

import type { PermissionRequirement, PermissionSet } from './permission-set';

/**
 * Permission gating for routes, composed **on top of** the authentication
 * guard rather than instead of it.
 *
 * ## The two-layer arrangement
 *
 * `workspaceRoute` (`/app`) checks the session and then loads the effective
 * set, returning it as route context. Everything below it therefore has a
 * `context.permissions` that is *already resolved* — the guard here is
 * synchronous and cannot see a half-loaded state, because the parent awaited
 * it. A route declares what it needs and nothing else:
 *
 * ```ts
 * export const reportsRoute = createRoute({
 *   getParentRoute: () => workspaceRoute,
 *   path: '/reports',
 *   beforeLoad: requirePermission({ permission: 'REPORTS.PAGE_ACCESS' }),
 *   component: ReportsPage,
 * });
 * ```
 *
 * Auth first, then permission, is not a stylistic ordering. A signed-out person
 * has no set to check and asking for one would send an unauthenticated request;
 * they belong at `/login`, which is where the parent's guard has already thrown
 * them by the time this runs.
 *
 * ## Where a refused route goes, and why it is a screen
 *
 * `/app/not-authorized`, not a silent bounce to the dashboard.
 *
 * A redirect to somewhere that works is the friendlier-looking option and is
 * the wrong one here, because the two ways somebody arrives at a route they
 * cannot open both need explaining. A colleague sends a link to a report:
 * landing on the dashboard makes the *link* look broken, and the natural next
 * message is "it just goes to the home page for me" rather than "I need
 * access". An administrator changes what somebody may do mid-session: being
 * moved with no account of why reads as the application losing their place.
 *
 * The screen says which permission was missing and offers the way back. It
 * costs one extra click for the person who wanted the dashboard anyway, and it
 * is the only version that produces a sentence they can repeat to whoever can
 * grant the permission.
 *
 * ## None of this is enforcement
 *
 * The backend's `PermissionsGuard` (Feature 035) refuses the request; this
 * decides whether to offer the navigation. Deleting every line of it would make
 * screens reachable and every call they make answer `403`.
 */

/**
 * What the guard needs from the route context.
 *
 * Declared structurally rather than imported from the route tree, so this
 * module does not depend on the routes that depend on it. Any context carrying
 * a resolved `permissions` satisfies it, which is what makes the returned
 * function assignable to `beforeLoad` on a child of `/app`.
 */
export interface PermissionGuardArgs {
  context: { permissions: PermissionSet };
}

/**
 * The keys a refusal names, for the not-authorized screen.
 *
 * Every key mentioned by the requirement, in the order the requirement lists
 * them — including the `anyOf` alternatives, because "you need one of these"
 * is a more useful sentence than naming an arbitrary one of them. Joined by
 * `,` to survive a URL without encoding surprises.
 *
 * It is the *route's own requirement*, which is safe to publish and which the
 * backend already returns in `params.requiredPermissions` on a real `403`. What
 * is never put in a URL is the person's effective set — that would turn a
 * refusal into a map of what they can still reach.
 */
const describeRequirement = ({ permission, allOf, anyOf }: PermissionRequirement): string =>
  [...(permission === undefined ? [] : [permission]), ...(allOf ?? []), ...(anyOf ?? [])].join(',');

/**
 * Builds the `beforeLoad` for a route that needs a permission.
 *
 * Takes the same {@link PermissionRequirement} as `<Can>` and `useCan`, and
 * answers it with the same `satisfies` — so a route and the menu item that
 * links to it cannot disagree about what "ALL" means, and gating both is one
 * requirement written twice rather than two rules written once each.
 */
export const requirePermission =
  (requirement: PermissionRequirement) =>
  ({ context }: PermissionGuardArgs): void => {
    if (context.permissions.satisfies(requirement)) return;

    throw redirect({
      to: '/app/not-authorized',
      search: { required: describeRequirement(requirement) },
      /**
       * The refused URL does not become a history entry, so the back button
       * returns to where the person actually was rather than bouncing them
       * through the refusal again.
       */
      replace: true,
    });
  };
