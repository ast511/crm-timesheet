import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Req,
} from '@nestjs/common';
import { Request } from 'express';

import { CurrentUser } from '../../common/decorators/current-user.decorator';
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
  @Public()
  @StrictRateLimit()
  @Post('forgot-password')
  @HttpCode(HttpStatus.OK)
  async forgotPassword(
    @Body() dto: ForgotPasswordDto,
  ): Promise<{ message: string }> {
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
