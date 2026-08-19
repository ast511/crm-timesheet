import { ExecutionContext, SetMetadata } from '@nestjs/common';
import { Reflector } from '@nestjs/core';

/** The metadata key {@link RefreshRateLimit} writes and the refresh tier reads. */
export const REFRESH_RATE_LIMIT_KEY = 'rate-limit:refresh';

/**
 * Applies the **refresh** rate-limit tier to a route, on top of the baseline.
 *
 * One route carries it — `POST /auth/refresh` — and the tier exists because that
 * route spent two features on the strict tier, where it did not belong.
 *
 * ## Why refresh is not login
 *
 * The strict tier bounds **guessing**. `POST /auth/login` is an unauthenticated
 * bcrypt against a password somebody is proposing, and ten attempts per five
 * minutes is four more than a person who has forgotten theirs will use and
 * nothing at all to an attacker. That is the correct shape for a credential the
 * caller invents.
 *
 * A refresh invents nothing. It presents a token **this server issued**, signed,
 * single-use, and already scoped to one session by an `HttpOnly` cookie the page
 * cannot read. There is no guess to bound: a wrong value is a `401` in one
 * signature check, and a *reused* value is not rate-limited but punished — the
 * whole token family is revoked (`AUTH_REFRESH_TOKEN_REUSED`).
 *
 * What it is instead is **routine, and driven by the client's lifecycle rather
 * than by the person**:
 *
 * | When | Cost |
 * | --- | --- |
 * | A cold page load — reload, new tab, restored window | 1 |
 * | Every rotation, per open tab | 1 per `JWT_ACCESS_TTL` |
 *
 * The frontend's access token lives in memory only, so **every** page load
 * spends one, including on the sign-in screen where nobody is signed in yet: the
 * cookie is `HttpOnly`, so a client cannot know whether it has one without
 * asking. Ten per five minutes is therefore roughly nine reloads, after which
 * the person is signed out — which is exactly the defect this tier was created
 * to fix.
 *
 * ## The number, and the office behind one address
 *
 * `RATE_LIMIT_REFRESH_LIMIT` defaults to **120 per five minutes**, and it is
 * sized for a *shared egress address*, not for a person. That is the case that
 * decides it: a company on one NAT is one bucket, so the allowance has to cover
 * everybody's tabs at once —
 *
 * ```
 * 45 people × 2 tabs, rotating every 15 min   ≈ 30 / 5 min
 * plus reloads, deploys, and morning arrival  ≈ 60 / 5 min
 * ```
 *
 * — with room left for a burst. Reading it as a per-person limit ("120 reloads
 * is generous!") is the mistake: divided across a floor of people it is closer
 * to two.
 *
 * **Being honest about what that buys.** A limit loose enough for an office is
 * loose for a single attacker on that office's address, and that is accepted
 * deliberately, because this tier is not what protects the route. The protection
 * is the token: signed, single-use, rotated, revoked on reuse, and unreadable by
 * script. This tier bounds the *cost of a flood*, and it is the second bound on
 * that — the baseline tier (300 per minute per client, one bucket for the whole
 * API) already limits how fast anybody can call anything.
 *
 * The direction of the trade matters too. Too tight signs employees out for
 * reloading, every day, and looks like a broken session; too loose costs a
 * signature check per request on a route already behind the baseline. Only one
 * of those is a support ticket.
 *
 * ## `TRUST_PROXY` is the same failure in a different costume
 *
 * Behind a reverse proxy with `TRUST_PROXY` unset, Express reports the proxy's
 * address for every request, so the *entire deployment* collapses into one
 * bucket — the NAT case, applied to everybody at once. A wider tier makes that
 * misconfiguration take longer to notice, which is worth stating: if refreshes
 * start being refused in production, check `TRUST_PROXY` before raising this
 * number. See `trust-proxy.config.ts`.
 */
export const RefreshRateLimit = () => SetMetadata(REFRESH_RATE_LIMIT_KEY, true);

/**
 * Whether the route being handled asked for the refresh tier.
 *
 * The same `Reflector` lookup {@link isStrictlyRateLimited} makes and for the
 * same reason: the answer is a property of the route's declaration, handler
 * before class. Exported for the tier's `skipIf` in `rate-limiting.module.ts`,
 * which is its only caller.
 */
export function isRefreshRateLimited(
  reflector: Reflector,
  context: ExecutionContext,
): boolean {
  return (
    reflector.getAllAndOverride<boolean>(REFRESH_RATE_LIMIT_KEY, [
      context.getHandler(),
      context.getClass(),
    ]) === true
  );
}
