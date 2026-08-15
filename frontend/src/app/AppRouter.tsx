import { RouterProvider } from '@tanstack/react-router';
import { useEffect, useRef } from 'react';

import { useAuth } from '@/features/auth/useAuth';

import { router } from './router';

/**
 * The router, with the session pushed into its context.
 *
 * ## Two mechanisms, because one is not enough
 *
 * `<RouterProvider context={{ auth }}>` keeps the *value* the guards read up to
 * date. It does not, on its own, make a guard run again — `beforeLoad` is
 * evaluated when a navigation happens, and a session ending is not a
 * navigation. Without the second half, an access token whose refresh was
 * refused would leave the person sitting on a protected screen holding no
 * credentials, until they clicked something.
 *
 * `router.invalidate()` is that second half: it re-evaluates the matched
 * routes, the guard on `/app` sees `isAuthenticated: false`, throws its
 * redirect, and the person lands on `/login` with `?redirect=` pointing back at
 * where they were. It runs on a *change* — the ref, rather than the effect's
 * dependency array alone, is what keeps it from firing on the first render,
 * when there is nothing to re-evaluate and the router has only just mounted.
 *
 * The store hands out the same object identity between mutations, so this
 * compares snapshots rather than fields.
 */
export const AppRouter = () => {
  const auth = useAuth();
  const previousAuth = useRef(auth);

  useEffect(() => {
    if (previousAuth.current === auth) return;

    previousAuth.current = auth;
    void router.invalidate();
  }, [auth]);

  return <RouterProvider router={router} context={{ auth }} />;
};
