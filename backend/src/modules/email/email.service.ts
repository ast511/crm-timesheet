import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createTransport, SendMailOptions, Transporter } from 'nodemailer';

import {
  EmailConnectionStatus,
  EmailFailureReason,
  EmailHealthResponseDto,
} from './dto/email-health-response.dto';
import { loadSmtpConfig, SmtpConfig } from './email.config';
import { EmailException } from './email.exception';
import { SendBulkEmailOptions } from './interfaces/send-bulk-email-options.interface';
import { SendEmailOptions } from './interfaces/send-email-options.interface';

/**
 * A configured mail server and the transporter that talks to it.
 *
 * The two are kept together in one nullable field rather than as two fields
 * that could disagree: there is a transporter exactly when there is a
 * configuration, and stating it this way means no method has to assert it.
 */
interface ConfiguredSmtp {
  readonly config: SmtpConfig;
  readonly transporter: Transporter;
}

/**
 * The one place in this application that sends email.
 *
 * Everything else — leave decisions, timesheet reminders, whatever the
 * notification features turn out to need — injects this service and hands it a
 * {@link SendEmailOptions}. No other module imports Nodemailer, reads an
 * `SMTP_*` variable or builds a transporter, and that is the whole point:
 * changing the mail provider, putting a queue in front of it or silencing email
 * in staging then happens here, once, instead of in every module that has
 * something to say.
 *
 * Four decisions worth recording:
 *
 * 1. **One transporter, built once.** Nodemailer's transporter is designed to be
 *    long-lived; creating one per message would repeat the TCP connection, the
 *    TLS handshake and the SMTP authentication every time. It is built in the
 *    constructor — `createTransport` assembles an object and opens nothing — and
 *    held in a `readonly` field, so "reused" is a property of the class rather
 *    than a rule somebody has to remember.
 * 2. **A missing configuration is not a crash.** With no `SMTP_*` variables
 *    there is no transporter, the application still starts, every send is
 *    refused with an {@link EmailException}, and `checkHealth` reports
 *    `NOT_CONFIGURED`. A developer machine or a CI run has no mail server, and
 *    refusing to boot over it would make the whole API hostage to a feature most
 *    requests never touch.
 * 3. **A disabled module drops messages instead of failing them.** `SMTP_ENABLED=false`
 *    is the switch a staging deployment holding real employee addresses needs,
 *    and it would be worthless if it turned every notification into a 500: the
 *    leave request that triggered the email must still be approved. See
 *    {@link send}.
 * 4. **Nothing here renders anything.** Subject and body arrive ready. This
 *    module knows how to *deliver* a message, not how to compose one; templates,
 *    variable substitution and a notification centre are later features that
 *    will produce strings and pass them in.
 */
@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);

  /** `null` while the environment names no mail server. */
  private readonly smtp: ConfiguredSmtp | null;

  /** `SMTP_ENABLED` — whether this deployment may send at all. */
  private readonly sendingEnabled: boolean;

  constructor(configService: ConfigService) {
    const { config, enabled, missing } = loadSmtpConfig(configService);

    this.sendingEnabled = enabled;
    this.smtp =
      config === null
        ? null
        : { config, transporter: createSmtpTransport(config) };

    this.warnWhenSilent(config, missing);
  }

  /**
   * Sends one message.
   *
   * Resolving means the SMTP server accepted the message for delivery, not that
   * it arrived: mail is store-and-forward, and a mailbox that bounces an hour
   * later is invisible from here. A caller recording "the employee has been
   * notified" is recording exactly this much.
   *
   * With `SMTP_ENABLED=false` it resolves without sending, and that ordering is
   * deliberate — the switch is checked before the configuration, so an
   * environment that has deliberately turned email off does not also have to
   * carry credentials it will never use. Every other failure — an unreachable
   * host, a rejected password, a refused recipient — comes back as an
   * {@link EmailException} whose message is written here. The provider's own
   * error goes to the log, where the SMTP code that actually identifies the
   * problem is useful and not public.
   */
  async send(options: SendEmailOptions): Promise<void> {
    if (!this.sendingEnabled) {
      // No recipient and no subject: a dropped notification is still a line
      // about an employee. That the module is dropping mail is the fact worth
      // recording, and the startup warning says why.
      this.logger.debug('Email is disabled — the message was not sent');

      return;
    }

    const { config, transporter } = this.requireSmtp();

    try {
      await transporter.sendMail(buildMessage(config, options));
    } catch (error) {
      // Neither the recipient nor the subject is logged. Both are personal data
      // once notifications exist — "Leave request from Ana Pop" is a sentence
      // about an employee — and the provider's error is what a troubleshooter
      // actually needs.
      this.logger.error(
        'Sending an email through SMTP failed',
        toLogDetail(error),
      );

      throw new EmailException(SEND_FAILED_MESSAGE, error);
    }
  }

  /**
   * Sends the same message to several recipients, one email each.
   *
   * Each recipient gets their own copy rather than appearing in a shared `To`,
   * so nobody learns who else was notified — which matters as soon as the
   * recipients are colleagues rather than a mailing list.
   *
   * Sequential on purpose, and this is the deliberately simple version: no
   * batching, no parallelism, no queue, no retry. A failure on the third address
   * stops the loop and propagates, so the first two are sent and the rest are
   * not. That is honest for the handful of addresses this application maintains
   * by hand, and it is the behaviour the email-queue feature will replace when
   * it takes delivery out of the request.
   *
   * An empty list is a no-op, including when SMTP is not configured: sending to
   * nobody cannot fail, and "there are no notification addresses" is a normal
   * state rather than an error.
   */
  async sendMany({
    recipients,
    ...message
  }: SendBulkEmailOptions): Promise<void> {
    for (const to of recipients) {
      await this.send({ ...message, to });
    }
  }

  /**
   * Reports whether email can be sent from this instance.
   *
   * `verify()` opens a connection and authenticates without sending anything, so
   * it catches the two failures that are otherwise only discovered by a message
   * that never arrives: a host nobody can reach, and credentials the server
   * rejects. It is subject to the configured timeouts like every other
   * conversation with the server, so an unreachable host answers in seconds
   * rather than holding the probe open.
   *
   * The connection is checked even when `SMTP_ENABLED=false`, and the pair of
   * fields is then the useful answer: `enabled: false` with `connection: "OK"`
   * says the credentials are sound and sending is switched off, which is exactly
   * what an operator wants to see on a staging box. Suppressing the check would
   * report the same `NOT_CONFIGURED` as a deployment that was never set up.
   *
   * It answers rather than throws, which is what makes it a health check: a
   * probe asking "is email working?" wants `FAILED` and a 200, not a 500 that
   * looks like the endpoint itself is broken. It is also the one path here that
   * raises no {@link EmailException} — the failure *is* the answer.
   */
  async checkHealth(): Promise<EmailHealthResponseDto> {
    if (this.smtp === null) {
      return {
        configured: false,
        enabled: false,
        connection: EmailConnectionStatus.NotConfigured,
      };
    }

    const enabled = this.sendingEnabled;

    try {
      await this.smtp.transporter.verify();

      return {
        configured: true,
        enabled,
        connection: EmailConnectionStatus.Ok,
      };
    } catch (error) {
      this.logger.error('The SMTP connection check failed', toLogDetail(error));

      return {
        configured: true,
        enabled,
        connection: EmailConnectionStatus.Failed,
        reason: toFailureReason(error),
      };
    }
  }

  /**
   * Sends the fixed test message to one address.
   *
   * The content is a constant rather than a parameter: what is being proven is
   * that this deployment's SMTP settings deliver mail, and a caller-supplied
   * body would turn the endpoint into an open relay wearing the company's
   * `From` address.
   *
   * The one caller that refuses to run while email is disabled, rather than
   * quietly doing nothing like {@link send} does. The difference is what the
   * call means: a notification is a side effect of some other action and must
   * not fail it, while this *is* the action — an operator asking whether mail
   * works. Answering "yes" without having sent anything would be a lie, and the
   * lie would be discovered by waiting for an email that never comes.
   *
   * Otherwise it goes through {@link send} like everything else, so what it
   * exercises is the real path — the same transporter, the same headers, the
   * same error handling — and not a second one that could work while the first
   * does not.
   */
  async sendTestEmail(email: string): Promise<void> {
    if (!this.sendingEnabled) {
      throw new EmailException(DISABLED_MESSAGE);
    }

    await this.send({
      to: email,
      subject: TEST_EMAIL_SUBJECT,
      text: TEST_EMAIL_TEXT,
      html: TEST_EMAIL_HTML,
    });
  }

  /**
   * The configured transport, or a refusal.
   *
   * Every send goes through here, so "email is not configured" is stated once
   * and cannot be forgotten by a method added later.
   */
  private requireSmtp(): ConfiguredSmtp {
    if (this.smtp === null) {
      throw new EmailException(NOT_CONFIGURED_MESSAGE);
    }

    return this.smtp;
  }

  /**
   * Says so at startup when this instance will not be sending mail.
   *
   * The two reasons are logged differently because they are different mistakes:
   * an incomplete configuration is usually an accident and the message names the
   * variables to add, while `SMTP_ENABLED=false` is somebody's decision and the
   * message only has to make it visible. Variable *names* are logged, never
   * their values — the same rule `formatErrors` follows in `env.validation.ts`,
   * where printing a rejected value would put a password in the log.
   */
  private warnWhenSilent(config: SmtpConfig | null, missing: string[]): void {
    if (config === null) {
      this.logger.warn(
        `Email is not configured — ${missing.join(', ')} not set. Sending will be refused.`,
      );

      return;
    }

    if (!this.sendingEnabled) {
      this.logger.warn(
        'Email is configured but disabled by SMTP_ENABLED. Messages will be dropped.',
      );
    }
  }
}

/**
 * Builds the transporter from the configuration.
 *
 * The one call to `createTransport` in the project, and the only place that
 * knows Nodemailer nests the credentials under `auth` and spells the timeouts
 * `connectionTimeout` / `socketTimeout`. Kept out of the constructor so what the
 * constructor says is "there is exactly one of these", which is the property
 * that matters.
 */
function createSmtpTransport(config: SmtpConfig): Transporter {
  return createTransport({
    host: config.host,
    port: config.port,
    secure: config.secure,
    auth: { user: config.user, pass: config.password },
    connectionTimeout: config.connectionTimeout,
    socketTimeout: config.socketTimeout,
  });
}

/**
 * Turns the application's options into the payload the transport expects.
 *
 * The only function in the module that speaks both vocabularies, which is what
 * keeps the Nodemailer types out of every other file. The sender is added here
 * rather than accepted from the caller: `From` and `Reply-To` identify this
 * application, not the module that had something to say.
 *
 * `undefined` fields are simply omitted by Nodemailer, so an absent `Reply-To`,
 * `cc` or attachment list needs no conditional.
 */
function buildMessage(
  config: SmtpConfig,
  options: SendEmailOptions,
): SendMailOptions {
  return {
    from: config.fromName
      ? { name: config.fromName, address: config.fromEmail }
      : config.fromEmail,
    replyTo: config.replyTo,
    to: options.to,
    cc: options.cc,
    bcc: options.bcc,
    subject: options.subject,
    text: options.text,
    html: options.html,
    attachments: options.attachments,
  };
}

/**
 * The provider's error codes, mapped onto this API's vocabulary.
 *
 * Nodemailer reports the cause as a `code` on the error — a small, stable set
 * that says which of the four things went wrong. The raw codes stay in this
 * table rather than in the response, so `EmailFailureReason` is what the API
 * publishes and the provider's spelling remains an implementation detail. The
 * lower-level Node codes are listed beside Nodemailer's own because a socket
 * error occasionally surfaces before the library has wrapped it.
 */
const PROVIDER_FAILURE_REASONS: Record<string, EmailFailureReason | undefined> =
  {
    EAUTH: EmailFailureReason.AuthenticationFailed,
    ECONNECTION: EmailFailureReason.ConnectionFailed,
    ECONNREFUSED: EmailFailureReason.ConnectionFailed,
    EDNS: EmailFailureReason.ConnectionFailed,
    ENOTFOUND: EmailFailureReason.ConnectionFailed,
    EHOSTUNREACH: EmailFailureReason.ConnectionFailed,
    ETIMEDOUT: EmailFailureReason.TimedOut,
    ESOCKETTIMEDOUT: EmailFailureReason.TimedOut,
    ESOCKET: EmailFailureReason.TlsError,
  };

/**
 * Which of the four failures this error is.
 *
 * Anything unrecognised — and anything that is not an object with a `code` —
 * becomes `UNKNOWN` rather than a guess. The log still holds the provider's own
 * account of it, which is where an unmapped code is discovered and added above.
 */
function toFailureReason(error: unknown): EmailFailureReason {
  const { code } = (error ?? {}) as { code?: unknown };

  if (typeof code !== 'string') {
    return EmailFailureReason.Unknown;
  }

  return PROVIDER_FAILURE_REASONS[code] ?? EmailFailureReason.Unknown;
}

/**
 * What gets written to the log for a failure.
 *
 * A stack when there is one, the value itself otherwise — a library can reject
 * with something that is not an `Error`, and `undefined` in the log would be
 * worse than the string.
 */
function toLogDetail(error: unknown): string {
  return error instanceof Error
    ? (error.stack ?? error.message)
    : String(error);
}

/**
 * Returned when the environment names no mail server.
 *
 * It does not list the variables that are missing: this endpoint has no
 * authentication in front of it yet, and the startup log already names them for
 * the person who can act on it.
 */
const NOT_CONFIGURED_MESSAGE = 'Email is not configured on this server';

/** Returned when the operator has switched sending off. */
const DISABLED_MESSAGE = 'Email sending is disabled on this server';

/** Returned for every delivery failure; the reason goes to the log. */
const SEND_FAILED_MESSAGE = 'The email could not be sent';

const TEST_EMAIL_SUBJECT = 'HR Management System - Test Email';

const TEST_EMAIL_TEXT =
  'This is a test email.\n\nIf you received this email, the SMTP configuration is working correctly.';

const TEST_EMAIL_HTML =
  '<p>This is a test email.</p>\n<p>If you received this email, the SMTP configuration is working correctly.</p>';
