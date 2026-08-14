import { createRoute } from '@tanstack/react-router';

import { LandingPage } from '@/app/pages/LandingPage';

import { rootRoute } from './root.route';

/** `/` — public, and the only route that will stay public besides sign-in. */
export const landingRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/',
  component: LandingPage,
});
