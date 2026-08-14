/**
 * The seams the authentication feature plugs into. **Nothing here implements
 * authentication** — it is the in-memory token holder the request interceptor
 * reads, and the place the response interceptor calls when the API answers
 * `401`. Both are deliberately empty until the auth feature fills them.
 *
 * ## Why the access token lives in a module variable
 *
 * Not `localStorage`, not `sessionStorage`, not a cookie readable by script,
 * and never in a URL. Anything a script can read, an injected script can read:
 * a single XSS on any page of this application would otherwise hand an attacker
 * a token they can use from their own machine, and it would survive the tab
 * being closed. A module-level variable dies with the page, which turns "stolen
 * forever" into "stolen for as long as the attacker is already executing in the
 * tab" — a much smaller blast radius for the same convenience.
 *
 * The cost is that a hard refresh loses the session, and the refresh token is
 * what pays it back. That is the auth feature's problem, and the reason
 * {@link setUnauthorizedHandler} exists.
 *
 * The backend's own note on this (Feature 032) is the other half: the refresh
 * token is single-use and rotated, so whatever stores it must *overwrite* it
 * rather than append.
 */

let accessToken: string | null = null;

/** Read by the request interceptor on every call. `null` sends no header. */
export const getAccessToken = (): string | null => accessToken;

/**
 * Called by the auth feature after a login or a refresh, and with `null` on
 * logout. Nothing else should call it.
 */
export const setAccessToken = (token: string | null): void => {
  accessToken = token;
};

/** Convenience for logout and for the failure branch of a refresh. */
export const clearAccessToken = (): void => {
  accessToken = null;
};

/**
 * What the response interceptor does with a `401`.
 *
 * Return `true` to say "I obtained a new access token, retry the original
 * request"; return `false` to say "this session is over" — the interceptor then
 * rejects with the normalised error and the caller shows the login screen.
 *
 * The handler is responsible for **de-duplicating concurrent refreshes**: five
 * queries failing at once must produce one call to `POST /auth/refresh`, not
 * five, because the refresh token is single-use and the second presentation of
 * a spent one is treated as theft (`AUTH_REFRESH_TOKEN_REUSED`) and revokes
 * every session. That is why the seam is a single async function rather than a
 * per-request callback: there is one place to put the shared in-flight promise.
 */
export type UnauthorizedHandler = () => Promise<boolean>;

let unauthorizedHandler: UnauthorizedHandler | null = null;

/**
 * Registered once by the auth feature. Until then the interceptor treats every
 * `401` as final, which is the correct behaviour for an application that cannot
 * yet sign anybody in.
 */
export const setUnauthorizedHandler = (handler: UnauthorizedHandler | null): void => {
  unauthorizedHandler = handler;
};

/** Read by the response interceptor. Not part of the auth feature's surface. */
export const getUnauthorizedHandler = (): UnauthorizedHandler | null => unauthorizedHandler;
