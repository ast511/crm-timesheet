import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Request } from 'express';

import { ERROR_CODES } from '../../common/constants/error-codes.constants';
import { AuthenticatedRequest } from '../../common/decorators/current-user.decorator';
import { codedError } from '../../common/errors/coded-error';
import {
  AUTHORIZATION_HEADER,
  BEARER_SCHEME,
  INVALID_ACCESS_TOKEN_MESSAGE,
} from './auth.constants';
import { AuthService } from './auth.service';
import { IS_PUBLIC_KEY } from './decorators/public.decorator';

/** What a request without a usable `Authorization` header is told. */
export const MISSING_ACCESS_TOKEN_MESSAGE = `An access token is required: send it as "${AUTHORIZATION_HEADER}: ${BEARER_SCHEME} <token>"`;

/**
 * The guard that turns an access token into `request.user`.
 *
 * Registered as an `APP_GUARD` in `app.module.ts`, which makes authentication
 * the default for every route in the application rather than something each
 * controller opts into. `@Public()` is the exemption, and the reasoning for
 * choosing an allowlist over a denylist is recorded there.
 *
 * **No Passport.** Nest's usual answer here is `@nestjs/passport` with
 * `passport-jwt`, which is four packages, a strategy class, a second guard that
 * extends `AuthGuard('jwt')`, and a `validate()` hook whose return value
 * silently becomes `request.user`. What all of that buys is the ability to swap
 * in one of Passport's several hundred other strategies — and this application
 * has one credential, issued by itself, with no OAuth, no SSO and no plan for
 * either (Feature 032 rules all three out explicitly). The two things Passport
 * would actually do for us are "parse the `Authorization` header" and "assign
 * `request.user`", and both are visible below in fewer lines than the wiring
 * would take. The same call the project made in choosing `bcryptjs` over a
 * native binding, and in reaching for `nodemailer` directly rather than a mail
 * abstraction: one dependency, `@nestjs/jwt`, for the part that is genuinely
 * hard — signing and verifying — and nothing for the part that is not.
 *
 * The guard itself does no verification. It finds the token, hands it to
 * `AuthService.authenticate` and stores the answer; deciding what a token means
 * is that service's job, and keeping it there is what lets the WebSocket
 * handshake authenticate through the same method rather than through a second
 * implementation that would eventually disagree.
 */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly authService: AuthService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    if (this.isPublic(context)) {
      return true;
    }

    // A global guard is applied to WebSocket message handlers too, and there is
    // no HTTP request under one — `switchToHttp().getRequest()` would return the
    // socket and the header read below would find nothing, refusing every
    // message on a connection that was authenticated perfectly well. The real-
    // time side authenticates **once, at the handshake**, in
    // `NotificationGateway.handleConnection`, and a message from a socket that
    // never registered is already refused there with an acknowledgement the
    // client can read. So this is not a hole: it is authentication happening at
    // the point where a persistent connection actually has a credential to
    // present.
    if (context.getType() !== 'http') {
      return true;
    }

    const request = context.switchToHttp().getRequest<Request>();

    (request as unknown as AuthenticatedRequest).user =
      await this.authService.authenticate(readAccessToken(request));

    return true;
  }

  /**
   * Whether the route waived authentication.
   *
   * Handler before class, which is `getAllAndOverride`'s order and the one that
   * reads correctly: a `@Public()` controller is public throughout, and a
   * `@Public()` method makes one route of a protected controller public.
   */
  private isPublic(context: ExecutionContext): boolean {
    return (
      this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
        context.getHandler(),
        context.getClass(),
      ]) === true
    );
  }
}

/**
 * The token out of `Authorization: Bearer <token>`.
 *
 * Exported so the WebSocket handshake can read a header the same way, and so the
 * parsing rules are stated once.
 *
 * The scheme is matched case-insensitively — RFC 7235 makes it a case-
 * insensitive token, and clients disagree — but the header must have exactly two
 * parts. A header sent twice arrives as an array, and one identity was asked
 * for: two answers are a malformed request rather than a value to pick from, and
 * taking the first would let a caller smuggle a second credential past anything
 * that logged only one. The same rule the header-based placeholder applied, kept
 * because it was right for the same reason.
 *
 * A missing header is a `401` naming what to send, not a generic refusal. Unlike
 * a *rejected* token — where the difference between "expired" and "forged" is
 * something a client does not need and an attacker would like — "you sent no
 * credential at all" tells nobody anything they did not already know, and it is
 * the difference between an integrator finding the problem in a minute and
 * finding it in an afternoon.
 */
export function readAccessToken(request: {
  headers: Record<string, string | string[] | undefined>;
}): string {
  const header = request.headers[AUTHORIZATION_HEADER];

  // One code for every shape of "you are not authenticated", including the two
  // messages below. The messages differ because an integrator debugging a
  // missing header wants to be told which header; the *code* does not, because
  // a client's response to all of them is identical — try a refresh, then go to
  // the login screen.
  if (typeof header !== 'string') {
    throw new UnauthorizedException(
      codedError(
        ERROR_CODES.AUTH_UNAUTHENTICATED,
        MISSING_ACCESS_TOKEN_MESSAGE,
      ),
    );
  }

  const [scheme, token, ...rest] = header.trim().split(/\s+/);

  if (
    rest.length > 0 ||
    scheme?.toLowerCase() !== BEARER_SCHEME.toLowerCase() ||
    token === undefined ||
    token.length === 0
  ) {
    throw new UnauthorizedException(
      codedError(
        ERROR_CODES.AUTH_UNAUTHENTICATED,
        token === undefined
          ? MISSING_ACCESS_TOKEN_MESSAGE
          : INVALID_ACCESS_TOKEN_MESSAGE,
      ),
    );
  }

  return token;
}
