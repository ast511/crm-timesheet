import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createTransport, Transporter } from 'nodemailer';

import {
  EmailConnectionStatus,
  EmailFailureReason,
} from './dto/email-health-response.dto';
import { SMTP_KEYS } from './email.config';
import { EmailException } from './email.exception';
import { EmailService } from './email.service';

jest.mock('nodemailer', () => ({ createTransport: jest.fn() }));

const createTransportMock = createTransport as jest.MockedFunction<
  typeof createTransport
>;

const configServiceOf = (env: Record<string, unknown>): ConfigService =>
  ({ get: (key: string) => env[key] }) as ConfigService;

/** A complete configuration, with both optional headers set. */
const SMTP_ENV = {
  [SMTP_KEYS.host]: 'smtp.example.com',
  [SMTP_KEYS.port]: 587,
  [SMTP_KEYS.user]: 'apikey',
  [SMTP_KEYS.password]: 's3cret',
  [SMTP_KEYS.fromName]: 'HR Management System',
  [SMTP_KEYS.fromEmail]: 'no-reply@example.com',
  [SMTP_KEYS.replyTo]: 'hr@example.com',
};

/**
 * An error shaped like Nodemailer's: a message, and the `code` that says which
 * of the four things went wrong.
 */
const providerError = (code: string, message = 'SMTP failure'): Error =>
  Object.assign(new Error(message), { code });

const MESSAGE = {
  to: 'ana.pop@example.com',
  subject: 'Leave approved',
  html: '<p>Approved.</p>',
  text: 'Approved.',
};

describe('EmailService', () => {
  let sendMail: jest.Mock;
  let verify: jest.Mock;

  /** Builds the service against an environment, as Nest would. */
  const serviceOf = (env: Record<string, unknown> = SMTP_ENV): EmailService =>
    new EmailService(configServiceOf(env));

  beforeEach(() => {
    jest.clearAllMocks();

    sendMail = jest.fn().mockResolvedValue({ messageId: 'msg-1' });
    verify = jest.fn().mockResolvedValue(true);
    createTransportMock.mockReturnValue({
      sendMail,
      verify,
    } as unknown as Transporter);

    // The service warns at construction whenever it will not be sending; the
    // assertions below check the calls, the spies keep them out of the output.
    jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    jest.spyOn(Logger.prototype, 'debug').mockImplementation(() => undefined);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('the transporter', () => {
    /**
     * The property the feature is built around: one connection pool for the
     * lifetime of the process, not one per message.
     */
    it('is built once and reused by every send', async () => {
      const service = serviceOf();

      await service.send(MESSAGE);
      await service.send(MESSAGE);
      await service.checkHealth();

      expect(createTransportMock).toHaveBeenCalledTimes(1);
      expect(sendMail).toHaveBeenCalledTimes(2);
    });

    it('is built from the SMTP settings, credentials nested as the library expects', () => {
      serviceOf();

      expect(createTransportMock).toHaveBeenCalledWith({
        host: 'smtp.example.com',
        port: 587,
        secure: false,
        auth: { user: 'apikey', pass: 's3cret' },
        connectionTimeout: 10_000,
        socketTimeout: 30_000,
      });
    });

    it('is not built at all when the configuration is incomplete', () => {
      serviceOf({ [SMTP_KEYS.host]: 'smtp.example.com' });

      expect(createTransportMock).not.toHaveBeenCalled();
    });

    /** Names, never values — a warning must not print SMTP_PASSWORD. */
    it('warns at startup naming the missing variables', () => {
      const warn = jest.spyOn(Logger.prototype, 'warn');

      serviceOf({ ...SMTP_ENV, [SMTP_KEYS.password]: undefined });

      expect(warn).toHaveBeenCalledWith(
        expect.stringContaining(SMTP_KEYS.password),
      );
      expect(warn).not.toHaveBeenCalledWith(expect.stringContaining('s3cret'));
    });
  });

  describe('send', () => {
    it('hands the transport the whole message, with the configured sender', async () => {
      const attachment = { filename: 'report.csv', content: 'a,b\n1,2' };

      await serviceOf().send({
        ...MESSAGE,
        cc: ['lead@example.com'],
        bcc: ['audit@example.com'],
        attachments: [attachment],
      });

      expect(sendMail).toHaveBeenCalledWith({
        from: { name: 'HR Management System', address: 'no-reply@example.com' },
        replyTo: 'hr@example.com',
        to: 'ana.pop@example.com',
        cc: ['lead@example.com'],
        bcc: ['audit@example.com'],
        subject: 'Leave approved',
        text: 'Approved.',
        html: '<p>Approved.</p>',
        attachments: [attachment],
      });
    });

    it('sends from the bare address when no display name is configured', async () => {
      await serviceOf({ ...SMTP_ENV, [SMTP_KEYS.fromName]: undefined }).send(
        MESSAGE,
      );

      expect(sendMail).toHaveBeenCalledWith(
        expect.objectContaining({ from: 'no-reply@example.com' }),
      );
    });

    it('refuses to send when the environment names no mail server', async () => {
      const service = serviceOf({});

      await expect(service.send(MESSAGE)).rejects.toBeInstanceOf(
        EmailException,
      );
      expect(sendMail).not.toHaveBeenCalled();
    });

    /**
     * The reason the exception exists: a caller learns that sending failed,
     * never how the provider phrased it.
     */
    it('wraps a provider failure without leaking its message', async () => {
      const providerError = new Error('535 5.7.8 Bad credentials for apikey');
      sendMail.mockRejectedValue(providerError);

      const failure = serviceOf().send(MESSAGE);

      await expect(failure).rejects.toBeInstanceOf(EmailException);
      await expect(failure).rejects.toThrow('The email could not be sent');
      await expect(failure).rejects.not.toThrow(/535|credentials/);
    });

    it('keeps the provider error attached as the cause, and logs it', async () => {
      const providerError = new Error('ECONNREFUSED');
      const errorLog = jest.spyOn(Logger.prototype, 'error');
      sendMail.mockRejectedValue(providerError);

      await expect(serviceOf().send(MESSAGE)).rejects.toMatchObject({
        cause: providerError,
      });
      expect(errorLog).toHaveBeenCalled();
    });
  });

  describe('sendMany', () => {
    const bulk = {
      recipients: ['ana@example.com', 'ion@example.com', 'maria@example.com'],
      subject: 'Company holiday',
      html: '<p>The office is closed.</p>',
    };

    /** One copy each, so no recipient learns who else was notified. */
    it('sends one message per recipient', async () => {
      await serviceOf().sendMany(bulk);

      expect(sendMail).toHaveBeenCalledTimes(3);
      expect(sendMail.mock.calls.map(([message]) => message.to)).toEqual(
        bulk.recipients,
      );
      expect(sendMail).toHaveBeenCalledWith(
        expect.objectContaining({
          subject: 'Company holiday',
          html: '<p>The office is closed.</p>',
          cc: undefined,
          bcc: undefined,
        }),
      );
    });

    it('sends nothing for an empty list', async () => {
      await serviceOf().sendMany({ ...bulk, recipients: [] });

      expect(sendMail).not.toHaveBeenCalled();
    });

    /** No retry and no partial-failure report yet — a later feature's job. */
    it('stops at the first failure', async () => {
      sendMail
        .mockResolvedValueOnce({ messageId: 'msg-1' })
        .mockRejectedValueOnce(new Error('mailbox unavailable'));

      await expect(serviceOf().sendMany(bulk)).rejects.toBeInstanceOf(
        EmailException,
      );
      expect(sendMail).toHaveBeenCalledTimes(2);
    });
  });

  describe('checkHealth', () => {
    it('reports NOT_CONFIGURED without opening a connection', async () => {
      await expect(serviceOf({}).checkHealth()).resolves.toEqual({
        configured: false,
        enabled: false,
        connection: EmailConnectionStatus.NotConfigured,
      });
      expect(verify).not.toHaveBeenCalled();
    });

    it('reports OK when the server answers', async () => {
      await expect(serviceOf().checkHealth()).resolves.toEqual({
        configured: true,
        enabled: true,
        connection: EmailConnectionStatus.Ok,
      });
      expect(verify).toHaveBeenCalledTimes(1);
    });

    /** A health check reports a failure, it does not become one. */
    it('reports FAILED instead of throwing when the check fails', async () => {
      verify.mockRejectedValue(providerError('EAUTH', '535 Bad credentials'));

      await expect(serviceOf().checkHealth()).resolves.toEqual({
        configured: true,
        enabled: true,
        connection: EmailConnectionStatus.Failed,
        reason: EmailFailureReason.AuthenticationFailed,
      });
    });

    /**
     * The reason is what turns FAILED into something actionable — wrong
     * password, wrong host, wrong port — without publishing the server's own
     * sentence, which names the account and the internal address.
     */
    it.each([
      ['EAUTH', EmailFailureReason.AuthenticationFailed],
      ['ECONNECTION', EmailFailureReason.ConnectionFailed],
      ['ENOTFOUND', EmailFailureReason.ConnectionFailed],
      ['ETIMEDOUT', EmailFailureReason.TimedOut],
      ['ESOCKET', EmailFailureReason.TlsError],
    ])('maps the provider code %s to %s', async (code, reason) => {
      verify.mockRejectedValue(providerError(code));

      await expect(serviceOf().checkHealth()).resolves.toMatchObject({
        reason,
      });
    });

    it.each([
      ['an unmapped code', providerError('EWHATEVER')],
      ['no code at all', new Error('something went wrong')],
      ['a rejection that is not an error', 'nope'],
    ])('reports UNKNOWN for %s', async (_case, rejection) => {
      verify.mockRejectedValue(rejection);

      await expect(serviceOf().checkHealth()).resolves.toMatchObject({
        reason: EmailFailureReason.Unknown,
      });
    });

    /** Never the provider's own words, whichever code came with them. */
    it('does not carry the server message into the response', async () => {
      verify.mockRejectedValue(
        providerError(
          'EAUTH',
          '535 5.7.8 Username and Password not accepted for apikey@company.com',
        ),
      );

      const health = await serviceOf().checkHealth();

      expect(JSON.stringify(health)).not.toMatch(/535|company\.com|apikey/);
    });

    it('carries no reason when the connection is fine', async () => {
      const health = await serviceOf().checkHealth();

      expect(health.reason).toBeUndefined();
    });
  });

  describe('when SMTP_ENABLED is false', () => {
    const disabledEnv = { ...SMTP_ENV, [SMTP_KEYS.enabled]: false };

    /**
     * The switch a staging deployment needs: the leave request that triggered
     * the notification must still be approved.
     */
    it('drops a message instead of failing it', async () => {
      await expect(
        serviceOf(disabledEnv).send(MESSAGE),
      ).resolves.toBeUndefined();

      expect(sendMail).not.toHaveBeenCalled();
    });

    it('drops messages even when nothing is configured', async () => {
      const service = serviceOf({ [SMTP_KEYS.enabled]: false });

      await expect(service.send(MESSAGE)).resolves.toBeUndefined();
    });

    /** Unlike a notification, a test is the action rather than a side effect. */
    it('refuses a test email rather than pretending to send it', async () => {
      const failure = serviceOf(disabledEnv).sendTestEmail('ana@example.com');

      await expect(failure).rejects.toBeInstanceOf(EmailException);
      await expect(failure).rejects.toThrow('disabled');
      expect(sendMail).not.toHaveBeenCalled();
    });

    /** Configured and switched off is a different state from never set up. */
    it('still reports the connection, so the two states stay distinguishable', async () => {
      await expect(serviceOf(disabledEnv).checkHealth()).resolves.toEqual({
        configured: true,
        enabled: false,
        connection: EmailConnectionStatus.Ok,
      });
    });

    it('warns at startup that it will drop messages', () => {
      const warn = jest.spyOn(Logger.prototype, 'warn');

      serviceOf(disabledEnv);

      expect(warn).toHaveBeenCalledWith(
        expect.stringContaining(SMTP_KEYS.enabled),
      );
    });
  });

  describe('sendTestEmail', () => {
    it('sends the fixed message through the ordinary send path', async () => {
      await serviceOf().sendTestEmail('ana.pop@example.com');

      expect(sendMail).toHaveBeenCalledWith(
        expect.objectContaining({
          to: 'ana.pop@example.com',
          subject: 'HR Management System - Test Email',
          text: expect.stringContaining('This is a test email.') as string,
          html: expect.stringContaining('This is a test email.') as string,
        }),
      );
    });

    it('reports a delivery failure as an EmailException', async () => {
      sendMail.mockRejectedValue(new Error('connect ETIMEDOUT'));

      await expect(
        serviceOf().sendTestEmail('ana.pop@example.com'),
      ).rejects.toBeInstanceOf(EmailException);
    });
  });
});
