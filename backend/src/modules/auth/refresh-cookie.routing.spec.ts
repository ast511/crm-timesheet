import {
  INestApplication,
  ValidationPipe,
  VersioningType,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { Test, TestingModule } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import request from 'supertest';

import { hashPassword } from '../../common/password/password.hasher';
import { AllExceptionsFilter } from '../../common/filters/all-exceptions.filter';
import { ResponseInterceptor } from '../../common/interceptors/response.interceptor';
import {
  API_DEFAULT_VERSION,
  API_PREFIX,
  API_VERSION_PREFIX,
} from '../../config/api.constants';
import { AccountStatus, UserRole } from '../../generated/prisma/enums';
import { PrismaService } from '../../prisma/prisma.service';
import { AccountPasswordService } from './account-password.service';
import { JWT_KEYS } from './auth.config';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { JwtAuthGuard } from './jwt-auth.guard';
import { DEFAULT_REFRESH_COOKIE_NAME } from './refresh-cookie.config';
import { RefreshTokenCookie } from './refresh-token.cookie';
import { TokenService } from './token.service';

const BASE = `/${API_PREFIX}/${API_VERSION_PREFIX}${API_DEFAULT_VERSION}`;
const PASSWORD = 'correct horse battery staple';
const EMAIL = 'maria.ionescu@company.com';

/**
 * A session's whole life, carried by the cookie: sign in, rotate, rotate again,
 * present a spent one, sign out.
 *
 * **The real mechanism throughout.** Real `AuthService`, real `TokenService`
 * signing and verifying real JWSs, real SHA-256 hashing, the real
 * `RefreshTokenCookie`, the real `cookie-parser`. Only the database is
 * substituted, and the substitute is *stateful* — a `Map` of token rows keyed by
 * hash, which is what lets rotation and reuse detection actually happen here
 * rather than being asserted against a mock's call log.
 *
 * That is the point of this file existing beside `routing.spec.ts` and
 * `auth.service.spec.ts`. Those two prove, respectively, that the controller
 * writes a cookie and that the service rotates a string; neither can show the
 * property Feature 040 actually claims — that a browser holding nothing but a
 * cookie can refresh indefinitely, that the value in that cookie is spent the
 * moment it is used, and that presenting a spent one ends everything. The
 * supertest agent below *is* the browser: it stores what it is sent and sends it
 * back, and no test in this file ever reads a refresh token out of a response
 * body, because there is none to read.
 */
describe('the refresh cookie, end to end', () => {
  let app: INestApplication;
  let db: FakeDatabase;
  let passwordHash: string;

  /**
   * The two tables this flow touches, held in memory.
   *
   * `tokens` is keyed by `tokenHash` because that is how the application looks a
   * token up — the raw value is stored nowhere on this side, which is the
   * property the fake has to preserve in order for the test to mean anything.
   */
  class FakeDatabase {
    readonly tokens = new Map<string, Record<string, unknown>>();
    private sequence = 0;

    status: AccountStatus = AccountStatus.ACTIVE;

    /** The row `create` writes, and the id it gets. */
    add(data: Record<string, unknown>): { id: string } {
      const id = `rft-${String(++this.sequence)}`;

      this.tokens.set(data.tokenHash as string, {
        id,
        revokedAt: null,
        replacedById: null,
        ...data,
      });

      return { id };
    }

    byId(id: string): Record<string, unknown> | undefined {
      return [...this.tokens.values()].find((row) => row.id === id);
    }

    /** How many rows are still usable — the count a "signed out" test reads. */
    get live(): number {
      return [...this.tokens.values()].filter((row) => row.revokedAt === null)
        .length;
    }
  }

  beforeAll(async () => {
    passwordHash = await hashPassword(PASSWORD);
  });

  beforeEach(async () => {
    db = new FakeDatabase();

    const prisma = {
      user: {
        findUnique: jest.fn(() =>
          Promise.resolve({
            id: 'usr-1',
            email: EMAIL,
            role: UserRole.HR,
            status: db.status,
            passwordHash,
            employee: { id: 'emp-1' },
          }),
        ),
      },
      refreshToken: {
        findUnique: jest.fn(({ where }: { where: { tokenHash: string } }) =>
          Promise.resolve(db.tokens.get(where.tokenHash) ?? null),
        ),
        create: jest.fn(({ data }: { data: Record<string, unknown> }) =>
          Promise.resolve(db.add(data)),
        ),
        update: jest.fn(
          ({
            where,
            data,
          }: {
            where: { id: string };
            data: Record<string, unknown>;
          }) => {
            Object.assign(db.byId(where.id) ?? {}, data);

            return Promise.resolve(db.byId(where.id));
          },
        ),
        updateMany: jest.fn(
          ({
            where,
            data,
          }: {
            where: { userId: string; revokedAt: null; tokenHash?: string };
            data: Record<string, unknown>;
          }) => {
            let count = 0;

            for (const [hash, row] of db.tokens) {
              const matches =
                row.userId === where.userId &&
                row.revokedAt === null &&
                (where.tokenHash === undefined || hash === where.tokenHash);

              if (matches) {
                Object.assign(row, data);
                count++;
              }
            }

            return Promise.resolve({ count });
          },
        ),
      },
      $transaction: jest.fn(
        (run: (tx: unknown) => Promise<unknown>): Promise<unknown> =>
          run(prisma),
      ),
    };

    const config = {
      getOrThrow: (key: string) =>
        ({
          [JWT_KEYS.accessSecret]: 'access-secret-0123456789abcdefghij',
          [JWT_KEYS.refreshSecret]: 'refresh-secret-0123456789abcdefghij',
          [JWT_KEYS.accessTtl]: 900,
          [JWT_KEYS.refreshTtl]: 604_800,
        })[key],
      // Nothing configured, so the cookie is the default one every deployment
      // gets before it touches a variable.
      get: () => undefined,
    } as unknown as ConfigService;

    const moduleRef: TestingModule = await Test.createTestingModule({
      controllers: [AuthController],
      providers: [
        AuthService,
        TokenService,
        RefreshTokenCookie,
        { provide: PrismaService, useValue: prisma },
        { provide: ConfigService, useValue: config },
        { provide: JwtService, useValue: new JwtService({}) },
        // The password routes are not exercised here; this file is about the
        // session, and what those four do is `account-lifecycle.routing.spec.ts`.
        {
          provide: AccountPasswordService,
          useValue: { changePassword: jest.fn() },
        },
        { provide: APP_GUARD, useClass: JwtAuthGuard },
      ],
    }).compile();

    app = moduleRef.createNestApplication();

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

  /**
   * A supertest agent, which keeps a cookie jar — so it behaves like the browser
   * this feature is written for: it is handed a cookie once and sends it back on
   * its own, and nothing in the test ever names the token.
   */
  const browser = () => request.agent(app.getHttpServer());

  const signIn = (agent: ReturnType<typeof browser>) =>
    agent.post(`${BASE}/auth/login`).send({ email: EMAIL, password: PASSWORD });

  /** The refresh cookie's value as the agent currently holds it. */
  const heldToken = (agent: ReturnType<typeof browser>): string | undefined => {
    const jar = agent.jar.getCookie(DEFAULT_REFRESH_COOKIE_NAME, {
      domain: '127.0.0.1',
      path: '/api/v1/auth',
      secure: false,
      script: false,
    } as never) as { value?: string } | undefined;

    return jar?.value;
  };

  describe('signing in', () => {
    it('hands the browser a cookie and the body no refresh token', async () => {
      const agent = browser();
      const response = await signIn(agent).expect(200);

      expect(response.body.data.accessToken).toEqual(expect.any(String));
      expect(response.body.data).not.toHaveProperty('refreshToken');
      expect(heldToken(agent)).toEqual(expect.any(String));
      expect(db.tokens.size).toBe(1);
    });

    /**
     * The stored form is a SHA-256 of the token, so the raw value the cookie
     * carries exists in exactly two places: the browser, and this response. Not
     * in the database, and — because it is `HttpOnly` — not in `document.cookie`.
     */
    it('stores only a hash of what the cookie carries', async () => {
      const agent = browser();

      await signIn(agent).expect(200);

      const token = heldToken(agent) ?? '';

      expect(token.length).toBeGreaterThan(40);
      expect(JSON.stringify([...db.tokens])).not.toContain(token);
      expect(db.tokens.has(app.get(TokenService).hash(token))).toBe(true);
    });
  });

  describe('rotating', () => {
    /**
     * **The claim the whole feature rests on.** The client sends no body, holds
     * no credential it can read, and still refreshes — twice — because the
     * browser attaches the cookie and the server replaces it each time.
     */
    it('refreshes with no body at all, and keeps working', async () => {
      const agent = browser();

      await signIn(agent).expect(200);

      const first = heldToken(agent);

      const one = await agent.post(`${BASE}/auth/refresh`).expect(200);
      const second = heldToken(agent);

      const two = await agent.post(`${BASE}/auth/refresh`).expect(200);
      const third = heldToken(agent);

      expect(one.body.data.accessToken).toEqual(expect.any(String));
      expect(two.body.data.accessToken).toEqual(expect.any(String));
      expect(new Set([first, second, third]).size).toBe(3);
    });

    /** Single-use: the presented token is spent and points at its successor. */
    it('spends the token it was given', async () => {
      const agent = browser();

      await signIn(agent).expect(200);

      const presented = heldToken(agent) ?? '';
      const hash = app.get(TokenService).hash(presented);

      await agent.post(`${BASE}/auth/refresh`).expect(200);

      const spent = db.tokens.get(hash);

      expect(spent?.revokedAt).toEqual(expect.any(Date));
      expect(spent?.replacedById).toEqual(expect.any(String));
      expect(db.live).toBe(1);
    });

    /**
     * A refresh *is* a new session, so a role changed in the meantime comes
     * back. Unchanged by the transport, and asserted here because it is the
     * reason the response still carries a body at all.
     */
    it('answers with a body the client can rehydrate from', async () => {
      const agent = browser();

      await signIn(agent).expect(200);

      const response = await agent.post(`${BASE}/auth/refresh`).expect(200);

      expect(response.body).toEqual({
        success: true,
        data: {
          accessToken: expect.any(String) as string,
          tokenType: 'Bearer',
          expiresIn: 900,
          user: {
            id: 'usr-1',
            email: EMAIL,
            role: UserRole.HR,
            employeeId: 'emp-1',
            administrativeAccess: true,
          },
        },
      });
    });
  });

  describe('reuse detection', () => {
    /**
     * **Unchanged semantics, new transport.** A stolen cookie is a *copy*: two
     * parties hold one credential, and whichever refreshes second presents a
     * token that already has a successor. The account's live sessions all end,
     * the answer is the specific code rather than a generic expiry, and the
     * thief's cookie is cleared on the way out.
     */
    it('revokes every session and clears the cookie when a spent token comes back', async () => {
      const victim = browser();

      await signIn(victim).expect(200);

      // The thief copies the cookie — which is what a stolen refresh token is —
      // and the victim's client refreshes first.
      const stolen = heldToken(victim) ?? '';

      await victim.post(`${BASE}/auth/refresh`).expect(200);
      expect(db.live).toBe(1);

      const response = await request(app.getHttpServer())
        .post(`${BASE}/auth/refresh`)
        .set('Cookie', `${DEFAULT_REFRESH_COOKIE_NAME}=${stolen}`)
        .expect(401);

      expect(response.body.errorCode).toBe('AUTH_REFRESH_TOKEN_REUSED');
      expect(db.live).toBe(0);

      const cleared = (
        response.headers['set-cookie'] as unknown as string[]
      )[0];

      expect(cleared).toContain(`${DEFAULT_REFRESH_COOKIE_NAME}=;`);
      expect(cleared).toContain('Path=/api/v1/auth');
    });

    /** And the victim, refreshing again afterwards, is signed out too. */
    it('leaves the legitimate client unable to refresh either', async () => {
      const victim = browser();

      await signIn(victim).expect(200);

      const stolen = heldToken(victim) ?? '';

      await victim.post(`${BASE}/auth/refresh`).expect(200);

      await request(app.getHttpServer())
        .post(`${BASE}/auth/refresh`)
        .set('Cookie', `${DEFAULT_REFRESH_COOKIE_NAME}=${stolen}`)
        .expect(401);

      await victim.post(`${BASE}/auth/refresh`).expect(401);
    });
  });

  describe('signing out', () => {
    it('revokes the cookie’s token and clears the cookie', async () => {
      const agent = browser();

      const login = await signIn(agent).expect(200);
      const accessToken = login.body.data.accessToken as string;

      await agent
        .post(`${BASE}/auth/logout`)
        .set({ authorization: `Bearer ${accessToken}` })
        .expect(200)
        .expect(({ body }) => {
          expect(body).toEqual({ success: true, data: null });
        });

      expect(db.live).toBe(0);
      expect(heldToken(agent) ?? '').toBe('');
    });

    /** The cookie is gone, so the next refresh has nothing to present. */
    it('leaves the browser unable to refresh afterwards', async () => {
      const agent = browser();

      const login = await signIn(agent).expect(200);

      await agent
        .post(`${BASE}/auth/logout`)
        .set({
          authorization: `Bearer ${login.body.data.accessToken as string}`,
        })
        .expect(200);

      await agent
        .post(`${BASE}/auth/refresh`)
        .expect(401)
        .expect(({ body }) => {
          expect(body.errorCode).toBe('AUTH_REFRESH_TOKEN_INVALID');
        });
    });
  });

  /**
   * The checks that live behind the cookie, still firing. The transport moved;
   * nothing about what a refresh *means* did.
   */
  describe('what the cookie does not buy', () => {
    it('refuses the cookie of an account that has been deactivated', async () => {
      const agent = browser();

      await signIn(agent).expect(200);

      db.status = AccountStatus.DISABLED;

      await agent
        .post(`${BASE}/auth/refresh`)
        .expect(401)
        .expect(({ body }) => {
          expect(body.errorCode).toBe('AUTH_INACTIVE_USER');
        });
    });

    /** A cookie is client-controlled text; a forged one never reaches a query. */
    it('refuses a cookie that is not a token this server signed', async () => {
      const forged = `${'f'.repeat(30)}.${'g'.repeat(30)}.${'h'.repeat(30)}`;

      await request(app.getHttpServer())
        .post(`${BASE}/auth/refresh`)
        .set('Cookie', `${DEFAULT_REFRESH_COOKIE_NAME}=${forged}`)
        .expect(401)
        .expect(({ body }) => {
          expect(body.errorCode).toBe('AUTH_REFRESH_TOKEN_INVALID');
        });

      expect(db.tokens.size).toBe(0);
    });
  });
});
