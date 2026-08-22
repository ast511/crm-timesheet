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
import { RequirePermission } from '../authorization/decorators/require-permission.decorator';
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
 * ## `POST /email/test` is gated; `GET /email/health` is not
 *
 * Feature 041 closed the note this file used to end on. Sending mail is plainly
 * an administrator's action, and the mitigation the old note relied on — "the
 * payload is a single address, so the exposure is only that somebody could make
 * the server send a fixed test message" — is a smaller hole rather than no hole:
 * an unauthorised caller could still emit mail from the company's own `From`
 * header, at whatever address they chose, as often as the rate limiter allowed.
 *
 * **There is no `EMAIL` resource in the permission catalog**, and inventing one
 * is a `schema.prisma` change rather than a decorator — see
 * `PositionController`, which faced the same problem, and
 * `authorization/catalog.spec.ts`, which makes a key the seed does not create a
 * failing test. `NOTIFICATION_CONFIG.EDIT` is the closest thing the catalog
 * actually says: it is the key held by whoever administers how this company sends
 * messages, it is what
 * `POST /notification-delivery/execute/:campaignId` takes for the same reason,
 * and it is in the `Admin - Standard` baseline and in no HR tier — which is the
 * right audience for an operator's diagnostic. A dedicated resource is recorded
 * as a future improvement.
 *
 * `GET /email/health` stays ungated. It sends nothing, and it deliberately
 * answers `200` even when the mail server is unreachable so a monitoring probe
 * can tell "email is down" from "this endpoint is down" — a `403` in front of it
 * would break exactly that. `reason` already names *which* setting is wrong
 * without repeating the provider's text, so it publishes no username and no
 * internal hostname.
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
      'The message is fixed and the body is a single address. There is deliberately **no endpoint that sends caller-supplied content**: an HTTP-callable "send this HTML to this address" is an open relay wearing the company’s `From` header, and no feature needs one. Requires `NOTIFICATION_CONFIG.EDIT` — an operator’s diagnostic, and the closest key the catalog has to "administers how this company sends messages". Answers `200` with `data: null` — the confirmation the caller is really after arrives in their inbox.',
  })
  @ApiOkNullEnvelope()
  @ApiStandardErrors(HttpStatus.BAD_REQUEST, HttpStatus.FORBIDDEN)
  @Post('test')
  @HttpCode(HttpStatus.OK)
  @RequirePermission('NOTIFICATION_CONFIG.EDIT')
  sendTestEmail(@Body() dto: TestEmailDto): Promise<void> {
    return this.emailService.sendTestEmail(dto.email);
  }
}
