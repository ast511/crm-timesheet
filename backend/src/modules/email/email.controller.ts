import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
} from '@nestjs/common';

import { EmailHealthResponseDto } from './dto/email-health-response.dto';
import { TestEmailDto } from './dto/test-email.dto';
import { EmailService } from './email.service';

/**
 * `/api/v1/email` — the two operational endpoints of the email infrastructure.
 *
 * Neither is a resource: there is no collection of emails to list, nothing is
 * stored, and nothing here is addressed by an id. What the module publishes is
 * the ability to answer two questions an operator asks while setting a
 * deployment up — *is the mail server reachable?* and *does a message actually
 * arrive?* — and both are one call.
 *
 * Everything else the module can do is reached by injecting `EmailService`.
 * There is deliberately no endpoint that sends a caller-supplied message: an
 * HTTP-callable "send this HTML to this address" is an open relay wearing the
 * company's `From` header, and no feature needs it.
 *
 * Both methods are one-line delegations. Validation is `TestEmailDto`'s job, the
 * success envelope is the global interceptor's, error rendering is the global
 * filter's, and every rule — what a test message says, what counts as
 * configured, how a provider error is wrapped — is the service's.
 *
 * Note what is *not* here: no guard, no role check, no notion of who is calling,
 * even though sending mail is plainly an administrator's action. Authentication
 * and authorization are later features, and half an access check is worse than
 * none — it reads as protection while providing none. Until then, the payload
 * being a single address is what keeps the exposure to "somebody could make the
 * server send a fixed test message".
 */
@Controller('email')
export class EmailController {
  constructor(private readonly emailService: EmailService) {}

  /**
   * Reports whether email is configured and whether the server answers.
   *
   * Always 200, including when the connection failed: the check succeeded in
   * finding out that mail is broken, and the body says so. A 503 would make a
   * monitoring probe unable to distinguish "email is down" from "this endpoint
   * is down".
   */
  @Get('health')
  checkHealth(): Promise<EmailHealthResponseDto> {
    return this.emailService.checkHealth();
  }

  /**
   * Sends the fixed test message to one address.
   *
   * `@HttpCode(200)` overrides the 201 Nest applies to `@Post`, because nothing
   * was created — there is no resource to point at and no `Location` to give.
   * The body is the envelope's `{ "success": true, "data": null }`: the useful
   * signal is the status code, and the confirmation the caller is really after
   * arrives in their inbox.
   *
   * A failure to send is an {@link EmailException} — a 500 carrying a written
   * message, with the provider's own error in the log.
   */
  @Post('test')
  @HttpCode(HttpStatus.OK)
  sendTestEmail(@Body() dto: TestEmailDto): Promise<void> {
    return this.emailService.sendTestEmail(dto.email);
  }
}
