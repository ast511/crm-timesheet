import { BEARER_SCHEME } from '../auth.constants';
import { AuthUserEntity } from './authenticated-user.entity';

/**
 * A session, as the client receives it — the answer to both `POST /auth/login`
 * and `POST /auth/refresh`.
 *
 * The two return the same body on purpose. A refresh *is* a new session: it
 * issues a new access token and a new refresh token, and the account behind them
 * may have changed role in the meantime, so sending back less than a login does
 * would leave a long-running client rendering a role it was given hours ago.
 * One shape also means the frontend has one function that stores a session
 * rather than two that must agree.
 *
 * **The refresh token is no longer here** — as of Feature 040 it travels as an
 * `HttpOnly` cookie, which is the whole of that feature. Feature 032 put both
 * tokens in the body and argued the trade-off on this class; the argument it
 * made was about the *access* token, which a token-bearing WebSocket needs to be
 * able to read and which therefore stays exactly where it was. The refresh token
 * had no such requirement: nothing but `POST /auth/refresh` ever presents it, so
 * nothing is lost by putting it somewhere JavaScript cannot look. See
 * `refresh-token.cookie.ts`.
 *
 * A client therefore stores **nothing durable**. The access token lives in
 * memory for as long as the tab does, the refresh token lives in the browser's
 * cookie jar where the page cannot reach it, and a reload is a call to
 * `POST /auth/refresh` with no argument.
 *
 * Nothing derived is included. There is no `user.permissions`, no menu, and no
 * expiry for the refresh token — a client no longer holds it, cannot count down
 * to its expiry and does not need to: it calls refresh and is either given a
 * session or told to sign in.
 */
export class AuthSessionEntity {
  /** Present as `Authorization: Bearer <accessToken>` on every other request. */
  accessToken!: string;

  /** Always `Bearer`, so a client can build the header without knowing the scheme. */
  tokenType!: typeof BEARER_SCHEME;

  /**
   * Seconds until `accessToken` expires — the standard OAuth 2 field, and the
   * only number a client needs to schedule its own refresh.
   *
   * Relative rather than an absolute instant, deliberately: it is immune to a
   * client whose clock is wrong, which is common enough that the format exists
   * for it. Everything else in this API sends absolute ISO-8601 timestamps
   * because they describe *when something happened*; this describes how long
   * something has left.
   */
  expiresIn!: number;

  /** Who the session belongs to, so a client need not decode the token. */
  user!: AuthUserEntity;
}

/**
 * A session as the *application* holds it: the body above, plus the refresh
 * token and the instant it dies.
 *
 * The two extra fields never reach a client as JSON. They are what
 * `AuthController` needs in order to write the cookie — the value, and the
 * expiry the cookie's `Max-Age` is derived from — and they are returned beside
 * the entity rather than on it precisely so that they cannot be serialised by
 * accident: `AuthSessionEntity` is what the interceptor wraps, and it has no
 * field for a refresh token to hide in.
 */
export interface IssuedSession {
  /** The body of the response. */
  readonly session: AuthSessionEntity;
  /** The raw refresh token, bound for the cookie and nowhere else. */
  readonly refreshToken: string;
  /** When that token stops being valid — the cookie's lifetime. */
  readonly refreshTokenExpiresAt: Date;
}

/** Assembles the response. One place, so login and refresh cannot drift. */
export function toAuthSessionEntity(
  accessToken: string,
  expiresIn: number,
  user: AuthUserEntity,
): AuthSessionEntity {
  return {
    accessToken,
    tokenType: BEARER_SCHEME,
    expiresIn,
    user,
  };
}
