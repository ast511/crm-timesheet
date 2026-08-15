import type { ApiError } from './api-error';

/**
 * The `403` seam, beside the `401` one in `auth-session.ts` and deliberately
 * not inside it.
 *
 * The two look alike and mean opposite things. A `401` says the *credential* is
 * missing or spent, and the handler's job is to obtain a new one and report
 * whether the original request is worth retrying — the interceptor waits for
 * that answer. A `403` says the credential is perfectly good and the **account**
 * is not allowed: nothing can be retried, the request has finished failing, and
 * the only useful reaction is to bring the client's picture of what this person
 * may do back into line with the server's.
 *
 * So this handler returns nothing and is never awaited. See `http.ts` for why
 * delaying the rejection to wait for it would be paying a round trip to change
 * an outcome that is already decided.
 *
 * Nothing here knows about permissions. It is the place the permissions feature
 * plugs into, exactly as `setUnauthorizedHandler` is the place the auth feature
 * plugs into, and until something registers a handler every `403` falls
 * straight through to the normaliser.
 */

/**
 * What the response interceptor does with a `403`.
 *
 * Called with the normalised error so the handler can branch on `errorCode`
 * without re-deriving it — `AUTHORIZATION_PERMISSION_DENIED` is a stale
 * permission set; `AUTHORIZATION_ACCOUNT_ADMIN_REQUIRED` is a boundary no
 * permission can cross and there is nothing to re-sync.
 *
 * It must not throw and must not be relied upon to finish before the caller
 * sees the error.
 */
export type ForbiddenHandler = (error: ApiError) => void;

let forbiddenHandler: ForbiddenHandler | null = null;

/** Registered once, by the permissions feature. */
export const setForbiddenHandler = (handler: ForbiddenHandler | null): void => {
  forbiddenHandler = handler;
};

/** Read by the response interceptor. */
export const getForbiddenHandler = (): ForbiddenHandler | null => forbiddenHandler;
