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
import { ANY_ORIGIN, parseOrigins } from './cors.config';

/** Port the backend binds to when `PORT` is not set. */
export const DEFAULT_PORT = 3000;

const MIN_PORT = 1;
const MAX_PORT = 65535;

/** `scheme://host[:port]` — no path, no query, no trailing slash. */
const ORIGIN_PATTERN = /^https?:\/\/[^/?#\s:]+(:\d{1,5})?$/;

/** Connection strings PostgreSQL accepts; anything else is a typo. */
const POSTGRES_URL_PATTERN = /^postgres(ql)?:\/\//;

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

/** Fifteen minutes — see {@link EnvironmentVariables.JWT_ACCESS_TTL}. */
const DEFAULT_ACCESS_TTL_SECONDS = 900;

/** Seven days — see {@link EnvironmentVariables.JWT_REFRESH_TTL}. */
const DEFAULT_REFRESH_TTL_SECONDS = 604_800;

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
