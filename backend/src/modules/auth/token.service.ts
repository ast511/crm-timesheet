import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { createHash, randomUUID } from 'crypto';

import {
  ERROR_CODES,
  ErrorCode,
} from '../../common/constants/error-codes.constants';
import { codedError } from '../../common/errors/coded-error';
import {
  ACCESS_TOKEN_TYPE,
  INVALID_ACCESS_TOKEN_MESSAGE,
  INVALID_REFRESH_TOKEN_MESSAGE,
  REFRESH_TOKEN_TYPE,
} from './auth.constants';
import { JwtConfig, loadJwtConfig } from './auth.config';

/** What a signed token carries, and the whole of it. */
interface TokenClaims {
  /** The account. `sub` is the registered claim for it — RFC 7519 §4.1.2. */
  sub: string;
  /** {@link ACCESS_TOKEN_TYPE} or {@link REFRESH_TOKEN_TYPE}. */
  typ: string;
  /** Unique per token, on refresh tokens only. See {@link issueRefreshToken}. */
  jti?: string;
}

/** A refresh token, with the two facts the caller has to store beside it. */
export interface IssuedRefreshToken {
  /** The value handed to the client. Held nowhere on this side. */
  token: string;
  /** SHA-256 of {@link token}, hex — what goes into `refresh_tokens`. */
  tokenHash: string;
  expiresAt: Date;
}

/**
 * Everything cryptographic about a session: signing, verifying and hashing.
 *
 * Separated from `AuthService` because the two answer different kinds of
 * question. This one knows nothing about accounts, passwords, rotation or
 * revocation — it turns a user id into a token and a token back into a user id,
 * and it is the only class in the application that touches a signing key. That
 * boundary is what lets the whole token format change (a different algorithm,
 * asymmetric keys so a second service can verify without being able to sign)
 * without `AuthService` noticing.
 *
 * **The two kinds of token are deliberately different objects**, and the
 * difference is not decoration:
 *
 * - An **access token** is a claim, and it is the whole answer. It is verified
 *   from its signature alone, no row is read, and that is why it must be short
 *   lived — see `RefreshToken` in `schema.prisma`.
 * - A **refresh token** is a *pointer to a row*. It is signed too, but the
 *   signature is only the cheap first gate: a garbage string is rejected without
 *   a query, and the real decision — has this been used, revoked, or has it
 *   expired — is the database's. A signature that verified and a row that says
 *   "spent" is not a valid refresh; it is the reuse detection firing.
 *
 * The stored form is a SHA-256 of the token rather than the token. Why a fast
 * digest is right here and bcrypt is right for a password is argued in the
 * schema, on `refresh_tokens.token_hash`: the input is 200-odd characters of
 * signed, unguessable material, so there is nothing for a slow hash to defend
 * against, and a deterministic digest is what makes the lookup a single indexed
 * read instead of a bcrypt comparison against every live session.
 */
@Injectable()
export class TokenService {
  private readonly config: JwtConfig;

  constructor(
    private readonly jwtService: JwtService,
    configService: ConfigService,
  ) {
    // Read once, at construction, rather than per call. The environment does not
    // change while the process runs, and `loadJwtConfig` throwing here fails the
    // application's startup — which is where a bad signing configuration should
    // be found, not on the first login attempt of the morning.
    this.config = loadJwtConfig(configService);
  }

  /** Seconds an access token lasts — the `expiresIn` a client is told. */
  get accessTtlSeconds(): number {
    return this.config.accessTtlSeconds;
  }

  /**
   * Signs an access token for an account.
   *
   * The payload is two claims and nothing else. No role, no employee id, no
   * permissions — deliberately, and this is the feature's central trade-off:
   *
   * - **A role claim would be free to read and wrong to trust.** It is a copy of
   *   `users.role` taken at login, so an account demoted from ADMIN to USER
   *   would keep administering the system until its token expired, and an account
   *   deactivated in an emergency would keep working for the same window. The
   *   whole point of a short access-token lifetime is to bound the damage of
   *   something the token cannot know about; putting authority *into* the token
   *   widens exactly that window.
   * - **A lookup costs one indexed primary-key read per request**, against a
   *   connection pool that is already open, on a database this application talks
   *   to for every route that does anything. It is the cheapest query in the
   *   request.
   *
   * So the token says who, and `AuthService.authenticate` asks the database what
   * they may currently be. The residual window — an access token stays valid for
   * up to `JWT_ACCESS_TTL` after the *token* itself should have died, which is
   * to say after a logout — is what `refresh_tokens` closes on the other side.
   */
  async issueAccessToken(userId: string): Promise<string> {
    return this.sign(
      { sub: userId, typ: ACCESS_TOKEN_TYPE },
      this.config.accessSecret,
      this.config.accessTtlSeconds,
    );
  }

  /**
   * Signs a refresh token, and returns what the caller must store beside it.
   *
   * `jti` is a random UUID and it is load-bearing rather than ceremonial: without
   * it, two tokens signed for one account in the same second would be byte-for-
   * byte identical — same payload, same `iat`, same `exp` — and so would their
   * hashes, which `refresh_tokens.token_hash` requires to be unique. Two logins
   * in one second is not a hypothetical; it is what a test suite does.
   *
   * `expiresAt` is computed here from the same lifetime the token is signed with,
   * so the row and the signature cannot disagree about when it dies.
   */
  async issueRefreshToken(userId: string): Promise<IssuedRefreshToken> {
    const token = await this.sign(
      { sub: userId, typ: REFRESH_TOKEN_TYPE, jti: randomUUID() },
      this.config.refreshSecret,
      this.config.refreshTtlSeconds,
    );

    return {
      token,
      tokenHash: this.hash(token),
      expiresAt: new Date(Date.now() + this.config.refreshTtlSeconds * 1000),
    };
  }

  /**
   * The account an access token names, or a `401`.
   *
   * Every failure — a malformed string, a bad signature, an expired token, a
   * refresh token presented where an access token belongs — is the same
   * exception with the same message. The distinction is useless to a legitimate
   * client, which retries the same way in every case, and useful to somebody
   * probing the endpoint.
   */
  async verifyAccessToken(token: string): Promise<string> {
    return this.verify(
      token,
      this.config.accessSecret,
      ACCESS_TOKEN_TYPE,
      INVALID_ACCESS_TOKEN_MESSAGE,
      ERROR_CODES.AUTH_UNAUTHENTICATED,
    );
  }

  /** The account a refresh token names, or a `401`. */
  async verifyRefreshToken(token: string): Promise<string> {
    return this.verify(
      token,
      this.config.refreshSecret,
      REFRESH_TOKEN_TYPE,
      INVALID_REFRESH_TOKEN_MESSAGE,
      ERROR_CODES.AUTH_REFRESH_TOKEN_INVALID,
    );
  }

  /**
   * The stored form of a refresh token.
   *
   * Public because `AuthService` hashes what a client presented in order to look
   * it up — the lookup is by hash, since the raw token is not stored anywhere to
   * look up by.
   */
  hash(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }

  private async sign(
    claims: TokenClaims,
    secret: string,
    expiresInSeconds: number,
  ): Promise<string> {
    return this.jwtService.signAsync(claims, {
      secret,
      expiresIn: expiresInSeconds,
    });
  }

  /**
   * Verifies a token against one secret and one expected type.
   *
   * The type check is what makes the secrets' separation belt-and-braces rather
   * than the only defence — see {@link ACCESS_TOKEN_TYPE}. `sub` is re-checked
   * for shape because a token signed by *this* server always has one, and a
   * `sub` that is not a non-empty string means the payload is not one of ours
   * whatever the signature said.
   */
  private async verify(
    token: string,
    secret: string,
    expectedType: string,
    message: string,
    errorCode: ErrorCode,
  ): Promise<string> {
    let claims: TokenClaims;

    try {
      claims = await this.jwtService.verifyAsync<TokenClaims>(token, {
        secret,
        // HS256 only. Without this, a token declaring a different `alg` is
        // verified as that algorithm — the classic JWT confusion attack, in
        // which `none` turns "signed" into "asserted".
        algorithms: ['HS256'],
      });
    } catch {
      // Swallowed rather than rethrown or logged: the library's message
      // distinguishes "expired" from "invalid signature", and that distinction
      // is exactly what this endpoint must not publish. The code is the same
      // one every other rejection here carries, for the same reason.
      throw new UnauthorizedException(codedError(errorCode, message));
    }

    if (
      claims.typ !== expectedType ||
      typeof claims.sub !== 'string' ||
      claims.sub.length === 0
    ) {
      throw new UnauthorizedException(codedError(errorCode, message));
    }

    return claims.sub;
  }
}
