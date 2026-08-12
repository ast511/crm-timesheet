import { Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { randomBytes } from 'crypto';

import {
  ERROR_CODES,
  ErrorCode,
} from '../../common/constants/error-codes.constants';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { codedError } from '../../common/errors/coded-error';
import {
  hashPassword,
  verifyPassword,
} from '../../common/password/password.hasher';
import type { Prisma } from '../../generated/prisma/client';
import { AccountStatus } from '../../generated/prisma/enums';
import { PrismaService } from '../../prisma/prisma.service';
import {
  INVALID_ACCESS_TOKEN_MESSAGE,
  INVALID_CREDENTIALS_MESSAGE,
  INVALID_REFRESH_TOKEN_MESSAGE,
  IP_ADDRESS_MAX_LENGTH,
  REFRESH_TOKEN_REUSED_MESSAGE,
  USER_AGENT_MAX_LENGTH,
} from './auth.constants';
import { LoginDto } from './dto/login.dto';
import {
  AuthSessionEntity,
  toAuthSessionEntity,
} from './entities/auth-session.entity';
import {
  AUTHENTICATED_USER_SELECT,
  AuthenticatedUserRow,
  AuthUserEntity,
  CREDENTIALS_SELECT,
  CredentialsRow,
  toAuthUserEntity,
  toCurrentUser,
} from './entities/authenticated-user.entity';
import {
  isUsable,
  REFRESH_TOKEN_SELECT,
  StoredRefreshToken,
} from './entities/refresh-token.entity';
import { TokenService } from './token.service';

/**
 * What a client told us about itself, recorded beside an issued token.
 *
 * Neither value is trusted for anything. They exist so that a person looking at
 * their own sessions — or an administrator looking at an incident — can tell one
 * login from another. See `refresh_tokens.user_agent` in `schema.prisma`.
 */
export interface ClientContext {
  userAgent?: string;
  ipAddress?: string;
}

/**
 * Logging in, refreshing, logging out, and answering "who is calling".
 *
 * Every business rule of the feature is here; `TokenService` knows only how to
 * sign and hash, and `AuthController` knows only how to pass a body along.
 *
 * ## The two halves of a session
 *
 * An **access token** is stateless and unrevocable, so it is short. A **refresh
 * token** is a row, so it can be ended — and every mechanism this feature has
 * for ending a session acts on that row. The whole design follows from that
 * split; `RefreshToken` in `schema.prisma` argues it at length.
 *
 * ## Rotation, and what it detects
 *
 * A refresh token is good exactly once. {@link refresh} marks the presented
 * token spent, records the token it became, and returns the successor — so the
 * tokens of one login form a chain, and the only token at the end of that chain
 * is the one the legitimate client is holding.
 *
 * That is what makes theft visible. A stolen refresh token is a *copy*: two
 * parties now hold one credential, and whichever of them refreshes second
 * presents a token that already has a successor. The application cannot tell
 * which one is the thief — the request looks identical — so it does the only
 * safe thing and ends every session the account has, forcing a real login. See
 * {@link revokeSessions}, which is deliberately blunter than walking the chain:
 * the chain would identify the compromised session, but a token captured once
 * may have been captured from a machine that is still compromised, and there is
 * no good argument for leaving the account's other sessions open while an
 * incident is in progress.
 *
 * ## What is not enforced here
 *
 * Nothing about *permissions*. This service establishes who the caller is and
 * refuses accounts that may not sign in at all. What an authenticated caller may
 * do to a given resource is unchecked, deliberately and visibly, until Feature
 * 033 — which will read `@CurrentUser()` and resolve the permission set the
 * permission-management module already computes.
 */
@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  /**
   * A bcrypt hash of a value nobody knows, compared against when no account
   * matched.
   *
   * Without it, `POST /auth/login` answers a wrong password in the ~250 ms a
   * bcrypt comparison takes and an unknown address in the ~2 ms a failed index
   * lookup takes. That difference is not subtle, it survives network noise over
   * a few samples, and it turns the endpoint into an oracle for "does this
   * person have an account here" — which, in a company's internal system, is
   * "does this person work here". Generic wording alone does not close it; the
   * two paths have to *cost* the same. The identical argument to
   * {@link INVALID_CREDENTIALS_MESSAGE}, one layer down.
   *
   * A promise created at construction rather than a literal in the source: the
   * input is 32 random bytes, so this hash matches nothing that could ever be
   * typed, and one bcrypt at startup costs less than shipping a constant that
   * looks like a credential and invites somebody to "reuse" it.
   */
  private readonly decoyPasswordHash: Promise<string>;

  constructor(
    private readonly prisma: PrismaService,
    private readonly tokenService: TokenService,
  ) {
    this.decoyPasswordHash = hashPassword(randomBytes(24).toString('hex'));
  }

  /**
   * Exchanges an email and a password for a session.
   *
   * **Four** things can be wrong as of Feature 036 — no such account, wrong
   * password, an account an administrator disabled, and an account whose owner
   * has never followed their activation link — and all four answer with
   * {@link INVALID_CREDENTIALS_MESSAGE} and a `401`. Telling a deactivated
   * employee that their password was right would confirm both the address and
   * the credential to whoever is holding them, and "your account is disabled" is
   * a fact about somebody's employment that an unauthenticated caller is not
   * owed. The person it actually happens to is told by their manager, not by a
   * login screen.
   *
   * The state check runs *after* the password comparison rather than as part of
   * the `where`, so that a refused account costs the same as an active one with a
   * wrong password. Reading `status` and ignoring it until the end is what keeps
   * the paths indistinguishable from outside.
   *
   * **A `PENDING_ACTIVATION` account has no password at all** — `passwordHash` is
   * null — and it takes the same route: the null falls through to the decoy hash,
   * so the comparison runs and costs what every other comparison costs, and then
   * the status refuses it. Short-circuiting on the null would have made "this
   * address exists but has never been activated" measurable in milliseconds,
   * which during an onboarding week is a list of exactly who has just joined.
   */
  async login(
    dto: LoginDto,
    context: ClientContext,
  ): Promise<AuthSessionEntity> {
    const user: CredentialsRow | null = await this.prisma.user.findUnique({
      where: { email: dto.email },
      select: CREDENTIALS_SELECT,
    });

    const passwordMatches = await verifyPassword(
      dto.password,
      user?.passwordHash ?? (await this.decoyPasswordHash),
    );

    // One condition, one code. Feature 033 gave the other paths in this service
    // a specific `AUTH_INACTIVE_USER`, and this branch deliberately does not
    // reach for it: a distinct code for a deactivated account would confirm both
    // that the address exists and that the password was right, undoing the
    // no-enumeration property from the one place nobody would think to look.
    if (
      user === null ||
      !passwordMatches ||
      user.status !== AccountStatus.ACTIVE
    ) {
      throw new UnauthorizedException(
        codedError(
          ERROR_CODES.AUTH_INVALID_CREDENTIALS,
          INVALID_CREDENTIALS_MESSAGE,
        ),
      );
    }

    return this.issueSession(user, context);
  }

  /**
   * Exchanges a refresh token for a new session, and ends the old one.
   *
   * The order of the checks is the order in which they get cheaper to be wrong
   * about. The signature is verified first, without a query, so a string that is
   * not a token of ours never reaches the database. The row is then found by
   * hash — the raw token is stored nowhere, so the hash is the only handle there
   * is. Reuse is checked before usability, because a spent token and an expired
   * one are not the same event and must not produce the same answer.
   *
   * The rotation itself is a **transaction**. Marking the old token spent and
   * inserting its successor are one fact about one session, and a run in which
   * the first succeeded and the second failed would leave a client holding a
   * token the server had already invalidated with no replacement — a silent
   * logout that only happens under load. The same reasoning the permission audit
   * log applies to writing history beside the change it describes.
   */
  async refresh(
    presentedToken: string,
    context: ClientContext,
  ): Promise<AuthSessionEntity> {
    const userId = await this.tokenService.verifyRefreshToken(presentedToken);
    const tokenHash = this.tokenService.hash(presentedToken);

    const stored: StoredRefreshToken | null =
      await this.prisma.refreshToken.findUnique({
        where: { tokenHash },
        select: REFRESH_TOKEN_SELECT,
      });

    // A signature that verifies against a row that does not exist means the row
    // was deleted — by an account deletion cascading, or by a future cleanup of
    // expired tokens. Either way the session is over.
    if (stored === null || stored.userId !== userId) {
      throw new UnauthorizedException(
        codedError(
          ERROR_CODES.AUTH_REFRESH_TOKEN_INVALID,
          INVALID_REFRESH_TOKEN_MESSAGE,
        ),
      );
    }

    if (stored.replacedById !== null) {
      await this.handleReuse(stored);
    }

    if (!isUsable(stored, new Date())) {
      throw new UnauthorizedException(
        codedError(
          ERROR_CODES.AUTH_REFRESH_TOKEN_INVALID,
          INVALID_REFRESH_TOKEN_MESSAGE,
        ),
      );
    }

    // Re-read rather than trusting the token's `sub`: the whole reason the access
    // token carries no role is that an account can change between one request and
    // the next, and a refresh is the moment that most often notices. A user
    // deactivated an hour ago refreshes into a `401` here, which is the outer
    // bound on how long a stateless access token can outlive its account.
    const user = await this.findActiveUser(
      userId,
      INVALID_REFRESH_TOKEN_MESSAGE,
      ERROR_CODES.AUTH_REFRESH_TOKEN_INVALID,
    );

    const issued = await this.tokenService.issueRefreshToken(user.id);

    await this.prisma.$transaction(async (tx) => {
      const successor = await tx.refreshToken.create({
        data: {
          userId: user.id,
          tokenHash: issued.tokenHash,
          expiresAt: issued.expiresAt,
          ...describeClient(context),
        },
        select: { id: true },
      });

      await tx.refreshToken.update({
        where: { id: stored.id },
        data: { revokedAt: new Date(), replacedById: successor.id },
      });
    });

    return this.completeSession(user, issued.token);
  }

  /**
   * Ends one session.
   *
   * Scoped to the token presented rather than to the account, so signing out on
   * a laptop does not sign the same person out on their phone. "Sign out
   * everywhere" is a real feature and a different one; it is noted as a
   * follow-up rather than smuggled in as an optional field, because an endpoint
   * whose blast radius depends on whether a body was sent is one somebody will
   * eventually get wrong.
   *
   * **Idempotent, and silent about what it found.** A token that does not exist,
   * belongs to somebody else, or was revoked an hour ago all produce the same
   * `200`. There is no useful client behaviour that differs between them — the
   * session is over in every case — and answering `404` for "not yours" would
   * turn logout into a way for an authenticated caller to test whether a token
   * they hold belongs to another account.
   *
   * The access token is untouched, because it cannot be touched: it stays valid
   * until it expires, which is the trade-off argued on `RefreshToken` in
   * `schema.prisma` and the reason `JWT_ACCESS_TTL` is capped at an hour. A
   * client is expected to discard both.
   */
  async logout(user: CurrentUser, presentedToken: string): Promise<void> {
    await this.prisma.refreshToken.updateMany({
      where: {
        tokenHash: this.tokenService.hash(presentedToken),
        userId: user.userId,
        revokedAt: null,
      },
      data: { revokedAt: new Date() },
    });
  }

  /**
   * The caller behind an access token — the method the identity seam rests on.
   *
   * Called by `JwtAuthGuard` on every request and by the notification gateway on
   * every handshake, which is exactly why it is one method: two implementations
   * of "what does this token mean" would be two places for the account-state
   * check to be forgotten, and the socket is the one where forgetting it lasts
   * for hours rather than minutes.
   *
   * The database read is the point, not an overhead to be optimised away. The
   * token carries an id and nothing else; role, employment record and — above
   * all — `status` are read fresh, so deactivating an account takes effect on
   * its next request rather than when its token happens to expire. What that
   * costs is one primary-key lookup on an already-open pool. What it buys is
   * that `users.status` means something in real time — which is what makes
   * Feature 036's `POST /users/:id/deactivate` an action with an effect now
   * rather than an intention that lands within a week.
   */
  async authenticate(accessToken: string): Promise<CurrentUser> {
    const userId = await this.tokenService.verifyAccessToken(accessToken);

    return toCurrentUser(
      await this.findActiveUser(
        userId,
        INVALID_ACCESS_TOKEN_MESSAGE,
        ERROR_CODES.AUTH_UNAUTHENTICATED,
      ),
    );
  }

  /**
   * The caller's own account, for `GET /auth/me`.
   *
   * Re-read rather than mapped from the `CurrentUser` the guard already
   * resolved, because this endpoint's whole purpose is to be the fresh answer: a
   * client calls it on page load to hydrate its session, and handing back a
   * projection of what was read microseconds earlier would be the same value by
   * a longer route. `email` is also not in `CurrentUser` — the seam carries what
   * the application needs to make decisions, not what a profile menu renders.
   */
  async describeSelf(user: CurrentUser): Promise<AuthUserEntity> {
    return toAuthUserEntity(
      await this.findActiveUser(
        user.userId,
        INVALID_ACCESS_TOKEN_MESSAGE,
        ERROR_CODES.AUTH_UNAUTHENTICATED,
      ),
    );
  }

  /**
   * An account that exists and may still sign in, or a `401`.
   *
   * **The message and the status do not say which of the two failed; the error
   * code does.** That split is Feature 033's, and it is the only place in this
   * module where a code is more specific than the sentence beside it, so it is
   * worth saying why it is safe here and would not be at login.
   *
   * This runs only for a caller who has *already* presented a signed token
   * naming this account — a refresh, or any authenticated request. Whoever they
   * are, they hold a credential for it: either they own it, or they stole it and
   * knew the account existed before they asked. Telling them
   * `AUTH_INACTIVE_USER` therefore reveals nothing, and it buys the difference
   * between a frontend saying "sign in again" — which would fail forever — and
   * "your account has been deactivated". Login has no such caller, holds no such
   * proof, and keeps one code for all of its failures.
   *
   * As of Feature 036 the check is `status === ACTIVE` rather than `isActive`,
   * so it now also refuses a `PENDING_ACTIVATION` account. That state is
   * unreachable here in practice — an account that never had a password was
   * never signed in to, so no token names it — but it is refused rather than
   * assumed impossible, because "unreachable" is a property of today's flows and
   * this is the one place where being wrong about it would hand somebody a
   * session on an account nobody has ever claimed.
   *
   * The English message stays the caller's generic one either way, because it is
   * read from logs rather than shown to anybody, and because leaving it alone
   * kept this refinement to an added field.
   */
  private async findActiveUser(
    userId: string,
    message: string,
    errorCode: ErrorCode,
  ): Promise<AuthenticatedUserRow> {
    const user: AuthenticatedUserRow | null = await this.prisma.user.findUnique(
      {
        where: { id: userId },
        select: AUTHENTICATED_USER_SELECT,
      },
    );

    if (user === null) {
      throw new UnauthorizedException(codedError(errorCode, message));
    }

    if (user.status !== AccountStatus.ACTIVE) {
      throw new UnauthorizedException(
        codedError(ERROR_CODES.AUTH_INACTIVE_USER, message),
      );
    }

    return user;
  }

  /** Issues the first refresh token of a login, and the session around it. */
  private async issueSession(
    user: AuthenticatedUserRow,
    context: ClientContext,
  ): Promise<AuthSessionEntity> {
    const issued = await this.tokenService.issueRefreshToken(user.id);

    await this.prisma.refreshToken.create({
      data: {
        userId: user.id,
        tokenHash: issued.tokenHash,
        expiresAt: issued.expiresAt,
        ...describeClient(context),
      },
      select: { id: true },
    });

    return this.completeSession(user, issued.token);
  }

  /**
   * Signs the access token and assembles the response.
   *
   * Shared by login and refresh so the two cannot drift — the body a client
   * parses is built once, whichever endpoint produced it.
   */
  private async completeSession(
    user: AuthenticatedUserRow,
    refreshToken: string,
  ): Promise<AuthSessionEntity> {
    return toAuthSessionEntity(
      await this.tokenService.issueAccessToken(user.id),
      refreshToken,
      this.tokenService.accessTtlSeconds,
      toAuthUserEntity(user),
    );
  }

  /**
   * A refresh token that had already been used came back.
   *
   * Always throws. The account's live sessions are revoked first, and the
   * message is the one authentication failure in this module that is *not*
   * generic: whoever presented this token has just been logged out of
   * everything, cannot recover by refreshing, and needs to be told to sign in
   * again. It reveals nothing — they are holding the token.
   *
   * It is logged at `warn` with the account id and nothing else. No token, no
   * hash, no address: the log says an incident happened and which account it
   * happened to, which is what an operator needs, and none of the material that
   * would make the log itself worth stealing.
   */
  private async handleReuse(stored: StoredRefreshToken): Promise<never> {
    const revoked = await this.revokeSessions(stored.userId);

    this.logger.warn(
      `A spent refresh token was presented for user ${stored.userId}; revoked ${String(revoked)} live session(s)`,
    );

    throw new UnauthorizedException(
      codedError(
        ERROR_CODES.AUTH_REFRESH_TOKEN_REUSED,
        REFRESH_TOKEN_REUSED_MESSAGE,
      ),
    );
  }

  /**
   * Revokes an account's live refresh tokens. Returns how many were ended.
   *
   * **The one place a session is ended in bulk**, and it is public as of Feature
   * 036 because three callers now need it and a second implementation would be a
   * second answer to "what counts as a live session":
   *
   * - reuse detection, here, revoking everything after a spent token came back;
   * - a password reset, revoking everything, because the person may be
   *   recovering from a compromise;
   * - a password change, revoking everything *but* the session doing it;
   * - and deactivation, which revokes everything so a disabled account's open
   *   sessions die at their next refresh rather than at their token's expiry.
   *
   * `exceptToken` is the raw refresh token to spare, hashed here rather than by
   * the caller — hashing is `TokenService`'s and this keeps every caller from
   * needing it. An unknown or absent value simply spares nothing, which is the
   * safe direction: the failure mode is an extra sign-in, not a session that
   * should have ended and did not.
   *
   * `tx` lets the revocation join the transaction that changed the password, so
   * a partial failure cannot leave the new password stored with the old sessions
   * still live.
   *
   * Access tokens are untouched and cannot be — the stateless trade-off argued on
   * `RefreshToken` in `schema.prisma`. What this bounds is the *refresh*, so a
   * revoked session survives at most `JWT_ACCESS_TTL`.
   */
  async revokeSessions(
    userId: string,
    options: { tx?: Prisma.TransactionClient; exceptToken?: string } = {},
  ): Promise<number> {
    const spared =
      options.exceptToken === undefined
        ? undefined
        : this.tokenService.hash(options.exceptToken);

    const { count } = await (options.tx ?? this.prisma).refreshToken.updateMany(
      {
        where: {
          userId,
          revokedAt: null,
          ...(spared === undefined ? {} : { NOT: { tokenHash: spared } }),
        },
        data: { revokedAt: new Date() },
      },
    );

    return count;
  }
}

/**
 * The client's self-description, trimmed to what the columns hold.
 *
 * Undefined stays undefined rather than becoming `'unknown'`: a client that sent
 * no `User-Agent` is a fact, and a string that looks like data is not the way to
 * record its absence.
 */
function describeClient(context: ClientContext): {
  userAgent: string | null;
  ipAddress: string | null;
} {
  return {
    userAgent: truncate(context.userAgent, USER_AGENT_MAX_LENGTH),
    ipAddress: truncate(context.ipAddress, IP_ADDRESS_MAX_LENGTH),
  };
}

function truncate(value: string | undefined, max: number): string | null {
  const trimmed = value?.trim();

  return trimmed === undefined || trimmed.length === 0
    ? null
    : trimmed.slice(0, max);
}
