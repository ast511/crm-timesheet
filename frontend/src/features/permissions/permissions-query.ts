import { queryOptions, type QueryClient } from '@tanstack/react-query';

import { fetchMyEffectivePermissions, type EffectivePermissions } from './permissions-api';
import { toPermissionSet, type PermissionSet } from './permission-set';

/**
 * The effective permission set as server state, with a freshness policy chosen
 * for what it is: a small, cheap answer that another person can change without
 * this tab being told.
 */

/**
 * The prefix everything shares, so the re-sync can invalidate the set without
 * knowing whose it is.
 */
export const EFFECTIVE_PERMISSIONS_QUERY_KEY = ['permissions', 'me', 'effective'] as const;

/**
 * Shorter than the application-wide thirty seconds would be pointless and
 * longer would be the stale menu this feature exists to avoid.
 *
 * The number is a *ceiling on how long a change goes unnoticed by a tab nobody
 * is touching* — and it is not the mechanism that matters. The two paths that
 * actually correct a demotion are the `403` re-sync (immediate, and triggered
 * by the very request that proves the set is wrong) and the focus refetch
 * (immediate, on the action a person performs before they do anything else).
 * This only bounds the third case: a tab left open and in the foreground while
 * an administrator changes something. A minute of a wrong menu there costs one
 * refused request and a toast.
 *
 * It is deliberately not a poll. Sixty seconds of `staleTime` is not a sixty-
 * second interval — nothing refetches until something asks, and TanStack Query
 * has no timer here.
 */
const PERMISSIONS_STALE_TIME_MS = 60_000;

/**
 * The query, keyed to the account.
 *
 * ## Why the user id is in the key
 *
 * `startSession` clears the whole cache at login, so in practice one person's
 * set can never be read by the next. The id is in the key anyway, as the
 * structural version of that guarantee rather than a consequence of a line in
 * another file: with it, a set belonging to somebody else is not a stale entry
 * to be invalidated, it is a **different query** that no amount of forgetting
 * to clear can serve to the wrong person.
 *
 * ## The cache holds the raw entity; `select` derives the set
 *
 * Deriving inside the `queryFn` would be tidier to read and would break the
 * thing this feature depends on most. TanStack Query's **structural sharing**
 * keeps the previous object when a refetch returns identical JSON, and that
 * preserved identity is the signal `AppRouter` uses to decide whether the
 * router needs re-evaluating. Structural sharing cannot see through a value
 * containing functions, so a cached `PermissionSet` would be a brand-new object
 * on every refetch — and every focus refetch, of which there is one per
 * alt-tab, would invalidate the router and re-run the loaders of every matched
 * route for a set that had not changed.
 *
 * With the entity cached, an unchanged refetch is a no-op all the way through:
 * same data identity, so `select` is not re-run, so the set handed to
 * `AppRouter` is the same object, so nothing is invalidated. `select` is a
 * module-level function and therefore a stable reference, which is what makes
 * that memoisation hold.
 *
 * The route guard reads the entity through `ensureQueryData` — which returns
 * cached data and never applies `select` — and derives its own set in
 * {@link loadEffectivePermissions}. One extra `Set` per navigation, against a
 * semantics that is identical because both call the same `toPermissionSet`.
 */
export const effectivePermissionsQueryOptions = (userId: string) =>
  queryOptions({
    queryKey: [...EFFECTIVE_PERMISSIONS_QUERY_KEY, userId],
    queryFn: ({ signal }) => fetchMyEffectivePermissions(signal),
    select: toPermissionSet,
    staleTime: PERMISSIONS_STALE_TIME_MS,
    /**
     * On, against the application-wide default of off.
     *
     * `query-client.ts` turns focus refetching off for good reasons that do not
     * apply here: it is arguing about *lists*, where a burst of refetches every
     * time somebody alt-tabs is a lot of traffic for data a colleague rarely
     * edits underneath you. This is one small request, and the thing it guards
     * against — an administrator changing what somebody may do while their tab
     * sat in the background — is the case the whole feature is about. Coming
     * back to the tab is the moment before a person acts, which makes it
     * exactly the right moment to have corrected the menu.
     *
     * It only fires while something is *observing* the query, which is why
     * `AppRouter` keeps one mounted for the life of the session rather than
     * leaving the cache to be populated by route guards alone.
     */
    refetchOnWindowFocus: true,
  });

/**
 * Loads the set for a route guard, or returns the one already cached.
 *
 * `ensureQueryData` rather than a bare fetch: it is a cache read when the entry
 * is fresh, joins the request already in flight when one is, and fetches only
 * when there is nothing. So the first navigation into `/app` costs one request
 * and every navigation after it costs none — and the observer `AppRouter`
 * mounts has usually started that request before any guard asks.
 */
export const loadEffectivePermissions = async (
  queryClient: QueryClient,
  userId: string,
): Promise<PermissionSet> =>
  toPermissionSet(await queryClient.ensureQueryData(effectivePermissionsQueryOptions(userId)));

/** The cached entity for whoever is signed in, or `undefined` if there is none. */
export const readCachedEffectivePermissions = (
  queryClient: QueryClient,
  userId: string,
): EffectivePermissions | undefined =>
  queryClient.getQueryData(effectivePermissionsQueryOptions(userId).queryKey);

/**
 * Refetches the set, and resolves once the answer is in the cache.
 *
 * The re-sync's half of the reactive path, with two choices worth stating.
 *
 * It invalidates **by prefix**, because the caller is reacting to a refused
 * request and knows nothing about whose session made it. Only one account's
 * entry can be under that prefix at a time — the key carries the user id and
 * login clears the cache — so the prefix names exactly one query in practice.
 *
 * `refetchType: 'all'` rather than the default `'active'`, because the caller
 * needs the *result*: it compares the set before and after to decide whether
 * anything actually changed, and under the default an entry nothing happens to
 * be observing would be marked stale, refetched at some later moment, and
 * report "no change" now. There is one observer for the life of the session, so
 * this is belt to that braces — but the belt is what the comparison rests on.
 */
export const invalidateEffectivePermissions = (queryClient: QueryClient): Promise<void> =>
  queryClient.invalidateQueries({
    queryKey: EFFECTIVE_PERMISSIONS_QUERY_KEY,
    refetchType: 'all',
  });
