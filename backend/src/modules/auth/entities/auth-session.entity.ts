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
 * **Both tokens are in the body rather than in cookies**, and that is the
 * feature's most visible trade-off. See the module documentation in
 * `auth.module.ts` for the argument in full; the short version is that this is
 * an API-first backend with a token-bearing WebSocket beside it, and a cookie
 * that the socket cannot use would mean shipping both mechanisms.
 *
 * Nothing derived is included. There is no `user.permissions`, no menu, no
 * expiry for the *refresh* token in seconds — a client stores the refresh token
 * and presents it until it is refused, and a countdown it would have to keep in
 * step with the server is a second source for one fact.
 */
export class AuthSessionEntity {
  /** Present as `Authorization: Bearer <accessToken>` on every other request. */
  accessToken!: string;

  /**
   * Presented to `POST /auth/refresh`, once.
   *
   * Rotation makes this single-use: the response to a refresh contains its
   * replacement, and presenting this one again is treated as theft. A client
   * therefore has to *overwrite* what it stored, not append to it — the one
   * thing an integrator can get wrong here, and the reason it is said out loud.
   */
  refreshToken!: string;

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

/** Assembles the response. One place, so login and refresh cannot drift. */
export function toAuthSessionEntity(
  accessToken: string,
  refreshToken: string,
  expiresIn: number,
  user: AuthUserEntity,
): AuthSessionEntity {
  return {
    accessToken,
    refreshToken,
    tokenType: BEARER_SCHEME,
    expiresIn,
    user,
  };
}
