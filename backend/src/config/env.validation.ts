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
