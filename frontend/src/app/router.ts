import { createRouter } from '@tanstack/react-router';

import { queryClient } from '@/api/query-client';
import { getAuthState } from '@/features/auth/auth-store';
import { routeTree } from '@/routes/routeTree';

/**
 * The application's router.
 *
 * `context` is what guards and loaders receive. It carries the query client and
 * the session; the effective permissions join it when that feature exists — see
 * `src/routes/root.route.tsx`.
 *
 * The `auth` given here is the snapshot at module load, which is always
 * `status: 'loading'`. It exists to satisfy the context's type, not to be read:
 * `AppRouter` overrides it with the live one on every render, and nothing
 * mounts the router until the session is actually known.
 *
 * `defaultPreload: 'intent'` starts loading a route when the pointer settles on
 * a link, which on an internal application over a LAN removes most of the
 * perceptible delay for the cost of a request that is usually about to happen
 * anyway.
 */
export const router = createRouter({
  routeTree,
  context: { queryClient, auth: getAuthState() },
  defaultPreload: 'intent',
});

/** Makes `<Link to="…">` and `useNavigate()` typed against this exact tree. */
declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router;
  }
}
