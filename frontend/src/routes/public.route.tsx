import { createRoute } from '@tanstack/react-router';

import { PublicLayout } from '@/app/layout/PublicLayout';

import { rootRoute } from './root.route';

/**
 * The public area, as a **pathless layout route**.
 *
 * `id` and no `path`: it contributes nothing to any URL — `/login` stays
 * `/login` — and exists purely to give its children a shared shell and a shared
 * rule. That is what makes "the public screens follow the system theme and have
 * no theme control" a property of the *tree* rather than of five components
 * that each remember to do it.
 *
 * It is the counterpart of `workspaceRoute`: one route per area, each owning
 * its layout, and — for the authenticated one — its guard. A screen is public
 * or private according to which of the two it hangs off, which is a decision
 * visible in `routeTree.ts` at a glance.
 */
export const publicRoute = createRoute({
  getParentRoute: () => rootRoute,
  id: 'public',
  component: PublicLayout,
});
