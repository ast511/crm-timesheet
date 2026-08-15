import { adoptUser, endSession } from './auth-store';
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
 * If the cookie is gone or spent, the refresh fails, the seam has already
 * called `endSession`, and this rejects — which is the anonymous case, not an
 * error to report. A person arriving at the login screen has not experienced a
 * failure.
 *
 * ## Once, and only once
 *
 * The promise is memoised, so React's StrictMode double-invoking the effect
 * that starts it produces one request rather than two — and, more importantly,
 * so does anything else that decides it needs the session hydrated.
 */

let hydration: Promise<void> | null = null;

const hydrate = async (): Promise<void> => {
  try {
    adoptUser(await fetchCurrentUser());
  } catch {
    endSession();
  }
};

export const ensureSessionHydrated = (): Promise<void> => (hydration ??= hydrate());
