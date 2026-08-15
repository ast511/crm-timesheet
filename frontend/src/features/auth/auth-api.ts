import { apiGet, apiPost } from '@/api/client';
import type { components } from '@/api/generated/openapi';

/**
 * Every call this feature makes, in one place, typed from the contract.
 *
 * Two things are true of all of them and are set here rather than remembered at
 * each call site:
 *
 * - **`skipAuthRefresh`.** A `401` from any of these routes is the answer, not a
 *   symptom of an expired access token. Login answering `401` means the
 *   password was wrong; refresh answering `401` means the session is over.
 *   Letting the interceptor react to those by attempting a refresh would, in
 *   the refresh case, attempt a refresh in response to a failed refresh —
 *   forever. `GET /auth/me` is the deliberate exception: its `401` is exactly
 *   the case a silent refresh exists for.
 * - **The cookie carries the refresh token.** `refresh` and `logout` take no
 *   body at all (backend Feature 040); the browser attaches the credential
 *   because `http` is configured `withCredentials`.
 */

/** The account behind the current token. */
export type AuthUser = components['schemas']['AuthUserEntity'];

/** What login and refresh answer: an access token and who it belongs to. */
export type AuthSession = components['schemas']['AuthSessionEntity'];

export interface LoginCredentials {
  email: string;
  password: string;
}

export const login = (credentials: LoginCredentials): Promise<AuthSession> =>
  apiPost('/api/v1/auth/login', {
    body: credentials,
    config: { skipAuthRefresh: true },
  });

/**
 * No body, no argument. The `HttpOnly` cookie is the whole request, which is
 * why this feature never reads, stores or passes a refresh token anywhere.
 */
export const refresh = (): Promise<AuthSession> =>
  apiPost('/api/v1/auth/refresh', { config: { skipAuthRefresh: true } });

/**
 * Requires the access token; the cookie names the session to revoke.
 *
 * Answers `200` even when the browser holds no cookie any more, so a person
 * whose refresh token expired overnight can still sign out cleanly.
 */
export const logout = async (): Promise<void> => {
  await apiPost('/api/v1/auth/logout', { config: { skipAuthRefresh: true } });
};

/**
 * The session hydration call, and the one place a `401` *should* reach the
 * refresh seam — a returning tab has no access token in memory, so the first
 * request of the page is expected to fail and be retried behind a refresh.
 */
export const fetchCurrentUser = (): Promise<AuthUser> => apiGet('/api/v1/auth/me');

export const forgotPassword = (email: string): Promise<{ message: string }> =>
  apiPost('/api/v1/auth/forgot-password', {
    body: { email },
    config: { skipAuthRefresh: true },
  });

/**
 * Both of these answer `data: null` — the contract types it `unknown`, since
 * "always null" is not a shape OpenAPI can name — so they resolve to nothing
 * rather than handing a caller a value with no meaning. Neither returns a
 * session: the backend refuses to sign somebody in as a side effect of a link.
 */
export const resetPassword = async (input: {
  token: string;
  newPassword: string;
}): Promise<void> => {
  await apiPost('/api/v1/auth/reset-password', {
    body: input,
    config: { skipAuthRefresh: true },
  });
};

export const activateAccount = async (input: {
  token: string;
  password: string;
}): Promise<void> => {
  await apiPost('/api/v1/auth/activate', {
    body: input,
    config: { skipAuthRefresh: true },
  });
};
