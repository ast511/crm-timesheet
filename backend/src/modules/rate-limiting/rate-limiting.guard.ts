import {
  ExecutionContext,
  HttpException,
  HttpStatus,
  Injectable,
} from '@nestjs/common';
import { ThrottlerGuard, ThrottlerLimitDetail } from '@nestjs/throttler';
import { Response } from 'express';

import { EMAIL_MAX_LENGTH } from '../../common/constants/email.constants';
import { ERROR_CODES } from '../../common/constants/error-codes.constants';
import { normalizeEmailAddress } from '../../common/decorators/is-email-address.decorator';
import { codedError } from '../../common/errors/coded-error';
import {
  ANONYMOUS_IDENTITY,
  KEY_SEPARATOR,
  RATE_LIMIT_EXCEEDED_MESSAGE,
  RETRY_AFTER_HEADER,
  STRICT_THROTTLER_NAME,
  UNKNOWN_CLIENT,
} from './rate-limiting.constants';

/** The parts of a request an address can be read from. */
export interface ClientAddressSource {
  readonly ip?: string;
  readonly socket?: { readonly remoteAddress?: string };
}

/** The parts of a request an identity can be read from. */
export interface SubmittedIdentitySource {
  readonly body?: unknown;
}

/**
 * The application's rate limiter.
 *
 * Registered as an `APP_GUARD` in `app.module.ts` **before** `JwtAuthGuard`, so
 * every route in the application is limited by default and a request is counted
 * before anybody asks whether its credentials are any good. The ordering is the
 * feature: a flood of wrong passwords is exactly the traffic this exists to
 * stop, and a limiter that ran after authentication would decline to count the
 * one thing it was installed for. See the comment on the provider.
 *
 * ## The two tiers, and what each one catches
 *
 * | Tier | Applies to | Keyed on | Catches |
 * | --- | --- | --- | --- |
 * | `default` | every route | client address | one client hammering the API |
 * | `auth` | `@StrictRateLimit()` routes | address **+** submitted address | guessing at one account |
 *
 * They are additive — a login is counted in both — and each catches what the
 * other cannot. Keying the strict tier on the submitted email alone would let a
 * password spray across a thousand accounts run unlimited, because every request
 * would open a fresh bucket; the baseline is what bounds that, because it does
 * not care what was in the body. Keying it on the address alone would put a
 * whole office behind one NAT into a single ten-attempt bucket, so one person
 * mistyping their password locks out everybody else — which is not a security
 * measure, it is a help-desk ticket. Together they bound both.
 *
 * ## What is deliberately not here
 *
 * No account lockout, no CAPTCHA, no per-user quota. A limiter bounds a *rate*;
 * a lockout changes what an account *is*, and it brings its own abuse — anybody
 * who knows an address can lock its owner out. Feature 032 suggested one and it
 * is recorded as a follow-up rather than smuggled in behind this guard.
 */
@Injectable()
export class ApiThrottlerGuard extends ThrottlerGuard {
  /**
   * Lets everything that is not an HTTP request through.
   *
   * A global guard is applied to WebSocket message handlers too, and there is no
   * HTTP request under one: `switchToHttp().getRequest()` returns the socket,
   * whose `ip` is undefined, so every client on the real-time side would share
   * the `unknown` bucket and the whole company would be limited as one caller
   * after a few hundred notifications.
   *
   * This is the same pass-through `JwtAuthGuard` makes, for the same reason, and
   * it is not a hole for the same reason either — a socket is authenticated once
   * at the handshake, and the handshake is an HTTP upgrade request that this
   * guard *does* see and *does* count. What is unlimited is messages on an
   * already-established connection, which is a bounded population.
   */
  protected override shouldSkip(context: ExecutionContext): Promise<boolean> {
    return Promise.resolve(context.getType() !== 'http');
  }

  /**
   * Who a request is counted against.
   *
   * `request.ip` and nothing else, which is the entire point of `TRUST_PROXY`:
   * Express has already resolved the forwarding chain according to that setting,
   * so this reads the *correct* client address in both topologies without
   * knowing which one it is in. Reading `x-forwarded-for` here instead would let
   * any caller write their own address and mint themselves a fresh bucket per
   * request — the exact bypass `auth.controller.ts` already refused for the
   * audit columns.
   */
  protected override getTracker(req: Record<string, unknown>): Promise<string> {
    return Promise.resolve(readClientAddress(req as ClientAddressSource));
  }

  /**
   * The bucket a request is counted in.
   *
   * The library's default prefixes every key with the controller and handler
   * name, which would give each route its own bucket and leave the *total*
   * request rate unbounded — a caller could spend the full baseline allowance
   * separately on each of a hundred routes. The baseline is therefore keyed on
   * the client alone: one bucket for the whole API, which is what "bounds the
   * request rate" has to mean.
   *
   * The strict tier keeps a bucket per handler, so exhausting login attempts
   * does not also block the refresh that would have recovered the session, and
   * adds the submitted address so that one person's mistyped password does not
   * spend an office's shared allowance.
   */
  protected override generateKey(
    context: ExecutionContext,
    tracker: string,
    name: string,
  ): string {
    if (name !== STRICT_THROTTLER_NAME) {
      return [name, tracker].join(KEY_SEPARATOR);
    }

    const { req } = this.getRequestResponse(context);

    return [
      name,
      context.getHandler().name,
      tracker,
      readSubmittedIdentity(req as SubmittedIdentitySource),
    ].join(KEY_SEPARATOR);
  }

  /**
   * Refuses through the standard error envelope.
   *
   * The library's own `ThrottlerException` carries the fixed string
   * `ThrottlerException: Too Many Requests` and no code, which would be the one
   * response in this API a frontend could not translate — Feature 033's whole
   * point is that a client branches on a code rather than on a sentence. An
   * ordinary `HttpException` carrying a `codedError` payload flows through
   * `AllExceptionsFilter` exactly like every other refusal, so the body a
   * blocked client reads has the same seven fields as a `404`.
   *
   * `Retry-After` is written here rather than left to the base class because the
   * base class suffixes it with the tier name for every tier except `default`: a
   * `429` from the strict tier would otherwise carry `Retry-After-auth`, which
   * no client implements. Writing it here means one standard header whichever
   * tier tripped.
   */
  protected override throwThrottlingException(
    context: ExecutionContext,
    detail: ThrottlerLimitDetail,
  ): Promise<void> {
    const { res } = this.getRequestResponse(context);

    // At least a second: `timeToBlockExpire` is a ceiling of the remaining
    // milliseconds and can round to zero on the request that trips the limit,
    // and `Retry-After: 0` invites the immediate retry this header exists to
    // prevent.
    (res as Response).header(
      RETRY_AFTER_HEADER,
      String(Math.max(1, detail.timeToBlockExpire)),
    );

    throw new HttpException(
      codedError(ERROR_CODES.RATE_LIMIT_EXCEEDED, RATE_LIMIT_EXCEEDED_MESSAGE),
      HttpStatus.TOO_MANY_REQUESTS,
    );
  }
}

/**
 * The address a request is counted against.
 *
 * `request.ip` is Express's answer and already respects `trust proxy`. The
 * socket is a fallback for a request that never went through Express's own
 * resolution — it should not happen over TCP, and a shared `unknown` bucket is
 * the right failure: everybody affected is limited together, which is visible,
 * rather than each getting a fresh bucket, which is a silent hole.
 */
export function readClientAddress(request: ClientAddressSource): string {
  const address = request.ip ?? request.socket?.remoteAddress;

  return address !== undefined && address.length > 0 ? address : UNKNOWN_CLIENT;
}

/**
 * The account a strict-tier request is aimed at, folded exactly as login folds
 * it.
 *
 * `normalizeEmailAddress` is the shared function `@IsEmailAddress()` transforms
 * with, and reusing it is not tidiness — it is the difference between a limiter
 * and a bypass. This runs in a guard, **before** the `ValidationPipe` has built
 * a DTO, so the value here is whatever the caller typed; if it were folded
 * differently from the way `AuthService` looks the account up, then
 * `Maria@company.com` and `maria@company.com` would be two buckets against one
 * row and the strict allowance would double for every capitalisation an attacker
 * could think of.
 *
 * **Nothing is logged.** The address is hashed into a bucket key by the library
 * and never written anywhere, and no password, token or body reaches this
 * function at all — it reads one field and ignores the rest. A limiter that
 * logged its input would be a log of who is trying to sign in and, on the
 * request that mistypes an address into the password box, of the password.
 *
 * A request with no address — `POST /auth/refresh`, which carries a token — is
 * keyed on the client alone.
 */
export function readSubmittedIdentity(
  request: SubmittedIdentitySource,
): string {
  const { body } = request;

  if (typeof body !== 'object' || body === null) {
    return ANONYMOUS_IDENTITY;
  }

  const { email } = body as { email?: unknown };

  if (typeof email !== 'string' || email.trim().length === 0) {
    return ANONYMOUS_IDENTITY;
  }

  // Bounded before it becomes a map key. The body parser caps a payload at 100
  // kB, which is 100 kB of key material per request otherwise, and no address
  // longer than RFC 5321's limit can name an account this application holds.
  return normalizeEmailAddress(email).slice(0, EMAIL_MAX_LENGTH);
}
