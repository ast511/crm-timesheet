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
});
