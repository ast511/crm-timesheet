import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';

import {
  ApiOkEnvelope,
  ApiOkNullEnvelope,
} from '../../common/swagger/api-envelope-response.decorator';
import { ApiStandardErrors } from '../../common/swagger/api-standard-errors.decorator';
import { API_TAG } from '../../config/swagger-tags';
import { BEARER_AUTH_NAME } from '../../config/swagger.setup';
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
@ApiTags(API_TAG.Email)
@ApiBearerAuth(BEARER_AUTH_NAME)
@ApiStandardErrors()
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
  @ApiOperation({
    summary: 'Report whether email is configured and reachable',
    description:
      '**Always `200`, including when the connection failed**: the check succeeded in finding out that mail is broken, and the body says so. A `503` would leave a monitoring probe unable to distinguish "email is down" from "this endpoint is down". `configured` and `enabled` are two questions rather than one restated — the first is whether the environment names a mail server, the second whether this deployment may use it — and they come apart on a staging environment holding real addresses. `reason` names *which* setting is wrong without repeating the provider’s own text, which would publish a username or an internal hostname.',
  })
  @ApiOkEnvelope(EmailHealthResponseDto)
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
  @ApiOperation({
    summary: 'Send the fixed test message to one address',
    description:
      'The message is fixed and the body is a single address. There is deliberately **no endpoint that sends caller-supplied content**: an HTTP-callable "send this HTML to this address" is an open relay wearing the company’s `From` header, and no feature needs one. Answers `200` with `data: null` — the confirmation the caller is really after arrives in their inbox.',
  })
  @ApiOkNullEnvelope()
  @ApiStandardErrors(HttpStatus.BAD_REQUEST)
  @Post('test')
  @HttpCode(HttpStatus.OK)
  sendTestEmail(@Body() dto: TestEmailDto): Promise<void> {
    return this.emailService.sendTestEmail(dto.email);
  }
}
