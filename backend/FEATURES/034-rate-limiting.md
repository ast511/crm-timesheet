# Rate Limiting

## Goal

Bound how fast anybody may ask. The request *rate* against this API was
unbounded: every route would answer as often as somebody could send, and the two
routes that most needed a bound had none at all.

Feature 032 named the gap in its own document and left it as the highest-priority
follow-up:

> **Rate limiting is NOT implemented.** … `POST /auth/login` and
> `POST /auth/refresh` are the two endpoints that most need it: login is an
> unauthenticated bcrypt per request, and refresh is an unauthenticated database
> lookup. … The DoS *amplification* is bounded in the meantime — the password
> length cap keeps a single request from being expensive — but the request
> *rate* is not bounded at all.

**That item is now closed.** This feature puts the mechanism in place across the
whole API and proves it on auth, the same shape Error Code Standardization (033)
took: cross-cutting plumbing, applied everywhere, demonstrated on the module that
needed it first.

## Requirements

- A baseline limit on every route, including ones added later.
- A much tighter limit on `POST /auth/login` and `POST /auth/refresh`.
- Every number from validated configuration; no literal in the source.
- A request counted whether or not it succeeds — a brute-force attempt is by
  definition a request that fails.
- `@Public()` routes limited too. Public means "no credential required", never
  "unlimited".
- A `429` rendered through the Feature 033 envelope with a stable code.
- Express `trust proxy` configured, because without it the client key is wrong in
  every proxied deployment.
- No Prisma schema change. No change to any authentication behaviour.

---

## The two tiers

| | Baseline | Strict |
| --- | --- | --- |
| Name | `default` | `auth` |
| Applies to | **every route** | routes carrying `@StrictRateLimit()` |
| Default allowance | 300 per 60 s | 10 per 300 s |
| Keyed on | client address | client address **+** submitted email |
| Bucket | one for the whole API | one per handler |
| Catches | one client hammering the API | guessing at one account |

**They are additive, not alternatives.** A login is counted in *both*, and that
is the design rather than an accident of implementation.

The prompt for this feature suggested the strict tier as a per-route
`@Throttle()` *override*, which replaces the baseline on that route. That was
rejected after working through what it leaves open: with the baseline replaced,
the strict bucket — keyed on the submitted address — would be the only counter on
`/auth/login`, and **a password spray across a thousand addresses would open a
thousand fresh buckets and never be limited at all**. The baseline is what bounds
that, precisely because it does not care what was in the body.

The mirror-image mistake is keying the strict tier on the address alone: a whole
office behind one NAT address would then share ten attempts, and one person
mistyping their password would lock out their colleagues. That is not a security
measure, it is a help-desk ticket.

Neither key is sufficient. Both together bound both attacks, which is why there
are two named tiers rather than one overridden limit.

### The chosen numbers, and why they are env-tunable

**Baseline — 300 requests per 60 seconds.** Generous on purpose: it is carried by
every route, so it has to clear the burst a single screen produces — a dashboard
opening six lists at once, a report preview, an autosaving form — while still
stopping traffic that is obviously not a person. Five requests a second sustained
from one address is far above what the frontend does and far below what a script
does.

**Strict — 10 attempts per 300 seconds.** Thirty times smaller, because it bounds
something thirty times more dangerous. Roughly 2 900 guesses a day against one
account from one address: against any password worth the name, nothing; against a
person who has genuinely forgotten theirs, four more tries than they will use.

Both are **starting points**, and that is the entire reason they are environment
variables. The right allowance depends on how many people use the system and from
how many addresses, and neither is knowable from the code — so tuning is a
configuration change on the deployment that discovers it, not a pull request.

---

## Where the tiers are decided, and why not `@Throttle()`

The library documents `@Throttle({ default: { limit: 5, ttl: 60000 } })` on a
handler as the way to vary a limit per route. **It cannot be used here**, and the
reason is worth recording because it is not obvious:

> A decorator's arguments are evaluated when the class is *defined*. `AuthController`
> is defined while `app.module.ts`'s imports are being resolved — **before**
> `ConfigModule.forRoot()` has read a single environment variable.

Any number written in a `@Throttle()` would therefore be a literal in the source
that no deployment could ever change, which is exactly what this project means by
a magic number. So `@StrictRateLimit()` carries **no numbers at all**: it is a
marker, and the tier it selects reads its allowance from configuration at
request time through the throttler's `skipIf`.

That also keeps the dependency pointing the harmless way round.
`RateLimitingModule` imports no business module — not even `AuthModule`, whose
two routes it protects. It knows them only through a decorator they carry.

---

## Guard composition and ordering

Two global guards now, and **the order is the feature**:

```ts
providers: [
  AppService,
  { provide: APP_GUARD, useClass: ApiThrottlerGuard },  // 1. counts
  { provide: APP_GUARD, useClass: JwtAuthGuard },       // 2. authenticates
]
```

Nest runs global guards in registration order, so a request is counted **before**
anybody asks whether its credentials are any good. Reversed, `JwtAuthGuard` would
reject a flood of invalid logins before any of it was ever counted — and a flood
of invalid logins is the exact traffic this was installed to stop. The limit
deliberately does not require a request to succeed.

Two tests pin this from the outside, because it is not visible from either guard
alone: a flood of `401`s against a protected route eventually answers `429`, and
a flood of wrong passwords against `/auth/login` does the same. Were the order
reversed, both would answer `401` forever.

### `@Public()`

The throttler **ignores `@Public()` entirely**, and that is correct rather than an
oversight. That decorator exempts a route from *authentication* — a statement
about credentials. It says nothing about how often a route may be called, and the
four routes carrying it are the only ones an unauthenticated attacker can reach
at all.

So the composition is:

```text
@Public()             → not authenticated,  still rate limited
nothing               → authenticated,      rate limited
@StrictRateLimit()    → rate limited twice: baseline + strict
```

`GET /` and `GET /health` are `@Public()` and deliberately stay on the baseline
only. They read no table and are polled by a container runtime that *restarts the
service* when they fail — a strict limit there would be a liveness probe that
trips its own outage, which is the same argument Feature 032 made for making them
public in the first place.

### WebSocket contexts

`shouldSkip` passes non-HTTP contexts through, exactly as `JwtAuthGuard` does and
for the same reason: there is no HTTP request under a WebSocket message, so
`switchToHttp().getRequest()` returns the socket, whose `ip` is undefined. Every
connected client would share the `unknown` bucket and the whole company would be
limited as one caller after a few hundred notifications.

This is not a hole. A socket's *handshake* is an HTTP upgrade request, which this
guard does see and does count. What is unlimited is messages on an
already-established connection — a bounded population, authenticated at the
handshake.

---

## The client key

### `request.ip`, and nothing else

`getTracker` reads `request.ip` and no header. Express has **already** resolved
the forwarding chain according to `trust proxy`, so this reads the correct client
address in both topologies without knowing which one it is in.

Reading `x-forwarded-for` directly would let any caller write their own address
and mint a fresh bucket per request — the exact bypass `auth.controller.ts`
already refused for the audit columns, and it would be worse here because it
would silently disable the whole feature.

A request whose address cannot be determined falls back to one **shared**
`unknown` bucket rather than a fresh one. Everybody affected being limited
together is a visible problem; a new bucket per request is a silent hole.

### `IP + email` on login

The strict tier appends the submitted address, folded by
**`normalizeEmailAddress`** — the function `@IsEmailAddress()` transforms with,
extracted in this feature so the two cannot drift.

That reuse is not tidiness, it is the difference between a limiter and a bypass.
This runs in a guard, **before** the `ValidationPipe` has built a DTO, so the
value is whatever the caller typed. Folded differently from the way `AuthService`
looks the account up, `Maria@company.com` and `maria@company.com` would be two
buckets against one row — and the strict allowance would double for every
capitalisation an attacker could think of. A test asserts three spellings share
one bucket.

`POST /auth/refresh` submits a token and no address, so its bucket is keyed on
the client alone, with an explicit placeholder rather than an empty string.

### Nothing is logged

No password, token or body reaches the key derivation: it reads one field and
ignores the rest. The address is hashed into a bucket key by the library and
written nowhere. A limiter that logged its input would be a log of who is trying
to sign in and — on the request that mistypes an address into the password box —
of a password. The value is also bounded to 254 characters before it becomes a
map key, since the body parser would otherwise allow 100 kB of key material per
request.

---

## `TRUST_PROXY` — the deployment implication

**This is the setting that decides whether rate limiting works at all**, and it is
the part of this feature most likely to be got wrong in production.

`request.ip` is the socket's address unless Express is told otherwise. Both ways
of getting that wrong are serious, and they fail in opposite directions:

| Misconfiguration | What happens |
| --- | --- |
| **Left at `false` behind a proxy** | Every request appears to come from the load balancer. The entire internet shares **one** rate-limit bucket: the first busy minute locks out the whole company, and every session is logged with the proxy's address. A self-inflicted outage. |
| **Set to `true` with no proxy** | `X-Forwarded-For` is a request header, so the **caller** writes it. Anyone presents a fresh address per request and gets a fresh bucket. Rate limiting is not weakened — it is gone, bypassed with one header. |

There is no value that is safe in both topologies. That is precisely why it is
configuration with no clever default rather than something inferred.

**Off is the default**, because a developer machine has no proxy and an
unconfigured deployment should fail in the direction that over-counts rather than
the one that can be bypassed. A shared bucket is visible within minutes; a
spoofable one is invisible until it matters.

**A hop count is the recommendation.** `TRUST_PROXY=1` behind a single nginx, ALB
or ingress means "the last entry in the chain was written by my proxy; trust that
one and no further" — and it stays correct when the proxy's own address changes,
as every managed load balancer's does. `true` is accepted, because a value
Express accepts should not be one this parser rejects, and it logs a warning at
startup naming the condition under which it is safe.

Validated at startup rather than left to Express, which treats an unrecognised
value as a hostname to resolve and would turn a typo into addresses resolved in a
way nobody intended.

Applied in `configureApp` rather than `main.ts`, so a spec booting through it
resolves addresses exactly as the server does — the same reason the
`ValidationPipe` and the response interceptor live there.

---

## The 429 response

```jsonc
{
  "success": false,
  "statusCode": 429,
  "message": "Too many requests; please wait before trying again",
  "errorCode": "RATE_LIMIT_EXCEEDED",
  "path": "/api/v1/auth/login",
  "timestamp": "2026-08-09T07:14:22.031Z"
}
```

Plus `Retry-After: <seconds>`.

### Integration with Feature 033

`RATE_LIMIT_EXCEEDED` joins the catalog beside `INTERNAL_ERROR` and
`VALIDATION_ERROR`, as the third generic code no domain service throws by hand.

`throwThrottlingException` is overridden to raise an ordinary `HttpException`
carrying a `codedError` payload, so the refusal flows through
`AllExceptionsFilter` exactly like every other error in the application. The
library's own `ThrottlerException` was **not** used: it carries the fixed string
`ThrottlerException: Too Many Requests` and no code, which would have made this
the one response in the API a frontend could not translate. A test asserts that
string never appears in a body.

**One code for both tiers.** A client's response is the same either way — stop,
wait, try again — and distinguishing them would publish which limit was hit, and
therefore what the other one is, to exactly the caller who is probing for it. No
`params`, for the same reason: the numbers are deployment configuration.

### `Retry-After`

Written by the guard rather than left to the library, which suffixes the header
with the tier name for every tier except one called `default` — a `429` from the
strict tier would otherwise carry `Retry-After-auth`, a header no client
implements. Writing it in one place means one standard header whichever tier
tripped.

Floored at one second: the library's `timeToBlockExpire` is a ceiling of the
remaining milliseconds and can round to zero on the request that trips the limit,
and `Retry-After: 0` invites the immediate retry the header exists to prevent.

`X-RateLimit-Limit`, `-Remaining` and `-Reset` are left as the library sets them
on successful responses.

---

## Storage: in-memory, and the limit of that

The default store is a `Map` in the process. **Correct for one backend instance,
which is what this deployment runs, and wrong the moment there are two.**

With multiple instances the counters are per-instance and **the effective limit
multiplies by the instance count** — three replicas mean an attacker gets three
times the allowance, and which share they get depends on where the load balancer
sends them. Nothing here detects that; it is a property of the topology, and it
degrades quietly rather than failing.

The fix, when the application is scaled horizontally, is a shared store behind
the same `ThrottlerStorage` interface — the Redis adapter is the usual choice —
supplied through the `storage` option already present in the module's factory.

**It is deliberately not built now.** It would add a Redis dependency, a
connection to configure and a new failure mode — what does the limiter do when
the store is unreachable, fail open or fail closed? — to an application that runs
as a single instance today. Recorded under *Future Improvements* rather than
guessed at, consistent with how this project defers scale concerns.

Counters are also lost on restart, which is the right trade for a rate limit and
would be the wrong one for a quota. It is why the window is capped at a day.

---

## Database

**No change.** No model, no column, no migration. `npx prisma validate` passes and
the schema is untouched.

Rate limiting is deliberately stateless with respect to the database: a counter
written per request would put a write on the hot path of every route in the
application, including the ones being flooded, which is a denial of service with
extra steps.

---

## Environment

Five new variables, all optional, validated in `env.validation.ts` in the file's
existing style. **An environment that says nothing about them still boots — and
boots limited**, with the declared defaults. An absent variable is never read as
"no limit".

| Variable | Required | Default | Bounds |
| --- | --- | --- | --- |
| `RATE_LIMIT_DEFAULT_LIMIT` | no | `300` | 1 – 100 000 |
| `RATE_LIMIT_DEFAULT_TTL` | no | `60` s | 1 – 86 400 s |
| `RATE_LIMIT_AUTH_LIMIT` | no | `10` | 1 – 100 000 |
| `RATE_LIMIT_AUTH_TTL` | no | `300` s | 1 – 86 400 s |
| `TRUST_PROXY` | no | `false` | `false` / `true` / hop count / address list |

They are optional where the JWT secrets are required, and the asymmetry is the
same one Feature 032 drew: a deployment with no signing secret has no legitimate
degraded state, while a deployment that has not thought about rate limits has a
perfectly good one — the defaults. What is *not* optional is that the values make
sense, so a limit of zero (which would refuse the health check) and a limit of a
million (somebody switching the feature off without saying so) are both refused
at startup.

**Windows are stated in seconds**, matching `JWT_ACCESS_TTL` and
`JWT_REFRESH_TTL`; an operator should not have to remember which variable in one
file is counted differently. `@nestjs/throttler` measures in milliseconds, and
the conversion happens once, in `loadRateLimitConfig`, so no call site multiplies
by a thousand and none forgets to.

`rate-limiting.config.ts` follows the per-module pattern `auth.config.ts` and
`email.config.ts` established — a `RATE_LIMIT_KEYS` map so no literal is repeated,
and a `loadRateLimitConfig` reader. Like `loadJwtConfig` and unlike
`loadSmtpConfig`, **it throws** rather than degrading: there is no useful
half-configured rate limiter, and a limit that failed to load would leave the API
unprotected while appearing to be protected.

---

## The dependency

**`@nestjs/throttler@6.5.0`** — one package, with **no runtime dependencies of its
own**.

```bash
npm install @nestjs/throttler
```

It is here for the part that is easy to write and hard to write correctly: a
window whose counter does not reset on every request, a per-key store that
expires its own entries, and the `X-RateLimit-*` headers. The same call Feature
032 made in taking `@nestjs/jwt` for verification while writing the header
parsing by hand — and this module likewise writes by hand the two things that are
*this application's* decisions rather than the library's: what a client is keyed
on, and what a refusal looks like.

Its peer range is `@nestjs/common`/`core` `^11.0.0`, matching this project.

---

## Backend

### Files Created

| File | What it is |
| --- | --- |
| `src/config/trust-proxy.config.ts` | `parseTrustProxy`, `applyTrustProxy`, and the list/entry helpers `env.validation.ts` validates with. Carries the deployment argument in full — the two failure modes, and why a hop count is the recommendation. The analogue of `cors.config.ts`, and it sits beside it. |
| `src/config/trust-proxy.config.spec.ts` | 23 tests: every accepted shape, and the typos Express would silently treat as a hostname. |
| `src/modules/rate-limiting/rate-limiting.module.ts` | `ThrottlerModule.forRootAsync` with the two named tiers, both read from configuration. Records why `@Throttle()` cannot express an env-tunable limit, and why `skipIf` confines the strict tier rather than `@SkipThrottle` on every other controller. |
| `src/modules/rate-limiting/rate-limiting.config.ts` | `RATE_LIMIT_KEYS`, `RateLimitConfig`, `loadRateLimitConfig`. Seconds in, milliseconds out, once. |
| `src/modules/rate-limiting/rate-limiting.constants.ts` | Tier names, the refusal message, `Retry-After`, the key separator and the two placeholder trackers. Documents why the baseline tier's name must literally be `default`. |
| `src/modules/rate-limiting/rate-limiting.guard.ts` | `ApiThrottlerGuard`: the non-HTTP pass-through, the client key, the bucket key, and the coded `429`. Plus `readClientAddress` and `readSubmittedIdentity` as pure exported functions. |
| `src/modules/rate-limiting/decorators/strict-rate-limit.decorator.ts` | `@StrictRateLimit()`, `STRICT_RATE_LIMIT_KEY` and `isStrictlyRateLimited`. Carries the additive-not-override argument. |
| `src/modules/rate-limiting/rate-limiting.config.spec.ts` | 14 tests: the conversion, the string forms, and the refusals. |
| `src/modules/rate-limiting/rate-limiting.guard.spec.ts` | 23 tests on the two key halves, including the case-folding rule and the length bound. |
| `src/modules/rate-limiting/routing.spec.ts` | 17 tests over HTTP against the real module, the real `AuthController` and both real guards. |

### Files Modified

| File | Change |
| --- | --- |
| `src/config/env.validation.ts` | The five variables, their bounds and defaults, and `IsTrustProxyConstraint`. |
| `src/config/env.validation.spec.ts` | 30 new tests across two `describe` blocks. |
| `src/config/app.setup.ts` | `applyTrustProxy` before CORS, so a spec booting through it resolves addresses as the server does. |
| `src/app.module.ts` | `RateLimitingModule`, and `ApiThrottlerGuard` as an `APP_GUARD` **declared before** `JwtAuthGuard`. |
| `src/common/constants/error-codes.constants.ts` | `RATE_LIMIT_EXCEEDED`, with why one code covers both tiers. |
| `src/common/decorators/is-email-address.decorator.ts` | `normalizeEmailAddress` extracted and reused by the decorator, so the guard folds an address identically. |
| `src/modules/auth/auth.controller.ts` | `@StrictRateLimit()` on `login` and `refresh`; the `readClientContext` comment updated, since `trust proxy` is no longer unset. |
| `.env.example` | Two new blocks: rate limiting, and the reverse proxy. |
| `package.json` | `@nestjs/throttler`. |

**No Prisma schema change. No migration. No change to any authentication
behaviour** — `AuthService`, `TokenService` and `JwtAuthGuard` are untouched.

---

## Frontend

None. This feature is backend-only. What the frontend should do with it:

1. **Handle `429` wherever it handles errors**, keyed on `RATE_LIMIT_EXCEEDED`
   through the `errorKeyOf` helper Feature 033 defined. A Romanian string such as
   *"Prea multe încercări. Așteptați puțin și încercați din nou."* belongs in
   `ro/errors.json` beside the others.
2. **Respect `Retry-After`.** It is in seconds. A retry loop against a limiter
   extends the block instead of shortening it, so an automatic retry must wait at
   least that long — and the login form should disable its submit button for the
   duration rather than letting somebody click into a longer block.
3. **Do not treat it as a session problem.** `429` is not `401`: refreshing will
   not help, and a client that lumps them together will loop.
4. `X-RateLimit-Remaining` is available on successful responses if a debugging
   view ever wants it. Nothing user-facing should depend on it.

---

## Testing

`npm test` → **123 suites, 2 517 tests, all passing** (up from 2 410 — 107 new).
`npx tsc --noEmit` clean. `npm run build` clean.

**The regression that mattered most:** all 2 410 pre-existing tests passed
unchanged. Nothing about the limiter is visible to a module that does not exhaust
it, which is the property a cross-cutting guard has to have.

| Area | Covered |
| --- | --- |
| Under the limit | a client spends its whole allowance; authenticated traffic inside the limit is untouched and still gets the success envelope |
| Over the limit | the next request is `429`; the full envelope asserted field by field with `RATE_LIMIT_EXCEEDED`; the library's `ThrottlerException` string never appears |
| `Retry-After` | present, positive, and no larger than the window |
| Strict tier | login and refresh both trip in **fewer** attempts than the baseline would allow, with the assertion that the strict allowance *is* smaller; login and refresh keep separate buckets |
| Counting failures | a flood of wrong passwords is limited — `401`, `401`, then `429` |
| Guard ordering | a flood of *unauthenticated* requests to a protected route is counted and eventually `429`s, which is only possible if the limiter runs before `JwtAuthGuard` |
| `@Public()` | a public route is limited exactly like a protected one |
| Baseline scope | every route counts against one bucket per client; two clients have separate allowances |
| Client key | three capitalisations of one address share one bucket; two different addresses from one client do not |
| `TRUST_PROXY` | with a proxy trusted, two forwarded addresses get separate buckets; **with none trusted, a spoofed header opens no second bucket** |
| Configuration | the seconds-to-milliseconds conversion; string forms; a missing variable names itself; zero, negative, fractional and absurd values refused |
| Environment | defaults applied when nothing is set; the strict default asserted to be below the baseline; every `TRUST_PROXY` shape accepted and every typo refused |

---

## Notes

### Nothing to run

No migration, no new required variable. The defaults apply and the application
starts as it did.

### The one thing to do before deploying behind a proxy

Set `TRUST_PROXY`. It is the only manual step this feature introduces, it has no
safe default that works in both topologies, and getting it wrong is either an
outage or a bypass. See the table above.

Verify it after deploying — log in, and check that `refresh_tokens.ip_address`
holds the client's address rather than the load balancer's. That column is the
cheapest read-out of what the limiter is keying on, since both come from
`request.ip`.

### What Feature 032's follow-up list looks like now

Item 1 (**rate-limit login and refresh**) is closed by this feature. Item 5
(**`trust proxy`**) is closed as well — it was recorded there as an audit-trail
concern and turned out to be a prerequisite for this one.

Items 2, 3, 4, 6, 7 and 8 are untouched and still open.

---

## Future Improvements

1. **A shared store for horizontal scaling.** The one thing this feature knows is
   incomplete rather than deferred by choice. In-memory counters are
   per-instance, so N replicas mean N times the effective limit. `@nest-lab/throttler-storage-redis`
   (or any `ThrottlerStorage` implementation) drops into the `storage` option in
   `rate-limiting.module.ts` — the module is already shaped for it. What needs
   deciding at the same time, and is the actual work: **fail open or fail closed
   when the store is unreachable.** Failing closed turns a Redis blip into a total
   outage; failing open turns it into a window with no limiting at all. Neither is
   obviously right, which is why it is not being guessed at now.
2. **Stricter limits on report exports.** `POST /reports/*/export` reads six
   tables and renders a PDF, which is the most expensive request in the
   application by a wide margin. Adding `@StrictRateLimit()` is the whole change
   — but the strict tier's numbers are tuned for password guessing, and an export
   wants a different allowance, so this probably wants a *third* tier rather than
   reuse. Worth doing once there is real usage data to size it from.
3. **Account lockout after repeated failures**, which Feature 032 suggested
   alongside rate limiting. Deliberately not built here: a limiter bounds a
   *rate*, while a lockout changes what an account *is*, and it brings its own
   abuse — anybody who knows an address can lock its owner out. It needs a story
   about unlocking (time, or HR, or both) and a column on `users`, which makes it
   a feature rather than a setting.
4. **A per-IP counter on the auth routes specifically.** Today a password spray
   from one address is bounded by the baseline (300/min), not by the strict tier,
   because the strict bucket is per account. That is a real bound and it is much
   looser than the per-account one. A third tier keyed on the address alone,
   sized between the two, would close the gap.
5. **Skip the limiter for trusted internal callers.** A monitoring system or a
   future service-to-service integration will eventually hit the baseline. The
   throttler's top-level `skipIf` is the hook; what it should key on — a network
   range, an API key — is a decision that belongs with whatever integration
   forces it, and Feature 025's rule about not guessing an integration in advance
   applies.
6. **Log a warning when a client is blocked.** Nothing is emitted today, so the
   first sign of a brute-force attempt is nothing at all. A rate-limited log line
   carrying the tier and a *hashed* client key — never the address, never the
   email — would make an attack visible without becoming a log of who is trying to
   sign in. It pairs with whatever monitoring the deployment grows.
