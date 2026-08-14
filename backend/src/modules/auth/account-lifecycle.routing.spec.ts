import {
  INestApplication,
  ValidationPipe,
  VersioningType,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { createHash } from 'crypto';
import { Test, TestingModule } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import request from 'supertest';

import { AllExceptionsFilter } from '../../common/filters/all-exceptions.filter';
import { ResponseInterceptor } from '../../common/interceptors/response.interceptor';
import {
  API_DEFAULT_VERSION,
  API_PREFIX,
  API_VERSION_PREFIX,
} from '../../config/api.constants';
import { verifyPassword } from '../../common/password/password.hasher';
import {
  AccountStatus,
  AccountTokenType,
  UserRole,
} from '../../generated/prisma/enums';
import { PrismaService } from '../../prisma/prisma.service';
import { EmailService } from '../email/email.service';
import { AccountEmailService } from './account-email.service';
import { ACCOUNT_LIFECYCLE_KEYS } from './account-lifecycle.config';
import { AccountPasswordService } from './account-password.service';
import { AccountTokenService } from './account-token.service';
import { PASSWORD_RESET_REQUESTED_MESSAGE } from './auth.constants';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { JwtAuthGuard } from './jwt-auth.guard';
import { DEFAULT_REFRESH_COOKIE_NAME } from './refresh-cookie.config';
import { RefreshTokenCookie } from './refresh-token.cookie';
import { TestAuthentication } from './testing/authentication.testing';

const BASE = `/${API_PREFIX}/${API_VERSION_PREFIX}${API_DEFAULT_VERSION}`;

const WEB_URL = 'https://hr.example.com';

/**
 * Onboarding and recovery end to end: real routes, the **real token mechanism**,
 * the real password hashing, and a fake mailer that keeps what it was asked to
 * send.
 *
 * Only the database and SMTP are substituted. That is deliberate — the claims
 * this feature rests on are all about what actually happens to a secret between
 * the link being minted and the password being stored, and a stubbed token
 * service would assert that a mock was called. In particular this file is where
 * "the raw token exists only in the email" and "a used link stops working" are
 * demonstrated rather than described.
 *
 * `bcryptjs` is **not** mocked here, for the same reason: the last assertion of
 * the activation flow is that the password the person typed verifies against the
 * hash that was stored, and mocking the hasher would make that vacuous. It costs
 * a few hundred milliseconds per activation, paid by a handful of tests.
 */

/** A minimal in-memory stand-in for the two tables this flow touches. */
class FakeDatabase {
  readonly users = new Map<string, Record<string, unknown>>();
  readonly tokens = new Map<string, Record<string, unknown>>();
  readonly revoked: { userId: string; exceptToken?: string }[] = [];

  addUser(user: Record<string, unknown>): void {
    this.users.set(user.id as string, user);
  }

  /** The row a user id names, or `undefined`. */
  user(id: string): Record<string, unknown> | undefined {
    return this.users.get(id);
  }

  /** The stored token row for one account and purpose. */
  tokenFor(userId: string, type: AccountTokenType) {
    return this.tokens.get(`${userId}:${type}`);
  }
}

/** What `EmailService.send` was handed, so a test can read the link out. */
interface SentEmail {
  to: string;
  subject: string;
  html: string;
  text?: string;
}

describe('account lifecycle routing', () => {
  let app: INestApplication;
  let db: FakeDatabase;
  let sent: SentEmail[];

  const auth = new TestAuthentication();

  /** Pulls the `?token=` out of whatever was emailed last. */
  const lastLink = (): string => {
    const email = sent.at(-1);

    if (email === undefined) {
      throw new Error('No email was sent');
    }

    const match = /token=([A-Za-z0-9_-]+)/.exec(email.text ?? email.html);

    if (match === null) {
      throw new Error('The email carried no link');
    }

    return match[1];
  };

  beforeEach(async () => {
    db = new FakeDatabase();
    sent = [];

    const prisma = {
      user: {
        findUnique: jest.fn(
          ({ where }: { where: { id?: string; email?: string } }) => {
            const row =
              where.id !== undefined
                ? db.user(where.id)
                : [...db.users.values()].find((u) => u.email === where.email);

            return Promise.resolve(row ?? null);
          },
        ),
        update: jest.fn(
          ({
            where,
            data,
          }: {
            where: { id: string };
            data: Record<string, unknown>;
          }) => {
            Object.assign(db.user(where.id) ?? {}, data);

            return Promise.resolve(db.user(where.id));
          },
        ),
        updateMany: jest.fn(
          ({
            where,
            data,
          }: {
            where: { id: string; status?: AccountStatus };
            data: Record<string, unknown>;
          }) => {
            const row = db.user(where.id);
            const matches =
              row !== undefined &&
              (where.status === undefined || row.status === where.status);

            if (matches) {
              Object.assign(row, data);
            }

            return Promise.resolve({ count: matches ? 1 : 0 });
          },
        ),
      },
      accountToken: {
        upsert: jest.fn(
          ({
            where,
            create,
          }: {
            where: { userId_type: { userId: string; type: AccountTokenType } };
            create: Record<string, unknown>;
          }) => {
            const { userId, type } = where.userId_type;
            db.tokens.set(`${userId}:${type}`, { ...create, usedAt: null });

            return Promise.resolve({ id: 'tok' });
          },
        ),
        findUnique: jest.fn(({ where }: { where: { tokenHash: string } }) =>
          Promise.resolve(
            [...db.tokens.values()].find(
              (row) => row.tokenHash === where.tokenHash,
            ) ?? null,
          ),
        ),
        updateMany: jest.fn(
          ({
            where,
          }: {
            where: { userId: string; type: AccountTokenType; usedAt: null };
          }) => {
            const row = db.tokenFor(where.userId, where.type);

            if (row === undefined || row.usedAt !== null) {
              return Promise.resolve({ count: 0 });
            }

            row.usedAt = new Date();

            return Promise.resolve({ count: 1 });
          },
        ),
        deleteMany: jest.fn(
          ({
            where,
          }: {
            where: { userId: string; type: AccountTokenType };
          }) => {
            db.tokens.delete(`${where.userId}:${where.type}`);

            return Promise.resolve({ count: 1 });
          },
        ),
      },
      // Annotated, because the callback hands back `prisma` itself and TypeScript
      // cannot infer a type that refers to the object being defined.
      $transaction: jest.fn(
        (run: (tx: unknown) => Promise<unknown>): Promise<unknown> =>
          run(prisma),
      ),
    };

    const config = {
      getOrThrow: jest.fn((key: string) => {
        const values: Record<string, string | number> = {
          [ACCOUNT_LIFECYCLE_KEYS.webUrl]: WEB_URL,
          [ACCOUNT_LIFECYCLE_KEYS.activationTtl]: 259_200,
          [ACCOUNT_LIFECYCLE_KEYS.passwordResetTtl]: 3600,
        };

        return values[key];
      }),
      // Everything `RefreshTokenCookie` reads is optional, so a stub that knows
      // nothing gives it the defaults — which is what this spec wants: the
      // cookie it sends below is the one a deployment that configured nothing
      // would receive.
      get: jest.fn(() => undefined),
    };

    const authService = {
      // The one method this feature borrows from sessions. Recorded rather than
      // performed: what it *does* is `auth.service.spec.ts`'s.
      revokeSessions: jest.fn(
        (userId: string, options?: { exceptToken?: string }) => {
          db.revoked.push({ userId, exceptToken: options?.exceptToken });

          return Promise.resolve(1);
        },
      ),
      ...auth.stub,
    };

    const moduleRef: TestingModule = await Test.createTestingModule({
      controllers: [AuthController],
      providers: [
        AccountPasswordService,
        AccountTokenService,
        AccountEmailService,
        { provide: PrismaService, useValue: prisma },
        { provide: ConfigService, useValue: config },
        {
          provide: EmailService,
          useValue: {
            send: jest.fn((message: SentEmail) => {
              sent.push(message);

              return Promise.resolve();
            }),
          },
        },
        { provide: AuthService, useValue: authService },
        RefreshTokenCookie,
        { provide: APP_GUARD, useClass: JwtAuthGuard },
      ],
    }).compile();

    app = moduleRef.createNestApplication();
    // `configureApp` registers this globally (Feature 040); change-password
    // reads the session to spare out of the refresh cookie.
    app.use(cookieParser());
    app.setGlobalPrefix(API_PREFIX);
    app.enableVersioning({
      type: VersioningType.URI,
      prefix: API_VERSION_PREFIX,
      defaultVersion: API_DEFAULT_VERSION,
    });
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    app.useGlobalInterceptors(new ResponseInterceptor());
    app.useGlobalFilters(new AllExceptionsFilter());

    await app.init();
  });

  afterEach(async () => {
    await app.close();
  });

  /** An account in whatever state a test needs, with its link already issued. */
  const givenAccount = async (
    status: AccountStatus,
    passwordHash: string | null = null,
  ) => {
    db.addUser({
      id: 'usr-1',
      email: 'ana.pop@example.com',
      username: 'APO',
      role: UserRole.USER,
      status,
      passwordHash,
    });
  };

  const issueLink = async (type: AccountTokenType) =>
    app.get(AccountTokenService).issue('usr-1', type);

  describe('activation', () => {
    beforeEach(async () => {
      await givenAccount(AccountStatus.PENDING_ACTIVATION);
    });

    /**
     * The whole onboarding claim, in one test: the account had no password, the
     * link set one, and the password that now verifies is the one the *person*
     * typed — which nobody else, including whoever created the account, has ever
     * seen.
     */
    it('sets the first password and turns the account on', async () => {
      const { token } = await issueLink(AccountTokenType.ACTIVATION);

      await request(app.getHttpServer())
        .post(`${BASE}/auth/activate`)
        .send({ token, password: 'the one they chose' })
        .expect(200);

      const account = db.user('usr-1');

      expect(account?.status).toBe(AccountStatus.ACTIVE);
      await expect(
        verifyPassword('the one they chose', account?.passwordHash as string),
      ).resolves.toBe(true);
    });

    /** `@Public()`: somebody with no password cannot authenticate to get one. */
    it('needs no access token of its own', async () => {
      const { token } = await issueLink(AccountTokenType.ACTIVATION);

      await request(app.getHttpServer())
        .post(`${BASE}/auth/activate`)
        .send({ token, password: 'the one they chose' })
        .expect(200);
    });

    /**
     * Single use. The link travels through a mailbox and stays there; without
     * this, anybody who later read that mailbox could set the password again.
     */
    it('refuses the same link a second time', async () => {
      const { token } = await issueLink(AccountTokenType.ACTIVATION);
      const body = { token, password: 'the one they chose' };

      await request(app.getHttpServer())
        .post(`${BASE}/auth/activate`)
        .send(body)
        .expect(200);

      const response = await request(app.getHttpServer())
        .post(`${BASE}/auth/activate`)
        .send(body)
        // A `400`: the token is a body parameter proving the person received an
        // email, not a credential, and this route has no session to
        // authenticate. See `invalidAccountToken`.
        .expect(400);

      expect(response.body.errorCode).toBe('ACCOUNT_TOKEN_INVALID');
    });

    /** Issuing a new link invalidates the previous one — only one is ever live. */
    it('kills the previous link when a new one is issued', async () => {
      const first = await issueLink(AccountTokenType.ACTIVATION);
      const second = await issueLink(AccountTokenType.ACTIVATION);

      await request(app.getHttpServer())
        .post(`${BASE}/auth/activate`)
        .send({ token: first.token, password: 'the one they chose' })
        .expect(400);

      await request(app.getHttpServer())
        .post(`${BASE}/auth/activate`)
        .send({ token: second.token, password: 'the one they chose' })
        .expect(200);
    });

    it('refuses an expired link', async () => {
      const { token } = await issueLink(AccountTokenType.ACTIVATION);
      const stored = db.tokenFor('usr-1', AccountTokenType.ACTIVATION);

      if (stored !== undefined) {
        stored.expiresAt = new Date(Date.now() - 1000);
      }

      await request(app.getHttpServer())
        .post(`${BASE}/auth/activate`)
        .send({ token, password: 'the one they chose' })
        .expect(400);
    });

    it('refuses a token that was never issued', async () => {
      await request(app.getHttpServer())
        .post(`${BASE}/auth/activate`)
        .send({ token: 'B'.repeat(43), password: 'the one they chose' })
        .expect(400);
    });

    /**
     * A reset link is not an activation link. The purposes share a mechanism and
     * are not interchangeable — the `type` is part of what is checked.
     */
    it('refuses a reset link presented at activation', async () => {
      const { token } = await issueLink(AccountTokenType.PASSWORD_RESET);

      await request(app.getHttpServer())
        .post(`${BASE}/auth/activate`)
        .send({ token, password: 'the one they chose' })
        .expect(400);
    });

    it('enforces the password policy', async () => {
      const { token } = await issueLink(AccountTokenType.ACTIVATION);

      await request(app.getHttpServer())
        .post(`${BASE}/auth/activate`)
        .send({ token, password: 'short' })
        .expect(400);
    });

    /** Activation returns nothing: no session, and above all no token. */
    it('answers with a null body rather than a session', async () => {
      const { token } = await issueLink(AccountTokenType.ACTIVATION);

      const response = await request(app.getHttpServer())
        .post(`${BASE}/auth/activate`)
        .send({ token, password: 'the one they chose' })
        .expect(200);

      expect(response.body).toEqual({ success: true, data: null });
    });
  });

  /**
   * The invitation email itself — the only place a raw secret is allowed to
   * exist, and the shape the frontend's route has to match.
   */
  describe('the invitation email', () => {
    it('carries a link to the frontend with the secret in the query', async () => {
      await givenAccount(AccountStatus.PENDING_ACTIVATION);

      const { token, expiresAt } = await issueLink(AccountTokenType.ACTIVATION);

      await app
        .get(AccountEmailService)
        .sendActivation({ to: 'ana.pop@example.com', token, expiresAt });

      expect(sent).toHaveLength(1);
      expect(sent[0].to).toBe('ana.pop@example.com');
      expect(sent[0].html).toContain(
        `${WEB_URL}/activate-account?token=${token}`,
      );
      expect(lastLink()).toBe(token);
    });

    /**
     * **No credential in the email but the link.**
     *
     * The word "password" appears in the prose — the message is about choosing
     * one — so the assertion is on the things that would actually be a leak: a
     * bcrypt hash, the account's stored hash, and any personal datum beyond the
     * address the message was sent to. A generated password would show up as the
     * first of these, which is exactly the practice the activation link replaced.
     */
    it('carries no credential and no personal data beyond the address', async () => {
      await givenAccount(AccountStatus.PENDING_ACTIVATION, 'a-stored-hash');

      const { token, expiresAt } = await issueLink(AccountTokenType.ACTIVATION);

      await app
        .get(AccountEmailService)
        .sendActivation({ to: 'ana.pop@example.com', token, expiresAt });

      const body = JSON.stringify(sent);

      expect(body).not.toMatch(/\$2[aby]\$/);
      expect(body).not.toContain('a-stored-hash');
      expect(body).not.toContain('passwordHash');
      // No name, no employee code, no role: the message reaches whatever mailbox
      // the address names, including a typo'd one.
      expect(body).not.toMatch(/Ana|Pop|EMP-|SUPERADMIN|ADMIN/);
    });

    /** The stored row is a digest; the raw secret exists only in the message. */
    it('stores only a hash of what it emailed', async () => {
      await givenAccount(AccountStatus.PENDING_ACTIVATION);

      const { token } = await issueLink(AccountTokenType.ACTIVATION);
      const stored = db.tokenFor('usr-1', AccountTokenType.ACTIVATION);

      expect(stored?.tokenHash).toBe(
        createHash('sha256').update(token).digest('hex'),
      );
      expect(stored?.tokenHash).not.toBe(token);
    });
  });

  describe('forgot-password', () => {
    /**
     * **The no-enumeration property, asserted as an equality of responses.**
     * Anything that differed — a status, a message, a field — would let somebody
     * test an address list against the company directory.
     */
    it('answers identically for a known and an unknown address', async () => {
      await givenAccount(AccountStatus.ACTIVE, 'an-existing-hash');

      const known = await request(app.getHttpServer())
        .post(`${BASE}/auth/forgot-password`)
        .send({ email: 'ana.pop@example.com' })
        .expect(200);

      const unknown = await request(app.getHttpServer())
        .post(`${BASE}/auth/forgot-password`)
        .send({ email: 'nobody@example.com' })
        .expect(200);

      expect(known.body).toEqual(unknown.body);
      expect(known.body.data.message).toBe(PASSWORD_RESET_REQUESTED_MESSAGE);
    });

    it('emails a reset link to an active account', async () => {
      await givenAccount(AccountStatus.ACTIVE, 'an-existing-hash');

      await request(app.getHttpServer())
        .post(`${BASE}/auth/forgot-password`)
        .send({ email: 'ana.pop@example.com' })
        .expect(200);

      expect(sent).toHaveLength(1);
      expect(sent[0].html).toContain(`${WEB_URL}/reset-password?token=`);
    });

    /**
     * A pending account needs an *invitation* from an administrator, and a
     * disabled one must not be handed a way back in. Both answer like a success.
     */
    it.each([AccountStatus.PENDING_ACTIVATION, AccountStatus.DISABLED])(
      'sends nothing for a %s account, and says so to nobody',
      async (status) => {
        await givenAccount(status, 'an-existing-hash');

        await request(app.getHttpServer())
          .post(`${BASE}/auth/forgot-password`)
          .send({ email: 'ana.pop@example.com' })
          .expect(200);

        expect(sent).toHaveLength(0);
      },
    );

    it('folds the address exactly as login does', async () => {
      await givenAccount(AccountStatus.ACTIVE, 'an-existing-hash');

      await request(app.getHttpServer())
        .post(`${BASE}/auth/forgot-password`)
        .send({ email: '  Ana.Pop@Example.COM  ' })
        .expect(200);

      expect(sent).toHaveLength(1);
    });
  });

  describe('reset-password', () => {
    beforeEach(async () => {
      await givenAccount(AccountStatus.ACTIVE, 'an-existing-hash');
    });

    it('replaces the password and consumes the link', async () => {
      const { token } = await issueLink(AccountTokenType.PASSWORD_RESET);

      await request(app.getHttpServer())
        .post(`${BASE}/auth/reset-password`)
        .send({ token, newPassword: 'a brand new secret' })
        .expect(200);

      await expect(
        verifyPassword(
          'a brand new secret',
          db.user('usr-1')?.passwordHash as string,
        ),
      ).resolves.toBe(true);

      await request(app.getHttpServer())
        .post(`${BASE}/auth/reset-password`)
        .send({ token, newPassword: 'yet another' })
        .expect(400);
    });

    /**
     * Everything is revoked, because the reason for a reset may be that somebody
     * else has the account.
     */
    it('revokes every session the account had', async () => {
      const { token } = await issueLink(AccountTokenType.PASSWORD_RESET);

      await request(app.getHttpServer())
        .post(`${BASE}/auth/reset-password`)
        .send({ token, newPassword: 'a brand new secret' })
        .expect(200);

      expect(db.revoked).toEqual([{ userId: 'usr-1', exceptToken: undefined }]);
    });

    it('refuses an activation link presented at reset', async () => {
      const { token } = await issueLink(AccountTokenType.ACTIVATION);

      await request(app.getHttpServer())
        .post(`${BASE}/auth/reset-password`)
        .send({ token, newPassword: 'a brand new secret' })
        .expect(400);
    });

    it('enforces the same password policy as activation', async () => {
      const { token } = await issueLink(AccountTokenType.PASSWORD_RESET);

      await request(app.getHttpServer())
        .post(`${BASE}/auth/reset-password`)
        .send({ token, newPassword: 'short' })
        .expect(400);
    });
  });

  describe('change-password', () => {
    /** The only password route that is not public — it needs a live session. */
    it('requires an access token', async () => {
      await request(app.getHttpServer())
        .post(`${BASE}/auth/change-password`)
        .send({ currentPassword: 'x', newPassword: 'a brand new secret' })
        .expect(401);
    });

    it('changes the password when the current one is right', async () => {
      const { hashPassword } =
        await import('../../common/password/password.hasher');

      await givenAccount(
        AccountStatus.ACTIVE,
        await hashPassword('what it was'),
      );

      await request(app.getHttpServer())
        .post(`${BASE}/auth/change-password`)
        .set(auth.as({ userId: 'usr-1' }))
        .send({
          currentPassword: 'what it was',
          newPassword: 'what it will be',
        })
        .expect(200);

      await expect(
        verifyPassword(
          'what it will be',
          db.user('usr-1')?.passwordHash as string,
        ),
      ).resolves.toBe(true);
    });

    it('refuses a wrong current password with its own code', async () => {
      const { hashPassword } =
        await import('../../common/password/password.hasher');

      await givenAccount(
        AccountStatus.ACTIVE,
        await hashPassword('what it was'),
      );

      const response = await request(app.getHttpServer())
        .post(`${BASE}/auth/change-password`)
        .set(auth.as({ userId: 'usr-1' }))
        .send({
          currentPassword: 'not what it was',
          newPassword: 'what it will be',
        })
        .expect(401);

      expect(response.body.errorCode).toBe(
        'ACCOUNT_CURRENT_PASSWORD_INCORRECT',
      );
    });

    /**
     * The caller stays signed in where they are; every *other* session goes,
     * which is the half that matters when somebody suspects their password is
     * known.
     *
     * **The session to spare comes from the refresh cookie** as of Feature 040,
     * where it used to be an optional `refreshToken` in the body. The behaviour
     * is identical and the reasoning is better: the session to keep is by
     * definition the one making the request, and a client can no longer read its
     * own refresh token in order to name it.
     */
    it('keeps the session whose refresh cookie the request carries', async () => {
      const { hashPassword } =
        await import('../../common/password/password.hasher');

      await givenAccount(
        AccountStatus.ACTIVE,
        await hashPassword('what it was'),
      );

      await request(app.getHttpServer())
        .post(`${BASE}/auth/change-password`)
        .set(auth.as({ userId: 'usr-1' }))
        .set('Cookie', `${DEFAULT_REFRESH_COOKIE_NAME}=${'r'.repeat(64)}`)
        .send({
          currentPassword: 'what it was',
          newPassword: 'what it will be',
        })
        .expect(200);

      expect(db.revoked).toEqual([
        { userId: 'usr-1', exceptToken: 'r'.repeat(64) },
      ]);
    });

    /**
     * No cookie spares nothing, so every session ends including this one — the
     * safe direction to be wrong in, and unchanged from the day the field was
     * optional. The cost of being wrong is one extra sign-in; the cost of the
     * opposite default would be leaving live the very session the change was
     * meant to evict.
     */
    it('revokes every session, its own included, when no cookie is sent', async () => {
      const { hashPassword } =
        await import('../../common/password/password.hasher');

      await givenAccount(
        AccountStatus.ACTIVE,
        await hashPassword('what it was'),
      );

      await request(app.getHttpServer())
        .post(`${BASE}/auth/change-password`)
        .set(auth.as({ userId: 'usr-1' }))
        .send({
          currentPassword: 'what it was',
          newPassword: 'what it will be',
        })
        .expect(200);

      expect(db.revoked).toEqual([{ userId: 'usr-1', exceptToken: undefined }]);
    });

    /**
     * The field is gone rather than ignored. `forbidNonWhitelisted` is what
     * makes that a `400` naming the property, so a client still sending it is
     * told rather than left believing a session was spared.
     */
    it('rejects the refreshToken body field the cookie replaced', async () => {
      const { hashPassword } =
        await import('../../common/password/password.hasher');

      await givenAccount(
        AccountStatus.ACTIVE,
        await hashPassword('what it was'),
      );

      await request(app.getHttpServer())
        .post(`${BASE}/auth/change-password`)
        .set(auth.as({ userId: 'usr-1' }))
        .send({
          currentPassword: 'what it was',
          newPassword: 'what it will be',
          refreshToken: 'r'.repeat(64),
        })
        .expect(400);
    });
  });
});
