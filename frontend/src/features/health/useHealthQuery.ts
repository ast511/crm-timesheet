import { useSuspenseQuery } from '@tanstack/react-query';

import { apiGet, type ApiResult } from '@/api/client';

/** The response shape, derived from the contract rather than written down. */
export type HealthStatus = ApiResult<'/api/v1/health', 'get'>;

export const healthQueryKey = ['health'] as const;

/**
 * The smoke test for the whole API stack, and the pattern every later feature
 * copies.
 *
 * One call exercises all four layers: the path and the response type come from
 * the generated OpenAPI types, the request goes through the app's axios
 * instance and its interceptors, TanStack Query caches it, and `signal` wires
 * React Query's cancellation through to axios so a superseded request is
 * actually aborted rather than merely ignored.
 *
 * `useSuspenseQuery` rather than `useQuery`: the component suspends into a
 * skeleton boundary instead of branching on an `isLoading` flag, which is the
 * loading pattern this project uses for content with a known shape.
 *
 * `GET /api/v1/health` is public, so this proves the transport without needing
 * a session — which is what makes it a usable smoke test before the
 * authentication feature exists.
 */
export const useHealthQuery = () =>
  useSuspenseQuery({
    queryKey: healthQueryKey,
    queryFn: ({ signal }) => apiGet('/api/v1/health', { signal }),
  });
