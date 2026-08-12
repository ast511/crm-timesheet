import { ConfigService } from '@nestjs/config';

import {
  buildHelmetOptions,
  CSP_MODE_KEY,
  CspMode,
  HSTS_ENABLED_KEY,
} from './helmet.config';

/** Narrows the union Helmet's types use for "on, off, or configured". */
type CspOptions = {
  useDefaults?: boolean;
  directives?: Record<string, unknown>;
};
type HstsOptions = {
  maxAge?: number;
  includeSubDomains?: boolean;
  preload?: boolean;
};

describe('buildHelmetOptions', () => {
  const buildFrom = (env: Record<string, unknown> = {}) =>
    buildHelmetOptions(new ConfigService(env));

  const directivesOf = (env: Record<string, unknown> = {}) =>
    (buildFrom(env).contentSecurityPolicy as CspOptions).directives ?? {};

  describe('the headers that are always on', () => {
    it('refuses content-type sniffing', () => {
      expect(buildFrom().xContentTypeOptions).toBe(true);
    });

    /**
     * `DENY` rather than `SAMEORIGIN`: this API has no page of its own, so
     * "same origin" would be describing a document that does not exist.
     */
    it('denies framing outright', () => {
      expect(buildFrom().xFrameOptions).toEqual({ action: 'deny' });
    });

    /** Paths here carry ids, and an API renders no links to leak them from. */
    it('sends no referrer', () => {
      expect(buildFrom().referrerPolicy).toEqual({ policy: 'no-referrer' });
    });

    it('keeps responses same-origin as a subresource', () => {
      expect(buildFrom().crossOriginResourcePolicy).toEqual({
        policy: 'same-origin',
      });
    });
  });

  /**
   * The toggle whose consequences outlive the response, so both states are
   * pinned. Off is what makes plain-HTTP development work; on is what a TLS
   * deployment turns on once, deliberately.
   */
  describe('HSTS', () => {
    it.each([
      ['nothing is set', {}],
      ['the flag is false', { [HSTS_ENABLED_KEY]: false }],
      ['the flag is the string "false"', { [HSTS_ENABLED_KEY]: 'false' }],
    ])('is off when %s', (_case, env) => {
      expect(buildFrom(env).strictTransportSecurity).toBe(false);
    });

    /**
     * Nothing a reader could mistake for "on" switches it on. A value like
     * `yes` is refused at startup by `env.validation.ts`; this asserts that a
     * caller reaching the builder directly does not get the header either.
     */
    it.each(['yes', '1', 'TRUE', 'on', ''])(
      'stays off for the value %p',
      (flag) => {
        expect(
          buildFrom({ [HSTS_ENABLED_KEY]: flag }).strictTransportSecurity,
        ).toBe(false);
      },
    );

    it.each([true, 'true'])('is on when the flag is %p', (flag) => {
      const hsts = buildFrom({
        [HSTS_ENABLED_KEY]: flag,
      }).strictTransportSecurity as HstsOptions;

      expect(hsts.maxAge).toBe(31_536_000);
      expect(hsts.includeSubDomains).toBe(true);
    });

    /** Preloading hands the commitment to browser vendors; getting off the
     * list takes months, so it is never opted into from here. */
    it('never asks to be preloaded', () => {
      const hsts = buildFrom({
        [HSTS_ENABLED_KEY]: true,
      }).strictTransportSecurity as HstsOptions;

      expect(hsts.preload).toBe(false);
    });
  });

  describe('the content security policy', () => {
    it('serves exactly the declared directives, with none of Helmet’s own', () => {
      expect(
        (buildFrom().contentSecurityPolicy as CspOptions).useDefaults,
      ).toBe(false);
    });

    it('falls back to a deny-by-default floor', () => {
      expect(directivesOf()['default-src']).toEqual(["'self'"]);
    });

    it.each([
      ['object-src', ["'none'"]],
      ['frame-ancestors', ["'none'"]],
      ['script-src-attr', ["'none'"]],
      ['base-uri', ["'self'"]],
      ['form-action', ["'self'"]],
      ['connect-src', ["'self'"]],
    ])('sets %s to %p in every mode', (directive, expected) => {
      expect(directivesOf()[directive]).toEqual(expected);
      expect(
        directivesOf({ [CSP_MODE_KEY]: CspMode.Relaxed })[directive],
      ).toEqual(expected);
    });

    /**
     * Omitted deliberately. It is a statement about an HTML document's
     * subresources, this backend serves none, and on a page opened over plain
     * `http://localhost` it would rewrite every subresource request to HTTPS.
     */
    it('does not upgrade insecure requests', () => {
      expect(directivesOf()['upgrade-insecure-requests']).toBeUndefined();
    });

    it('allows nothing inline by default', () => {
      expect(directivesOf()['script-src']).toEqual(["'self'"]);
      expect(directivesOf()['style-src']).toEqual(["'self'"]);
    });

    it('allows inline scripts and styles in the relaxed mode', () => {
      const directives = directivesOf({ [CSP_MODE_KEY]: CspMode.Relaxed });

      expect(directives['script-src']).toEqual(["'self'", "'unsafe-inline'"]);
      expect(directives['style-src']).toEqual(["'self'", "'unsafe-inline'"]);
    });

    /** Relaxing is for inline code, never for evaluating strings. */
    it('never allows eval, in either mode', () => {
      const relaxed = directivesOf({ [CSP_MODE_KEY]: CspMode.Relaxed });

      expect(JSON.stringify(directivesOf())).not.toContain('unsafe-eval');
      expect(JSON.stringify(relaxed)).not.toContain('unsafe-eval');
    });

    /**
     * `env.validation.ts` refuses an unknown mode at startup, so this is about
     * the builder being correct on its own — and about which way it fails.
     */
    it.each([undefined, '', 'permissive', 'off'])(
      'falls back to the strict policy for the mode %p',
      (mode) => {
        expect(directivesOf({ [CSP_MODE_KEY]: mode })['script-src']).toEqual([
          "'self'",
        ]);
      },
    );

    it('accepts the mode in any casing', () => {
      expect(
        directivesOf({ [CSP_MODE_KEY]: ' RELAXED ' })['script-src'],
      ).toEqual(["'self'", "'unsafe-inline'"]);
    });

    /** One base list, two modes — a directive added once appears in both. */
    it('does not mutate the shared base when relaxing', () => {
      directivesOf({ [CSP_MODE_KEY]: CspMode.Relaxed });

      expect(directivesOf()['script-src']).toEqual(["'self'"]);
    });
  });
});
