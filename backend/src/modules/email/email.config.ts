import { ConfigService } from '@nestjs/config';

/**
 * Names of the environment variables this module reads, in one place.
 *
 * The same technique `cors.config.ts` uses for `CORS_ORIGINS_KEY`, extended to
 * the whole SMTP block: the strings appear here, and the loader, the startup
 * warning and the tests all derive from them rather than repeating a literal
 * that a typo would silently break.
 */
export const SMTP_KEYS = {
  enabled: 'SMTP_ENABLED',
  host: 'SMTP_HOST',
  port: 'SMTP_PORT',
  secure: 'SMTP_SECURE',
  user: 'SMTP_USER',
  password: 'SMTP_PASSWORD',
  fromName: 'SMTP_FROM_NAME',
  fromEmail: 'SMTP_FROM_EMAIL',
  replyTo: 'SMTP_REPLY_TO',
  connectionTimeout: 'SMTP_CONNECTION_TIMEOUT',
  socketTimeout: 'SMTP_SOCKET_TIMEOUT',
} as const;

/**
 * The port on which SMTP is spoken over TLS from the first byte (SMTPS).
 *
 * Every other port — 587, 25, 2525 — starts in the clear and upgrades with
 * STARTTLS. Used to derive `secure` when `SMTP_SECURE` was not set; see
 * {@link loadSmtpConfig}.
 */
const IMPLICIT_TLS_PORT = 465;

/**
 * How long to wait for the connection to the mail server, in milliseconds.
 *
 * Nodemailer's own default is two minutes, which is unusable here: a send
 * happens inside an HTTP request, so an unreachable host would hold a request
 * open for two minutes and the client would give up long before the server
 * did. Ten seconds is generous for a TCP connect plus a TLS handshake and short
 * enough that a failure is reported while somebody is still watching.
 */
const DEFAULT_CONNECTION_TIMEOUT_MS = 10_000;

/**
 * How long an idle established connection may stay silent, in milliseconds.
 *
 * Larger than the connection timeout on purpose: this one covers the whole
 * conversation, including a server that accepts the message and then thinks
 * about it. Nodemailer's default is ten minutes, for the same reason as above.
 */
const DEFAULT_SOCKET_TIMEOUT_MS = 30_000;

/** Everything needed to reach an SMTP server and address a message. */
export interface SmtpConfig {
  readonly host: string;
  readonly port: number;
  /** `true` for implicit TLS (port 465), `false` for STARTTLS on everything else. */
  readonly secure: boolean;
  readonly user: string;
  readonly password: string;
  /** Display name in the `From` header. Absent means the address alone. */
  readonly fromName?: string;
  readonly fromEmail: string;
  /** Where replies should go, when that is not the sending address. */
  readonly replyTo?: string;
  /** Milliseconds to wait for the connection to be established. */
  readonly connectionTimeout: number;
  /** Milliseconds an established connection may stay silent. */
  readonly socketTimeout: number;
}

/** What {@link loadSmtpConfig} answers: the configuration, or why there is none. */
export interface SmtpConfigLoad {
  /** `null` when at least one required variable is missing. */
  readonly config: SmtpConfig | null;

  /**
   * Whether this deployment is permitted to send at all — `SMTP_ENABLED`,
   * defaulting to `true`.
   *
   * Deliberately separate from `config`: the two answer different questions.
   * `config` is *how* to reach a mail server, this is *whether* to use it, and
   * an environment can perfectly well have working credentials it must not use
   * — a staging deployment holding a copy of production data has real employee
   * addresses in it and must not mail any of them. Keeping the switch outside
   * the connection settings is what makes turning email off a one-variable
   * change rather than the deletion of a working configuration.
   */
  readonly enabled: boolean;

  /** Names of the required variables that were not set. Empty on success. */
  readonly missing: string[];
}

/**
 * Reads the SMTP configuration from the environment.
 *
 * Returns `null` instead of throwing when something is missing, because a
 * deployment with no mail server is a legitimate state — a developer machine,
 * a CI run, a demo — and the application must still start. The health endpoint
 * is what reports it, and `EmailService` refuses to send rather than pretending
 * to. The names of the missing variables come back with it so startup can log
 * *which* ones, without ever logging a value.
 *
 * **Required**: host, port, user, password and the sending address. Without any
 * one of them there is no connection to make or no envelope to address.
 *
 * **Optional, with a default that is not a guess**: `SMTP_FROM_NAME` (a `From`
 * without a display name is a valid header), `SMTP_REPLY_TO` (an absent
 * `Reply-To` means replies go to `From`), the two timeouts, and `SMTP_SECURE`,
 * which is derived from the port when it is not stated — 465 means TLS from the
 * first byte, anything else means STARTTLS. That derivation is the difference
 * between a working configuration and a connection that hangs, and it is the
 * mistake nobody makes twice.
 *
 * A variable set to nothing (`SMTP_HOST=`) counts as missing. Half a
 * configuration is not a configuration, and a blank line in a `.env` is how a
 * placeholder is cleared, not how a host is named.
 */
export function loadSmtpConfig(configService: ConfigService): SmtpConfigLoad {
  const enabled = readBoolean(configService, SMTP_KEYS.enabled) ?? true;
  const host = readText(configService, SMTP_KEYS.host);
  const port = readNumber(configService, SMTP_KEYS.port);
  const user = readText(configService, SMTP_KEYS.user);
  const password = readText(configService, SMTP_KEYS.password);
  const fromEmail = readText(configService, SMTP_KEYS.fromEmail);

  const required = {
    [SMTP_KEYS.host]: host,
    [SMTP_KEYS.port]: port,
    [SMTP_KEYS.user]: user,
    [SMTP_KEYS.password]: password,
    [SMTP_KEYS.fromEmail]: fromEmail,
  };

  const missing = Object.entries(required)
    .filter(([, value]) => value === undefined)
    .map(([key]) => key);

  // The guard restates what `missing` already established, so that TypeScript
  // narrows the five values to their non-optional types below.
  if (
    host === undefined ||
    port === undefined ||
    user === undefined ||
    password === undefined ||
    fromEmail === undefined
  ) {
    return { config: null, enabled, missing };
  }

  return {
    config: {
      host,
      port,
      secure:
        readBoolean(configService, SMTP_KEYS.secure) ??
        port === IMPLICIT_TLS_PORT,
      user,
      password,
      fromName: readText(configService, SMTP_KEYS.fromName),
      fromEmail,
      replyTo: readText(configService, SMTP_KEYS.replyTo),
      connectionTimeout:
        readNumber(configService, SMTP_KEYS.connectionTimeout) ??
        DEFAULT_CONNECTION_TIMEOUT_MS,
      socketTimeout:
        readNumber(configService, SMTP_KEYS.socketTimeout) ??
        DEFAULT_SOCKET_TIMEOUT_MS,
    },
    enabled,
    missing: [],
  };
}

/** A trimmed value, or `undefined` when the variable is absent or blank. */
function readText(
  configService: ConfigService,
  key: string,
): string | undefined {
  const value = configService.get<string>(key);
  const trimmed = typeof value === 'string' ? value.trim() : undefined;

  return trimmed === '' ? undefined : trimmed;
}

/**
 * A whole number, or `undefined` when the variable is absent or is not one.
 *
 * `env.validation.ts` already coerces and range-checks the numeric variables, so
 * in the running application this receives a `number`. The string branch is what
 * makes the function correct on its own, for a test or for any future caller
 * that reads a variable without going through that contract.
 */
function readNumber(
  configService: ConfigService,
  key: string,
): number | undefined {
  const value = configService.get<number | string>(key);

  if (typeof value === 'number') {
    return Number.isInteger(value) ? value : undefined;
  }

  const text = readText(configService, key);

  if (text === undefined) {
    return undefined;
  }

  const parsed = Number(text);

  return Number.isInteger(parsed) ? parsed : undefined;
}

/**
 * A boolean, or `undefined` when the variable was not set — which is what lets
 * each caller fall back to its own default instead of to a guess.
 *
 * Only `true` is true. `env.validation.ts` rejects every spelling other than
 * `true` and `false` at startup, so this branch is reached by nothing the
 * running application accepts; the strictness is here so the function cannot
 * quietly turn a typo into a `false` somebody has to debug.
 */
function readBoolean(
  configService: ConfigService,
  key: string,
): boolean | undefined {
  const value = configService.get<boolean | string>(key);

  if (typeof value === 'boolean') {
    return value;
  }

  const text = readText(configService, key)?.toLowerCase();

  return text === undefined ? undefined : text === 'true';
}
