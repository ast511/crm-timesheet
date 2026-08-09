import { ExecutionContext, SetMetadata } from '@nestjs/common';
import { Reflector } from '@nestjs/core';

/** The metadata key {@link StrictRateLimit} writes and the strict tier reads. */
export const STRICT_RATE_LIMIT_KEY = 'rate-limit:strict';

/**
 * Applies the **strict** rate-limit tier to a route, on top of the baseline.
 *
 * Every route in this application is already limited: `ApiThrottlerGuard` is an
 * `APP_GUARD`, so the baseline tier applies to a route added next year because
 * nobody did anything — the same allowlist-over-denylist posture `@Public()`
 * records for authentication. This decorator does not *add* limiting to a route
 * that had none; it adds a second, much smaller allowance to a route that needs
 * one.
 *
 * **It is additive, not an override**, and that distinction is the design. A
 * route carrying this decorator is counted in both tiers: the baseline bounds
 * how fast one client can hit the API at all, and the strict tier bounds how
 * many times one client can guess at one account. Replacing the baseline instead
 * — which is what a per-route `@Throttle()` does — would have left the strict
 * bucket keyed on the submitted address as the *only* counter, and an attacker
 * spraying one password across a thousand addresses would get a fresh bucket
 * every request and never be limited at all.
 *
 * ## Where it is used, and why those two
 *
 * `POST /auth/login` and `POST /auth/refresh`, the two routes Feature 032
 * identified as the gap and recorded as its highest-priority follow-up:
 *
 * > Both are unauthenticated and both do real work per request — a bcrypt and a
 * > database lookup.
 *
 * They are also the only `@Public()` routes in the application that *cost*
 * anything. `GET /` and `GET /health` are public too and are deliberately left
 * on the baseline: they read no table and are polled by a container runtime that
 * restarts the service when they fail, so a strict limit there would be a
 * liveness probe that trips its own outage.
 *
 * ## Adding a route later
 *
 * A report export is the obvious next candidate — it reads six tables and
 * renders a PDF. Adding this decorator is the whole change; the numbers stay in
 * the environment and no new tier is needed. What a new route must not do is
 * assume the strict allowance is per-route in the way the baseline is
 * per-client: see `generateKey` in `rate-limiting.guard.ts` for what each bucket
 * is keyed on.
 */
export const StrictRateLimit = () => SetMetadata(STRICT_RATE_LIMIT_KEY, true);

/**
 * Whether the route being handled asked for the strict tier.
 *
 * Read through a `Reflector` rather than from the request, because the answer is
 * a property of the route's declaration. Handler before class, which is
 * `getAllAndOverride`'s order and the one that reads correctly: the decorator on
 * a controller covers every route in it, and on a method covers that one — the
 * same rule `JwtAuthGuard` applies to `@Public()`.
 *
 * Exported because the strict tier's `skipIf` in `rate-limiting.module.ts` and
 * nothing else calls it. It lives here, beside the decorator whose metadata it
 * reads, so the writer and the reader of one key stay in one file.
 */
export function isStrictlyRateLimited(
  reflector: Reflector,
  context: ExecutionContext,
): boolean {
  return (
    reflector.getAllAndOverride<boolean>(STRICT_RATE_LIMIT_KEY, [
      context.getHandler(),
      context.getClass(),
    ]) === true
  );
}
