import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  Res,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Request, Response } from 'express';

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
import { ResetPasswordDto } from './dto/reset-password.dto';
import {
  AuthSessionEntity,
  IssuedSession,
} from './entities/auth-session.entity';
import { AuthUserEntity } from './entities/authenticated-user.entity';
import { PasswordResetRequestedEntity } from './entities/password-reset-request.entity';
import { RefreshTokenCookie } from './refresh-token.cookie';

/**
 * The `Set-Cookie` login and refresh answer with, as documentation.
 *
 * Written out rather than left to the reader, because the cookie is invisible in
 * every other way: it is not in the schema, `Try it out` cannot show it, and a
 * consumer reading the response body alone would conclude the refresh token had
 * simply been removed from this API. The attributes shown are the defaults; a
 * deployment's real values come from `AUTH_REFRESH_COOKIE_*`.
 *
 * Declared **above** the class rather than beside the other helpers at the foot
 * of this file, because a decorator argument is evaluated when the class is
 * defined — a `const` below it would still be in its temporal dead zone, and the
 * module would fail to load.
 */
const SET_REFRESH_COOKIE_HEADER = {
  'Set-Cookie': {
    description:
      'The refresh token, as an `HttpOnly` cookie — e.g. `refresh_token=<jws>; Max-Age=604800; Path=/api/v1/auth; HttpOnly; Secure; SameSite=Lax`. It is not readable from JavaScript and is not in the response body. `Max-Age` matches the token’s own lifetime, `Path` scopes it to the auth routes so it rides on nothing else, and `Secure` is set outside development. Name, path, `Secure` and `SameSite` are configurable per deployment.',
    schema: { type: 'string' },
  },
};

/** The same header, emptied — what a logout sends. */
const CLEAR_REFRESH_COOKIE_HEADER = {
  'Set-Cookie': {
    description:
      'Clears the refresh cookie — the same name, path and attributes with an expiry in the past. Sent whether or not the request carried one.',
    schema: { type: 'string' },
  },
};

/**
 * `/api/v1/auth` — the prefix and the version come from `configureApp`, so only
 * the resource segment is declared here.
 *
 * Thin, like every other controller in this project: validation is the DTOs'
 * job, the success envelope is the global interceptor's, error rendering is the
 * global filter's, and every rule about credentials, rotation and revocation is
 * `AuthService`'s. What this class does that others do not is handle the
 * *transport* — and as of Feature 040 there are two pieces of it:
 *
 * - the raw request, for the `User-Agent` and the address stored beside an
 *   issued token, extracted by `readClientContext` and handed to the service as
 *   a plain object;
 * - the **refresh cookie**, written on login and refresh, read on refresh,
 *   logout and change-password, and cleared on logout and on a refusal. Every
 *   attribute of it belongs to `RefreshTokenCookie`; this class only says at
 *   which moments it is written and read.
 *
 * Both are properties of the HTTP message rather than of the session, which is
 * why they are here and not in the service — `AuthService.refresh` still takes a
 * string and hands one back, and did not change when the string stopped
 * travelling in the body.
 *
 * **`@Res({ passthrough: true })`** on the three routes that touch the cookie.
 * The passthrough is load-bearing: without it Nest steps back and the handler
 * owns the response, which would mean the `ResponseInterceptor` envelope and the
 * `@HttpCode(200)` on these routes both quietly stop applying — the body would
 * become whatever the handler wrote and a `POST` would answer `201` again. With
 * it, the response object is available for `res.cookie` and Nest still
 * serialises the returned value through the whole pipeline, so the envelope
 * these routes answer with is byte-for-byte the one they answered with before.
 *
 * **Five of the eight routes are `@Public()`** as of Feature 036, and none of
 * them is unprotected — each is protected by a *different* credential from an
 * access token, which is what `@Public()` actually means:
 *
 * | Route | What authenticates it |
 * | --- | --- |
 * | `login` | the email and password in the body |
 * | `refresh` | the refresh token in the `HttpOnly` cookie |
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
    private readonly refreshCookie: RefreshTokenCookie,
  ) {}

  /**
   * Answers 200 rather than the 201 Nest gives a `@Post` by default.
   *
   * Nothing was created that the client can address. A session is not a resource
   * here — there is no `/auth/sessions/:id` to put in a `Location` header — and
   * `201` would promise one.
   *
   * The refresh token is **not** in the body it returns. It is written to the
   * response as an `HttpOnly` cookie, so the client never holds it and cannot
   * accidentally store it somewhere a script can read — see `RefreshTokenCookie`
   * for what that buys and what it does not.
   */
  @ApiOperation({
    summary: 'Sign in',
    description:
      'Returns an access token and the account behind it, and sets the **refresh token as an `HttpOnly` cookie** on the response — it is deliberately not in the body, so no script on the page can read it. Present the access token as `Authorization: Bearer <accessToken>` and keep it in memory only; the browser handles the cookie by itself. A browser client must call this with `credentials: "include"` (`withCredentials: true`) or the cookie is neither stored nor sent back. **No padlock, and the route is not unprotected** — it is protected by the password in the body, and the endpoint that *issues* a token cannot require one. Answers `200` rather than `201`: a session is not a resource here, there is no `/auth/sessions/:id` to put in a `Location` header, and `201` would promise one. A wrong address, a wrong password and a deactivated account all answer `401 AUTH_INVALID_CREDENTIALS` with the same message and equalised timing — splitting them would confirm that an address exists, which in a company’s internal system also answers "does this person work here". On the strict rate-limit tier.',
  })
  @ApiOkEnvelope(AuthSessionEntity, { headers: SET_REFRESH_COOKIE_HEADER })
  @ApiPublicRouteErrors(HttpStatus.BAD_REQUEST, HttpStatus.UNAUTHORIZED)
  @Public()
  @StrictRateLimit()
  @Post('login')
  @HttpCode(HttpStatus.OK)
  async login(
    @Body() dto: LoginDto,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<AuthSessionEntity> {
    return this.issue(
      response,
      await this.authService.login(dto, readClientContext(request)),
    );
  }

  /**
   * Rotates a refresh token into a new session.
   *
   * `@Public()` at the authentication level only: the endpoint is not
   * unprotected, it is protected by a *different* credential — the refresh token
   * in the cookie, which `AuthService` verifies, looks up and consumes.
   *
   * **The request has no body at all** as of Feature 040, which is the visible
   * half of the transport change: a client calls this with no arguments, and the
   * browser supplies the credential. The successor is written back as a new
   * cookie, so "overwrite what you stored rather than append to it" — the one
   * thing an integrator used to get wrong here — is now something a client
   * cannot get wrong, because it never holds the value.
   *
   * The failure path clears the cookie when, and only when, the token in it is
   * finished; {@link RefreshTokenCookie.clearIfRefused} says which failures those
   * are and why a `429` is not one of them.
   */
  @ApiOperation({
    summary: 'Rotate the refresh cookie into a new session',
    description:
      'Reads the refresh token from the **`HttpOnly` cookie** set at login — the request takes no body — and answers with a new access token and a new refresh cookie. The body is the same as login’s, because a refresh *is* a new session: the account may have changed role in the meantime, so sending back less would leave a long-running client rendering a role it was given hours ago. **Single-use.** Presenting a spent token is treated as theft: every live session of the account is revoked, the answer is `AUTH_REFRESH_TOKEN_REUSED` rather than an ordinary expiry, and the cookie is cleared. A request carrying no cookie, or one whose value is not plausibly a token, answers the same `401 AUTH_REFRESH_TOKEN_INVALID` an unusable token does — a browser with no cookie sends no header, so there is nothing for a missing-field `400` to describe. Public at the authentication level only — the cookie is the credential. On the strict rate-limit tier.',
  })
  @ApiOkEnvelope(AuthSessionEntity, { headers: SET_REFRESH_COOKIE_HEADER })
  @ApiPublicRouteErrors(HttpStatus.UNAUTHORIZED)
  @Public()
  @StrictRateLimit()
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  async refresh(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<AuthSessionEntity> {
    const presented = this.refreshCookie.require(request);

    try {
      return this.issue(
        response,
        await this.authService.refresh(presented, readClientContext(request)),
      );
    } catch (error) {
      this.refreshCookie.clearIfRefused(response, error);

      throw error;
    }
  }

  /**
   * Ends the session the refresh cookie belongs to.
   *
   * Requires **both** credentials: a valid access token, because this is an
   * action taken by a known caller, and the refresh token, because that is the
   * thing being revoked and the caller has more than one. `AuthService` checks
   * that the token belongs to the caller before revoking it, which is what stops
   * an authenticated employee ending somebody else's session.
   *
   * The cookie is cleared **whether or not one was presented**, and that is the
   * one behavioural difference Feature 040 introduces here: a logout that named
   * no session used to be a `400` from the `ValidationPipe`, and there is no
   * cookie equivalent of a missing field — a browser that has none sends no
   * header. Answering `400` would have meant a client whose cookie had already
   * expired could not perform a clean sign-out, which is precisely the moment it
   * wants to. It costs nothing, because this route has always been idempotent
   * and silent about what it found: a token that does not exist, belongs to
   * somebody else, or was revoked an hour ago already all produced this same
   * `200`.
   *
   * Answers 200 with `{ "success": true, "data": null }` rather than 204, the
   * same call `DELETE /users/:id` makes and for the same reason: a 204 carries
   * no body, and a client should read the same two fields whatever it called.
   */
  @ApiOperation({
    summary: 'End the session the refresh cookie belongs to',
    description:
      'Requires **both** credentials: a valid access token, because this is an action taken by a known caller, and the refresh token — now read from the `HttpOnly` cookie — because that is the thing being revoked and the caller has more than one. The request takes no body. The service checks that the token belongs to the caller before revoking it, which is what stops an authenticated employee ending somebody else’s session. The cookie is cleared on the response whether or not one was presented, so a client whose cookie has already expired can still sign out cleanly; the route has always been idempotent and silent about what it found. Answers `200` with `data: null` rather than `204`. The access token is untouched and stays valid until it expires — a client discards it.',
  })
  @ApiBearerAuth(BEARER_AUTH_NAME)
  @ApiOkNullEnvelope({ headers: CLEAR_REFRESH_COOKIE_HEADER })
  @ApiStandardErrors()
  @Post('logout')
  @HttpCode(HttpStatus.OK)
  async logout(
    @CurrentUser() user: CurrentUser,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<void> {
    const presented = this.refreshCookie.read(request);

    if (presented !== undefined) {
      await this.authService.logout(user, presented);
    }

    this.refreshCookie.clear(response);
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
   * changes another person's password. Every other session of the account is
   * revoked; the session doing the changing is spared.
   *
   * **Which session that is now comes from the cookie**, where before Feature
   * 040 it came from an optional `refreshToken` in the body. The behaviour is
   * identical and the reasoning is better: the session to keep is by definition
   * the one making the request, so reading it from the credential the request
   * already carries is one fewer thing a client can get wrong — and a client
   * could no longer supply it in a body even if the field were still there,
   * because it does not hold the value any more.
   *
   * Answers 200 with a null body. The caller's tokens are untouched, so there is
   * nothing new to hand back and no cookie to rewrite.
   */
  @ApiOperation({
    summary: 'Change a password its owner knows',
    description:
      'The one password route that is **not** public, and the one that asks for the current password. Both follow from the same fact: this caller is signed in, so the question is not "who are you" but "are you the person who owns this session, or somebody who found it unlocked". The account is always the caller’s own — taken from the token, never from the body — so there is no route through this API by which anybody changes another person’s password. **Every other session of the account is revoked and the current one is kept**, identified by the `HttpOnly` refresh cookie the request carries; the `refreshToken` body field this used to take was removed in Feature 040, because a client no longer holds the value. A request arriving without the cookie revokes every session including its own, which is the safe direction to be wrong in — the cost is one extra sign-in. A wrong current password is `401 ACCOUNT_CURRENT_PASSWORD_INCORRECT`, which is deliberately specific: there is no enumeration to protect against here, and the honest message is what stops somebody assuming their *new* password was rejected.',
  })
  @ApiBearerAuth(BEARER_AUTH_NAME)
  @ApiOkNullEnvelope()
  @ApiStandardErrors(HttpStatus.BAD_REQUEST)
  @Post('change-password')
  @HttpCode(HttpStatus.OK)
  changePassword(
    @CurrentUser() user: CurrentUser,
    @Body() dto: ChangePasswordDto,
    @Req() request: Request,
  ): Promise<void> {
    return this.passwords.changePassword(
      user,
      dto,
      this.refreshCookie.read(request),
    );
  }

  /**
   * Writes the refresh cookie and returns the body — the last step of both
   * login and refresh.
   *
   * One method, so the two cannot drift about which value goes in the cookie and
   * which in the body. `IssuedSession` is what makes that hard to get wrong: the
   * token and the entity are separate fields, and the entity has nowhere to put
   * a token even if somebody tried.
   */
  private issue(response: Response, issued: IssuedSession): AuthSessionEntity {
    this.refreshCookie.set(
      response,
      issued.refreshToken,
      issued.refreshTokenExpiresAt,
    );

    return issued.session;
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
