import { HttpStatus } from '@nestjs/common';
import { ExampleObject } from '@nestjs/swagger/dist/interfaces/open-api-spec.interface';

import { ERROR_CODES } from '../constants/error-codes.constants';
import { ApiErrorResponse } from '../interfaces/api-response.interface';
import type { StandardErrorStatus } from './api-standard-errors.decorator';

/**
 * One rendered example per failure status, for the responses
 * `ApiStandardErrors` attaches.
 *
 * ## The problem this solves
 *
 * Every documented failure `$ref`s the single `ErrorEnvelope` schema, and
 * that is deliberate — the body does not vary, only the status code does. But a
 * response that carries **nothing but** a `$ref` leaves Swagger UI to synthesise
 * its example from the field-level `example:` values on the schema, and those
 * are per-*field*: a `statusCode` of `404`, a message about a public holiday, an
 * `errorCode` of `AUTH_UNAUTHENTICATED`, and permission `params`. Assembled they
 * are a body this API has never sent and could not send, and — worse — the same
 * one appeared under the `401`, the `403`, the `429` and the `500`, so a reader
 * comparing two statuses saw no difference between them at all.
 *
 * The fix is not a schema per status. It is one example per status, carried on
 * the *response* rather than on the schema, which is where OpenAPI puts a value
 * that varies by usage. The schema stays one named definition; only these
 * values differ.
 *
 * ## Which example wins
 *
 * The field-level `example:` values on `ErrorEnvelope` are **still there and
 * still correct** as a default for anything that `$ref`s the schema ad hoc. They
 * are simply no longer what the standard error responses display: an example on
 * the media type overrides whatever the schema would have produced. If a future
 * reader wonders why editing `error-envelope.schema.ts` did not change what
 * Swagger UI shows on a `403`, this file is the answer.
 *
 * ## What makes an example here correct
 *
 * Each one is a body the application can actually produce:
 *
 * - the `statusCode` matches the response it hangs under;
 * - the `errorCode` is one the catalog defines *and* one that is thrown with
 *   that status — a `404` carries none at all, because nothing in this
 *   application codes a not-found;
 * - `params` appear only on the codes that carry them, and are the params those
 *   codes document;
 * - the messages are quoted from the constants the services throw. They are
 *   copied rather than imported: `common/` does not depend on `modules/`, and a
 *   message is explicitly free to be reworded, so an example that lags a
 *   rewording is illustrative rather than wrong. The `errorCode` beside it is
 *   the part that is a contract, and that one *is* referenced by symbol.
 *
 * Nothing here is a real credential, token, or address.
 */

/**
 * A media-type example, in whichever of OpenAPI's two forms fits the status.
 *
 * `example` for a status with one story to tell; `examples` where a status has
 * several genuinely different causes and picking one would misrepresent the
 * others — `403` and the public `401` are both that case.
 */
export type ErrorExample =
  | { readonly example: ApiErrorResponse }
  | { readonly examples: Record<string, ExampleObject> };

/** ISO-8601 UTC, as `AllExceptionsFilter` stamps it. Fixed so it reads as sample data. */
const TIMESTAMP = '2026-08-12T08:36:11.816Z';

/** Fills in the two fields every envelope carries identically. */
function envelope(
  fields: Omit<ApiErrorResponse, 'success' | 'timestamp'>,
): ApiErrorResponse {
  return { success: false, ...fields, timestamp: TIMESTAMP };
}

/** A status with one representative body. */
function one(value: ApiErrorResponse): ErrorExample {
  return { example: value };
}

/** A status whose causes a reader has to be able to tell apart. */
function several(
  variants: Record<string, { summary: string; value: ApiErrorResponse }>,
): ErrorExample {
  return { examples: variants };
}

/**
 * The example shown under each status on an authenticated route.
 *
 * `Record` rather than `Partial<Record>`: a status added to
 * {@link StandardErrorStatus} without an example here is a compile error, which
 * is the same anti-drift device `DESCRIPTIONS` uses one file over.
 */
export const ERROR_EXAMPLES: Record<StandardErrorStatus, ErrorExample> = {
  /**
   * Two shapes, because `400` is not only the `ValidationPipe`'s — the
   * description says so, and an example showing one of them would have
   * contradicted it.
   *
   * The pipe's form is an **array**, one entry per rejected field, and a client
   * writing against a single string breaks on the first two-field failure. The
   * second entry there is `forbidNonWhitelisted` rejecting an unknown property
   * by name rather than ignoring it.
   *
   * A domain rule that answers in this shape sends a **string** and its own
   * code. `ACCOUNT_TOKEN_INVALID` is the one worth showing: a dead activation or
   * reset link is an input error, not an authentication failure — the token is a
   * body parameter proving somebody received an email, not a credential — and
   * `params.purpose` is what lets the screen say "ask your administrator to
   * resend your invitation" rather than "request a new reset link".
   */
  [HttpStatus.BAD_REQUEST]: several({
    validation_error: {
      summary: 'The ValidationPipe — one message per rejected field',
      value: envelope({
        statusCode: HttpStatus.BAD_REQUEST,
        message: [
          'email must be an email',
          'property nickname should not exist',
        ],
        errorCode: ERROR_CODES.VALIDATION_ERROR,
        path: '/api/v1/employees',
      }),
    },
    account_token_invalid: {
      summary: 'A domain rule in the same shape — a dead activation/reset link',
      value: envelope({
        statusCode: HttpStatus.BAD_REQUEST,
        message: 'This link is no longer valid; please request a new one',
        errorCode: ERROR_CODES.ACCOUNT_TOKEN_INVALID,
        params: { purpose: 'ACTIVATION' },
        path: '/api/v1/auth/activate',
      }),
    },
  }),

  /**
   * **Two codes, one message, and that is the whole point of the pair.**
   * `findActiveUser` hands the deactivated-account branch the *same* sentence
   * the missing-token branch uses, deliberately: a client is not told which of
   * the two happened by reading prose, it branches on the code.
   *
   * The branch matters because the responses are opposite. A client that meets
   * `AUTH_UNAUTHENTICATED` should refresh and then, failing that, show the login
   * screen; a client that meets `AUTH_INACTIVE_USER` must *not*, because signing
   * in again fails forever and the honest sentence is "your account has been
   * deactivated, speak to HR". Showing only the first would have hidden that.
   *
   * Neither carries `params` — which account it was is not the client's to be
   * told. `ACCOUNT_CURRENT_PASSWORD_INCORRECT` also lands on `401` but only on
   * `POST /auth/change-password`, so it is described rather than shown here.
   */
  [HttpStatus.UNAUTHORIZED]: several({
    unauthenticated: {
      summary: 'No access token, or one that is malformed, expired or forged',
      value: envelope({
        statusCode: HttpStatus.UNAUTHORIZED,
        message: 'Invalid or expired access token',
        errorCode: ERROR_CODES.AUTH_UNAUTHENTICATED,
        path: '/api/v1/employees',
      }),
    },
    inactive_user: {
      summary: 'A valid token for an account that has been deactivated',
      value: envelope({
        statusCode: HttpStatus.UNAUTHORIZED,
        message: 'Invalid or expired access token',
        errorCode: ERROR_CODES.AUTH_INACTIVE_USER,
        path: '/api/v1/employees',
      }),
    },
  }),

  /**
   * Three causes, and a client's response to each is different — which is
   * exactly why one example would have been misleading. The first can be fixed
   * by granting a permission; the second cannot be fixed at all; the third is
   * about the account having no employment record behind it.
   */
  [HttpStatus.FORBIDDEN]: several({
    permission_denied: {
      summary: 'Missing a permission the route declares',
      value: envelope({
        statusCode: HttpStatus.FORBIDDEN,
        message: 'This action requires the REPORTS.VIEW permission',
        errorCode: ERROR_CODES.AUTHORIZATION_PERMISSION_DENIED,
        // The route's own requirement, and the caller's effective set is
        // deliberately not among them — see the code's note.
        params: { requiredPermissions: 'REPORTS.VIEW', mode: 'ALL' },
        path: '/api/v1/reports',
      }),
    },
    account_admin_required: {
      summary:
        'Restricted to account administrators, and nothing can be granted',
      value: envelope({
        statusCode: HttpStatus.FORBIDDEN,
        message:
          'Only ADMIN and SUPERADMIN may create accounts, change roles, or enable and disable accounts',
        errorCode: ERROR_CODES.AUTHORIZATION_ACCOUNT_ADMIN_REQUIRED,
        path: '/api/v1/users',
      }),
    },
    no_employee_record: {
      summary:
        'A route about the caller’s own employment record, which they have none of',
      value: envelope({
        statusCode: HttpStatus.FORBIDDEN,
        message:
          'This endpoint is about your own employment record, and your account has none',
        errorCode: ERROR_CODES.AUTH_NO_EMPLOYEE_RECORD,
        path: '/api/v1/me/leave-requests',
      }),
    },
  }),

  /**
   * **No `errorCode`, and that is the example's whole point.** Nothing in this
   * application throws a coded not-found, so a `404` is the envelope's
   * documented "key absent entirely" case — the fallback to `statusCode` and
   * `message` that made Feature 033's migration gradual. An example that put an
   * auth code on a `404` taught a client to branch on something it will never
   * receive.
   */
  [HttpStatus.NOT_FOUND]: one(
    envelope({
      statusCode: HttpStatus.NOT_FOUND,
      message: 'Public holiday ckv1qz7mh0000qzrm8x1a2b3c was not found',
      path: '/api/v1/public-holidays/ckv1qz7mh0000qzrm8x1a2b3c',
    }),
  ),

  /**
   * **Both halves of Feature 033's gradual migration, on one status.** Most
   * conflicts in this application are still uncoded — the catalog has no
   * `TIMESHEET_*` or `LEAVE_*` conflict code, and inventing one for the
   * documentation would promise a client a string it could key a translation on
   * and never receive. One conflict *is* coded, and showing only the other would
   * have told a reader that a `409` never carries a code.
   */
  [HttpStatus.CONFLICT]: several({
    uncoded_state_conflict: {
      summary: 'The common case — a state rule, with no code to branch on yet',
      value: envelope({
        statusCode: HttpStatus.CONFLICT,
        message:
          'Timesheet ckv1qz7mh0000qzrm8x1a2b3c is DRAFT and cannot be approved; only SUBMITTED timesheets may be',
        path: '/api/v1/timesheets/ckv1qz7mh0000qzrm8x1a2b3c/approve',
      }),
    },
    not_pending_activation: {
      summary: 'An account-lifecycle conflict, which does carry a code',
      value: envelope({
        statusCode: HttpStatus.CONFLICT,
        message:
          'Account ckv1qz7mh0000qzrm8x1a2b3c is ACTIVE and has already been activated; a forgotten password is reset by its owner through the password reset flow',
        errorCode: ERROR_CODES.ACCOUNT_NOT_PENDING_ACTIVATION,
        // The state the account is actually in, so the screen can say so.
        params: { status: 'ACTIVE' },
        path: '/api/v1/users/ckv1qz7mh0000qzrm8x1a2b3c/resend-activation',
      }),
    },
  }),

  /**
   * One code for both tiers, and no numbers in the message: how much allowance
   * is left is deployment configuration and a useful answer to precisely the
   * caller measuring it. The wait is in the `Retry-After` header the response
   * documents beside this.
   */
  [HttpStatus.TOO_MANY_REQUESTS]: one(
    envelope({
      statusCode: HttpStatus.TOO_MANY_REQUESTS,
      message: 'Too many requests; please wait before trying again',
      errorCode: ERROR_CODES.RATE_LIMIT_EXCEEDED,
      path: '/api/v1/auth/login',
    }),
  ),

  /**
   * The fixed sentence rather than the real reason — an unhandled error carries
   * text written by a driver or by Prisma and can contain a query or a
   * connection string. This example is what a client will actually see, which
   * is why it is worth showing that it contains nothing to act on.
   */
  [HttpStatus.INTERNAL_SERVER_ERROR]: one(
    envelope({
      statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
      message: 'Internal server error',
      errorCode: ERROR_CODES.INTERNAL_ERROR,
      path: '/api/v1/employees',
    }),
  ),
};

/**
 * The `401` example for a `@Public()` route, overriding {@link ERROR_EXAMPLES}.
 *
 * The counterpart to `PUBLIC_DESCRIPTIONS`, and it exists for the same reason:
 * on `POST /auth/login` and `POST /auth/refresh` a `401` means **the credential
 * in the body was refused**, not that an access token was missing. Showing the
 * guard's `AUTH_UNAUTHENTICATED` there would have contradicted the description
 * sitting directly above it and told a reader that login needs a token in order
 * to issue one.
 *
 * Three variants because the two routes fail differently and one of the refresh
 * failures is deliberately distinguishable: a spent refresh token coming back
 * means two parties hold one credential, every session has just been revoked,
 * and the sentence a user is shown is not the one an ordinary expiry gets.
 */
export const PUBLIC_ERROR_EXAMPLES: Partial<
  Record<StandardErrorStatus, ErrorExample>
> = {
  [HttpStatus.UNAUTHORIZED]: several({
    invalid_credentials: {
      summary: 'POST /auth/login — one answer for all three login failures',
      value: envelope({
        statusCode: HttpStatus.UNAUTHORIZED,
        message: 'Invalid email or password',
        errorCode: ERROR_CODES.AUTH_INVALID_CREDENTIALS,
        path: '/api/v1/auth/login',
      }),
    },
    refresh_token_invalid: {
      summary: 'POST /auth/refresh — malformed, expired, revoked or unknown',
      value: envelope({
        statusCode: HttpStatus.UNAUTHORIZED,
        message: 'Invalid or expired refresh token',
        errorCode: ERROR_CODES.AUTH_REFRESH_TOKEN_INVALID,
        path: '/api/v1/auth/refresh',
      }),
    },
    refresh_token_reused: {
      summary:
        'POST /auth/refresh — a spent token returned; every session revoked',
      value: envelope({
        statusCode: HttpStatus.UNAUTHORIZED,
        message:
          'This session has been ended for security reasons; please sign in again',
        errorCode: ERROR_CODES.AUTH_REFRESH_TOKEN_REUSED,
        path: '/api/v1/auth/refresh',
      }),
    },
  }),
};
