# Feature 009 — Users Module

**Status:** Completed
**Date:** 2026-08-03

## Goal

A complete CRUD resource at `/api/v1/users`, built on the infrastructure from
[Feature 006](006-shared-backend-infrastructure.md) and following the
architecture [Feature 007](007-departments-module.md) established and
[Feature 008](008-positions-module.md) confirmed.

This is an **administration** module. It manages accounts; it does not
authenticate them. Login, JWT, refresh tokens, guards, role decorators, password
reset and email verification are all out of scope and belong to later features.

Two things make it more than a third copy of the same CRUD shape, and they are
what most of this document is about:

1. It handles a **secret**. A password arrives in plain text, is hashed, and
   must never come back out.
2. It is the first module whose rows are **referenced by** another table
   (`Employee.userId`) rather than only referencing one.

## Requirements

- Full CRUD over the existing `User` model, no schema change, no migration.
- List endpoint with pagination, case-insensitive search, and filtering by
  `role` and `isActive`.
- `email` required and unique; `username` optional and unique; `password`
  at least 8 characters.
- `passwordHash` never accepted from a client and never returned in a response.
- Passwords hashed with bcrypt, inside the service.
- Partial updates that never blank a field the client did not mention.
- Hard delete, refused with `409` while an `Employee` is linked.
- Every request validated by `class-validator` / `class-transformer`.
- Controllers thin; all rules in the service; no response formatting in either.
- Reuse `SortQueryDto`, `PaginationQueryDto`, `toSkipTake`,
  `buildPaginatedResult`, `AllExceptionsFilter`, `ResponseInterceptor`,
  `toIsoTimestamp`, `@Trim()`, `SortOrder`, and the existing `hashPassword`.

## Backend

### Structure added

```text
backend/src/common/decorators/
├── to-boolean.decorator.ts           # NEW — @ToBoolean() for query strings
└── to-boolean.decorator.spec.ts

backend/src/modules/users/
├── user.module.ts
├── user.controller.ts
├── user.controller.spec.ts
├── user.service.ts
├── user.service.spec.ts
├── user.constants.ts                 # lengths, sortable columns, default sort
├── dto/
│   ├── create-user.dto.ts
│   ├── create-user.dto.spec.ts
│   ├── update-user.dto.ts
│   ├── update-user.dto.spec.ts
│   ├── user-query.dto.ts
│   ├── user-query.dto.spec.ts
│   └── user-field.decorators.ts
└── entities/
    └── user.entity.ts
```

The layout Feature 007 introduced, unchanged: the folder is `users/` (the
resource, plural) while the files inside are `user.*` (the thing, singular).

### File by file

| File | What it is |
| --- | --- |
| `user.module.ts` | Wires `UserController` and `UserService`; exports the service. Does not import `PrismaModule`, which is `@Global`. |
| `user.controller.ts` | The five routes, one line each. No guards — see below. |
| `user.service.ts` | Every rule: pagination, filtering, hashing, duplicate protection, delete protection. |
| `user.constants.ts` | `USER_EMAIL_MAX_LENGTH` (254), `USER_USERNAME_MAX_LENGTH` (50), `USER_PASSWORD_MIN_LENGTH` (8), `USER_SEARCH_MAX_LENGTH` (100), `USER_SORT_FIELDS`, `DEFAULT_USER_SORT_FIELD`. |
| `dto/create-user.dto.ts` | `POST` body: `email`, `password`, `role` required; `username`, `isActive` optional. |
| `dto/update-user.dto.ts` | `PATCH` body: `username`, `password`, `role`, `isActive`, all optional. **No `email`.** |
| `dto/user-query.dto.ts` | `GET` query: extends `SortQueryDto`, adds `search`, `role`, `isActive`, `sortBy`. |
| `dto/user-field.decorators.ts` | Per-field constraints shared by the create and update DTOs, plus the private `MaxByteLength` validator. |
| `entities/user.entity.ts` | `UserEntity`, `USER_PUBLIC_SELECT`, `PublicUserRow` and the row → resource mapper. The response contract, with `passwordHash` excluded. |
| `common/decorators/to-boolean.decorator.ts` | `@ToBoolean()` — the one thing that moved into `src/common`. |

### The one extraction: `@ToBoolean()`

Query strings are text, so `?isActive=true` arrives as the string `"true"` and
an `@IsBoolean()` on its own would reject every request. `@ToBoolean()` is the
query-string counterpart of the `@Type(() => Number)` that `PaginationQueryDto`
puts on `page` and `limit`, and it sits beside `@Trim()` for the same reason: it
is a transport concern with nothing resource-specific in it.

It converts **only** the two exact spellings. `"yes"`, `"1"` and `"TRUE"` pass
through untouched so the `@IsBoolean()` after it rejects them with a message
naming the field, rather than being silently coerced into a filter the caller
did not ask for.

No `FilterQueryDto` base class was created, though Feature 008 listed one as a
candidate. It would carry a single field that only one of the three resources
currently exposes, and adding `?isActive=` to departments and positions to
justify it would be inventing scope. The decorator — the part that is genuinely
shared — is shared; the field stays where it is used.

### Revisiting the shared/local line, as Feature 008 asked

Feature 008 deferred a decision to "the third module, with three examples". This
is that module, and the evidence came back mostly *against* extraction:

| Candidate | What the third module showed |
| --- | --- |
| `IsResourceCode()` / field decorators | Users has no `code`, no `name` and no `description`. Its fields are an email, a nullable handle, a secret and an enum, each with rules the other two modules have no use for. A shared field-decorator library would have been three unrelated sets of constraints in one file. **Decision: keep local, and stop revisiting it.** |
| `buildSearchFilter` / `buildOrderBy` | Now written three times, but the users version is not the same function: it combines a search with two filters under `AND`, while the other two are a bare `OR`. A generic version needs `Prisma.<Model>WhereInput` threaded through as a type parameter at every call site, trading compile-time checking of the sort key against the model for four fewer lines. **Decision: keep local.** |
| A base CRUD service | This module diverges most: `create` hashes, `update` re-hashes conditionally, `remove` checks a one-to-one relation rather than counting a to-many. Almost nothing would be left in the base but control flow. **Decision: no.** |

Recorded so the question is settled rather than deferred a third time.

### Password hashing

`hashPassword` from `common/password/password.hasher` — bcrypt via `bcryptjs`,
cost factor 12 — already existed for the seed, so **no package was installed**
and no second hashing strategy was introduced. The module that chooses the
algorithm is the module that owns its cost factor and its limits.

- The plain-text password exists only as `CreateUserDto.password` /
  `UpdateUserDto.password` and as the argument to `hashPassword`. It is never
  logged, never persisted and never returned.
- On `create`, hashing happens **after** the uniqueness check. Bcrypt at cost 12
  costs a few hundred milliseconds of main-thread time, and there is no reason
  to spend it on a request that ends in a `409`.
- On `update`, `passwordHash` is `undefined` unless a password was supplied, so
  Prisma omits it from the `UPDATE` and an unrelated patch never touches the
  hash. When one *is* supplied, a fresh salt is generated — bcrypt salts every
  call — so the same password re-set produces a different hash.
- `password` is deliberately **not trimmed**. Leading and trailing spaces are
  legitimate characters in a passphrase, and stripping them would mean the
  password accepted at creation is not the password the user typed.

`MAX_PASSWORD_BYTES` gained an `export` in `password.hasher.ts`. It was already
enforced there — `hashPassword` throws above 72 bytes, because bcrypt silently
truncates — but a `throw` inside a service is a `500`. Exporting the number lets
the DTO reject an over-long password with a `400` naming the field, and both
checks read the same constant.

That validation is in **bytes, not characters**, via a small `MaxByteLength`
validator built on class-validator's `registerDecorator`. `@MaxLength(72)` would
count UTF-16 code units, and 24 emoji are 24 characters but 96 bytes — under any
plausible character limit, over bcrypt's. A spec covers exactly that case.

### Why `passwordHash` is never returned

A bcrypt hash is not a password, but publishing one hands an attacker an offline
oracle: they can test guesses at their own pace, on their own hardware, with no
rate limit, no lockout and no log entry — and a hit yields the plain-text
password, which people reuse across services. Nothing a client renders needs the
hash, so nothing sends it.

The exclusion is enforced **twice**, and both are compile-time enforced:

```ts
export const USER_PUBLIC_SELECT = {
  id: true, email: true, username: true,
  role: true, isActive: true, createdAt: true, updatedAt: true,
} as const satisfies Prisma.UserSelect;

export type PublicUserRow = Omit<UserModel, 'passwordHash'>;
export function toUserEntity(user: PublicUserRow): UserEntity { … }
```

1. Every Prisma call in the service passes `USER_PUBLIC_SELECT`, so the hash is
   never transferred out of PostgreSQL — not on read, not on `create`, not on
   `update`.
2. `toUserEntity` accepts only `PublicUserRow`, a type with no `passwordHash`
   for a mapper to copy.

Forgetting either is a build failure rather than a leak: a `select` left off
produces a full `UserModel`, which the mapper will not accept. `satisfies
Prisma.UserSelect` checks the keys against the model without widening the
constant, so a column renamed in `schema.prisma` breaks the build here.

`passwordHash` is also absent from `USER_SORT_FIELDS` — ordering by it would
leak the relative order of hashes — and from both DTOs, so
`forbidNonWhitelisted` turns a client that tries to supply one into a `400`
rather than silently dropping it.

### Duplicate protection

`assertEmailAndUsernameAreFree` is the one query both `create` and `update` use:

- it builds an `OR` of only the fields actually submitted — a patch touching
  neither `email` nor `username` skips the query entirely;
- `excludeId` adds `NOT: { id }` on update, so an account is never a conflict
  with itself;
- comparison is case-insensitive (`mode: 'insensitive'`), because `AnaP` and
  `anap` are the same handle to a human;
- both conflicts are reported together, as a `string[]` — the same shape the
  `ValidationPipe` produces — so a form can mark both offending inputs instead
  of revealing the second problem only after the first is fixed.

**`username: null` is skipped rather than searched for.** The column is
nullable, PostgreSQL's unique index permits any number of `NULL`s, and querying
`equals: null` would match every account without a username and report a
conflict that does not exist. This is why `IsUserUsername()` collapses a blank
string to `null`: `""` is *not* `NULL` to a unique index, so storing it would
let exactly one account hold the empty username and reject every subsequent
blank submission with a `409` nobody could explain.

On update the check covers `username` only, because `email` is not patchable.

Known limitation, carried over from Features 007 and 008: the PostgreSQL unique
index is case-sensitive, so it backs this check for the *exact-case* race
between the read and the write, but two concurrent requests submitting `AnaP`
and `anap` could both pass. Closing that needs a `citext` column or a functional
unique index — a schema change, which this feature is not allowed to make. For
`email` the gap is already closed in practice, since the DTO lower-cases before
the check.

### Delete protection

`DELETE` never cascades. Existence and the employee link are read in one query:

```ts
select: { employee: { select: { id: true } } }
```

so the common case is a single round trip, and a `404` and a `409` cannot be
decided from two different snapshots. A linked employee produces:

```text
User usr-1 cannot be deleted while employee emp-1 is linked to it
```

`Employee.userId` is a **required** relation, so cascading would mean deleting
the person's entire employment record — hire date, department, position,
seniority, project memberships — in order to remove a login. The `409` asks the
caller to deactivate the account (`PATCH { "isActive": false }`) or to remove the
employee first, which is a decision only a human should make. The employee id is
named in the message so the caller knows what to look at.

Note this is a `select` of the relation rather than the `_count` the positions
module uses: `employee` is a one-to-one (`Employee?`), and Prisma's `_count`
only covers to-many relations.

### DTOs and validation

| Field | Create | Patch | Rules |
| --- | --- | --- | --- |
| `email` | required | **not accepted** | string, trimmed, lower-cased, non-empty, valid address, ≤ 254 |
| `username` | optional | optional | string, trimmed, ≤ 50; blank or `null` removes it |
| `password` | required | optional | string, ≥ 8 characters, ≤ 72 **bytes**, not trimmed |
| `role` | required | optional | one of `SUPERADMIN` \| `ADMIN` \| `HR` \| `USER` |
| `isActive` | optional | optional | boolean; defaults to `true` in the schema |

Three deliberate choices:

- **`email` is lower-cased**, for the same reason positions upper-case `code`:
  PostgreSQL's unique index is case-sensitive, so without folding,
  `Ana@example.com` and `ana@example.com` would be two accounts while every mail
  server treats them as one. Folding at the edge makes the index authoritative.
- **`role` is required on create**, even though the schema defaults it to
  `USER`. An administrator creating an account is choosing what that account may
  do, and a privilege level is the last field that should be decided by
  omission. `isActive` *is* left to the schema default, because "a new account is
  enabled" is one decision that belongs in one place.
- **`email` is absent from `UpdateUserDto`**, so a request containing it is a
  `400` rather than a silent no-op. Changing an account's identity is not a
  field edit but a flow: the new address has to be proven reachable before the
  old one stops working, or a typo locks a person out of an account they can no
  longer be contacted about. That flow belongs with email verification, which
  this feature explicitly does not implement.

The constraints live in `user-field.decorators.ts` as `IsUserEmail()`,
`IsUserUsername()`, `IsUserPassword()` and `IsUserRole()`, composed with Nest's
`applyDecorators`, keeping the split Feature 007 chose:

> **constraints** in the composed decorator, **optionality** on the DTO.

`UserQueryDto` extends `SortQueryDto` and adds `search`, `role`, `isActive` and
`sortBy`. The two filters carry no default — for them, absent means "do not
filter", which is not a value they could hold — while `sortBy` uses the property
initialiser the other query DTOs use, so the service always receives a concrete
ordering.

The default is `sortBy=email&sortOrder=asc`. `email` rather than `createdAt`
because it is required and unique, so the ordering is total and a record cannot
shift between two pages of the same listing; `username` would have neither
property.

### Service

`UserService` holds every rule. Five public methods, two private helpers and
four module-level functions.

**`findAll`** reads the page and the total in one `prisma.$transaction([...])`.
Run separately, a concurrent insert between them would produce a `total` that
does not describe the page just returned. The same `where` object is passed to
`findMany` and `count`; a spec asserts they match.

`buildWhere` combines the three parameters with `AND`, so `?role=ADMIN` narrows
whatever `?search=` matched rather than replacing it, and returns `undefined` —
not `{}` — when nothing was requested, because `undefined` is what both
delegates read as "no filter".

`buildOrderBy` emits `[{ [sortBy]: order }, { id: 'asc' }]`. The tie-break makes
pagination safe: `role`, `createdAt` and the nullable `username` are none of them
unique, and two rows sharing a value could otherwise come back in a different
relative order on each query, letting a record repeat on one page and vanish
from the next.

**`update`** checks existence before uniqueness, so patching a missing id
reports the missing id. `assertExists` selects `id` alone — the caller only needs
to know the row is there, and reading the whole record would pull `passwordHash`
into the process for no reason.

### Controller

Five one-line delegations, and — as with the two modules before it — `id` is
taken as a plain `string`, because ids are cuids and `ParseUUIDPipe` would reject
valid ones.

`DELETE` answers **200 with `{ "success": true, "data": null }`, not 204**, so
every endpoint returns the same envelope.

**No guards, and this is worth stating plainly:** every endpoint here is
unauthenticated, so anyone who can reach the API can create a `SUPERADMIN`
account. That is a direct consequence of the feature boundary — authentication
and authorization are later features — and half an access check would be worse
than none, because it reads as protection while providing none. The API must not
be exposed beyond local development until the auth feature lands.

### Registration

`UserModule` is added to `AppModule`'s imports under the existing
`// Business modules` comment. It *exports* `UserService`, because Employees will
need to confirm an account exists — and is not already linked — before assigning
one, and Auth will need to read an account by email. Both should ask this module
rather than query the `users` table themselves, which is what keeps "never
return the password hash" a rule with one enforcement point.

## Database

No change. `schema.prisma`, the migrations and the seed are untouched, and **no
migration is required** — the module is built on the existing `User` model and
the `users` table created by `20260801124229_init`.

The columns it relies on: `id`, `email` (unique), `username` (nullable, unique),
`password_hash`, `role` (the `UserRole` enum), `is_active`, `created_at`,
`updated_at`, plus the `employee` back relation, which is what makes the delete
check a single query.

## API

Base path `/api/v1/users`. Every response is wrapped by the global interceptor;
every failure by the global filter. **No response, on any endpoint, contains
`passwordHash`.**

| Method | Path | Success | Failures |
| --- | --- | --- | --- |
| `GET` | `/users` | `200` | `400` invalid query parameter |
| `GET` | `/users/:id` | `200` | `404` unknown id |
| `POST` | `/users` | `201` | `400` invalid body, `409` duplicate email or username |
| `PATCH` | `/users/:id` | `200` | `400` invalid body, `404` unknown id, `409` duplicate username |
| `DELETE` | `/users/:id` | `200`, `data: null` | `404` unknown id, `409` an employee is linked |

### `GET /api/v1/users`

| Parameter | Type | Default | Rules |
| --- | --- | --- | --- |
| `page` | int | `1` | ≥ 1 (inherited) |
| `limit` | int | `20` | 1–100, above the cap is rejected, not clamped (inherited) |
| `search` | string | — | trimmed, ≤ 100 chars, case-insensitive substring of `email` **or** `username` |
| `role` | enum | — | `SUPERADMIN` \| `ADMIN` \| `HR` \| `USER` |
| `isActive` | boolean | — | exactly `true` or `false`; anything else is a `400` |
| `sortBy` | enum | `email` | `email` \| `username` \| `role` \| `createdAt` |
| `sortOrder` | enum | `asc` | `asc` \| `desc` (inherited from `SortQueryDto`) |

```http
GET /api/v1/users?search=ana&role=ADMIN&isActive=true&sortBy=email&limit=2
```

```json
{
  "success": true,
  "data": {
    "items": [
      {
        "id": "clx1…",
        "email": "ana.pop@example.com",
        "username": "APO",
        "role": "ADMIN",
        "isActive": true,
        "createdAt": "2026-08-01T10:00:00.000Z",
        "updatedAt": "2026-08-01T10:00:00.000Z"
      }
    ],
    "meta": {
      "page": 1, "limit": 2, "total": 1,
      "totalPages": 1, "hasPreviousPage": false, "hasNextPage": false
    }
  }
}
```

### `POST /api/v1/users`

```json
{
  "email": "  Ana.Pop@Example.COM  ",
  "username": "  APO  ",
  "password": "correct horse battery",
  "role": "ADMIN"
}
```

stores `email: "ana.pop@example.com"`, `username: "APO"`, a bcrypt
`passwordHash`, `isActive: true`, and answers `201` with the created resource —
without the hash.

Sending `passwordHash` is a `400`, not a silent drop:

```json
{
  "success": false,
  "statusCode": 400,
  "message": ["property passwordHash should not exist"],
  "path": "/api/v1/users",
  "timestamp": "2026-08-03T09:12:44.001Z"
}
```

### `PATCH /api/v1/users/:id`

`{ "password": "a whole new secret" }` re-hashes and stores the new hash.
`{ "username": null }` removes the username. `{ "email": "…" }` is a `400`.

### Error bodies

```json
{
  "success": false,
  "statusCode": 409,
  "message": [
    "A user with email \"ana.pop@example.com\" already exists",
    "A user with username \"APO\" already exists"
  ],
  "path": "/api/v1/users",
  "timestamp": "2026-08-03T09:12:44.001Z"
}
```

```json
{
  "success": false,
  "statusCode": 409,
  "message": "User clx1… cannot be deleted while employee clx9… is linked to it",
  "path": "/api/v1/users/clx1…",
  "timestamp": "2026-08-03T09:13:02.114Z"
}
```

## Frontend

No change — the frontend directory is still empty. When it exists, the users
screen is the first that is *not* a copy of the departments/positions form: it
has a write-only field, a field that cannot be edited after creation, and a
delete that is refused for a reason the user has to act on elsewhere.

## Testing

Jest was already configured, so tests were written rather than introduced.

| Spec | Covers |
| --- | --- |
| `user.service.spec.ts` | `findAll` mapping, `skip`/`take`, the tie-broken `orderBy`, the insensitive search, each filter alone, all three combined under `AND`, `where: undefined` with no parameters, list and count agreeing, the single transaction, and that `USER_PUBLIC_SELECT` is passed and holds no `passwordHash`; `findOne` found, no hash on the result, 404; `create` happy path, hash stored and plain password absent from the `data`, the uniqueness query, `null` username not searched for, duplicate email, both duplicates reported together, and that a conflicting request spends no bcrypt round; `update` 404 before conflict, `NOT: { id }`, query skipped when the username does not change, `undefined` preserved for omitted fields, re-hash on a new password, `null` clearing the username, duplicate username, no hash on the result; `remove` delete, 404, 409, and the employee named in the message |
| `user.controller.spec.ts` | Each route reaches the matching service method with the arguments it was given, and adds nothing on the way back |
| `create-user.dto.spec.ts` | Run through a real `ValidationPipe`: the transforms (email trim + lower-case, username trim, blank → `null`, password left untouched), every role accepted, missing and malformed fields, roles outside the enum, unknown properties, `passwordHash` rejected, both maximum lengths, the password minimum, and the two byte-limit cases |
| `update-user.dto.spec.ts` | Only the differences from creation — empty body, single field, `username: null`, a new password still length-checked, and that `email` and `passwordHash` are both rejected |
| `user-query.dto.spec.ts` | Defaults, inherited pagination, trimmed search, each sortable column, each role, `isActive=true` and `isActive=false` as real booleans, and the rejected column / direction / role / boolean spelling / unknown parameter |
| `to-boolean.decorator.spec.ts` | The two convertible spellings, real booleans and `undefined` left alone, and five spellings passed through for `@IsBoolean()` to reject |

Hashing is mocked in the service spec: bcrypt at cost 12 costs a few hundred
milliseconds per call, and what those tests are about is *that* the service
hashes — not that `bcryptjs` works, which `password.hasher.spec.ts` already
covers.

`test/app.e2e-spec.ts` gained a `users` block of five cases. Three mirror the
existing blocks (the page-size cap, an unsortable column, a payload missing every
required field); two are specific to this module and are the ones worth having —
`?isActive=yes` is rejected, and a client-supplied `passwordHash` is rejected.
All five are handled by the `ValidationPipe` before the handler runs, so the
suite still needs no database.

**Not covered, and worth being explicit about:** no test exercises a real
PostgreSQL query. The service specs mock `PrismaService`, so they pin the
arguments handed to Prisma, not what Prisma does with them — `mode:
'insensitive'`, the `select` projections and the `$transaction` batch are checked
by the compiler and by construction, not by execution. This is the same gap
Features 007 and 008 left. It matters more here: "the hash is never read out of
PostgreSQL" is currently guaranteed by the type system and by a spec asserting
the `select` argument, which is strong, but not the same as observing a response
body over the wire against a real database.

Results: `npm run typecheck` clean, `npm test` 293 passed (28 suites),
`npm run test:e2e` 17 passed, `npm run build` clean, `prisma validate` clean,
`prettier --check` clean. The 102 new unit tests are additive; every Feature 007
and 008 test still passes unmodified.

## Files Created

| File | Purpose |
| --- | --- |
| `backend/src/common/decorators/to-boolean.decorator.ts` | `@ToBoolean()` — query-string boolean coercion, for every future boolean filter |
| `backend/src/common/decorators/to-boolean.decorator.spec.ts` | Conversion and pass-through tests |
| `backend/src/modules/users/user.module.ts` | Wires the controller and the service; exports the service |
| `backend/src/modules/users/user.controller.ts` | The five routes, one line each |
| `backend/src/modules/users/user.controller.spec.ts` | Delegation tests |
| `backend/src/modules/users/user.service.ts` | All business rules, Prisma access, hashing, uniqueness and delete guards |
| `backend/src/modules/users/user.service.spec.ts` | Unit tests against a mocked `PrismaService` and a mocked hasher |
| `backend/src/modules/users/user.constants.ts` | Lengths, sortable columns, default sort |
| `backend/src/modules/users/dto/create-user.dto.ts` | `POST` body |
| `backend/src/modules/users/dto/create-user.dto.spec.ts` | Validation and transform tests |
| `backend/src/modules/users/dto/update-user.dto.ts` | `PATCH` body, every field optional, no `email` |
| `backend/src/modules/users/dto/update-user.dto.spec.ts` | Tests for what differs from creation |
| `backend/src/modules/users/dto/user-query.dto.ts` | `GET` query — extends `SortQueryDto`, adds two filters |
| `backend/src/modules/users/dto/user-query.dto.spec.ts` | Defaults, sorting, search, filters, rejections |
| `backend/src/modules/users/dto/user-field.decorators.ts` | Per-field constraints plus the byte-length validator |
| `backend/src/modules/users/entities/user.entity.ts` | `UserEntity`, `USER_PUBLIC_SELECT`, `PublicUserRow`, the mapper |
| `FEATURES/009-users-module.md` | This document |

## Files Modified

| File | Change |
| --- | --- |
| `backend/src/app.module.ts` | Imports `UserModule` |
| `backend/src/common/password/password.hasher.ts` | `MAX_PASSWORD_BYTES` is now exported, so DTO validation and the hasher enforce the same number — see [Feature 006](006-shared-backend-infrastructure.md). No behaviour change. |
| `backend/test/app.e2e-spec.ts` | A `users` block of five database-free cases |
| `FEATURES/HISTORY.md` | Feature 009 row |
| `FEATURES/README.md` | Feature 009 row |

Untouched, as required: `schema.prisma`, the migrations, `prisma/seed*`,
`docker-compose.yml`, `.env*`, `package.json` (no package installed), and the
departments and positions modules.

## Notes

- **No package was installed.** `bcryptjs` has been a dependency since Feature
  005, and `hashPassword` since Feature 006. The instruction to "install and use
  bcrypt" was already satisfied; installing the native `bcrypt` binding
  alongside it would have meant two hashing implementations and a compiler
  toolchain requirement on every machine, for hashes that are byte-compatible
  anyway.
- **The seed already provides twelve accounts**, via `prisma/seeds/users.seed.ts`
  — one `SUPERADMIN`, one `ADMIN`, one `HR` and nine `USER`s, three of them
  inactive. Every one satisfies this module's validation unchanged, so
  `GET /api/v1/users` returns a populated first page against a seeded database
  with no seeder change, and `?role=` / `?isActive=` both have data to filter.
  **All twelve are linked to an `Employee`, so every one of them refuses to be
  deleted** — the `409` path is the one you will hit first when exercising this
  by hand against seeded data.
- The seed hashes each account's password individually and deliberately omits
  `passwordHash` from its `upsert`'s `update` branch, so re-seeding does not
  silently reset a password changed through this module's `PATCH`.
- No `PrismaExceptionFilter`, for the same reason Features 007 and 008 gave: the
  service checks uniqueness and existence explicitly, so `P2002` and `P2025` are
  unreachable through the endpoints except in the narrow races described above.
- An empty `PATCH` body is accepted and returns the account unchanged — with a
  refreshed `updatedAt`, since Prisma's `@updatedAt` fires on any `update`.
- `email` is lower-cased silently rather than rejected when mixed-case. That is
  a deliberate normalisation, not leniency: it makes the unique index
  authoritative. A client that echoes the request body back to the user should
  read `email` from the response.
- Deactivating (`isActive: false`) is currently a flag with no enforcement —
  nothing checks it, because nothing authenticates yet. It becomes meaningful
  when the auth module refuses to issue a token for an inactive account.
- `User.isActive` maps to `is_active`, unlike `Position.isActive` and
  `Department.isActive` which have no `@map` and are therefore literally named
  `isActive` in PostgreSQL. Nothing here depends on it — Prisma handles the
  naming — but it is the inconsistency Feature 008 flagged, seen from the other
  side.

## Future Improvements

- **Guard every endpoint.** The most important follow-up by a wide margin:
  until the auth feature lands, anyone who can reach the API can create a
  `SUPERADMIN`. Creating, patching and deleting accounts should be restricted to
  `SUPERADMIN`/`ADMIN`, and listing to those plus `HR`.
- **Database-backed tests.** A suite running against the Compose PostgreSQL — or
  Testcontainers — would prove the response body carries no `passwordHash` over
  the wire, and exercise the real `mode: 'insensitive'` comparison, the `select`
  projections, the `$transaction` batch and the unique constraints.
- **Self-service password change**, requiring the current password, once there
  is a signed-in user to require it of. The `PATCH` here is an administrative
  reset and should stay one.
- **Email change with verification**, which is why `email` is not patchable
  today.
- A `citext` column or a functional unique index on `email` and `username`, to
  close the case-variant race the service documents. Schema change, needs a
  migration.
- Rate-limit account creation, and consider whether a `409` on `POST /users`
  should distinguish "email taken" from a generic message — the current body
  confirms an address is registered, which is a small enumeration surface. It is
  the right trade-off for an admin-only screen and the wrong one for a public
  sign-up form.
- Soft delete (`deletedAt`) if accounts turn out to need archiving rather than
  removal, which the `409` suggests they might. Schema change and a migration.
- Swagger annotations for the DTOs and the envelope, when Swagger arrives.
