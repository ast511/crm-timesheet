import { useMutation } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';

import {
  activateAccount,
  forgotPassword,
  login,
  logout,
  resetPassword,
  type AuthSession,
  type LoginCredentials,
} from './auth-api';
import { endSession, startSession } from './auth-store';

/**
 * The five things a person can do to a session, as TanStack Query mutations.
 *
 * They are mutations rather than bare `async` calls for what the hook gives a
 * form for free and correctly: `isPending` for the submit button, `error` for
 * the alert, and — from `query-client.ts` — `retry: false`, which matters more
 * here than anywhere else in the application. A retried `POST /auth/login` is a
 * second attempt against a strictly rate-limited endpoint, and a retried
 * `POST /auth/refresh` presents a spent single-use token.
 *
 * None of them catches its own error. The form renders it, translated by
 * `errorCode` through `useApiErrorMessage`.
 */

/**
 * Sign in.
 *
 * The response carries the access token and the account; the refresh token
 * arrives as a `Set-Cookie` this code never sees and could not read if it
 * tried. `startSession` is what puts the session in memory — and what clears
 * the query cache, because this is the moment a different person can begin
 * using the tab.
 *
 * Navigation is the caller's, not this hook's: where to go afterwards depends
 * on the `?redirect=` the guard recorded, which is a routing concern.
 */
export const useLoginMutation = () =>
  useMutation<AuthSession, unknown, LoginCredentials>({
    mutationFn: login,
    onSuccess: startSession,
  });

/**
 * Sign out, and mean it locally whatever the server says.
 *
 * `onSettled` rather than `onSuccess` is the whole design of this hook. The
 * request revokes the refresh token and clears the cookie, which is worth
 * doing and worth waiting for — but if it fails because the network is down,
 * the person still asked to sign out, and leaving them signed in on a machine
 * they are walking away from is the wrong way to be wrong. The local session
 * ends either way; the server-side one is cleaned up when it can be.
 *
 * The backend answers `200` even with no cookie, so the ordinary "my refresh
 * token expired overnight" case is a clean sign-out rather than an error.
 */
export const useLogout = () => {
  const navigate = useNavigate();

  return useMutation({
    mutationFn: logout,
    onSettled: () => {
      endSession();
      void navigate({ to: '/login', replace: true });
    },
  });
};

/**
 * Ask for a reset link.
 *
 * The backend answers the same fixed message for an address that exists, one
 * that does not, and one belonging to a disabled account. The UI must not
 * undo that by rendering anything derived from the outcome — see
 * `ForgotPasswordForm`.
 */
export const useForgotPasswordMutation = () => useMutation({ mutationFn: forgotPassword });

/** Set a new password from an emailed link. Every session of the account ends. */
export const useResetPasswordMutation = () => useMutation({ mutationFn: resetPassword });

/**
 * Set the first password on an invited account.
 *
 * Answers `data: null` rather than a session, deliberately on the backend's
 * part: activating does not sign the person in, because a link forwarded to the
 * wrong mailbox would then hand over a live session instead of a password
 * prompt. So this page ends at the login screen, not at the dashboard.
 */
export const useActivateAccountMutation = () => useMutation({ mutationFn: activateAccount });
