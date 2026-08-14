import { ConfigService } from '@nestjs/config';

import { NodeEnvironment } from '../../config/env.validation';
import {
  DEFAULT_REFRESH_COOKIE_NAME,
  DEFAULT_REFRESH_COOKIE_PATH,
  loadRefreshCookieConfig,
  REFRESH_COOKIE_KEYS,
  REFRESH_COOKIE_SAME_SITE,
} from './refresh-cookie.config';

/**
 * The cookie's attributes, in every state a deployment can put them in.
 *
 * A pure function of `ConfigService`, so both sides of every toggle are
 * asserted without booting a server — the shape `helmet.config.spec.ts` and
 * `cors.config.spec.ts` use, and for the same reason: these are the settings
 * whose wrong value produces no error anywhere. A cookie the browser refuses to
 * store, or stores and never sends, looks from the server exactly like a person
 * who signed out.
 */
describe('loadRefreshCookieConfig', () => {
  const loadFrom = (values: Record<string, unknown> = {}) =>
    loadRefreshCookieConfig(new ConfigService(values));

  /**
   * **The developer-machine default**, and the one an environment that says
   * nothing at all receives: an `HttpOnly` cookie over plain HTTP, scoped to the
   * auth routes, that another site cannot cause to be sent.
   */
  it('defaults to a lax, non-secure cookie scoped to the auth routes', () => {
    expect(loadFrom()).toEqual({
      name: DEFAULT_REFRESH_COOKIE_NAME,
      path: DEFAULT_REFRESH_COOKIE_PATH,
      secure: false,
      sameSite: REFRESH_COOKIE_SAME_SITE.Lax,
    });
  });

  /** Derived from the version prefix, so the two cannot drift apart. */
  it('scopes the cookie under the versioned API base path', () => {
    expect(DEFAULT_REFRESH_COOKIE_PATH).toBe('/api/v1/auth');
  });

  describe('Secure', () => {
    /**
     * The half that matters in a real deployment: nothing has to be configured
     * for the refresh token to stop being allowed over plain HTTP.
     */
    it('is on in production with nothing configured', () => {
      expect(loadFrom({ NODE_ENV: NodeEnvironment.Production }).secure).toBe(
        true,
      );
    });

    it.each([NodeEnvironment.Development, NodeEnvironment.Test])(
      'is off in %s, so a cookie set over http is sent back',
      (environment) => {
        expect(loadFrom({ NODE_ENV: environment }).secure).toBe(false);
      },
    );

    /** A developer machine served over TLS is a real thing. */
    it('can be turned on outside production', () => {
      expect(
        loadFrom({
          NODE_ENV: NodeEnvironment.Development,
          [REFRESH_COOKIE_KEYS.secure]: 'true',
        }).secure,
      ).toBe(true);
    });

    /**
     * And off inside it. Not a mistake this function prevents: TLS terminating
     * at a proxy this process cannot see is a real topology, and refusing it
     * here would be a file guessing at a network it cannot observe.
     */
    it('can be turned off inside production', () => {
      expect(
        loadFrom({
          NODE_ENV: NodeEnvironment.Production,
          [REFRESH_COOKIE_KEYS.secure]: 'false',
        }).secure,
      ).toBe(false);
    });

    /** `env.validation.ts` hands over a real boolean; a bare `.env` does not. */
    it('reads the flag as a boolean or as its exact spelling', () => {
      expect(loadFrom({ [REFRESH_COOKIE_KEYS.secure]: true }).secure).toBe(
        true,
      );
      expect(
        loadFrom({
          NODE_ENV: NodeEnvironment.Production,
          [REFRESH_COOKIE_KEYS.secure]: false,
        }).secure,
      ).toBe(false);
    });

    /**
     * Anything that only *looks* like an answer falls through to the
     * environment's default rather than being read as either — the closed
     * direction in production, which is where it matters.
     */
    it.each(['yes', 'on', '1', 'TRUE'])(
      'ignores %p and falls back to the environment',
      (flag) => {
        expect(
          loadFrom({
            NODE_ENV: NodeEnvironment.Production,
            [REFRESH_COOKIE_KEYS.secure]: flag,
          }).secure,
        ).toBe(true);
      },
    );
  });

  describe('SameSite', () => {
    it.each([
      REFRESH_COOKIE_SAME_SITE.Lax,
      REFRESH_COOKIE_SAME_SITE.Strict,
      REFRESH_COOKIE_SAME_SITE.None,
    ])('reads %p', (value) => {
      expect(loadFrom({ [REFRESH_COOKIE_KEYS.sameSite]: value }).sameSite).toBe(
        value,
      );
    });

    it('is case- and whitespace-insensitive', () => {
      expect(
        loadFrom({ [REFRESH_COOKIE_KEYS.sameSite]: '  Strict ' }).sameSite,
      ).toBe(REFRESH_COOKIE_SAME_SITE.Strict);
    });

    /**
     * Unreachable in the running application — the environment contract refuses
     * an unknown value at startup — so what this asserts is the *direction* the
     * fallback fails in: towards the value that has the CSRF property, never
     * towards `none`.
     */
    it.each(['none-ish', 'cross-site', '', 'true'])(
      'falls back to lax rather than none for %p',
      (value) => {
        expect(
          loadFrom({ [REFRESH_COOKIE_KEYS.sameSite]: value }).sameSite,
        ).toBe(REFRESH_COOKIE_SAME_SITE.Lax);
      },
    );
  });

  describe('name and path', () => {
    it('takes both from the environment when they are set', () => {
      const config = loadFrom({
        [REFRESH_COOKIE_KEYS.name]: 'session_rt',
        [REFRESH_COOKIE_KEYS.path]: '/api/v1',
      });

      expect(config.name).toBe('session_rt');
      expect(config.path).toBe('/api/v1');
    });

    /** A cleared placeholder means "not set", as it does everywhere else here. */
    it.each(['', '   '])('treats %p as unset', (value) => {
      const config = loadFrom({
        [REFRESH_COOKIE_KEYS.name]: value,
        [REFRESH_COOKIE_KEYS.path]: value,
      });

      expect(config.name).toBe(DEFAULT_REFRESH_COOKIE_NAME);
      expect(config.path).toBe(DEFAULT_REFRESH_COOKIE_PATH);
    });

    it('trims what it is given', () => {
      expect(
        loadFrom({ [REFRESH_COOKIE_KEYS.name]: '  session_rt  ' }).name,
      ).toBe('session_rt');
    });
  });
});
