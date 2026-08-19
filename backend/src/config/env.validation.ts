import { applyDecorators } from '@nestjs/common';
import { plainToInstance, Type } from 'class-transformer';
import {
  IsBoolean,
  IsEmail,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  Max,
  Min,
  MinLength,
  Validate,
  ValidateIf,
  ValidationArguments,
  ValidationError,
  ValidatorConstraint,
  ValidatorConstraintInterface,
  validateSync,
} from 'class-validator';

import { ToBoolean } from '../common/decorators/to-boolean.decorator';
import {
  REFRESH_COOKIE_SAME_SITE,
  RefreshCookieSameSite,
} from '../modules/auth/refresh-cookie.config';
import { ANY_ORIGIN, parseOrigins } from './cors.config';
import { CspMode } from './helmet.config';
import {
  isTrustProxyEntry,
  parseTrustProxyList,
  TRUST_PROXY_PRESETS,
} from './trust-proxy.config';

/** Port the backend binds to when `PORT` is not set. */
export const DEFAULT_PORT = 3000;

const MIN_PORT = 1;
const MAX_PORT = 65535;

/** `scheme://host[:port]` — no path, no query, no trailing slash. */
const ORIGIN_PATTERN = /^https?:\/\/[^/?#\s:]+(:\d{1,5})?$/;

/** Connection strings PostgreSQL accepts; anything else is a typo. */
const POSTGRES_URL_PATTERN = /^postgres(ql)?:\/\//;

/**
 * A cookie name, per RFC 6265 — an HTTP token.
 *
 * Everything a browser will parse and nothing it will not. The excluded
 * characters are the ones that mean something in the header's own grammar —
 * `=`, `;`, `,`, whitespace, quotes and the other separators — so a name
 * containing one produces a `Set-Cookie` the browser discards without
 * complaining to anybody.
 */
const COOKIE_NAME_PATTERN = /^[A-Za-z0-9!#$%&'*+\-.^_`|~]+$/;

/**
 * An absolute cookie path — a leading slash and no `?`, `#`, `;` or whitespace.
 *
 * The characters excluded are again the ones that would end the attribute early
 * or corrupt the header rather than being carried in it.
 */
const COOKIE_PATH_PATTERN = /^\/[^\s;?#]*$/;

/**
 * Floor for any timeout expressed in milliseconds.
 *
 * A second is already aggressive for a TCP connect plus a TLS handshake, so a
 * smaller value is a unit mistake — seconds written where milliseconds were
 * asked for — rather than a deliberately tight setting.
 */
const MIN_TIMEOUT_MS = 1000;

/**
 * Shortest a JWT signing secret may be, in characters.
 *
 * HS256 is HMAC-SHA-256, whose security is the entropy of its key: a secret
 * shorter than the digest it produces is the weakest link in the chain, and
 * RFC 7518 §3.2 says so outright. 32 is that floor expressed in the unit an
 * operator actually types, and the value it is measuring is one that should
 * come from `openssl rand -base64 48` rather than from a keyboard — which is
 * why the check is a length rather than a complexity rule.
 *
 * Enforced here, at startup, because there is no later moment to enforce it in:
 * a weak secret produces tokens that verify perfectly and forge just as easily,
 * so nothing downstream would ever notice.
 */
const MIN_JWT_SECRET_LENGTH = 32;

/**
 * Bounds on the access-token lifetime, in seconds.
 *
 * The lower bound is a minute because an access token shorter than that would
 * expire during an ordinary page of work and turn every deployment into a
 * refresh loop. The upper bound is an hour because this token is the one that
 * cannot be revoked — see `RefreshToken` in `schema.prisma` — so its lifetime is
 * the window in which a deactivated account keeps working, and an hour is the
 * longest that window is defensible.
 */
const MIN_ACCESS_TTL_SECONDS = 60;
const MAX_ACCESS_TTL_SECONDS = 3600;

/**
 * Bounds on the refresh-token lifetime, in seconds.
 *
 * An hour at the bottom, so a refresh token always outlives the access token it
 * renews; ninety days at the top, because a credential that survives a quarter
 * is a credential nobody remembers issuing.
 */
const MIN_REFRESH_TTL_SECONDS = 3600;
const MAX_REFRESH_TTL_SECONDS = 7_776_000;

/**
 * Floor for either account-link lifetime, in seconds — five minutes.
 *
 * Anything shorter is a link that expires while its email is still in a queue.
 * Mail is store-and-forward and a greylisting server routinely holds a first
 * message for several minutes, so a one-minute link would not be a tight
 * security setting; it would be an onboarding flow that never works and whose
 * failure looks like a bug in the token check.
 */
const MIN_ACCOUNT_TOKEN_TTL_SECONDS = 300;

/**
 * Ceiling on an activation link — 30 days.
 *
 * Not a security boundary so much as a statement that a link is not a permanent
 * credential. An invitation nobody has followed in a month is a person who did
 * not join, and the right answer is a fresh link from the accounts screen rather
 * than one that works forever.
 */
const MAX_ACTIVATION_TTL_SECONDS = 2_592_000;

/**
 * Ceiling on a password-reset link — 24 hours.
 *
 * Deliberately far lower than the activation ceiling, because the two protect
 * different things: an activation link opens an empty account, a reset link
 * opens a real one. A day is already generous for something the requester is
 * waiting on.
 */
const MAX_PASSWORD_RESET_TTL_SECONDS = 86_400;

/** 72 hours — see {@link EnvironmentVariables.ACCOUNT_ACTIVATION_TTL}. */
const DEFAULT_ACTIVATION_TTL_SECONDS = 259_200;

/** One hour — see {@link EnvironmentVariables.ACCOUNT_PASSWORD_RESET_TTL}. */
const DEFAULT_PASSWORD_RESET_TTL_SECONDS = 3600;

/** Fifteen minutes — see {@link EnvironmentVariables.JWT_ACCESS_TTL}. */
const DEFAULT_ACCESS_TTL_SECONDS = 900;

/** Seven days — see {@link EnvironmentVariables.JWT_REFRESH_TTL}. */
const DEFAULT_REFRESH_TTL_SECONDS = 604_800;

/**
 * Bounds on any rate-limit allowance, in requests per window.
 *
 * One at the bottom, because a limit of zero would refuse every request to the
 * API including the health check, and there is no state in which that is what
 * somebody meant — a deployment that wants an endpoint closed removes it. A
 * hundred thousand at the top, because a limit that large is not a limit; it is
 * a value somebody typed to switch the feature off without saying so, and this
 * refuses it at startup where it can still be discussed.
 */
const MIN_RATE_LIMIT = 1;
const MAX_RATE_LIMIT = 100_000;

/**
 * Bounds on any rate-limit window, in seconds.
 *
 * A second at the bottom is the smallest window that means anything. A day at
 * the top is where a rate limit stops being one: a window that long is a quota,
 * it needs a story about when it resets and who it resets for, and the in-memory
 * store behind this — which loses every counter on restart — is the wrong place
 * to keep a day of history.
 */
const MIN_RATE_LIMIT_TTL_SECONDS = 1;
const MAX_RATE_LIMIT_TTL_SECONDS = 86_400;

/** See {@link EnvironmentVariables.RATE_LIMIT_DEFAULT_LIMIT}. */
const DEFAULT_RATE_LIMIT = 300;

/** One minute — see {@link EnvironmentVariables.RATE_LIMIT_DEFAULT_TTL}. */
const DEFAULT_RATE_LIMIT_TTL_SECONDS = 60;

/** See {@link EnvironmentVariables.RATE_LIMIT_AUTH_LIMIT}. */
const DEFAULT_AUTH_RATE_LIMIT = 10;

/** Five minutes — see {@link EnvironmentVariables.RATE_LIMIT_AUTH_TTL}. */
const DEFAULT_AUTH_RATE_LIMIT_TTL_SECONDS = 300;

/** See {@link EnvironmentVariables.RATE_LIMIT_REFRESH_LIMIT}. */
const DEFAULT_REFRESH_RATE_LIMIT = 120;

/** Five minutes — see {@link EnvironmentVariables.RATE_LIMIT_REFRESH_TTL}. */
const DEFAULT_REFRESH_RATE_LIMIT_TTL_SECONDS = 300;

/**
 * Rejects a `TRUST_PROXY` value Express would misread.
 *
 * Express accepts a great deal here and complains about very little: a value it
 * does not recognise as a hop count or an address list is treated as a hostname
 * to resolve, and the practical result of a typo is a backend that quietly
 * resolves client addresses in a way nobody intended. Since that address is what
 * the rate limiter counts against, a typo here is a limiter that does not work
 * — so it is caught at startup, where the four permitted shapes can be named.
 */
@ValidatorConstraint({ name: 'isTrustProxy', async: false })
class IsTrustProxyConstraint implements ValidatorConstraintInterface {
  validate(value: unknown): boolean {
    if (typeof value !== 'string') {
      return false;
    }

    const trimmed = value.trim().toLowerCase();

    // Blank, `false` and `true` are the three literals; a blank value means
    // "not set", the same reading the SMTP block gives a cleared placeholder.
    if (trimmed === '' || trimmed === 'false' || trimmed === 'true') {
      return true;
    }

    if (/^\d+$/.test(trimmed)) {
      return true;
    }

    const entries = parseTrustProxyList(value);

    return entries.length > 0 && entries.every(isTrustProxyEntry);
  }

  defaultMessage({ property }: ValidationArguments): string {
    return `${property} must be "false", "true", a number of proxy hops such as "1", or a comma-separated list of addresses, subnets or the presets ${TRUST_PROXY_PRESETS.join(' / ')}`;
  }
}

/**
 * Rejects a secret that is the *other* secret.
 *
 * Two keys are declared and they have to be two keys. Signing access and refresh
 * tokens with one secret would mean a refresh token verifies as an access token
 * and the other way round, so a stolen refresh token — the long-lived one, the
 * one a client stores — would be usable directly against every protected route,
 * and the whole point of separating them would be lost to a copy-paste in a
 * `.env`. The token-type claim `TokenService` writes catches the same mistake at
 * verification time; this catches it at startup, where it can still be fixed.
 */
@ValidatorConstraint({ name: 'isDistinctSecret', async: false })
class IsDistinctSecretConstraint implements ValidatorConstraintInterface {
  validate(
    value: unknown,
    { object, constraints }: ValidationArguments,
  ): boolean {
    const [other] = constraints as [keyof EnvironmentVariables];

    return value !== (object as EnvironmentVariables)[other];
  }

  defaultMessage({ property, constraints }: ValidationArguments): string {
    const [other] = constraints as [string];

    return `${property} must not be the same value as ${other}`;
  }
}

/**
 * Refuses `SameSite=None` on a cookie that is not `Secure`.
 *
 * **A browser rule, not a preference.** `Set-Cookie: …; SameSite=None` without
 * `Secure` is rejected outright by every current browser, so the configuration
 * does not produce a weaker cookie — it produces no cookie at all, and the
 * symptom is a login that appears to succeed and a session that ends at the
 * first refresh, with nothing in any server log to explain it. Exactly the class
 * of failure `IsTrustProxyConstraint` exists for: silent, remote, and invisible
 * from the side that could fix it.
 *
 * The check demands an **explicit** `true` rather than accepting the
 * `NODE_ENV`-derived default, because `SameSite=None` is a deliberate
 * split-domain decision and the deployment making it is the one that knows
 * whether TLS is really in front of this process. A production default that
 * happened to be right would leave the same environment broken in staging.
 */
@ValidatorConstraint({ name: 'isSecureWhenCrossSite', async: false })
class IsSecureWhenCrossSiteConstraint implements ValidatorConstraintInterface {
  validate(value: unknown, { object }: ValidationArguments): boolean {
    if (value !== REFRESH_COOKIE_SAME_SITE.None) {
      return true;
    }

    const secure = (object as EnvironmentVariables).AUTH_REFRESH_COOKIE_SECURE;

    return secure === true;
  }

  defaultMessage({ property }: ValidationArguments): string {
    return `${property}="${REFRESH_COOKIE_SAME_SITE.None}" requires AUTH_REFRESH_COOKIE_SECURE=true — browsers discard a SameSite=None cookie that is not Secure`;
  }
}

/**
 * `@IsEmail()`, except that a variable set to nothing is treated as not set.
 *
 * `SMTP_FROM_EMAIL=` is how a placeholder is cleared, and the email module
 * already reads a blank variable as absent — see `loadSmtpConfig`. Without this
 * the two would disagree: a blank host would leave the application running and
 * reporting itself unconfigured, while a blank sending address would stop it
 * from booting at all.
 */
function IsEmailOrBlank() {
  return applyDecorators(
    ValidateIf(
      (_object: unknown, value: unknown) =>
        typeof value === 'string' && value.trim() !== '',
    ),
    IsEmail(),
  );
}

export enum NodeEnvironment {
  Development = 'development',
  Test = 'test',
  Production = 'production',
}

@ValidatorConstraint({ name: 'isOriginList', async: false })
class IsOriginListConstraint implements ValidatorConstraintInterface {
  validate(value: unknown): boolean {
    if (typeof value !== 'string') {
      return false;
    }

    // An empty value is valid: it means "allow no browser origin".
    return parseOrigins(value).every(
      (origin) => origin === ANY_ORIGIN || ORIGIN_PATTERN.test(origin),
    );
  }

  defaultMessage({ property }: ValidationArguments): string {
    return `${property} must be a comma-separated list of origins such as "http://localhost:5173" (scheme + host + optional port, no trailing slash), or "*"`;
  }
}

/**
 * The environment contract of the backend.
 *
 * Property initialisers are the defaults for optional variables, so a default
 * is declared once, here, instead of at every call site. Variables without an
 * initialiser are mandatory and the application refuses to start without them.
 */
export class EnvironmentVariables {
  @IsEnum(NodeEnvironment)
  readonly NODE_ENV: NodeEnvironment = NodeEnvironment.Development;

  @Type(() => Number)
  @IsInt()
  @Min(MIN_PORT)
  @Max(MAX_PORT)
  readonly PORT: number = DEFAULT_PORT;

  @IsString()
  @IsNotEmpty()
  @Matches(POSTGRES_URL_PATTERN, {
    message: 'DATABASE_URL must be a postgresql:// connection string',
  })
  readonly DATABASE_URL!: string;

  @IsOptional()
  @Validate(IsOriginListConstraint)
  readonly CORS_ORIGINS?: string;

  // ---------------------------------------------------------------------------
  // Authentication — read by the auth module (Feature 032) and by nothing else.
  //
  // The two secrets are **required**, and they are the first variables in this
  // contract other than DATABASE_URL that the application refuses to start
  // without. That is deliberate and it is not symmetry with SMTP: a deployment
  // with no mail server is a legitimate state that degrades to "nothing is
  // sent", while a deployment with no signing secret has no legitimate degraded
  // state at all. The two candidates are both unacceptable — invent a secret at
  // boot, and every restart silently logs the whole company out while tokens
  // signed by the previous process are rejected as forgeries; ship a default,
  // and it is published in this repository, which means anyone can mint a
  // super-admin token against any deployment that did not override it. Refusing
  // to boot is the only answer that cannot be misread.
  //
  // The two lifetimes are optional with the defaults declared below, because a
  // sensible value exists and an operator has no reason to think about them.
  // ---------------------------------------------------------------------------

  /** Signs access tokens (HS256). Rotating it invalidates every access token. */
  @IsString()
  @MinLength(MIN_JWT_SECRET_LENGTH)
  readonly JWT_ACCESS_SECRET!: string;

  /**
   * Signs refresh tokens (HS256), and must differ from the access secret.
   *
   * Rotating it logs everybody out — which is what makes it the lever to pull
   * after a suspected compromise, alongside emptying `refresh_tokens`.
   */
  @IsString()
  @MinLength(MIN_JWT_SECRET_LENGTH)
  @Validate(IsDistinctSecretConstraint, ['JWT_ACCESS_SECRET'])
  readonly JWT_REFRESH_SECRET!: string;

  /**
   * How long an access token is valid, in seconds. Defaults to 15 minutes.
   *
   * This is the revocation window and nothing else: an account deactivated, a
   * role downgraded or a session logged out is still honoured by an access token
   * already in flight until it expires. Fifteen minutes is the usual compromise
   * — short enough that the window is an inconvenience rather than a hole, long
   * enough that a client is not refreshing on every screen.
   */
  @Type(() => Number)
  @IsInt()
  @Min(MIN_ACCESS_TTL_SECONDS)
  @Max(MAX_ACCESS_TTL_SECONDS)
  readonly JWT_ACCESS_TTL: number = DEFAULT_ACCESS_TTL_SECONDS;

  /**
   * How long a refresh token is valid, in seconds. Defaults to 7 days.
   *
   * The real answer to "how long may somebody stay signed in", since rotation
   * means each refresh issues a fresh one: a person who uses the application
   * every day is never asked to log in again, and one who disappears for a week
   * is.
   */
  @Type(() => Number)
  @IsInt()
  @Min(MIN_REFRESH_TTL_SECONDS)
  @Max(MAX_REFRESH_TTL_SECONDS)
  readonly JWT_REFRESH_TTL: number = DEFAULT_REFRESH_TTL_SECONDS;

  // ---------------------------------------------------------------------------
  // The refresh cookie — read by `refresh-cookie.config.ts` (Feature 040) and
  // by nothing else.
  //
  // The refresh token travels as an `HttpOnly` cookie rather than in a JSON
  // body, so that a script injected into the frontend cannot read it. These four
  // variables are the cookie's attributes, and all four are optional: every one
  // has a value that is right on a developer machine and right in production
  // without anybody typing it. What this contract adds is that a variable which
  // *is* set has to make sense — a cookie whose name a browser will not accept,
  // or a path the cookie is never sent to, fails silently and looks exactly like
  // a session that keeps ending.
  //
  // `Secure` is defaulted in the reading code from `NODE_ENV`, the arrangement
  // `SWAGGER_ENABLED` uses, so nothing has to be set for a production deployment
  // to get a `Secure` cookie or for `npm run start:dev` to work over plain HTTP.
  // ---------------------------------------------------------------------------

  /**
   * Name of the refresh cookie. Defaults to `refresh_token`.
   *
   * Constrained to the characters RFC 6265 allows in a cookie name, because a
   * value outside them is not rejected by anything downstream: Express writes
   * the header, the browser refuses to parse it, and the symptom is a login
   * whose session lasts exactly one access token.
   */
  @IsOptional()
  @Matches(COOKIE_NAME_PATTERN, {
    message:
      "AUTH_REFRESH_COOKIE_NAME must be a valid cookie name — letters, digits and !#$%&'*+-.^_`|~ with no spaces, quotes, commas, semicolons or equals signs",
  })
  readonly AUTH_REFRESH_COOKIE_NAME?: string;

  /**
   * Path the cookie is scoped to. Defaults to `/api/v1/auth`.
   *
   * A browser attaches a cookie to every request underneath its path, so this is
   * what keeps the refresh token off every other call the frontend makes. It has
   * to start with `/` and cover the auth routes; setting it to something the
   * refresh endpoint is not under is the one mistake here that produces no error
   * anywhere — the cookie is set, never sent, and everybody is signed out at the
   * next rotation.
   */
  @IsOptional()
  @Matches(COOKIE_PATH_PATTERN, {
    message:
      'AUTH_REFRESH_COOKIE_PATH must be an absolute path such as /api/v1/auth (no query, no fragment, no spaces)',
  })
  readonly AUTH_REFRESH_COOKIE_PATH?: string;

  /**
   * Whether the cookie carries `Secure`. Defaults to `true` in production and
   * `false` everywhere else.
   *
   * `Secure` stops the browser sending the cookie over plain HTTP. Left on
   * against a development server on `http://localhost`, the cookie is set and
   * then never sent back — a login that appears to work and a refresh that
   * silently does not. Turned off in a real deployment, the refresh token
   * crosses the network in the clear, which is the whole thing this feature
   * exists to protect.
   *
   * An explicit `false` in production is permitted rather than refused, because
   * a deployment terminating TLS at a proxy this process cannot see is a real
   * topology and this file cannot tell it apart from a mistake.
   */
  @IsOptional()
  @ToBoolean()
  @IsBoolean()
  readonly AUTH_REFRESH_COOKIE_SECURE?: boolean;

  /**
   * When the browser attaches the cookie to a cross-site request. One of `lax`
   * (the default), `strict` or `none`.
   *
   * **This is the CSRF defence**, and `lax` is what has it: a page on another
   * site cannot cause a request that carries this cookie. `none` gives that up
   * and is the only value that works when the frontend is served from a
   * different site than this API — so it is allowed, and it is refused unless
   * `AUTH_REFRESH_COOKIE_SECURE` is explicitly `true`, which is a browser
   * requirement rather than an opinion: `SameSite=None` without `Secure` is
   * discarded outright, leaving no refresh cookie at all.
   */
  @IsOptional()
  @IsEnum(REFRESH_COOKIE_SAME_SITE)
  @Validate(IsSecureWhenCrossSiteConstraint)
  readonly AUTH_REFRESH_COOKIE_SAME_SITE?: RefreshCookieSameSite;

  // ---------------------------------------------------------------------------
  // Account lifecycle — read by the activation and password-reset links
  // (Feature 036) and by nothing else.
  //
  // `APP_WEB_URL` is **required and has no default**, unlike the two lifetimes
  // below. A guessed origin does not fail loudly: it produces invitations that
  // are emailed successfully to a link nobody can open, and the symptom is a new
  // joiner asking a week later why they never got in. The two lifetimes have
  // sensible values an operator has no reason to think about, so they default.
  // ---------------------------------------------------------------------------

  /**
   * Origin of the frontend the emailed links point at — `https://hr.company.com`.
   *
   * The backend mints the token, so it builds the URL; the *screen* the URL opens
   * belongs to the React application, and this is the one thing this API knows
   * about it. A trailing slash is tolerated and stripped by the loader, because
   * `https://x/` and `https://x` are the same intention and the difference
   * between them is a link containing `//activate` that some routers serve and
   * some do not.
   *
   * Validated as an origin with the same pattern `CORS_ORIGINS` uses — scheme,
   * host, optional port, no path — so a value with a path or a query is refused
   * at startup rather than producing a malformed link.
   */
  @Matches(ORIGIN_PATTERN, {
    message:
      'APP_WEB_URL must be an origin such as https://hr.company.com (no path, no query)',
  })
  readonly APP_WEB_URL!: string;

  /**
   * How long an activation link works, in seconds. Defaults to 72 hours.
   *
   * Long, and deliberately much longer than a reset. An invitation is sent when
   * an administrator gets round to creating the account, which is routinely a
   * Friday afternoon for somebody starting on Monday — a link that dies
   * overnight would mean the first thing a new colleague does is ask for another
   * one. The risk it trades against is modest: the account has no password and
   * no data, so a link intercepted in that window grants a login to an empty
   * account whose real owner would immediately notice they cannot activate.
   */
  @Type(() => Number)
  @IsInt()
  @Min(MIN_ACCOUNT_TOKEN_TTL_SECONDS)
  @Max(MAX_ACTIVATION_TTL_SECONDS)
  readonly ACCOUNT_ACTIVATION_TTL: number = DEFAULT_ACTIVATION_TTL_SECONDS;

  /**
   * How long a password-reset link works, in seconds. Defaults to one hour.
   *
   * Short, and for the opposite reason. A reset link is a way into an account
   * that already holds somebody's timesheets, their leave and possibly
   * administrative authority, and the person asking for it is at their keyboard
   * *now* — they check their mail within minutes or not at all. Every extra hour
   * is time the link spends sitting in a mailbox being a working credential.
   */
  @Type(() => Number)
  @IsInt()
  @Min(MIN_ACCOUNT_TOKEN_TTL_SECONDS)
  @Max(MAX_PASSWORD_RESET_TTL_SECONDS)
  readonly ACCOUNT_PASSWORD_RESET_TTL: number =
    DEFAULT_PASSWORD_RESET_TTL_SECONDS;

  // ---------------------------------------------------------------------------
  // SMTP — read by the email module (Feature 025) and by nothing else.
  //
  // Every one of them is optional *here*, which is the deliberate part: a
  // deployment with no mail server — a developer machine, a CI run, a demo —
  // must still start, and the module reports itself as unconfigured through
  // `GET /api/v1/email/health` rather than taking the whole API down with it.
  // What this contract adds is that a variable which *is* set has to make
  // sense: a port that is not a number, or a sending address that is not an
  // address, is a typo the operator finds at startup instead of at the first
  // notification nobody receives.
  //
  // Which of them are required to actually send is `loadSmtpConfig`'s
  // statement, not this one's — it is the module's rule, and it belongs where
  // the module can change it.
  // ---------------------------------------------------------------------------

  @IsOptional()
  @ToBoolean()
  @IsBoolean()
  readonly SMTP_ENABLED?: boolean;

  @IsOptional()
  @IsString()
  readonly SMTP_HOST?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(MIN_PORT)
  @Max(MAX_PORT)
  readonly SMTP_PORT?: number;

  @IsOptional()
  @ToBoolean()
  @IsBoolean()
  readonly SMTP_SECURE?: boolean;

  @IsOptional()
  @IsString()
  readonly SMTP_USER?: string;

  @IsOptional()
  @IsString()
  readonly SMTP_PASSWORD?: string;

  @IsOptional()
  @IsString()
  readonly SMTP_FROM_NAME?: string;

  @IsOptional()
  @IsEmailOrBlank()
  readonly SMTP_FROM_EMAIL?: string;

  @IsOptional()
  @IsEmailOrBlank()
  readonly SMTP_REPLY_TO?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(MIN_TIMEOUT_MS)
  readonly SMTP_CONNECTION_TIMEOUT?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(MIN_TIMEOUT_MS)
  readonly SMTP_SOCKET_TIMEOUT?: number;

  // ---------------------------------------------------------------------------
  // The Notification Delivery Engine (Feature 028).
  //
  // One variable, and it is a switch rather than a setting: whether this
  // deployment runs the engine's two scheduled jobs. It does *not* disable the
  // engine — `POST /notification-delivery/execute/:campaignId` still sends,
  // because that is somebody deliberately asking — it stops the clock.
  //
  // The case it exists for is the one `SMTP_ENABLED` exists for: a staging
  // deployment restored from a production dump holds real employees, real
  // addresses and real scheduled campaigns, and it must be able to run the API
  // without a cron announcing a maintenance window to the whole company at
  // 09:00. Turning email off is not enough on its own, because an in-app
  // notification is delivered whether or not mail is configured.
  //
  // Optional and defaulted *in the reading code* rather than here, so that
  // "unset" and "true" are the same thing at every call site: only an explicit
  // `false` stops the jobs.
  // ---------------------------------------------------------------------------

  @IsOptional()
  @ToBoolean()
  @IsBoolean()
  readonly NOTIFICATION_SCHEDULER_ENABLED?: boolean;

  // ---------------------------------------------------------------------------
  // Rate limiting — read by the rate-limiting module (Feature 034) and by
  // nothing else.
  //
  // All four are optional with the defaults declared below, for the reason the
  // two JWT lifetimes are: a sensible value exists, and an operator has no
  // reason to think about them until a real deployment tells them otherwise.
  // What they are *not* is hardcoded — every number here is the starting point
  // of a tuning exercise that a deployment must be able to do without a code
  // change, because the right allowance depends on how many people use the
  // system and from how many addresses, and neither is knowable from here.
  //
  // The windows are stated in seconds, matching JWT_ACCESS_TTL and
  // JWT_REFRESH_TTL above. The throttler measures in milliseconds; the
  // conversion happens once, in `loadRateLimitConfig`.
  // ---------------------------------------------------------------------------

  /**
   * Requests one client may make to the whole API per window. Defaults to 300.
   *
   * Generous on purpose. This is the baseline every route carries, so it has to
   * clear the burst a single screen produces — a dashboard opening six lists at
   * once, a report preview, an autosaving form — while still stopping the
   * traffic that is obviously not a person. At the default window of a minute it
   * is five requests a second, sustained, from one address: far above what the
   * frontend does and far below what a script does.
   *
   * It is one bucket per client for the *whole* API rather than per route, which
   * is what makes it a bound on the request rate at all. See `generateKey` in
   * `rate-limiting.guard.ts`.
   */
  @Type(() => Number)
  @IsInt()
  @Min(MIN_RATE_LIMIT)
  @Max(MAX_RATE_LIMIT)
  readonly RATE_LIMIT_DEFAULT_LIMIT: number = DEFAULT_RATE_LIMIT;

  /** The baseline window, in seconds. Defaults to 60. */
  @Type(() => Number)
  @IsInt()
  @Min(MIN_RATE_LIMIT_TTL_SECONDS)
  @Max(MAX_RATE_LIMIT_TTL_SECONDS)
  readonly RATE_LIMIT_DEFAULT_TTL: number = DEFAULT_RATE_LIMIT_TTL_SECONDS;

  /**
   * Attempts allowed against an authentication route per window. Defaults to 10.
   *
   * Thirty times smaller than the baseline, because it is bounding something
   * thirty times more dangerous: `POST /auth/login` is an unauthenticated bcrypt
   * per request, and the thing being guessed at is a password. Ten attempts per
   * five minutes is roughly 2 900 guesses a day against one account from one
   * address — against any password worth the name, nothing, and against a person
   * who has genuinely forgotten theirs, four more tries than they will use.
   */
  @Type(() => Number)
  @IsInt()
  @Min(MIN_RATE_LIMIT)
  @Max(MAX_RATE_LIMIT)
  readonly RATE_LIMIT_AUTH_LIMIT: number = DEFAULT_AUTH_RATE_LIMIT;

  /** The strict window, in seconds. Defaults to 300 (five minutes). */
  @Type(() => Number)
  @IsInt()
  @Min(MIN_RATE_LIMIT_TTL_SECONDS)
  @Max(MAX_RATE_LIMIT_TTL_SECONDS)
  readonly RATE_LIMIT_AUTH_TTL: number = DEFAULT_AUTH_RATE_LIMIT_TTL_SECONDS;

  /**
   * Session rotations allowed per window. Defaults to 120.
   *
   * Twelve times the strict allowance, because `POST /auth/refresh` is not the
   * same kind of route as `POST /auth/login`: nothing is being guessed at, the
   * credential was issued by this server, and a client spends one per cold page
   * load plus one per rotation per open tab. On the strict tier it was roughly
   * nine reloads before somebody was signed out for reloading.
   *
   * **The number is sized for a shared egress address, not for a person.** A
   * company behind one NAT is one bucket, so this has to cover every employee's
   * tabs at once — read as a per-person limit it looks absurdly generous and is
   * in fact about two. The full arithmetic, and the argument for why a loose
   * limit here is acceptable when the token is single-use and revoked on reuse,
   * is on `RefreshRateLimit` in
   * `modules/rate-limiting/decorators/refresh-rate-limit.decorator.ts`.
   *
   * If refreshes are being refused in production, check {@link TRUST_PROXY}
   * before raising this: an untrusted proxy collapses every client into one
   * bucket, which is the same failure with a different cause.
   */
  @Type(() => Number)
  @IsInt()
  @Min(MIN_RATE_LIMIT)
  @Max(MAX_RATE_LIMIT)
  readonly RATE_LIMIT_REFRESH_LIMIT: number = DEFAULT_REFRESH_RATE_LIMIT;

  /** The refresh window, in seconds. Defaults to 300 (five minutes). */
  @Type(() => Number)
  @IsInt()
  @Min(MIN_RATE_LIMIT_TTL_SECONDS)
  @Max(MAX_RATE_LIMIT_TTL_SECONDS)
  readonly RATE_LIMIT_REFRESH_TTL: number = DEFAULT_REFRESH_RATE_LIMIT_TTL_SECONDS;

  /**
   * Whether Express should believe `X-Forwarded-For`, and how far.
   *
   * `false` (the default, and what an unset variable means), `true`, a hop count
   * such as `1`, or a comma-separated list of addresses, subnets and the presets
   * `loopback` / `linklocal` / `uniquelocal`.
   *
   * **This is the variable that decides whether rate limiting works at all**, and
   * both ways of getting it wrong are serious — a shared bucket that locks the
   * company out, or a spoofable one that bounds nothing. The full argument, and
   * why a hop count is the recommendation, is on `parseTrustProxy` in
   * `trust-proxy.config.ts`.
   *
   * Validated here rather than left to Express, which accepts a malformed value
   * and then quietly resolves addresses in a way nobody intended.
   */
  @IsOptional()
  @Validate(IsTrustProxyConstraint)
  readonly TRUST_PROXY?: string;

  // ---------------------------------------------------------------------------
  // Security headers — read by `helmet.config.ts` (Feature 037) and by nothing
  // else.
  //
  // Two variables, and both exist for the same reason: the headers Helmet sets
  // are safe everywhere *except* the two whose consequences outlive the
  // response. HSTS commits a hostname to HTTPS for a year and cannot be
  // withdrawn by deleting the header; a Content Security Policy stops a page
  // from running its own scripts. Every other header in the set is a plain
  // improvement with nothing to configure, so there is nothing here for it.
  //
  // Both are optional, and both are defaulted **in the reading code** rather
  // than by an initialiser here — the arrangement `NOTIFICATION_SCHEDULER_ENABLED`
  // uses. The defaults are what makes `npm run start:dev` work unchanged over
  // plain HTTP, and they belong beside the argument for why they are safe,
  // which is in `buildHelmetOptions`. What this contract adds is that a
  // variable which *is* set has to make sense.
  // ---------------------------------------------------------------------------

  /**
   * Whether to send `Strict-Transport-Security`. Defaults to `false`.
   *
   * **Only turn this on in an environment that is already served over HTTPS.**
   * The header tells a browser to refuse plain HTTP to the host for a year, it
   * is remembered per host rather than per port, and it is not undone by
   * removing it again — only by serving `max-age=0` from the HTTPS site that,
   * by then, may be the thing that is broken. Enabled before a certificate is
   * in place, it is an outage that persists in every visitor's browser.
   *
   * An explicit flag rather than `NODE_ENV === 'production'`, for the reason
   * `TRUST_PROXY` is one: "production" does not imply TLS terminates anywhere
   * this backend can see, and a commitment this hard to reverse should be
   * something somebody typed.
   */
  @IsOptional()
  @ToBoolean()
  @IsBoolean()
  readonly SECURITY_HSTS_ENABLED?: boolean;

  /**
   * Which Content Security Policy to serve. Defaults to `strict`.
   *
   * `strict` allows nothing inline and nothing off-origin, which is correct
   * while this backend answers with JSON — the policy costs nothing and breaks
   * nothing, because a CSP governs HTML documents and there are none.
   *
   * `relaxed` additionally allows inline scripts and styles from this origin.
   * That is what Swagger UI and a built SPA need, and it is the switch to
   * throw on the deployment that starts serving either — not a code change,
   * and not a reason to take the policy off.
   */
  @IsOptional()
  @IsEnum(CspMode)
  readonly SECURITY_CSP_MODE?: CspMode;

  // ---------------------------------------------------------------------------
  // API documentation — read by `swagger.config.ts` (Feature 038) and by
  // nothing else.
  //
  // One variable, and it is an exposure switch rather than a setting. The
  // generated OpenAPI document is a complete map of this API — every route,
  // every field, every permission a route requires — plus a form that submits
  // real requests against the live service. That is exactly what a frontend
  // developer needs and exactly what nobody needs to publish from a production
  // deployment by accident.
  //
  // Optional and defaulted **in the reading code**, the arrangement the two
  // security variables above use: unset means "on outside production", so a
  // developer machine and a CI run get the documentation with nothing
  // configured while a production deployment gets it only if somebody typed so.
  // ---------------------------------------------------------------------------

  /**
   * Whether this deployment serves `/api/docs` and `/api/docs-json`. Defaults
   * to `true` outside production and `false` in it.
   *
   * Set it to `true` in production deliberately — for an internal deployment
   * behind a VPN, or a staging environment a frontend team generates a client
   * against — and understand what it publishes: the shape of every payload and
   * the existence of every endpoint. It does not weaken any of them. Every
   * route stays authenticated, authorised and rate limited, and the document
   * contains no credential; what it removes is the need to guess.
   *
   * An explicit flag rather than reading `NODE_ENV` alone, for the reason
   * `SECURITY_HSTS_ENABLED` is one: the environment name is a label, and an
   * exposure decision should be something somebody typed.
   */
  @IsOptional()
  @ToBoolean()
  @IsBoolean()
  readonly SWAGGER_ENABLED?: boolean;
}

/**
 * Validates the environment while the application is being bootstrapped.
 *
 * Wired into `ConfigModule.forRoot({ validate })`, so a missing or malformed
 * variable stops the process with an explicit message instead of surfacing
 * later as a silent fallback — a port that is not the one that was configured,
 * or a CORS allowlist that quietly matches nothing.
 *
 * The returned instance also becomes the source `ConfigService` reads first,
 * which is what makes `PORT` arrive as a `number` rather than a string.
 */
export function validateEnvironment(
  config: Record<string, unknown>,
): EnvironmentVariables {
  const validatedConfig = plainToInstance(EnvironmentVariables, config);
  const errors = validateSync(validatedConfig, {
    skipMissingProperties: false,
  });

  if (errors.length > 0) {
    throw new Error(
      `Invalid environment configuration:\n${formatErrors(errors)}`,
    );
  }

  return validatedConfig;
}

/**
 * Renders only the constraint messages. `ValidationError.toString()` would
 * embed the rejected value, which for DATABASE_URL means printing the database
 * password into the startup logs.
 */
function formatErrors(errors: ValidationError[]): string {
  return errors
    .flatMap((error) => Object.values(error.constraints ?? {}))
    .map((message) => `  - ${message}`)
    .join('\n');
}
