import { Logger } from '@nestjs/common';
import { CorsOptions } from '@nestjs/common/interfaces/external/cors-options.interface';
import { ConfigService } from '@nestjs/config';

/** Environment variable holding the comma-separated list of allowed origins. */
export const CORS_ORIGINS_KEY = 'CORS_ORIGINS';

/** Explicit opt-in value that lets any origin call the API. */
export const ANY_ORIGIN = '*';

const ORIGIN_SEPARATOR = ',';

/**
 * Builds the CORS options from the environment.
 *
 * Origins are never hardcoded: every environment (local, staging, production)
 * supplies its own allowlist through `CORS_ORIGINS`, so deploying to a new
 * domain is a configuration change and not a code change.
 *
 * An empty or missing value allows no browser origin at all. That is the safe
 * default — a misconfigured environment fails closed instead of silently
 * exposing the API to every site. Non-browser clients (curl, Postman,
 * server-to-server calls) send no `Origin` header and are unaffected.
 *
 * ## `credentials` became load-bearing in Feature 040
 *
 * It was already `true` for an explicit allowlist, and it was already correct;
 * what changed is what depends on it. The refresh token now travels as a cookie,
 * and a browser applies two separate rules to a credentialed cross-origin
 * request: it will not *send* the cookie unless the caller asked for it
 * (`credentials: 'include'`, or `withCredentials: true`), and it will not
 * *accept* the response — nor store a `Set-Cookie` from it — unless the response
 * carries `Access-Control-Allow-Credentials: true`. Both halves are required, so
 * a frontend that forgets its half sees a login that appears to succeed and a
 * refresh that fails a quarter of an hour later.
 *
 * The wildcard branch is the sharp edge, and it is why `credentials` is derived
 * rather than fixed: `Access-Control-Allow-Origin: *` and
 * `Access-Control-Allow-Credentials: true` are a combination browsers refuse
 * outright, so `CORS_ORIGINS=*` is not "the permissive setting" for a cookie —
 * it is the setting under which the cookie never works at all. A deployment
 * whose frontend is on another origin must name that origin here.
 */
export function buildCorsOptions(configService: ConfigService): CorsOptions {
  const origins = parseOrigins(configService.get<string>(CORS_ORIGINS_KEY));
  const allowAnyOrigin = origins.includes(ANY_ORIGIN);

  if (origins.length === 0) {
    Logger.warn(
      `${CORS_ORIGINS_KEY} is not set — browser requests from other origins will be blocked.`,
      'Cors',
    );
  }

  return {
    // `true` reflects the caller's Origin header; an array is matched exactly.
    origin: allowAnyOrigin ? true : origins,
    // Browsers refuse credentialed requests when the response allows any
    // origin, so cookies and Authorization headers are only offered to an
    // explicit allowlist.
    credentials: !allowAnyOrigin,
  };
}

/**
 * Splits the raw environment value into individual origins.
 *
 * Exported so the environment validation checks exactly the same entries the
 * application will later allow.
 */
export function parseOrigins(rawOrigins: string | undefined): string[] {
  return (rawOrigins ?? '')
    .split(ORIGIN_SEPARATOR)
    .map((origin) => origin.trim())
    .filter((origin) => origin.length > 0);
}
