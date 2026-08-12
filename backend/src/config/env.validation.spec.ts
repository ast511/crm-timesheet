import {
  DEFAULT_PORT,
  NodeEnvironment,
  validateEnvironment,
} from './env.validation';

const DATABASE_URL = 'postgresql://user:s3cret@localhost:5432/db?schema=public';

/**
 * The two signing keys, which Feature 032 made mandatory.
 *
 * They join `DATABASE_URL` in the baseline every case starts from, because
 * "the environment is otherwise valid" is what each of these tests is varying
 * one thing against — and an application that cannot sign a token has no
 * legitimate degraded state to start in. Long enough to clear the 32-character
 * floor, and visibly not secrets.
 */
const JWT_ACCESS_SECRET = 'test-access-secret-0123456789abcdef';
const JWT_REFRESH_SECRET = 'test-refresh-secret-0123456789abcdef';

/**
 * Where the emailed activation and reset links point, which Feature 036 made
 * mandatory.
 *
 * It joins the baseline for the same reason the two signing keys did, and the
 * reason it has no default is worth restating here: a guessed origin does not
 * fail loudly. It produces invitations delivered successfully to a link nobody
 * can open, and the symptom arrives days later as a colleague who never got in.
 */
const APP_WEB_URL = 'https://hr.example.com';

describe('validateEnvironment', () => {
  const validateWith = (overrides: Record<string, unknown> = {}) =>
    validateEnvironment({
      DATABASE_URL,
      JWT_ACCESS_SECRET,
      JWT_REFRESH_SECRET,
      APP_WEB_URL,
      ...overrides,
    });

  it('coerces PORT to a number', () => {
    expect(validateWith({ PORT: '4000' }).PORT).toBe(4000);
  });

  it('applies the declared defaults when optional variables are absent', () => {
    const config = validateWith();

    expect(config.PORT).toBe(DEFAULT_PORT);
    expect(config.NODE_ENV).toBe(NodeEnvironment.Development);
    expect(config.CORS_ORIGINS).toBeUndefined();
  });

  it('rejects a PORT that is not an integer', () => {
    expect(() => validateWith({ PORT: 'abc' })).toThrow(
      /Invalid environment configuration/,
    );
  });

  it('rejects a PORT outside the valid range', () => {
    expect(() => validateWith({ PORT: '0' })).toThrow(/PORT/);
  });

  it('rejects an unknown NODE_ENV', () => {
    expect(() => validateWith({ NODE_ENV: 'staging' })).toThrow(/NODE_ENV/);
  });

  it('requires DATABASE_URL', () => {
    expect(() => validateEnvironment({})).toThrow(/DATABASE_URL/);
  });

  it('rejects a DATABASE_URL that is not a postgres connection string', () => {
    expect(() =>
      validateEnvironment({ DATABASE_URL: 'mysql://localhost:3306/db' }),
    ).toThrow(/DATABASE_URL must be a postgresql:\/\/ connection string/);
  });

  it('never puts the rejected value in the error message', () => {
    // A leaked DATABASE_URL would print the database password to the logs.
    expect(() =>
      validateEnvironment({ DATABASE_URL: 'mysql://user:s3cret@localhost/db' }),
    ).not.toThrow(/s3cret/);
  });

  it('accepts a well-formed CORS_ORIGINS list', () => {
    const config = validateWith({
      CORS_ORIGINS: 'http://localhost:5173,https://crm.example.com',
    });

    expect(config.CORS_ORIGINS).toBe(
      'http://localhost:5173,https://crm.example.com',
    );
  });

  it.each(['*', ''])('accepts CORS_ORIGINS set to %p', (corsOrigins) => {
    expect(() => validateWith({ CORS_ORIGINS: corsOrigins })).not.toThrow();
  });

  it.each([
    'localhost:5173',
    'http://localhost:5173/',
    'http://localhost:5173/api',
    'http://localhost:5173,not-an-origin',
  ])('rejects CORS_ORIGINS set to %p', (corsOrigins) => {
    expect(() => validateWith({ CORS_ORIGINS: corsOrigins })).toThrow(
      /CORS_ORIGINS/,
    );
  });

  /**
   * The SMTP block is optional as a whole — an environment with no mail server
   * must still boot — so what is asserted here is the other half of that rule:
   * a variable that *is* set has to make sense, and it arrives typed.
   */
  describe('SMTP', () => {
    it('accepts an environment with no mail server at all', () => {
      const config = validateWith();

      expect(config.SMTP_HOST).toBeUndefined();
      expect(config.SMTP_PORT).toBeUndefined();
      expect(config.SMTP_ENABLED).toBeUndefined();
    });

    it('coerces the port and the two switches out of their string form', () => {
      const config = validateWith({
        SMTP_PORT: '587',
        SMTP_SECURE: 'false',
        SMTP_ENABLED: 'true',
        SMTP_CONNECTION_TIMEOUT: '5000',
      });

      expect(config.SMTP_PORT).toBe(587);
      expect(config.SMTP_SECURE).toBe(false);
      expect(config.SMTP_ENABLED).toBe(true);
      expect(config.SMTP_CONNECTION_TIMEOUT).toBe(5000);
    });

    it.each(['abc', '0', '70000', '587.5'])(
      'rejects SMTP_PORT set to %p',
      (port) => {
        expect(() => validateWith({ SMTP_PORT: port })).toThrow(/SMTP_PORT/);
      },
    );

    /** Only the two exact spellings, so a typo cannot become a silent `false`. */
    it.each(['yes', '1', 'TRUE'])('rejects SMTP_SECURE set to %p', (secure) => {
      expect(() => validateWith({ SMTP_SECURE: secure })).toThrow(
        /SMTP_SECURE/,
      );
    });

    it('rejects a sending address that is not an address', () => {
      expect(() => validateWith({ SMTP_FROM_EMAIL: 'no-reply' })).toThrow(
        /SMTP_FROM_EMAIL/,
      );
    });

    /**
     * A cleared placeholder must behave the same everywhere: the email module
     * reads a blank variable as absent, so the contract cannot refuse to boot
     * over one.
     */
    it.each(['', '   '])(
      'treats a sending address set to %p as not set',
      (blank) => {
        expect(() => validateWith({ SMTP_FROM_EMAIL: blank })).not.toThrow();
      },
    );

    it('rejects a reply address that is not an address', () => {
      expect(() => validateWith({ SMTP_REPLY_TO: 'hr@' })).toThrow(
        /SMTP_REPLY_TO/,
      );
    });

    /** Seconds written where milliseconds were asked for. */
    it('rejects a timeout below the one-second floor', () => {
      expect(() => validateWith({ SMTP_SOCKET_TIMEOUT: '30' })).toThrow(
        /SMTP_SOCKET_TIMEOUT/,
      );
    });
  });

  describe('the notification delivery scheduler', () => {
    /**
     * Unset and `true` have to be the same thing at every call site, so only an
     * explicit `false` stops the engine's two scheduled jobs.
     */
    it('leaves the switch unset when the environment says nothing', () => {
      expect(validateWith().NOTIFICATION_SCHEDULER_ENABLED).toBeUndefined();
    });

    it('coerces the switch out of its string form', () => {
      expect(
        validateWith({ NOTIFICATION_SCHEDULER_ENABLED: 'false' })
          .NOTIFICATION_SCHEDULER_ENABLED,
      ).toBe(false);
      expect(
        validateWith({ NOTIFICATION_SCHEDULER_ENABLED: 'true' })
          .NOTIFICATION_SCHEDULER_ENABLED,
      ).toBe(true);
    });

    it('rejects a value that is not a boolean', () => {
      expect(() =>
        validateWith({ NOTIFICATION_SCHEDULER_ENABLED: 'sometimes' }),
      ).toThrow(/NOTIFICATION_SCHEDULER_ENABLED/);
    });
  });

  /**
   * The signing configuration (Feature 032).
   *
   * The two secrets are the only variables besides `DATABASE_URL` the
   * application refuses to start without, and the reasoning is recorded on the
   * contract itself: there is no degraded state for an API that cannot sign a
   * token, and both alternatives — invent one at boot, or ship a default — are
   * worse than not starting.
   */
  describe('the signing configuration', () => {
    it('requires both secrets', () => {
      expect(() =>
        validateEnvironment({ DATABASE_URL, JWT_REFRESH_SECRET }),
      ).toThrow(/JWT_ACCESS_SECRET/);

      expect(() =>
        validateEnvironment({ DATABASE_URL, JWT_ACCESS_SECRET }),
      ).toThrow(/JWT_REFRESH_SECRET/);
    });

    /**
     * HS256 is HMAC-SHA-256, so a key shorter than the digest is the weakest
     * link — and a weak secret produces tokens that verify perfectly and forge
     * just as easily, so nothing downstream would ever notice.
     */
    it('rejects a secret shorter than the digest it keys', () => {
      expect(() => validateWith({ JWT_ACCESS_SECRET: 'short' })).toThrow(
        /JWT_ACCESS_SECRET/,
      );
    });

    /**
     * One secret for both kinds of token would mean a refresh token verifies as
     * an access token: the long-lived credential a client stores would work
     * directly against every protected route.
     */
    it('rejects one secret used for both kinds of token', () => {
      expect(() =>
        validateWith({ JWT_REFRESH_SECRET: JWT_ACCESS_SECRET }),
      ).toThrow(/JWT_REFRESH_SECRET must not be the same value/);
    });

    it('defaults the two lifetimes to 15 minutes and 7 days', () => {
      const config = validateWith();

      expect(config.JWT_ACCESS_TTL).toBe(900);
      expect(config.JWT_REFRESH_TTL).toBe(604_800);
    });

    it('coerces the lifetimes out of their string form', () => {
      const config = validateWith({
        JWT_ACCESS_TTL: '300',
        JWT_REFRESH_TTL: '86400',
      });

      expect(config.JWT_ACCESS_TTL).toBe(300);
      expect(config.JWT_REFRESH_TTL).toBe(86_400);
    });

    /**
     * The access token is the one that cannot be revoked, so its lifetime is the
     * window in which a deactivated account keeps working. An hour is the
     * longest that is defensible.
     */
    it('refuses an access lifetime longer than an hour', () => {
      expect(() => validateWith({ JWT_ACCESS_TTL: '7200' })).toThrow(
        /JWT_ACCESS_TTL/,
      );
    });

    it('refuses a refresh lifetime beyond ninety days', () => {
      expect(() => validateWith({ JWT_REFRESH_TTL: '99999999' })).toThrow(
        /JWT_REFRESH_TTL/,
      );
    });

    /** A thrown error becomes a startup log, and never carries a key. */
    it('never puts a secret in the message it refuses with', () => {
      expect(() => validateWith({ JWT_ACCESS_SECRET: 'short' })).not.toThrow(
        /short/,
      );
    });
  });

  /**
   * The account lifecycle's three variables (Feature 036).
   *
   * `APP_WEB_URL` is the only one of the three that is required, and the tests
   * below are mostly about *why*: it is the one whose absence cannot be
   * defaulted around, because a guessed origin produces invitations that are
   * emailed successfully to a link nobody can open.
   */
  describe('the account lifecycle', () => {
    it('requires APP_WEB_URL, with no default to fall back on', () => {
      expect(() =>
        validateEnvironment({
          DATABASE_URL,
          JWT_ACCESS_SECRET,
          JWT_REFRESH_SECRET,
        }),
      ).toThrow(/APP_WEB_URL/);
    });

    it.each([
      'https://hr.company.com',
      'http://localhost:5173',
      'https://hr.company.com:8443',
    ])('accepts the origin %s', (APP_WEB_URL) => {
      expect(validateWith({ APP_WEB_URL }).APP_WEB_URL).toBe(APP_WEB_URL);
    });

    /**
     * A path or a query would end up spliced in front of `?token=`, producing a
     * URL that resolves to the wrong screen — or to none.
     */
    it.each([
      ['a path', 'https://hr.company.com/app'],
      ['a query', 'https://hr.company.com?x=1'],
      ['no scheme', 'hr.company.com'],
      ['a blank value', '   '],
    ])('refuses a web URL with %s', (_case, APP_WEB_URL) => {
      expect(() => validateWith({ APP_WEB_URL })).toThrow(/APP_WEB_URL/);
    });

    it('defaults the two link lifetimes to 72 hours and 1 hour', () => {
      const config = validateWith();

      expect(config.ACCOUNT_ACTIVATION_TTL).toBe(259_200);
      expect(config.ACCOUNT_PASSWORD_RESET_TTL).toBe(3600);
    });

    it('coerces the lifetimes out of their string form', () => {
      const config = validateWith({
        ACCOUNT_ACTIVATION_TTL: '86400',
        ACCOUNT_PASSWORD_RESET_TTL: '1800',
      });

      expect(config.ACCOUNT_ACTIVATION_TTL).toBe(86_400);
      expect(config.ACCOUNT_PASSWORD_RESET_TTL).toBe(1800);
    });

    /**
     * Mail is store-and-forward and a greylisting server routinely holds a first
     * message for minutes. A one-minute link is not a tight security setting; it
     * is an onboarding flow that never works.
     */
    it.each(['ACCOUNT_ACTIVATION_TTL', 'ACCOUNT_PASSWORD_RESET_TTL'])(
      'refuses a %s shorter than a mail delivery',
      (key) => {
        expect(() => validateWith({ [key]: '60' })).toThrow(new RegExp(key));
      },
    );

    /**
     * The two ceilings differ by a wide margin, and deliberately: an activation
     * link opens an empty account, a reset link opens a real one.
     */
    it('lets an activation link last a week but not a reset link', () => {
      const week = String(7 * 86_400);

      expect(validateWith({ ACCOUNT_ACTIVATION_TTL: week })).toBeDefined();
      expect(() => validateWith({ ACCOUNT_PASSWORD_RESET_TTL: week })).toThrow(
        /ACCOUNT_PASSWORD_RESET_TTL/,
      );
    });
  });

  /**
   * Rate limiting (Feature 034).
   *
   * All five are optional, so an environment that says nothing about them still
   * boots — and boots *limited*, with the declared defaults, rather than
   * unlimited. That is the half worth asserting: an absent variable must not be
   * read as "no limit".
   */
  describe('rate limiting', () => {
    it('applies both tiers when the environment says nothing', () => {
      const config = validateWith();

      expect(config.RATE_LIMIT_DEFAULT_LIMIT).toBe(300);
      expect(config.RATE_LIMIT_DEFAULT_TTL).toBe(60);
      expect(config.RATE_LIMIT_AUTH_LIMIT).toBe(10);
      expect(config.RATE_LIMIT_AUTH_TTL).toBe(300);
    });

    /** The strict tier is only strict if it is smaller. */
    it('defaults the authentication tier well below the baseline', () => {
      const config = validateWith();

      expect(config.RATE_LIMIT_AUTH_LIMIT).toBeLessThan(
        config.RATE_LIMIT_DEFAULT_LIMIT,
      );
    });

    it('coerces the limits and windows out of their string form', () => {
      const config = validateWith({
        RATE_LIMIT_DEFAULT_LIMIT: '120',
        RATE_LIMIT_DEFAULT_TTL: '30',
        RATE_LIMIT_AUTH_LIMIT: '5',
        RATE_LIMIT_AUTH_TTL: '600',
      });

      expect(config.RATE_LIMIT_DEFAULT_LIMIT).toBe(120);
      expect(config.RATE_LIMIT_DEFAULT_TTL).toBe(30);
      expect(config.RATE_LIMIT_AUTH_LIMIT).toBe(5);
      expect(config.RATE_LIMIT_AUTH_TTL).toBe(600);
    });

    /**
     * A limit of zero would refuse every request including the health check,
     * and a hundred thousand is somebody switching the feature off without
     * saying so. Both are refused at startup, where they can still be discussed.
     */
    it.each(['0', '-1', '2.5', 'abc', '1000000'])(
      'refuses a baseline limit of %p',
      (limit) => {
        expect(() => validateWith({ RATE_LIMIT_DEFAULT_LIMIT: limit })).toThrow(
          /RATE_LIMIT_DEFAULT_LIMIT/,
        );
      },
    );

    it.each(['0', '-1', 'abc', '100000000'])(
      'refuses an authentication window of %p',
      (ttl) => {
        expect(() => validateWith({ RATE_LIMIT_AUTH_TTL: ttl })).toThrow(
          /RATE_LIMIT_AUTH_TTL/,
        );
      },
    );

    /**
     * A window longer than a day stops being a rate limit and becomes a quota —
     * and the in-memory store behind it loses every counter on restart, which is
     * the wrong place to keep a day of history.
     */
    it('refuses a window beyond a day', () => {
      expect(() => validateWith({ RATE_LIMIT_DEFAULT_TTL: '90000' })).toThrow(
        /RATE_LIMIT_DEFAULT_TTL/,
      );
    });
  });

  /**
   * `TRUST_PROXY` (Feature 034).
   *
   * The variable that decides what `request.ip` resolves to, and therefore who
   * the rate limiter counts a request against. Express accepts a great deal here
   * and complains about very little, so a typo would otherwise become a backend
   * that resolves addresses in a way nobody intended — and a limiter that does
   * not work. The parsing itself is asserted in `trust-proxy.config.spec.ts`.
   */
  describe('the proxy configuration', () => {
    it('trusts no proxy when the environment says nothing', () => {
      expect(validateWith().TRUST_PROXY).toBeUndefined();
    });

    it.each([
      'false',
      'true',
      '0',
      '1',
      '2',
      'loopback',
      '10.0.0.1',
      '10.0.0.0/8',
      '::1',
      'loopback,10.0.0.0/8',
      '',
    ])('accepts TRUST_PROXY set to %p', (trustProxy) => {
      expect(() => validateWith({ TRUST_PROXY: trustProxy })).not.toThrow();
    });

    it.each(['yes', 'on', 'localhost', 'http://proxy', 'my-proxy.internal'])(
      'rejects TRUST_PROXY set to %p',
      (trustProxy) => {
        expect(() => validateWith({ TRUST_PROXY: trustProxy })).toThrow(
          /TRUST_PROXY/,
        );
      },
    );
  });
});
