import { HttpStatus, applyDecorators } from '@nestjs/common';
import { ApiExtraModels, ApiResponse, getSchemaPath } from '@nestjs/swagger';

import { ERROR_CODES } from '../constants/error-codes.constants';
import {
  ERROR_EXAMPLES,
  ErrorExample,
  PUBLIC_ERROR_EXAMPLES,
} from './error-envelope.examples';
import { ErrorEnvelope } from './error-envelope.schema';

/** The failure statuses this API actually produces, and nothing else. */
export type StandardErrorStatus =
  | HttpStatus.BAD_REQUEST
  | HttpStatus.UNAUTHORIZED
  | HttpStatus.FORBIDDEN
  | HttpStatus.NOT_FOUND
  | HttpStatus.CONFLICT
  | HttpStatus.TOO_MANY_REQUESTS
  | HttpStatus.INTERNAL_SERVER_ERROR;

/**
 * What each documented failure means **in this application**, written once.
 *
 * Not "Bad Request" restated — a client already knows what 400 is called. Each
 * line says which component produced the response and which `errorCode`, if
 * any, travels on it, because that is the part a consumer cannot infer.
 */
const DESCRIPTIONS: Record<StandardErrorStatus, string> = {
  [HttpStatus.BAD_REQUEST]: `The request body, query or path failed validation. The global \`ValidationPipe\` runs with \`whitelist\` and \`forbidNonWhitelisted\`, so an unknown property is rejected by name rather than ignored. \`message\` is an array with one entry per rejected field and \`errorCode\` is \`${ERROR_CODES.VALIDATION_ERROR}\`. Some domain rules — a leave span, a missing processor — deliberately answer in this same shape so a client handles them with the code it already has for field errors. Those send a single string and their own code: \`${ERROR_CODES.ACCOUNT_TOKEN_INVALID}\` on \`POST /auth/activate\` and \`POST /auth/reset-password\`, where a dead link is an input error rather than an authentication failure — the token is a body parameter proving somebody received an email, not a credential — and \`params.purpose\` says which kind of link it was.`,
  [HttpStatus.UNAUTHORIZED]: `No access token, or one that is malformed, expired, forged, or names an account that no longer exists. Produced by the global \`JwtAuthGuard\` before any handler runs; \`errorCode\` is \`${ERROR_CODES.AUTH_UNAUTHENTICATED}\`. The client should attempt a refresh and, failing that, send the person to the login screen. Two other codes reach this status on their own flows: \`${ERROR_CODES.AUTH_INACTIVE_USER}\` when the account behind an otherwise valid token has been deactivated — on any authenticated request, on \`GET /auth/me\` and on \`POST /auth/refresh\`, never on login — where a refresh would fail forever and the person needs "your account has been deactivated" instead; and \`${ERROR_CODES.ACCOUNT_CURRENT_PASSWORD_INCORRECT}\`, only on \`POST /auth/change-password\`, where the session is fine and it is the \`currentPassword\` in the body that was wrong. The message does not distinguish them; the code does.`,
  [HttpStatus.FORBIDDEN]: `The caller is authenticated and may not do this. \`${ERROR_CODES.AUTHORIZATION_PERMISSION_DENIED}\` comes from \`PermissionsGuard\` and carries \`requiredPermissions\` and \`mode\` in \`params\`; \`${ERROR_CODES.AUTHORIZATION_ACCOUNT_ADMIN_REQUIRED}\` means the route is restricted to ADMIN/SUPERADMIN and no permission can be granted for it; \`${ERROR_CODES.AUTH_NO_EMPLOYEE_RECORD}\` is about the account behind a perfectly valid credential — the route concerns the caller's own employment record and their account has none. Refreshing the token never helps. One defensive path also answers \`403\` with \`${ERROR_CODES.AUTH_UNAUTHENTICATED}\`: a profile read whose account vanished between the guard and the handler, which is unreachable in practice and means the session is over.`,
  [HttpStatus.NOT_FOUND]:
    'No record matches the identifier. Ids are cuids and are not pattern-checked, so a malformed id yields the same 404 as one that never existed. Note that an unmatched *route* also answers 404 with this envelope — 401 is what proves a route exists and is guarded.',
  [HttpStatus.CONFLICT]:
    'The request is well formed but the resource is in a state that refuses it — a timesheet transition that is not legal from its current status, a duplicate that a uniqueness rule forbids, or a record another one still depends on.',
  [HttpStatus.TOO_MANY_REQUESTS]: `The rate limiter refused the request; \`errorCode\` is \`${ERROR_CODES.RATE_LIMIT_EXCEEDED}\`. Two tiers exist — a generous per-client baseline on every route and a strict allowance on the public authentication routes — and one code covers both, because telling them apart would publish which limit was hit. Respect the \`Retry-After\` header: retrying immediately extends the block rather than shortening it.`,
  [HttpStatus.INTERNAL_SERVER_ERROR]: `Something the application did not anticipate. The message is the fixed sentence \`Internal server error\` rather than the real reason — an unhandled error carries text written by a driver or by Prisma and can contain a query or a connection string — and \`errorCode\` is \`${ERROR_CODES.INTERNAL_ERROR}\`. The detail is in the server log.`,
};

/**
 * Statuses every authenticated route can answer, whatever it does.
 *
 * `401` because `JwtAuthGuard` is a global `APP_GUARD` and the default for
 * every route in this application is that a valid access token is required.
 * `429` because `ApiThrottlerGuard` is registered globally too, and ahead of
 * authentication. `500` because any route can fail.
 */
const ALWAYS: StandardErrorStatus[] = [
  HttpStatus.UNAUTHORIZED,
  HttpStatus.TOO_MANY_REQUESTS,
  HttpStatus.INTERNAL_SERVER_ERROR,
];

/**
 * The same three, minus authentication, for a `@Public()` route.
 *
 * A public route is exempt from `JwtAuthGuard` and from nothing else — the rate
 * limiter ignores `@Public()` entirely, which is the point: those routes are
 * the only ones an unauthenticated caller can reach at all.
 */
const ALWAYS_PUBLIC: StandardErrorStatus[] = [
  HttpStatus.TOO_MANY_REQUESTS,
  HttpStatus.INTERNAL_SERVER_ERROR,
];

/**
 * What a `401` means on a route that has no token to be missing.
 *
 * `POST /auth/login` and `POST /auth/refresh` both answer `401`, and it means
 * something completely different there: not "you sent no access token" — the
 * whole point of those routes is that you have none — but "the credential you
 * *did* send was refused". Reusing the guard's description would have told a
 * reader that login requires a token in order to issue one, which is the exact
 * confusion `@Public()` exists to prevent.
 *
 * One override rather than a per-route `@ApiResponse`, so the two routes that
 * need it cannot drift apart and the reasoning stays beside the description it
 * replaces.
 */
const PUBLIC_DESCRIPTIONS: Partial<Record<StandardErrorStatus, string>> = {
  [HttpStatus.UNAUTHORIZED]: `The credential in the request body was refused — there is no access token involved on a public route. \`${ERROR_CODES.AUTH_INVALID_CREDENTIALS}\` covers all three login failures (no such address, wrong password, deactivated account) with one message and equalised timing, because splitting them would confirm that an address exists. \`${ERROR_CODES.AUTH_REFRESH_TOKEN_INVALID}\` covers a refresh token that is malformed, expired, revoked or unknown; \`${ERROR_CODES.AUTH_REFRESH_TOKEN_REUSED}\` is the one that is deliberately specific, because a spent token coming back means two parties hold one credential and every session has just been revoked.`,
};

/**
 * Attaches the standard failure responses to a route, all rendering the
 * {@link ErrorEnvelope}.
 *
 * **The reason this is one decorator rather than a block of `@ApiResponse`
 * calls on each of the ~150 routes.** Every failure in this API has the same
 * body; only the status code and the `errorCode` vary. Copying that out per
 * route would be two hundred opportunities to describe the envelope slightly
 * differently, and the first one to drift would be the one nobody re-read.
 *
 * `401`, `429` and `500` are added automatically because they are true of every
 * authenticated route regardless of what it does. The situational ones are
 * passed in, so a route that cannot 404 does not claim it can:
 *
 * ```ts
 * @ApiStandardErrors(HttpStatus.BAD_REQUEST, HttpStatus.NOT_FOUND)
 * ```
 *
 * Applied to a controller class it covers every route in it, which is how the
 * per-route lists stay short.
 *
 * Each response also renders a **per-status example** — a body with a matching
 * `statusCode`, a code that is actually thrown with it, and only the `params`
 * that code carries. The schema behind them is still the one `$ref`; see
 * {@link buildErrorResponses} and `error-envelope.examples.ts`.
 */
export function ApiStandardErrors(
  ...situational: StandardErrorStatus[]
): MethodDecorator & ClassDecorator {
  return buildErrorResponses(
    [...ALWAYS, ...situational],
    DESCRIPTIONS,
    ERROR_EXAMPLES,
  );
}

/**
 * The same, for a route carrying `@Public()`.
 *
 * **`401` is not added automatically here**, and that omission is half of the
 * documentation's statement about the route: a token cannot be missing from a
 * request that needs none. The other half is that the routes which *do* answer
 * `401` — login and refresh — say so with {@link PUBLIC_DESCRIPTIONS}'s wording
 * rather than the guard's, because there it means the credential in the body
 * was refused. `PUBLIC_ERROR_EXAMPLES` overrides the rendered example the same
 * way, so the body under that description shows a refused credential rather
 * than the guard's `AUTH_UNAUTHENTICATED`.
 *
 * What actually tells a reader no token is required is the absence of a
 * security requirement on the operation, which comes from not applying
 * `@ApiBearerAuth()`. `openapi.e2e-spec.ts` asserts exactly which routes lack
 * one.
 */
export function ApiPublicRouteErrors(
  ...situational: StandardErrorStatus[]
): MethodDecorator & ClassDecorator {
  return buildErrorResponses(
    [...ALWAYS_PUBLIC, ...situational],
    { ...DESCRIPTIONS, ...PUBLIC_DESCRIPTIONS },
    { ...ERROR_EXAMPLES, ...PUBLIC_ERROR_EXAMPLES },
  );
}

/**
 * One `@ApiResponse` per status, de-duplicated and in ascending order.
 *
 * **The schema is the same `$ref` on every one of them; only the example
 * differs.** That split is the whole design: `ErrorEnvelope` stays one named
 * definition that ~500 responses point at, so none of them can describe the
 * envelope differently, while each status still *renders* a body that belongs
 * to it. Both live under `content['application/json']` because that is where
 * OpenAPI puts a value that varies by usage — writing the example onto the
 * schema instead would put one incoherent body under every status, which is
 * exactly the state this replaced. See `error-envelope.examples.ts`.
 */
function buildErrorResponses(
  statuses: StandardErrorStatus[],
  descriptions: Partial<Record<StandardErrorStatus, string>>,
  examples: Partial<Record<StandardErrorStatus, ErrorExample>>,
): MethodDecorator & ClassDecorator {
  const unique = [...new Set(statuses)].sort((a, b) => a - b);

  return applyDecorators(
    ApiExtraModels(ErrorEnvelope),
    ...unique.map((status) =>
      ApiResponse({
        status,
        description: descriptions[status],
        content: {
          'application/json': {
            schema: { $ref: getSchemaPath(ErrorEnvelope) },
            ...examples[status],
          },
        },
        ...(status === HttpStatus.TOO_MANY_REQUESTS ? RETRY_AFTER : {}),
      }),
    ),
  );
}

/** The one failure response in this API that carries a header worth reading. */
const RETRY_AFTER = {
  headers: {
    'Retry-After': {
      description: 'Seconds to wait before the next attempt.',
      schema: { type: 'string' },
    },
  },
};
