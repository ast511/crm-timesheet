import { plainToInstance, Type } from 'class-transformer';
import {
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  Max,
  Min,
  Validate,
  ValidationArguments,
  ValidationError,
  ValidatorConstraint,
  ValidatorConstraintInterface,
  validateSync,
} from 'class-validator';

import { ANY_ORIGIN, parseOrigins } from './cors.config';

/** Port the backend binds to when `PORT` is not set. */
export const DEFAULT_PORT = 3000;

const MIN_PORT = 1;
const MAX_PORT = 65535;

/** `scheme://host[:port]` — no path, no query, no trailing slash. */
const ORIGIN_PATTERN = /^https?:\/\/[^/?#\s:]+(:\d{1,5})?$/;

/** Connection strings PostgreSQL accepts; anything else is a typo. */
const POSTGRES_URL_PATTERN = /^postgres(ql)?:\/\//;

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
