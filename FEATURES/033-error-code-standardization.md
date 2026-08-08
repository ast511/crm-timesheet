# Error Code Standardization

## Goal

Give every error response a **stable, machine-readable code**, so a frontend can
say what went wrong in Romanian — or in any language added later — by translating
the code, and the backend never emits a localized sentence.

The split is the whole feature:

> **The backend says WHAT happened. The frontend decides HOW to say it.**

The English `message` stays exactly where it is and keeps meaning exactly what it
meant: developer-facing text for logs and stack traces, free to be reworded at
any time. What it stops being is the thing a user interface matches on — because
translating prose means matching on sentences, and a sentence is not a contract.

This is cross-cutting plumbing, not a domain feature. It extends the envelope,
gives exceptions a way to carry a code, defines the catalog, and proves the whole
thing on the auth module.

## Requirements

- Two new **optional** envelope fields: `errorCode` and `params`.
- A way for an exception to carry a code, coexisting with the thirty modules that
  throw plain ones.
- One catalog, referenced by symbol, never by loose string.
- The filter decides the code in one place.
- The auth module adopts it, without changing a single one of its behaviours.
- Validation failures get one code while keeping every per-field message.
- No i18n in the backend. No translations, no locale, no `Accept-Language`.

---

## A note on the feature number

Feature 032 was written expecting **033 to be Authorization Enforcement**, and
said so in its own document and in ten source comments. That number is now this
feature.

Rather than renumber a feature that has not been written — 034 was already spoken
for as account lifecycle — the source comments now refer to it **by name**:
"the authorization enforcement feature". A name survives renumbering; a number
does not. `FEATURES/032-authentication.md` is left as written, per the rule that
a feature document is never overwritten, and this paragraph is the record that
its "Feature 033" means the authorization work rather than this.

---

## The envelope

`ApiErrorResponse` gains two fields. Nothing else about it changes.

```jsonc
{
  "success": false,
  "statusCode": 401,
  "message": "Invalid email or password",   // English, for developers
  "errorCode": "AUTH_INVALID_CREDENTIALS",  // NEW — stable, for translation
  "params": { "month": 9, "year": 2026 },   // NEW — optional, for interpolation
  "path": "/api/v1/auth/login",
  "timestamp": "2026-08-09T07:14:22.031Z"
}
```

**Both are optional, and that is the entire migration strategy.** An exception
carrying no code produces byte-for-byte the envelope it produced before this
feature — with the key **absent**, not present-and-`undefined`. A client must
therefore handle its absence by falling back to `statusCode` + `message`, and
that fallback is what lets the remaining modules be migrated one at a time
instead of on a flag day.

The filter builds the two keys with a spread rather than assigning `undefined`:

```ts
const body: ApiErrorResponse = {
  success: false,
  statusCode,
  message,
  ...describeError(exception, isHttpException, statusCode, message),
  path: request.url,
  timestamp: toIsoTimestamp(),
};
```

`JSON.stringify` would drop an `undefined` value anyway, but the object the
filter builds is also what its spec asserts against with `toEqual`, and "the key
is not there" is the contract clients were given.

---

## How an exception carries a code — Option B, with a typed helper

A code travels **inside the payload of an ordinary Nest exception**:

```ts
throw new UnauthorizedException(
  codedError(ERROR_CODES.AUTH_INACTIVE_USER, INVALID_ACCESS_TOKEN_MESSAGE),
);
```

`codedError(code, message, params?)` builds the payload; `readCodedError(exception)`
reads it back. Both live in `src/common/errors/coded-error.ts`, deliberately in
one file: they are two halves of one format, and a writer and a reader in
different files is how a format drifts.

### Why not Option A (an `AppException` class)

The prompt recommended a class. It was rejected for three reasons, all about the
thirty modules that already exist:

1. **`instanceof` keeps working.** A great deal of this suite asserts
   `rejects.toThrow(NotFoundException)` and `rejects.toThrow(ConflictException)`.
   A new class that is an `HttpException` but not an `UnauthorizedException`
   would break every one of those the day its module gains a code — a migration
   cost paid in test churn for no behavioural gain. As it is, **2 356 existing
   tests passed without a single edit.**
2. **The status stays where it already is.** `new ConflictException(...)` *is* a
   409. A factory taking `{ status }` makes the status a parameter somebody can
   get wrong, and this codebase is careful about which code each refusal answers
   with. Adding a code should not reopen that decision.
3. **Uncoded exceptions cost nothing.** There is no base class to adopt and no
   sweep to schedule.

The trade-off, accepted on purpose: nothing *forces* a throw site to supply a
code. A gradual migration is the plan, not a compromise. What **is** enforced is
that a code, when given, comes from the catalog — `codedError` takes `ErrorCode`,
so a literal is a compile error.

### Where the code is decided — one ladder, one place

`describeError` in the filter, in precedence order:

| # | Rule | Result |
| --- | --- | --- |
| 1 | The exception carried a code | that code (+ `params`) |
| 2 | Status ≥ 500 | `INTERNAL_ERROR` |
| 3 | Status 400 **and** `message` is an array | `VALIDATION_ERROR` |
| 4 | otherwise | no `errorCode` key |

Rule 1 outranks rules 2 and 3, including for a deliberately coded 500 — a throw
site knows more about itself than the filter does.

Rule 4 is the one everything rests on. Inventing a code from the status —
`NOT_FOUND` for every 404 — was considered and rejected: it would tell a frontend
nothing `statusCode` does not already say, while *looking* like a real code that
could be translated into something specific.

`params` is validated at the boundary rather than trusted. Anything that is not a
flat record of scalars — an array, a nested object, a `null` — is **dropped**, not
thrown on: this runs while an error is already being rendered, and a filter that
threw would turn a `404` into an unhandled `500`.

---

## The catalog

`src/common/constants/error-codes.constants.ts` — one `ERROR_CODES` object and an
`ErrorCode` type derived from it, so the two cannot drift.

**Conventions**

- `SCREAMING_SNAKE_CASE`, namespaced by area (`AUTH_*`, and `TIMESHEET_*`,
  `LEAVE_*` … as modules migrate).
- Each code documents what it means and what `params` accompany it — a
  translation interpolating `{{month}}` needs to know `month` will be there.
- Referenced by symbol. `ErrorCode` is what enforces it, and a spec pins the
  catalog's shape (every value equals its key; no duplicates; casing).

**Stability — the reason this file exists**

> **Renaming a code is a breaking change. Rewording the message beside it is
> free.**

A frontend has a translation keyed on the code, so a rename is a string that
silently stops resolving and a screen that shows a key instead of a sentence.
Adding a code is not breaking, as long as the frontend falls back sensibly for
one it does not know. Removing one is.

---

## Auth adoption

The first and only adopter. Every throw site keeps its status, its English
message and its behaviour; each gains a code.

| Failure | Status | Code |
| --- | --- | --- |
| Login: unknown address | 401 | `AUTH_INVALID_CREDENTIALS` |
| Login: wrong password | 401 | `AUTH_INVALID_CREDENTIALS` |
| Login: deactivated account | 401 | `AUTH_INVALID_CREDENTIALS` |
| Refresh/request by a deactivated account | 401 | `AUTH_INACTIVE_USER` |
| Refresh token malformed / unsigned / expired / revoked / unknown / wrong account / account deleted | 401 | `AUTH_REFRESH_TOKEN_INVALID` |
| Refresh token already rotated | 401 | `AUTH_REFRESH_TOKEN_REUSED` |
| No / malformed / expired / forged access token | 401 | `AUTH_UNAUTHENTICATED` |
| Authenticated, but the account has no employment record | 403 | `AUTH_NO_EMPLOYEE_RECORD` |

### The no-enumeration rule, restated as a code

**All three login failures share one code.** Feature 032 answers them with one
status, one message and equalised timing, precisely so that
`POST /auth/login` cannot be used to ask "does this person have an account here"
— which, in a company's internal system, is also "does this person work here".

A distinct code for a deactivated account at login would have undone that from
the one place nobody would think to look: it would confirm both that the address
exists *and* that the password was right. The catalog says so on the code itself,
the branch in `AuthService.login` says so in a comment, and two tests assert it —
including one that checks the set of codes across the three causes has size 1.

### Where `AUTH_INACTIVE_USER` *is* used, and why that is safe

On **refresh** and on **any authenticated request** — never on login.

The distinction is the caller's proof. `findActiveUser` runs only for somebody
who has already presented a signed token naming that account: they either own it
or already stole a credential for it, and neither learns anything new from being
told the account is deactivated. What it buys is real: a frontend can say
*"Contul dumneavoastră a fost dezactivat"* instead of sending somebody into a
login loop that will also fail.

This required splitting one condition in `findActiveUser`:

```ts
if (user === null)   throw new UnauthorizedException(codedError(errorCode, message));
if (!user.isActive)  throw new UnauthorizedException(codedError(AUTH_INACTIVE_USER, message));
```

**The status and the message are identical on both branches.** Only the code
differs, so the observable behaviour Feature 032 documented is untouched and the
change is genuinely additive. It is the one place in the module where the code is
more specific than the sentence beside it, and the method's doc comment explains
why.

---

## Validation errors

A `ValidationPipe` failure gets **one** code — `VALIDATION_ERROR` — while its
per-field `message` array survives untouched:

```jsonc
{
  "success": false,
  "statusCode": 400,
  "message": ["email must be an email", "password should not be empty"],
  "errorCode": "VALIDATION_ERROR",
  "path": "/api/v1/auth/login",
  "timestamp": "…"
}
```

A form still puts each sentence under its input; the code is what a heading like
*"Verificați câmpurile marcate"* is keyed on.

**Per-constraint codes are deliberately not in this feature.** There are hundreds
of constraints, they are framework-generated, and coding each one is a large
piece of work with a small payoff compared to everything else on the list. It is
recorded under Future Improvements.

### Detection, and a consequence worth stating

The code is inferred from the shape — a 400 whose `message` is an array — rather
than injected by a custom `exceptionFactory`. The alternative would have had to
be wired into `configureApp`, and roughly ten routing specs construct their own
`ValidationPipe` by hand; the code would have been present in production and
absent in every one of those specs, which is exactly the drift `configureApp`
exists to prevent.

The consequence: **a domain error deliberately shaped as a field-error array is
also reported as `VALIDATION_ERROR`.** About forty throw sites across
leave-requests, employees and notification-management use
`throw new BadRequestException([...])`, and their own comments say why — "the
same shape the `ValidationPipe` produces, so a client handles it with the code it
already has for field errors". Reporting them as `VALIDATION_ERROR` is not
over-reach; it is the conclusion those sites already drew, now stated in the
envelope. Any of them that wants a specific code simply supplies one, and rule 1
takes it.

---

## The gradual migration approach

**Stated explicitly, because it is a decision rather than an omission.**

Only the foundation and the auth module have codes. Every other module keeps
throwing exactly what it throws today and keeps producing exactly the envelope it
produced today, minus an `errorCode` key.

They gain codes **when they are touched for another reason**, or in a later
dedicated pass, module by module. A sweep across thirty tested modules in this
feature would have been a large diff over code whose error behaviour is
extensively asserted, for a benefit that arrives incrementally anyway — the
frontend translates what it has and falls back for the rest.

The order that will matter most, when it happens: timesheets and leave requests,
because those are where an employee meets an error message most often.

---

## Frontend contract

### The initial code list

| Code | HTTP | Meaning | Params |
| --- | --- | --- | --- |
| `INTERNAL_ERROR` | 5xx | Something unexpected failed. The message is a fixed sentence, never the real reason. | — |
| `VALIDATION_ERROR` | 400 | The request was rejected field by field. **Read `message` — it is an array of per-field sentences.** | — |
| `AUTH_INVALID_CREDENTIALS` | 401 | Login refused. Unknown address, wrong password, or deactivated account — deliberately indistinguishable. | — |
| `AUTH_INACTIVE_USER` | 401 | The account behind a valid token is deactivated. Do **not** retry the refresh; send the person to support. | — |
| `AUTH_REFRESH_TOKEN_INVALID` | 401 | The refresh token cannot be exchanged. Discard the session, show the login screen. | — |
| `AUTH_REFRESH_TOKEN_REUSED` | 401 | A rotated refresh token was presented again; every session was revoked. Show a security notice, then the login screen. | — |
| `AUTH_UNAUTHENTICATED` | 401 | No usable access token. Attempt a refresh; on failure, log in. | — |
| `AUTH_NO_EMPLOYEE_RECORD` | 403 | Authenticated, but this route is about the caller's own employment record and their account has none. | — |

None of the initial codes carries params. `params` exists for the codes that
will — a locked month, an exceeded balance — and its contract is defined now so
the first one to need it does not have to change the envelope.

### How to consume it

```ts
// One place, in the API client.
function errorKeyOf(body: ApiErrorResponse): string {
  return body.errorCode ?? `HTTP_${body.statusCode}`;   // the fallback is the migration
}
```

Recommended: **react-i18next**, with the codes as translation keys and `params`
as interpolation values. Default to Romanian, fall back to English.

```jsonc
// ro/errors.json
{
  "AUTH_INVALID_CREDENTIALS": "Email sau parolă incorectă",
  "AUTH_INACTIVE_USER": "Contul dumneavoastră a fost dezactivat. Contactați HR.",
  "AUTH_REFRESH_TOKEN_INVALID": "Sesiunea a expirat. Autentificați-vă din nou.",
  "AUTH_REFRESH_TOKEN_REUSED": "Sesiunea a fost încheiată din motive de securitate. Autentificați-vă din nou.",
  "AUTH_UNAUTHENTICATED": "Sesiunea a expirat. Autentificați-vă din nou.",
  "AUTH_NO_EMPLOYEE_RECORD": "Contul dumneavoastră nu are o fișă de angajat.",
  "VALIDATION_ERROR": "Verificați câmpurile marcate",
  "INTERNAL_ERROR": "A apărut o eroare. Încercați din nou.",
  "HTTP_404": "Resursa nu a fost găsită",
  "HTTP_409": "Operațiunea intră în conflict cu datele existente"
}
```

```tsx
const { t } = useTranslation('errors');

// `params` interpolates; absent params are simply absent.
toast.error(t(errorKeyOf(body), body.params));
```

Three notes for whoever builds it:

1. **Never show `message` to a user.** It is English and it is written for logs.
   The one exception is `VALIDATION_ERROR`, where the array is per-field detail
   worth rendering beside the inputs — and even then, the heading comes from the
   code.
2. **Handle an unknown code**, because codes will be added before translations
   are. Fall back to the `HTTP_<status>` key, then to a generic sentence.
3. **`AUTH_INACTIVE_USER` is not a session problem.** Refreshing will not fix it,
   and a client that lumps it in with the other 401s will loop.

---

## Backend

### Files Created

| File | What it is |
| --- | --- |
| `src/common/constants/error-codes.constants.ts` | `ERROR_CODES`, the `ErrorCode` type derived from it, and `ErrorParams`. One documented comment per code. |
| `src/common/errors/coded-error.ts` | `codedError()` builds the payload, `readCodedError()` reads it back, `CodedErrorPayload` types it. The whole mechanism, and the argument against a class. |
| `src/common/errors/coded-error.spec.ts` | 17 tests: the builder, the reader against real Nest exceptions, params rejection, and the catalog's shape. |

### Files Modified

| File | Change |
| --- | --- |
| `src/common/interfaces/api-response.interface.ts` | `errorCode?` and `params?` on `ApiErrorResponse`, plus the note that `message` is no longer what a UI translates. |
| `src/common/filters/all-exceptions.filter.ts` | `describeError()` — the four-rule ladder — spread into the envelope. `extractMessage` untouched. |
| `src/common/filters/all-exceptions.filter.spec.ts` | 15 new tests for the ladder; the seven original ones unchanged and passing. |
| `src/common/decorators/current-user.decorator.ts` | `AUTH_UNAUTHENTICATED` on the "no authenticated caller" refusal. |
| `src/common/decorators/current-employee-id.decorator.ts` | `AUTH_NO_EMPLOYEE_RECORD`. |
| `src/modules/auth/auth.service.ts` | Codes on every throw. `findActiveUser` gained an `errorCode` parameter and split its condition so a deactivated account is distinguishable **by code only**. |
| `src/modules/auth/token.service.ts` | `verify` gained an `errorCode` parameter; access → `AUTH_UNAUTHENTICATED`, refresh → `AUTH_REFRESH_TOKEN_INVALID`. |
| `src/modules/auth/jwt-auth.guard.ts` | `AUTH_UNAUTHENTICATED` on both header-parsing refusals. |
| `src/modules/auth/auth.service.spec.ts` | 15 new tests under `error codes`, including the two that pin the no-enumeration rule. |
| `src/modules/auth/routing.spec.ts` | 6 new tests asserting codes on the envelope end to end; the stub `AuthService` now refuses with a code, as the real one does. |
| `src/modules/auth/testing/authentication.testing.ts` | The stub guard's refusal carries `AUTH_UNAUTHENTICATED`, so every module's routing spec sees the real shape. |
| 8 files across `app.module`, `auth`, `leave-requests`, `permission-management` | Comments that said "Feature 033" meaning authorization enforcement now name the feature instead. No code changed. |

**No Prisma schema change. No migration. No new dependency.**

---

## Testing

`npm test` → **119 suites, 2 410 tests, all passing** (up from 2 356 — 54 new).
`npx tsc --noEmit` clean, `npm run build` clean.

**The regression that mattered most:** all 2 356 pre-existing tests passed
without a single edit, before any new test was written. That is the evidence that
the envelope change is additive and that uncoded modules are unaffected.

| Area | Covered |
| --- | --- |
| Envelope | a carried code lands on the envelope with its params; params omitted when absent; **the key is absent, not `undefined`, for an uncoded exception**; a non-HTTP error is a 500 with `INTERNAL_ERROR` and leaks nothing; a deliberate 500 too |
| Precedence | an explicit code beats both the 500 rule and the validation rule; a single-message 400 stays uncoded |
| Validation | `VALIDATION_ERROR` plus the full per-field array; a domain error shaped as an array reported the same way |
| Params | arrays, nested objects, `null` and non-objects dropped while the code survives; a blank code ignored |
| Mechanism | the reader finds nothing on a plain-string exception and on Nest's default payload; the exception's own `.message` and `.getStatus()` are untouched by a code |
| Catalog | every value equals its key; `SCREAMING_SNAKE_CASE`; no duplicates |
| Auth — no enumeration | unknown address, wrong password and deactivated account all answer `AUTH_INVALID_CREDENTIALS`; a separate test asserts the set of codes across the three has size 1 |
| Auth — inactive | refresh and authenticate by a deactivated account → `AUTH_INACTIVE_USER` |
| Auth — refresh | five arrangements (no row, wrong account, revoked, expired, account deleted) plus a malformed token → `AUTH_REFRESH_TOKEN_INVALID`; a spent token → `AUTH_REFRESH_TOKEN_REUSED` |
| Auth — end to end | `AUTH_UNAUTHENTICATED` with and without a header; `AUTH_NO_EMPLOYEE_RECORD` at 403; `VALIDATION_ERROR` with its array; no `params` key; **an uncoded 404 still produces a valid envelope with no code** |

---

## Notes

Nothing to run. No migration, no dependency, no environment variable.

The one thing to be aware of while reading auth code: `AuthService.findActiveUser`
and `TokenService.verify` now take an `errorCode` alongside the `message` they
already took. The pair travels together because the two are chosen together at
each call site — an access-token path wants `AUTH_UNAUTHENTICATED` with the
access-token message, a refresh path wants `AUTH_REFRESH_TOKEN_INVALID` with the
refresh one.

---

## Future Improvements

1. **Migrate the remaining modules**, module by module, as each is touched.
   Timesheets and leave requests first: they are where an employee meets an error
   most often, and their errors are the most specific (a locked month, an
   insufficient balance) — which is also where `params` will earn its place.
2. **Per-constraint validation codes.** `VALIDATION_ERROR` plus an array of
   English sentences is a real gap: the field-level detail a user sees is still
   English. Closing it means a `ValidationPipe` `exceptionFactory` mapping each
   `ValidationError`'s constraint keys to codes, and per-field payloads of
   `{ field, code, params }`. It is a feature in its own right, and it should be
   done *after* the module migration above, so it is designed against real usage
   rather than guessed at.
3. **A published code list for the frontend.** The table above is the contract
   today, maintained by hand. Once the catalog is larger it is worth generating —
   a small script emitting JSON from `ERROR_CODES`, or the codes appearing in the
   Swagger documentation already planned for the end of backend work — so the
   frontend's translation files can be checked against it in CI rather than
   drifting quietly.
4. **A lint rule forbidding a bare string where an `ErrorCode` is expected.** The
   type already prevents it at `codedError`; the gap is somebody hand-building
   `{ errorCode: 'TYPO' }` as an exception payload, which the reader would happily
   pass through.
