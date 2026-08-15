import { toApiError } from '@/api/api-error';
import { setUnauthorizedHandler } from '@/api/auth-session';

import { refresh } from './auth-api';
import { endSession, renewSession } from './auth-store';

/**
 * The `401` seam F01 left in the response interceptor, filled.
 *
 * ## Single-flight, and why it is not an optimisation
 *
 * A screen that fires five queries at once whose access token has just expired
 * gets five `401`s, and each one reaches the interceptor. **They must produce
 * one `POST /auth/refresh`, not five.** The refresh token is single-use: the
 * first call rotates it and the browser's cookie becomes the successor; the
 * second call would present the spent one, which the backend treats as theft —
 * `AUTH_REFRESH_TOKEN_REUSED`, every session of the account revoked, including
 * the legitimate one that is mid-refresh. A missing lock here does not degrade
 * performance, it signs people out.
 *
 * So the in-flight promise is shared. The four latecomers await the same call,
 * see the same answer, and each retries its own request once — that retry cap
 * is the interceptor's `retriedAfterRefresh`, not this module's.
 *
 * ## It never throws
 *
 * The seam's contract is a boolean: `true` means a new access token is in the
 * holder and the original request is worth retrying, `false` means it is not.
 * A rejection here would surface as an error about refreshing on a request the
 * caller made about something else entirely.
 *
 * Note that `false` is **not** the same as "the session is over" — see
 * {@link isSessionOver}. A rate-limited or failed refresh returns `false` and
 * leaves the session standing, because the credential in the cookie is still
 * good and the next request may well succeed with it.
 */

let inFlight: Promise<boolean> | null = null;

/**
 * Whether a refused refresh means the **session** is over, or only that this
 * attempt was.
 *
 * `401` is the session: `AUTH_REFRESH_TOKEN_INVALID` (gone or expired),
 * `AUTH_REFRESH_TOKEN_REUSED` (the family was revoked), `AUTH_INACTIVE_USER`
 * (the account was deactivated). None of those improves by waiting, and the
 * backend clears the cookie on the first two, so there is nothing left to
 * refresh with.
 *
 * **Everything else is a blip and must not sign anybody out.** A `429` from the
 * strict rate-limit tier, a `500` during a deployment, a laptop that slept
 * through a Wi-Fi handover — the refresh token is still valid, the cookie is
 * still in the jar, and the backend deliberately does *not* clear it for these
 * (Feature 040: "signing somebody out because their refresh landed during an
 * incident turns a blip into a support ticket"). Ending the session here would
 * throw away a credential the server still honours, and the person would be
 * asked to type their password because a rate limiter counted to ten.
 *
 * So a blip fails the one request that triggered it — the caller sees a
 * translated error — and the session stays. The next request tries again.
 */
const isSessionOver = (error: unknown): boolean => toApiError(error).status === 401;

const performRefresh = async (): Promise<boolean> => {
  try {
    renewSession(await refresh());

    return true;
  } catch (error) {
    if (isSessionOver(error)) endSession();

    return false;
  }
};

/**
 * Attempts one refresh, or joins the one already running.
 *
 * Exported because the interceptor is not its only caller in principle — a
 * screen that knows its token is about to expire could call it — but nothing
 * does today, and nothing should need to.
 */
export const refreshSession = (): Promise<boolean> => {
  inFlight ??= performRefresh().finally(() => {
    inFlight = null;
  });

  return inFlight;
};

/**
 * Registered at module scope rather than in an effect, deliberately.
 *
 * The handler has to be in place before the *first* request of the page — the
 * boot-time `GET /auth/me`, whose `401` is precisely what triggers the silent
 * refresh that signs a returning person back in. An effect runs after that
 * request has already been made and refused, so the seam would be empty at the
 * one moment it matters most.
 *
 * `session-bootstrap.ts` imports this module for that ordering, and says so.
 */
setUnauthorizedHandler(refreshSession);
