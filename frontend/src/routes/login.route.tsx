import { createRoute, redirect } from '@tanstack/react-router';

import { LoginPage } from '@/app/pages/LoginPage';
import { toInternalPath } from '@/lib/redirect';

import { publicRoute } from './public.route';

export interface LoginSearch {
  /** Where to go after signing in. Recorded by the guard on `/app`. */
  redirect?: string;
}

/**
 * `/login` — public, and the only route besides the landing page that stays so.
 *
 * ## `validateSearch` is a sanitiser, not a parser
 *
 * `?redirect=` arrives from a URL anybody can edit and ends in a `navigate`
 * call, which is the open-redirect shape. `toInternalPath` keeps only paths
 * inside this application and drops everything else to `undefined`, so a
 * doctored link produces the dashboard rather than somebody else's convincing
 * copy of this login form. Doing it here rather than in the page means the
 * value is already safe everywhere the router hands it out.
 *
 * ## Signing in twice
 *
 * An authenticated person who reaches `/login` — a bookmark, the back button —
 * is sent where they were going instead of being shown a form for a session
 * they already have. `beforeLoad` is where that belongs: it runs before the
 * component, so the form never renders for a frame.
 */
export const loginRoute = createRoute({
  getParentRoute: () => publicRoute,
  path: '/login',
  validateSearch: (search: Record<string, unknown>): LoginSearch => {
    const target = toInternalPath(search.redirect);

    return target === undefined ? {} : { redirect: target };
  },
  beforeLoad: ({ context, search }) => {
    if (!context.auth.isAuthenticated) return;

    if (search.redirect === undefined) throw redirect({ to: '/app' });

    throw redirect({ href: search.redirect });
  },
  /*
   * The route reads its own search parameter and hands the page a prop.
   *
   * One line, and it buys two things: `LoginPage` never has to name a route —
   * the id here is `/public/login`, which is not a URL and would read as a bug
   * in a page — and `loginRoute` is touched only at render time, so the page
   * and the route can import each other with no initialisation order to think
   * about. Inline rather than a named component so this file keeps exporting
   * exactly one thing, which is what Fast Refresh asks of it.
   */
  component: () => <LoginPage redirectTo={loginRoute.useSearch().redirect} />,
});
