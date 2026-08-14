import {
  HttpException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { CookieOptions, Request, Response } from 'express';

import { ERROR_CODES } from '../../common/constants/error-codes.constants';
import { codedError, readCodedError } from '../../common/errors/coded-error';
import {
  INVALID_REFRESH_TOKEN_MESSAGE,
  REFRESH_TOKEN_MAX_LENGTH,
  REFRESH_TOKEN_MIN_LENGTH,
} from './auth.constants';
import {
  loadRefreshCookieConfig,
  RefreshCookieConfig,
} from './refresh-cookie.config';

/**
 * The refresh token's transport: an `HttpOnly` cookie, written, read and
 * cleared in one place.
 *
 * ## What this class is for
 *
 * Until Feature 040 the refresh token travelled in the JSON body — issued in the
 * response to a login, sent back in the body of a refresh — which meant the
 * client had to *store* it, and everything a browser can store, JavaScript can
 * read. One injected script and the long-lived half of a session is gone; the
 * short-lived access token would be gone with it, but that one expires in
 * minutes while a refresh token is good for a week and rotates itself forward
 * indefinitely.
 *
 * `HttpOnly` is the attribute that closes it. The browser holds the cookie and
 * attaches it to the requests this configuration allows; `document.cookie` does
 * not show it and `fetch` cannot read it back out of a response. An injected
 * script on this origin can still *use* the session — it can call `refresh` and
 * be handed a new access token, because the browser will attach the cookie for
 * it — but it cannot copy the credential out to somewhere the person cannot
 * reach. That is the whole and honest size of the win, and it is worth having:
 * it turns permanent, silent, offline account takeover into a foothold that ends
 * when the tab does.
 *
 * **Nothing else about a session changed.** The access token is still a
 * short-lived JWS in `Authorization: Bearer`, held in memory by the client and
 * never written here. Rotation, reuse detection, revocation and expiry are
 * exactly what `AuthService` has always done — this class moves one string from
 * one part of the HTTP message to another and takes no decision about it.
 *
 * ## Why the validation moved in here
 *
 * The bounds and the trim used to be `RefreshDto`'s, applied by the global
 * `ValidationPipe`. **A pipe never sees a cookie** — validation runs on the body,
 * the query and the params — so those checks would simply have disappeared with
 * the DTO, and `POST /auth/refresh` is public: whatever arrives in this header is
 * an anonymous caller's, and it reaches a SHA-256 and a JWT parse. So
 * {@link read} keeps both, and answers `undefined` for anything that is not
 * plausibly a token, which the routes then treat as no cookie at all.
 */
@Injectable()
export class RefreshTokenCookie {
  private readonly config: RefreshCookieConfig;

  constructor(configService: ConfigService) {
    // Read once at construction, for the reason `TokenService` reads its own
    // configuration once: the environment does not change while the process
    // runs, and a bad value should be found at startup rather than on somebody's
    // first login of the morning.
    this.config = loadRefreshCookieConfig(configService);
  }

  /**
   * Writes the refresh token to the response as an `HttpOnly` cookie.
   *
   * `expiresAt` is the instant `TokenService` signed into the token itself, and
   * it is passed in rather than read from configuration so that the cookie and
   * the credential inside it cannot disagree about when the session ends. A
   * `JWT_REFRESH_TTL` read twice is two answers waiting to drift; read once, the
   * browser forgets the cookie at the moment the server would have refused it.
   *
   * It is expressed as `Max-Age` — which is what Express derives from `maxAge` —
   * rather than as an absolute `Expires`, because `Max-Age` is measured from the
   * moment the browser receives the response and is therefore immune to a client
   * whose clock is wrong. The same argument `AuthSessionEntity.expiresIn` makes
   * for the access token, one layer down.
   *
   * A token that has somehow already expired yields a zero lifetime rather than
   * a negative one, which a browser reads as "delete this cookie" — the safe
   * direction, and the only one that is not undefined behaviour.
   */
  set(response: Response, token: string, expiresAt: Date): void {
    response.cookie(this.config.name, token, {
      ...this.attributes(),
      maxAge: Math.max(0, expiresAt.getTime() - Date.now()),
    });
  }

  /**
   * Removes the cookie from the browser.
   *
   * The attributes have to match the ones it was set with — a cookie is
   * identified by name **and** path, so clearing at `/` would leave a cookie
   * scoped to `/api/v1/auth` sitting exactly where it was while the response
   * claimed to have removed it. `clearCookie` supplies the expiry itself.
   */
  clear(response: Response): void {
    response.clearCookie(this.config.name, this.attributes());
  }

  /**
   * Clears the cookie when the failure means the token in it is finished.
   *
   * Called from the refresh route's failure path, for the two codes that say the
   * credential is spent — a token presented twice, which has just revoked every
   * session the account had, and one that is expired, revoked or unknown. In
   * both cases the browser is holding something that will never work again, and
   * leaving it there means every subsequent request carries a dead credential
   * until it ages out days later.
   *
   * Deliberately **not** "clear on any error". A `429` from the rate limiter or
   * a `500` from a database blip says nothing about the token, and signing
   * somebody out because their refresh happened to land during an incident is
   * the sort of helpfulness that turns a blip into a support ticket.
   */
  clearIfRefused(response: Response, error: unknown): void {
    if (!(error instanceof HttpException)) {
      return;
    }

    const { errorCode } = readCodedError(error);

    if (
      errorCode === ERROR_CODES.AUTH_REFRESH_TOKEN_REUSED ||
      errorCode === ERROR_CODES.AUTH_REFRESH_TOKEN_INVALID
    ) {
      this.clear(response);
    }
  }

  /**
   * The refresh token the request carries, or `undefined`.
   *
   * `request.cookies` is `cookie-parser`'s, registered in `configureApp`. It is
   * read defensively rather than trusted to exist: a spec that boots a bare
   * application without the middleware would otherwise fail with a
   * `TypeError` from inside a handler instead of behaving like a request that
   * carried no cookie.
   *
   * Trimmed, and bounded, for the reasons `RefreshDto` gave — a copy-paste
   * artefact is not part of the credential, and the SHA-256 lookup is only
   * deterministic on the exact string — with one addition the DTO did not need:
   * a cookie is *whatever the client sent*, under a name anybody can write, so a
   * value of the wrong shape is far likelier here than in a body a form built.
   */
  read(request: Request): string | undefined {
    const cookies: unknown = request.cookies;

    if (typeof cookies !== 'object' || cookies === null) {
      return undefined;
    }

    const value = (cookies as Record<string, unknown>)[this.config.name];

    if (typeof value !== 'string') {
      return undefined;
    }

    const token = value.trim();

    return token.length >= REFRESH_TOKEN_MIN_LENGTH &&
      token.length <= REFRESH_TOKEN_MAX_LENGTH
      ? token
      : undefined;
  }

  /**
   * The refresh token the request carries, or the `401` a missing one has always
   * produced.
   *
   * **The existing code, not a new one.** Before Feature 040 a refresh with no
   * token in the body was a `400` from the `ValidationPipe` and one with an
   * unusable token was `401 AUTH_REFRESH_TOKEN_INVALID`; there is no cookie
   * equivalent of the first, because a browser that has no cookie sends no
   * header rather than sending an empty one. Both now answer the second, which
   * is the answer a client already handles — a session that cannot be refreshed,
   * whatever the reason, and the same message every other rejected refresh
   * carries.
   */
  require(request: Request): string {
    const token = this.read(request);

    if (token === undefined) {
      throw new UnauthorizedException(
        codedError(
          ERROR_CODES.AUTH_REFRESH_TOKEN_INVALID,
          INVALID_REFRESH_TOKEN_MESSAGE,
        ),
      );
    }

    return token;
  }

  /**
   * The attributes every write and every clear share.
   *
   * One object, because a cookie is identified by name, path and domain: a
   * `clear` that disagreed with the `set` about any of them would remove nothing
   * and report success. `httpOnly` is not configurable and is the point of the
   * feature; the other three are the deployment's, and are argued in
   * `refresh-cookie.config.ts`.
   */
  private attributes(): CookieOptions {
    return {
      httpOnly: true,
      secure: this.config.secure,
      sameSite: this.config.sameSite,
      path: this.config.path,
    };
  }
}
