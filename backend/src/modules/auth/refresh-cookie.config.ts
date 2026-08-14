import { ConfigService } from '@nestjs/config';

import { API_BASE_PATH } from '../../config/api.constants';
import { NodeEnvironment } from '../../config/env.validation';

/**
 * Names of the environment variables the refresh cookie reads, in one place.
 *
 * The same technique `JWT_KEYS`, `ACCOUNT_LIFECYCLE_KEYS` and `SMTP_KEYS` use:
 * the strings appear here, and the loader, the environment contract's tests and
 * the feature documentation derive from them rather than repeating a literal
 * that a typo would silently break.
 */
export const REFRESH_COOKIE_KEYS = {
  name: 'AUTH_REFRESH_COOKIE_NAME',
  path: 'AUTH_REFRESH_COOKIE_PATH',
  secure: 'AUTH_REFRESH_COOKIE_SECURE',
  sameSite: 'AUTH_REFRESH_COOKIE_SAME_SITE',
} as const;

/**
 * When a browser is willing to attach the cookie to a request.
 *
 * **This is the CSRF defence**, and it is the reason the attribute is
 * configurable rather than fixed. A cookie is sent by the browser without the
 * page asking, so the question "may a request that another site caused carry
 * this credential" is answered here and nowhere else.
 *
 * - `lax` — **the default.** Not sent on a cross-site sub-request: an `<img>`,
 *   a `fetch` from another origin, a form another site posts. A page on
 *   `evil.example` therefore cannot cause a refresh. It *is* sent on a
 *   top-level navigation the person performed, which keeps ordinary links
 *   working.
 * - `strict` — never sent on anything another site initiated, including a link
 *   somebody clicked. Marginally stricter than `lax` for this cookie and
 *   usually not worth it: the routes it is scoped to are `POST`s no link can
 *   reach, so the gain is theoretical while the breakage — arriving at the
 *   application through an external link and being signed out — is not.
 * - `none` — sent on every cross-site request, and **only legal together with
 *   `Secure`**; browsers reject `SameSite=None` over plain HTTP outright. The
 *   one setting here that is a requirement rather than a preference: a frontend
 *   served from a different site than this API (`app.example.com` calling
 *   `api.example.net`) cannot use the cookie at all without it. It also gives
 *   up the CSRF property above, which is why `env.validation.ts` refuses the
 *   combination unless `Secure` is turned on explicitly, and why the feature
 *   document records what a deployment choosing it has to add in its place.
 *
 * A frozen object rather than a TypeScript `enum`, unlike `CspMode` next door,
 * for one concrete reason: Express types `sameSite` as the string literal union
 * `'lax' | 'strict' | 'none'`, and a string-enum member is nominally distinct
 * from its own value — passing one would need a cast at the only place the
 * value is ever used. `@IsEnum()` accepts this shape unchanged.
 */
export const REFRESH_COOKIE_SAME_SITE = {
  Lax: 'lax',
  Strict: 'strict',
  None: 'none',
} as const;

/** One of {@link REFRESH_COOKIE_SAME_SITE}'s values. */
export type RefreshCookieSameSite =
  (typeof REFRESH_COOKIE_SAME_SITE)[keyof typeof REFRESH_COOKIE_SAME_SITE];

/** Cookie name when nothing is configured. */
export const DEFAULT_REFRESH_COOKIE_NAME = 'refresh_token';

/**
 * Path the cookie is scoped to when nothing is configured — `/api/v1/auth`.
 *
 * **Scoped rather than site-wide, because a cookie is attached to every request
 * that matches its path.** At `/` the refresh token would ride along on every
 * call this frontend makes — every list, every report export, every image — so
 * a credential that is only ever presented to three endpoints would be on the
 * wire hundreds of times a session, in every proxy log and every browser
 * devtools panel along the way. Scoped to the auth routes it is sent to
 * `login`, `refresh`, `logout` and `change-password` and to nothing else.
 *
 * Derived from {@link API_BASE_PATH} rather than written out, so the day the
 * prefix or the version moves the cookie moves with them instead of silently
 * scoping itself to a path that no longer exists — which would not fail loudly:
 * the browser would simply stop sending it, and the symptom would be everybody
 * being signed out an access token later.
 */
export const DEFAULT_REFRESH_COOKIE_PATH = `${API_BASE_PATH}/auth`;

/** Everything needed to write, read and clear the refresh cookie. */
export interface RefreshCookieConfig {
  /** Cookie name, e.g. `refresh_token`. */
  readonly name: string;
  /** Path the cookie is scoped to. Sent only to requests underneath it. */
  readonly path: string;
  /** Whether the browser may send it over plain HTTP. */
  readonly secure: boolean;
  /** Whether it rides on cross-site requests. See {@link RefreshCookieSameSite}. */
  readonly sameSite: RefreshCookieSameSite;
}

/**
 * Reads the refresh cookie's attributes from the environment.
 *
 * A pure function of `ConfigService`, the shape `buildCorsOptions` and
 * `buildHelmetOptions` have: every attribute is a deployment's decision rather
 * than a literal in the source, and every combination can be asserted without
 * booting a server.
 *
 * **Unlike `loadJwtConfig` this one never throws**, and the difference is the
 * one Feature 037 drew for its two security variables: there is no such thing as
 * a deployment that cannot express a cookie attribute. Every setting has a value
 * that is right on a developer machine, so an environment that says nothing gets
 * a working local login over plain HTTP, and a production deployment gets a
 * `Secure` cookie without anybody typing anything. What a *set* variable has to
 * be is `env.validation.ts`'s statement, made at startup where a typo can still
 * be discussed.
 *
 * The one attribute that is not here is the lifetime. It is not read from the
 * environment at all — the cookie expires exactly when the token inside it does,
 * and that instant travels from `TokenService` with the token. See
 * `RefreshTokenCookie.set`.
 */
export function loadRefreshCookieConfig(
  configService: ConfigService,
): RefreshCookieConfig {
  return {
    name:
      readText(configService, REFRESH_COOKIE_KEYS.name) ??
      DEFAULT_REFRESH_COOKIE_NAME,
    path:
      readText(configService, REFRESH_COOKIE_KEYS.path) ??
      DEFAULT_REFRESH_COOKIE_PATH,
    secure: readSecure(configService),
    sameSite: readSameSite(
      configService.get<string>(REFRESH_COOKIE_KEYS.sameSite),
    ),
  };
}

/**
 * Whether the cookie carries `Secure` — **on in production, off elsewhere,
 * overridable either way.**
 *
 * `Secure` tells the browser never to send the cookie over plain HTTP, which is
 * exactly right everywhere the application is actually deployed and exactly
 * wrong on `http://localhost:3000`, where the cookie would be set and then never
 * sent back: the login would appear to succeed and the first refresh would sign
 * the developer out, with nothing in any log to say why.
 *
 * Derived from `NODE_ENV` when the variable is unset rather than defaulted flat,
 * the arrangement `isSwaggerEnabled` uses — so the safe value and "not set" are
 * the same thing at the one place that reads them, and no deployment has to
 * remember to turn this on. An explicit value wins in both directions: `true` on
 * a developer machine served over TLS, and `false` in production, which is a
 * mistake this function deliberately does not prevent — a deployment terminating
 * TLS somewhere this process cannot see is a real topology, and refusing it here
 * would be this file guessing at a network it cannot observe.
 */
function readSecure(configService: ConfigService): boolean {
  const flag = readOptionalFlag(configService.get(REFRESH_COOKIE_KEYS.secure));

  if (flag !== undefined) {
    return flag;
  }

  return configService.get<string>('NODE_ENV') === NodeEnvironment.Production;
}

/**
 * Reads the SameSite attribute, falling back to `lax`.
 *
 * Never reached with an unknown value in the running application —
 * `env.validation.ts` refuses to boot on one — so the fallback exists to make
 * this function correct on its own, for a test or any later caller that reads
 * the variable without going through that contract. It falls back to the value
 * that *has* the CSRF property rather than to `none`, which is the direction a
 * mistake should fail in. The same reasoning `readCspMode` states.
 */
function readSameSite(rawValue: string | undefined): RefreshCookieSameSite {
  const value = rawValue?.trim().toLowerCase();
  const known: readonly string[] = Object.values(REFRESH_COOKIE_SAME_SITE);

  return value !== undefined && known.includes(value)
    ? (value as RefreshCookieSameSite)
    : REFRESH_COOKIE_SAME_SITE.Lax;
}

/** A non-blank configured string, or `undefined` for "the operator said nothing". */
function readText(
  configService: ConfigService,
  key: string,
): string | undefined {
  const value = configService.get<string>(key)?.trim();

  return value === undefined || value.length === 0 ? undefined : value;
}

/**
 * Reads a three-state toggle: `true`, `false`, or "the operator said nothing".
 *
 * `env.validation.ts` converts the variable to a real boolean for the running
 * application; a spec building a bare `ConfigService`, and a `.env` read without
 * that contract, hand over the string. Only the two exact spellings count —
 * anything else is treated as unset and falls through to the `NODE_ENV` default,
 * which is the closed direction on a production deployment.
 */
function readOptionalFlag(value: unknown): boolean | undefined {
  if (value === true || value === 'true') {
    return true;
  }

  if (value === false || value === 'false') {
    return false;
  }

  return undefined;
}
