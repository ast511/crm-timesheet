import { ConfigService } from '@nestjs/config';

import { MILLISECONDS_PER_SECOND } from './rate-limiting.constants';

/**
 * Names of the environment variables this module reads, in one place.
 *
 * The same technique `auth.config.ts` uses for `JWT_KEYS` and `email.config.ts`
 * for `SMTP_KEYS`: the strings appear here, and the loader, the environment
 * contract's tests and the feature documentation derive from them rather than
 * repeating a literal that a typo would silently break.
 */
export const RATE_LIMIT_KEYS = {
  defaultLimit: 'RATE_LIMIT_DEFAULT_LIMIT',
  defaultTtl: 'RATE_LIMIT_DEFAULT_TTL',
  authLimit: 'RATE_LIMIT_AUTH_LIMIT',
  authTtl: 'RATE_LIMIT_AUTH_TTL',
  refreshLimit: 'RATE_LIMIT_REFRESH_LIMIT',
  refreshTtl: 'RATE_LIMIT_REFRESH_TTL',
} as const;

/** The three tiers, in the milliseconds the throttler measures windows in. */
export interface RateLimitConfig {
  /** Requests a client may make to the whole API per {@link defaultTtlMs}. */
  readonly defaultLimit: number;
  /** The baseline window, in milliseconds. */
  readonly defaultTtlMs: number;
  /** Attempts allowed against an authentication route per {@link authTtlMs}. */
  readonly authLimit: number;
  /** The strict window, in milliseconds. */
  readonly authTtlMs: number;
  /**
   * Session rotations allowed per {@link refreshTtlMs}.
   *
   * Deliberately much larger than {@link authLimit} and sized for a shared
   * egress address rather than for a person — see
   * `decorators/refresh-rate-limit.decorator.ts`.
   */
  readonly refreshLimit: number;
  /** The refresh window, in milliseconds. */
  readonly refreshTtlMs: number;
}

/**
 * Reads both tiers from the environment.
 *
 * **Seconds in, milliseconds out.** The environment states windows in seconds,
 * because that is the unit `JWT_ACCESS_TTL` and `JWT_REFRESH_TTL` already use
 * and an operator should not have to remember which variable in one file is
 * counted differently from the others. `@nestjs/throttler` measures in
 * milliseconds. The conversion happens here, once, so no call site multiplies by
 * a thousand and none forgets to.
 *
 * Like `loadJwtConfig` and unlike `loadSmtpConfig`, **this throws** rather than
 * degrading. There is no useful half-configured rate limiter: a limit that
 * failed to load would either be absent — leaving the API unprotected while
 * appearing to be protected, which is worse than never having installed one — or
 * quietly replaced by a hardcoded guess that the operator's own value was
 * supposed to override.
 *
 * In practice it never throws in the running application: `env.validation.ts`
 * has already refused to boot on a value that is not a whole number in range,
 * and has already applied the defaults for the four optional variables. The
 * checks here are what make this function correct on its own, for a test or for
 * any future caller that reads the variables without going through that
 * contract.
 */
export function loadRateLimitConfig(
  configService: ConfigService,
): RateLimitConfig {
  return {
    defaultLimit: readCount(configService, RATE_LIMIT_KEYS.defaultLimit),
    defaultTtlMs: readWindowMs(configService, RATE_LIMIT_KEYS.defaultTtl),
    authLimit: readCount(configService, RATE_LIMIT_KEYS.authLimit),
    authTtlMs: readWindowMs(configService, RATE_LIMIT_KEYS.authTtl),
    refreshLimit: readCount(configService, RATE_LIMIT_KEYS.refreshLimit),
    refreshTtlMs: readWindowMs(configService, RATE_LIMIT_KEYS.refreshTtl),
  };
}

/** A positive whole number of requests. */
function readCount(configService: ConfigService, key: string): number {
  const value = configService.getOrThrow<number | string>(key);
  const count = typeof value === 'number' ? value : Number(value);

  if (!Number.isInteger(count) || count <= 0) {
    throw new Error(`${key} must be a positive whole number of requests`);
  }

  return count;
}

/** A positive whole number of seconds, returned as milliseconds. */
function readWindowMs(configService: ConfigService, key: string): number {
  const value = configService.getOrThrow<number | string>(key);
  const seconds = typeof value === 'number' ? value : Number(value);

  if (!Number.isInteger(seconds) || seconds <= 0) {
    throw new Error(`${key} must be a positive whole number of seconds`);
  }

  return seconds * MILLISECONDS_PER_SECOND;
}
