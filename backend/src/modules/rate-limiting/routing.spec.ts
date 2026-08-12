import {
  Controller,
  Get,
  INestApplication,
  UnauthorizedException,
  ValidationPipe,
  VersioningType,
} from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';

import { ERROR_CODES } from '../../common/constants/error-codes.constants';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { codedError } from '../../common/errors/coded-error';
import { AllExceptionsFilter } from '../../common/filters/all-exceptions.filter';
import { ResponseInterceptor } from '../../common/interceptors/response.interceptor';
import {
  API_DEFAULT_VERSION,
  API_PREFIX,
  API_VERSION_PREFIX,
} from '../../config/api.constants';
import {
  applyTrustProxy,
  TRUST_PROXY_KEY,
} from '../../config/trust-proxy.config';
import { UserRole } from '../../generated/prisma/enums';
import { AccountPasswordService } from '../auth/account-password.service';
import { AuthController } from '../auth/auth.controller';
import { AuthService } from '../auth/auth.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Public } from '../auth/decorators/public.decorator';
import { RATE_LIMIT_KEYS } from './rate-limiting.config';
import {
  RATE_LIMIT_EXCEEDED_MESSAGE,
  RETRY_AFTER_HEADER,
} from './rate-limiting.constants';
import { ApiThrottlerGuard } from './rate-limiting.guard';
import { RateLimitingModule } from './rate-limiting.module';

/** Small enough that a test can exhaust a tier without sending 300 requests. */
const DEFAULT_LIMIT = 5;
const AUTH_LIMIT = 2;
const WINDOW_SECONDS = 60;

const BASE = `/${API_PREFIX}/${API_VERSION_PREFIX}${API_DEFAULT_VERSION}`;

const CALLER: CurrentUser = {
  userId: 'usr-1',
  employeeId: 'emp-1',
  role: UserRole.HR,
  administrativeAccess: true,
};

const SESSION = {
  accessToken: 'new-access-token',
  refreshToken: 'new-refresh-token',
  tokenType: 'Bearer' as const,
  expiresIn: 900,
  user: {
    id: 'usr-1',
    email: 'maria.ionescu@company.com',
    role: UserRole.HR,
    employeeId: 'emp-1',
    administrativeAccess: true,
  },
};

const VALID_TOKEN = 'a-valid-access-token';
const REFRESH_TOKEN = 'r'.repeat(64);

/**
 * A stand-in for the thirty modules that carry no rate-limit decorator at all.
 *
 * Neither handler says anything about limiting, which is the point: the baseline
 * reaches them because `ApiThrottlerGuard` is an `APP_GUARD`, exactly as it
 * reaches a route somebody adds next year.
 */
@Controller('probe')
class ProbeController {
  @Public()
  @Get('open')
  open(): { ok: true } {
    return { ok: true };
  }

  @Get('guarded')
  guarded(): { ok: true } {
    return { ok: true };
  }
}

interface AppOptions {
  readonly trustProxy?: string;
  readonly defaultLimit?: number;
  readonly authLimit?: number;
}

/**
 * Boots the real `RateLimitingModule` against the real `AuthController`.
 *
 * The limits arrive through `ConfigModule` rather than being handed to
 * `ThrottlerModule` directly, so what is exercised is the whole path this
 * feature added — environment to `loadRateLimitConfig` to two named tiers — and
 * not a second wiring that only exists in a spec.
 */
async function createApp(options: AppOptions = {}): Promise<INestApplication> {
  const values: Record<string, string> = {
    [RATE_LIMIT_KEYS.defaultLimit]: String(
      options.defaultLimit ?? DEFAULT_LIMIT,
    ),
    [RATE_LIMIT_KEYS.defaultTtl]: String(WINDOW_SECONDS),
    [RATE_LIMIT_KEYS.authLimit]: String(options.authLimit ?? AUTH_LIMIT),
    [RATE_LIMIT_KEYS.authTtl]: String(WINDOW_SECONDS),
    [TRUST_PROXY_KEY]: options.trustProxy ?? 'false',
  };

  // `ConfigService` reads `process.env` before anything a factory loaded, so a
  // developer's own `.env` would otherwise decide this spec's limits.
  for (const key of Object.keys(values)) {
    delete process.env[key];
  }

  const auth = {
    login: jest.fn().mockResolvedValue(SESSION),
    refresh: jest.fn().mockResolvedValue(SESSION),
    logout: jest.fn().mockResolvedValue(undefined),
    describeSelf: jest.fn().mockResolvedValue(SESSION.user),
    authenticate: jest.fn((token: string) => {
      if (token !== VALID_TOKEN) {
        throw new UnauthorizedException(
          codedError(
            ERROR_CODES.AUTH_UNAUTHENTICATED,
            'Invalid or expired access token',
          ),
        );
      }

      return Promise.resolve(CALLER);
    }),
  };

  const moduleRef: TestingModule = await Test.createTestingModule({
    imports: [
      ConfigModule.forRoot({
        isGlobal: true,
        ignoreEnvFile: true,
        load: [() => values],
      }),
      RateLimitingModule,
    ],
    controllers: [AuthController, ProbeController],
    providers: [
      { provide: AuthService, useValue: auth },
      // Feature 036 gave `AuthController` four more routes and a second
      // collaborator. Stubbed here: this spec is about how *often* a route may
      // be called, not what it does — though `activate`, `forgot-password` and
      // `reset-password` all carry `@StrictRateLimit()`, and the tier they are
      // on is asserted in `account-lifecycle/routing.spec.ts`.
      {
        provide: AccountPasswordService,
        useValue: {
          activate: jest.fn().mockResolvedValue(undefined),
          forgotPassword: jest.fn().mockResolvedValue(undefined),
          resetPassword: jest.fn().mockResolvedValue(undefined),
          changePassword: jest.fn().mockResolvedValue(undefined),
        },
      },
      // The two global guards in the order `app.module.ts` declares them: the
      // limiter first, so a request is counted before its credentials are
      // judged.
      { provide: APP_GUARD, useClass: ApiThrottlerGuard },
      { provide: APP_GUARD, useClass: JwtAuthGuard },
    ],
  }).compile();

  const app = moduleRef.createNestApplication();

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
  applyTrustProxy(app, app.get(ConfigService));

  await app.init();

  return app;
}

/**
 * Every test gets its own client address.
 *
 * The baseline tier is one bucket per client for the *whole* API, so without
 * this each test would spend the allowance of the ones after it and the suite
 * would depend on its own order. Supertest always connects from `127.0.0.1`, so
 * the address is supplied through `X-Forwarded-For` against an application
 * configured to trust one proxy — which is also, incidentally, a continuous
 * demonstration that the forwarded address is the one being counted.
 */
let nextClient = 0;
const client = () => ({ 'x-forwarded-for': `203.0.113.${++nextClient}` });

describe('rate limiting', () => {
  describe('the baseline tier', () => {
    let app: INestApplication;

    beforeAll(async () => {
      app = await createApp({ trustProxy: '1' });
    });

    afterAll(async () => {
      await app.close();
    });

    it('lets a client spend its whole allowance', async () => {
      const caller = client();

      for (let attempt = 0; attempt < DEFAULT_LIMIT; attempt++) {
        await request(app.getHttpServer())
          .get(`${BASE}/probe/open`)
          .set(caller)
          .expect(200);
      }
    });

    /**
     * `@Public()` exempts a route from *authentication*. It says nothing about
     * how often the route may be called, and the routes nobody has to
     * authenticate for are the ones an attacker can reach at all.
     */
    it('limits a @Public() route once the allowance is spent', async () => {
      const caller = client();

      for (let attempt = 0; attempt < DEFAULT_LIMIT; attempt++) {
        await request(app.getHttpServer())
          .get(`${BASE}/probe/open`)
          .set(caller)
          .expect(200);
      }

      await request(app.getHttpServer())
        .get(`${BASE}/probe/open`)
        .set(caller)
        .expect(429);
    });

    /** The envelope Feature 033 defined, with a code a frontend can translate. */
    it('refuses through the standard error envelope', async () => {
      const caller = client();

      for (let attempt = 0; attempt < DEFAULT_LIMIT; attempt++) {
        await request(app.getHttpServer())
          .get(`${BASE}/probe/open`)
          .set(caller);
      }

      const response = await request(app.getHttpServer())
        .get(`${BASE}/probe/open`)
        .set(caller)
        .expect(429);

      expect(response.body).toEqual({
        success: false,
        statusCode: 429,
        message: RATE_LIMIT_EXCEEDED_MESSAGE,
        errorCode: ERROR_CODES.RATE_LIMIT_EXCEEDED,
        path: `${BASE}/probe/open`,
        timestamp: expect.any(String) as unknown as string,
      });
    });

    /** Never the library's own `ThrottlerException: Too Many Requests`. */
    it('does not emit the throttler default message', async () => {
      const caller = client();

      for (let attempt = 0; attempt < DEFAULT_LIMIT; attempt++) {
        await request(app.getHttpServer())
          .get(`${BASE}/probe/open`)
          .set(caller);
      }

      const response = await request(app.getHttpServer())
        .get(`${BASE}/probe/open`)
        .set(caller)
        .expect(429);

      expect(JSON.stringify(response.body)).not.toMatch(/ThrottlerException/);
    });

    it('tells a blocked client how long to wait', async () => {
      const caller = client();

      for (let attempt = 0; attempt < DEFAULT_LIMIT; attempt++) {
        await request(app.getHttpServer())
          .get(`${BASE}/probe/open`)
          .set(caller);
      }

      const response = await request(app.getHttpServer())
        .get(`${BASE}/probe/open`)
        .set(caller)
        .expect(429);

      const retryAfter = Number(
        response.headers[RETRY_AFTER_HEADER.toLowerCase()],
      );

      expect(retryAfter).toBeGreaterThan(0);
      expect(retryAfter).toBeLessThanOrEqual(WINDOW_SECONDS);
    });

    /**
     * One bucket per client for the whole API rather than one per route.
     * Per-route buckets would leave the *total* request rate unbounded — a
     * caller could spend the full allowance separately on each of a hundred
     * routes — which is the thing this tier exists to bound.
     */
    it('counts every route against one allowance', async () => {
      const caller = client();
      const bearer = { ...caller, authorization: `Bearer ${VALID_TOKEN}` };

      for (let attempt = 0; attempt < DEFAULT_LIMIT; attempt++) {
        await request(app.getHttpServer())
          .get(`${BASE}/probe/guarded`)
          .set(bearer)
          .expect(200);
      }

      await request(app.getHttpServer())
        .get(`${BASE}/probe/open`)
        .set(caller)
        .expect(429);
    });

    it('gives each client its own allowance', async () => {
      const first = client();
      const second = client();

      for (let attempt = 0; attempt < DEFAULT_LIMIT; attempt++) {
        await request(app.getHttpServer()).get(`${BASE}/probe/open`).set(first);
      }

      await request(app.getHttpServer())
        .get(`${BASE}/probe/open`)
        .set(first)
        .expect(429);

      await request(app.getHttpServer())
        .get(`${BASE}/probe/open`)
        .set(second)
        .expect(200);
    });

    /**
     * The guard ordering, asserted from the outside.
     *
     * Every one of these requests is refused by `JwtAuthGuard` for having no
     * token, and the limiter counts them anyway. Were the two registered the
     * other way round, the authentication guard would reject each request before
     * it was ever counted and this route would answer `401` forever — which is
     * the same shape as the invalid-login flood below, and the reason the
     * ordering is not an implementation detail.
     */
    it('counts a request that authentication is about to reject', async () => {
      const caller = client();

      for (let attempt = 0; attempt < DEFAULT_LIMIT; attempt++) {
        await request(app.getHttpServer())
          .get(`${BASE}/probe/guarded`)
          .set(caller)
          .expect(401);
      }

      await request(app.getHttpServer())
        .get(`${BASE}/probe/guarded`)
        .set(caller)
        .expect(429);
    });

    /** Normal traffic inside the allowance is untouched. */
    it('leaves authenticated traffic within the limit unaffected', async () => {
      const bearer = { ...client(), authorization: `Bearer ${VALID_TOKEN}` };

      for (let attempt = 0; attempt < DEFAULT_LIMIT; attempt++) {
        const response = await request(app.getHttpServer())
          .get(`${BASE}/probe/guarded`)
          .set(bearer)
          .expect(200);

        expect(response.body).toEqual({ success: true, data: { ok: true } });
      }
    });
  });

  /**
   * The tier that closes Feature 032's gap.
   *
   * `AUTH_LIMIT` is deliberately smaller than `DEFAULT_LIMIT`, so a test that
   * trips the strict tier in fewer attempts than the baseline would allow is
   * evidence the stricter one is the one being applied.
   */
  describe('the strict tier on the authentication routes', () => {
    let app: INestApplication;

    beforeAll(async () => {
      app = await createApp({ trustProxy: '1' });
    });

    afterAll(async () => {
      await app.close();
    });

    const login = (caller: Record<string, string>, email: string) =>
      request(app.getHttpServer())
        .post(`${BASE}/auth/login`)
        .set(caller)
        .send({ email, password: 'correct horse battery staple' });

    it('trips on POST /auth/login in fewer attempts than the baseline', async () => {
      const caller = client();

      for (let attempt = 0; attempt < AUTH_LIMIT; attempt++) {
        await login(caller, 'maria.ionescu@company.com').expect(200);
      }

      const response = await login(caller, 'maria.ionescu@company.com').expect(
        429,
      );

      expect(AUTH_LIMIT).toBeLessThan(DEFAULT_LIMIT);
      expect(response.body).toMatchObject({
        success: false,
        statusCode: 429,
        errorCode: ERROR_CODES.RATE_LIMIT_EXCEEDED,
      });
    });

    it('trips on POST /auth/refresh in fewer attempts than the baseline', async () => {
      const caller = client();

      const refresh = () =>
        request(app.getHttpServer())
          .post(`${BASE}/auth/refresh`)
          .set(caller)
          .send({ refreshToken: REFRESH_TOKEN });

      for (let attempt = 0; attempt < AUTH_LIMIT; attempt++) {
        await refresh().expect(200);
      }

      await refresh().expect(429);
    });

    /**
     * Exhausting login attempts must not also block the refresh that would have
     * recovered the session, which is why the strict tier keeps a bucket per
     * handler.
     */
    it('keeps login and refresh in separate buckets', async () => {
      const caller = client();

      for (let attempt = 0; attempt <= AUTH_LIMIT; attempt++) {
        await login(caller, 'maria.ionescu@company.com');
      }

      await request(app.getHttpServer())
        .post(`${BASE}/auth/refresh`)
        .set(caller)
        .send({ refreshToken: REFRESH_TOKEN })
        .expect(200);
    });

    /**
     * The reason the strict tier is keyed on the submitted address as well as
     * the client: a whole office behind one NAT address would otherwise share
     * ten attempts, and one person mistyping their password would lock out
     * everybody else.
     */
    it('gives each account its own allowance from one address', async () => {
      const caller = client();

      for (let attempt = 0; attempt <= AUTH_LIMIT; attempt++) {
        await login(caller, 'maria.ionescu@company.com');
      }

      await login(caller, 'maria.ionescu@company.com').expect(429);
      await login(caller, 'ana.pop@company.com').expect(200);
    });

    /**
     * The folding has to match the one `AuthService` looks the account up with,
     * or the allowance doubles for every capitalisation an attacker tries.
     */
    it('counts one account however its address is capitalised', async () => {
      const caller = client();

      await login(caller, 'maria.ionescu@company.com').expect(200);
      await login(caller, 'MARIA.IONESCU@COMPANY.COM').expect(200);
      await login(caller, '  Maria.Ionescu@Company.com  ').expect(429);
    });

    /**
     * The limit does not require the request to succeed — which is the whole
     * reason it exists, since a brute-force attempt is by definition a request
     * that fails.
     */
    it('counts a flood of invalid logins', async () => {
      const caller = client();
      const attacked = 'maria.ionescu@company.com';

      (app.get(AuthService).login as jest.Mock).mockRejectedValue(
        new UnauthorizedException(
          codedError(
            ERROR_CODES.AUTH_INVALID_CREDENTIALS,
            'Invalid email or password',
          ),
        ),
      );

      for (let attempt = 0; attempt < AUTH_LIMIT; attempt++) {
        await login(caller, attacked).expect(401);
      }

      const response = await login(caller, attacked).expect(429);

      expect(response.body).toMatchObject({
        errorCode: ERROR_CODES.RATE_LIMIT_EXCEEDED,
      });
    });
  });

  /**
   * Which address a limit counts against, and the deployment setting that
   * decides it.
   *
   * Both of these are the same two requests. The only difference is
   * `TRUST_PROXY`, and it is the difference between a limiter that works behind
   * a proxy and one that either locks everybody out together or bounds nothing
   * at all.
   */
  describe('the client key and TRUST_PROXY', () => {
    // Each case needs its own application because the setting under test is
    // applied at boot. Held here and closed in `afterEach` rather than at the
    // end of each body, so a failing assertion still shuts the throttler's
    // store down instead of leaving a window's worth of timers behind.
    let app: INestApplication;

    afterEach(async () => {
      await app.close();
    });

    const first = { 'x-forwarded-for': '198.51.100.1' };
    const second = { 'x-forwarded-for': '198.51.100.2' };

    it('counts the forwarded client when a proxy is trusted', async () => {
      app = await createApp({ trustProxy: '1' });

      for (let attempt = 0; attempt < DEFAULT_LIMIT; attempt++) {
        await request(app.getHttpServer())
          .get(`${BASE}/probe/open`)
          .set(first)
          .expect(200);
      }

      await request(app.getHttpServer())
        .get(`${BASE}/probe/open`)
        .set(first)
        .expect(429);

      // A different client behind the same proxy still has its own allowance.
      await request(app.getHttpServer())
        .get(`${BASE}/probe/open`)
        .set(second)
        .expect(200);
    });

    /**
     * With no proxy configured the header is ignored, and it has to be: it is
     * written by the caller. A limiter that believed it without being told to
     * would hand every attacker a fresh bucket per request, which is not a
     * weakened limit — it is no limit at all.
     */
    it('ignores a forwarded address when no proxy is trusted', async () => {
      app = await createApp({ trustProxy: 'false' });

      for (let attempt = 0; attempt < DEFAULT_LIMIT; attempt++) {
        await request(app.getHttpServer())
          .get(`${BASE}/probe/open`)
          .set(first)
          .expect(200);
      }

      // Both requests really came from the same socket, so a spoofed header
      // must not open a second bucket.
      await request(app.getHttpServer())
        .get(`${BASE}/probe/open`)
        .set(second)
        .expect(429);
    });
  });
});
