import { createRoute, redirect } from '@tanstack/react-router';

import { publicRoute } from './public.route';

/**
 * `/` — a signpost, not a screen.
 *
 * It used to render a placeholder describing the application's own foundation,
 * which was useful while there was nothing else to look at and became a
 * doorstep somebody has to step over the moment there was. There is no public
 * marketing surface here: this is an internal timesheet, everyone who opens it
 * is either signed in or about to be, and the only two answers to "what is at
 * the root" are the workspace and the login form.
 *
 * So it never renders. `beforeLoad` throws either way, which is the right hook
 * for it: it runs before the component and before any loader, so no placeholder
 * appears for a frame on the way through.
 *
 * The session is known by the time this runs — `AuthGate` holds the router back
 * until `GET /auth/me` has answered — so this never bounces a returning person
 * to `/login` while their refresh cookie was about to sign them in.
 *
 * No `?redirect=` is recorded, deliberately. That parameter exists so the guard
 * on `/app` can return somebody to the screen they actually asked for; `/` is
 * not a screen anybody asked for, and carrying it forward would send them back
 * here after signing in, straight into this redirect again.
 */
export const landingRoute = createRoute({
  getParentRoute: () => publicRoute,
  path: '/',
  beforeLoad: ({ context }) => {
    throw redirect({ to: context.auth.isAuthenticated ? '/app' : '/login' });
  },
});
