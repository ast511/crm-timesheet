import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';

import { AppModule } from '../src/app.module';
import { API_BASE_PATH } from '../src/config/api.constants';
import { configureApp } from '../src/config/app.setup';
import {
  CSP_MODE_KEY,
  CspMode,
  HSTS_ENABLED_KEY,
} from '../src/config/helmet.config';

const ALLOWED_ORIGIN = 'http://localhost:5173';

/**
 * Two applications, because the two settings with deployment consequences have
 * to be proved in **both** states — an HSTS header that is merely absent from
 * the one configuration a test happens to boot proves nothing about the one a
 * deployment runs.
 *
 * `dev` is what a developer machine boots: nothing configured, plain HTTP.
 * `tls` is what a production deployment behind HTTPS boots, with the two
 * toggles on.
 *
 * Both go through the real `configureApp`, which is the point: these assert the
 * headers the server actually sends, in the order the middleware actually runs,
 * rather than the options object `helmet.config.spec.ts` already covers.
 */
describe('Security headers (e2e)', () => {
  let dev: INestApplication<App>;
  let tls: INestApplication<App>;

  const bootApp = async (
    env: Record<string, string | undefined>,
  ): Promise<INestApplication<App>> => {
    // Applied before `configureApp` reads it. The two variables are optional
    // with no default in `env.validation.ts`, so `ConfigService` falls through
    // to `process.env` — which is what lets one process boot two differently
    // configured applications.
    for (const [key, value] of Object.entries(env)) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }

    const moduleRef: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    const app = moduleRef.createNestApplication<INestApplication<App>>();

    configureApp(app);
    await app.init();

    return app;
  };

  beforeAll(async () => {
    process.env.CORS_ORIGINS = ALLOWED_ORIGIN;

    dev = await bootApp({
      [HSTS_ENABLED_KEY]: undefined,
      [CSP_MODE_KEY]: undefined,
    });

    tls = await bootApp({
      [HSTS_ENABLED_KEY]: 'true',
      [CSP_MODE_KEY]: CspMode.Relaxed,
    });
  });

  afterAll(async () => {
    await dev.close();
    await tls.close();

    delete process.env[HSTS_ENABLED_KEY];
    delete process.env[CSP_MODE_KEY];
  });

  /**
   * The headers that apply to every response today, whatever this backend is
   * serving. Unlike the CSP below, none of them waits for a frontend to be
   * worth having.
   */
  describe('on an ordinary response', () => {
    it('refuses content-type sniffing', () => {
      return request(dev.getHttpServer())
        .get(`${API_BASE_PATH}/health`)
        .expect(200)
        .expect('X-Content-Type-Options', 'nosniff');
    });

    it('refuses to be framed', () => {
      return request(dev.getHttpServer())
        .get(`${API_BASE_PATH}/health`)
        .expect(200)
        .expect('X-Frame-Options', 'DENY');
    });

    it('sends no referrer', () => {
      return request(dev.getHttpServer())
        .get(`${API_BASE_PATH}/health`)
        .expect(200)
        .expect('Referrer-Policy', 'no-referrer');
    });

    it('keeps responses same-origin as a subresource', () => {
      return request(dev.getHttpServer())
        .get(`${API_BASE_PATH}/health`)
        .expect(200)
        .expect('Cross-Origin-Resource-Policy', 'same-origin');
    });

    /**
     * Express announces itself on every response unless something removes the
     * header. Naming the framework and, by implication, its version is free
     * reconnaissance for anybody matching a deployment against a CVE list.
     */
    it('does not announce the framework', async () => {
      const response = await request(dev.getHttpServer())
        .get(`${API_BASE_PATH}/health`)
        .expect(200);

      expect(response.headers['x-powered-by']).toBeUndefined();
    });
  });

  /**
   * **The reason Helmet is registered first in `configureApp`.** An error
   * response is exactly the response an attacker is producing — a probe for a
   * route that does not exist, a payload the `ValidationPipe` rejects — so
   * headers that were present only on the successful path would be missing
   * from every response that matters.
   */
  describe('on an error response', () => {
    /**
     * Two failures produced at different depths, because "early enough" is a
     * claim about the middleware chain rather than about one route: the 404 is
     * answered by the router with no handler involved, and the 401 by the
     * global `JwtAuthGuard` before any controller is reached. Neither is a
     * response the success path ever renders.
     */
    it.each([
      ['an unmatched route', `${API_BASE_PATH}/does-not-exist`, 404],
      ['a route the auth guard refuses', `${API_BASE_PATH}/departments`, 401],
    ])('carries the headers on %s', async (_case, path, status) => {
      const response = await request(dev.getHttpServer())
        .get(path)
        .expect(status);

      expect(response.headers['x-content-type-options']).toBe('nosniff');
      expect(response.headers['x-frame-options']).toBe('DENY');
      expect(response.headers['referrer-policy']).toBe('no-referrer');
      expect(response.headers['content-security-policy']).toBeDefined();
      expect(response.headers['x-powered-by']).toBeUndefined();
    });

    /**
     * Helmet adds headers and touches nothing else. The envelope Feature 033
     * defined is asserted field by field here so a future change to the header
     * middleware cannot quietly alter a body — the failure this pins is the one
     * that would otherwise be found by the frontend.
     */
    it('leaves the error envelope exactly as it was', async () => {
      const response = await request(dev.getHttpServer())
        .get(`${API_BASE_PATH}/does-not-exist`)
        .expect(404);

      expect(response.body).toEqual({
        success: false,
        statusCode: 404,
        message: expect.any(String) as unknown as string,
        path: `${API_BASE_PATH}/does-not-exist`,
        timestamp: expect.any(String) as unknown as string,
      });
    });

    it('leaves the success envelope exactly as it was', () => {
      return request(dev.getHttpServer())
        .get(`${API_BASE_PATH}/health`)
        .expect(200)
        .expect({ success: true, data: { status: 'ok', service: 'backend' } });
    });
  });

  /**
   * The policy is a scaffold while this backend answers with JSON — it costs
   * nothing, breaks nothing and does nothing, because a CSP governs what an
   * HTML document may load and there are none. What is asserted is that it is
   * served, correctly formed, in the mode the environment asked for.
   */
  describe('the content security policy', () => {
    const policyFrom = async (app: INestApplication<App>): Promise<string> => {
      const response = await request(app.getHttpServer())
        .get(`${API_BASE_PATH}/health`)
        .expect(200);

      return response.headers['content-security-policy'] ?? '';
    };

    it.each([
      "default-src 'self'",
      "base-uri 'self'",
      "form-action 'self'",
      "frame-ancestors 'none'",
      "object-src 'none'",
      "script-src-attr 'none'",
      "connect-src 'self'",
    ])('declares %p in either mode', async (directive) => {
      expect(await policyFrom(dev)).toContain(directive);
      expect(await policyFrom(tls)).toContain(directive);
    });

    it('allows nothing inline by default', async () => {
      const policy = await policyFrom(dev);

      expect(policy).toContain("script-src 'self'");
      expect(policy).not.toContain('unsafe-inline');
    });

    /** What Swagger UI and a built SPA need, and nothing beyond it. */
    it('allows inline scripts and styles in the relaxed mode', async () => {
      const policy = await policyFrom(tls);

      expect(policy).toContain("script-src 'self' 'unsafe-inline'");
      expect(policy).toContain("style-src 'self' 'unsafe-inline'");
      expect(policy).not.toContain('unsafe-eval');
    });

    /**
     * A directive about an HTML document's subresources, on a backend that
     * serves none — and on a page opened over plain `http://localhost` it would
     * rewrite every subresource request to HTTPS and break the dev server.
     */
    it('does not upgrade insecure requests', async () => {
      expect(await policyFrom(dev)).not.toContain('upgrade-insecure-requests');
    });

    /** Enforced, not merely reported. There is nothing to collect reports at. */
    it('is not sent report-only', async () => {
      const response = await request(dev.getHttpServer())
        .get(`${API_BASE_PATH}/health`)
        .expect(200);

      expect(
        response.headers['content-security-policy-report-only'],
      ).toBeUndefined();
    });
  });

  /**
   * The header that cannot be taken back. Absent by default is what keeps a
   * developer's browser from refusing plain HTTP to `localhost` for a year;
   * present when a deployment asks is the whole point of the toggle.
   */
  describe('HSTS', () => {
    it('is absent under the local, plain-HTTP configuration', async () => {
      const response = await request(dev.getHttpServer())
        .get(`${API_BASE_PATH}/health`)
        .expect(200);

      expect(response.headers['strict-transport-security']).toBeUndefined();
    });

    it('is present when the deployment enables it', () => {
      return request(tls.getHttpServer())
        .get(`${API_BASE_PATH}/health`)
        .expect(200)
        .expect(
          'Strict-Transport-Security',
          'max-age=31536000; includeSubDomains',
        );
    });

    /** Preloading is a commitment handed to browser vendors, never implicit. */
    it('never asks to be preloaded', async () => {
      const response = await request(tls.getHttpServer())
        .get(`${API_BASE_PATH}/health`)
        .expect(200);

      expect(response.headers['strict-transport-security']).not.toContain(
        'preload',
      );
    });
  });

  /**
   * Coexistence with Feature 004's CORS configuration. The two answer
   * different questions — what a response is allowed to do in a browser, and
   * which origins may read it — and neither may quietly disable the other.
   */
  describe('alongside CORS', () => {
    it('sends both sets of headers on the same response', () => {
      return request(dev.getHttpServer())
        .get(`${API_BASE_PATH}/health`)
        .set('Origin', ALLOWED_ORIGIN)
        .expect(200)
        .expect('Access-Control-Allow-Origin', ALLOWED_ORIGIN)
        .expect('Access-Control-Allow-Credentials', 'true')
        .expect('X-Content-Type-Options', 'nosniff');
    });

    /**
     * A preflight is answered by the CORS middleware and never reaches a
     * handler, so it is the one response that would be missed by a header
     * middleware registered anywhere later in the chain.
     */
    it('carries the security headers on a preflight too', async () => {
      const response = await request(dev.getHttpServer())
        .options(`${API_BASE_PATH}/health`)
        .set('Origin', ALLOWED_ORIGIN)
        .set('Access-Control-Request-Method', 'GET');

      expect(response.headers['access-control-allow-origin']).toBe(
        ALLOWED_ORIGIN,
      );
      expect(response.headers['x-content-type-options']).toBe('nosniff');
    });

    it('still refuses an origin that is not on the allowlist', async () => {
      const response = await request(dev.getHttpServer())
        .get(`${API_BASE_PATH}/health`)
        .set('Origin', 'https://evil.example.com')
        .expect(200);

      expect(response.headers['access-control-allow-origin']).toBeUndefined();
      expect(response.headers['x-content-type-options']).toBe('nosniff');
    });
  });

  /**
   * The real-time side (Feature 028), and the answer is more definite than
   * "still works": **Helmet cannot reach the handshake at all.**
   *
   * Engine.IO attaches its own `request` listener to the raw HTTP server and
   * answers anything under `/socket.io/` before Express is given the request.
   * So the handshake never enters the middleware chain Helmet was registered
   * into — it carries none of the security headers, and by the same token there
   * is no ordering, no CSP and no HSTS that could interfere with it. That is
   * asserted rather than assumed, because "the websocket still connects" is
   * only reassuring if it is known *why*.
   *
   * Nothing is lost by their absence: these headers instruct a browser about a
   * document, and a Socket.IO handshake is not one. The upgrade's own CORS is
   * `NotificationSocketIoAdapter`'s, from the same `buildCorsOptions` the HTTP
   * side uses, and it is untouched here.
   *
   * Deliberately not a full client connection: that would add
   * `socket.io-client` as a dependency, and the messages after the handshake
   * travel on a socket no HTTP middleware can see.
   */
  describe('alongside the notification websocket', () => {
    it('leaves the handshake answered by Engine.IO, ahead of the chain', async () => {
      const response = await request(dev.getHttpServer())
        .get('/socket.io/')
        .query({ EIO: '4', transport: 'polling' });

      // Answered by the adapter — not Express rendering an unmatched route.
      expect(response.status).toBe(200);
      expect(response.text).toContain('"sid"');

      // And answered before Express, which is why Helmet is not on it.
      expect(response.headers['x-content-type-options']).toBeUndefined();
    });
  });
});
