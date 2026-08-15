import { RouterProvider } from '@tanstack/react-router';
import { useEffect, useRef } from 'react';

import { useAuth } from '@/features/auth/useAuth';
import { usePermissions } from '@/features/permissions/usePermissions';

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
 *
 * ## The permission set is the second thing that can change without a click
 *
 * It is watched here for exactly the same reason and corrected by exactly the
 * same call. An administrator demoted mid-session gets a new set — from the
 * `403` re-sync, or from the refetch when they return to the tab — and
 * `router.invalidate()` re-runs `/app`'s `beforeLoad`, which reloads the set
 * into the child context and re-evaluates every `requirePermission` under it.
 * If they are standing on a page they may no longer open, that is the moment
 * they are moved off it.
 *
 * **It is a reference comparison and it depends on `select` memoisation.** The
 * cache holds the raw entity, so TanStack Query's structural sharing keeps the
 * same object when a refetch changes nothing, so `select` is not re-run, so the
 * set below is the same object and nothing is invalidated. Caching a derived
 * `PermissionSet` instead would make every focus refetch a new object and
 * re-run every matched route's loaders for no change — the argument is in
 * `permissions-query.ts`, and this comparison is what it is protecting.
 *
 * ## And it is where the query's one permanent observer lives
 *
 * `usePermissions()` is called here, above every screen, so exactly one
 * observer exists for as long as somebody is signed in. Route guards populate
 * the cache through `ensureQueryData`, which observes nothing — and
 * `refetchOnWindowFocus` only fires for an observed query. Without this call
 * the proactive half of the re-sync would quietly not happen.
 */
export const AppRouter = () => {
  const auth = useAuth();
  const { permissions } = usePermissions();
  const previous = useRef({ auth, permissions });

  useEffect(() => {
    if (previous.current.auth === auth && previous.current.permissions === permissions) return;

    previous.current = { auth, permissions };
    void router.invalidate();
  }, [auth, permissions]);

  return <RouterProvider router={router} context={{ auth }} />;
};
