import axios from 'axios';

import { API_BASE_URL } from '@/lib/env';

import { toApiError } from './api-error';
import { getAccessToken, getUnauthorizedHandler } from './auth-session';

/**
 * Per-request switches this application adds to axios' own config.
 *
 * Declared by module augmentation so they are typed at every call site rather
 * than smuggled through `as`.
 */
declare module 'axios' {
  interface AxiosRequestConfig {
    /**
     * Skip the `401` refresh seam for this request.
     *
     * The authentication feature must set it on `POST /auth/refresh` itself:
     * without it, a refresh that is refused would trigger a refresh, which
     * would be refused, forever.
     */
    skipAuthRefresh?: boolean;
  }

  interface InternalAxiosRequestConfig {
    /** Set by the response interceptor so one request is retried at most once. */
    retriedAfterRefresh?: boolean;
  }
}

/**
 * The one axios instance in this application.
 *
 * **Every** request goes through it, including the ones a generated client
 * makes, because the interceptors below are the only place a token is attached
 * and the only place an error is normalised. A bare `fetch` would bypass both
 * and produce a call site that behaves differently from every other one.
 *
 * `baseURL` is an origin and carries no path — see `src/lib/env.ts` for why the
 * `/api/v1` prefix belongs to the path instead.
 *
 * ## `withCredentials` is load-bearing, and its absence fails quietly
 *
 * The refresh token is an `HttpOnly` cookie (backend Feature 040) — the one
 * credential this application cannot read, store or send by hand. Only the
 * browser can attach it, and it only does so when the request asks for
 * credentials. Without this flag the browser **also refuses to keep the cookie**
 * `POST /auth/login` sets, so the failure looks like this: login succeeds, the
 * session works for fifteen minutes, and then the first silent refresh answers
 * `401` for a reason nothing in the frontend can observe.
 *
 * It is set on the instance rather than on the four `/auth` calls that need it,
 * because a per-call flag is a per-call thing to forget, and it costs nothing
 * elsewhere: the cookie is scoped to `Path=/api/v1/auth`, so the browser never
 * attaches it to any other request regardless of what this says.
 *
 * The deployment half of the same requirement is the backend's `CORS_ORIGINS` —
 * credentials cannot be sent to a wildcard origin.
 */
export const http = axios.create({
  baseURL: API_BASE_URL,
  headers: { 'Content-Type': 'application/json' },
  withCredentials: true,
});

/**
 * Request: attach the bearer token when there is one.
 *
 * Read from the in-memory holder on every request rather than captured once, so
 * a token refreshed mid-session is used by the next call without the instance
 * being rebuilt.
 *
 * An existing `Authorization` header is left alone: a call that sets its own
 * credential (the auth feature will have one or two) means it.
 */
http.interceptors.request.use((config) => {
  const token = getAccessToken();

  if (token && !config.headers.Authorization) {
    config.headers.Authorization = `Bearer ${token}`;
  }

  return config;
});

/**
 * Response: the `401` seam, then normalisation.
 *
 * The refresh-and-retry *place* is implemented here; the refresh *logic* is
 * not, and must not be — see `auth-session.ts`. Until the auth feature calls
 * `setUnauthorizedHandler`, `getUnauthorizedHandler()` returns `null` and every
 * `401` falls straight through to the normaliser, which is the right behaviour
 * for an application that cannot yet sign anybody in.
 *
 * Whatever leaves this interceptor is an {@link ApiError}. Nothing downstream —
 * a query, a component, a form — ever handles an `AxiosError`.
 */
http.interceptors.response.use(
  (response) => response,
  async (error: unknown) => {
    if (axios.isAxiosError(error) && error.response?.status === 401) {
      const config = error.config;
      const handler = getUnauthorizedHandler();

      const mayRetry =
        handler !== null &&
        config !== undefined &&
        config.skipAuthRefresh !== true &&
        config.retriedAfterRefresh !== true;

      if (mayRetry) {
        config.retriedAfterRefresh = true;

        // The handler performs the refresh and reports whether a new access
        // token is now in the in-memory holder. It de-duplicates concurrent
        // calls — the refresh token is single-use and presenting a spent one
        // revokes every session. Implemented in
        // `src/features/auth/session-refresh.ts`.
        const refreshed = await handler();

        if (refreshed) {
          return http.request(config);
        }
      }
    }

    return Promise.reject(toApiError(error));
  },
);
