import { ConfigService } from '@nestjs/config';
import { HelmetOptions } from 'helmet';

/**
 * Helmet's own Content-Security-Policy option shape, named here because the
 * package exports the middleware but not its options type.
 */
export type ContentSecurityPolicyOptions = Exclude<
  HelmetOptions['contentSecurityPolicy'],
  boolean | undefined
>;

/** Environment variable that turns `Strict-Transport-Security` on. */
export const HSTS_ENABLED_KEY = 'SECURITY_HSTS_ENABLED';

/** Environment variable selecting which Content Security Policy is served. */
export const CSP_MODE_KEY = 'SECURITY_CSP_MODE';

/**
 * How permissive the Content Security Policy is.
 *
 * Two values and no more, because there are exactly two situations: this
 * deployment serves JSON only, or it also serves a page whose scripts and
 * styles are written inline. Everything else is a directive change, which is a
 * code change with a reason attached rather than a knob.
 */
export enum CspMode {
  /** JSON only. Nothing inline, nothing from anywhere else. The default. */
  Strict = 'strict',
  /** Inline scripts and styles from this origin — Swagger UI, a served SPA. */
  Relaxed = 'relaxed',
}

/**
 * How long a browser should refuse to speak plain HTTP to this host — one year.
 *
 * The value every HSTS guide lands on, and the floor the preload list requires.
 * Anything materially shorter weakens the protection to no purpose: the header
 * is refreshed on every response, so a live site keeps extending it, and a
 * short max-age only shortens the window during which a visitor who has *not*
 * been back is still protected.
 */
const HSTS_MAX_AGE_SECONDS = 31_536_000;

const SELF = "'self'";
const NONE = "'none'";
const UNSAFE_INLINE = "'unsafe-inline'";
const DATA_URI = 'data:';

/**
 * The policy every mode starts from.
 *
 * Written in the header's own kebab-case rather than Helmet's camelCase
 * spelling, so what is read here is what a browser's dev tools show — and so a
 * test asserting on the header text is comparing like with like.
 *
 * Note what is **not** here: `upgrade-insecure-requests`. It is a statement
 * about the subresources of an HTML *document*, and this backend serves none;
 * on a page served over plain `http://localhost` it would rewrite every
 * subresource request to HTTPS and break the development server. It belongs
 * with whatever serves the frontend over TLS, alongside HSTS.
 */
const BASE_DIRECTIVES: Record<string, string[]> = {
  // Everything not named below falls back to "this origin only". A deny-by
  // default floor is the point of a CSP; the directives after it are the
  // exceptions, stated deliberately.
  'default-src': [SELF],
  // Stops injected markup from rewriting `<base href>`, which would silently
  // re-point every relative URL on the page — including the ones the
  // directives below are trying to confine.
  'base-uri': [SELF],
  // Where a form may post. An injected `<form action="https://evil">` is how
  // credentials leave a page that has no script execution at all.
  'form-action': [SELF],
  // Nobody may frame this API. The modern half of the clickjacking pair whose
  // older half is `X-Frame-Options: DENY` below; both are set because coverage
  // still differs and they say the same thing.
  'frame-ancestors': [NONE],
  // `<object>`, `<embed>` and `<applet>` are plugin surfaces with no legitimate
  // use here and a long history of being one.
  'object-src': [NONE],
  'script-src': [SELF],
  // Inline event handlers — `onclick="..."` — are blocked even in the relaxed
  // mode, where `'unsafe-inline'` re-permits inline `<script>` blocks. Swagger
  // UI and a bundled SPA need the latter and neither needs the former.
  'script-src-attr': [NONE],
  'style-src': [SELF],
  // `data:` because an inline SVG or a small embedded logo is ordinary, and a
  // data URI cannot execute script in an image context.
  'img-src': [SELF, DATA_URI],
  'font-src': [SELF],
  // Where the page may call — XHR, fetch, WebSocket. A served frontend talking
  // to this same origin is covered; one served from a different origin needs
  // this widened, which is the note in the feature document.
  'connect-src': [SELF],
};

/**
 * Builds the Helmet options from the environment.
 *
 * The same shape as `buildCorsOptions`: a pure function of `ConfigService`, so
 * every value is a deployment's decision rather than a literal in the source,
 * and so both toggles can be asserted in either state without booting a server.
 *
 * ## What this does and does not buy today
 *
 * The non-CSP headers apply to **every response this API sends** and are worth
 * having immediately: a JSON body is not reinterpreted as HTML, the API cannot
 * be framed, and a URL carrying an id does not leak through `Referer`.
 *
 * The CSP is different, and it is worth being honest about it. A Content
 * Security Policy governs what an HTML *document* may load and execute. This
 * backend returns JSON, so today the policy is a scaffold: it costs nothing,
 * breaks nothing, and does nothing. It starts working the moment this process —
 * or a reverse proxy in front of it — serves HTML, and setting it up now is
 * what makes that a configuration change rather than a security review.
 */
export function buildHelmetOptions(
  configService: ConfigService,
): HelmetOptions {
  const cspMode = readCspMode(configService.get<string>(CSP_MODE_KEY));
  const hstsEnabled = readFlag(configService.get(HSTS_ENABLED_KEY));

  return {
    contentSecurityPolicy: {
      // Helmet's own defaults are not merged in, so the policy served is
      // exactly the list above. Merging would quietly add directives nobody
      // here decided on — `upgrade-insecure-requests` among them — and the
      // header would drift with the dependency's version rather than with this
      // file.
      useDefaults: false,
      directives: buildDirectives(cspMode),
    },

    // `nosniff`. A browser that guesses a response's type can decide a JSON
    // body full of user-supplied text is HTML and run the script in it. This is
    // the single most valuable header for an API and the reason it is one line.
    xContentTypeOptions: true,

    // `X-Frame-Options: DENY`. Not `SAMEORIGIN`: this API has no page of its
    // own to frame, so "same origin" would only describe a document that does
    // not exist. Deny says what is meant.
    xFrameOptions: { action: 'deny' },

    // Send no `Referer` at all. Paths here carry ids — `/leave-requests/lvr-1`,
    // `/employees/emp-7` — and the strictest policy is free for an API that
    // renders no links for anybody to follow. A served frontend usually wants
    // `strict-origin-when-cross-origin` instead, which still hides the path.
    referrerPolicy: { policy: 'no-referrer' },

    // Who may load a response as a subresource. Enforced for `no-cors` requests
    // — an `<img>`, a `<script>`, a `<link>` — and **not** for the CORS-mode
    // `fetch` the frontend calls this API with, which is why this coexists with
    // `buildCorsOptions` rather than fighting it. A page that pointed an
    // `<img src>` straight at an API URL from another origin would be blocked,
    // and that is a deliberate default rather than an oversight.
    crossOriginResourcePolicy: { policy: 'same-origin' },

    // **Off unless a deployment says otherwise, and the default is what makes
    // local development work.** HSTS tells a browser to refuse plain HTTP to
    // this host for a year, it is remembered per host rather than per port, and
    // it cannot be taken back by removing the header — only by serving
    // `max-age=0` from the HTTPS site a developer no longer has. Sent from
    // `http://localhost:3000` it is ignored by browsers today and is a trap the
    // day anything on `localhost` is opened over TLS.
    //
    // Turn it on once, in an environment that is already served over HTTPS and
    // intends to stay that way. `includeSubDomains` is part of that decision:
    // it commits every subdomain of the host, including ones that do not exist
    // yet. `preload` is deliberately left off — it hands the commitment to
    // browser vendors, and getting off that list takes months.
    strictTransportSecurity: hstsEnabled
      ? {
          maxAge: HSTS_MAX_AGE_SECONDS,
          includeSubDomains: true,
          preload: false,
        }
      : false,
  };
}

/**
 * The policy served **on the documentation route only** (Feature 038).
 *
 * Feature 037 wrote a note for exactly this moment: Swagger UI would render
 * blank under the strict policy, with CSP violations in the console, and the
 * answer recorded there was to set `SECURITY_CSP_MODE=relaxed`. That would have
 * worked, and it would have loosened the policy on **every** response in the
 * deployment to fix one HTML page. This is the narrower version of the same
 * fix: the relaxation is a separate middleware mounted at `/api/docs`, so every
 * other route keeps whatever policy the environment configured — strict, by
 * default and in production.
 *
 * **Exactly one directive is loosened, and it is not the one 037 predicted.**
 * The UI's HTML carries two inline `<style>` blocks, so `style-src` needs
 * `'unsafe-inline'`. Its *scripts* are all external files served from this same
 * origin (`swagger-ui-bundle.js`, `swagger-ui-standalone-preset.js`,
 * `swagger-ui-init.js`), which `script-src 'self'` already allows — so
 * `script-src` is left alone, and inline script stays blocked on the one page
 * in this application that renders any HTML at all. `'unsafe-eval'` is not
 * granted, `script-src-attr` stays at `'none'`, and no third-party origin is
 * added: the UI is served entirely from `swagger-ui-dist` inside this process,
 * not from a CDN.
 *
 * Built on top of {@link buildDirectives} rather than beside it, so the docs
 * page inherits every directive the deployment configured and differs from it
 * in one line. A directive tightened in `BASE_DIRECTIVES` tightens here too.
 *
 * If a future version of Swagger UI does start emitting an inline `<script>`,
 * the symptom is a blank page and the fix is one entry in this function — not a
 * change to what every other response carries.
 */
export function buildDocsCspOptions(
  configService: ConfigService,
): ContentSecurityPolicyOptions {
  const mode = readCspMode(configService.get<string>(CSP_MODE_KEY));

  return {
    useDefaults: false,
    directives: {
      ...buildDirectives(mode),
      'style-src': [SELF, UNSAFE_INLINE],
    },
  };
}

/** The directives for a mode, built from the one base list. */
function buildDirectives(mode: CspMode): Record<string, string[]> {
  if (mode !== CspMode.Relaxed) {
    return BASE_DIRECTIVES;
  }

  // Exactly two directives are loosened, and both for the same reason: Swagger
  // UI and a Vite build both emit an inline `<script>` and inline `<style>`.
  // Nothing else is widened — no third-party origin, no `'unsafe-eval'`, and
  // `script-src-attr` stays at `'none'`.
  return {
    ...BASE_DIRECTIVES,
    'script-src': [SELF, UNSAFE_INLINE],
    'style-src': [SELF, UNSAFE_INLINE],
  };
}

/**
 * Reads the CSP mode, falling back to the strict one.
 *
 * Never reached with an unknown value in the running application —
 * `env.validation.ts` refuses to boot on one — so the fallback exists to make
 * this function correct on its own, for a test or any later caller that reads
 * the variable without going through that contract. It falls back to the
 * *stricter* mode, which is the direction a mistake should fail in.
 */
function readCspMode(rawValue: string | undefined): CspMode {
  return rawValue?.trim().toLowerCase() === CspMode.Relaxed
    ? CspMode.Relaxed
    : CspMode.Strict;
}

/**
 * Reads a boolean toggle from a variable that may still be text.
 *
 * `env.validation.ts` converts it to a real boolean for the running
 * application; a spec building a bare `ConfigService`, and a `.env` read
 * without that contract, hand over the string. Only the exact spelling counts,
 * for the reason `@ToBoolean()` accepts only two: a value nobody can read as
 * `true` must not switch on the one header here that cannot be taken back.
 */
function readFlag(value: unknown): boolean {
  return value === true || value === 'true';
}
