import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';

import { AppModule } from '../src/app.module';
import { API_BASE_PATH } from '../src/config/api.constants';
import { configureApp } from '../src/config/app.setup';
import { AuthService } from '../src/modules/auth/auth.service';
import {
  DEFAULT_REFRESH_COOKIE_NAME,
  REFRESH_COOKIE_KEYS,
} from '../src/modules/auth/refresh-cookie.config';
import { TestAuthentication } from '../src/modules/auth/testing/authentication.testing';

const ALLOWED_ORIGIN = 'http://localhost:5173';
const REFUSED_ORIGIN = 'http://evil.example';

const PRESENTED_TOKEN = 'p'.repeat(64);
const ISSUED_TOKEN = 'i'.repeat(64);

/**
 * The refresh cookie as the **fully configured** application serves it.
 *
 * What this file adds over `auth/refresh-cookie.routing.spec.ts`, which already
 * proves the rotation cycle against the real service, is everything that lives
 * outside the auth module and therefore cannot be asserted from inside it:
 *
 * - that `cookie-parser` is registered in `configureApp` — so the cookie is
 *   readable in the application `main.ts` boots, not only in a spec that
 *   remembered to add the middleware;
 * - that the cookie survives the whole global pipeline (Helmet, the version
 *   prefix, the validation pipe, the envelope interceptor) unchanged;
 * - that **CORS allows the credentials the cookie needs**, which is a property
 *   of `cors.config.ts` and the browser, and is the single most likely thing to
 *   be wrong when the frontend lands;
 * - that `Secure` is off over plain HTTP in development and on in production,
 *   asserted on the header a real response carries rather than on the options
 *   object.
 *
 * The database is never touched: `AuthService` is stubbed, so what is exercised
 * is the transport and nothing else. Two applications are booted, because
 * `Secure` has two states and a test proving one proves nothing about the other
 * — the arrangement `security-headers.e2e-spec.ts` uses.
 *
 * **The two are separated by the explicit flag rather than by `NODE_ENV`**, and
 * that is a constraint of this suite rather than a preference. `ConfigModule
 * .forRoot` runs when `app.module.ts` is *imported*, which is before any
 * `beforeAll`, and `NODE_ENV` is one of the few variables with a declared
 * default — so it is baked into the validated config at import time and
 * `process.env` no longer decides it. The optional flags escape that because an
 * absent one leaves the validated config with nothing, and `ConfigService` falls
 * through to `process.env`. What the `NODE_ENV` default resolves to is therefore
 * asserted where it can be: `refresh-cookie.config.spec.ts`, which calls the
 * loader directly.
 */
const auth = new TestAuthentication();

/** What the stubbed service hands the controller, exactly as the real one does. */
const ISSUED = {
  session: {
    accessToken: 'an-access-token',
    tokenType: 'Bearer' as const,
    expiresIn: 900,
    user: {
      id: 'usr-1',
      email: 'maria.ionescu@company.com',
      role: 'HR',
      employeeId: 'emp-1',
      administrativeAccess: true,
    },
  },
  refreshToken: ISSUED_TOKEN,
  refreshTokenExpiresAt: new Date(Date.now() + 604_800_000),
};

const refresh = jest.fn().mockResolvedValue(ISSUED);

describe('The refresh cookie (e2e)', () => {
  let dev: INestApplication<App>;
  let secure: INestApplication<App>;

  const bootApp = async (
    env: Record<string, string | undefined>,
  ): Promise<INestApplication<App>> => {
    for (const [key, value] of Object.entries(env)) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }

    const moduleRef: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(AuthService)
      .useValue({
        ...auth.stub,
        login: jest.fn().mockResolvedValue(ISSUED),
        refresh,
        logout: jest.fn().mockResolvedValue(undefined),
      })
      .compile();

    const app = moduleRef.createNestApplication<INestApplication<App>>();

    configureApp(app);
    await app.init();

    return app;
  };

  beforeAll(async () => {
    process.env.CORS_ORIGINS = ALLOWED_ORIGIN;

    dev = await bootApp({ [REFRESH_COOKIE_KEYS.secure]: undefined });
    secure = await bootApp({ [REFRESH_COOKIE_KEYS.secure]: 'true' });
  });

  afterAll(async () => {
    await dev.close();
    await secure.close();

    delete process.env[REFRESH_COOKIE_KEYS.secure];
  });

  beforeEach(() => {
    refresh.mockClear();
  });

  const login = (app: INestApplication<App>) =>
    request(app.getHttpServer())
      .post(`${API_BASE_PATH}/auth/login`)
      .send({ email: 'maria.ionescu@company.com', password: 'a password' });

  /** The `Set-Cookie` naming the refresh cookie, as one string. */
  const refreshCookieOf = (response: request.Response): string => {
    const header = response.headers['set-cookie'] as unknown;
    const cookies = Array.isArray(header) ? (header as string[]) : [];

    return (
      cookies.find((cookie) =>
        cookie.startsWith(`${DEFAULT_REFRESH_COOKIE_NAME}=`),
      ) ?? ''
    );
  };

  describe('through the configured application', () => {
    it('sets the refresh token as an HttpOnly cookie on login', async () => {
      const response = await login(dev).expect(200);

      expect(refreshCookieOf(response)).toContain(
        `${DEFAULT_REFRESH_COOKIE_NAME}=${ISSUED_TOKEN}`,
      );
      expect(refreshCookieOf(response)).toContain('HttpOnly');
      expect(response.body.data).not.toHaveProperty('refreshToken');
    });

    /**
     * **The assertion this file exists for.** The route reads
     * `request.cookies`, which only exists because `configureApp` registers
     * `cookie-parser` — so a refresh that reaches the service with the right
     * token proves the middleware is in the application `main.ts` boots. Without
     * it the request would look like one carrying no cookie at all, and this
     * would be a `401`.
     */
    it('reads the cookie back on refresh, which proves cookie-parser is registered', async () => {
      await request(dev.getHttpServer())
        .post(`${API_BASE_PATH}/auth/refresh`)
        .set('Cookie', `${DEFAULT_REFRESH_COOKIE_NAME}=${PRESENTED_TOKEN}`)
        .expect(200);

      expect(refresh).toHaveBeenCalledWith(PRESENTED_TOKEN, expect.anything());
    });

    /** The envelope, the version prefix and the security headers are untouched. */
    it('leaves the rest of the response exactly as it was', async () => {
      const response = await login(dev).expect(200);

      expect(response.body).toEqual({ success: true, data: ISSUED.session });
      expect(response.headers['x-content-type-options']).toBe('nosniff');
      expect(response.headers['x-powered-by']).toBeUndefined();
    });
  });

  /**
   * `Secure` in both of its states, read off a real response.
   *
   * Getting this wrong is invisible from the server in both directions: left on
   * against `http://localhost`, the browser stores the cookie and never sends it
   * back; left off in production, the refresh token crosses the network in the
   * clear. Neither logs anything.
   */
  describe('the Secure attribute', () => {
    it('is off with nothing configured, so a cookie set over http comes back', async () => {
      expect(refreshCookieOf(await login(dev).expect(200))).not.toContain(
        'Secure',
      );
    });

    it('is on when the deployment says so, alongside the other attributes', async () => {
      const cookie = refreshCookieOf(await login(secure).expect(200));

      expect(cookie).toContain('Secure');
      expect(cookie).toContain('HttpOnly');
      expect(cookie).toContain('Path=/api/v1/auth');
      expect(cookie).toContain('SameSite=Lax');
    });
  });

  /**
   * CORS, which is where a cookie-based session usually fails first.
   *
   * A browser applies two rules to a credentialed cross-origin request, and both
   * have to hold: the caller must ask (`credentials: 'include'`), and the
   * response must permit (`Access-Control-Allow-Credentials: true`). This is the
   * half the backend owns.
   */
  describe('CORS credentials', () => {
    it('allows credentials to an origin on the allowlist', async () => {
      const response = await login(dev)
        .set('Origin', ALLOWED_ORIGIN)
        .expect(200);

      expect(response.headers['access-control-allow-credentials']).toBe('true');
      expect(response.headers['access-control-allow-origin']).toBe(
        ALLOWED_ORIGIN,
      );
      expect(refreshCookieOf(response)).toContain('HttpOnly');
    });

    /**
     * The specific origin is reflected rather than `*`, and that is a
     * requirement rather than a style: browsers refuse a credentialed request
     * whose response allows any origin, so a wildcard would mean the cookie
     * never works at all.
     */
    it('never answers a credentialed request with a wildcard origin', async () => {
      const response = await login(dev)
        .set('Origin', ALLOWED_ORIGIN)
        .expect(200);

      expect(response.headers['access-control-allow-origin']).not.toBe('*');
    });

    it('offers nothing to an origin that is not on the allowlist', async () => {
      const response = await login(dev)
        .set('Origin', REFUSED_ORIGIN)
        .expect(200);

      expect(response.headers['access-control-allow-origin']).toBeUndefined();
    });

    /** The preflight a browser sends before a credentialed POST. */
    it('permits credentials on the preflight', async () => {
      const response = await request(dev.getHttpServer())
        .options(`${API_BASE_PATH}/auth/refresh`)
        .set('Origin', ALLOWED_ORIGIN)
        .set('Access-Control-Request-Method', 'POST')
        .expect(204);

      expect(response.headers['access-control-allow-credentials']).toBe('true');
      expect(response.headers['access-control-allow-origin']).toBe(
        ALLOWED_ORIGIN,
      );
    });
  });
});
