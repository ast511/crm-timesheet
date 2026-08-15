import { Outlet } from '@tanstack/react-router';

/**
 * The outermost shell: the page's vertical box, and nothing else.
 *
 * It used to render a header for every route. It no longer renders one at all,
 * because there is no longer one header — `PublicLayout` and `WorkspaceLayout`
 * each bring their own, and they differ in what they may offer somebody who is
 * not signed in. What is genuinely common to every screen in the application is
 * this: a full-height column that a sticky header can sit at the top of and a
 * `flex-1` main can fill.
 */
export const RootLayout = () => (
  <div className="flex min-h-dvh flex-col">
    <Outlet />
  </div>
);
