import { InternalServerErrorException } from '@nestjs/common';

/**
 * The only failure `EmailService` ever throws.
 *
 * Nodemailer's errors are useful and completely unsuitable for a caller: they
 * carry a provider-specific `code` (`EAUTH`, `ECONNECTION`, `EENVELOPE`), the
 * SMTP server's verbatim response, and — depending on the server — the account
 * the connection authenticated with. Letting one escape would put the mail
 * provider's vocabulary into every module that sends a notification, and its
 * text into the API's error envelope.
 *
 * So `send` and `sendMany` catch everything and rethrow this. Two consequences
 * are the point of the class:
 *
 * 1. **Callers depend on the abstraction, not the provider.** `catch (error) {
 *    if (error instanceof EmailException) … }` keeps working the day SMTP is
 *    replaced by a provider API or by a queue.
 * 2. **The client is told what happened, not how.** The message is written
 *    here; the underlying reason is logged by the service, where it belongs.
 *
 * Extending `InternalServerErrorException` rather than `Error` makes the
 * project's global filter render it as the ordinary error envelope with a 500 —
 * "the server could not do what it promised", which is what a failed send is.
 * There is no variant carrying a different status: a misconfigured server and
 * an unreachable one are both the operator's problem and neither is fixable by
 * changing the request.
 *
 * `cause` keeps the original error attached for anything that wants to inspect
 * it programmatically. It is never rendered — `HttpException` serialises only
 * its message.
 */
export class EmailException extends InternalServerErrorException {
  constructor(message: string, cause?: unknown) {
    super(message, { cause: cause instanceof Error ? cause : undefined });
  }
}
