import { BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash } from 'crypto';
import { Test, TestingModule } from '@nestjs/testing';

import { AccountTokenType } from '../../generated/prisma/enums';
import { PrismaService } from '../../prisma/prisma.service';
import { AccountTokenService } from './account-token.service';
import { ACCOUNT_LIFECYCLE_KEYS } from './account-lifecycle.config';

/**
 * The link mechanism itself: one implementation, two purposes.
 *
 * What is worth pinning here is everything that makes a link *safe* rather than
 * merely functional — the raw value is never stored, only one link of a kind can
 * exist at a time, a used one cannot be used again, and every way of being
 * invalid produces one indistinguishable refusal.
 */

const ACTIVATION_TTL = 259_200;
const RESET_TTL = 3600;

const sha256 = (value: string) =>
  createHash('sha256').update(value).digest('hex');

describe('AccountTokenService', () => {
  let service: AccountTokenService;
  let prisma: {
    accountToken: {
      upsert: jest.Mock;
      findUnique: jest.Mock;
      updateMany: jest.Mock;
      deleteMany: jest.Mock;
    };
  };

  beforeEach(async () => {
    prisma = {
      accountToken: {
        upsert: jest.fn().mockResolvedValue({ id: 'tok-1' }),
        findUnique: jest.fn(),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
      },
    };

    const config = {
      getOrThrow: jest.fn((key: string) => {
        const values: Record<string, string | number> = {
          [ACCOUNT_LIFECYCLE_KEYS.webUrl]: 'https://hr.example.com',
          [ACCOUNT_LIFECYCLE_KEYS.activationTtl]: ACTIVATION_TTL,
          [ACCOUNT_LIFECYCLE_KEYS.passwordResetTtl]: RESET_TTL,
        };

        return values[key];
      }),
    };

    const moduleRef: TestingModule = await Test.createTestingModule({
      providers: [
        AccountTokenService,
        { provide: PrismaService, useValue: prisma },
        { provide: ConfigService, useValue: config },
      ],
    }).compile();

    service = moduleRef.get(AccountTokenService);
  });

  describe('issue', () => {
    /**
     * **The single most important assertion in this file.** A stored raw token
     * would mean a database dump, a backup or a careless `SELECT *` handed out
     * the ability to set the password of every account with an outstanding link
     * — which, just after an onboarding batch, is every new joiner at once.
     */
    it('stores a SHA-256 of the token and never the token', async () => {
      const { token } = await service.issue(
        'usr-1',
        AccountTokenType.ACTIVATION,
      );

      const [{ create, update }] = prisma.accountToken.upsert.mock.calls[0] as [
        { create: { tokenHash: string }; update: { tokenHash: string } },
      ];

      expect(create.tokenHash).toBe(sha256(token));
      expect(update.tokenHash).toBe(sha256(token));
      expect(
        JSON.stringify(prisma.accountToken.upsert.mock.calls),
      ).not.toContain(token);
    });

    /** 32 bytes of CSPRNG, base64url — URL-safe and needing no escaping. */
    it('issues an unguessable, URL-safe secret', async () => {
      const { token } = await service.issue(
        'usr-1',
        AccountTokenType.ACTIVATION,
      );

      expect(token).toHaveLength(43);
      expect(token).toMatch(/^[A-Za-z0-9_-]+$/);
    });

    it('never issues the same secret twice', async () => {
      const first = await service.issue('usr-1', AccountTokenType.ACTIVATION);
      const second = await service.issue('usr-1', AccountTokenType.ACTIVATION);

      expect(first.token).not.toBe(second.token);
    });

    /**
     * The invalidation rule, held by the unique `(user, type)` pair rather than
     * by remembering to revoke: an upsert *overwrites*, so the previous secret
     * stops matching the moment the new one is written — and `usedAt` is reset,
     * because the new link has not been followed.
     */
    it('upserts on the user and purpose, so only one link is ever live', async () => {
      await service.issue('usr-1', AccountTokenType.ACTIVATION);

      const [call] = prisma.accountToken.upsert.mock.calls[0] as [
        {
          where: { userId_type: { userId: string; type: string } };
          update: { usedAt: null };
        },
      ];

      expect(call.where.userId_type).toEqual({
        userId: 'usr-1',
        type: AccountTokenType.ACTIVATION,
      });
      expect(call.update.usedAt).toBeNull();
    });

    /**
     * The two purposes get different lifetimes because they are different
     * situations: an invitation may sit over a weekend, a reset is answered
     * within minutes.
     */
    it.each([
      [AccountTokenType.ACTIVATION, ACTIVATION_TTL],
      [AccountTokenType.PASSWORD_RESET, RESET_TTL],
    ])('gives %s its configured lifetime', async (type, ttl) => {
      const before = Date.now();
      const { expiresAt } = await service.issue('usr-1', type);

      expect(expiresAt.getTime()).toBeGreaterThanOrEqual(before + ttl * 1000);
      expect(expiresAt.getTime()).toBeLessThanOrEqual(
        Date.now() + ttl * 1000 + 1000,
      );
    });

    /** Given a transaction it writes through it, so the account and its
     * invitation are one unit. */
    it('writes through a supplied transaction', async () => {
      const tx = {
        accountToken: { upsert: jest.fn().mockResolvedValue({ id: 'tok-1' }) },
      };

      await service.issue(
        'usr-1',
        AccountTokenType.ACTIVATION,
        tx as unknown as Parameters<typeof service.issue>[2],
      );

      expect(tx.accountToken.upsert).toHaveBeenCalled();
      expect(prisma.accountToken.upsert).not.toHaveBeenCalled();
    });
  });

  describe('resolve', () => {
    const stored = (overrides: Record<string, unknown> = {}) => ({
      userId: 'usr-1',
      type: AccountTokenType.ACTIVATION,
      expiresAt: new Date(Date.now() + 60_000),
      usedAt: null,
      ...overrides,
    });

    it('finds the account by the hash of what was presented', async () => {
      prisma.accountToken.findUnique.mockResolvedValue(stored());

      await expect(
        service.resolve('a-token', AccountTokenType.ACTIVATION),
      ).resolves.toBe('usr-1');

      expect(prisma.accountToken.findUnique).toHaveBeenCalledWith(
        expect.objectContaining({ where: { tokenHash: sha256('a-token') } }),
      );
    });

    it('does not consume the token — that happens with the password write', async () => {
      prisma.accountToken.findUnique.mockResolvedValue(stored());

      await service.resolve('a-token', AccountTokenType.ACTIVATION);

      expect(prisma.accountToken.updateMany).not.toHaveBeenCalled();
    });

    /**
     * **Four ways to be invalid, one refusal.** These endpoints are public, so
     * the caller may be anybody: telling them "expired" rather than "no such
     * token" would confirm which of their guesses name real links.
     */
    it.each([
      ['an unknown token', null],
      ['an expired one', stored({ expiresAt: new Date(Date.now() - 1000) })],
      ['one already followed', stored({ usedAt: new Date() })],
      [
        'one of the other purpose',
        stored({ type: AccountTokenType.PASSWORD_RESET }),
      ],
    ])('refuses %s identically', async (_case, row) => {
      prisma.accountToken.findUnique.mockResolvedValue(row);

      await expect(
        service.resolve('a-token', AccountTokenType.ACTIVATION),
      ).rejects.toMatchObject({
        // A `400`, not a `401`: the token is a body parameter proving email
        // receipt, not a credential. See `invalidAccountToken`.
        status: 400,
        response: {
          errorCode: 'ACCOUNT_TOKEN_INVALID',
          message: 'This link is no longer valid; please request a new one',
          params: { purpose: AccountTokenType.ACTIVATION },
        },
      });
    });
  });

  describe('consume', () => {
    const tx = () => ({
      accountToken: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
    });

    /**
     * The single-use guarantee is the `usedAt: null` in the `where`, and it is a
     * condition rather than a check on purpose: two requests presenting one link
     * at the same moment both pass `resolve`, and only one of them updates a row
     * here.
     */
    it('marks the link used only while it is unused', async () => {
      const client = tx();

      await service.consume(
        'usr-1',
        AccountTokenType.ACTIVATION,
        client as unknown as Parameters<typeof service.consume>[2],
      );

      expect(client.accountToken.updateMany).toHaveBeenCalledWith({
        where: {
          userId: 'usr-1',
          type: AccountTokenType.ACTIVATION,
          usedAt: null,
        },
        data: { usedAt: expect.any(Date) as unknown as Date },
      });
    });

    it('refuses when the race was lost and no row matched', async () => {
      const client = {
        accountToken: { updateMany: jest.fn().mockResolvedValue({ count: 0 }) },
      };

      await expect(
        service.consume(
          'usr-1',
          AccountTokenType.ACTIVATION,
          client as unknown as Parameters<typeof service.consume>[2],
        ),
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  /**
   * Throwing away outstanding links of one kind — what stops a forgotten reset
   * link being followed later to overwrite a password its owner has just chosen.
   */
  it('discards every link of a purpose', async () => {
    await service.discard('usr-1', AccountTokenType.PASSWORD_RESET);

    expect(prisma.accountToken.deleteMany).toHaveBeenCalledWith({
      where: { userId: 'usr-1', type: AccountTokenType.PASSWORD_RESET },
    });
  });
});
