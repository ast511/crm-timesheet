import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { EmailService } from '../email/email.service';
import {
  AccountLifecycleConfig,
  loadAccountLifecycleConfig,
} from './account-lifecycle.config';

/** Everything an onboarding or recovery email needs in order to be written. */
export interface AccountEmailContext {
  readonly to: string;
  /** The raw link secret. Used to build the URL, and nowhere else. */
  readonly token: string;
  readonly expiresAt: Date;
}

/**
 * The two emails the account lifecycle sends, and the links inside them.
 *
 * **It composes; `EmailService` delivers.** No `SMTP_*` variable is read here,
 * Nodemailer is not imported, and no transporter exists — the rule Feature 025
 * established and every sender since has kept. What this class owns is the part
 * that is genuinely this feature's: the URL a link points at, and the words
 * around it.
 *
 * ## The link is built here, and why the backend builds it at all
 *
 * The token is minted on this side, so the URL has to be assembled on this side;
 * the alternative — emailing a bare token and asking the reader to paste it into
 * a form — is the flow people abandon. But the *screen* it opens is the
 * frontend's, which is why `APP_WEB_URL` exists: it is the one thing this API
 * knows about the application in front of it, and it has no default, because a
 * guessed origin means invitations quietly emailed to a machine that is not
 * there.
 *
 * The token travels in the query string rather than the path, so the frontend
 * router needs no parameterised route to read it, and both links land on a
 * dedicated screen rather than on the login page with a flag.
 *
 * ## What is deliberately not in these messages
 *
 * **No password, ever** — that is the entire point of the mechanism, and it is
 * why an activation link exists instead of a generated password. A password in
 * an email is a password in a mailbox, in a mail server's logs and in a backup,
 * readable by anybody who ever reaches any of the three, and — because people
 * reuse passwords — it is a credential for somewhere else too.
 *
 * **No name, no employee code, no role.** A message that opens "Hello Ana Pop,
 * HR Specialist" is a sentence about an employee sitting in whatever inbox the
 * address actually reaches, including a typo'd one. The address is the only
 * personal datum here, and the recipient already knows it.
 *
 * **Nothing is logged.** Not the token, not the URL, not the recipient. A log
 * line carrying an activation URL is an activation URL in the log aggregator,
 * which is the one place a link is guaranteed to outlive its mailbox.
 */
@Injectable()
export class AccountEmailService {
  private readonly logger = new Logger(AccountEmailService.name);

  private readonly config: AccountLifecycleConfig;

  constructor(
    private readonly email: EmailService,
    configService: ConfigService,
  ) {
    this.config = loadAccountLifecycleConfig(configService);
  }

  /** The invitation a new account is onboarded with. */
  async sendActivation(context: AccountEmailContext): Promise<void> {
    const link = this.buildLink(ACTIVATION_PATH, context.token);
    const validity = describeValidity(context.expiresAt);

    await this.send(context.to, {
      subject: 'Activate your CRM TimeSheet account',
      intro:
        'An account has been created for you in the CRM TimeSheet system. To finish setting it up, choose your password using the link below.',
      action: 'Set your password',
      link,
      validity,
      footer:
        'If you were not expecting this email, you can ignore it — the account cannot be used until somebody sets a password for it.',
    });
  }

  /** The recovery link for somebody who has forgotten their password. */
  async sendPasswordReset(context: AccountEmailContext): Promise<void> {
    const link = this.buildLink(RESET_PATH, context.token);
    const validity = describeValidity(context.expiresAt);

    await this.send(context.to, {
      subject: 'Reset your CRM TimeSheet password',
      intro:
        'We received a request to reset the password for your CRM TimeSheet account. Choose a new password using the link below.',
      action: 'Choose a new password',
      link,
      validity,
      // The honest advice for the case that matters: somebody who did not ask
      // for this should know their password is unchanged and that ignoring the
      // message is the correct response — not that they should "contact
      // support", which most people will not do.
      footer:
        'If you did not request this, you can ignore this email. Your password will not change until the link above is used.',
    });
  }

  /**
   * `https://app.example.com/activate-account?token=…`
   *
   * `encodeURIComponent` although the secret is base64url and contains nothing
   * that needs escaping: it is one call, and the day the encoding changes this
   * is the line that would otherwise produce links that work for most tokens.
   */
  private buildLink(path: string, token: string): string {
    return `${this.config.webUrl}${path}?token=${encodeURIComponent(token)}`;
  }

  /**
   * Renders the message and hands it to the mailer.
   *
   * One template for both emails rather than two files of near-identical markup:
   * they differ in five strings, and two copies would be two places for the
   * styling and the plain-text alternative to drift. Both parts are produced —
   * a message with no text alternative scores worse with spam filters and is
   * unreadable in a client that blocks HTML, which for a link somebody must
   * click is the difference between onboarding and a support ticket.
   *
   * Delivery failure is **not swallowed**. `EmailService` already drops messages
   * silently when `SMTP_ENABLED=false`, which is the deliberate staging
   * behaviour; a genuine failure — an unreachable host, a rejected password —
   * propagates, because "the account was created and the invitation was not sent"
   * is a state nobody can see and nobody can fix. The caller decides what to do
   * with that, and `AccountService` documents its choice.
   */
  private async send(to: string, content: EmailContent): Promise<void> {
    this.logger.debug(`Sending an account ${content.action} email`);

    await this.email.send({
      to,
      subject: content.subject,
      text: renderText(content),
      html: renderHtml(content),
    });
  }
}

/** The five strings the shared template is filled with. */
interface EmailContent {
  readonly subject: string;
  readonly intro: string;
  readonly action: string;
  readonly link: string;
  readonly validity: string;
  readonly footer: string;
}

/**
 * Paths on the frontend, not on this API.
 *
 * They are the contract between the emailed link and the React router, and they
 * are constants here so that changing one is a change in a single file rather
 * than a string search through two repositories.
 */
const ACTIVATION_PATH = '/activate-account';
const RESET_PATH = '/reset-password';

/**
 * "This link is valid for 48 hours."
 *
 * Rendered from the remaining time rather than printing a timestamp, because a
 * timestamp raises the question of which timezone it is in — and this is the one
 * message in the application whose reader may be anywhere, is not signed in, and
 * therefore has no company timezone to render it against. Hours, rounded, is the
 * unit somebody actually acts on.
 */
function describeValidity(expiresAt: Date): string {
  const hours = Math.max(
    1,
    Math.round((expiresAt.getTime() - Date.now()) / 3_600_000),
  );

  return `This link is valid for ${String(hours)} ${hours === 1 ? 'hour' : 'hours'} and can only be used once.`;
}

/** The plain-text alternative, with the URL spelled out so it can be copied. */
function renderText(content: EmailContent): string {
  return [
    content.intro,
    '',
    content.link,
    '',
    content.validity,
    '',
    content.footer,
  ].join('\n');
}

/**
 * The HTML part.
 *
 * Inline styles and a table-free layout, because mail clients are not browsers:
 * a `<style>` block is stripped by several of them and a stylesheet is fetched
 * by none. The URL is repeated below the button as text, since a client that
 * blocks or mangles the anchor still has to leave somebody able to reach the
 * page.
 */
function renderHtml(content: EmailContent): string {
  return [
    `<p>${content.intro}</p>`,
    `<p><a href="${content.link}" style="display:inline-block;padding:12px 20px;background:#1f6feb;color:#ffffff;border-radius:6px;text-decoration:none;font-weight:600">${content.action}</a></p>`,
    `<p style="color:#555">${content.validity}</p>`,
    `<p style="color:#555">If the button does not work, copy this address into your browser:<br><span style="word-break:break-all">${content.link}</span></p>`,
    `<hr style="border:none;border-top:1px solid #ddd">`,
    `<p style="color:#777;font-size:13px">${content.footer}</p>`,
  ].join('\n');
}
