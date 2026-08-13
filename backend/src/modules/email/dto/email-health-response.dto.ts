/**
 * Outcome of the SMTP connection check.
 *
 * Three values rather than a boolean, because "we did not try" is genuinely
 * different from "we tried and failed": the first is a deployment that has no
 * mail server configured, the second is one that has the wrong credentials or
 * an unreachable host. A boolean would report both as `false` and leave whoever
 * is looking at it to guess which.
 */
export enum EmailConnectionStatus {
  Ok = 'OK',
  Failed = 'FAILED',
  NotConfigured = 'NOT_CONFIGURED',
}

/**
 * Why the connection check failed, in this API's own vocabulary.
 *
 * A closed set of codes rather than the mail server's message, and the
 * distinction is the point. `FAILED` on its own leaves an operator to guess
 * between a wrong password, a wrong host and a wrong port, which is the whole
 * question they are trying to answer while editing `.env`. The provider's own
 * text would answer it — and would also publish, to an endpoint that currently
 * has no authentication in front of it, sentences like `535 5.7.8 Username and
 * Password not accepted for user apikey@company.com` or `connect ECONNREFUSED
 * 10.0.3.14:587`: a username, an internal address, an internal hostname. That
 * text stays in the log, where it is useful and not public.
 *
 * The values are ours rather than Nodemailer's `EAUTH` / `ECONNECTION`, for the
 * same reason `EmailException` exists: a client of this API should not learn
 * which library delivers the mail, and these codes stay true if it is replaced.
 */
export enum EmailFailureReason {
  /** The server rejected the credentials. `SMTP_USER` or `SMTP_PASSWORD`. */
  AuthenticationFailed = 'AUTHENTICATION_FAILED',

  /** The server could not be reached at all. `SMTP_HOST` or `SMTP_PORT`. */
  ConnectionFailed = 'CONNECTION_FAILED',

  /** The server did not answer in time. An unreachable or overloaded host. */
  TimedOut = 'TIMED_OUT',

  /**
   * The connection was established but the TLS conversation failed. Almost
   * always `SMTP_SECURE` disagreeing with the port — implicit TLS attempted on
   * a STARTTLS port, or the reverse.
   */
  TlsError = 'TLS_ERROR',

  /** Something else. The log has the provider's own account of it. */
  Unknown = 'UNKNOWN',
}

/**
 * Shape returned by `GET /api/v1/email/health`.
 *
 * Follows `HealthResponseDto` from the application's own health module, which
 * since Feature 038 means a class that nothing validates and nothing
 * constructs: it describes a response, and treating it as a public contract is
 * what lets a monitoring probe depend on it. The class exists only so the
 * generated documentation has a runtime value to read; the shape is unchanged.
 *
 * `configured` and `enabled` are two questions, not one restated: the first is
 * whether the environment names a mail server, the second whether this
 * deployment may use it. They come apart in the case `SMTP_ENABLED` exists for
 * — a staging environment holding real employee addresses, which has perfectly
 * good credentials and must not mail anybody with them.
 */
export class EmailHealthResponseDto {
  /** Whether every required `SMTP_*` variable is present. */
  readonly configured!: boolean;

  /** Whether this instance would actually send: configured, and `SMTP_ENABLED`. */
  readonly enabled!: boolean;

  /**
   * The result of the connection check. Reported even when `enabled` is false,
   * so "the credentials work, sending is switched off" is distinguishable from
   * "nothing was ever set up".
   */
  readonly connection!: EmailConnectionStatus;

  /**
   * Why the check failed. Present only when `connection` is `FAILED`, so its
   * absence is not a fourth state to interpret — a client reads `connection`
   * first and this only when it has to.
   */
  readonly reason?: EmailFailureReason;
}
