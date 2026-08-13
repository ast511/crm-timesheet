import { BadRequestException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash, randomBytes } from 'crypto';

import { ERROR_CODES } from '../../common/constants/error-codes.constants';
import { codedError } from '../../common/errors/coded-error';
import type { Prisma } from '../../generated/prisma/client';
import { AccountTokenType } from '../../generated/prisma/enums';
import { PrismaService } from '../../prisma/prisma.service';
import {
  AccountLifecycleConfig,
  loadAccountLifecycleConfig,
} from './account-lifecycle.config';
import {
  ACCOUNT_TOKEN_BYTES,
  INVALID_ACCOUNT_TOKEN_MESSAGE,
} from './auth.constants';

/** A freshly issued link secret, and the moment it stops working. */
export interface IssuedAccountToken {
  /** The value that goes into the emailed URL. Held nowhere on this side. */
  readonly token: string;
  readonly expiresAt: Date;
}

/**
 * The activation and password-reset link mechanism — **one mechanism, two
 * purposes**.
 *
 * Activating a new account and resetting a forgotten password are the same
 * problem wearing two hats: prove that whoever is asking controls the mailbox,
 * then let them choose a password. Everything about how that is done is
 * identical — a random secret, hashed before storage, valid for a bounded time,
 * usable once, and replaced rather than accumulated when a new one is issued —
 * so it is one service and one table with a `type` column, not two of each. Two
 * implementations would have been two expiry rules, two invalidation rules and
 * two chances for one of them to store a raw token.
 *
 * What genuinely differs between the two lives outside this class: the account
 * state each applies to (`AccountService` and `AccountPasswordService` decide
 * that), the lifetime (two environment variables), and the wording of the email
 * (`AccountEmailService`).
 *
 * ## Why not a JWT
 *
 * `TokenService` signs the session tokens, and this deliberately does not use
 * it. A signed token is *stateless*, which is exactly wrong here: this credential
 * must be revocable the instant a newer one is issued and must stop working the
 * instant it is used, and neither is expressible in a signature. A row already
 * has to exist to record `used_at`, so signing would add a second, weaker source
 * of truth beside it — and a JWT is also long, ugly in a URL, and carries its
 * payload in the clear to anybody reading over somebody's shoulder.
 *
 * The secret is therefore {@link ACCOUNT_TOKEN_BYTES} bytes from a CSPRNG and
 * nothing else. It says nothing, so nothing can be read out of it, and it is
 * meaningless without the row it names.
 *
 * ## Hashing
 *
 * SHA-256, hex, the same as `refresh_tokens.token_hash` and deliberately not
 * bcrypt. The full argument is in `schema.prisma`; the short version is that the
 * input is 32 random bytes rather than something a person typed, so there is
 * nothing for a slow hash to defend against, while a deterministic digest makes
 * the lookup one indexed read instead of a bcrypt comparison against every
 * outstanding link.
 */
@Injectable()
export class AccountTokenService {
  private readonly config: AccountLifecycleConfig;

  constructor(
    private readonly prisma: PrismaService,
    configService: ConfigService,
  ) {
    // Read once, at construction, for the reason `TokenService` reads its own:
    // the environment does not change while the process runs, and a bad value
    // should fail the application's startup rather than the first onboarding of
    // the morning.
    this.config = loadAccountLifecycleConfig(configService);
  }

  /**
   * Issues a link secret for one account and one purpose, **invalidating any
   * previous one of the same kind**.
   *
   * An upsert on `(userId, type)`, which is where the "only one link at a time"
   * rule actually lives: the unique pair means a resend *overwrites* the row, so
   * the previous secret stops matching the moment the new one is written, and
   * `usedAt` is reset to null because the new link has not been followed. Doing
   * it as a delete-then-insert would leave a window in which the account had no
   * link at all, and doing it by remembering to revoke first would be a rule
   * somebody could forget; the constraint cannot.
   *
   * Accepts a transaction so that creating an account and issuing its first link
   * are one write. An account that exists with no invitation is a person nobody
   * can onboard, and it is a state a failed second statement would otherwise
   * leave behind.
   *
   * The raw token is returned and never stored. This is the only moment it
   * exists on this side, and the only thing that may be done with it is put it
   * in the link — it is never logged, never returned by an endpoint, and never
   * written to any column.
   */
  async issue(
    userId: string,
    type: AccountTokenType,
    tx?: Prisma.TransactionClient,
  ): Promise<IssuedAccountToken> {
    const token = randomBytes(ACCOUNT_TOKEN_BYTES).toString('base64url');
    const tokenHash = this.hash(token);
    const expiresAt = new Date(Date.now() + this.ttlSeconds(type) * 1000);

    await (tx ?? this.prisma).accountToken.upsert({
      where: { userId_type: { userId, type } },
      update: { tokenHash, expiresAt, usedAt: null },
      create: { userId, type, tokenHash, expiresAt },
      select: { id: true },
    });

    return { token, expiresAt };
  }

  /**
   * The account a presented link belongs to, or a `400`.
   *
   * **It does not consume the token** — {@link consume} does, inside the
   * transaction that sets the password. Splitting the two is what makes the
   * whole operation atomic: a token marked used beside a password write that then
   * failed would leave somebody holding a dead link and an unchanged password,
   * with no way to recover but to ask for another.
   *
   * Every failure is the same exception with the same message and the same code.
   * These endpoints are public, so the caller may be anybody, and telling them
   * "expired" rather than "no such token" would confirm which of their guesses
   * name real links. The client behaves identically in each case anyway: the link
   * is dead, ask for a new one.
   *
   * The lookup is by hash, since the raw value is stored nowhere to look up by.
   */
  async resolve(token: string, type: AccountTokenType): Promise<string> {
    const stored = await this.prisma.accountToken.findUnique({
      where: { tokenHash: this.hash(token) },
      select: { userId: true, type: true, expiresAt: true, usedAt: true },
    });

    if (
      stored === null ||
      stored.type !== type ||
      stored.usedAt !== null ||
      stored.expiresAt.getTime() <= Date.now()
    ) {
      throw invalidAccountToken(type);
    }

    return stored.userId;
  }

  /**
   * Marks a link followed, inside the caller's transaction.
   *
   * **The `usedAt: null` in the `where` is the single-use guarantee**, and it is
   * deliberately a condition rather than a check: two requests presenting the
   * same link at the same moment both pass {@link resolve}, and only one of them
   * updates a row here. The other sees `count === 0` and is refused, which is
   * what stops a race from setting two different passwords on one account.
   *
   * A link that has been used is left in place rather than deleted. The row is
   * the record that an activation happened and when, it costs one row per account
   * per purpose, and the next issue of the same kind overwrites it.
   */
  async consume(
    userId: string,
    type: AccountTokenType,
    tx: Prisma.TransactionClient,
  ): Promise<void> {
    const { count } = await tx.accountToken.updateMany({
      where: { userId, type, usedAt: null },
      data: { usedAt: new Date() },
    });

    if (count === 0) {
      throw invalidAccountToken(type);
    }
  }

  /**
   * Throws away every outstanding link of one kind for an account.
   *
   * Called when a password is set by some *other* route — an activation
   * completes, or somebody changes their password knowing the old one — so that
   * a reset link issued and forgotten cannot be followed afterwards to overwrite
   * the password its owner has just chosen. Silent when there is nothing to
   * delete, which is the ordinary case.
   */
  async discard(
    userId: string,
    type: AccountTokenType,
    tx?: Prisma.TransactionClient,
  ): Promise<void> {
    await (tx ?? this.prisma).accountToken.deleteMany({
      where: { userId, type },
    });
  }

  /** How long a link of this kind lasts, in seconds. */
  ttlSeconds(type: AccountTokenType): number {
    return type === AccountTokenType.ACTIVATION
      ? this.config.activationTtlSeconds
      : this.config.passwordResetTtlSeconds;
  }

  /**
   * The stored form of a link secret.
   *
   * Private, unlike `TokenService.hash`: nothing outside this class looks a link
   * up, because nothing outside this class should be constructing the query that
   * decides whether one is valid.
   */
  private hash(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }
}

/**
 * The one refusal every dead link produces.
 *
 * A function rather than four `throw` sites, so the message, the status and the
 * code cannot drift between "expired", "already used", "unknown" and "wrong
 * kind" — the four situations that must be indistinguishable from outside.
 *
 * ## Why a `400` and not a `401`
 *
 * It was a `401` until Feature 038's documentation sweep found that every
 * description of these routes had always said `400` — and that the `400` was the
 * right answer. **The token here is a body parameter proving somebody received
 * an email, not a credential authenticating a caller.** `POST /auth/activate`
 * and `POST /auth/reset-password` are `@Public()` precisely because there is no
 * session to authenticate: the person has no password yet, or has forgotten it.
 * Answering `401` told a client that authentication had failed on two routes
 * whose whole purpose is that no authentication is possible, and it invited the
 * one recovery that cannot work — refresh the token, then show the login screen,
 * which is the screen they were already unable to use.
 *
 * A malformed, expired or spent value in a request body is an input error, and
 * `400` is what every other rejected body field on this API answers. The
 * `errorCode` is unchanged, so a frontend keying a translation on
 * `ACCOUNT_TOKEN_INVALID` is unaffected — only the status a client branches on
 * before reading it moves. `401` on a public route now means exactly one thing,
 * on exactly two routes: login and refresh, where the credential in the body was
 * refused.
 *
 * `purpose` is in `params` and nothing else is. The client has just followed a
 * link of that kind and already knows which, so it reveals nothing, and it is
 * what lets the screen say "ask your administrator to resend your invitation"
 * instead of "request a new reset link".
 */
export function invalidAccountToken(
  type: AccountTokenType,
): BadRequestException {
  return new BadRequestException(
    codedError(
      ERROR_CODES.ACCOUNT_TOKEN_INVALID,
      INVALID_ACCOUNT_TOKEN_MESSAGE,
      { purpose: type },
    ),
  );
}
