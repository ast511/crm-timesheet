import { ConfigService } from '@nestjs/config';

/**
 * Names of the environment variables this module reads, in one place.
 *
 * The same technique `email.config.ts` uses for `SMTP_KEYS`: the strings appear
 * here, and the loader, the environment contract's tests and the feature
 * documentation derive from them rather than repeating a literal that a typo
 * would silently break.
 */
export const JWT_KEYS = {
  accessSecret: 'JWT_ACCESS_SECRET',
  refreshSecret: 'JWT_REFRESH_SECRET',
  accessTtl: 'JWT_ACCESS_TTL',
  refreshTtl: 'JWT_REFRESH_TTL',
} as const;

/** Everything needed to sign and verify the two kinds of token. */
export interface JwtConfig {
  /** HS256 key for access tokens. */
  readonly accessSecret: string;
  /** HS256 key for refresh tokens. Never the same value as the access one. */
  readonly refreshSecret: string;
  /** Seconds an access token stays valid. */
  readonly accessTtlSeconds: number;
  /** Seconds a refresh token stays valid. */
  readonly refreshTtlSeconds: number;
}

/**
 * Reads the token settings from the environment.
 *
 * **This one throws**, which is the difference from `loadSmtpConfig` and is the
 * whole reason both functions exist rather than one shared reader. Email
 * degrades: a deployment with no mail server starts, reports itself
 * unconfigured through a health endpoint and refuses to send. Authentication has
 * no such state — an API that cannot sign a token cannot answer a single
 * request, so "start anyway and report it" would mean starting a server that
 * `401`s everything, with a health endpoint nobody would read before the first
 * complaint.
 *
 * In practice it never throws in the running application: `env.validation.ts`
 * has already refused to boot on a missing or short secret, and on a lifetime
 * outside its bounds. The checks here are what make this function correct on its
 * own — for a test, or for any future caller that reads the variables without
 * going through that contract — and `getOrThrow` names the variable it wanted
 * rather than reporting `undefined` further down.
 *
 * No value is ever included in a message. A thrown error becomes a startup log,
 * and a startup log that prints a signing key is a signing key in the log
 * aggregator.
 */
export function loadJwtConfig(configService: ConfigService): JwtConfig {
  return {
    accessSecret: readSecret(configService, JWT_KEYS.accessSecret),
    refreshSecret: readSecret(configService, JWT_KEYS.refreshSecret),
    accessTtlSeconds: readSeconds(configService, JWT_KEYS.accessTtl),
    refreshTtlSeconds: readSeconds(configService, JWT_KEYS.refreshTtl),
  };
}

/** A non-blank secret, or an error naming the variable — never its value. */
function readSecret(configService: ConfigService, key: string): string {
  const secret = configService.getOrThrow<string>(key).trim();

  if (secret.length === 0) {
    throw new Error(`${key} must not be empty`);
  }

  return secret;
}

/**
 * A whole number of seconds.
 *
 * `env.validation.ts` coerces and range-checks both lifetimes, so in the running
 * application this receives a `number`; the string branch is what keeps the
 * function honest for a caller that did not go through that contract. The same
 * shape `email.config.ts`'s `readNumber` has, and it is a handful of lines
 * rather than a shared helper because the two disagree on the only question that
 * matters — that one returns `undefined` for an absent variable and this one
 * refuses.
 */
function readSeconds(configService: ConfigService, key: string): number {
  const value = configService.getOrThrow<number | string>(key);
  const seconds = typeof value === 'number' ? value : Number(value);

  if (!Number.isInteger(seconds) || seconds <= 0) {
    throw new Error(`${key} must be a positive whole number of seconds`);
  }

  return seconds;
}
