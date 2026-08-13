import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Req,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Request } from 'express';

import { CurrentUser } from '../../common/decorators/current-user.decorator';
import {
  ApiOkEnvelope,
  ApiOkNullEnvelope,
} from '../../common/swagger/api-envelope-response.decorator';
import {
  ApiPublicRouteErrors,
  ApiStandardErrors,
} from '../../common/swagger/api-standard-errors.decorator';
import { API_TAG } from '../../config/swagger-tags';
import { BEARER_AUTH_NAME } from '../../config/swagger.setup';
import { StrictRateLimit } from '../rate-limiting/decorators/strict-rate-limit.decorator';
import { AccountPasswordService } from './account-password.service';
import { PASSWORD_RESET_REQUESTED_MESSAGE } from './auth.constants';
import { AuthService, ClientContext } from './auth.service';
import { Public } from './decorators/public.decorator';
import { ActivateAccountDto } from './dto/activate-account.dto';
import { ChangePasswordDto } from './dto/change-password.dto';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { LoginDto } from './dto/login.dto';
import { RefreshDto } from './dto/refresh.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { AuthSessionEntity } from './entities/auth-session.entity';
import { AuthUserEntity } from './entities/authenticated-user.entity';
import { PasswordResetRequestedEntity } from './entities/password-reset-request.entity';

/**
 * `/api/v1/auth` — the prefix and the version come from `configureApp`, so only
 * the resource segment is declared here.
 *
 * Thin, like every other controller in this project: validation is the DTOs'
 * job, the success envelope is the global interceptor's, error rendering is the
 * global filter's, and every rule about credentials, rotation and revocation is
 * `AuthService`'s. The one thing this class does that others do not is read the
 * raw request — for the `User-Agent` and the address stored beside an issued
 * token — and that is a property of the transport rather than of the session, so
 * it is extracted here and handed to the service as a plain object.
 *
 * **Five of the eight routes are `@Public()`** as of Feature 036, and none of
 * them is unprotected — each is protected by a *different* credential from an
 * access token, which is what `@Public()` actually means:
 *
 * | Route | What authenticates it |
 * | --- | --- |
 * | `login` | the email and password in the body |
 * | `refresh` | the refresh token in the body |
 * | `activate` | the invitation link's secret |
 * | `forgot-password` | nothing — and it tells the caller nothing either |
 * | `reset-password` | the reset link's secret |
 *
 * All five carry `@StrictRateLimit()`. They are the only routes an
 * unauthenticated caller can reach that do real work — a bcrypt, a database
 * lookup, an email — and Feature 034's baseline alone would leave a few hundred
 * guesses a minute against each. `forgot-password` is on the strict tier for a
 * reason of its own: it *sends mail*, so an unlimited one is a way to have this
 * company's mail server deliver hundreds of messages to one colleague.
 *
 * The remaining three — `logout`, `me` and `change-password` — require an access
 * token like every other route in the application.
 */
@ApiTags(API_TAG.Authentication)
@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly passwords: AccountPasswordService,
  ) {}

  /**
   * Answers 200 rather than the 201 Nest gives a `@Post` by default.
   *
   * Nothing was created that the client can address. A session is not a resource
   * here — there is no `/auth/sessions/:id` to put in a `Location` header — and
   * `201` would promise one.
   */
  @ApiOperation({
    summary: 'Sign in',
    description:
      'Returns an access token, a refresh token and the account behind them. **No padlock, and the route is not unprotected** — it is protected by the password in the body, and the endpoint that *issues* a token cannot require one. Answers `200` rather than `201`: a session is not a resource here, there is no `/auth/sessions/:id` to put in a `Location` header, and `201` would promise one. A wrong address, a wrong password and a deactivated account all answer `401 AUTH_INVALID_CREDENTIALS` with the same message and equalised timing — splitting them would confirm that an address exists, which in a company’s internal system also answers "does this person work here". On the strict rate-limit tier.',
  })
  @ApiOkEnvelope(AuthSessionEntity)
  @ApiPublicRouteErrors(HttpStatus.BAD_REQUEST, HttpStatus.UNAUTHORIZED)
  @Public()
  @StrictRateLimit()
  @Post('login')
  @HttpCode(HttpStatus.OK)
  login(
    @Body() dto: LoginDto,
    @Req() request: Request,
  ): Promise<AuthSessionEntity> {
    return this.authService.login(dto, readClientContext(request));
  }

  /**
   * Rotates a refresh token into a new session.
   *
   * `@Public()` at the authentication level only: the endpoint is not
   * unprotected, it is protected by a *different* credential — the refresh token
   * in the body, which `AuthService` verifies, looks up and consumes.
   */
  @ApiOperation({
    summary: 'Rotate a refresh token into a new session',
    description:
      'Returns the same body as login, because a refresh *is* a new session: the account may have changed role in the meantime, so sending back less would leave a long-running client rendering a role it was given hours ago. **Single-use** — the response contains the replacement, so a client must *overwrite* what it stored rather than append to it, which is the one thing an integrator can get wrong here. Presenting a spent token is treated as theft: every live session of the account is revoked and the answer is `AUTH_REFRESH_TOKEN_REUSED` rather than an ordinary expiry. Public at the authentication level only — the refresh token in the body is the credential. On the strict rate-limit tier.',
  })
  @ApiOkEnvelope(AuthSessionEntity)
  @ApiPublicRouteErrors(HttpStatus.BAD_REQUEST, HttpStatus.UNAUTHORIZED)
  @Public()
  @StrictRateLimit()
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  refresh(
    @Body() dto: RefreshDto,
    @Req() request: Request,
  ): Promise<AuthSessionEntity> {
    return this.authService.refresh(
      dto.refreshToken,
      readClientContext(request),
    );
  }

  /**
   * Ends the session the presented refresh token belongs to.
   *
   * Requires **both** credentials: a valid access token, because this is an
   * action taken by a known caller, and the refresh token, because that is the
   * thing being revoked and the caller has more than one. `AuthService` checks
   * that the token belongs to the caller before revoking it, which is what stops
   * an authenticated employee ending somebody else's session.
   *
   * Answers 200 with `{ "success": true, "data": null }` rather than 204, the
   * same call `DELETE /users/:id` makes and for the same reason: a 204 carries
   * no body, and a client should read the same two fields whatever it called.
   */
  @ApiOperation({
    summary: 'End the session a refresh token belongs to',
    description:
      'Requires **both** credentials: a valid access token, because this is an action taken by a known caller, and the refresh token, because that is the thing being revoked and the caller has more than one. The service checks that the token belongs to the caller before revoking it, which is what stops an authenticated employee ending somebody else’s session. Answers `200` with `data: null` rather than `204`.',
  })
  @ApiBearerAuth(BEARER_AUTH_NAME)
  @ApiOkNullEnvelope()
  @ApiStandardErrors(HttpStatus.BAD_REQUEST)
  @Post('logout')
  @HttpCode(HttpStatus.OK)
  logout(
    @CurrentUser() user: CurrentUser,
    @Body() dto: RefreshDto,
  ): Promise<void> {
    return this.authService.logout(user, dto.refreshToken);
  }

  /**
   * The caller's own account, so a frontend can hydrate its session state
   * without decoding a token.
   *
   * It is also the cheapest way for a client to ask "is my access token still
   * good", which is why it exists as a `GET` with no parameters at all.
   */
  @ApiOperation({
    summary: 'Read the account behind the current token',
    description:
      'So a frontend can hydrate its session state without decoding a token. It is also the cheapest way to ask "is my access token still good", which is why it is a `GET` with no parameters at all.',
  })
  @ApiBearerAuth(BEARER_AUTH_NAME)
  @ApiOkEnvelope(AuthUserEntity)
  @ApiStandardErrors()
  @Get('me')
  me(@CurrentUser() user: CurrentUser): Promise<AuthUserEntity> {
    return this.authService.describeSelf(user);
  }

  // ---------------------------------------------------------------------------
  // The account lifecycle (Feature 036) — the four ways a password is set.
  // ---------------------------------------------------------------------------

  /**
   * `POST /auth/activate` — the second half of onboarding, performed by the new
   * user themselves.
   *
   * The link from their invitation email plus the password they have chosen.
   * `@Public()` because the caller has no account they can sign in to yet: the
   * token *is* the credential, and requiring an access token here would mean
   * needing a password in order to set one.
   *
   * Answers 200 with `{ "success": true, "data": null }` rather than a session.
   * Logging the person in as a side effect of activation was considered and
   * rejected: it would make this the one endpoint that mints a session without a
   * password being typed, and a link forwarded to the wrong mailbox would then
   * hand over a live session rather than a password prompt. The client sends them
   * to the login screen, where the password they have just chosen is the thing
   * that gets them in.
   */
  @ApiOperation({
    summary: 'Activate an account from an invitation link',
    description:
      'The second half of onboarding, performed by the new user themselves: the link’s token plus the password they have chosen. Public because the caller has no account they can sign in to yet — the token *is* the credential, and requiring an access token here would mean needing a password in order to set one. Answers `data: null` rather than a session: logging the person in as a side effect of activation was considered and rejected, because a link forwarded to the wrong mailbox would then hand over a live session rather than a password prompt. An unusable link — unknown, expired, already followed, or naming an account in the wrong state — is one `400 ACCOUNT_TOKEN_INVALID` for all four cases, with `purpose` in `params`. On the strict rate-limit tier.',
  })
  @ApiOkNullEnvelope()
  @ApiPublicRouteErrors(HttpStatus.BAD_REQUEST)
  @Public()
  @StrictRateLimit()
  @Post('activate')
  @HttpCode(HttpStatus.OK)
  activate(@Body() dto: ActivateAccountDto): Promise<void> {
    return this.passwords.activate(dto);
  }

  /**
   * `POST /auth/forgot-password` — asks for a reset link.
   *
   * **Always answers the same thing**, with the same status and the same
   * sentence, whether the address names an active account, a pending one, a
   * disabled one, or nobody at all. That is the no-enumeration rule and it is why
   * the response is a fixed message rather than anything derived from what
   * happened — see `PASSWORD_RESET_REQUESTED_MESSAGE`, and
   * `AccountPasswordService.forgotPassword` for the residual timing caveat.
   *
   * The message is returned as data rather than left to the client to invent, so
   * that every frontend says the same careful thing — a client that rendered
   * "check your inbox" unconditionally would be lying to whoever mistyped their
   * address.
   */
  @ApiOperation({
    summary: 'Ask for a password-reset link',
    description:
      '**Always answers the same thing** — the same status and the same sentence — whether the address names an active account, a pending one, a disabled one, or nobody at all. That is the no-enumeration rule, and it is why the response is a fixed message rather than anything derived from what happened. The message is returned as data rather than left to the client to invent, so every frontend says the same careful thing: one that rendered "check your inbox" unconditionally would be lying to whoever mistyped their address. On the strict rate-limit tier for a reason of its own — it *sends mail*, so an unlimited one is a way to have this company’s mail server deliver hundreds of messages to one colleague.',
  })
  @ApiOkEnvelope(PasswordResetRequestedEntity)
  @ApiPublicRouteErrors(HttpStatus.BAD_REQUEST)
  @Public()
  @StrictRateLimit()
  @Post('forgot-password')
  @HttpCode(HttpStatus.OK)
  async forgotPassword(
    @Body() dto: ForgotPasswordDto,
  ): Promise<PasswordResetRequestedEntity> {
    await this.passwords.forgotPassword(dto);

    return { message: PASSWORD_RESET_REQUESTED_MESSAGE };
  }

  /**
   * `POST /auth/reset-password` — sets a new password from a reset link.
   *
   * `@Public()` for the reason `activate` is: somebody who has forgotten their
   * password cannot authenticate, which is the entire situation. Every session
   * the account has is revoked, because the reason for a reset may be that
   * somebody else has the account — see `AccountPasswordService`.
   *
   * Answers 200 with a null body, and no session, for the same reason activation
   * does.
   */
  @ApiOperation({
    summary: 'Set a new password from a reset link',
    description:
      'Public for the reason activation is: somebody who has forgotten their password cannot authenticate, which is the entire situation. **Every session the account has is revoked**, because the reason for a reset may be that somebody else has the account. Answers `data: null` and no session, for the same reason activation does. An unusable link is the same single `400 ACCOUNT_TOKEN_INVALID`. On the strict rate-limit tier.',
  })
  @ApiOkNullEnvelope()
  @ApiPublicRouteErrors(HttpStatus.BAD_REQUEST)
  @Public()
  @StrictRateLimit()
  @Post('reset-password')
  @HttpCode(HttpStatus.OK)
  resetPassword(@Body() dto: ResetPasswordDto): Promise<void> {
    return this.passwords.resetPassword(dto);
  }

  /**
   * `POST /auth/change-password` — replaces a password its owner knows.
   *
   * The one password route that is **not** `@Public()`, and the one that asks for
   * the current password. Both follow from the same fact: this caller is signed
   * in, so the question is not "who are you" but "are you the person who owns
   * this session, or somebody who found it unlocked".
   *
   * The account is always the caller's own — taken from `@CurrentUser()`, never
   * from the body — so there is no route through this API by which anybody
   * changes another person's password. An optional `refreshToken` names the
   * session to keep alive; every other session of the account is revoked.
   *
   * Answers 200 with a null body. The caller's tokens are untouched when they
   * supply their refresh token, so there is nothing new to hand back.
   */
  @ApiOperation({
    summary: 'Change a password its owner knows',
    description:
      'The one password route that is **not** public, and the one that asks for the current password. Both follow from the same fact: this caller is signed in, so the question is not "who are you" but "are you the person who owns this session, or somebody who found it unlocked". The account is always the caller’s own — taken from the token, never from the body — so there is no route through this API by which anybody changes another person’s password. An optional `refreshToken` names the session to keep alive; every other session of the account is revoked. A wrong current password is `400 ACCOUNT_CURRENT_PASSWORD_INCORRECT`, which is deliberately specific: there is no enumeration to protect against here, and the honest message is what stops somebody assuming their *new* password was rejected.',
  })
  @ApiBearerAuth(BEARER_AUTH_NAME)
  @ApiOkNullEnvelope()
  @ApiStandardErrors(HttpStatus.BAD_REQUEST)
  @Post('change-password')
  @HttpCode(HttpStatus.OK)
  changePassword(
    @CurrentUser() user: CurrentUser,
    @Body() dto: ChangePasswordDto,
  ): Promise<void> {
    return this.passwords.changePassword(user, dto, dto.refreshToken);
  }
}

/**
 * What the request says about the client, for the audit columns on an issued
 * token.
 *
 * `request.ip` is Express's answer and respects `trust proxy`, which Feature 034
 * now configures from `TRUST_PROXY` — so behind a correctly configured reverse
 * proxy this records the real client rather than the proxy, and with no proxy it
 * records the socket. `x-forwarded-for` is still not read here, and that has not
 * changed: an application that trusts that header without being configured to
 * sit behind a proxy is one where any caller can write their own address into
 * the audit trail, which is worse than an honest proxy address. The difference
 * is that the decision is now a deployment's to make rather than one this file
 * takes on its behalf.
 */
function readClientContext(request: Request): ClientContext {
  const userAgent = request.headers['user-agent'];

  return {
    userAgent: typeof userAgent === 'string' ? userAgent : undefined,
    ipAddress: request.ip,
  };
}
