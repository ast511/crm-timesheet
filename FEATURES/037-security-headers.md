# Security Headers

## Goal

Close a gap that was total rather than partial: **this API set no security
response headers at all.** Every reply left the server with nothing telling a
browser how to treat it — and with `X-Powered-By: Express` telling anybody
scanning it what to look up.

This feature adds the standard set through one well-maintained middleware,
configured in the one function where every global concern already lives. It is
the same shape as Features 033, 034 and 035: cross-cutting plumbing, applied
everywhere, with the deployment-sensitive parts made explicit rather than
inherited by accident.

**Be honest about what this buys today.** The non-CSP headers apply to every
response immediately and are worth having on their own. The Content Security
Policy is a scaffold: a CSP governs what an HTML *document* may load and
execute, and this backend answers with JSON. It costs nothing, breaks nothing
and does nothing until HTML and JavaScript are served — from this process or
from a proxy in front of it. Setting it up correctly now is what makes that day
a configuration change instead of a security review.

## Requirements

- Security headers on **every** response, including error responses.
- Registered inside `configureApp`, so the e2e suite exercises the same
  configuration the server boots with.
- The options in a per-concern config file reading `ConfigService`, in the shape
  `cors.config.ts` and `trust-proxy.config.ts` established.
- Defaults safe for local, plain-HTTP development — `npm run start:dev`
  unchanged.
- HSTS and CSP env-gated, because both have consequences that outlive the
  response.
- Coexistence with CORS, with the Socket.IO handshake, and with the Feature 033
  envelope — headers only, no body and no status code touched.
- No Prisma schema change. No authorization change. No rate-limiting change.

---

## The headers, and why each one

| Header | Value | Why |
| --- | --- | --- |
| `X-Content-Type-Options` | `nosniff` | **The most valuable header here, and it is one line.** Without it a browser may decide a JSON body full of user-supplied text is really HTML and run the script in it. Every response this API sends is a response somebody could try that on. |
| `X-Frame-Options` | `DENY` | Nothing may frame this API. `DENY` rather than `SAMEORIGIN`: this backend has no page of its own, so "same origin" would be permitting a document that does not exist. |
| `Content-Security-Policy` | `frame-ancestors 'none'` (+ the rest below) | The modern half of the clickjacking pair. Both are sent because browser coverage still differs and they say the same thing. |
| `Referrer-Policy` | `no-referrer` | Paths here carry ids — `/leave-requests/lvr-1`, `/employees/emp-7`. The strictest policy is free for an API that renders no links for anybody to follow, so nothing is traded away for it. |
| `Cross-Origin-Resource-Policy` | `same-origin` | Who may load a response as a subresource. See the CORS section — this is the one default that interacts with a cross-origin frontend, and it does so in a way that leaves `fetch` alone. |
| `Strict-Transport-Security` | *absent by default* | Env-gated. The whole argument is below. |
| `X-Powered-By` | *removed* | Express announces itself and, by implication, its version on every response. Free reconnaissance for anybody matching a deployment against a CVE list. |

Helmet also sends `Cross-Origin-Opener-Policy`, `Origin-Agent-Cluster`,
`X-DNS-Prefetch-Control`, `X-Download-Options`,
`X-Permitted-Cross-Domain-Policies` and `X-XSS-Protection: 0`. These are its
defaults, they are document-level instructions that a JSON response simply does
not exercise, and they are left alone: they cost a few bytes and there is no
argument for turning any of them off. The six in the table are the ones this
project made a decision about, so those are the six written explicitly in
`helmet.config.ts` with the reason attached.

`X-XSS-Protection: 0` is worth one sentence, because a reader may expect the
opposite. The header switches off a legacy browser XSS filter that was itself
exploitable and that every current browser has removed; `0` is the correct
modern value and disabling nothing real.

---

## The Content Security Policy

```text
default-src 'self'; base-uri 'self'; form-action 'self';
frame-ancestors 'none'; object-src 'none';
script-src 'self'; script-src-attr 'none'; style-src 'self';
img-src 'self' data:; font-src 'self'; connect-src 'self'
```

`useDefaults: false`, so the policy served is exactly this list. Merging
Helmet's own defaults would quietly add directives nobody here decided on and
the header would then drift with the dependency's version rather than with this
file.

| Directive | Why |
| --- | --- |
| `default-src 'self'` | The deny-by-default floor. Everything not named below falls back to it; the rest of the list is exceptions, stated deliberately. |
| `base-uri 'self'` | Stops injected markup from rewriting `<base href>`, which would silently re-point every relative URL on the page — including the ones the other directives are confining. |
| `form-action 'self'` | An injected `<form action="https://evil">` is how credentials leave a page that has no script execution at all. |
| `frame-ancestors 'none'` | Clickjacking, as above. |
| `object-src 'none'` | `<object>` / `<embed>` are plugin surfaces with no use here and a long history of being one. |
| `script-src-attr 'none'` | Blocks inline event handlers (`onclick="…"`) **in both modes**, including the relaxed one that re-permits inline `<script>` blocks. Swagger UI and a bundled SPA need the latter; neither needs the former. |
| `img-src 'self' data:` | An inline SVG or a small embedded logo is ordinary, and a data URI cannot execute script in an image context. |

### `upgrade-insecure-requests` is deliberately absent

It is Helmet's default and it is left out. The directive is a statement about an
HTML document's *subresources*, this backend serves none — and on a page opened
over plain `http://localhost` it rewrites every subresource request to HTTPS and
breaks the development server. It belongs with whatever serves the frontend over
TLS, alongside HSTS. A test pins its absence so it cannot return by way of a
dependency upgrade.

### What must change later — the actionable part

**When Swagger UI is added** (a separate feature): set `SECURITY_CSP_MODE=relaxed`
on the deployments that expose it. Swagger UI emits an inline `<script>` and
inline `<style>`, both of which `strict` blocks — the symptom is a documentation
page that renders blank with CSP violations in the browser console, which is
exactly the kind of breakage this note exists to pre-empt. The relaxed mode adds
`'unsafe-inline'` to `script-src` and `style-src` and **nothing else**: no
third-party origin, no `'unsafe-eval'`, and `script-src-attr` stays at `'none'`.

**When the React/Vite frontend is served by this backend or by a proxy in front
of it**, three things need deciding, and only the first is already provided for:

1. **Inline scripts and styles.** A Vite production build emits an inline module
   preload script; `SECURITY_CSP_MODE=relaxed` covers it. The better answer, when
   somebody has time for it, is a per-response nonce rather than
   `'unsafe-inline'` — that needs a middleware generating one per request and a
   template that stamps it into the HTML, which is a piece of work rather than a
   setting, and it is recorded under *Future Improvements* rather than guessed at
   now.
2. **`connect-src`**, if the frontend is served from a **different** origin than
   the API. `'self'` then refers to the frontend's origin and the API's origin
   must be added, or every XHR is blocked by the page's own policy. Note that
   this is a directive on the response that carries the *HTML*, so in that
   topology it is the frontend's server that needs it — not this one.
3. **`Cross-Origin-Resource-Policy`**, if the frontend loads anything from the
   API with a plain `<img src>` or `<link>` rather than `fetch`. See below.

**When TLS is in place**, add `upgrade-insecure-requests` at the same time as
`SECURITY_HSTS_ENABLED=true`. The two are the same statement about the same
deployment.

**What must never happen:** turning the policy off to make something work. There
is deliberately no value of `SECURITY_CSP_MODE` that does it, and an unknown
value is refused at startup. A page that breaks under `strict` wants `relaxed`;
a page that breaks under `relaxed` wants a directive change with a reason
attached.

---

## HSTS — the deployment implication

**Off by default, and that default is what makes local development work.**

`Strict-Transport-Security` tells a browser to refuse plain HTTP to a hostname
for a year. Three properties make it the one header here that must be opted
into:

- **It is remembered per host, not per port.** Sent once from
  `http://localhost:3000`, it applies to `localhost` — every other project on
  that machine included.
- **It cannot be withdrawn by removing the header.** The only way back is to
  serve `max-age=0` from the HTTPS site, which by then may be the thing that is
  broken.
- **It is a promise about infrastructure the backend cannot see.** Whether TLS
  terminates in front of this process is a fact about the deployment, not about
  the code.

Enabled before a certificate is in place, it is an outage that persists inside
every visitor's browser and that no deployment can reach.

So: `SECURITY_HSTS_ENABLED=true`, once, on an environment already served over
HTTPS and intending to stay that way. It sends
`max-age=31536000; includeSubDomains`.

- **A year** is the value every guide lands on and the floor the preload list
  requires. A shorter one only shortens the window during which a visitor who
  has not been back recently is still protected.
- **`includeSubDomains`** is part of the same commitment: it covers every
  subdomain of the host, including ones that do not exist yet.
- **`preload` is never requested.** That hands the commitment to browser vendors
  and getting off the list takes months. A test asserts the word never appears.

**An explicit flag rather than `NODE_ENV === 'production'`**, for the reason
`TRUST_PROXY` is one: "production" does not imply TLS terminates anywhere this
backend can see, and a commitment this hard to reverse should be something
somebody typed.

### Interaction with `TRUST_PROXY`

Helmet sends the header on every response and does not itself check whether the
request arrived over TLS, so **HSTS behaves identically behind a proxy and
without one** — there is no `req.secure` check to get wrong. Browsers ignore the
header when it arrives over plain HTTP, which is what makes the local default
harmless rather than merely unused. `TRUST_PROXY` remains what Feature 034
described it as: the setting that decides what `request.ip` resolves to. The two
are independent, and this feature changes nothing about it.

---

## Where it is registered, and why first

```ts
export function configureApp(app: INestApplication): void {
  app.use(helmet(buildHelmetOptions(app.get(ConfigService))));

  app.setGlobalPrefix(API_PREFIX);
  // … versioning, ValidationPipe, interceptor, filter, trust proxy, CORS, …
}
```

**In `configureApp`, not `main.ts`** — the rule that file's own comment states,
and the reason the `ValidationPipe`, the response interceptor and `trust proxy`
are all there: a spec booting through this function must get the server the
deployment gets. Registered in `main.ts`, none of the tests below would see a
single header.

**First in the chain, and that is the feature rather than a detail.** Helmet
writes its headers when its middleware runs, so registering it ahead of
everything else means they are already on the response object by the time
anything can answer:

| Response | Answered by | Would a later registration cover it? |
| --- | --- | --- |
| `200` on a real route | the controller | yes |
| `404` unmatched route | the router, no handler involved | no |
| `401` from `JwtAuthGuard` | a global guard, before any controller | no |
| `400` from the `ValidationPipe` | the pipe, before the handler | no |
| `429` from the rate limiter | a global guard | no |
| CORS preflight | `enableCors`, which ends the response | no |

Every row but the first is a response an attacker is more likely to produce than
a legitimate client is. Headers present only on the successful path would be
missing from exactly the traffic they were installed for. Three tests pin this
from the outside.

---

## Interoperation

### CORS — different questions, both answered

CORS decides **which origins may read a response**; these headers tell a browser
**what it may do with one**. They coexist because they are not the same
mechanism, and the existing `buildCorsOptions` is untouched. A test asserts both
sets appear on one response, and another asserts the security headers are on a
*preflight* — the response that would be missed by any registration later in the
chain.

The one place they touch is `Cross-Origin-Resource-Policy: same-origin`, and the
interaction is worth stating precisely because it is easy to get wrong in
either direction:

> CORP is enforced on **`no-cors` subresource requests** — an `<img>`, a
> `<script>`, a `<link>`. It is **not** enforced on the CORS-mode `fetch` or
> `XHR` a frontend calls this API with.

So the SPA is unaffected: every request it makes is CORS-mode and governed by
the allowlist in `CORS_ORIGINS`. What *would* be blocked is a page on another
origin pointing an `<img src>` or `<link href>` straight at an API URL. That is
a deliberate default rather than an oversight — and if a future feature serves
files that way, the change is `policy: 'cross-origin'` in `helmet.config.ts`,
made deliberately, not a knob.

### The notification WebSocket — Helmet cannot reach it

The answer here is more definite than "it still works". Engine.IO attaches its
own `request` listener to the raw HTTP server and answers anything under
`/socket.io/` **before Express is given the request**. The handshake therefore
never enters the middleware chain Helmet was registered into: it carries none of
these headers, and by the same token there is no ordering, no CSP and no HSTS
that could interfere with it.

Nothing is lost by their absence — these headers instruct a browser about a
document, and a Socket.IO handshake is not one. The upgrade's own CORS is
`NotificationSocketIoAdapter`'s, built from the same `buildCorsOptions` the HTTP
side uses, and it is untouched. A test asserts all of it, because "the websocket
still connects" is only reassuring if it is known *why*.

### The Feature 033 envelope — unchanged

Helmet adds headers and touches nothing else: no body, no status code, no
`Content-Type`. Two tests assert the success and error envelopes field by field
*through the Helmet-configured application*, so a future change to the header
middleware cannot quietly alter a body. The whole of `app.e2e-spec.ts`, which
pins exact bodies with `.expect({ … })`, is the wider regression.

---

## Environment

Two new variables, both optional, validated in `env.validation.ts` in the file's
existing style. **An environment that says nothing about them boots with every
header above except HSTS**, which is the correct configuration for a developer
machine.

| Variable | Required | Default | Accepted |
| --- | --- | --- | --- |
| `SECURITY_HSTS_ENABLED` | no | `false` | `true` / `false` |
| `SECURITY_CSP_MODE` | no | `strict` | `strict` / `relaxed` |

Two, and deliberately not more. Every other header here is a plain improvement
with no deployment consequence, so there is nothing for an operator to decide
about it; these two are the exceptions, and both are exceptions for the same
reason — their effects outlive the response that carried them.

Both are **defaulted in the reading code** rather than by an initialiser on the
contract, which is the arrangement `NOTIFICATION_SCHEDULER_ENABLED` uses: "unset"
and the safe value are then the same thing at the one place that reads them, and
the default sits beside the argument for why it is safe. What the contract adds
is that a value which *is* set has to make sense — `SECURITY_HSTS_ENABLED=yes`
and `SECURITY_CSP_MODE=off` are both refused at startup, the first because a year
of enforced HTTPS should not be switched on by a value that merely looks like a
yes, the second because there is no such mode and the answer somebody wants is
`relaxed`.

---

## The dependency

**`helmet@8.3.0`** — one package, with **no runtime dependencies of its own**.

```bash
npm install helmet
```

It is the standard Express security-headers middleware and it is here rather
than hand-rolled for the reason `@nestjs/throttler` was taken in Feature 034:
the value is not the code, which is short, but the maintained set of *correct
values* — which headers current browsers honour, what the modern spelling of
each option is, and which legacy header is now actively harmful to send
(`X-XSS-Protection`). That is a moving target this project has no reason to
track by hand.

It runs on Express, which this project uses through `@nestjs/platform-express`,
and Node ≥ 18.

---

## Database

**No change.** No model, no column, no migration. `npx prisma validate` passes
and `schema.prisma` is untouched. Response headers are a property of the
deployment, not of the company.

---

## API

**No change to any endpoint.** No route added, removed or renamed; no request or
response body altered; no status code changed. Every response simply carries
more headers than it did.

---

## Backend

### Files Created

| File | What it is |
| --- | --- |
| `src/config/helmet.config.ts` | `buildHelmetOptions`, `CspMode`, the two env keys, and the base directive list. Carries the WHY for every option and the argument for the two toggles. The analogue of `cors.config.ts`, and it sits beside it. |
| `src/config/helmet.config.spec.ts` | 33 tests: every header, both HSTS states including the near-miss values, both CSP modes, and the directives that must not appear. |
| `test/security-headers.e2e-spec.ts` | 27 tests over HTTP, against **two** differently configured applications booted through the real `configureApp`. |

### Files Modified

| File | Change |
| --- | --- |
| `src/config/app.setup.ts` | `app.use(helmet(...))` as the first statement, with the ordering argument; the docblock now names security headers alongside the other global concerns. |
| `src/config/env.validation.ts` | The two variables, their block comment, and `CspMode` imported from the config file so the enum is declared once. |
| `src/config/env.validation.spec.ts` | 13 new tests in a `describe('the security headers')` block. |
| `.env.example` | A new **Security headers** block between the reverse-proxy and SMTP sections. |
| `package.json` | `helmet`. |

**No Prisma schema change. No migration. No change to CORS, rate limiting,
authentication or authorization** — `cors.config.ts`, `trust-proxy.config.ts`,
the rate-limiting module and both auth guards are untouched.

---

## Frontend

None. This feature is backend-only, and there is no frontend yet.

**What matters for it later:** server-set headers are half of XSS defence, and
the half the backend can do alone. The other half is the frontend's, and no
header compensates for getting it wrong.

1. **Keep React's escaping.** JSX escapes interpolated values by default, which
   is why the ordinary way of writing a component is already safe.
2. **`dangerouslySetInnerHTML` is the exception, and it is named that for a
   reason.** Never pass it a value that came from the API or from a user without
   sanitising it first. A CSP with `'unsafe-inline'` — which a served SPA is
   likely to need — does **not** stop injected markup from executing.
3. **Keep the refresh token out of `localStorage`.** Anything reachable by
   `localStorage.getItem` is reachable by injected script; a token held in a
   module-scoped variable dies with the tab. Feature 032's token design assumes
   this.
4. **Serve a CSP with the HTML.** These headers travel on API responses. The
   page's own policy arrives on the response that carries the document, from
   whatever serves it — so the frontend's deployment needs its own, informed by
   the directive notes above.
5. **Nothing here changes how the API is called.** No header this feature adds
   affects a CORS-mode `fetch` from an allowlisted origin.

---

## Testing

`npm test` → **134 suites, 2 844 tests, all passing** (up from 133 / 2 798 — 46
new unit tests).
`npm run test:e2e` → **2 suites, 90 tests, all passing** (27 from this feature,
63 from `app.e2e-spec.ts` once repaired — see the note below; it was 13 of 49
before).
`npx tsc --noEmit` clean. `npm run build` clean. `npx prisma validate` clean.
`npx prettier --check` clean.

**The regression that mattered most:** all 2 798 pre-existing unit tests passed
unchanged. Nothing about a response header is visible to a module that does not
assert on one, which is the property a cross-cutting middleware has to have.

| Area | Covered |
| --- | --- |
| Ordinary response | `nosniff`, `DENY`, `no-referrer`, `same-origin` CORP, and no `X-Powered-By` |
| Error responses | a `404` from the router and a `401` from the global auth guard both carry the full set — two failures produced at different depths of the chain |
| Envelope regression | the 033 success and error bodies asserted field by field through the Helmet-configured app |
| CSP | every directive present in both modes; nothing inline under `strict`; `'unsafe-inline'` for scripts and styles under `relaxed` and `'unsafe-eval'` in neither; `upgrade-insecure-requests` absent; not sent report-only |
| CSP mode | unknown, blank and absent values all fall back to the *stricter* policy; the value is read case-insensitively; relaxing does not mutate the shared base list |
| HSTS | **both states over HTTP** — absent under the local configuration, `max-age=31536000; includeSubDomains` under the enabled one; `preload` never present; `yes` / `1` / `TRUE` / `on` do not switch it on |
| CORS coexistence | both header sets on one response; the security headers on a *preflight*; a disallowed origin still gets no CORS headers and still gets the security ones |
| WebSocket | the Socket.IO handshake is answered by Engine.IO with a session id, ahead of the Express chain and therefore untouched by Helmet |
| Environment | both defaults; the string forms coerced; every near-miss value refused by name |

### The e2e suite boots two applications

The two settings with deployment consequences have to be proved in **both**
states — an HSTS header that is merely absent from the one configuration a test
happens to boot proves nothing about the one a deployment runs. So
`security-headers.e2e-spec.ts` boots `dev` (nothing configured) and `tls` (both
toggles on) in the same process, which works because the two variables are
optional with no default on the contract: `ConfigService` finds nothing in the
validated environment and falls through to `process.env`, which the spec sets
before each `configureApp`.

### Verified against a running server, not only the test harness

`node dist/main.js` over plain HTTP, on both `/api/v1/health` and an unmatched
route: the full header set present, `Strict-Transport-Security` absent,
`X-Powered-By` absent, and the CORS and `X-RateLimit-*` headers from Features 004
and 034 still where they were.

---

## Notes

### Nothing to run

No migration, no new required variable. The defaults apply and the application
starts as it did. The only manual step this feature introduced was installing
the dependency.

### The one thing to do before deploying behind HTTPS

Set `SECURITY_HSTS_ENABLED=true` — and only after the certificate is live. See
the HSTS section; this is the setting whose mistake persists in visitors'
browsers rather than in a config file.

### A pre-existing failure this feature did not cause — **since repaired**

`test/app.e2e-spec.ts` failed 36 of its 49 tests **on `main`, before this
feature**, and failed identically after it. The spec was written before Feature
032 and expected unauthenticated access: the global `JwtAuthGuard` answers `401`
where the spec expected `400`. It was measured both ways — 36 failed / 13 passed
with and without Helmet registered — so this change was neutral on it, which is
why it was recorded here rather than fixed among these edits.

**It was repaired immediately afterwards, as test maintenance rather than a
feature of its own.** See *Repairing the pre-authentication e2e suite* below.
`test/app.e2e-spec.ts` now passes 63 of 63.

---

## Repairing the pre-authentication e2e suite — **DONE**

Test maintenance carried out right after this feature, with **no production
source change** — no guard, controller, route protection or `@Public()`
touched. Recorded here because this is where the debt was written down.

**What it did.** `test/app.e2e-spec.ts` boots the whole `AppModule`, so it now
overrides one provider — `AuthService` — with the stub from
`auth/testing/authentication.testing.ts`, and attaches `auth.as()` headers to
the requests that need them. The real `JwtAuthGuard` still runs, registered by
`AppModule` as an `APP_GUARD`; only the identity resolution behind it is
stubbed. That is the same `TestAuthentication` the nineteen module routing specs
use, and using it keeps the suite **database-free**, which is the property every
comment in the file was written to preserve. No test database was introduced,
because this project has none: `auth/routing.spec.ts` stubs `AuthService` and
`auth/account-lifecycle.routing.spec.ts` runs against an in-memory
`FakeDatabase`, so a real PostgreSQL fixture would have been a parallel
mechanism rather than the established one.

**The categorisation of the 36 failures.**

| Category | Count | Resolution |
| --- | --- | --- |
| Should be public and is | 0 failing | `GET /` and `GET /health` carry `@Public()` and were already passing |
| Needed authentication | 34 | a token attached; each then asserts the `400` it was written to assert |
| Needed a role | 0 failing | `/users` is `ADMIN`/`SUPERADMIN`-only, but its assertions are `ValidationPipe` rejections, which are decided *before* the handler's role check — so they never reached it |
| Genuine regression | **0** | none found |
| Stale contract | 2 | uncovered *after* authenticating — see below |

**The two stale assertions**, which only became visible once the requests got
past the guard, and which are contract changes rather than bugs:

- `POST /users` was asserted to report a missing **`password`**. Feature 036
  removed that field from `CreateUserDto` entirely — an account is created with
  no password and its owner sets one through the emailed link. The assertion now
  requires `password` to be **absent** from the report, and a companion test
  asserts that supplying `password` or `passwordHash` is refused *by name*.
- `POST /employees` was asserted to report a missing **`userId`**. Feature 036
  made it optional: exactly one of `userId` and `account` must be given, which
  is a rule about a pair and therefore the service's rather than the pipe's. The
  assertion now pins the absence, and points at `employee.service.spec.ts` for
  the pair rule itself.

**What the repair added rather than merely restored**, so the breakage ends up
having been worth something:

- A `describe('the global guard')` block: seven module collections refuse an
  unauthenticated request, a token the suite never issued is refused, and the
  refusal carries `AUTH_UNAUTHENTICATED` on the Feature 033 envelope. The suite
  previously proved nothing at all about the guard.
- `/users` access asserted from the outside: `HR` and `USER` get **`403`**, not
  `401`, with `AUTHORIZATION_ACCOUNT_ADMIN_REQUIRED`. HR is the case worth
  pinning — the most privileged non-account role, deliberately still refused.
- The `x-employee-id` test replaced by the rule that superseded it: an account
  with no employment record gets `403 AUTH_NO_EMPLOYEE_RECORD` from a `/me`
  route, rather than a `400` naming a header that is now read nowhere.
- One idiom stated once at the top of the file: **`404` means the route does not
  exist; `401` means it exists and is guarded.** The notification-delivery test
  that used to grep a message for `Cannot POST` now asserts the `401` directly,
  which is a stronger claim by the same reasoning.

**Result:** `test/app.e2e-spec.ts` 63/63 (was 13/49). The e2e run is 90/90 across
both files.

---

## Future Improvements

1. **A per-request CSP nonce instead of `'unsafe-inline'`.** The right answer for
   a served frontend, and the reason `relaxed` is described here as a
   loosening rather than a destination. It needs middleware generating a nonce
   per response and a template that stamps it into the HTML — real work, and it
   belongs with whatever feature serves the HTML.
2. **`Permissions-Policy`.** Helmet does not set it and it is genuinely
   document-level: it turns off camera, microphone, geolocation and similar for a
   page. Worth adding with the frontend, where there is a page to apply it to and
   an idea of which features it legitimately uses.
3. **CSP violation reporting.** `report-to` plus an endpoint that collects
   violations turns the policy from something believed into something observed —
   and is how a too-strict directive is found before a user finds it. It needs
   somewhere to send reports and a rate-limit story of its own, since the
   reporting endpoint is unauthenticated by construction, so it waits for the
   frontend that would generate any.
4. **`Cross-Origin-Resource-Policy: cross-origin`, if it is ever needed.**
   Deliberately not set now. Revisit only if a feature serves files meant to be
   loaded cross-origin by tag rather than by `fetch`.
5. **Security headers on the Socket.IO handshake.** Currently impossible without
   moving Engine.IO behind Express, and currently pointless — the handshake is
   not a document. Recorded so the absence is known to be understood rather than
   missed.
