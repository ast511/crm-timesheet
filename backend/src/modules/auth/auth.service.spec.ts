import { HttpException, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Test, TestingModule } from '@nestjs/testing';

import { ERROR_CODES } from '../../common/constants/error-codes.constants';
import { hashPassword } from '../../common/password/password.hasher';
import { AccountStatus, UserRole } from '../../generated/prisma/enums';
import { PrismaService } from '../../prisma/prisma.service';
import { JWT_KEYS } from './auth.config';
import {
  INVALID_CREDENTIALS_MESSAGE,
  REFRESH_TOKEN_REUSED_MESSAGE,
} from './auth.constants';
import { AuthService } from './auth.service';
import { TokenService } from './token.service';

const PASSWORD = 'correct horse battery staple';
const CLIENT = { userAgent: 'jest', ipAddress: '127.0.0.1' };

/** An `AuthService` with a real `TokenService` and a faked database. */
describe('AuthService', () => {
  let service: AuthService;
  let tokens: TokenService;
  let passwordHash: string;

  const prisma = {
    user: { findUnique: jest.fn() },
    refreshToken: {
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
    },
    $transaction: jest.fn(),
  };

  /** A `users` row as `CREDENTIALS_SELECT` reads it. */
  const account = (overrides: Record<string, unknown> = {}) => ({
    id: 'usr-1',
    email: 'maria.ionescu@company.com',
    role: UserRole.HR,
    status: AccountStatus.ACTIVE,
    passwordHash,
    employee: { id: 'emp-1' },
    ...overrides,
  });

  /** A stored refresh token as `REFRESH_TOKEN_SELECT` reads it. */
  const storedToken = (overrides: Record<string, unknown> = {}) => ({
    id: 'rft-1',
    userId: 'usr-1',
    revokedAt: null,
    replacedById: null,
    expiresAt: new Date(Date.now() + 86_400_000),
    ...overrides,
  });

  const config = {
    getOrThrow: (key: string) =>
      ({
        [JWT_KEYS.accessSecret]: 'access-secret-0123456789abcdefghij',
        [JWT_KEYS.refreshSecret]: 'refresh-secret-0123456789abcdefghij',
        [JWT_KEYS.accessTtl]: 900,
        [JWT_KEYS.refreshTtl]: 604_800,
      })[key],
  } as unknown as ConfigService;

  let moduleRef: TestingModule;

  beforeAll(async () => {
    passwordHash = await hashPassword(PASSWORD);

    // Compiled once rather than per test: `AuthService` hashes its decoy
    // password in the constructor, and re-running that bcrypt for every case
    // would spend seconds proving nothing.
    moduleRef = await Test.createTestingModule({
      providers: [
        AuthService,
        TokenService,
        { provide: PrismaService, useValue: prisma },
        { provide: ConfigService, useValue: config },
        { provide: JwtService, useValue: new JwtService({}) },
      ],
    }).compile();

    service = moduleRef.get(AuthService);
    tokens = moduleRef.get(TokenService);
  });

  afterAll(async () => {
    await moduleRef.close();
  });

  beforeEach(() => {
    jest.clearAllMocks();

    prisma.refreshToken.create.mockResolvedValue({ id: 'rft-new' });
    prisma.refreshToken.updateMany.mockResolvedValue({ count: 1 });
    // The rotation runs inside a transaction; the fake hands the callback the
    // same delegates, so the two writes are exercised rather than skipped.
    prisma.$transaction.mockImplementation(
      (run: (tx: typeof prisma) => Promise<unknown>) => run(prisma),
    );
  });

  describe('login', () => {
    it('issues both tokens and the caller’s own account', async () => {
      prisma.user.findUnique.mockResolvedValue(account());

      const session = await service.login(
        { email: 'maria.ionescu@company.com', password: PASSWORD },
        CLIENT,
      );

      expect(session.tokenType).toBe('Bearer');
      expect(session.expiresIn).toBe(900);
      expect(session.user).toEqual({
        id: 'usr-1',
        email: 'maria.ionescu@company.com',
        role: UserRole.HR,
        employeeId: 'emp-1',
        administrativeAccess: true,
      });
      await expect(tokens.verifyAccessToken(session.accessToken)).resolves.toBe(
        'usr-1',
      );
    });

    /**
     * The hash is an offline oracle: publishing one lets an attacker test
     * guesses at their own pace, and a hit gives them a password people reuse.
     */
    it('never returns the password hash, in any corner of the body', async () => {
      prisma.user.findUnique.mockResolvedValue(account());

      const session = await service.login(
        { email: 'maria.ionescu@company.com', password: PASSWORD },
        CLIENT,
      );

      expect(JSON.stringify(session)).not.toContain(passwordHash);
      expect(JSON.stringify(session)).not.toContain('passwordHash');
    });

    /** Stored as a hash, so a database read hands out no usable session. */
    it('stores a hash of the refresh token rather than the token', async () => {
      prisma.user.findUnique.mockResolvedValue(account());

      const session = await service.login(
        { email: 'maria.ionescu@company.com', password: PASSWORD },
        CLIENT,
      );

      const { data } = prisma.refreshToken.create.mock.calls[0][0] as {
        data: Record<string, unknown>;
      };

      expect(data.tokenHash).toBe(tokens.hash(session.refreshToken));
      expect(JSON.stringify(data)).not.toContain(session.refreshToken);
    });

    it('records what the client said about itself, for an incident later', async () => {
      prisma.user.findUnique.mockResolvedValue(account());

      await service.login(
        { email: 'maria.ionescu@company.com', password: PASSWORD },
        CLIENT,
      );

      const { data } = prisma.refreshToken.create.mock.calls[0][0] as {
        data: Record<string, unknown>;
      };

      expect(data).toMatchObject({ userAgent: 'jest', ipAddress: '127.0.0.1' });
    });

    it('records an absent User-Agent as null rather than as "unknown"', async () => {
      prisma.user.findUnique.mockResolvedValue(account());

      await service.login(
        { email: 'maria.ionescu@company.com', password: PASSWORD },
        {},
      );

      const { data } = prisma.refreshToken.create.mock.calls[0][0] as {
        data: Record<string, unknown>;
      };

      expect(data).toMatchObject({ userAgent: null, ipAddress: null });
    });

    /**
     * **Four** failures as of Feature 036, and they answer identically.
     * Distinguishing them would make this endpoint an oracle for "does this
     * person have an account here" — which, in a company's internal system, is
     * "does this person work here". The fourth is the new one: an account whose
     * owner has never followed their activation link has no password at all, and
     * saying so during an onboarding week would list exactly who has just joined.
     */
    it.each([
      ['an unknown address', null, PASSWORD],
      ['a wrong password', account(), 'not the password'],
      [
        'a deactivated account',
        account({ status: AccountStatus.DISABLED }),
        PASSWORD,
      ],
      [
        'an account that has never been activated',
        account({
          status: AccountStatus.PENDING_ACTIVATION,
          passwordHash: null,
        }),
        PASSWORD,
      ],
    ])('refuses %s with the same generic 401', async (_case, row, password) => {
      prisma.user.findUnique.mockResolvedValue(row);

      await expect(
        service.login({ email: 'maria.ionescu@company.com', password }, CLIENT),
      ).rejects.toThrow(INVALID_CREDENTIALS_MESSAGE);

      expect(prisma.refreshToken.create).not.toHaveBeenCalled();
    });

    /**
     * The null hash falls through to the decoy rather than short-circuiting, so
     * a never-activated account costs what every other refusal costs. That is a
     * *timing* property and this file deliberately does not assert it: the
     * argument is on `AuthService.login`, and the test below — which measures the
     * decoy path for an unknown address — is as close as a test suite can come to
     * it without becoming flaky on a loaded machine.
     */

    /**
     * Generic wording is not enough on its own — the two paths have to *cost*
     * the same. Without the decoy hash an unknown address answers in the time a
     * failed index lookup takes and a wrong password in the ~250 ms a bcrypt
     * comparison takes, and that difference survives network noise.
     *
     * Asserted as a ratio rather than an absolute, because a CI runner's
     * absolute timings mean nothing; what matters is that neither path is an
     * order of magnitude faster than the other.
     */
    it('takes comparable time for an unknown address and a wrong password', async () => {
      const timeOf = async (row: unknown): Promise<number> => {
        prisma.user.findUnique.mockResolvedValue(row);
        const started = process.hrtime.bigint();

        await service
          .login(
            { email: 'maria.ionescu@company.com', password: 'wrong' },
            CLIENT,
          )
          .catch(() => undefined);

        return Number(process.hrtime.bigint() - started);
      };

      const unknownAddress = await timeOf(null);
      const wrongPassword = await timeOf(account());

      expect(unknownAddress / wrongPassword).toBeGreaterThan(0.2);
      expect(unknownAddress / wrongPassword).toBeLessThan(5);
    });
  });

  describe('refresh', () => {
    /** Issues a token and tells the fake database to recognise it. */
    const liveSession = async (
      overrides: Record<string, unknown> = {},
    ): Promise<string> => {
      const { token } = await tokens.issueRefreshToken('usr-1');

      prisma.refreshToken.findUnique.mockResolvedValue(storedToken(overrides));
      prisma.user.findUnique.mockResolvedValue(account());

      return token;
    };

    it('issues a new pair and spends the one presented', async () => {
      const presented = await liveSession();

      const session = await service.refresh(presented, CLIENT);

      expect(session.refreshToken).not.toBe(presented);
      await expect(tokens.verifyAccessToken(session.accessToken)).resolves.toBe(
        'usr-1',
      );

      // The successor is created first and the old row then points at it, so
      // the chain a reuse detection walks is always complete.
      expect(prisma.refreshToken.update).toHaveBeenCalledWith({
        where: { id: 'rft-1' },
        data: {
          revokedAt: expect.any(Date) as Date,
          replacedById: 'rft-new',
        },
      });
    });

    /**
     * Both writes are one fact about one session. A run where the first
     * succeeded and the second failed would leave a client holding a token the
     * server had already invalidated, with no replacement — a silent logout that
     * only happens under load.
     */
    it('rotates inside a transaction', async () => {
      await service.refresh(await liveSession(), CLIENT);

      expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    });

    it('refuses a token no row matches', async () => {
      const { token } = await tokens.issueRefreshToken('usr-1');

      prisma.refreshToken.findUnique.mockResolvedValue(null);

      await expect(service.refresh(token, CLIENT)).rejects.toThrow(
        UnauthorizedException,
      );
    });

    /** The row is the authority; a signature that verifies is only the gate. */
    it('refuses a token whose row belongs to somebody else', async () => {
      const { token } = await tokens.issueRefreshToken('usr-1');

      prisma.refreshToken.findUnique.mockResolvedValue(
        storedToken({ userId: 'usr-2' }),
      );

      await expect(service.refresh(token, CLIENT)).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('refuses a revoked token', async () => {
      const presented = await liveSession({ revokedAt: new Date() });

      await expect(service.refresh(presented, CLIENT)).rejects.toThrow(
        UnauthorizedException,
      );
      expect(prisma.refreshToken.update).not.toHaveBeenCalled();
    });

    it('refuses an expired token', async () => {
      const presented = await liveSession({
        expiresAt: new Date(Date.now() - 1000),
      });

      await expect(service.refresh(presented, CLIENT)).rejects.toThrow(
        UnauthorizedException,
      );
    });

    /**
     * A refresh token is good exactly once, so a request presenting one that
     * already has a successor is not a client retrying — the legitimate holder
     * moved on to the successor. It is a second party holding a copy taken
     * before it was used, and the application cannot tell which of the two is
     * the thief.
     */
    describe('when a spent token comes back', () => {
      const reused = async (): Promise<string> => {
        const { token } = await tokens.issueRefreshToken('usr-1');

        prisma.refreshToken.findUnique.mockResolvedValue(
          storedToken({ replacedById: 'rft-2', revokedAt: new Date() }),
        );

        return token;
      };

      it('revokes every live session the account has', async () => {
        await service.refresh(await reused(), CLIENT).catch(() => undefined);

        expect(prisma.refreshToken.updateMany).toHaveBeenCalledWith({
          where: { userId: 'usr-1', revokedAt: null },
          data: { revokedAt: expect.any(Date) as Date },
        });
      });

      /**
       * The one authentication failure in this module that is deliberately not
       * generic: the caller has just lost every session and cannot recover by
       * refreshing, and telling them reveals nothing — they are holding the
       * token.
       */
      it('says so, rather than answering like an ordinary expiry', async () => {
        await expect(service.refresh(await reused(), CLIENT)).rejects.toThrow(
          REFRESH_TOKEN_REUSED_MESSAGE,
        );
      });

      it('issues nothing', async () => {
        await service.refresh(await reused(), CLIENT).catch(() => undefined);

        expect(prisma.refreshToken.create).not.toHaveBeenCalled();
      });
    });

    /**
     * The outer bound on how long a stateless access token can outlive its
     * account: a user deactivated an hour ago refreshes into a `401`.
     */
    it('refuses a refresh for an account deactivated since it logged in', async () => {
      const presented = await liveSession();

      prisma.user.findUnique.mockResolvedValue(
        account({ status: AccountStatus.DISABLED }),
      );

      await expect(service.refresh(presented, CLIENT)).rejects.toThrow(
        UnauthorizedException,
      );
      expect(prisma.refreshToken.create).not.toHaveBeenCalled();
    });

    /** A refresh *is* a new session, so a role changed since login comes back. */
    it('reports the role the account holds now, not the one it logged in with', async () => {
      const presented = await liveSession();

      prisma.user.findUnique.mockResolvedValue(
        account({ role: UserRole.USER }),
      );

      const session = await service.refresh(presented, CLIENT);

      expect(session.user.role).toBe(UserRole.USER);
      expect(session.user.administrativeAccess).toBe(false);
    });
  });

  describe('logout', () => {
    const caller = {
      userId: 'usr-1',
      employeeId: 'emp-1',
      role: UserRole.HR,
      administrativeAccess: true,
    };

    it('revokes the token presented, scoped to the caller', async () => {
      const { token } = await tokens.issueRefreshToken('usr-1');

      await service.logout(caller, token);

      expect(prisma.refreshToken.updateMany).toHaveBeenCalledWith({
        where: {
          tokenHash: tokens.hash(token),
          userId: 'usr-1',
          revokedAt: null,
        },
        data: { revokedAt: expect.any(Date) as Date },
      });
    });

    /**
     * Silent about what it found: a token that does not exist, belongs to
     * somebody else, or was revoked an hour ago all end the same way. A `404`
     * for "not yours" would turn logout into a way to test whether a token
     * belongs to another account.
     */
    it('succeeds even when it revoked nothing', async () => {
      prisma.refreshToken.updateMany.mockResolvedValue({ count: 0 });

      await expect(service.logout(caller, 'a-token')).resolves.toBeUndefined();
    });
  });

  describe('authenticate', () => {
    it('resolves the caller the identity seam expects', async () => {
      prisma.user.findUnique.mockResolvedValue(account());

      const token = await tokens.issueAccessToken('usr-1');

      await expect(service.authenticate(token)).resolves.toEqual({
        userId: 'usr-1',
        employeeId: 'emp-1',
        role: UserRole.HR,
        administrativeAccess: true,
      });
    });

    /**
     * Derived from the role that was just read from `users`, never from
     * anything the caller supplied — the property `resolveCurrentUser` has held
     * since Feature 026, now resting on a database row instead of a header.
     */
    it('derives administrativeAccess from the role in the database', async () => {
      prisma.user.findUnique.mockResolvedValue(
        account({ role: UserRole.USER }),
      );

      const token = await tokens.issueAccessToken('usr-1');

      await expect(service.authenticate(token)).resolves.toMatchObject({
        role: UserRole.USER,
        administrativeAccess: false,
      });
    });

    it('carries a null employee for an account with no employment record', async () => {
      prisma.user.findUnique.mockResolvedValue(account({ employee: null }));

      const token = await tokens.issueAccessToken('usr-1');

      await expect(service.authenticate(token)).resolves.toMatchObject({
        employeeId: null,
      });
    });

    /**
     * The reason the token carries no role: the account is read fresh on every
     * request, so a deactivation takes effect immediately rather than when the
     * token happens to expire.
     */
    it('refuses a valid token for a deactivated account', async () => {
      prisma.user.findUnique.mockResolvedValue(
        account({ status: AccountStatus.DISABLED }),
      );

      const token = await tokens.issueAccessToken('usr-1');

      await expect(service.authenticate(token)).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('refuses a valid token for an account that has been deleted', async () => {
      prisma.user.findUnique.mockResolvedValue(null);

      const token = await tokens.issueAccessToken('usr-1');

      await expect(service.authenticate(token)).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('reads the role fresh, so a change takes effect on the next request', async () => {
      const token = await tokens.issueAccessToken('usr-1');

      prisma.user.findUnique.mockResolvedValue(account());
      await expect(service.authenticate(token)).resolves.toMatchObject({
        role: UserRole.HR,
      });

      prisma.user.findUnique.mockResolvedValue(
        account({ role: UserRole.USER }),
      );
      await expect(service.authenticate(token)).resolves.toMatchObject({
        role: UserRole.USER,
      });
    });

    /** The hash is not even read out of PostgreSQL on this path. */
    it('does not select the password hash on the per-request path', async () => {
      prisma.user.findUnique.mockResolvedValue(account());

      await service.authenticate(await tokens.issueAccessToken('usr-1'));

      const { select } = prisma.user.findUnique.mock.calls[0][0] as {
        select: Record<string, unknown>;
      };

      expect(select.passwordHash).toBeUndefined();
    });
  });

  describe('describeSelf', () => {
    it('answers with the account as it stands now', async () => {
      prisma.user.findUnique.mockResolvedValue(account());

      await expect(
        service.describeSelf({
          userId: 'usr-1',
          employeeId: 'emp-1',
          role: UserRole.HR,
          administrativeAccess: true,
        }),
      ).resolves.toEqual({
        id: 'usr-1',
        email: 'maria.ionescu@company.com',
        role: UserRole.HR,
        employeeId: 'emp-1',
        administrativeAccess: true,
      });
    });
  });

  /**
   * The stable codes this module attaches to its failures (Feature 033).
   *
   * Asserted here rather than through a request, because what matters is which
   * *branch* produced which code — and several of these branches are reachable
   * only by arranging a state a routing spec cannot: a spent refresh token, an
   * account deactivated between login and refresh.
   */
  describe('error codes', () => {
    /** The code an operation rejects with, or `undefined`. */
    const codeOf = async (run: Promise<unknown>): Promise<unknown> => {
      try {
        await run;
      } catch (error) {
        const payload = (error as HttpException).getResponse();

        return (payload as { errorCode?: unknown }).errorCode;
      }

      return undefined;
    };

    /**
     * **The no-enumeration rule, restated as a code.** Three different causes,
     * one code — because a distinct code for a deactivated account would confirm
     * both that the address exists and that the password was right, undoing
     * Feature 032's property from the one place nobody would think to look.
     */
    it.each([
      ['an unknown address', null, PASSWORD],
      ['a wrong password', account(), 'not the password'],
      [
        'a deactivated account',
        account({ status: AccountStatus.DISABLED }),
        PASSWORD,
      ],
    ])(
      'answers %s with AUTH_INVALID_CREDENTIALS',
      async (_c, row, password) => {
        prisma.user.findUnique.mockResolvedValue(row);

        await expect(
          codeOf(
            service.login(
              { email: 'maria.ionescu@company.com', password },
              CLIENT,
            ),
          ),
        ).resolves.toBe(ERROR_CODES.AUTH_INVALID_CREDENTIALS);
      },
    );

    it('never distinguishes a deactivated account at login', async () => {
      const codes: unknown[] = [];

      for (const row of [null, account({ status: AccountStatus.DISABLED })]) {
        prisma.user.findUnique.mockResolvedValue(row);

        codes.push(
          await codeOf(
            service.login(
              { email: 'maria.ionescu@company.com', password: PASSWORD },
              CLIENT,
            ),
          ),
        );
      }

      expect(new Set(codes).size).toBe(1);
    });

    /**
     * Where login must stay generic, refresh may be specific: the caller has
     * already presented a signed token naming this account, so they either own
     * it or already stole a credential for it. What it buys is a frontend that
     * says "your account has been deactivated" instead of sending somebody into
     * a login loop that will also fail.
     */
    it('answers a refresh by a deactivated account with AUTH_INACTIVE_USER', async () => {
      const { token } = await tokens.issueRefreshToken('usr-1');

      prisma.refreshToken.findUnique.mockResolvedValue(storedToken());
      prisma.user.findUnique.mockResolvedValue(
        account({ status: AccountStatus.DISABLED }),
      );

      await expect(codeOf(service.refresh(token, CLIENT))).resolves.toBe(
        ERROR_CODES.AUTH_INACTIVE_USER,
      );
    });

    it('answers an authenticated request by a deactivated account the same way', async () => {
      prisma.user.findUnique.mockResolvedValue(
        account({ status: AccountStatus.DISABLED }),
      );

      await expect(
        codeOf(service.authenticate(await tokens.issueAccessToken('usr-1'))),
      ).resolves.toBe(ERROR_CODES.AUTH_INACTIVE_USER);
    });

    it.each([
      [
        'no row matches',
        () => prisma.refreshToken.findUnique.mockResolvedValue(null),
      ],
      [
        'the row belongs to somebody else',
        () =>
          prisma.refreshToken.findUnique.mockResolvedValue(
            storedToken({ userId: 'usr-2' }),
          ),
      ],
      [
        'the token was revoked',
        () =>
          prisma.refreshToken.findUnique.mockResolvedValue(
            storedToken({ revokedAt: new Date() }),
          ),
      ],
      [
        'the token expired',
        () =>
          prisma.refreshToken.findUnique.mockResolvedValue(
            storedToken({ expiresAt: new Date(Date.now() - 1000) }),
          ),
      ],
      [
        'the account has been deleted',
        () => {
          prisma.refreshToken.findUnique.mockResolvedValue(storedToken());
          prisma.user.findUnique.mockResolvedValue(null);
        },
      ],
    ])('answers AUTH_REFRESH_TOKEN_INVALID when %s', async (_case, arrange) => {
      const { token } = await tokens.issueRefreshToken('usr-1');

      arrange();

      await expect(codeOf(service.refresh(token, CLIENT))).resolves.toBe(
        ERROR_CODES.AUTH_REFRESH_TOKEN_INVALID,
      );
    });

    it('answers a malformed refresh token with AUTH_REFRESH_TOKEN_INVALID', async () => {
      await expect(
        codeOf(service.refresh('not-a-token', CLIENT)),
      ).resolves.toBe(ERROR_CODES.AUTH_REFRESH_TOKEN_INVALID);
    });

    /** Its own code, because the user-facing sentence is a different one. */
    it('answers a spent refresh token with AUTH_REFRESH_TOKEN_REUSED', async () => {
      const { token } = await tokens.issueRefreshToken('usr-1');

      prisma.refreshToken.findUnique.mockResolvedValue(
        storedToken({ replacedById: 'rft-2', revokedAt: new Date() }),
      );

      await expect(codeOf(service.refresh(token, CLIENT))).resolves.toBe(
        ERROR_CODES.AUTH_REFRESH_TOKEN_REUSED,
      );
    });

    it('answers a bad access token with AUTH_UNAUTHENTICATED', async () => {
      await expect(codeOf(service.authenticate('forged'))).resolves.toBe(
        ERROR_CODES.AUTH_UNAUTHENTICATED,
      );
    });

    /** A code never replaces the message: logs and old clients are unchanged. */
    it('keeps the English message beside every code', async () => {
      prisma.user.findUnique.mockResolvedValue(null);

      await expect(
        service.login(
          { email: 'maria.ionescu@company.com', password: PASSWORD },
          CLIENT,
        ),
      ).rejects.toThrow(INVALID_CREDENTIALS_MESSAGE);
    });
  });
});
