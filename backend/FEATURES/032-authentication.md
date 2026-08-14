# Authentication

## Goal

Replace the identity placeholder with real authentication: log in with an email
and a password, receive a short-lived access token and a rotating refresh token,
and have every route in the application resolve its caller from that token
instead of from three headers anybody could write.

The measure of the feature is not the four new endpoints. It is that
`@CurrentUser()` now returns a caller who has *proved* who they are, and that
**not one controller, service, repository, DTO or entity in the thirty-one
features before this one had to change for that to be true**.

This feature establishes **who** the caller is. It does not check what they are
allowed to do with any given resource — that is Feature 033, Authorization
Enforcement. The split is deliberate and the intermediate state is coherent:
identity is real, and per-resource permission checks are still absent exactly as
they were before, rather than half-present.

## Requirements

- Log in with email + password against `users.password_hash`.
- Issue a signed, short-lived access token and a long-lived refresh token.
- Store refresh tokens so a session can be ended; rotate them on every use and
  detect reuse.
- Log out, revoking the session.
- Answer "who am I" so a frontend can hydrate its session state.
- Read the caller from the token everywhere `@CurrentUser()` and
  `@CurrentEmployeeId()` are used — including the WebSocket handshake — without
  changing what those decorators return.
- Require a valid access token on every route by default, exempting only the
  routes that cannot have one.
- Refuse to start without a signing configuration.

---

## The seam replacement

This is the heart of the feature, and it is the part with no new endpoint in it.

Feature 026 wrote its own contract into `current-user.decorator.ts`:

> **It is one seam, in one file.** Every notification route reads the caller
> through this decorator and nothing else. When authentication arrives, the body
> of `resolveCurrentUser` becomes `request.user` and no controller, service,
> repository, DTO or test signature moves.

Feature 023 had written the same thing about `@CurrentEmployeeId()`:

> When auth arrives, the body of this function becomes `request.user.employeeId`
> and no controller, service, DTO or test signature moves.

Both are now literally true. `resolveCurrentUser` is:

```ts
export function resolveCurrentUser(request: AuthenticatedRequest): CurrentUser {
  const { user } = request;

  if (user === undefined) {
    throw new UnauthorizedException(/* … */);
  }

  return user;
}
```

The `CurrentUser` interface is unchanged to the field — `userId`, `employeeId`,
`role`, `administrativeAccess` — and `administrativeAccess` is still derived
from the role rather than sent. `JwtAuthGuard` assigns `request.user` before any
handler runs; `AuthService.authenticate` is what produces it.

**Three properties of the original placeholder are what made the swap cost
nothing**, and they are worth recording because they are what a placeholder has
to have to be worth writing:

1. **Nothing was defaulted.** No fallback user, no "assume admin in
   development", no id baked into a service — so there was no such assumption to
   find and unpick, and no route that silently kept working with an identity
   nobody supplied.
2. **`administrativeAccess` was always derived**, never sent. It is derived from
   the same role, for the same reason; only the role's source moved from a
   header to `users.role`.
3. **The shape was the caller, not the request.** `employeeId` was carried from
   the beginning although Feature 026 read it nowhere, so the modules that
   needed it later found it already there — and so does the token.

`x-user-id`, `x-user-role` and `x-employee-id` are now read **nowhere** in this
application. `auth/routing.spec.ts` asserts that sending all three, with no
token, is a `401`.

### The acceptance criterion

`auth/routing.spec.ts` defines a `SeamProbeController` whose handlers are
written exactly as every real controller writes them:

```ts
@Get('caller')
caller(@CurrentUser() user: CurrentUser): CurrentUser { return user; }

@Get('employee')
employee(@CurrentEmployeeId() employeeId: string) { return { employeeId }; }
```

Neither line has changed since Features 023 and 026 wrote them against headers.
The full suite — **2 356 tests across 118 files** — passes, and the eighteen
modules that consume `@CurrentUser()` were not edited except for the two message
changes recorded under *Files Modified*.

---

## Token model

| | Access token | Refresh token |
| --- | --- | --- |
| Form | JWT, HS256 | JWT, HS256 |
| Lifetime | `JWT_ACCESS_TTL`, default 15 min | `JWT_REFRESH_TTL`, default 7 days |
| Stored? | **No** | Yes — SHA-256 hash, one row per issued token |
| Revocable? | **No** | Yes |
| Claims | `sub`, `typ`, `iat`, `exp` | `sub`, `typ`, `jti`, `iat`, `exp` |
| Verified by | signature alone, then a `users` lookup | signature, then the row |

### Why the access token carries no role

The token says **who**, and nothing that grants authority. Every request then
reads `id`, `email`, `role`, `is_active` and the joined `employees.id` from the
database.

- A **role claim** would be a copy of `users.role` taken at login. An account
  demoted from `ADMIN` to `USER` would keep administering the system until its
  token expired, and an account deactivated in an emergency would keep working
  for the same window. The entire point of a short access-token lifetime is to
  bound the damage of something the token cannot know about; putting authority
  *into* the token widens exactly that window.
- A **lookup** costs one indexed primary-key read on a pool that is already
  open, against a database this application talks to for every route that does
  anything. It is the cheapest query in the request.

The consequence is that a role change and a deactivation take effect on the
caller's **next request**, not when their token happens to expire.

### Rotation and reuse detection

A refresh token is good exactly once. `POST /auth/refresh`:

1. verifies the signature (no query yet — garbage is rejected for free);
2. finds the row by `sha256(token)`, the only handle there is, since the raw
   token is stored nowhere;
3. checks `replaced_by_id` **before** checking usability;
4. re-reads the account, so a user deactivated since login refreshes into a
   `401`;
5. creates the successor row and marks the presented one spent, **in one
   transaction**.

```text
login ──▶ [rft-1] ──refresh──▶ [rft-2] ──refresh──▶ [rft-3]   ← the client holds this
             │                     │
       replaced_by=rft-2     replaced_by=rft-3
       revoked_at=…          revoked_at=…
```

A stolen refresh token is a **copy**: two parties hold one credential, and
whichever refreshes second presents a token that already has a successor. That
is not a client retrying — the legitimate holder moved on down the chain.

**The chosen strategy: revoke every live refresh token of that account.** Not
just the chain. The application cannot tell which of the two parties is the
thief — the requests are identical — and a token captured once may have been
captured from a machine that is still compromised, so there is no good argument
for leaving the account's other sessions open while an incident is in progress.
One `updateMany`, and everybody signs in again.

Reuse is also the **one authentication failure in this module that is not
generic**. The caller has just lost every session and cannot recover by
refreshing; telling them reveals nothing, since they are holding the token:

> This session has been ended for security reasons; please sign in again

It is logged at `warn` with the account id and nothing else — no token, no hash,
no address.

### The rotation transaction

Marking the old token spent and inserting its successor are one fact about one
session. A run where the first succeeded and the second failed would leave a
client holding a token the server had already invalidated, with no replacement —
a silent logout that only happens under load. The same reasoning the permission
audit log applies to writing history beside the change it describes.

---

## The global guard and `@Public()`

`JwtAuthGuard` is registered in `app.module.ts` as an `APP_GUARD`:

```ts
{ provide: APP_GUARD, useClass: JwtAuthGuard }
```

so **the default for every route in the application is that a valid access token
is required**. A route added next year is protected because nobody did anything.
The alternative — `@UseGuards()` per controller — defaults to open, and the day
somebody forgets the decorator there is nothing to notice: the endpoint works,
the tests pass, and the hole is found by whoever finds it first. An allowlist
fails closed; a denylist fails open.

It is declared in `app.module.ts` rather than beside the `ValidationPipe` and
the response interceptor in `configureApp`, because unlike those it has
dependencies — `Reflector` and `AuthService` — and only the injector can supply
them.

### `@Public()` is authentication-level only

`@Public()` means **"this route does not need to know who is calling"**. It does
*not* mean "anyone may do this", because that question — may *this* caller touch
*this* resource — is not asked anywhere yet.

Four routes carry it, and each has to:

| Route | Why |
| --- | --- |
| `POST /auth/login` | The endpoint that *issues* the token cannot require it. |
| `POST /auth/refresh` | Authenticated by the refresh token in its body, a stronger credential than the expired access token a client would otherwise send. Requiring both would make a session unrecoverable in the exact situation refresh exists for. |
| `GET /` | Read by whatever pings the service; exposes a version string and nothing about anybody. |
| `GET /health` | Read by a container runtime and a load balancer, which hold no credentials and *restart* the service when the check fails. A liveness probe behind authentication is an outage that begins the moment a token expires, and it fails in the least recoverable direction. |

When Feature 033 adds `@RequirePermission()`, a `@Public()` route is one that
neither guard inspects, while every other route is authenticated here and
authorised there. Marking something `@Public()` today is therefore a decision
that survives into a world where it means considerably more.

### WebSocket contexts

A global guard is applied to WebSocket message handlers too, and there is no
HTTP request under one. `JwtAuthGuard` passes non-HTTP contexts through:

```ts
if (context.getType() !== 'http') {
  return true;
}
```

This is not a hole. The real-time side authenticates **once, at the handshake**,
in `NotificationGateway.handleConnection`, and a message from a socket that never
registered is already refused there with an acknowledgement the client can read.
It is authentication happening at the point where a persistent connection
actually has a credential to present. See *the socket window* under Security.

---

## No Passport

Nest's usual answer here is `@nestjs/passport` with `passport-jwt`: four
packages, a strategy class, a second guard extending `AuthGuard('jwt')`, and a
`validate()` hook whose return value silently becomes `request.user`.

What all of that buys is the ability to swap in one of Passport's several
hundred other strategies. This application has **one** credential, issued by
itself, with no OAuth, no SSO and no plan for either. The two things Passport
would actually do for us are "parse the `Authorization` header" and "assign
`request.user`", and both are ~15 lines in `jwt-auth.guard.ts`.

**One dependency was added: `@nestjs/jwt`** (13 packages including
`jsonwebtoken`). It is there for the part that is genuinely hard and genuinely
dangerous to write twice — signing and, above all, *verifying* a JWS, where the
failure modes are silent: an `alg` header taken from the token itself, a
signature compared with `===`, a base64url decoder that accepts what it should
not. `token.service.spec.ts` asserts that a token declaring `alg: none` is
refused.

The same call the project made in choosing `bcryptjs` over a native binding, and
in reaching for `nodemailer` directly rather than a mail abstraction.

---

## Database

### The `RefreshToken` model

One new model. No column was added to `User` — `email`, `password_hash`,
`username`, `role` and `is_active` already existed and are what logging in
reads. `User` gained one back-relation, `refreshTokens`.

```prisma
model RefreshToken {
  id           String    @id @default(cuid())
  userId       String    @map("user_id")
  user         User      @relation(fields: [userId], references: [id], onDelete: Cascade)
  tokenHash    String    @unique @map("token_hash")
  revokedAt    DateTime? @map("revoked_at")     @db.Timestamptz(3)
  replacedById String?   @map("replaced_by_id")
  expiresAt    DateTime  @map("expires_at")     @db.Timestamptz(3)
  userAgent    String?   @map("user_agent")
  ipAddress    String?   @map("ip_address")
  createdAt    DateTime  @default(now()) @map("created_at") @db.Timestamptz(3)

  @@index([userId])
  @@map("refresh_tokens")
}
```

**Why the table exists at all.** A JWT is verified from its signature alone — no
row is read, nothing is looked up — which is exactly what makes it cheap and
exactly what makes it final: once signed, it is valid until it expires, and
there is no place to write "this one no longer counts". The answer is not to
make access tokens stateful, which would throw away the property they were
chosen for; it is to keep them short and put the revocable half of the session
here. Logging out, a stolen token, a deactivated account — every one is enforced
on this side.

**Why only a hash.** A refresh token is a bearer credential: whoever holds the
string can mint access tokens with it until it expires. Storing the raw value
would mean a database dump, a backup on a laptop or a careless `SELECT *` in a
support session handed out working sessions for every logged-in employee.

**Why SHA-256 rather than bcrypt.** bcrypt salts every call, so two hashes of one
token differ and the only way to find a row would be to bcrypt-compare the
presented token against *every* stored row — linear in the number of live
sessions, on the hot path of every refresh. The reason bcrypt is right for a
password and wrong here is what the two inputs are: a password is short,
human-chosen and guessable, so hashing it must be slow; this is signed,
unguessable material with a random `jti`, which no amount of hardware
enumerates, so a fast digest gives up nothing.

**`@unique` rather than `@@index`.** It is the lookup — a refresh presents a
token and this is the only thing it can be found by — *and* the guarantee that
one token names at most one row, without which reuse detection would have to
choose between two rows describing one credential. (The suggested shape used a
plain index; the unique constraint does both jobs and rules out a state the
logic cannot handle.)

**Why `replacedById` is not a Prisma relation.** A self-relation would require a
back-reference field and an index for a link only ever read forwards, by an
incident investigation, and a foreign key would make deleting an expired row
depend on its successor being deleted first — turning routine cleanup into an
ordering problem for the sake of a pointer.

**`onDelete: Cascade`**, the fifth in this schema. A refresh token is a
credential *for* an account and means nothing once that account is gone: nobody
can present it, no refresh will ever match it, and keeping it would make an
account undeletable for the sake of a session that can no longer exist. The same
argument `user_permission_overrides.user_id` makes — and the opposite of the one
`permission_audit_logs.changed_by_user_id` makes, because this is not a record
of something somebody *did*, it is a key they were handed.

**`user_agent` / `ip_address`** are context for the moment somebody asks "what
were these sessions?" — after a reuse detection, or when a person reports a login
they do not recognise. Neither is trusted for anything, both are truncated
(200 / 64 characters), and an absent value is recorded as `NULL` rather than as
the string `"unknown"`.

### Migration

```text
prisma/migrations/20260808133821_add_refresh_tokens/migration.sql
```

Additive only — one `CREATE TABLE`, one unique index, one index, one foreign
key. No existing table or column is touched. Applied with:

```bash
npm run prisma:migrate -- --name add_refresh_tokens
```

`npx prisma validate` passes and `npx prisma migrate status` reports the
database in sync.

---

## API

All under `/api/v1`. Every response is the usual `{ success, data }` envelope.

### `POST /auth/login` — `@Public()`

```jsonc
// request
{ "email": "maria.ionescu@company.com", "password": "…" }
```

```jsonc
// 200
{
  "success": true,
  "data": {
    "accessToken": "eyJhbGciOiJIUzI1NiIs…",
    "refreshToken": "eyJhbGciOiJIUzI1NiIs…",
    "tokenType": "Bearer",
    "expiresIn": 900,
    "user": {
      "id": "clx…",
      "email": "maria.ionescu@company.com",
      "role": "HR",
      "employeeId": "clx…",
      "administrativeAccess": true
    }
  }
}
```

`200`, not the `201` Nest gives a `@Post` by default: nothing was created that
the client can address. A session is not a resource here — there is no
`/auth/sessions/:id` to put in a `Location` header — and `201` would promise one.

**`401` on failure, with one message for all three causes**: unknown address,
wrong password, deactivated account. Distinguishing them would turn this into an
oracle for "does this person have an account here", which in a company's
internal system is "does this person work here". See *Security* for the timing
half of that.

Validation: the address is trimmed and lower-cased by the shared
`@IsEmailAddress()` — the same folding `POST /users` applied before storing, so
a login typed with capitals finds the row. The password is **not** trimmed
(spaces are legitimate in a passphrase) and is bounded at bcrypt's 72
characters; without a bound this public endpoint would hand a megabyte of
attacker-supplied text to a deliberately slow hash function, once per request.

### `POST /auth/refresh` — `@Public()`

```jsonc
// request
{ "refreshToken": "eyJhbGciOiJIUzI1NiIs…" }
```

Returns the **same body as login**. A refresh *is* a new session: the account
may have changed role in the meantime, so sending back less would leave a
long-running client rendering a role it was given hours ago. One shape also
means the frontend has one function that stores a session rather than two that
must agree.

**The client must overwrite what it stored, not append to it.** Rotation makes
the presented token single-use.

`401` for an unknown, expired, revoked, or wrong-account token;
`401` with the reuse message for a token that already has a successor.

### `POST /auth/logout`

Requires **both** credentials — `Authorization: Bearer <access>` and
`{ "refreshToken": … }` in the body. The access token proves who is asking, the
refresh token names which session to end.

Scoped to the token presented rather than to the account, so signing out on a
laptop does not sign the same person out on their phone. "Sign out everywhere"
is a real feature and a different one; it is a follow-up rather than an optional
field, because an endpoint whose blast radius depends on whether a body was sent
is one somebody will eventually get wrong.

**Idempotent and silent about what it found.** A token that does not exist,
belongs to somebody else, or was revoked an hour ago all produce
`{ "success": true, "data": null }`. There is no client behaviour that differs
between them, and a `404` for "not yours" would turn logout into a way for an
authenticated caller to test whether a token belongs to another account.

The access token is untouched, because it *cannot* be touched — it stays valid
until it expires. A client is expected to discard both.

### `GET /auth/me`

```jsonc
// 200
{
  "success": true,
  "data": {
    "id": "clx…",
    "email": "maria.ionescu@company.com",
    "role": "HR",
    "employeeId": "clx…",
    "administrativeAccess": true
  }
}
```

Re-read from the database rather than mapped from the `CurrentUser` the guard
already resolved, because this endpoint's purpose is to be the *fresh* answer.
It is also the cheapest way for a client to ask "is my access token still good",
which is why it is a `GET` with no parameters.

### The frontend contract

```text
login    → store accessToken + refreshToken + user
every request → Authorization: Bearer <accessToken>
401      → POST /auth/refresh { refreshToken }
           ├─ 200 → OVERWRITE both tokens, retry the request
           └─ 401 → discard everything, send the user to the login screen
logout   → POST /auth/logout { refreshToken } with the access token, then
           discard both regardless of the response
page load→ GET /auth/me to hydrate, or go to the login screen on 401
socket   → io(url, { auth: { token: accessToken } })
```

### Refresh-token transport: response body, not a cookie

**Both tokens are in the response body.** The alternative — an `HttpOnly`,
`Secure`, `SameSite` cookie for the refresh token — is genuinely better against
XSS, because script cannot read it. It was not chosen, for three reasons:

1. **This is an API-first backend.** It has no session, no CSRF token, no
   `cookie-parser`, and its declared clients include Postman and a Vite dev
   server on another origin. A cookie would arrive with cross-origin credential
   rules, a `SameSite` decision, and a CSRF surface that does not exist today —
   `POST /auth/refresh` with an ambient cookie is exactly the shape CSRF
   exploits, so the cookie would have to be paired with a CSRF token, which is a
   second mechanism to build and test.
2. **The WebSocket cannot use it.** A browser cannot set headers on a WebSocket
   upgrade, so the socket already needs the token as a value the client can
   read. A cookie for HTTP and a readable token for the socket means shipping
   both.
3. **The XSS advantage is smaller than it looks here.** The *access* token would
   still have to be readable by script to be put in a header, so a script
   injection already yields a working credential for `JWT_ACCESS_TTL`. The
   cookie narrows the blast radius rather than closing it, and the honest
   mitigations — a strict CSP, no `dangerouslySetInnerHTML`, short access
   lifetimes, rotation with reuse detection — are the ones this feature and the
   frontend actually rely on.

**If this is ever revisited** — and it is a reasonable thing to revisit for a
browser-only deployment — the change is confined to `AuthController` and the
frontend's session store: `AuthService` returns a session object and does not
know how it is transported. The CSRF work is the real cost, not the cookie.

No token is ever placed in a URL or query string, where it would land in access
logs, `Referer` headers and browser history.

---

## Environment

Two required variables and two optional ones, validated in `env.validation.ts`
in the file's existing style.

| Variable | Required | Default | Bounds |
| --- | --- | --- | --- |
| `JWT_ACCESS_SECRET` | yes | — | ≥ 32 characters |
| `JWT_REFRESH_SECRET` | yes | — | ≥ 32 characters, **must differ from the access secret** |
| `JWT_ACCESS_TTL` | no | `900` (15 min) | 60 – 3600 s |
| `JWT_REFRESH_TTL` | no | `604800` (7 d) | 3600 – 7 776 000 s (90 d) |

**The two secrets are the only variables besides `DATABASE_URL` the application
refuses to start without**, and that asymmetry with the SMTP block is
deliberate. A deployment with no mail server is a legitimate state that degrades
to "nothing is sent"; a deployment with no signing secret has no legitimate
degraded state. The two candidates are both unacceptable:

- **invent a secret at boot** — every restart silently logs the whole company
  out, because tokens signed by the previous process are rejected as forgeries;
- **ship a default** — it is published in this repository, so anyone can mint a
  super-admin token against any deployment that did not override it.

Refusing to boot is the only answer that cannot be misread.

**Why 32 characters.** HS256 is HMAC-SHA-256, whose security is the entropy of
its key; a secret shorter than the digest is the weakest link, and RFC 7518 §3.2
says so. It is a length rather than a complexity rule because the value should
come from `openssl rand -base64 48`, not from a keyboard. Enforced at startup
because there is no later moment to enforce it in: a weak secret produces tokens
that verify perfectly and forge just as easily, so nothing downstream would ever
notice.

**Why the two must differ.** One secret for both would mean a refresh token
verifies as an access token and vice versa, so the long-lived credential a
client stores would work directly against every protected route. The `typ` claim
`TokenService` writes catches the same mistake at verification time; this catches
it at startup, where it can still be fixed.

`formatErrors` already renders only constraint messages, never rejected values,
so a bad secret never reaches a startup log. A test asserts it.

**Rotation.** Changing `JWT_ACCESS_SECRET` invalidates every access token in
flight. Changing `JWT_REFRESH_SECRET` logs everybody out immediately — that,
with emptying `refresh_tokens`, is the lever to pull after a suspected
compromise.

`auth.config.ts` follows the per-module pattern `email.config.ts` established —
a `JWT_KEYS` map so no literal is repeated, and a `loadJwtConfig` reader. It
**throws** where `loadSmtpConfig` returns `null`, and the two exist separately
for exactly that reason: email degrades and reports itself unconfigured through
a health endpoint, while an API that cannot sign a token would be a server that
`401`s everything with a health endpoint nobody reads before the first
complaint. `TokenService` reads it in its **constructor**, so a bad signing
configuration is found at startup rather than at the first login of the morning.

---

## Security decisions

**Generic login failures.** One `401` and one message for an unknown address, a
wrong password and a deactivated account. The deactivation check runs *after*
the password comparison rather than as part of the `WHERE`, so a deactivated
account costs the same as an active one with a wrong password.

**Timing.** Generic wording is not enough on its own — the two paths have to
*cost* the same. Without mitigation, an unknown address answers in the ~2 ms a
failed index lookup takes and a wrong password in the ~250 ms a bcrypt
comparison takes; that difference survives network noise over a few samples.
`AuthService` holds a **decoy hash** — bcrypt of 24 random bytes, computed once
at construction — and compares against it when no account matched. A spec
asserts the two paths stay within a factor of five of each other. (A promise
created at construction rather than a literal in the source: the input is
unguessable, and shipping a constant that looks like a credential invites
somebody to "reuse" it.)

**Never logged, never returned.** No password, no hash, no raw token, no secret
appears in any response, message or log line. Asserted directly:
`auth.service.spec.ts` stringifies a whole login response and checks the hash is
absent; `AUTHENTICATED_USER_SELECT` does not even *read* `password_hash` on the
per-request path, and a test asserts that too. The reuse warning logs the
account id and nothing else.

**Inactive users.** Cannot log in, cannot refresh, and cannot authenticate a
request — `AuthService.authenticate` reads `is_active` fresh on every call, so a
deactivation takes effect on the account's **next request**. The residual window
is therefore not `JWT_ACCESS_TTL` for ordinary requests; it is zero. It is
`JWT_ACCESS_TTL` only for something that authenticated once and does not
re-authenticate.

**The socket window.** That "something" is the WebSocket. A connection
authenticated at 09:00 keeps receiving notifications after its access token
would have expired and after the account was deactivated, until something
disconnects it — hours rather than minutes. It is the socket-shaped version of
the same trade-off, it is wider than the HTTP one, and closing it needs the
server to drop the sockets of a deactivated account. Recorded as a follow-up
rather than guessed at.

**Rate limiting is NOT implemented.** The project has no rate limiter and no
shared guard to reuse, and building one inside an authentication feature would
be a second feature wearing this one's number. `POST /auth/login` and
`POST /auth/refresh` are the two endpoints that most need it: login is an
unauthenticated bcrypt per request, and refresh is an unauthenticated database
lookup. This is the highest-priority follow-up below. The DoS *amplification* is
bounded in the meantime — the password length cap keeps a single request from
being expensive — but the request *rate* is not bounded at all.

**Token handling summary.**

- Access tokens: never stored, never logged, short expiry, HS256 pinned
  (`algorithms: ['HS256']`, so `alg: none` is refused), `typ` claim checked.
- Refresh tokens: hash only, rotated on every use, reuse revokes the family,
  revoked on logout, expiry enforced in the application so "expired" and
  "revoked" stay distinguishable while investigating.
- Neither ever appears in a URL.

---

## Backend

### Files Created

| File | What it is |
| --- | --- |
| `src/modules/auth/auth.module.ts` | Wires the module. `JwtModule.register({})` with **no** secret — there are two keys, and `TokenService` passes both explicitly, so "which key signed this" has one answer visible at the call site. Exports `AuthService` and `JwtAuthGuard`; `TokenService` is **not** exported, because nothing outside this module has business signing a token. Imports no business module at all, which is what keeps the graph acyclic once everything depends on authentication. |
| `src/modules/auth/auth.config.ts` | `JWT_KEYS` and `loadJwtConfig`, following `email.config.ts`. Throws rather than degrading; never puts a value in a message. |
| `src/modules/auth/auth.constants.ts` | Header name, `Bearer`, the two `typ` values, the generic messages, refresh-token length bounds, the `user_agent` / `ip_address` truncation limits. |
| `src/modules/auth/auth.controller.ts` | Four thin routes. The one thing it does that other controllers do not is read the raw request for the `User-Agent` and address — a property of the transport, not of the session — and hand them to the service as a plain object. |
| `src/modules/auth/auth.service.ts` | Every rule: credential check, session issuance, rotation, reuse detection, logout, and `authenticate` — the method the identity seam rests on, called by the guard *and* by the WebSocket gateway. Holds the decoy hash. |
| `src/modules/auth/token.service.ts` | Signing, verifying, hashing. The only class that touches a signing key, which is what would let the token format change without `AuthService` noticing. |
| `src/modules/auth/jwt-auth.guard.ts` | Reads `@Public()`, passes non-HTTP contexts through, parses `Authorization`, assigns `request.user`. Exports `readAccessToken` so the socket parses a header identically. |
| `src/modules/auth/decorators/public.decorator.ts` | `@Public()` and `IS_PUBLIC_KEY`, with the allowlist-over-denylist argument. |
| `src/modules/auth/dto/login.dto.ts` | `email` + `password`, shape-validated. Documents why the password's *minimum* is deliberately not `USER_PASSWORD_MIN_LENGTH`: this checks a password rather than setting one, and rejecting a short one would leak the policy and lock out accounts predating a policy change. |
| `src/modules/auth/dto/refresh.dto.ts` | One trimmed, bounded token. Used by refresh **and** logout — one class, because both carry exactly one thing and it is the same thing. |
| `src/modules/auth/entities/auth-session.entity.ts` | `AuthSessionEntity` + `toAuthSessionEntity`, built in one place so login and refresh cannot drift. |
| `src/modules/auth/entities/authenticated-user.entity.ts` | `AuthUserEntity`, the two Prisma selects, and `toCurrentUser` / `toAuthUserEntity`. **This is where `administrativeAccess` is now derived**, beside the role it is derived from. |
| `src/modules/auth/entities/refresh-token.entity.ts` | `StoredRefreshToken`, `REFRESH_TOKEN_SELECT`, `isUsable`. `tokenHash` is absent from the type so nothing can read it back out — the same enforcement-by-type `UserEntity` uses for `passwordHash`. |
| `src/modules/auth/testing/authentication.testing.ts` | `TestAuthentication`: the real `JwtAuthGuard` wired to a stubbed `AuthService`, so every module's routing spec authenticates with real `Authorization` headers without becoming a test of JWT verification. Excluded from the build. |
| `src/modules/auth/auth.service.spec.ts` | 30 tests. |
| `src/modules/auth/token.service.spec.ts` | 17 tests, against a **real** `JwtService`. |
| `src/modules/auth/routing.spec.ts` | 32 tests, including the `SeamProbeController` acceptance test. |
| `prisma/migrations/20260808133821_add_refresh_tokens/` | The migration. |

### Files Modified

| File | Change |
| --- | --- |
| `prisma/schema.prisma` | `RefreshToken` model; `User.refreshTokens` back-relation. Nothing else. |
| `src/common/decorators/current-user.decorator.ts` | **The seam.** `resolveCurrentUser` reads `request.user`. `CurrentUser` unchanged. `HeaderBearingRequest` → `AuthenticatedRequest`. The three header constants and all header parsing are gone. |
| `src/common/decorators/current-employee-id.decorator.ts` | Reads the authenticated caller's `employeeId` via `resolveCurrentUser` — not `request.user` directly, so two decorators about one caller cannot disagree. `CURRENT_EMPLOYEE_HEADER` gone. `403` when the account has no employment record. |
| `src/config/env.validation.ts` | The four JWT variables, `MIN_JWT_SECRET_LENGTH`, the TTL bounds, and `IsDistinctSecretConstraint`. |
| `src/config/env.validation.spec.ts` | The two secrets join the baseline; a new `describe` covering the signing configuration. |
| `src/app.module.ts` | `AuthModule`, and `{ provide: APP_GUARD, useClass: JwtAuthGuard }`. |
| `src/app.controller.ts` | `@Public()`. |
| `src/health/health.controller.ts` | `@Public()`. |
| `src/modules/notification-delivery/websocket/notification.gateway.ts` | The handshake authenticates a token through `AuthService.authenticate` instead of reading three headers. `handleConnection` is now `async`. `readHandshakeToken` accepts `auth: { token }` (what a browser can do) or `Authorization` (parsed by `readAccessToken`, the guard's own function). |
| `src/modules/notification-delivery/notification-delivery.module.ts` | Imports `AuthModule`. |
| `src/modules/notification-management/notification-campaign.service.ts` | `requireAuthor` throws `ForbiddenException` instead of `BadRequestException`, and no longer names a header. |
| `src/modules/timesheet-management/timesheet.service.ts` | `requireEmployee`, the same change. |
| `src/modules/leave-requests/leave-requests.service.ts` | Message no longer names `x-employee-id`. |
| `src/modules/notifications/notification.service.ts` | Message no longer names `x-user-role`. |
| `src/modules/permission-management/user-permission.service.ts` | Message no longer names `x-user-id`. |
| `tsconfig.build.json` | Excludes `.testing.ts`, so no stub authenticator ships in `dist/`. |
| `.env.example` | The authentication block. |
| Nine routing specs + four service specs | Authenticate with tokens instead of headers; assertions updated where a status or message changed. |

### The one response-code change

`400 → 403` for **an authenticated account with no employment record**, in three
places that ask one question: `@CurrentEmployeeId()`,
`NotificationCampaignService.requireAuthor` and
`TimesheetService.requireEmployee`.

Both of those functions had recorded that they were waiting for this feature —
"when authentication lands it becomes a claim on the token and this function is
the only place that changes". The change is not cosmetic: while the id was a
header, its absence was something the *request* left out, and `400` was right.
Now the caller sends no employee id at all, so the absence is a fact about their
account — a super-admin created to administer the system is authenticated
perfectly well and simply has no timesheet to open. All three moved together so
one condition keeps one answer.

Nothing else changed status code. Unauthenticated requests that used to be `400`
("`x-user-id` header is required…") are now `401`, which is the same fact
reported correctly.

---

## Frontend

None. This feature is backend-only; the contract the frontend implements is
under *API* above.

---

## Testing

`npm test` → **118 suites, 2 356 tests, all passing.** `npx tsc --noEmit` clean.
`npm run build` clean. `npx prisma validate` passes.

| Area | Covered |
| --- | --- |
| Login | valid credentials → both tokens + no hash anywhere in the body; wrong password, unknown address and inactive account → the *same* generic `401`; the two failure paths timed against each other; the stored value is a hash, not the token; client context recorded, absent `User-Agent` stored as `null` |
| Token / seam | a valid token resolves `@CurrentUser()` to the right shape; `administrativeAccess` derived from the database role and an `x-administrative-access` header ignored; no token on a guarded route → `401`; `@Public()` route works without one; expired token rejected; malformed `Authorization` in four shapes rejected; scheme case-insensitive; **the three replaced headers get a `401`** |
| Refresh rotation | valid refresh → new pair, old row marked spent and pointed at its successor, inside a transaction; reuse → whole family revoked, nothing issued, the documented message asserted; revoked, expired, unknown and wrong-account tokens rejected; refresh for a now-inactive user rejected; a role changed since login comes back in the response |
| Logout | revokes the presented token scoped to the caller; idempotent and silent when it revoked nothing |
| Regression | `SeamProbeController` — `@CurrentUser()` and `@CurrentEmployeeId()` with signatures untouched, driven by a token; every pre-existing module spec passing unchanged except for the status/message updates listed above |
| Signing | HS256 round-trip; `alg: none` refused; wrong key refused; `typ` confusion refused; expiry honoured; `jti` makes two tokens issued in the same second distinct; the hash is deterministic, 64 hex characters, and contains no part of the token; every rejection reads the same |
| Environment | both secrets required; a short secret refused; identical secrets refused; TTL defaults and coercion; TTLs outside their bounds refused; **no secret in the refusal message** |
| Wiring | `reporting.module.spec.ts` compiles the real graph, which now reaches `AuthModule` — and caught that `TokenService` reads its configuration in the constructor |

---

## How Feature 033 builds on this

Authorization enforcement now has everything it was missing:

1. **A trustworthy caller.** `@CurrentUser()` returns a `userId` and a `role`
   read from `users` on this request. Feature 029 built the permission catalog,
   the role defaults, the presets and the per-user overrides, and resolves them
   into an effective set — and deliberately enforced none of it, because "every
   caller is still whoever they claim to be" made enforcement theatre. That is
   no longer true.
2. **A place to put the check.** `JwtAuthGuard` is already an `APP_GUARD`.
   Feature 033 adds a second one — `PermissionGuard` — after it in the chain,
   reading a `@RequirePermission(PermissionResource.TIMESHEET,
   PermissionAction.APPROVE)` decorator and calling
   `PermissionService.findEffectiveForCaller`. It runs *after* this guard, so
   `request.user` is already populated and it never has to parse a token.
3. **A vocabulary for exemptions.** `@Public()` already means "no
   authentication", and Feature 033's guard skips those routes for the same
   reason this one does.

The shape is: **`@Public()` → neither guard. Nothing → authenticated here, and
(once 033 lands) authorised there.**

---

## Notes

### Required manual step

The local `.env` has no `JWT_ACCESS_SECRET` or `JWT_REFRESH_SECRET`, and the
backend now refuses to start without them. Append two values — they must differ,
and each must be at least 32 characters. Generate them, never type them:

```bash
openssl rand -base64 48        # Linux / macOS, run twice
```

```powershell
[Convert]::ToBase64String((1..48 | % { Get-Random -Maximum 256 }))   # Windows, run twice
```

### Existing accounts

`npm run prisma:seed` already writes real bcrypt hashes through
`common/password/password.hasher`, so every seeded account can log in with the
password documented in `FEATURES/005-database-seeding.md` (or `SEED_PASSWORD`).
No re-seed is needed.

### Postman / curl

```bash
TOKEN=$(curl -s -X POST localhost:3000/api/v1/auth/login \
  -H 'content-type: application/json' \
  -d '{"email":"admin@company.com","password":"…"}' | jq -r .data.accessToken)

curl localhost:3000/api/v1/timesheets/me?month=9&year=2026 \
  -H "authorization: Bearer $TOKEN"
```

---

## Future Improvements

Ordered by how much they matter.

1. **Rate-limit `POST /auth/login` and `POST /auth/refresh`.** The one thing
   this feature identifies as missing rather than deferred. Both are
   unauthenticated and both do real work per request — a bcrypt and a database
   lookup. `@nestjs/throttler` with a per-IP and per-account limit, plus a
   lockout after repeated failures, is the shape. It was not built here because
   the project has no rate limiter to reuse and one belongs to the whole API,
   not to this module.
2. **Drop the sockets of a deactivated or logged-out account.** Closes the
   handshake-time authentication window described under *Security*. The
   `WebsocketUserRegistryService` already indexes connections by `userId`, so
   the mechanism exists; what is missing is something telling it to act.
3. **Sweep expired refresh tokens.** Rows are never deleted today, so
   `refresh_tokens` grows by one row per login and per refresh forever. A daily
   `@Cron` deleting rows past `expires_at` plus a retention window fits beside
   the notification delivery engine's jobs and would reuse
   `NOTIFICATION_SCHEDULER_ENABLED`'s pattern of a switch per deployment.
4. **`GET /auth/sessions` and "sign out everywhere".** The columns exist —
   `user_agent`, `ip_address`, `created_at` — and `StoredRefreshToken` was shaped
   for it. A person who sees a login they do not recognise currently has no way
   to end it except by changing a password, which Feature 034 has not built
   either.
5. **`trust proxy`.** `request.ip` records the proxy's address behind a reverse
   proxy. Reading `x-forwarded-for` without configuring Express to trust a proxy
   would let any caller write their own address into the audit trail, which is
   worse; the fix is the Express setting plus a documented deployment
   assumption.
6. **Reconsider the cookie transport** if the deployment becomes browser-only.
   The argument and the cost — a CSRF mechanism — are under *API* above.
7. **Asymmetric signing (RS256/EdDSA)** if a second service ever needs to verify
   access tokens without being able to mint them. `TokenService` is the only
   class that touches a key, so this is a one-file change.
8. **A `lastUsedAt` column** on `refresh_tokens`, which would make a session list
   readable ("last used 3 days ago") and give the sweep in (3) something better
   than `expires_at` to reason about.
