import { SetMetadata } from '@nestjs/common';

/** The metadata key {@link Public} writes and `JwtAuthGuard` reads. */
export const IS_PUBLIC_KEY = 'auth:isPublic';

/**
 * Exempts a route from **authentication**, and from nothing else.
 *
 * `JwtAuthGuard` is registered globally, so the default for every route in this
 * application — the eighteen modules that existed before this feature and every
 * one that comes after — is that a valid access token is required. That default
 * is the point: a route added next year is protected because nobody did
 * anything, rather than unprotected because somebody forgot a decorator. An
 * allowlist fails closed; a denylist fails open, and the failure is invisible
 * until somebody finds it.
 *
 * **This is authentication-level only.** `@Public()` means "this route does not
 * need to know who is calling". It does not mean "anyone may do this": that
 * question — may *this* caller do *this* — is `@RequirePermission()` and
 * `PermissionsGuard` (Feature 035). A `@Public()` route is one that neither
 * guard inspects, while every other route is authenticated here and authorised
 * there. Marking something `@Public()` to make a test pass is therefore a
 * decision that means considerably more than it looks.
 *
 * **The two cannot be combined.** A public route has no caller, so there is no
 * permission set to check, and the pair is refused at startup by
 * `PublicRouteValidator` rather than left to produce a route that answers `401`
 * to everybody who tries it.
 *
 * It is used on exactly four routes in this feature, and each has to be public
 * for a reason that would not be fixed by better credentials:
 *
 * - `POST /auth/login` — the endpoint that *issues* the token cannot require it.
 * - `POST /auth/refresh` — authenticated by the refresh token in its body, which
 *   is a stronger credential than the expired access token a client would
 *   otherwise be sending. Requiring both would make a session unrecoverable in
 *   the exact situation refresh exists for.
 * - `GET /` and `GET /health` — read by a container runtime and a load balancer,
 *   neither of which has an account, and both of which restart the service when
 *   the check fails. A liveness probe behind authentication is an outage waiting
 *   for a token to expire.
 *
 * Applied to a controller class it covers every route in it; applied to a method
 * it covers that one. `JwtAuthGuard` reads both, handler first.
 */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
