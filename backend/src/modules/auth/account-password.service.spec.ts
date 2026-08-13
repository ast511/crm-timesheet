import { BadRequestException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';

import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { verifyPassword } from '../../common/password/password.hasher';
import {
  AccountStatus,
  AccountTokenType,
  UserRole,
} from '../../generated/prisma/enums';
import { PrismaService } from '../../prisma/prisma.service';
import { AccountEmailService } from './account-email.service';
import { AccountPasswordService } from './account-password.service';
import { AccountTokenService } from './account-token.service';
import { AuthService } from './auth.service';

/**
 * The four ways a password is set — and the guarantees that make each of them
 * safe rather than merely working.
 *
 * Hashing is mocked because bcrypt at cost factor 12 costs a few hundred
 * milliseconds on the main thread and what is under test is *that* the service
 * hashes and compares, never that `bcryptjs` works — which is
 * `password.hasher.spec.ts`'s job.
 */
jest.mock('../../common/password/password.hasher', () => ({
  hashPassword: jest.fn().mockResolvedValue('new-hash'),
  verifyPassword: jest.fn().mockResolvedValue(true),
}));

const verifyPasswordMock = verifyPassword as jest.MockedFunction<
  typeof verifyPassword
>;

const CALLER: CurrentUser = {
  userId: 'usr-1',
  employeeId: 'emp-1',
  role: UserRole.USER,
  administrativeAccess: false,
};

const TOKEN = 'A'.repeat(43);

describe('AccountPasswordService', () => {
  let service: AccountPasswordService;
  let prisma: {
    user: { findUnique: jest.Mock; updateMany: jest.Mock; update: jest.Mock };
    $transaction: jest.Mock;
  };
  let tokens: {
    resolve: jest.Mock;
    consume: jest.Mock;
    discard: jest.Mock;
    issue: jest.Mock;
  };
  let emails: { sendPasswordReset: jest.Mock };
  let auth: { revokeSessions: jest.Mock };

  beforeEach(async () => {
    // The hasher is a module mock, so its call record survives between tests
    // unless it is cleared — and several assertions below are about a call *not*
    // having happened.
    verifyPasswordMock.mockClear();
    verifyPasswordMock.mockResolvedValue(true);

    prisma = {
      user: {
        findUnique: jest.fn(),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        update: jest.fn().mockResolvedValue({ id: 'usr-1' }),
      },
      $transaction: jest.fn((run: (tx: unknown) => Promise<unknown>) =>
        run(prisma),
      ),
    };

    tokens = {
      resolve: jest.fn().mockResolvedValue('usr-1'),
      consume: jest.fn().mockResolvedValue(undefined),
      discard: jest.fn().mockResolvedValue(undefined),
      issue: jest.fn().mockResolvedValue({
        token: TOKEN,
        expiresAt: new Date('2026-08-09T12:00:00.000Z'),
      }),
    };
    emails = { sendPasswordReset: jest.fn().mockResolvedValue(undefined) };
    auth = { revokeSessions: jest.fn().mockResolvedValue(2) };

    const moduleRef: TestingModule = await Test.createTestingModule({
      providers: [
        AccountPasswordService,
        { provide: PrismaService, useValue: prisma },
        { provide: AccountTokenService, useValue: tokens },
        { provide: AccountEmailService, useValue: emails },
        { provide: AuthService, useValue: auth },
      ],
    }).compile();

    service = moduleRef.get(AccountPasswordService);
  });

  describe('activate', () => {
    const dto = { token: TOKEN, password: 'the one they chose' };

    it('sets the password and turns the account on', async () => {
      await service.activate(dto);

      expect(prisma.user.updateMany).toHaveBeenCalledWith({
        where: { id: 'usr-1', status: AccountStatus.PENDING_ACTIVATION },
        data: { passwordHash: 'new-hash', status: AccountStatus.ACTIVE },
      });
    });

    it('consumes the link, so it cannot be followed twice', async () => {
      await service.activate(dto);

      expect(tokens.consume).toHaveBeenCalledWith(
        'usr-1',
        AccountTokenType.ACTIVATION,
        prisma,
      );
    });

    /**
     * Any two of consume/write/status without the third is a broken account: a
     * spent link and no password is somebody who must be re-invited.
     */
    it('does all three inside one transaction', async () => {
      await service.activate(dto);

      expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    });

    /**
     * The status is a *condition*, not a check beforehand — which closes the
     * race between two clicks of one link and covers an account disabled while
     * its invitation was in flight.
     */
    it('refuses when the account is no longer pending', async () => {
      prisma.user.updateMany.mockResolvedValue({ count: 0 });

      await expect(service.activate(dto)).rejects.toMatchObject({
        // An input error, not an authentication failure — this route has no
        // session to authenticate. See `invalidAccountToken`.
        status: 400,
        response: { errorCode: 'ACCOUNT_TOKEN_INVALID' },
      });
    });

    it('refuses a dead link before hashing anything', async () => {
      tokens.resolve.mockRejectedValue(new BadRequestException('nope'));

      await expect(service.activate(dto)).rejects.toBeInstanceOf(
        BadRequestException,
      );
      expect(prisma.user.updateMany).not.toHaveBeenCalled();
    });

    /** An account that has just been activated has no sessions to end. */
    it('revokes no sessions', async () => {
      await service.activate(dto);

      expect(auth.revokeSessions).not.toHaveBeenCalled();
    });
  });

  describe('forgotPassword', () => {
    const active = {
      id: 'usr-1',
      email: 'ana.pop@example.com',
      status: AccountStatus.ACTIVE,
    };

    it('issues a reset link and emails it for an active account', async () => {
      prisma.user.findUnique.mockResolvedValue(active);

      await service.forgotPassword({ email: 'ana.pop@example.com' });

      expect(tokens.issue).toHaveBeenCalledWith(
        'usr-1',
        AccountTokenType.PASSWORD_RESET,
      );
      expect(emails.sendPasswordReset).toHaveBeenCalledWith({
        to: 'ana.pop@example.com',
        token: TOKEN,
        expiresAt: new Date('2026-08-09T12:00:00.000Z'),
      });
    });

    /**
     * **No enumeration.** Every one of these leaves by the same door as a
     * success, and the method returns `void` so there is nothing for a caller to
     * branch on. In an internal system "is there an account" is also "does this
     * person work here".
     */
    it.each([
      ['an unknown address', null],
      [
        'an account that never activated',
        { ...active, status: AccountStatus.PENDING_ACTIVATION },
      ],
      ['a disabled account', { ...active, status: AccountStatus.DISABLED }],
    ])('says nothing and does nothing for %s', async (_case, row) => {
      prisma.user.findUnique.mockResolvedValue(row);

      await expect(
        service.forgotPassword({ email: 'ana.pop@example.com' }),
      ).resolves.toBeUndefined();

      expect(tokens.issue).not.toHaveBeenCalled();
      expect(emails.sendPasswordReset).not.toHaveBeenCalled();
    });

    /**
     * A mail server that is down must not publish that the address exists — and
     * the caller could not act on the failure anyway.
     */
    it('swallows a delivery failure rather than reporting it', async () => {
      prisma.user.findUnique.mockResolvedValue(active);
      emails.sendPasswordReset.mockRejectedValue(new Error('smtp down'));

      await expect(
        service.forgotPassword({ email: 'ana.pop@example.com' }),
      ).resolves.toBeUndefined();
    });
  });

  describe('resetPassword', () => {
    const dto = { token: TOKEN, newPassword: 'a brand new secret' };

    it('replaces the password on an active account', async () => {
      await service.resetPassword(dto);

      expect(prisma.user.updateMany).toHaveBeenCalledWith({
        where: { id: 'usr-1', status: AccountStatus.ACTIVE },
        data: { passwordHash: 'new-hash' },
      });
    });

    /**
     * **Everything is revoked**, because the reason for a reset may be that
     * somebody else has the account. Leaving a thief's refresh token live would
     * make the reset ceremonial.
     */
    it('revokes every session, in the same transaction', async () => {
      await service.resetPassword(dto);

      expect(auth.revokeSessions).toHaveBeenCalledWith('usr-1', {
        tx: prisma,
      });
    });

    it('consumes the link', async () => {
      await service.resetPassword(dto);

      expect(tokens.consume).toHaveBeenCalledWith(
        'usr-1',
        AccountTokenType.PASSWORD_RESET,
        prisma,
      );
    });

    it('refuses when the account is not active', async () => {
      prisma.user.updateMany.mockResolvedValue({ count: 0 });

      await expect(service.resetPassword(dto)).rejects.toMatchObject({
        status: 400,
        response: { errorCode: 'ACCOUNT_TOKEN_INVALID' },
      });
    });
  });

  describe('changePassword', () => {
    const dto = {
      currentPassword: 'what it was',
      newPassword: 'what it will be',
    };

    beforeEach(() => {
      prisma.user.findUnique.mockResolvedValue({ passwordHash: 'old-hash' });
    });

    /**
     * The check the whole endpoint exists for: an access token proves who is
     * calling, not that the person holding the laptop is its owner.
     */
    it('verifies the current password before writing anything', async () => {
      await service.changePassword(CALLER, dto);

      expect(verifyPasswordMock).toHaveBeenCalledWith(
        'what it was',
        'old-hash',
      );
      expect(prisma.user.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: { passwordHash: 'new-hash' },
        }),
      );
    });

    it('refuses a wrong current password with its own code', async () => {
      verifyPasswordMock.mockResolvedValue(false);

      await expect(service.changePassword(CALLER, dto)).rejects.toMatchObject({
        status: 401,
        response: { errorCode: 'ACCOUNT_CURRENT_PASSWORD_INCORRECT' },
      });
      expect(prisma.user.update).not.toHaveBeenCalled();
    });

    /** An account that never activated has no hash to compare against. */
    it('refuses when there is no stored password at all', async () => {
      prisma.user.findUnique.mockResolvedValue({ passwordHash: null });

      await expect(service.changePassword(CALLER, dto)).rejects.toMatchObject({
        response: { errorCode: 'ACCOUNT_CURRENT_PASSWORD_INCORRECT' },
      });
      expect(verifyPasswordMock).not.toHaveBeenCalled();
    });

    /**
     * **Every other session, keeping this one.** Signing somebody out of the
     * page on which they just changed their password reads as a failure; ending
     * their *other* sessions is the half that matters when they suspect their
     * password is known.
     */
    it('spares the session that presented its refresh token', async () => {
      await service.changePassword(CALLER, dto, 'my-refresh-token');

      expect(auth.revokeSessions).toHaveBeenCalledWith('usr-1', {
        tx: prisma,
        exceptToken: 'my-refresh-token',
      });
    });

    /** Absent means every session goes, which is the safe direction. */
    it('revokes everything when no session is named', async () => {
      await service.changePassword(CALLER, dto);

      expect(auth.revokeSessions).toHaveBeenCalledWith('usr-1', {
        tx: prisma,
        exceptToken: undefined,
      });
    });

    /**
     * An outstanding reset link would otherwise survive this change and let
     * whoever holds it overwrite the password its owner has just chosen — the
     * exact sequence somebody recovering from a compromise must not leave open.
     */
    it('throws away any outstanding reset link', async () => {
      await service.changePassword(CALLER, dto);

      expect(tokens.discard).toHaveBeenCalledWith(
        'usr-1',
        AccountTokenType.PASSWORD_RESET,
        prisma,
      );
    });

    /** The account is always the caller's: no id is read from anywhere else. */
    it('only ever writes the caller’s own account', async () => {
      await service.changePassword(CALLER, dto);

      expect(prisma.user.update).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: CALLER.userId } }),
      );
    });
  });
});
