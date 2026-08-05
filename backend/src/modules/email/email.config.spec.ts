import { ConfigService } from '@nestjs/config';

import { loadSmtpConfig, SMTP_KEYS } from './email.config';

/**
 * A `ConfigService` reading from a plain object.
 *
 * The real one is backed by the validated `EnvironmentVariables` instance, so
 * `SMTP_PORT` arrives as a number and `SMTP_SECURE` as a boolean. Both spellings
 * are exercised below, because the loader is also correct on its own — the
 * environment contract is a second line of defence, not the only one.
 */
const configServiceOf = (env: Record<string, unknown>): ConfigService =>
  ({ get: (key: string) => env[key] }) as ConfigService;

/** The smallest environment that is a configuration. */
const COMPLETE_ENV = {
  [SMTP_KEYS.host]: 'smtp.example.com',
  [SMTP_KEYS.port]: 587,
  [SMTP_KEYS.user]: 'apikey',
  [SMTP_KEYS.password]: 's3cret',
  [SMTP_KEYS.fromEmail]: 'no-reply@example.com',
};

describe('loadSmtpConfig', () => {
  const load = (overrides: Record<string, unknown> = {}) =>
    loadSmtpConfig(configServiceOf({ ...COMPLETE_ENV, ...overrides }));

  it('reads a complete configuration', () => {
    const { config, enabled, missing } = load({
      [SMTP_KEYS.fromName]: 'HR Management System',
      [SMTP_KEYS.replyTo]: 'hr@example.com',
      [SMTP_KEYS.connectionTimeout]: 5000,
      [SMTP_KEYS.socketTimeout]: 15000,
    });

    expect(enabled).toBe(true);
    expect(missing).toEqual([]);
    expect(config).toEqual({
      host: 'smtp.example.com',
      port: 587,
      secure: false,
      user: 'apikey',
      password: 's3cret',
      fromName: 'HR Management System',
      fromEmail: 'no-reply@example.com',
      replyTo: 'hr@example.com',
      connectionTimeout: 5000,
      socketTimeout: 15000,
    });
  });

  it('leaves the two optional headers undefined when they are not set', () => {
    const { config } = load();

    expect(config?.fromName).toBeUndefined();
    expect(config?.replyTo).toBeUndefined();
  });

  /**
   * The defaults exist because Nodemailer's own are two and ten minutes, which
   * would hold an HTTP request open long after the client gave up.
   */
  it('applies its own timeouts rather than the library defaults', () => {
    const { config } = load();

    expect(config?.connectionTimeout).toBe(10_000);
    expect(config?.socketTimeout).toBe(30_000);
  });

  /**
   * The derivation that separates a working configuration from a connection
   * that hangs: 465 is TLS from the first byte, everything else is STARTTLS.
   */
  it('derives secure from the port when SMTP_SECURE is not set', () => {
    expect(load({ [SMTP_KEYS.port]: 465 }).config?.secure).toBe(true);
    expect(load({ [SMTP_KEYS.port]: 587 }).config?.secure).toBe(false);
    expect(load({ [SMTP_KEYS.port]: 25 }).config?.secure).toBe(false);
  });

  it('prefers SMTP_SECURE over the port when it is set', () => {
    expect(
      load({ [SMTP_KEYS.port]: 465, [SMTP_KEYS.secure]: false }).config?.secure,
    ).toBe(false);
    expect(
      load({ [SMTP_KEYS.port]: 587, [SMTP_KEYS.secure]: true }).config?.secure,
    ).toBe(true);
  });

  it('accepts the string spellings the environment produces', () => {
    const { config, enabled } = load({
      [SMTP_KEYS.port]: '2525',
      [SMTP_KEYS.secure]: 'true',
      [SMTP_KEYS.enabled]: 'false',
      [SMTP_KEYS.connectionTimeout]: '4000',
    });

    expect(config?.port).toBe(2525);
    expect(config?.secure).toBe(true);
    expect(config?.connectionTimeout).toBe(4000);
    expect(enabled).toBe(false);
  });

  it('sends unless SMTP_ENABLED says otherwise', () => {
    expect(load().enabled).toBe(true);
    expect(load({ [SMTP_KEYS.enabled]: true }).enabled).toBe(true);
    expect(load({ [SMTP_KEYS.enabled]: false }).enabled).toBe(false);
  });

  /**
   * The switch is independent of the credentials, which is what lets an
   * environment turn email off without also having to hold a configuration it
   * will never use.
   */
  it('reports the switch even when nothing is configured', () => {
    const { config, enabled } = loadSmtpConfig(
      configServiceOf({ [SMTP_KEYS.enabled]: false }),
    );

    expect(config).toBeNull();
    expect(enabled).toBe(false);
  });

  it.each([
    SMTP_KEYS.host,
    SMTP_KEYS.port,
    SMTP_KEYS.user,
    SMTP_KEYS.password,
    SMTP_KEYS.fromEmail,
  ])('reports no configuration when %s is absent', (key) => {
    const { config, missing } = load({ [key]: undefined });

    expect(config).toBeNull();
    expect(missing).toEqual([key]);
  });

  it('names every missing variable, not just the first', () => {
    const { config, missing } = loadSmtpConfig(configServiceOf({}));

    expect(config).toBeNull();
    expect(missing).toEqual([
      SMTP_KEYS.host,
      SMTP_KEYS.port,
      SMTP_KEYS.user,
      SMTP_KEYS.password,
      SMTP_KEYS.fromEmail,
    ]);
  });

  /** A cleared placeholder in a `.env` is not half a configuration. */
  it.each(['', '   '])('treats a variable set to %p as absent', (blank) => {
    const { config, missing } = load({ [SMTP_KEYS.host]: blank });

    expect(config).toBeNull();
    expect(missing).toEqual([SMTP_KEYS.host]);
  });

  it('trims the values it keeps', () => {
    const { config } = load({ [SMTP_KEYS.host]: '  smtp.example.com  ' });

    expect(config?.host).toBe('smtp.example.com');
  });

  it('refuses a port that is not a whole number', () => {
    expect(load({ [SMTP_KEYS.port]: 'not-a-port' }).config).toBeNull();
    expect(load({ [SMTP_KEYS.port]: 587.5 }).config).toBeNull();
  });

  /** A malformed optional value falls back to the default, not to NaN. */
  it('ignores a timeout that is not a whole number', () => {
    const { config } = load({ [SMTP_KEYS.connectionTimeout]: 'soon' });

    expect(config?.connectionTimeout).toBe(10_000);
  });
});
