import { Injectable, Logger, UnauthorizedException } from '@nestjs/common';

import { ERROR_CODES } from '../../common/constants/error-codes.constants';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { codedError } from '../../common/errors/coded-error';
import {
  hashPassword,
  verifyPassword,
} from '../../common/password/password.hasher';
import { AccountStatus, AccountTokenType } from '../../generated/prisma/enums';
import { PrismaService } from '../../prisma/prisma.service';
import { AccountEmailService } from './account-email.service';
import {
  AccountTokenService,
  invalidAccountToken,
} from './account-token.service';
import { AuthService } from './auth.service';
import { ActivateAccountDto } from './dto/activate-account.dto';
import { ChangePasswordDto } from './dto/change-password.dto';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';

/**
 * The four ways a password is set, and the only four there are.
 *
 * ```text
 *   activate         no password yet, holds an invitation link   → PENDING → ACTIVE
 *   forgotPassword   cannot sign in, controls the mailbox        → issues a link
 *   resetPassword    holds a reset link                          → replaces the password
 *   changePassword   signed in, knows the current password       → replaces the password
 * ```
 *
 * **There is no fifth**, and that is the feature's central claim rather than an
 * omission. An administrator cannot set somebody's password: `POST /users` takes
 * no password and `PATCH /users/:id` no longer accepts one, so the only account
 * whose password anybody knows is their own. Before Feature 036 an administrator
 * typed a password into the create form and told the person what it was — which
 * means it existed in a chat message, in that administrator's memory, and often
 * unchanged a year later.
 *
 * Separate from `AuthService` because the two answer different questions.
 * That one owns *sessions* — who is calling, rotation, revocation. This owns
 * *credentials* — what the stored hash is and who is allowed to replace it. They
 * meet in exactly one place: this service revokes sessions through
 * {@link AuthService.revokeSessions}, because ending a session is that service's
 * job and a second implementation would be a second answer to "what is a live
 * session".
 *
 * ## Session revocation: what each flow does, and why
 *
 * | Flow | Sessions | Why |
 * | --- | --- | --- |
 * | activate | none to revoke | the account has never been signed in to |
 * | reset | **all revoked** | the reason for a reset may be that somebody else has the account |
 * | change | **all but the current one** | the person is at the keyboard and should not be signed out of it |
 *
 * The reset row is the one that matters. Someone resetting a password may be
 * recovering from a compromise, and leaving a thief's refresh token live would
 * make the reset ceremonial — the attacker keeps refreshing indefinitely while
 * the owner believes they have locked them out. Revoking costs the legitimate
 * user one sign-in on their other devices, which is the correct price.
 *
 * A change keeps the caller's own session, because signing somebody out of the
 * page on which they just changed their password reads as a failure and trains
 * people to avoid the feature. Every *other* session goes, which is the half that
 * actually matters: "change my password because I think somebody has it" must end
 * their access.
 *
 * Access tokens are unaffected in every case and stay valid until they expire —
 * the stateless trade-off `RefreshToken` argues in `schema.prisma`, bounded by
 * `JWT_ACCESS_TTL`. Revocation kills the *refresh*, so a stolen session dies at
 * the next rotation at the latest.
 */
@Injectable()
export class AccountPasswordService {
  private readonly logger = new Logger(AccountPasswordService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly tokens: AccountTokenService,
    private readonly emails: AccountEmailService,
    private readonly auth: AuthService,
  ) {}

  /**
   * Sets the first password from an invitation link, and turns the account on.
   *
   * The whole of onboarding's second half. Consuming the link, writing the hash
   * and moving the status are **one transaction**: any two of the three without
   * the third is a broken account — a spent link with no password means somebody
   * who can never activate and must be re-invited, and a password on an account
   * still marked pending is one that cannot sign in.
   *
   * The status is written as a condition rather than checked beforehand. An
   * account that is not `PENDING_ACTIVATION` matches no row, `count` is zero, and
   * the whole thing is refused with the same generic answer every dead link gets
   * — which closes the race between two clicks of the same link and covers the
   * case of an account an administrator disabled while its invitation was in
   * flight.
   */
  async activate(dto: ActivateAccountDto): Promise<void> {
    const userId = await this.tokens.resolve(
      dto.token,
      AccountTokenType.ACTIVATION,
    );
    const passwordHash = await hashPassword(dto.password);

    await this.prisma.$transaction(async (tx) => {
      await this.tokens.consume(userId, AccountTokenType.ACTIVATION, tx);

      const { count } = await tx.user.updateMany({
        where: { id: userId, status: AccountStatus.PENDING_ACTIVATION },
        data: { passwordHash, status: AccountStatus.ACTIVE },
      });

      if (count === 0) {
        throw invalidAccountToken(AccountTokenType.ACTIVATION);
      }

      // A reset link cannot legitimately exist for an account that had no
      // password, but discarding costs one statement and closes the case where
      // an account was disabled, reset-requested and then re-invited.
      await this.tokens.discard(userId, AccountTokenType.PASSWORD_RESET, tx);
    });

    this.logger.log(`Account ${userId} was activated by its owner`);
  }

  /**
   * Emails a reset link — **and answers identically whether or not the address
   * names an account.**
   *
   * The no-enumeration rule, and the reason this method returns `void` rather
   * than anything the caller could branch on. Every early return below is silent:
   * an unknown address, an account still `PENDING_ACTIVATION` (which needs an
   * invitation from an administrator, not a reset) and a `DISABLED` one all leave
   * by the same door as a success. The controller then answers the same fixed
   * sentence to all four, so an outsider cannot use the endpoint to test an
   * address list against the company directory — which in an internal system is
   * also a test of who works here.
   *
   * **The timing is not equalised**, unlike login's, and that is a deliberate
   * limit rather than an oversight. A hit does more work than a miss: it writes a
   * token row and hands a message to SMTP. Equalising would mean either doing
   * that work for addresses that name nobody — sending mail to strangers — or
   * padding to a fixed delay that a slow mail server would blow through anyway.
   * What closes the gap in practice is Feature 034: this route carries
   * `@StrictRateLimit()`, so the sample size an attacker needs is not available.
   * Recorded in the feature document as a known residual.
   *
   * A failure to *send* is swallowed, and it is the one place in this feature
   * where that is right. The token has been issued and the row is written; if the
   * mail server is down, telling the caller so would (a) publish that the address
   * exists and (b) be useless, since they cannot fix it. It is logged with the
   * account id and nothing else, which is what an operator needs.
   */
  async forgotPassword(dto: ForgotPasswordDto): Promise<void> {
    const user = await this.prisma.user.findUnique({
      where: { email: dto.email },
      select: { id: true, email: true, status: true },
    });

    // Only an account that has a password can be sent a link to replace one. A
    // pending account is onboarded by an administrator resending its invitation,
    // and a disabled one must not be handed a way back in.
    if (user === null || user.status !== AccountStatus.ACTIVE) {
      return;
    }

    const issued = await this.tokens.issue(
      user.id,
      AccountTokenType.PASSWORD_RESET,
    );

    try {
      await this.emails.sendPasswordReset({
        to: user.email,
        token: issued.token,
        expiresAt: issued.expiresAt,
      });
    } catch (error) {
      this.logger.error(
        `Could not send the password reset email for account ${user.id}`,
        error instanceof Error ? error.stack : String(error),
      );
    }
  }

  /**
   * Replaces a forgotten password using a reset link, and ends every session.
   *
   * The mirror of {@link activate}, with two differences that follow from the
   * account already being real: the status is required to be `ACTIVE` rather than
   * moved, and the sessions are revoked. See the table on the class for why a
   * reset revokes everything where a change keeps one.
   *
   * The revocation runs **inside** the transaction, so a reset that fails part
   * way cannot leave the password changed with the old sessions still live, or
   * the sessions killed with the old password still working.
   */
  async resetPassword(dto: ResetPasswordDto): Promise<void> {
    const userId = await this.tokens.resolve(
      dto.token,
      AccountTokenType.PASSWORD_RESET,
    );
    const passwordHash = await hashPassword(dto.newPassword);

    const revoked = await this.prisma.$transaction(async (tx) => {
      await this.tokens.consume(userId, AccountTokenType.PASSWORD_RESET, tx);

      const { count } = await tx.user.updateMany({
        where: { id: userId, status: AccountStatus.ACTIVE },
        data: { passwordHash },
      });

      if (count === 0) {
        throw invalidAccountToken(AccountTokenType.PASSWORD_RESET);
      }

      return this.auth.revokeSessions(userId, { tx });
    });

    this.logger.log(
      `Password reset for account ${userId}; revoked ${String(revoked)} session(s)`,
    );
  }

  /**
   * Replaces a known password, keeping the caller signed in where they are.
   *
   * The current password is verified against the stored hash **before** anything
   * is written, and that check is the whole point of the endpoint: an access
   * token proves who is calling, not that the person holding the laptop is its
   * owner. Without it, an unattended session would be enough to take an account
   * over permanently.
   *
   * A wrong current password is a `401` with its own code rather than the generic
   * credentials one. The caller is already authenticated as this account, so
   * there is no enumeration to protect — and being specific is what stops
   * somebody concluding their *new* password was rejected and trying weaker ones.
   *
   * `presentedRefreshToken` is the session to spare. It is optional because a
   * client need not send one, and an absent one means every session goes,
   * including the caller's — which is the safe direction to be wrong in.
   */
  async changePassword(
    user: CurrentUser,
    dto: ChangePasswordDto,
    presentedRefreshToken?: string,
  ): Promise<void> {
    const account = await this.prisma.user.findUnique({
      where: { id: user.userId },
      select: { passwordHash: true },
    });

    // `passwordHash` is null only for an account that never activated, which
    // cannot hold an access token — but it is read as a refusal rather than
    // asserted, because `verifyPassword` would be handed a null and throw.
    if (
      account?.passwordHash == null ||
      !(await verifyPassword(dto.currentPassword, account.passwordHash))
    ) {
      throw new UnauthorizedException(
        codedError(
          ERROR_CODES.ACCOUNT_CURRENT_PASSWORD_INCORRECT,
          'The current password is not correct',
        ),
      );
    }

    const passwordHash = await hashPassword(dto.newPassword);

    const revoked = await this.prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: user.userId },
        data: { passwordHash },
        select: { id: true },
      });

      // An outstanding reset link would otherwise survive this change and let
      // whoever holds it overwrite the password its owner has just chosen —
      // which is precisely the sequence somebody recovering from a compromise
      // must not leave open.
      await this.tokens.discard(
        user.userId,
        AccountTokenType.PASSWORD_RESET,
        tx,
      );

      return this.auth.revokeSessions(user.userId, {
        tx,
        exceptToken: presentedRefreshToken,
      });
    });

    this.logger.log(
      `Password changed for account ${user.userId}; revoked ${String(revoked)} other session(s)`,
    );
  }
}
