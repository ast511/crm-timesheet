import { Outlet } from '@tanstack/react-router';

import { AppHeader } from '@/components/layout/AppHeader';

/**
 * The outermost shell: a header on every route, and whatever the route renders
 * below it.
 *
 * Public and authenticated screens share it because the two controls in the
 * header — language and light/dark — are equally relevant on a login screen and
 * on a timesheet.
 */
export const RootLayout = () => (
  <div className="flex min-h-dvh flex-col">
    <AppHeader />
    <Outlet />
  </div>
);
