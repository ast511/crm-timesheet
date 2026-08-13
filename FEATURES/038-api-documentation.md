# API Documentation (Swagger / OpenAPI)

## Goal

Give this API a description of itself that **cannot be wrong**.

Thirty-seven features built 124 endpoints, and the only way to find out what any
of them accepts was to read the controller, then the DTO, then the field
decorator, then the service. That is a workable answer for the person who wrote
it and no answer at all for the frontend team about to consume it.

The obvious fix — write it down — is the one that fails. A hand-written contract
is correct on the day it is written and decays silently afterwards: nothing
fails when a field is renamed, so nobody finds out until a screen breaks against
a payload the document still describes.

So this feature adds no description of the API. It adds a **generator**: the
document is produced from the controllers, the DTOs and the entity classes that
already exist, at build time, from the running application. A field renamed in a
DTO is renamed in the documentation. A route deleted disappears from it. A
payload that gains a property gains it in the schema. There is no second copy to
keep in step, because there is no second copy.

Served two ways:

- **`/api/docs`** — Swagger UI, with an **Authorize** button and working "Try it
  out" against the live service.
- **`/api/docs-json`** — the raw OpenAPI document. **This is the frontend's
  contract**, and a typed client is generated from it.

## Requirements

- Generated from code, never hand-written; no file that can drift.
- The documented paths are the **real** ones — `/api/v1/…` — so "Try it out"
  hits the route the reader is looking at.
- Every one of the 28 controllers grouped, described and reachable.
- The Feature 006 envelope and the Feature 033 error envelope described as they
  are actually sent, not as the handler signatures suggest.
- Bearer auth documented, and the seven `@Public()` routes marked as needing no
  token.
- Constraints that are real, including the ones hidden inside this project's
  composed field decorators.
- **No secret in any schema, ever**, asserted rather than assumed.
- Exposure env-gated, and off in production unless somebody says otherwise.
- Swagger UI renders without weakening the Content Security Policy of the API.
- No Prisma schema change. No route behaviour change — this feature *describes*
  the API and must not alter it.

---

## The endpoints

| Route | What it is |
| --- | --- |
| `GET /api/docs` | Swagger UI. Authorize once, then every "Try it out" carries the token. |
| `GET /api/docs-json` | The OpenAPI 3.0 document. 75 paths, 124 operations, 125 schemas, 21 tags. |

Both are under `/api` so a reverse proxy routing on that prefix forwards them,
and both are deliberately **outside `/api/v1`**: the document describes every
version the API serves, so filing it under one of them would be a claim that
stops being true the day a `v2` controller appears.

### They are outside Nest's routing pipeline, and that has consequences

`SwaggerModule` registers these straight onto the Express adapter. No global
prefix, no versioning, no guards, no `ValidationPipe`, no response envelope.
Three things follow, and all three are asserted:

1. **The documentation is reachable without an access token.** It has to be — it
   is what tells a caller how to obtain one. `@Public()` is not involved, because
   there is no Nest route for a guard to have exempted.
2. **`/api/docs-json` is not enveloped.** A client reading it must not look for
   `data`.
3. **Whether it is reachable at all is `SWAGGER_ENABLED`**, checked before
   anything is mounted — see below.

---

## Where it initialises, and why there

```ts
// main.ts
const app = await NestFactory.create(AppModule);

configureApp(app);          // prefix, versioning, pipe, envelope, guards, Helmet
const docsEnabled = setupSwagger(app);   // ← here

await app.listen(port);
```

**After `configureApp`**, and that is the load-bearing part. `setGlobalPrefix`
and `enableVersioning` are what turn `@Controller('departments')` into
`/api/v1/departments`, and the scanner reads both off the application. Generated
before, every path in the document would be missing `/api/v1` and every request
from the page would `404`. `openapi.e2e-spec.ts` asserts the prefix on every
path.

**Not inside `configureApp`**, unlike every other global concern, and that is
deliberate rather than an oversight. That function is the contract the e2e suite
boots through and it must keep describing the *application*. Documentation is a
property of the *deployment*: it is optional, it is env-gated, and a spec that
wanted to assert the application's behaviour with the documentation switched off
could not do so if generating it were unconditional. The e2e suite calls
`configureApp` and then `setupSwagger`, exactly as `main.ts` does.

There is deliberately **no `.addServer()`**. The scanner already writes the
prefix and the version into every path, so a server entry of `/api/v1` would be
prepended to a path that already carries it and every request would go to
`/api/v1/api/v1/…`.

---

## Exposure: off in production unless somebody says so

`SWAGGER_ENABLED`, optional, defaulting **to `true` outside production and
`false` in it**.

The document is a complete map of the API: every route, every field of every
payload, every permission a route requires, and a form that submits real
requests. None of that is a vulnerability on its own — every route stays
authenticated, authorised and rate limited, and the document contains no
credential — but it is reconnaissance handed over for free, and no production
deployment should hand it over by accident.

It is a **deliberate default rather than a hard rule**, because the case for
documentation in production is real: an internal deployment behind a VPN, or a
staging environment a frontend team codes a client against. `SWAGGER_ENABLED=true`
is how that is said, and saying it is the point — the exposure is then a decision
somebody made rather than one nobody noticed.

Defaulted **in the reading code** rather than by an initialiser on the contract,
the arrangement `SECURITY_HSTS_ENABLED` and `NOTIFICATION_SCHEDULER_ENABLED`
both use: "unset" and the safe value are the same thing at the one place that
reads them. Only the exact spellings `true` and `false` count; `yes`, `1`, `on`
and `TRUE` all fall through to the `NODE_ENV` default, which fails closed in
production. Thirteen tests pin the near misses.

**Both states are proved.** `openapi.e2e-spec.ts` boots two applications: with
the documentation on, and with it off. In the second, both routes and the UI
assets answer `404` — rendered as the ordinary Feature 033 envelope, which is
what proves the route genuinely does not exist rather than being served and
refused — and the API is otherwise byte-for-byte the API.

---

## The CSP relaxation, scoped to one route

Feature 037 wrote a note for exactly this moment:

> **When Swagger UI is added** (a separate feature): set
> `SECURITY_CSP_MODE=relaxed` on the deployments that expose it.

That would have worked, and it would have loosened the policy on **every
response in the deployment** to fix one HTML page. This feature ships the
narrower version instead: a second CSP middleware mounted at `/api/docs` alone,
so every other route keeps whatever the environment configured — strict, by
default and in production.

```ts
app.use(SWAGGER_DOCS_ROUTE, helmet.contentSecurityPolicy(buildDocsCspOptions(configService)));
```

Helmet has already run globally inside `configureApp` and written the strict
policy onto every response; this overwrites that one header for the one page
that renders HTML.

### Exactly one directive is loosened — and not the one 037 predicted

| Directive | API | `/api/docs` |
| --- | --- | --- |
| `style-src` | `'self'` | `'self' 'unsafe-inline'` |
| `script-src` | `'self'` | `'self'` — **unchanged** |
| `script-src-attr` | `'none'` | `'none'` |
| everything else | — | inherited unchanged |

Feature 037 expected both `script-src` and `style-src` to need `'unsafe-inline'`.
Reading the actual template, only styles do: the UI's HTML carries two inline
`<style>` blocks, but every script it loads is an **external file served from
this same origin** — `swagger-ui-bundle.js`, `swagger-ui-standalone-preset.js`,
`swagger-ui-init.js` — which `script-src 'self'` already allows. So inline script
stays blocked on the one page in this application that renders any HTML at all.
No `'unsafe-eval'`, no third-party origin: the UI is served from
`swagger-ui-dist` inside this process, not from a CDN.

`buildDocsCspOptions` is built **on top of** `buildDirectives` rather than beside
it, so the docs page inherits every directive the deployment configured and
differs from it in one line. A directive tightened in `BASE_DIRECTIVES` tightens
here too, and a test asserts that property directly.

`/api/docs-json` does **not** match the `/api/docs` mount, and that is
deliberate: the raw document is JSON and needs no inline anything, so it keeps
the strict policy.

`SECURITY_CSP_MODE` is untouched by this feature and stays at `strict`.
`.env.example` now says so, because 037's note told operators to change it.

### Verified against a running server, not only the harness

`node dist/main.js` on port 3099:

```
GET /api/docs        → style-src 'self' 'unsafe-inline'; script-src 'self'
GET /api/v1/health   → style-src 'self'
GET /api/docs-json   → style-src 'self'
```

with `nosniff`, `no-referrer` and no `X-Powered-By` still on the documentation
page, and all four UI assets answering `200` from this origin.

---

## Tagging: the document as a map of the system

Twenty-one tags, declared in `swagger-tags.ts` with a sentence each, in
**reading order rather than alphabetical** — the dependency order the modules
were built in, which is also the order they make sense in. Somebody opening the
page reads "is the service up", then "how do I sign in", then the reference data,
then the work that depends on it, then the cross-cutting administration.

`Service` · `Authentication` · `Profile` · `Users & Accounts` · `Employees` ·
`Departments` · `Positions` · `Projects` · `Project Members` · `Work Schedule` ·
`Public Holidays` · `Leave Configuration` · `Leave Balances` · `Leave Requests` ·
`Timesheets` · `Reporting` · `Notifications` · `Notification Management` ·
`Notification Delivery` · `Permissions` · `Email`

A tag groups a **domain, not a controller**. Seven controllers share a tag with
another: `/leave-requests` and `/me/leave-requests` are the same resource seen by
an approver and by its owner, and splitting them would ask a reader to know which
class a route happens to live in.

Names are referenced by symbol from `@ApiTags(API_TAG.X)`, never typed as a
literal — the rule `ERROR_CODES` follows, and for the same reason: a typo would
silently create a twenty-second group containing one endpoint. The e2e suite
asserts **both directions** — every tag used is declared, and every tag declared
is used — so neither half can rot.

---

## The two envelopes, documented as they are actually sent

### Success (Feature 006)

`ResponseInterceptor` wraps every successful body in `{ success, data }`, so a
handler's return type is **never** what a client receives. Documenting
`@ApiOkResponse({ type: DepartmentEntity })` would therefore describe a body this
API has never sent — the single most likely way for generated documentation to be
confidently wrong, because it looks right and matches the signature.

Five helpers apply the wrapping to the documentation in the one place it is
applied to the responses:

| Helper | `data` |
| --- | --- |
| `ApiOkEnvelope` / `ApiCreatedEnvelope` | one object |
| `ApiOkArrayEnvelope` | a bare array |
| `ApiOkPageEnvelope` | `{ items, meta }` — a `PaginatedResult` |
| `ApiOkNullEnvelope` | `null`, for a handler that returns nothing |
| `ApiOkFileResponse` | **not an envelope** — the report exports |

The last is the carve-out `ResponseInterceptor` already makes: a report export's
body is a spreadsheet or a PDF, and there is no reading of `{ success, data }`
that can contain one. The documentation has to make the same exception or it
would promise JSON on the one route that never sends any.

`meta` is a `$ref` rather than an inline shape, so the six pagination fields are
one schema in the document instead of being repeated on each of the eighteen
paginated endpoints.

### Failure (Feature 033)

**`ErrorEnvelope` is one named schema**, and every documented failure on every
route points at it — 500-odd error responses, all `$ref`ing the same definition.
That is the reason the reusable decorator exists: copying the envelope out per
route would be hundreds of opportunities to describe it slightly differently, and
the first one to drift would be the one nobody re-read.

```ts
export class ErrorEnvelope implements ApiErrorResponse { … }
```

**`implements ApiErrorResponse` is the anti-drift device, not a formality.** The
interface is what the filter actually builds; the class is what the documentation
promises. Declaring the one against the other means a field added to the
envelope, renamed or retyped fails the build here rather than producing
documentation that quietly describes an envelope the API stopped sending. It is
the same trick `satisfies Prisma.XSelect` plays on the entity files.

`errorCode` and `params` are marked optional, because their *absence* is part of
the contract Feature 033 gave clients to branch on.

### `@ApiStandardErrors()` — one decorator, not two hundred blocks

```ts
@ApiStandardErrors(HttpStatus.BAD_REQUEST, HttpStatus.NOT_FOUND)
```

`401`, `429` and `500` are added automatically, because they are true of every
authenticated route whatever it does — a global `JwtAuthGuard`, a global
`ApiThrottlerGuard`, and the fact that anything can fail. The situational ones
are passed in, so **a route that cannot 404 does not claim it can**. Applied to a
controller class it covers every route in it, which is how the per-route lists
stay short.

Each status carries a description of what it means *in this application* — which
component produced it and which `errorCode` travels on it — rather than a
restatement of what "Bad Request" is called. The codes are interpolated from
`ERROR_CODES` by symbol, so a rename reaches the documentation.

`429` additionally documents `Retry-After`, because a client that retries into a
limiter extends the block rather than shortening it.

### `ApiPublicRouteErrors()`, and the 401 that means something else

A `@Public()` route gets the same treatment minus the automatic `401`. But two
of them — `POST /auth/login` and `POST /auth/refresh` — genuinely *do* answer
`401`, and it means something completely different there: **the credential in the
body was refused**, not that a token was missing. Reusing the guard's wording
would have told a reader that login needs a token in order to issue one, which is
the exact confusion `@Public()` exists to prevent. So those two get their own
description, from one override rather than a per-route annotation.

What actually tells a reader no token is required is the **absence of a security
requirement** on the operation. The e2e suite asserts the exact list of seven:

```
GET  /api/v1              GET  /api/v1/health
POST /api/v1/auth/login   POST /api/v1/auth/refresh
POST /api/v1/auth/activate
POST /api/v1/auth/forgot-password
POST /api/v1/auth/reset-password
```

Every other operation carries `access-token`, matching the global guard exactly.

### One example per status, over the one shared schema

**The shape was right and the rendered example was wrong.** Every failure
`$ref`s `ErrorEnvelope` and carries nothing else, so Swagger UI had to invent an
example — and the only material it had was the *field-level* `example:` values on
the schema. Those belong to different failures:

```ts
@ApiProperty({ example: 404 })                            statusCode
@ApiProperty({ example: 'Public holiday not found' })     message
@ApiPropertyOptional({ example: 'AUTH_UNAUTHENTICATED' }) errorCode
@ApiPropertyOptional({ example: { requiredPermissions: … } }) params
```

Assembled, they are a `404` carrying an authentication code and a permission's
`params` — a body this API cannot produce. And because a synthesised example
comes from the schema rather than from the response, **the same impossible body
appeared under the `401`, the `403`, the `404`, the `429` and the `500` of every
route in the document**. Two statuses that mean opposite things to a client
rendered identically, which is worse than no example: a reader comparing them
concluded they were the same response.

The fix is not a schema per status — that would fork the one definition 500
responses point at, which is the drift the decorator exists to prevent. It is one
**example** per status, attached to the *response* rather than to the schema,
which is where OpenAPI puts a value that varies by usage:

```ts
ApiResponse({
  status,
  description: descriptions[status],
  content: {
    'application/json': {
      schema: { $ref: getSchemaPath(ErrorEnvelope) },  // unchanged, one schema
      ...examples[status],                             // coherent, per status
    },
  },
})
```

`ErrorEnvelope` stays exactly one named schema referenced by `$ref` everywhere.
Only the example values differ.

The map lives in `src/common/swagger/error-envelope.examples.ts`, and an example
qualifies only if the application could actually send it:

| Status | Code | `params` |
| --- | --- | --- |
| `400` | `VALIDATION_ERROR` | none — `message` is the per-field array |
| `400` | `ACCOUNT_TOKEN_INVALID` | `purpose` |
| `401` guarded | `AUTH_UNAUTHENTICATED` | none |
| `401` guarded | `AUTH_INACTIVE_USER` | none |
| `403` | `AUTHORIZATION_PERMISSION_DENIED` | `requiredPermissions`, `mode` |
| `403` | `AUTHORIZATION_ACCOUNT_ADMIN_REQUIRED` | none |
| `403` | `AUTH_NO_EMPLOYEE_RECORD` | none |
| `404` | **none** | none |
| `409` | **none** (the common case) | none |
| `409` | `ACCOUNT_NOT_PENDING_ACTIVATION` | `status` |
| `429` | `RATE_LIMIT_EXCEEDED` | none |
| `500` | `INTERNAL_ERROR` | none |

**A `404` carries no code** and that row is the point rather than an omission:
nothing in this application throws a coded not-found, so it is the envelope's
documented "key absent entirely" case — the fallback to `statusCode` and
`message` that made Feature 033's migration gradual — and the old example taught
a client to branch on a code it will never receive.

**`409` shows both halves of that migration.** Most conflicts are still uncoded
and the catalog has no `TIMESHEET_*` or `LEAVE_*` conflict code, so inventing one
would promise a string a frontend could key a translation on and never be sent.
But one conflict *is* coded, and showing only the uncoded kind would have taught
a client that a `409` never carries a code — the mirror of the `404` mistake.

`400`, `401`, `403`, `409` and the public `401` use OpenAPI's **named** `examples:`
rather than a single `example:`, because each has several causes a client must
respond to differently — a permission that can be granted versus a boundary that
cannot, an ordinary refresh expiry versus a reused token that has just revoked
every session. Picking one would have misrepresented the others.

### The drift this uncovered: `AUTH_INACTIVE_USER` was never a `403`

Writing the examples forced every code to be checked against its throw site, and
the `403` description had been wrong since it was written. It listed
`AUTH_INACTIVE_USER` alongside `AUTH_NO_EMPLOYEE_RECORD` as "about the account
behind a perfectly valid credential" — true of both, but only the second is a
`403`. `AUTH_INACTIVE_USER` has exactly one throw site,
`AuthService.findActiveUser`, and it is an `UnauthorizedException`:

```ts
if (user.status !== AccountStatus.ACTIVE) {
  throw new UnauthorizedException(
    codedError(ERROR_CODES.AUTH_INACTIVE_USER, message),
  );
}
```

**The code is the source of truth, so the description moved to `401`** — with a
note on which flows produce it, since `findActiveUser` is reached from three:
any authenticated request, `GET /auth/me`, and `POST /auth/refresh`. Never from
login, which is the distinction the catalog's own comment turns on:
`AUTH_INVALID_CREDENTIALS` is deliberately vague because an unauthenticated
caller must not learn that an account exists, while a caller who already holds a
valid token for it learns nothing new.

The consequence for a client is why this mattered rather than being a filing
error. The `403` description ends "refreshing the token never helps", which is
correct for a permission refusal and exactly wrong for a deactivated account: a
frontend that read the old description would have shown "ask an administrator for
access" to somebody whose account was disabled. The `401` example now shows both
codes side by side, because `findActiveUser` hands both branches the *same*
message — the code is the only thing that separates "refresh, then show the login
screen" from "signing in again will fail forever; speak to HR".

Three smaller corrections came out of the same sweep:

- **`ACCOUNT_CURRENT_PASSWORD_INCORRECT` is a `401`** (`account-password.service.ts`),
  reachable only on `POST /auth/change-password`, where the session is fine and it
  is the `currentPassword` in the body that was wrong. The status was already
  documented — it is one of the automatic three — but the description named only
  `AUTH_UNAUTHENTICATED`, so the code appeared nowhere. Now noted on the `401`.
- **`AUTH_UNAUTHENTICATED` also reaches `403` once**, from `ProfileService`'s
  defensive `sessionAccountMissing()` — an account that vanished between the guard
  and the handler, commented in place as unreachable in practice. Documented on the
  `403` as the edge case it is, rather than left as a silent contradiction of
  "`403` never carries an auth code".
- **`ACCOUNT_NOT_PENDING_ACTIVATION` is a `409`** carrying `status`, which is what
  corrected the `409` example above.

`openapi.e2e-spec.ts` now asserts the corrected mapping document-wide and in both
directions — `AUTH_INACTIVE_USER` appears under `401` and under no other status —
so neither a description nor an example can put it back.

`PUBLIC_ERROR_EXAMPLES` overrides the `401` example the same way
`PUBLIC_DESCRIPTIONS` overrides its description, and for the same reason: on
`POST /auth/login` and `POST /auth/refresh` the refusal is of **the credential in
the body**, so the example shows `AUTH_INVALID_CREDENTIALS`,
`AUTH_REFRESH_TOKEN_INVALID` and `AUTH_REFRESH_TOKEN_REUSED`. Leaving the guard's
`AUTH_UNAUTHENTICATED` there would have contradicted the description printed
directly above it.

The messages are quoted from the constants the services throw, but **copied
rather than imported**: `common/` does not depend on `modules/`, and a message is
explicitly free to be reworded — an example that lags a rewording is illustrative
rather than wrong. The `errorCode` beside it is the half that is a contract, and
that one is referenced by symbol from `ERROR_CODES`, so a rename reaches the
examples exactly as it reaches the descriptions.

**Which example wins**, since two now exist: a media-type example overrides
anything the schema would have synthesised. The field-level `example:` values on
`ErrorEnvelope` stay — they are still a sane default for anything that `$ref`s
the schema ad hoc — but editing them no longer changes what a documented failure
renders. `error-envelope.schema.ts` carries a note saying so, because the next
person to try it would otherwise conclude the change had no effect.

---

## Schemas: the metadata strategy

### The plugin does the repetitive work

`@nestjs/swagger`'s CLI plugin is enabled in `nest-cli.json` with
`introspectComments: true`, and it reads:

- **the TypeScript type** → `type`, `required`, `nullable`, and `enum` resolved
  from the Prisma enum;
- **the JSDoc on the property** → the `description`.

The second is most of the value here. These DTOs already explain *why* each field
exists, at length, and that prose **is** the documentation. The alternative was
retyping those sentences into `@ApiProperty({ description })` and letting the two
drift.

```
"type": {
  "type": "string",
  "enum": ["FIXED", "VARIABLE"],
  "description": "Required, and it is the field the rest of the record is judged
                  against: it decides whether the year in `startDate` means
                  anything and which duplicate rule applies."
}
```

Not one line of that was written for the documentation.

### The problem: constraints behind a function call

This project does not use raw `class-validator` decorators on DTOs. It uses
**composed field decorators** — `@IsPublicHolidayName()`, `@IsDepartmentCode()` —
that bundle a `Transform`, an `IsString`, an `IsNotEmpty`, a `MaxLength` and a
`Matches` behind one call. The plugin reads decorators *written on the property*,
so everything inside those is invisible to it. Before this feature's fix,
`code` documented as:

```json
{ "type": "string" }
```

Shape-complete and useless. No length, no pattern, no note that it is upper-cased
before the uniqueness check.

### The fix: enrich the decorator, once

An `@ApiProperty` goes **inside the composed decorator**, not on each DTO field —
so one edit covers every DTO that uses the rule, and the constraint is declared
next to the validation it describes:

```ts
export function IsDepartmentCode() {
  return applyDecorators(
    ApiProperty({
      minLength: 1,
      maxLength: DEPARTMENT_CODE_MAX_LENGTH,
      pattern: DEPARTMENT_CODE_PATTERN,
      example: 'IT',
      description: 'Trimmed and upper-cased before it is stored or compared.',
    }),
    Transform(/* upper-case */),
    IsString(), IsNotEmpty(),
    MaxLength(DEPARTMENT_CODE_MAX_LENGTH),
    Matches(DEPARTMENT_CODE_PATTERN, { … }),
  );
}
```

The bounds are the same symbols the validation uses, so a constant changed in one
place changes both. 26 decorators across 15 files, plus the three shared ones
(`@IsRelationId`, `@IsEmailAddress`, `@IsIsoDateString`), which between them
cover most fields in the API.

**Two rules were followed throughout:**

- **Constraints belong to the decorator; prose belongs to the field.** A
  `description` set in a composed decorator *outranks* the JSDoc a DTO writes
  above the property, which is always the more specific of the two. So a
  description is set only where it documents an observable *behaviour* nothing
  else states — the upper-casing, the lower-casing of an address, blank
  collapsing to `null`.
- **Never publish a check the API does not make.** `@IsIsoDateString()` carries
  an `example` but no `format: 'date-time'`, because it accepts a bare
  `2026-09-01` as well as a full instant, and `date-time` means RFC 3339 — a
  generated client validating on it would reject requests this API takes. The
  looser truth is stated once in the document's own description instead. Likewise
  `@IsRelationId()` publishes bounds but no `pattern`, because the validation has
  none.

`@IsRelationId({ each: true })` is handled rather than ignored: on a list of ids
the bounds are per element, so they go on `items`. A `maxLength` on the array
itself would say the *list* may hold fifty entries, which is a different claim
and a false one.

Enum decorators needed nothing — the plugin resolves `HolidayType` from the
TypeScript type on its own.

### Response entities became classes

Every response shape in this project was a TypeScript `interface` or a `type`
alias. Both are erased at compile time, and a schema can only be generated from
something that still exists at runtime — there would be nothing for `$ref` to
point at.

So the ~35 response shapes that cross the API boundary are now **classes**, and
the conversion was strictly behaviour-neutral: nothing constructs them, every
mapper still returns an object literal, and structural typing means no service,
mapper or test changed. The full unit suite passed unchanged immediately after
the conversion — 134 suites, 2 844 tests — which is the property that mattered.

| Was | Is | Guarantee kept |
| --- | --- | --- |
| `interface XEntity { … }` | `class XEntity { … }` | — |
| `type S = Pick<PrismaModel, …>` | `class S implements Pick<PrismaModel, …>` | a column renamed in `schema.prisma` still breaks the build here |
| `type A = B & { … }` | `class A extends B { … }` | shared fields still declared once |
| `type L = Omit<T, 'a' \| 'b'>` | `class L extends OmitType(T, ['a','b'])` | naming a removed field that no longer exists still fails the build |

**The internal `*Row` types stayed interfaces** — `PublicUserRow`,
`TimesheetBaseRow`, `AuthenticatedUserRow`, `CredentialsRow`,
`StoredRefreshToken`, `ProfileRow`, `LeaveSpan`, `OccurrenceSpan`. They describe
what Prisma returns, never what the API sends, so there is nothing to document
and no reason to change them.

Three shapes moved to where every other response shape in this project lives, in
`entities/`, because only a class in such a file is picked up by the generator:

- `ReportDataModel` and its eight companions, from `renderers/report-data-model.ts`;
- `NotificationBulkResult`, from `notification.service.ts`;
- `ReportDefinitionEntity`, extracted from the inline type on `REPORT_DEFINITIONS`.

Two new documentation-only classes were added — `PasswordResetRequestedEntity`
for `POST /auth/forgot-password`, whose payload was an inline
`Promise<{ message: string }>`, and `ErrorEnvelope`.

`PaginationMeta` became a class in `pagination.interface.ts` — the only class
among those interfaces, for the same reason and no other.

**One place needed an explicit `type`.** The plugin infers `T[]` but not
`readonly T[]`, emitting no type at all — which surfaces as a misleading
"circular dependency" error when the document is built. Rather than weaken five
declarations on `ReportDataModel` to plain arrays to suit a documentation tool,
each carries `@ApiProperty({ type: () => [X] })` and stays `readonly`.

---

## Secrets are absent, and that is asserted

The guarantee is structural before it is tested. `UserEntity` has no
`passwordHash` field for a mapper to copy and `USER_PUBLIC_SELECT` never reads
the column; `EmployeeUserSummary` and `ProfileEntity` are the same. The
documented schema is generated **from those same classes**, so the docs and the
queries agree by construction rather than by review.

The tests then check it from the outside, and check it in a way that cannot rot:

- **Five string scans of the whole document** — `passwordHash`, `password_hash`,
  `tokenHash`, `token_hash`, `refreshTokenHash` — over the serialised JSON rather
  than a list of models, so a schema added next year is covered without anybody
  remembering to add a case.
- **No property anywhere whose name contains "hash"**, under any spelling.
- **`UserEntity` documented as exactly the seven fields of the public select**,
  field by field rather than by absence — so a column added to `users` cannot
  reach the docs without somebody publishing it deliberately.
- **`AuthSessionEntity` carries `accessToken` and `refreshToken` and no hash.**
  Those two *are* returned — they are the credentials being issued — and the
  distinction between an issued token and a stored hash is worth pinning.

One test makes the rest meaningful: **the plugin is asserted to be running.** If
it were not, the schemas would be nearly empty and every secrets assertion would
pass because there was nothing to look at. A test that cannot fail is worse than
no test.

---

## The dependency

**`@nestjs/swagger@11.4.6`** — the official NestJS OpenAPI package: the
`DocumentBuilder`, the `SwaggerModule`, the `@Api*` decorators, and the CLI
plugin. It bundles `swagger-ui-dist`, so the UI is served from inside this
process and never from a CDN, which is also why the CSP needs no third-party
origin. Six packages added in total; its peers were all already installed.

```bash
npm install @nestjs/swagger
```

### One file is JavaScript, and it is the only one

`backend/swagger-plugin.transformer.js`.

Jest does not go through `nest build`, so without this the plugin never runs in a
test — and that divergence would have been worse than missing coverage: the specs
would generate a document whose schemas are nearly empty while the deployed one
is complete, and the secrets assertions would pass vacuously.

It has to be JavaScript. Jest `require`s a transformer directly, before any
TypeScript compilation exists to have transformed it. `ts-jest` *can* compile a
`.ts` transformer, but only by shelling out to `esbuild` — a native binary
dependency taken so that twenty lines of adapter could be written in another
language. This is tooling rather than application code, and the file says so at
the top.

It also holds the plugin options, so both Jest configurations share one copy.
They still have to match `nest-cli.json`, which is JSON and cannot require it —
so the e2e suite asserts the properties those options are responsible for
(descriptions taken from JSDoc, `.schema.ts` classes present), and a divergence
fails the suite rather than quietly producing two different documents.

---

## Database

**No change.** No model, no column, no migration. `npx prisma validate` passes
and `schema.prisma` is untouched. Documentation is a property of the code, not of
the company.

---

## API

**No route added, removed or renamed. No request or response body altered.**
Every `@Api*` decorator is descriptive metadata; not one of them runs at request
time.

Two routes appear that did not exist — `/api/docs` and `/api/docs-json` — and
neither is part of the versioned API.

**One status code changed**, and it is the whole of the behaviour change in this
feature:

| Route | Was | Is | Body |
| --- | --- | --- | --- |
| `POST /auth/activate` — unusable link | `401` | **`400`** | unchanged, `errorCode: ACCOUNT_TOKEN_INVALID` |
| `POST /auth/reset-password` — unusable link | `401` | **`400`** | unchanged, `errorCode: ACCOUNT_TOKEN_INVALID` |

The envelope, the message, the code and `params.purpose` are all identical — only
the status moves, to the one both routes had always documented. A client
branching on `errorCode` needs no change; one branching on `401` for these two
routes was branching on something the documentation never promised. See the note
under *Notes* for the reasoning.

The full unit suite passing unchanged after the entity conversion, and
`app.e2e-spec.ts` and `security-headers.e2e-spec.ts` passing unchanged
throughout, are what make the rest of that claim checkable rather than asserted.

---

## Backend

### Files Created

| File | What it is |
| --- | --- |
| `src/config/swagger.setup.ts` | `setupSwagger` and `buildDocument`: the `DocumentBuilder`, the bearer scheme, the tag registration, the scoped CSP mount, and the argument for why it runs after `configureApp` and outside it. |
| `src/config/swagger.config.ts` | `isSwaggerEnabled`, the two route constants, and the case for the production default. |
| `src/config/swagger-tags.ts` | The 21 tags with their descriptions, in reading order, referenced by symbol. |
| `src/config/swagger.config.spec.ts` | 21 tests: both defaults, both explicit states, every near-miss spelling, and the two route shapes. |
| `src/common/swagger/error-envelope.schema.ts` | `ErrorEnvelope`, `implements ApiErrorResponse`, and the note on which example wins. |
| `src/common/swagger/api-standard-errors.decorator.ts` | `ApiStandardErrors` / `ApiPublicRouteErrors`, the per-status descriptions and examples, and the public-route `401` override of both. |
| `src/common/swagger/error-envelope.examples.ts` | `ERROR_EXAMPLES` / `PUBLIC_ERROR_EXAMPLES`: one coherent rendered body per status, over the shared `$ref`. |
| `src/common/swagger/api-envelope-response.decorator.ts` | The five success-envelope decorators. |
| `src/modules/auth/entities/password-reset-request.entity.ts` | The one payload that was an inline object type. |
| `src/modules/notifications/entities/notification-bulk-result.entity.ts` | Moved out of `notification.service.ts`. |
| `src/modules/reporting/entities/report-definition.entity.ts` | Extracted from the inline type on `REPORT_DEFINITIONS`. |
| `swagger-plugin.transformer.js` | The Jest adapter for the CLI plugin, and the single copy of its options. |
| `test/openapi.e2e-spec.ts` | 82 tests over HTTP against **two** applications — documentation on and off. |

### Files Moved

| From | To |
| --- | --- |
| `src/modules/reporting/renderers/report-data-model.ts` | `src/modules/reporting/entities/report-data-model.entity.ts` |

Moved rather than renamed in place: it *is* the reporting module's response
entity, every other module keeps its response shapes in `entities/`, and only a
file with that suffix is seen by the schema generator. Fourteen imports updated,
all inside the module.

### Files Modified

| Area | Files | Change |
| --- | --- | --- |
| Bootstrap | `src/main.ts` | Calls `setupSwagger` after `configureApp`; logs the docs URL when mounted. |
| Build | `nest-cli.json`, `package.json`, `test/jest-e2e.json` | The CLI plugin, and the Jest transformer in both configurations. |
| Environment | `src/config/env.validation.ts`, `.env.example` | `SWAGGER_ENABLED`, and a correction to the `SECURITY_CSP_MODE` note that 037 left. |
| Security headers | `src/config/helmet.config.ts` (+ spec) | `buildDocsCspOptions`, built on the base directives; 9 new tests. |
| Controllers | 28 files | `@ApiTags`, `@ApiBearerAuth`, `@ApiOperation`, success and error responses. |
| Response entities | 32 files | Interfaces and aliases to classes. |
| Field decorators | 18 files | `@ApiProperty` with the real constraints. |
| Response DTOs | 3 files | `GreetingResponseDto`, `HealthResponseDto`, `EmailHealthResponseDto` to classes. |
| Shared | `src/common/interfaces/pagination.interface.ts` | `PaginationMeta` to a class. |
| **Behaviour** | `src/modules/auth/account-token.service.ts` | `invalidAccountToken()` returns a `BadRequestException` instead of an `UnauthorizedException`. The one behaviour change — see *Notes*. |
| Tests for it | `account-token.service.spec.ts`, `account-password.service.spec.ts`, `account-lifecycle.routing.spec.ts` | Seven HTTP assertions and three unit assertions moved from `401` to `400`. The `401`s on `change-password` — the guard's, and `ACCOUNT_CURRENT_PASSWORD_INCORRECT` — are unchanged, which is what keeps the change scoped. |
| Reporting | 14 files | Import path after the move. |

**No Prisma schema change. No migration. No change to any guard, pipe, filter,
interceptor or rule.** The single service change is the `400`/`401` correction
above, which alters a status code and nothing else.

---

## Frontend

None — this feature is backend-only, and there is no frontend yet. But it is the
first feature whose *whole output* is for the frontend, so what to do with it:

1. **`/api/docs-json` is the contract.** Generate a typed client from it rather
   than hand-writing request and response types. `openapi-typescript` or
   `orval` against that URL gives types that change when the API changes, which
   is the entire point.
2. **Every payload is `{ success, data }`.** Unwrap once, in the HTTP client, not
   at each call site. The one exception is a report export, which is a file.
3. **Branch on `errorCode`, never on `message`.** The message is English written
   for a log. Handle a *missing* code by falling back to `statusCode` — modules
   written before Feature 033 still answer without one.
4. **Read `/api/v1/work-schedule` once and keep `timezone`.** Every timestamp the
   API sends is UTC and every one should be rendered in the company zone. The
   document says so in its own description; `FEATURES/031` has the full argument.
5. **Authorize in the UI to explore.** Sign in through `POST /auth/login`, paste
   the `accessToken` into the Authorize dialog, and every "Try it out" carries it.
   The token is short-lived by design — expect to refresh.

---

## Testing

`npm test` → **135 suites, 2 874 tests, all passing** (up from 134 / 2 844 — 30
new unit tests).
`npm run test:e2e` → **3 suites, 172 tests, all passing** (up from 2 / 90 — 82
new).
`npx tsc --noEmit` clean. `npm run build` clean. `npx prisma validate` clean.
`npx prettier --check` clean.

**The regression that mattered most:** all 2 844 pre-existing unit tests passed
unchanged, and they were run immediately after the entity conversion — before any
controller was decorated — precisely so that "nothing downstream changed" was
measured rather than hoped for.

| Area | Covered |
| --- | --- |
| The endpoints | valid OpenAPI 3.0 JSON; HTML UI; the four UI assets served from this origin; reachable with no token; not enveloped |
| Paths | `/api/v1` on **every** path; 19 named routes across the larger modules; ≥120 operations; every operation has a summary and a success response |
| Tags | declared in order with descriptions; used ⊆ declared **and** declared ⊆ used; two controllers sharing one tag |
| Authentication | bearer scheme present; the exact list of 7 unsecured operations; `401` on every secured one; the public `401` described as a refused credential; `403` on the gated routes |
| Error envelope | named schema with exactly 7 properties; `errorCode`/`params` optional; **every** documented failure `$ref`s it; `429` and `500` on every route; `Retry-After` documented |
| Error examples | an example under **every** documented failure; **every** example's `statusCode` equals the response it sits under; only catalogued codes; no `params` without a code; `404` with neither; both guarded `401` codes on every protected route; **`AUTH_INACTIVE_USER` under `401` and under no other status**; the three credential-refused codes on the public `401`; all three kinds of `403` with `params` on the permission one only; `409` shown both coded and uncoded; `400` shown both from the pipe and from a domain rule, with the pipe's message as an array; `429`/`500` codes; **`401` on no public route but login and refresh**; no secret in any example |
| Success envelope | object, page, `data: null`, and the binary export with `Content-Disposition` |
| Schemas | the plugin is running; JSDoc becomes descriptions; hidden constraints published; enums resolved; required and nullable inferred |
| Secrets | five string scans of the whole document; no property named `*hash*`; `UserEntity` field-by-field; tokens present, hashes absent |
| CSP | inline styles on the docs page; **strict everywhere else**, including `/api/docs-json`; the rest of the header set intact |
| Docs disabled | UI, JSON and assets all `404` on the 033 envelope; the API unchanged; strict policy everywhere |
| Unit | 21 on the env gate including 13 near-miss spellings; 9 on the scoped CSP including "inherits every other directive" |

### The suite boots two applications

For the reason `security-headers.e2e-spec.ts` does: a setting with two states
has to be proved in both. Documentation that is merely present in the one
configuration a test happens to boot proves nothing about the one a production
deployment runs.

---

## Notes

### Nothing to run

No migration, no new required variable. The defaults apply and the application
starts as it did, now logging a second line:

```
[Bootstrap] Backend is listening on http://localhost:3000/api/v1
[Bootstrap] API documentation on http://localhost:3000/api/docs
```

The only manual step this feature introduced was installing the dependency.

### The one thing to decide before deploying to production

Nothing — the default is correct. Set `SWAGGER_ENABLED=true` only if that
deployment should publish its API surface, and read the exposure section first.

### The one mismatch where the *code* was wrong: `ACCOUNT_TOKEN_INVALID`

The sweep that corrected `AUTH_INACTIVE_USER` turned up a second discrepancy,
and this one resolved in the opposite direction: the documentation was right and
the implementation had drifted.

`invalidAccountToken()` in `account-token.service.ts` returned an
**`UnauthorizedException`** — a `401` — behind `POST /auth/activate` and
`POST /auth/reset-password`. But both routes are declared
`@ApiPublicRouteErrors(HttpStatus.BAD_REQUEST)`, both `@ApiOperation`
descriptions say "an unusable link is the same single `400
ACCOUNT_TOKEN_INVALID`", and the e2e suite asserts that login and refresh are the
only public routes documenting a `401`. Three independent statements of intent,
all saying `400`, and one function saying `401`.

**The intent is the correct reading, so the code changed.** The token on those
routes is a body parameter proving somebody received an email — not a login
credential. Both routes are `@Public()` precisely because no authentication is
possible: the person has no password yet, or has forgotten it. Answering `401`
claimed authentication had failed on two routes whose whole purpose is that there
is nothing to authenticate, and it pointed a client at the one recovery that
cannot work — refresh, then show the login screen, which is the screen they were
already unable to use. A malformed, expired or spent value in a request body is
an input error, and `400` is what every other rejected body field answers.

```ts
- export function invalidAccountToken(type): UnauthorizedException {
-   return new UnauthorizedException(
+ export function invalidAccountToken(type): BadRequestException {
+   return new BadRequestException(
      codedError(ERROR_CODES.ACCOUNT_TOKEN_INVALID, INVALID_ACCOUNT_TOKEN_MESSAGE, {
        purpose: type,
      }),
    );
```

One function, four throw sites — `AccountTokenService.resolve`, `.consume`, and
the two post-transaction state checks in `AccountPasswordService` — all reached
from exactly two entry points, `activate()` and `resetPassword()`. There is no
flow where this code should stay a `401`, so there is no split to document.

**`errorCode` is unchanged**, which is what makes this a small change rather than
a breaking one: a frontend keying a translation on `ACCOUNT_TOKEN_INVALID` is
unaffected. Only the status a client branches on before reading it moves.

The payoff is a property worth having: **`401` on a public route now means
exactly one thing** — the credential in the body was refused — on exactly the two
routes where a body carries one. `openapi.e2e-spec.ts` asserts it directly.

This is the one **behaviour change** in Feature 038. It is recorded here rather
than given its own number because it is the correction of a drift this feature's
own documentation sweep uncovered, and because the statement it restores is one
038 wrote.

### `{@link X}` renders literally

The plugin lifts JSDoc verbatim, so a `{@link SomeType}` in an existing comment
appears as those characters in the rendered description. It is cosmetic, it
affects a handful of the ~600 descriptions, and rewriting fifty files of prose
was not worth it inside a documentation feature. Recorded under *Future
Improvements*.

---

## Future Improvements

1. **Generate the frontend's API client in CI.** The document exists; the
   remaining step is a pipeline job that regenerates the typed client and fails
   the build when the committed one differs. That turns "the docs cannot drift
   from the backend" into "the frontend cannot drift from the docs".
2. **Strip `{@link …}` from lifted JSDoc.** A small transform at document-build
   time, or a pass over the comments. Cosmetic, and see the note above.
3. **Examples on *success* responses.** The failure side is done — every error
   status renders a coherent body of its own (above). `@ApiProperty({ example })`
   covers the request side well. What is left is a worked success example per
   resource — one realistic department, one realistic timesheet — which would
   make the page readable without a token, and is best generated from the seed
   data rather than typed.
4. ~~**Settle `ACCOUNT_TOKEN_INVALID`'s status.**~~ **Resolved.** The code was
   corrected from `401` to `400` to match the documented intent, and the
   semantic behind it: an invalid activation or reset token is an input error,
   not an authentication failure. See the note above. What remains worth doing is
   the general form of the check — **a test asserting every code's status against
   its throw site**, which is what would have caught both this and
   `AUTH_INACTIVE_USER` the day they drifted rather than two features later.
5. **Document the WebSocket.** OpenAPI does not describe socket events, and the
   notification delivery engine has several. AsyncAPI is the specification for
   it, and it deserves the same treatment: generated, not written.
6. **Serve a second document per audience.** `SwaggerModule` supports multiple
   documents from one application, so an "administration" view and an "employee"
   view could be filtered from the same metadata. Worth it only once somebody is
   asking for it — 21 tags is currently a usable table of contents.
7. **Publish the document as a build artifact.** A committed or released
   `openapi.json` would let a consumer diff two versions of the API and see
   exactly what changed between releases, which is a stronger contract than a
   URL that only ever shows `main`.
