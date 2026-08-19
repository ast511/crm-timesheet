import { queryOptions, type QueryClient } from '@tanstack/react-query';

import { fetchMyProfile, type Profile } from './profile-api';

/**
 * The signed-in person's profile as server state.
 *
 * Two very different things ride on this one query — the name shown in the
 * header, and the palette and corner radius the whole application is painted
 * with — and they share it because the backend publishes them together and
 * calling twice would be two requests for one answer.
 */

export const PROFILE_QUERY_KEY = ['profile', 'me'] as const;

/**
 * Long, and deliberately so.
 *
 * Unlike the permission set, this is **the caller's own record, changed only by
 * the caller**. There is no third party who can make it stale behind somebody's
 * back — an administrator editing an account edits the fields on `/users`, and
 * the two preferences here are not among them. So there is nothing to poll for
 * and nothing to correct on focus; the mutation writes the server's own
 * response straight back into the cache, which is the only way this value
 * changes within a session.
 */
const PROFILE_STALE_TIME_MS = 5 * 60_000;

/**
 * The query, keyed to the account for the same reason F04's set is: a profile
 * belonging to somebody else is then a **different query** rather than a stale
 * entry, and cannot be served to the wrong person however the cache happens to
 * be arranged when a session changes.
 */
export const profileQueryOptions = (userId: string) =>
  queryOptions({
    queryKey: [...PROFILE_QUERY_KEY, userId],
    queryFn: fetchMyProfile,
    staleTime: PROFILE_STALE_TIME_MS,
  });

/**
 * Loads the profile for a route guard, or returns the one already cached.
 *
 * `workspaceRoute` awaits this beside the permission set, which is what stops
 * the header from rendering an address for one frame and a username the next:
 * by the time the shell mounts, the answer is in the cache. It costs one
 * request per session — `ensureQueryData` is a cache read thereafter.
 */
export const loadProfile = (queryClient: QueryClient, userId: string): Promise<Profile> =>
  queryClient.ensureQueryData(profileQueryOptions(userId));
