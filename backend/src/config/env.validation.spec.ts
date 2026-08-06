import {
  DEFAULT_PORT,
  NodeEnvironment,
  validateEnvironment,
} from './env.validation';

const DATABASE_URL = 'postgresql://user:s3cret@localhost:5432/db?schema=public';

describe('validateEnvironment', () => {
  const validateWith = (overrides: Record<string, unknown> = {}) =>
    validateEnvironment({ DATABASE_URL, ...overrides });

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
});
