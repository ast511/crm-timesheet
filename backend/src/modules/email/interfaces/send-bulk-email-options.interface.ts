import { SendEmailOptions } from './send-email-options.interface';

/**
 * One message, addressed to several recipients.
 *
 * Declared as {@link SendEmailOptions} with `to` swapped for `recipients`, so
 * the body, the subject and the attachments are described in exactly one place.
 * A second, independent interface would be the one that eventually forgets a
 * field the single-recipient form has gained.
 *
 * `recipients` rather than `to: string[]` because the two are not the same
 * message: `to` with several addresses is one email whose recipients can all
 * see each other, while this sends each person their own copy. Notifications go
 * to colleagues who have no business reading each other's addresses, so the
 * per-recipient form is the one worth having — see `EmailService.sendMany`.
 */
export interface SendBulkEmailOptions extends Omit<SendEmailOptions, 'to'> {
  /** Every address to send to. An empty list sends nothing. */
  readonly recipients: string[];
}
