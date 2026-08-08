import { HttpException } from '@nestjs/common';

import { ErrorCode, ErrorParams } from '../constants/error-codes.constants';

/**
 * How an exception carries a stable error code, and how the filter reads one
 * back out. Both halves are here, deliberately: they are one format, and a
 * writer and a reader in different files is how a format drifts.
 *
 * ## The mechanism, and why it is not a new exception class
 *
 * A code travels **inside the payload of an ordinary Nest exception**:
 *
 * ```ts
 * throw new UnauthorizedException(
 *   codedError(ERROR_CODES.AUTH_INACTIVE_USER, 'Invalid or expired access token'),
 * );
 * ```
 *
 * The obvious alternative was a class — `AppException(code, { status, message })`
 * — and it was rejected for three reasons, all of them about the thirty modules
 * that already exist:
 *
 * 1. **`instanceof` keeps working.** A great deal of this project's test suite
 *    asserts `rejects.toThrow(NotFoundException)` and
 *    `rejects.toThrow(ConflictException)`. A new class that is an `HttpException`
 *    but not an `UnauthorizedException` would have broken every one of those the
 *    day its module gained a code, which is a migration cost paid in test churn
 *    for no behavioural gain.
 * 2. **The status stays where it already is.** `new ConflictException(...)` *is*
 *    a 409; a factory taking `{ status }` makes the status a parameter somebody
 *    can get wrong, and this codebase is careful about which code each refusal
 *    answers with. Adding a code should not reopen that decision.
 * 3. **Uncoded exceptions cost nothing.** Every module that has not been
 *    migrated keeps throwing exactly what it throws today and keeps producing
 *    exactly the envelope it produces today, minus an `errorCode` key. There is
 *    no base class to adopt and no sweep to schedule.
 *
 * The trade-off is that nothing forces a throw site to supply a code. That is
 * accepted on purpose — a gradual migration is the plan, not a compromise — and
 * what *is* enforced is that a code, when given, comes from the catalog:
 * {@link codedError} takes an {@link ErrorCode}, so a literal is a compile error.
 */

/**
 * The payload shape a coded exception carries.
 *
 * `message` sits beside the code rather than replacing it. It is still the
 * English developer-facing text, it is still what `HttpException` derives
 * `error.message` from — so `rejects.toThrow(/some words/)` keeps working — and
 * it is still what a client that knows nothing about codes will show.
 */
export interface CodedErrorPayload {
  errorCode: ErrorCode;
  message: string | string[];
  params?: ErrorParams;
}

/**
 * Builds the payload for an exception that carries a code.
 *
 * Handed to any Nest exception constructor, which is what decides the status:
 *
 * ```ts
 * throw new ConflictException(
 *   codedError(ERROR_CODES.TIMESHEET_ALREADY_SUBMITTED, 'Already submitted', {
 *     month: 9,
 *     year: 2026,
 *   }),
 * );
 * ```
 *
 * `params` is omitted from the object entirely when none are given, rather than
 * set to `undefined`. The payload is serialised into the response, and a key
 * whose value is `undefined` would either vanish silently or — through a
 * different serialiser — appear as `null`, which is a third thing for a client
 * to handle.
 */
export function codedError(
  errorCode: ErrorCode,
  message: string | string[],
  params?: ErrorParams,
): CodedErrorPayload {
  return params === undefined
    ? { errorCode, message }
    : { errorCode, message, params };
}

/**
 * The code and params an exception carries, or nothing.
 *
 * **The single place anything reads a code back out.** `AllExceptionsFilter`
 * calls this and no other component does, which is what keeps "where does
 * `errorCode` come from" a question with one answer.
 *
 * Everything is checked rather than assumed, because the payload of an
 * `HttpException` is `string | object` and most of them in this application are
 * one of the three shapes Nest itself produces. An exception with no code — the
 * ordinary case, and every un-migrated module — returns an empty object, and the
 * filter then leaves the keys off the envelope.
 *
 * `errorCode` is not checked against the catalog at runtime. The compiler
 * already did that at the throw site, and re-checking here would mean this file
 * importing the whole catalog to guard against a case that cannot occur.
 */
export function readCodedError(exception: HttpException): {
  errorCode?: string;
  params?: ErrorParams;
} {
  const payload = exception.getResponse();

  if (typeof payload !== 'object') {
    return {};
  }

  const { errorCode, params } = payload as {
    errorCode?: unknown;
    params?: unknown;
  };

  if (typeof errorCode !== 'string' || errorCode.length === 0) {
    return {};
  }

  return isErrorParams(params) ? { errorCode, params } : { errorCode };
}

/**
 * Whether a value is a flat record of scalars.
 *
 * Guards the boundary rather than trusting it: `params` is copied straight into
 * a response body, so anything that is not what {@link ErrorParams} describes —
 * an array, a nested object, a `Date` — is dropped rather than serialised into a
 * shape the frontend's interpolation cannot use. Dropping is right where
 * throwing would be wrong: this runs while an error is already being rendered,
 * and a filter that threw would turn a `404` into an unhandled `500`.
 */
function isErrorParams(value: unknown): value is ErrorParams {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return false;
  }

  return Object.values(value).every(
    (entry) =>
      typeof entry === 'string' ||
      typeof entry === 'number' ||
      typeof entry === 'boolean',
  );
}
