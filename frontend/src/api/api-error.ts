import axios from 'axios';

import type { components } from './generated/openapi';

/**
 * The backend's error envelope, taken from the generated contract rather than
 * re-declared here — `ErrorEnvelope` is one named schema every documented
 * failure in the API points at (backend Feature 033 / 038).
 */
type ErrorEnvelope = components['schemas']['ErrorEnvelope'];

/** Interpolation values a translated message can use. */
export type ApiErrorParams = ErrorEnvelope['params'];

/**
 * Every failure that leaves the HTTP client, normalised to one shape.
 *
 * A component or a query never sees an `AxiosError`, a `TypeError` from a dead
 * network, or a raw envelope — it sees this, and it branches on
 * {@link ApiError.errorCode}.
 *
 * ## `message` is not for the user
 *
 * The backend says so itself: the envelope's `message` is English written for a
 * log and is free to be reworded at any time. It is kept here because it is
 * what makes a console trace readable, and it must never be rendered. The
 * translatable half is `errorCode`, and `src/i18n/useApiErrorMessage.ts` is the
 * one place that turns it into text.
 *
 * ## `errorCode` can be absent, and that is part of the contract
 *
 * Modules written before backend Feature 033 answer without one, so a client
 * has to fall back to the status. `useApiErrorMessage` implements that fallback
 * once so no call site has to.
 */
export class ApiError extends Error {
  /** HTTP status, or `null` when the request never got an answer. */
  readonly status: number | null;

  /** Stable machine-readable code — the thing to branch and translate on. */
  readonly errorCode: string | null;

  /** Flat scalars to interpolate into the translated message, when present. */
  readonly params: ApiErrorParams;

  /**
   * One entry per rejected field, from the global `ValidationPipe`.
   *
   * Empty for every other failure. A form maps these back onto its inputs;
   * they are English and diagnostic, exactly like `message`.
   */
  readonly details: readonly string[];

  /** Request path the backend reports, useful when correlating with its logs. */
  readonly path: string | null;

  /** True when the request never reached the API — offline, DNS, timeout. */
  readonly isNetworkError: boolean;

  constructor(init: {
    message: string;
    status: number | null;
    errorCode?: string | null;
    params?: ApiErrorParams;
    details?: readonly string[];
    path?: string | null;
    isNetworkError?: boolean;
    cause?: unknown;
  }) {
    super(init.message, { cause: init.cause });
    this.name = 'ApiError';
    this.status = init.status;
    this.errorCode = init.errorCode ?? null;
    this.params = init.params;
    this.details = init.details ?? [];
    this.path = init.path ?? null;
    this.isNetworkError = init.isNetworkError ?? false;
  }

  /** `true` for 4xx — a request that will fail again if repeated unchanged. */
  get isClientError(): boolean {
    return this.status !== null && this.status >= 400 && this.status < 500;
  }
}

/** Narrowing guard for `catch (error: unknown)` and for query error branches. */
export const isApiError = (error: unknown): error is ApiError => error instanceof ApiError;

/**
 * Whether a failure carries a specific backend code.
 *
 * For the small number of cases where a screen does something *different* for
 * one code rather than merely translating it — an expired activation link needs
 * a way to ask for a new one, not just a sentence. Translation goes through
 * `useApiErrorMessage`; this is for branching.
 */
export const hasErrorCode = (error: unknown, errorCode: string): boolean =>
  toApiError(error).errorCode === errorCode;

/**
 * Recognises the backend's error envelope without trusting that every failure
 * carries one: a `502` from a reverse proxy is HTML, and a request that never
 * arrived has no body at all.
 */
const isErrorEnvelope = (body: unknown): body is ErrorEnvelope =>
  typeof body === 'object' &&
  body !== null &&
  'success' in body &&
  (body as { success: unknown }).success === false &&
  'message' in body;

const UNEXPECTED_ERROR_MESSAGE = 'The request failed for an unrecognised reason.';

/**
 * Turns anything thrown by axios into an {@link ApiError}.
 *
 * The three cases are kept distinct because a client responds to them
 * differently: an enveloped failure has a code to translate, an un-enveloped
 * HTTP failure has only a status, and a network failure has neither and is the
 * one worth retrying.
 */
export const toApiError = (error: unknown): ApiError => {
  if (isApiError(error)) return error;

  if (axios.isAxiosError(error)) {
    const status = error.response?.status ?? null;
    const body: unknown = error.response?.data;

    if (isErrorEnvelope(body)) {
      const details = Array.isArray(body.message) ? body.message : [];
      const message = Array.isArray(body.message)
        ? body.message.join('; ')
        : body.message;

      return new ApiError({
        message,
        status: body.statusCode ?? status,
        errorCode: body.errorCode ?? null,
        params: body.params,
        details,
        path: body.path ?? null,
        cause: error,
      });
    }

    return new ApiError({
      message: error.message,
      status,
      isNetworkError: status === null,
      cause: error,
    });
  }

  return new ApiError({
    message: error instanceof Error ? error.message : UNEXPECTED_ERROR_MESSAGE,
    status: null,
    cause: error,
  });
};
