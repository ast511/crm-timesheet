import { useQuery } from '@tanstack/react-query';

import { useAuth } from '@/features/auth/useAuth';

import { effectivePermissionsQueryOptions } from './permissions-query';
import {
  EMPTY_PERMISSION_SET,
  type PermissionRequirement,
  type PermissionSet,
} from './permission-set';

export interface UsePermissionsResult {
  /** Never `undefined`. {@link EMPTY_PERMISSION_SET} while there is nothing. */
  permissions: PermissionSet;
  /**
   * The set is being fetched for a signed-in person and nothing is cached yet.
   *
   * Distinct from "the set is empty": a screen that renders a menu should show
   * a skeleton for this rather than an empty menu that fills in a moment later,
   * which reads as a permission problem for as long as it lasts. Always `false`
   * when nobody is signed in — there is nothing to wait for.
   */
  isLoading: boolean;
}

/**
 * The effective permission set, for components.
 *
 * ```tsx
 * const { permissions } = usePermissions();
 * if (permissions.has('TIMESHEET.APPROVE')) …
 * ```
 *
 * ## It grants nothing when nobody is signed in
 *
 * The empty set is returned for an anonymous session **without consulting the
 * cache**, and that is the guarantee against a set leaking across sessions —
 * not the cache housekeeping around it. A signed-out tab cannot render a
 * permitted control however the query cache happens to be arranged, and it does
 * not have to be reasoned about alongside `queryClient.clear()`, the user-scoped
 * key, or the order in which sign-out does its two jobs.
 *
 * ## It owns the query, which is not incidental
 *
 * `refetchOnWindowFocus` only fires for a query something is observing. Route
 * guards populate the cache through `ensureQueryData`, which observes nothing —
 * so if this hook were only ever called by a screen that happens to be mounted,
 * the proactive half of the re-sync would work on some pages and not others.
 * `AppRouter` calls it once for the life of the session so there is always
 * exactly one observer, and every other caller shares that entry.
 */
export const usePermissions = (): UsePermissionsResult => {
  const { user, isAuthenticated } = useAuth();

  const { data, isPending } = useQuery({
    ...effectivePermissionsQueryOptions(user?.id ?? ''),
    enabled: isAuthenticated && user !== null,
  });

  if (!isAuthenticated) {
    return { permissions: EMPTY_PERMISSION_SET, isLoading: false };
  }

  return { permissions: data ?? EMPTY_PERMISSION_SET, isLoading: isPending };
};

/**
 * One requirement, one boolean — the hook behind `<Can>` and the thing to call
 * when a component needs the answer rather than a wrapper.
 *
 * ```tsx
 * const canApprove = useCan({ permission: 'TIMESHEET.APPROVE' });
 * <Button disabled={!canApprove || isPending}>…</Button>
 * ```
 *
 * Semantics — `ALL` versus `ANY`, and the empty cases — are documented once on
 * {@link PermissionRequirement} and implemented once in `permission-set.ts`.
 * This adds nothing to them.
 *
 * **A `true` here is a statement about the menu, not about safety.** The
 * backend's `PermissionsGuard` (Feature 035) is what actually refuses the
 * request; this decides whether to offer the door. A screen must still handle
 * the `403` that arrives when the two disagree, which is the whole subject of
 * `permission-resync.ts`.
 */
export const useCan = (requirement: PermissionRequirement): boolean => {
  const { permissions } = usePermissions();

  return permissions.satisfies(requirement);
};
