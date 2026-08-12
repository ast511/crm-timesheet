import { ConfigService } from '@nestjs/config';

/**
 * Names of the environment variables the account lifecycle reads, in one place.
 *
 * The same technique `JWT_KEYS` and `SMTP_KEYS` use: the strings appear here,
 * and the loader, the environment contract's tests and the feature documentation
 * derive from them rather than repeating a literal a typo would silently break.
 */
export const ACCOUNT_LIFECYCLE_KEYS = {
  webUrl: 'APP_WEB_URL',
  activationTtl: 'ACCOUNT_ACTIVATION_TTL',
  passwordResetTtl: 'ACCOUNT_PASSWORD_RESET_TTL',
} as const;

/** Everything the activation and reset links need in order to be built. */
export interface AccountLifecycleConfig {
  /**
   * Origin of the frontend the emailed links point at, with no trailing slash.
   *
   * The backend composes the link because the backend is what mints the token,
   * but the link has to open a *screen*, and the screen is somewhere else. This
   * is the one thing this API knows about the application in front of it.
   */
  readonly webUrl: string;
  /** Seconds an activation link stays usable. */
  readonly activationTtlSeconds: number;
  /** Seconds a password-reset link stays usable. */
  readonly passwordResetTtlSeconds: number;
}

/**
 * Reads the account-lifecycle settings from the environment.
 *
 * **This one throws**, like `loadJwtConfig` and unlike `loadSmtpConfig`, and the
 * split is the same one Feature 032 drew. Email degrades: a deployment with no
 * mail server starts and reports itself unconfigured. A deployment that cannot
 * build an activation link does not degrade — it creates accounts nobody can
 * ever activate, and the failure surfaces days later as a person who never got
 * their invitation, with nothing in the logs to say why. `APP_WEB_URL` therefore
 * has no default: guessing `http://localhost:5173` would mean a production
 * deployment silently emailing links to a machine that is not there.
 *
 * In practice it never throws in the running application: `env.validation.ts`
 * has already refused to boot on a missing or malformed value. The checks here
 * are what make the function correct on its own — for a test, or any future
 * caller that reads the variables without going through that contract — and
 * `getOrThrow` names the variable it wanted rather than reporting `undefined`
 * further down.
 */
export function loadAccountLifecycleConfig(
  configService: ConfigService,
): AccountLifecycleConfig {
  return {
    webUrl: readWebUrl(configService),
    activationTtlSeconds: readSeconds(
      configService,
      ACCOUNT_LIFECYCLE_KEYS.activationTtl,
    ),
    passwordResetTtlSeconds: readSeconds(
      configService,
      ACCOUNT_LIFECYCLE_KEYS.passwordResetTtl,
    ),
  };
}

/**
 * The frontend origin, without a trailing slash.
 *
 * Normalised here rather than demanded of the operator, because
 * `https://hr.company.com/` and `https://hr.company.com` are the same intention
 * and the difference between them is a link containing `//activate` — which some
 * routers serve and some do not, so the bug would appear in one environment
 * only.
 */
function readWebUrl(configService: ConfigService): string {
  const value = configService
    .getOrThrow<string>(ACCOUNT_LIFECYCLE_KEYS.webUrl)
    .trim();

  if (value.length === 0) {
    throw new Error(`${ACCOUNT_LIFECYCLE_KEYS.webUrl} must not be empty`);
  }

  return value.replace(/\/+$/, '');
}

/**
 * A whole number of seconds.
 *
 * The same shape `auth.config.ts`'s reader has, and a handful of lines rather
 * than a shared helper for the same reason it gives: the two functions agree
 * about the check and would only be shared for the sake of being shared.
 */
function readSeconds(configService: ConfigService, key: string): number {
  const value = configService.getOrThrow<number | string>(key);
  const seconds = typeof value === 'number' ? value : Number(value);

  if (!Number.isInteger(seconds) || seconds <= 0) {
    throw new Error(`${key} must be a positive whole number of seconds`);
  }

  return seconds;
}
