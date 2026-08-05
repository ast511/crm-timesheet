/**
 * Everything the application can say about one email.
 *
 * This is the contract between `EmailService` and every module that will ever
 * ask it to send something, and it is deliberately written in the vocabulary of
 * *email* rather than in the vocabulary of the library that delivers it. No
 * Nodemailer type appears here, which is what lets the transport be replaced —
 * by an API-based provider, by a queue, by a fake in a test — without touching
 * a single caller.
 *
 * There is no `from` and no `replyTo`: those identify the *sender*, they are the
 * same for every message this application produces, and they come from the
 * environment. A caller that could set them could send mail as somebody else.
 */
export interface SendEmailOptions {
  /** The recipient. One address — {@link SendBulkEmailOptions} covers many. */
  readonly to: string;

  readonly subject: string;

  /**
   * The HTML body. Required, because every message this application sends is
   * HTML; `text` below is the fallback for clients that will not render it.
   *
   * Already-rendered markup: this module does not template. Turning a leave
   * request into a sentence is the notification-templates feature's job, and it
   * hands the result here as a string.
   */
  readonly html: string;

  /**
   * Plain-text alternative. Optional, but worth supplying: a message with no
   * text part scores worse with spam filters and is unreadable in a client that
   * blocks HTML.
   */
  readonly text?: string;

  readonly cc?: string[];

  readonly bcc?: string[];

  readonly attachments?: EmailAttachment[];
}

/**
 * A file travelling with a message.
 *
 * Its own type rather than the transport library's, for the reason above: an
 * attachment is a filename plus bytes plus a media type in any provider's API,
 * and stating that here keeps the provider's richer options (streams, URLs,
 * pre-encoded content) out of the contract until something actually needs them.
 */
export interface EmailAttachment {
  /** Name the recipient sees. */
  readonly filename: string;

  /** The bytes themselves — a `Buffer` for binary, a string for text. */
  readonly content: string | Buffer;

  /** MIME type. When absent, it is inferred from `filename`. */
  readonly contentType?: string;
}
