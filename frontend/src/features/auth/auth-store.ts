import { clearAccessToken, setAccessToken } from '@/api/auth-session';
import { queryClient } from '@/api/query-client';

import type { AuthSession, AuthUser } from './auth-api';

/**
 * The session, in memory, as an external store.
 *
 * ## Why a store and not a React context
 *
 * The session has **two** writers and only one of them is a component. The
 * axios response interceptor renews it after a silent refresh and ends it when
 * a refresh is refused, and an interceptor is a module — it cannot call a
 * setter that lives inside a provider, and giving it one through a ref would be
 * a context whose value is written from outside React anyway.
 *
 * So the state lives here, in module scope beside the access token it travels
 * with, and React subscribes to it through `useSyncExternalStore`
 * (`useAuth.ts`). That is the same shape `theme/` already uses for the system
 * colour scheme, and for the same reason: this is genuinely external state.
 *
 * Nothing is persisted. The access token is a module variable for the reasons
 * `api/auth-session.ts` sets out at length, and the user object beside it would
 * be a stale copy of an account whose role may have changed — a reload asks
 * `GET /auth/me` instead, which is a request, not a guess.
 */

export type AuthStatus =
  /** The boot-time `GET /auth/me` has not answered yet. Nothing is known. */
  | 'loading'
  /** There is an access token and an account behind it. */
  | 'authenticated'
  /** There is no session, and asking again would not produce one. */
  | 'anonymous'
  /**
   * The boot request failed for a reason that is **not** "the session is over",
   * so whether anybody is signed in is genuinely unknown.
   *
   * The distinction from `anonymous` is the whole point of this state, and it is
   * the difference between two sentences the application can say: *"you are
   * signed out"* and *"I could not find out"*. A rate-limited refresh, a `500`
   * during a deploy, a backend restarting under a reload, a laptop that slept
   * through a Wi-Fi handover — in every one of those the refresh cookie is still
   * in the jar and the server still honours it. Calling that `anonymous` throws
   * away a live credential and asks somebody to type their password because
   * something hiccuped.
   *
   * `session-refresh.ts` already draws this line for a mid-session `401` and
   * argues it at length. This state is the same line drawn at boot, where until
   * now it was not.
   *
   * It is **terminal until somebody retries**: `AuthGate` renders an explanation
   * with a retry rather than the login screen, and no route is mounted, so
   * nothing downstream has to know this state exists.
   */
  | 'unknown';

export interface AuthState {
  readonly status: AuthStatus;
  readonly user: AuthUser | null;
  /**
   * Precomputed rather than derived by every consumer, so the snapshot object
   * `useSyncExternalStore` hands React keeps a stable identity — a `useAuth`
   * that built `{ ...state, isAuthenticated }` on each render would produce a
   * new object every time and re-render everything subscribed to it.
   */
  readonly isAuthenticated: boolean;
}

const ANONYMOUS: AuthState = { status: 'anonymous', user: null, isAuthenticated: false };
const PENDING: AuthState = { status: 'loading', user: null, isAuthenticated: false };
const UNKNOWN: AuthState = { status: 'unknown', user: null, isAuthenticated: false };

let state: AuthState = PENDING;

const listeners = new Set<() => void>();

const setState = (next: AuthState): void => {
  state = next;
  for (const listener of listeners) listener();
};

/** For `useSyncExternalStore`. Returns the unsubscribe function it expects. */
export const subscribeToAuth = (listener: () => void): (() => void) => {
  listeners.add(listener);

  return () => {
    listeners.delete(listener);
  };
};

/** The current snapshot. Stable between mutations, which the hook relies on. */
export const getAuthState = (): AuthState => state;

/**
 * A **new** session, from `POST /auth/login`.
 *
 * This is the one transition that clears the query cache, and it is the right
 * one: it is the only moment a different person can start using the same tab.
 * Doing it here rather than on sign-out means no protected screen is ever
 * looking at a cache that vanishes underneath it — at login the only thing
 * mounted is the login form.
 */
export const startSession = (session: AuthSession): void => {
  queryClient.clear();
  setAccessToken(session.accessToken);
  setState({ status: 'authenticated', user: session.user, isAuthenticated: true });
};

/**
 * The **same** session with a fresh access token, from `POST /auth/refresh`.
 *
 * The cache is deliberately kept: a rotation happens roughly every fifteen
 * minutes and throwing away every list on each one would turn an invisible
 * mechanism into a visible stutter. The user is taken from the response
 * regardless, because a refresh returns the current account and a role may have
 * changed since login.
 */
export const renewSession = (session: AuthSession): void => {
  setAccessToken(session.accessToken);
  setState({ status: 'authenticated', user: session.user, isAuthenticated: true });
};

/**
 * The account behind an access token that already exists — the answer to the
 * boot-time `GET /auth/me`, which returns the user but no token.
 */
export const adoptUser = (user: AuthUser): void => {
  setState({ status: 'authenticated', user, isAuthenticated: true });
};

/**
 * There is no session: signed out, refused refresh, or a boot that found
 * nothing. Idempotent, because more than one path reaches it for one event —
 * a refused refresh ends the session inside the interceptor and then rejects
 * the original request, whose caller ends it again.
 */
export const endSession = (): void => {
  clearAccessToken();

  if (state.status !== 'anonymous') setState(ANONYMOUS);
};

/**
 * The boot request failed and **nobody knows** whether there is a session.
 *
 * Deliberately not a variant of {@link endSession}: it does not clear the access
 * token, because a blip is not a reason to throw one away, and it does not claim
 * the person is signed out. See {@link AuthStatus} for which failures reach here
 * and `session-bootstrap.ts` for how they are told apart.
 */
export const markSessionUnknown = (): void => {
  if (state.status !== 'unknown') setState(UNKNOWN);
};

/**
 * Back to not knowing yet — what a retry of the boot request starts from.
 *
 * `AuthGate` shows its spinner for `loading`, so this is what makes a retry look
 * like the first attempt instead of leaving the error screen up while the
 * request runs.
 */
export const beginSessionHydration = (): void => {
  if (state.status !== 'loading') setState(PENDING);
};
