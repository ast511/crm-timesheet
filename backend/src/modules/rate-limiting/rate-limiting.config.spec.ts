import { ConfigService } from '@nestjs/config';

import { loadRateLimitConfig, RATE_LIMIT_KEYS } from './rate-limiting.config';
import { MILLISECONDS_PER_SECOND } from './rate-limiting.constants';

const VALID = {
  [RATE_LIMIT_KEYS.defaultLimit]: 300,
  [RATE_LIMIT_KEYS.defaultTtl]: 60,
  [RATE_LIMIT_KEYS.authLimit]: 10,
  [RATE_LIMIT_KEYS.authTtl]: 300,
  [RATE_LIMIT_KEYS.refreshLimit]: 120,
  [RATE_LIMIT_KEYS.refreshTtl]: 300,
};

/** A `ConfigService` that answers from a plain record, as the real one does. */
function configWith(values: Record<string, unknown>): ConfigService {
  return {
    getOrThrow: (key: string) => {
      if (!(key in values)) {
        throw new Error(`Configuration key "${key}" does not exist`);
      }

      return values[key];
    },
  } as unknown as ConfigService;
}

describe('loadRateLimitConfig', () => {
  /**
   * Seconds in, milliseconds out. The environment states windows in the unit
   * `JWT_ACCESS_TTL` already uses; the throttler measures in milliseconds. The
   * conversion happens here so that no call site multiplies by a thousand and
   * none forgets to.
   */
  it('converts every window from seconds to milliseconds', () => {
    const config = loadRateLimitConfig(configWith(VALID));

    expect(config).toEqual({
      defaultLimit: 300,
      defaultTtlMs: 60 * MILLISECONDS_PER_SECOND,
      authLimit: 10,
      authTtlMs: 300 * MILLISECONDS_PER_SECOND,
      refreshLimit: 120,
      refreshTtlMs: 300 * MILLISECONDS_PER_SECOND,
    });
  });

  /**
   * The whole point of the third tier: a refresh is routine traffic and a login
   * attempt is a guess, so the routine one has to be allowed to be much more
   * frequent. A deployment that made them equal would have re-created the defect
   * the tier was added to fix.
   */
  it('reads the refresh allowance separately from the strict one', () => {
    const config = loadRateLimitConfig(
      configWith({ ...VALID, [RATE_LIMIT_KEYS.refreshLimit]: 240 }),
    );

    expect(config.refreshLimit).toBe(240);
    expect(config.authLimit).toBe(10);
  });

  /**
   * `env.validation.ts` coerces these to numbers before the application reads
   * them; the string branch is what keeps this function correct for a caller
   * that did not go through that contract.
   */
  it('accepts the values in their string form', () => {
    const config = loadRateLimitConfig(
      configWith({
        [RATE_LIMIT_KEYS.defaultLimit]: '120',
        [RATE_LIMIT_KEYS.defaultTtl]: '30',
        [RATE_LIMIT_KEYS.authLimit]: '5',
        [RATE_LIMIT_KEYS.authTtl]: '600',
        [RATE_LIMIT_KEYS.refreshLimit]: '60',
        [RATE_LIMIT_KEYS.refreshTtl]: '900',
      }),
    );

    expect(config.defaultLimit).toBe(120);
    expect(config.defaultTtlMs).toBe(30_000);
    expect(config.authLimit).toBe(5);
    expect(config.authTtlMs).toBe(600_000);
    expect(config.refreshLimit).toBe(60);
    expect(config.refreshTtlMs).toBe(900_000);
  });

  it('names the variable it wanted when one is missing', () => {
    const { [RATE_LIMIT_KEYS.authLimit]: _omitted, ...rest } = VALID;

    expect(() => loadRateLimitConfig(configWith(rest))).toThrow(
      new RegExp(RATE_LIMIT_KEYS.authLimit),
    );
  });

  /**
   * There is no useful half-configured rate limiter, which is why this throws
   * where `loadSmtpConfig` returns `null`: a limit that failed to load would
   * leave the API unprotected while appearing to be protected.
   */
  it.each(['abc', '0', '-5', '2.5', ''])(
    'refuses a limit of %p rather than falling back',
    (limit) => {
      expect(() =>
        loadRateLimitConfig(
          configWith({ ...VALID, [RATE_LIMIT_KEYS.defaultLimit]: limit }),
        ),
      ).toThrow(new RegExp(RATE_LIMIT_KEYS.defaultLimit));
    },
  );

  it.each(['abc', '0', '-1', '1.5'])('refuses a window of %p', (ttl) => {
    expect(() =>
      loadRateLimitConfig(
        configWith({ ...VALID, [RATE_LIMIT_KEYS.authTtl]: ttl }),
      ),
    ).toThrow(new RegExp(RATE_LIMIT_KEYS.authTtl));
  });
});
