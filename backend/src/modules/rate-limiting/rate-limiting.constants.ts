/**
 * The rate limiter's literals, in one place.
 *
 * Two of them are wire format — the header a blocked client reads and the
 * message beside the code — and the rest are the names the three tiers are
 * keyed and configured by.
 */

/**
 * The baseline tier, applied to every route in the application.
 *
 * The name is `default` **literally**, and it has to be: `@nestjs/throttler`
 * suffixes its response headers with the throttler's name for every tier except
 * one called `default`, so renaming this would turn `X-RateLimit-Remaining` into
 * `X-RateLimit-Remaining-baseline` for every client in the application.
 */
export const DEFAULT_THROTTLER_NAME = 'default';

/**
 * The strict tier, applied only to routes carrying `@StrictRateLimit()`.
 *
 * It runs *in addition to* the baseline rather than instead of it, which is the
 * whole reason there are two named tiers rather than one limit overridden per
 * route. See `rate-limiting.guard.ts` for what each one catches.
 */
export const STRICT_THROTTLER_NAME = 'auth';

/**
 * The refresh tier, applied only to routes carrying `@RefreshRateLimit()`.
 *
 * It exists because `POST /auth/refresh` was on the strict tier and does not
 * belong there. The strict tier bounds **guessing**: a login attempt is somebody
 * proposing a password, and ten per five minutes is generous for a person and
 * useless for an attacker. A refresh proposes nothing — it presents a credential
 * the server itself issued minutes earlier, and a client makes one per cold page
 * load and one per rotation per open tab. Counting the two against the same
 * allowance meant an ordinary working day could spend an anti-brute-force
 * budget, and the symptom was somebody being signed out for reloading.
 *
 * Like the strict tier it is *additive* to the baseline, so a flood is still
 * bounded by both. See `rate-limiting.guard.ts` for what each bucket is keyed on
 * and `refresh-rate-limit.decorator.ts` for why the number is what it is.
 */
export const REFRESH_THROTTLER_NAME = 'refresh';

/**
 * What a blocked client is told.
 *
 * English and developer-facing, like every other message in this API: the
 * sentence a user sees is the frontend's translation of
 * `RATE_LIMIT_EXCEEDED` (Feature 033). It names no number — how much allowance
 * is left, and over what window, is deployment configuration and would be a
 * useful answer to precisely the caller who is measuring it.
 */
export const RATE_LIMIT_EXCEEDED_MESSAGE =
  'Too many requests; please wait before trying again';

/**
 * How long to wait, in seconds. RFC 9110 §10.2.3.
 *
 * Written on every `429` by `ApiThrottlerGuard` rather than left to the library,
 * which suffixes it per tier — a `429` from the strict tier would otherwise
 * carry `Retry-After-auth`, a header no client has ever heard of.
 */
export const RETRY_AFTER_HEADER = 'Retry-After';

/**
 * The tracker for a request whose address cannot be determined.
 *
 * It should not happen over TCP, and the value is deliberately a shared bucket
 * rather than a random one: if it ever does happen, everybody affected being
 * limited together is a visible problem, while a fresh bucket per request would
 * be a silent hole.
 */
export const UNKNOWN_CLIENT = 'unknown';

/**
 * Stands in for the identity component when a request submitted none.
 *
 * The strict tier keys on the address somebody is guessing at, and three of its
 * four routes carry one in the body. `POST /auth/reset-password` does not — it
 * carries a token — so its bucket is keyed on the client alone. A fixed
 * placeholder rather than an empty string keys that explicitly, so the key never
 * ends in a dangling separator that a real value could collide with.
 */
export const ANONYMOUS_IDENTITY = '-';

/** Separates the components of a bucket key. */
export const KEY_SEPARATOR = ':';

/** The throttler measures windows in milliseconds; the environment states seconds. */
export const MILLISECONDS_PER_SECOND = 1000;
