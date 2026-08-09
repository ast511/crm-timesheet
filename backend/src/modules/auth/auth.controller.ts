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
import { AuthService, ClientContext } from './auth.service';
import { Public } from './decorators/public.decorator';
import { LoginDto } from './dto/login.dto';
import { RefreshDto } from './dto/refresh.dto';
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
 * Two of the four routes are `@Public()`, and the reasoning is on that
 * decorator: the endpoint that issues a token cannot require one, and refresh
 * authenticates with the credential in its body precisely because the access
 * token has expired.
 */
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

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
