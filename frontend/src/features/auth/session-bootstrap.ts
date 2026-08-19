import {
  adoptUser,
  beginSessionHydration,
  getAuthState,
  markSessionUnknown,
} from './auth-store';
import { fetchCurrentUser } from './auth-api';
// Imported for its side effect: registering the `401` refresh handler on the
// axios interceptor. It must happen before the request below is made, because
// that request's `401` is what the handler exists to answer. Importing the
// module is what guarantees the ordering — see the note at the bottom of it.
import './session-refresh';

/**
 * "Is anybody signed in?", asked once per page load.
 *
 * ## The whole mechanism is one request
 *
 * `GET /api/v1/auth/me` is sent with no access token, because a fresh tab has
 * none — the access token is memory-only and memory did not survive the
 * reload. The backend answers `401`, the interceptor hands that to the refresh
 * seam, the browser attaches the `HttpOnly` cookie to `POST /auth/refresh`
 * without being asked, and if the cookie is still alive the retried `/auth/me`
 * succeeds with a token that did not exist a moment ago.
 *
 * That is the entire "stay signed in across reloads" feature, and it is worth
 * noticing that this module contains no part of it. It asks a question; the
 * interceptor and the cookie answer it.
 *
 * ## Failing is not the same as being signed out
 *
 * This used to end the session on **any** rejection, and the comment explaining
 * why said "the cookie is gone or spent, which is the anonymous case". That is
 * true of one failure and false of every other, and the false ones are the
 * common ones in practice: a rate-limited refresh, a `500` mid-deploy, a backend
 * restarting under a reload, a laptop that slept. In all of those the cookie is
 * still in the jar and the server still honours it — and the person was signed
 * out, on `/login?redirect=…`, for reloading the page.
 *
 * It was also a contradiction inside this feature. `session-refresh.ts` decides
 * exactly this question for a mid-session `401`, at length: *"a blip fails the
 * one request that triggered it and the session stays"*. It calls `endSession`
 * for a `401` and deliberately not for anything else. The blanket `catch` here
 * then overruled it a millisecond later.
 *
 * ## So the decision is read, not repeated
 *
 * The `catch` cannot re-derive it: whatever the refresh answered, the error that
 * arrives here is `/auth/me`'s own `401` — the interceptor rejects with the
 * original failure once the retry is declined. Inspecting it would say `401` for
 * a spent cookie and `401` for a rate limiter, which are the two cases that must
 * be told apart.
 *
 * What *does* distinguish them is already in the store. The refresh seam calls
 * `endSession()` when and only when the session is genuinely over, so:
 *
 * | After the boot request fails | Store says | Meaning |
 * | --- | --- | --- |
 * | The refresh was refused `401` | `anonymous` | Sign in. |
 * | The refresh was refused otherwise | `loading` | Nobody knows. |
 * | No refresh ran (network, `5xx` on `/auth/me`) | `loading` | Nobody knows. |
 *
 * Still `loading` therefore means "nothing decided this", which becomes
 * `unknown`. One rule about what ends a session, in one file, with this one
 * reading it — rather than two files agreeing by coincidence.
 *
 * ## Once, and only once
 *
 * The promise is memoised, so React's StrictMode double-invoking the effect
 * that starts it produces one request rather than two — and, more importantly,
 * so does anything else that decides it needs the session hydrated.
 * {@link retrySessionHydration} is the one thing allowed to clear it.
 */

let hydration: Promise<void> | null = null;

const hydrate = async (): Promise<void> => {
  try {
    adoptUser(await fetchCurrentUser());
  } catch {
    if (getAuthState().status === 'loading') markSessionUnknown();
  }
};

export const ensureSessionHydrated = (): Promise<void> => (hydration ??= hydrate());

/**
 * Asks again, after a boot that could not find out.
 *
 * The memoised promise is dropped — it is holding a settled failure, and
 * returning it would make the retry button do nothing — and the status goes back
 * to `loading`, so the wait looks like the first one rather than leaving the
 * error screen up with a spinner beside it.
 *
 * Reachable only from `AuthGate`'s `unknown` branch. A retry from `anonymous`
 * would be a login attempt with no credentials, and from `authenticated` there
 * is nothing to ask.
 */
export const retrySessionHydration = (): Promise<void> => {
  hydration = null;
  beginSessionHydration();

  return ensureSessionHydrated();
};
