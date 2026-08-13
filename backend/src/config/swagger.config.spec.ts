import { ConfigService } from '@nestjs/config';

import { API_BASE_PATH, API_PREFIX } from './api.constants';
import { NodeEnvironment } from './env.validation';
import {
  SWAGGER_DOCS_PATH,
  SWAGGER_DOCS_ROUTE,
  SWAGGER_ENABLED_KEY,
  SWAGGER_JSON_ROUTE,
  isSwaggerEnabled,
} from './swagger.config';

describe('isSwaggerEnabled', () => {
  const enabledWith = (env: Record<string, unknown>) =>
    isSwaggerEnabled(new ConfigService(env));

  /**
   * The default that makes `npm run start:dev` and a CI run work with nothing
   * configured — the arrangement `SECURITY_HSTS_ENABLED` and
   * `NOTIFICATION_SCHEDULER_ENABLED` both use.
   */
  describe('when the flag is not set', () => {
    it('serves the documentation in development', () => {
      expect(enabledWith({ NODE_ENV: NodeEnvironment.Development })).toBe(true);
    });

    it('serves the documentation in test', () => {
      expect(enabledWith({ NODE_ENV: NodeEnvironment.Test })).toBe(true);
    });

    /** The whole point of the gate: exposure in production is opt-in. */
    it('does NOT serve the documentation in production', () => {
      expect(enabledWith({ NODE_ENV: NodeEnvironment.Production })).toBe(false);
    });

    /**
     * An environment that names no `NODE_ENV` is a developer machine — the
     * contract defaults it to `development` before anything reads it, and this
     * function agrees rather than failing closed on a value it was never given.
     */
    it('serves the documentation when NODE_ENV is absent', () => {
      expect(enabledWith({})).toBe(true);
    });
  });

  describe('when the flag is set', () => {
    it('serves the documentation in production when asked to', () => {
      expect(
        enabledWith({
          NODE_ENV: NodeEnvironment.Production,
          [SWAGGER_ENABLED_KEY]: true,
        }),
      ).toBe(true);
    });

    it('withholds it outside production when asked to', () => {
      expect(
        enabledWith({
          NODE_ENV: NodeEnvironment.Development,
          [SWAGGER_ENABLED_KEY]: false,
        }),
      ).toBe(false);
    });

    /**
     * `ConfigService` hands over a real boolean for the running application and
     * a string for a spec or a `.env` read without the contract. Both spellings
     * have to work, for the reason `readFlag` in `helmet.config.ts` accepts
     * both.
     */
    it.each([
      ['true', true],
      ['false', false],
    ])('coerces the string %p', (raw, expected) => {
      expect(
        enabledWith({
          NODE_ENV: NodeEnvironment.Production,
          [SWAGGER_ENABLED_KEY]: raw,
        }),
      ).toBe(expected);
    });

    /**
     * A value nobody can read as a yes must not publish the API surface of a
     * production deployment. Every near miss falls through to the `NODE_ENV`
     * default, which is the direction a mistake should fail in.
     */
    it.each(['yes', '1', 'on', 'TRUE', 'True', '', 'enabled'])(
      'refuses to treat %p as a yes in production',
      (raw) => {
        expect(
          enabledWith({
            NODE_ENV: NodeEnvironment.Production,
            [SWAGGER_ENABLED_KEY]: raw,
          }),
        ).toBe(false);
      },
    );

    /** …and by the same rule, a near miss does not switch it off in dev. */
    it.each(['no', '0', 'off', 'FALSE'])(
      'refuses to treat %p as a no in development',
      (raw) => {
        expect(
          enabledWith({
            NODE_ENV: NodeEnvironment.Development,
            [SWAGGER_ENABLED_KEY]: raw,
          }),
        ).toBe(true);
      },
    );
  });
});

describe('the documented paths', () => {
  /**
   * Under the API prefix, so a reverse proxy routing on `/api` forwards the
   * documentation too — and deliberately *not* under `/api/v1`, because the
   * document describes every version the API serves.
   */
  it('serves the UI under the API prefix but outside the version', () => {
    expect(SWAGGER_DOCS_PATH).toBe(`${API_PREFIX}/docs`);
    expect(SWAGGER_DOCS_ROUTE).toBe('/api/docs');
    expect(SWAGGER_DOCS_ROUTE.startsWith(API_BASE_PATH)).toBe(false);
  });

  /**
   * `SwaggerModule` derives the JSON path from the UI path by appending
   * `-json`. This constant follows that behaviour rather than deciding it, so
   * the pair is pinned here and again over HTTP in `openapi.e2e-spec.ts`.
   */
  it('serves the raw document beside it', () => {
    expect(SWAGGER_JSON_ROUTE).toBe(`${SWAGGER_DOCS_ROUTE}-json`);
  });
});
