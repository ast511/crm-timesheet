# Feature 040 — Refresh Token via HttpOnly Cookie

## Goal

Move the refresh token out of the JSON body and into an `HttpOnly` cookie, so
that a script running on the frontend cannot read it.

Nothing else about a session changes. The access token is still a short-lived
JWS returned in the response body and presented as `Authorization: Bearer
<token>`; rotation, reuse detection, revocation, expiry and the strict
rate-limit tier are all exactly what Feature 032 built and Feature 036 extended.
**This feature changes one thing: which part of the HTTP message carries one
string.**

### Why

Feature 032 put both tokens in the body and said so plainly, on
`AuthSessionEntity`, as the feature's "most visible trade-off". The argument it
made was real but it was an argument about the *access* token: this is an
API-first backend with a token-bearing WebSocket beside it, and a credential the
socket cannot read would mean shipping two mechanisms. That reasoning still
holds, and the access token has not moved.

It never applied to the refresh token. Nothing but `POST /auth/refresh` presents
one, so there was nothing to lose by putting it where JavaScript cannot look —
and a great deal to gain, because the two tokens are not equally valuable:

| | Access token | Refresh token |
| --- | --- | --- |
| Lifetime | 15 minutes (`JWT_ACCESS_TTL`) | 7 days (`JWT_REFRESH_TTL`) |
| Renews itself | no | **yes, indefinitely** |
| Where a client must keep it | memory | somewhere durable |

A body-borne refresh token has to be *stored*, and everything a browser can
store, a script can read — `localStorage`, `sessionStorage`, a JavaScript
cookie, a variable in a closure that a debugger or an injected bundle can reach.
One injected script and an attacker holds a credential that rotates itself
forward for as long as they keep using it. They do not need the tab to stay
open, they do not need the person to stay logged in, and nothing in the
application ever notices — a stolen refresh token that is used *instead of* the
victim's is indistinguishable from the victim.

`HttpOnly` is the attribute that closes exactly that. The browser holds the
cookie and attaches it to the requests this configuration allows;
`document.cookie` does not show it and `fetch` cannot read it out of a response.

### What this does not buy, said plainly

An injected script on this origin can still **use** the session while the page
is open: it can call `POST /auth/refresh`, the browser will attach the cookie
for it, and it will be handed a fresh access token to make requests with. It
simply cannot copy the credential out to a machine the victim cannot reach.

That is the whole and honest size of the win, and it is worth having: it turns
permanent, silent, offline account takeover into a foothold that ends when the
tab does. It is not a substitute for not having XSS. The Content Security Policy
(Feature 037) and whatever the frontend does about escaping remain the things
that stop the script running in the first place.

## Requirements

- The refresh token travels **only** as an `HttpOnly` cookie, never in a body.
- The access token is unchanged in every respect.
- Rotation, reuse detection, family revocation, expiry and `@StrictRateLimit()`
  on login and refresh are preserved exactly.
- The cookie's attributes are a deployment's decision, read from the
  environment, with defaults that are correct on a developer machine over plain
  HTTP and in production over TLS without anybody configuring anything.
- No Prisma schema change. `RefreshToken` is unaffected — it still stores a
  SHA-256 of the token, and only how the client carries it has changed.
- The generated OpenAPI document tells the truth about all of it.

## Backend

### The transport, end to end

```text
POST /auth/login          body: { email, password }
  ← 200 { success: true, data: { accessToken, tokenType, expiresIn, user } }
    Set-Cookie: refresh_token=<jws>; Max-Age=604800; Path=/api/v1/auth;
                HttpOnly; SameSite=Lax            (+ Secure outside development)

POST /auth/refresh        no body at all
    Cookie: refresh_token=<jws>                   ← the browser sends it
  ← 200 { success: true, data: { accessToken, ... } }
    Set-Cookie: refresh_token=<the successor>; …  ← rotation, in the cookie

POST /auth/logout         no body; Authorization: Bearer <access token>
    Cookie: refresh_token=<jws>
  ← 200 { success: true, data: null }
    Set-Cookie: refresh_token=; Expires=<past>; Path=/api/v1/auth; …
```

A client therefore stores **nothing durable**. The access token lives in memory
for as long as the tab does; the refresh token lives in the cookie jar where the
page cannot reach it; a reload is a `POST /auth/refresh` with no arguments.

### The cookie's attributes, and why each one

Every one of them is configurable, and every one of them has a default that is
right without being set. They live in `refresh-cookie.config.ts`, a pure
function of `ConfigService` in the shape `buildCorsOptions` and
`buildHelmetOptions` already use — so both sides of every toggle are assertable
without booting a server.

| Attribute | Default | Variable | Why |
| --- | --- | --- | --- |
| `HttpOnly` | always on | — | The feature. Not configurable, because a configurable one would be a way to switch the feature off by accident. |
| `Max-Age` | the token's own lifetime | (from `JWT_REFRESH_TTL`) | Not read from configuration at all — see below. |
| `Path` | `/api/v1/auth` | `AUTH_REFRESH_COOKIE_PATH` | A cookie rides on every request under its path. At `/` the refresh token would be attached to every list, every export and every image the frontend fetches — hundreds of times a session, through every proxy log on the way. Scoped, it is sent to four routes. |
| `Secure` | on in production | `AUTH_REFRESH_COOKIE_SECURE` | Refuses plain HTTP. Correct everywhere real and wrong on `http://localhost`, where the cookie would be stored and never sent back. |
| `SameSite` | `lax` | `AUTH_REFRESH_COOKIE_SAME_SITE` | The CSRF defence. See below. |
| name | `refresh_token` | `AUTH_REFRESH_COOKIE_NAME` | So a deployment sharing a domain with something else can avoid a collision. |

**`Max-Age` is deliberately not a variable.** The expiry travels with the token
from `TokenService` — `IssuedSession` carries `refreshTokenExpiresAt` — and the
cookie is written from that instant. Reading `JWT_REFRESH_TTL` a second time
would be two sources for one fact and they would eventually disagree; taken from
the token, the browser forgets the cookie at the moment the server would have
refused it. It is expressed as `Max-Age` rather than `Expires` because `Max-Age`
is measured from when the browser *received* the response and is immune to a
client whose clock is wrong — the same argument `expiresIn` already makes for
the access token.

**`Secure` is derived from `NODE_ENV` when unset**, the arrangement
`SWAGGER_ENABLED` uses, so neither a developer machine nor a production
deployment has to remember it. An explicit value wins in both directions,
including `false` in production: TLS terminating at a proxy this process cannot
see is a real topology, and refusing it would be a config file guessing at a
network it cannot observe.

**`Path` is derived from `API_BASE_PATH`**, not written out, so the day the
prefix or the version moves the cookie moves with it. A cookie scoped to a path
that no longer exists does not fail loudly — the browser simply stops sending
it, and everybody is signed out an access token later.

### SameSite, CSRF, and what is *not* being added

A cookie is attached by the browser without the page asking, which is the whole
mechanism of cross-site request forgery: a page on `evil.example` causes a
request to this API, and the credential rides along.

`SameSite=Lax` is the first-line defence and it is the default here. A
cross-site *sub-request* — another site's `fetch`, an `<img>`, a form it posts —
does not carry the cookie at all. A top-level navigation the person performed
does, which is what keeps ordinary links working.

**No CSRF token is being added, and the reasoning is recorded here rather than
deferred**, because "add CSRF later" is the kind of note that is either a real
decision or a hole:

1. **The cookie authenticates exactly three routes.** `refresh`, `logout` and
   `change-password` — and `logout` and `change-password` *also* require a
   Bearer access token, which a cross-site attacker cannot supply: it is not a
   cookie, so the browser will not attach it, and reading it out of this origin
   would require the same-origin policy to have already failed.
2. **The remaining route is `POST /auth/refresh`, and forging it achieves
   nothing.** The attacker cannot read the response — that is what the
   same-origin policy is for — so the new access token and the new cookie both
   land in the victim's browser. The realistic damage is that the victim's
   session rotates one step early, which is what it does all day anyway.
3. **`SameSite=Lax` blocks the request in the first place**, and blocks it for
   `POST` specifically, which is what all four cookie routes are.
4. Every *other* route in the application is authorised by the Bearer token
   alone and ignores cookies entirely, so no amount of cross-site cookie
   attachment authorises anything.

**When that reasoning stops holding**, and it is one specific case: a deployment
that sets `AUTH_REFRESH_COOKIE_SAME_SITE=none` because the frontend is served
from a different site than the API. `None` gives up point 3 entirely, and such a
deployment should add a CSRF token — a double-submit cookie or an
origin-check middleware — before it goes live. That is the note the frontend
feature and any split-domain deployment inherit, and it is why `none` is a value
somebody has to type rather than one anything falls back to.

### The validation that moved

`RefreshDto` used to bound and trim the token: `@MinLength(40)`,
`@MaxLength(1024)`, `@Trim()`. Those existed because `POST /auth/refresh` is
`@Public()`, so whatever arrives is an anonymous caller's and reaches a SHA-256
and a JWT parse.

**A `ValidationPipe` never sees a cookie** — it validates the body, the query and
the params — so those checks would have vanished with the DTO. They now live in
`RefreshTokenCookie.read`, which trims and applies the same bounds and answers
`undefined` for anything outside them. The bounds matter *more* here than they
did in a body: a cookie is whatever the client wrote under that name.

### Files created

| File | What it is |
| --- | --- |
| `src/modules/auth/refresh-cookie.config.ts` | The cookie's attributes, read from the environment. Exports `REFRESH_COOKIE_KEYS`, the `REFRESH_COOKIE_SAME_SITE` values, the two defaults and `loadRefreshCookieConfig`. Never throws — every setting has a right answer — which is the split Feature 037 drew for its own two variables. |
| `src/modules/auth/refresh-token.cookie.ts` | `RefreshTokenCookie`: `set`, `clear`, `read`, `require`, `clearIfRefused`. The only class that writes, reads or clears the cookie, so the attributes cannot disagree between a `set` and a `clear` — a mismatch there removes nothing and reports success. |
| `src/modules/auth/refresh-cookie.config.spec.ts` | Both sides of every toggle, without a server. |
| `src/modules/auth/refresh-cookie.routing.spec.ts` | The session's whole life carried by a cookie, against the **real** `AuthService`, `TokenService` and a stateful fake database. See "Testing". |
| `test/refresh-cookie.e2e-spec.ts` | The cookie through the fully configured application, plus CORS credentials. |
| `backend/FEATURES/040-refresh-cookie.md` | This document. |

### Files modified

| File | Change |
| --- | --- |
| `src/config/app.setup.ts` | Registers `cookie-parser` globally, beside Helmet. **No signing secret** — the value is already a signed JWS whose hash must match a row, so an HMAC over it would protect nothing and add a second secret to rotate. |
| `src/modules/auth/auth.controller.ts` | `login` and `refresh` write the cookie; `refresh`, `logout` and `change-password` read it; `logout` and a refused `refresh` clear it. Takes `@Res({ passthrough: true })` — see the note below. `refresh` and `logout` no longer take a body at all. |
| `src/modules/auth/auth.service.ts` | `login` and `refresh` return `IssuedSession` instead of `AuthSessionEntity`. **No logic changed** — the service still takes a refresh token as a string and hands one back as a string, and does not know what carries it. |
| `src/modules/auth/entities/auth-session.entity.ts` | `refreshToken` removed from `AuthSessionEntity`; `IssuedSession` added, carrying the token and its expiry *beside* the body. `toAuthSessionEntity` loses a parameter. |
| `src/modules/auth/dto/change-password.dto.ts` | The optional `refreshToken` field is gone; the session to spare comes from the cookie. Down to the two fields it should always have had. |
| `src/modules/auth/dto/refresh.dto.ts` | **Deleted.** Both its routes now take no body. |
| `src/modules/auth/auth.module.ts` | Provides `RefreshTokenCookie`, and does not export it. |
| `src/config/env.validation.ts` | The four `AUTH_REFRESH_COOKIE_*` variables, with a cookie-name pattern, a path pattern, and a cross-field rule refusing `SameSite=None` without an explicit `Secure`. |
| `src/config/cors.config.ts` | Documentation only. `credentials` was already derived correctly; what changed is that the session now depends on it. |
| `src/common/swagger/api-envelope-response.decorator.ts` | `EnvelopeOptions` gains `headers`, so a documented success response can describe its `Set-Cookie`. |
| `.env.example` | The new block, the `CORS_ORIGINS` warning, and a note on `JWT_REFRESH_TTL`. |
| Six specs | Updated for the new transport; listed under "Testing". |

### `@Res({ passthrough: true })`, and why the passthrough is load-bearing

Writing a cookie needs the response object. Taking `@Res()` without
`passthrough: true` tells Nest to step back and let the handler own the
response — which would silently disable the `ResponseInterceptor` envelope and
the `@HttpCode(200)` on these routes, so `POST /auth/login` would start
answering `201` with an unwrapped body. With the passthrough, the response
object is available for `res.cookie` and Nest still serialises the returned
value through the whole pipeline. `routing.spec.ts` asserts the envelope on a
cookie-setting response for exactly this reason.

## Frontend

Nothing in this repository's frontend yet — the matching change is its own
feature. What it will have to do:

1. **Send credentials on every auth call.** `fetch(url, { credentials:
   'include' })`, or `withCredentials: true` for axios. A browser will neither
   store the cookie nor send it back otherwise, and the failure is quiet: login
   appears to succeed and the first refresh fails.
2. **Stop storing the refresh token**, and stop reading one from the login and
   refresh responses. It is not there. Any `localStorage.setItem('refreshToken',
   …)` is now storing `undefined`.
3. **Call `POST /auth/refresh` with no body**, and `POST /auth/logout` with no
   body — just the Bearer access token.
4. **Drop `refreshToken` from the change-password request.** The field is
   removed rather than ignored, and `forbidNonWhitelisted` means a client still
   sending it gets a `400` naming the property.
5. **Hold the access token in memory only.** Putting it in `localStorage` would
   give back a smaller version of exactly what this feature removed.
6. **Ensure the API's origin is in `CORS_ORIGINS`.** `*` cannot be used with
   credentials.

## Database

**No change.** No migration, and `schema.prisma` is untouched. `RefreshToken`
still stores a SHA-256 of the token with its expiry, revocation and successor —
the rotation chain is byte-for-byte what it was, because only the client's half
of the exchange moved.

## API

### Response shape

`AuthSessionEntity` — the body of `POST /auth/login` and `POST /auth/refresh` —
loses `refreshToken`:

```jsonc
// before                              // after
{                                      {
  "accessToken": "…",                    "accessToken": "…",
  "refreshToken": "…",   // ← gone
  "tokenType": "Bearer",                 "tokenType": "Bearer",
  "expiresIn": 900,                      "expiresIn": 900,
  "user": { … }                          "user": { … }
}                                      }
```

### Request shape

| Route | Before | After |
| --- | --- | --- |
| `POST /auth/refresh` | `{ refreshToken }` | **no body**; the cookie |
| `POST /auth/logout` | `{ refreshToken }` | **no body**; the cookie |
| `POST /auth/change-password` | `{ currentPassword, newPassword, refreshToken? }` | `{ currentPassword, newPassword }`; the cookie |

### Status codes: three deliberate differences

Every error **code** is one that already existed — no new codes were invented —
but three requests answer differently than they used to, and all three are
consequences of a cookie having no missing-field equivalent:

| Case | Before | After | Why |
| --- | --- | --- | --- |
| `refresh` with no token | `400 VALIDATION_ERROR` | `401 AUTH_REFRESH_TOKEN_INVALID` | A browser holding no cookie sends no header at all, so there is no absent *field* to report. The `401` is the answer a client already handles: the session cannot be refreshed. |
| `refresh` with a malformed token | `400 VALIDATION_ERROR` | `401 AUTH_REFRESH_TOKEN_INVALID` | Same reason. The bounds still apply; they are just no longer the pipe's. |
| `logout` with no token | `400 VALIDATION_ERROR` | `200`, cookie cleared | A client whose cookie has already expired must still be able to sign out cleanly — which is exactly when it wants to. Logout has always been idempotent and silent about what it found: an unknown token, somebody else's, and one revoked an hour ago all already answered `200`. |

`change-password` sent with the old `refreshToken` field answers `400` naming
the property, which is `forbidNonWhitelisted` doing its job — a client is told
rather than left believing a session was spared.

### The cookie is cleared on a refused refresh

A `refresh` that fails with `AUTH_REFRESH_TOKEN_REUSED` or
`AUTH_REFRESH_TOKEN_INVALID` clears the cookie. In both cases the browser is
holding a credential that can never work again, and leaving it there means a
dead token on every subsequent request for up to a week.

Deliberately **not** "clear on any error": a `429` from the rate limiter or a
`500` from a database blip says nothing about the token, and signing somebody
out because their refresh landed during an incident turns a blip into a support
ticket.

### Swagger (Feature 038 stays accurate)

- `AuthSessionEntity`'s schema no longer has a `refreshToken` property, and the
  e2e suite asserts its exact key set — so no future edit can put the long-lived
  credential back into a body without a test failing.
- No `/auth/*` request body mentions `refreshToken`, asserted document-wide.
- `login` and `refresh` document the `Set-Cookie` they answer with, including
  the attributes, via the new `headers` option on `ApiOkEnvelope`. Without it a
  reader comparing the login response to Feature 032's would conclude the
  refresh token had simply been withdrawn from this API.
- The operation descriptions say where the token went, that the routes take no
  body, and that a browser client must call with credentials.

**The cookie is not declared as an OpenAPI security scheme**, and that is a
decision rather than an omission. In this document `security` means "a Bearer
access token is required", and `openapi.e2e-spec.ts` asserts route by route
which operations have one — it is how the `@Public()` set is pinned down. Adding
a second scheme to `refresh` would make that assertion mean something weaker, in
exchange for a padlock icon on a route whose credential Swagger UI's "Try it
out" cannot set anyway, because cookies are the browser's. The operation
description carries the information instead.

## Testing

`npm test` — **137 suites, 2 967 tests, all passing.**
`npm run test:e2e` — **4 suites, 190 tests, all passing.**
`npm run build` and `npx tsc --noEmit` — clean.

### The new end-to-end spec is where the feature is actually demonstrated

`refresh-cookie.routing.spec.ts` runs the real `AuthService`, the real
`TokenService` signing and verifying real JWSs, real SHA-256 hashing, the real
`RefreshTokenCookie` and the real `cookie-parser`. Only the database is
substituted, and the substitute is **stateful** — a `Map` of token rows keyed by
hash — which is what lets rotation and reuse detection genuinely happen rather
than being asserted against a mock's call log.

The client in it is a supertest *agent*, which keeps a cookie jar: it is handed
a cookie once and sends it back on its own. **No test in that file ever reads a
refresh token out of a response body**, because there is none to read. It
covers:

- login hands the browser a cookie and the body no refresh token;
- only a hash of the cookie's value is stored;
- a client with no body and no readable credential refreshes twice, getting a
  different token each time;
- the presented token is spent and points at its successor;
- a *copied* cookie presented after the legitimate client has rotated triggers
  reuse detection: every session revoked, `AUTH_REFRESH_TOKEN_REUSED`, cookie
  cleared — and the legitimate client is signed out too;
- logout revokes and clears, and the browser cannot refresh afterwards;
- a deactivated account's cookie is refused with `AUTH_INACTIVE_USER`;
- a forged cookie never reaches a query.

### The rest

| Spec | What it now covers |
| --- | --- |
| `auth/routing.spec.ts` | The cookie's attributes on a real response, the envelope surviving `@Res({ passthrough: true })`, the coded `401` for a missing cookie, the bounds on a cookie value, clearing on a refusal and *not* clearing on a `500`, and logout with no cookie. |
| `auth/refresh-cookie.config.spec.ts` | Every attribute in every state, including `Secure` on in production and off in development with nothing configured. |
| `auth/account-lifecycle.routing.spec.ts` | change-password keeps the cookie's session, revokes everything when there is no cookie, and rejects the removed body field. |
| `auth/auth.service.spec.ts` | The refresh token comes back beside the body and never inside it. |
| `rate-limiting/routing.spec.ts` | The strict tier still trips on a cookie-carried refresh, and login and refresh still have separate buckets. |
| `config/env.validation.spec.ts` | The four variables, the two patterns, and the `SameSite=None` + `Secure` rule in both directions. |
| `test/refresh-cookie.e2e-spec.ts` | That `cookie-parser` is registered in `configureApp` (a refresh reaching the service *proves* it), that the envelope and security headers are untouched, that `Secure` appears when configured, and that CORS allows credentials to an allowlisted origin, never with a wildcard, including on the preflight. |
| `test/openapi.e2e-spec.ts` | The schema's exact key set, no `refreshToken` in any `/auth/*` request body, and the documented `Set-Cookie`. |

### One constraint worth recording

`test/refresh-cookie.e2e-spec.ts` separates its two applications with
`AUTH_REFRESH_COOKIE_SECURE` rather than with `NODE_ENV`. `ConfigModule.forRoot`
runs when `app.module.ts` is *imported* — before any `beforeAll` — and `NODE_ENV`
is one of the few variables with a declared default, so it is baked into the
validated config at import time and `process.env` no longer decides it. The
optional flags escape that because an absent one leaves nothing in the validated
config and `ConfigService` falls through to `process.env`. What the `NODE_ENV`
default resolves to is asserted in `refresh-cookie.config.spec.ts`, which calls
the loader directly. This is the same seam `security-headers.e2e-spec.ts` uses,
and it is worth knowing before writing the next e2e that wants to vary an
environment.

## Notes

### The dependency

One package, `cookie-parser`, plus its types. Express 5 does not parse the
`Cookie` header, so without it `request.cookies` does not exist and the read
half of this feature is impossible. It is registered once in `configureApp`,
beside Helmet, so bootstrap and every spec that boots through that function get
the same request object.

Registered with **no signing secret**. `cookieParser(secret)` adds an HMAC over
the cookie's value, and there is nothing here for it to protect: the value is
already a signed JWS whose SHA-256 must match a row in `refresh_tokens`, so a
tampered or invented cookie is refused either way. A second secret would be a
second thing to rotate and a second way to log everybody out by getting it
wrong.

### An incidental correction

`POST /auth/change-password`'s operation description said a wrong current
password answers `400 ACCOUNT_CURRENT_PASSWORD_INCORRECT`.
`AccountPasswordService` throws an `UnauthorizedException`, so it has always
been a `401`, and `api-standard-errors.decorator.ts` already documented it under
`401`. Corrected while the description was being rewritten — the same class of
drift Feature 038's second amendment caught, found the same way.

### What was deliberately not done

- **No CSRF token.** The reasoning is in full above, along with the one
  deployment shape that changes the answer.
- **No `Domain` attribute.** A cookie set without one is scoped to the exact
  host that set it, which is the tighter default. A deployment that genuinely
  needs to share the cookie across subdomains can have the variable then, with a
  reason attached.
- **No `__Host-` prefix.** It would be a real improvement — a browser enforces
  `Secure`, `Path=/` and no `Domain` on such a cookie — but it requires
  `Path=/`, which is the one attribute this feature deliberately narrows. Path
  scoping was judged the better trade for an API this cookie only ever needs on
  four routes.
- **The access token was not touched.** Not moved to a cookie, not shortened,
  not lengthened. It is what the WebSocket handshake reads, and this feature has
  one subject.

## Future Improvements

- **A CSRF token** if any deployment adopts `SameSite=None` for a split-domain
  frontend, or if a future route is ever authorised by the cookie alone. A
  double-submit cookie is the usual shape and would fit the existing envelope.
- **`__Host-` prefix support**, as an alternative mode for a deployment that
  prefers a browser-enforced cookie over a path-scoped one. It is a genuine
  trade, not an upgrade.
- **"Sign out everywhere"** — still the follow-up Feature 032 named. It is a
  different endpoint (`revokeSessions` already exists and is already the one
  place a session ends in bulk), and it would now also clear the caller's
  cookie.
- **A `Domain` variable** if a deployment ever serves the frontend from a
  subdomain of the API's host.
- **Session listing** — "here are your open sessions, with the device and
  address each was created from". The `user_agent` and `ip_address` columns have
  been recorded beside every issued token since Feature 032 for exactly this,
  and nothing reads them yet.
