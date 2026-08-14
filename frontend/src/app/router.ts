import { createRouter } from '@tanstack/react-router';

import { queryClient } from '@/api/query-client';
import { routeTree } from '@/routes/routeTree';

/**
 * The application's router.
 *
 * `context` is what guards and loaders receive. It carries the query client
 * today and will carry the session and the effective permissions once those
 * features exist — see `src/routes/root.route.tsx`.
 *
 * `defaultPreload: 'intent'` starts loading a route when the pointer settles on
 * a link, which on an internal application over a LAN removes most of the
 * perceptible delay for the cost of a request that is usually about to happen
 * anyway.
 */
export const router = createRouter({
  routeTree,
  context: { queryClient },
  defaultPreload: 'intent',
});

/** Makes `<Link to="…">` and `useNavigate()` typed against this exact tree. */
declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router;
  }
}
