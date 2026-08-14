# Feature 007 — Departments Module

**Status:** Completed
**Date:** 2026-08-03

## Goal

The first business module, and the pattern the ones after it copy: a complete
CRUD resource at `/api/v1/departments` built entirely on the infrastructure
[Feature 006](006-shared-backend-infrastructure.md) put in place — the response
envelopes, the exception filter, the pagination DTO and the pagination
arithmetic — without reimplementing any of it.

It is also the feature that answers, with a real endpoint rather than a guess,
the two questions Feature 006 deferred: what a sortable list DTO looks like, and
where the line falls between shared and module-owned code.

## Requirements

- Full CRUD over the existing `Department` model, no schema change, no migration.
- List endpoint with pagination, sorting and case-insensitive search.
- `code` and `name` required on creation, unique, and unique case-insensitively.
- Partial updates that never blank a field the client did not mention.
- Hard delete, refused with `409` while employees still reference the department.
- Every request validated by `class-validator` / `class-transformer`.
- Controllers thin; all rules in the service; no response formatting in either.
- Reuse `PaginationQueryDto`, `toSkipTake`, `buildPaginatedResult`,
  `AllExceptionsFilter`, `ResponseInterceptor`, `toIsoTimestamp`.

## Backend

### Structure added

```text
backend/src/common/
├── decorators/
│   └── trim.decorator.ts             # @Trim() — new folder, first real entry
└── enums/
    └── sort-order.enum.ts            # asc | desc — new folder

backend/src/modules/departments/
├── department.module.ts
├── department.controller.ts
├── department.controller.spec.ts
├── department.service.ts
├── department.service.spec.ts
├── department.constants.ts           # lengths, code pattern, sortable columns
├── dto/
│   ├── create-department.dto.ts
│   ├── create-department.dto.spec.ts
│   ├── update-department.dto.ts
│   ├── update-department.dto.spec.ts
│   ├── department-query.dto.ts
│   ├── department-query.dto.spec.ts
│   └── department-field.decorators.ts
└── entities/
    └── department.entity.ts
```

`src/modules/` is new. `health/` and `prisma/` stay where they are — moving
them would be churn in files this feature has no reason to touch — so from now
on `src/modules/` holds business resources and the top level holds
infrastructure. That is the convention the next module follows.

The folder is `departments/` (the resource, plural) while the files inside are
`department.*` (the thing, singular), matching the requested layout.

### Two additions to `src/common`

Feature 006 left `decorators/` and `enums/` uncreated on the grounds that an
empty folder is not infrastructure. Each now has exactly one file, and each
earned it by having more than one caller in this feature:

| File | Why it is shared rather than module-local |
| --- | --- |
| `enums/sort-order.enum.ts` | `asc` / `desc` is API vocabulary, like `page` and `limit`: the *column* being sorted differs per resource, the direction never does. Feature 006 explicitly parked this until a real list endpoint existed. The values are the strings Prisma's `orderBy` expects, so a validated value passes through with no translation table. |
| `decorators/trim.decorator.ts` | `@Trim()` is used by `name`, `description` and `search` here, and by every string field of every module after. Trimming on the DTO rather than in a service is what makes `"  Development  "` and `"Development"` the same value by the time the uniqueness check sees them. |

Deliberately **not** shared yet: a `SortQueryDto` base class. It could only hold
`sortOrder` — `sortBy`'s allowed values are per-resource — and a base class
carrying one field, extending another base class, is the kind of abstraction
that should wait until a second module confirms the shape.

### `department.constants.ts`

Lengths (`20` / `100` / `500` / `100`), the code pattern and the sortable column
list, so no number is spelled inline. The columns are `text` in PostgreSQL and
therefore unbounded — these limits are an API contract, not a schema mirror, and
they are the values a form's `maxlength` should be generated from.

`DEPARTMENT_SORT_FIELDS` is a closed `as const` tuple because the chosen value
becomes a key in Prisma's `orderBy`; anything not enumerated must be rejected by
validation before it can get there. `DepartmentSortField` is derived from the
tuple, so adding a column is one edit and the type follows.

### DTOs

Three DTOs and one file of composed decorators.

`CreateDepartmentDto` requires `code` and `name`; `description` and `isActive`
are optional. `isActive` is not defaulted here — the schema's `true` default
already says "a new department is active", and repeating it would create a
second place for that answer to live.

`UpdateDepartmentDto` is the same fields, all optional.

The two would otherwise repeat four decorators per field, so the constraints
live in `department-field.decorators.ts` as `IsDepartmentCode()`,
`IsDepartmentName()` and `IsDepartmentDescription()`, composed with Nest's
`applyDecorators`. The split is deliberate:

> **constraints** in the composed decorator, **optionality** on the DTO.

`@IsOptional()` is the entire difference between creating and patching, so it
has to be readable on the class it applies to rather than hidden behind a flag
passed to a factory.

The idiomatic alternative is `PartialType` from `@nestjs/mapped-types`. It is
not installed, and installing a package is a decision for the user under
CLAUDE.md's command policy, not something to slip into a feature — so the
composition approach was used instead. Nothing prevents switching later; the DTO
files are the only ones that would change.

Three transforms carry real behaviour rather than decoration:

| Field | Transform | Why |
| --- | --- | --- |
| `code` | trim, then upper-case | PostgreSQL's unique index is case-sensitive, so without folding, `dev` and `DEV` are two departments as far as the database is concerned. Normalising at the edge makes that index the real guarantee, and matches the convention the seed data set (`MGMT`, `BA`, …). |
| `name` | trim | A trailing space would otherwise create a near-duplicate the uniqueness check cannot see. |
| `description` | trim, blank → `null` | A cleared textarea posts `""`, which is not a shorter description but the absence of one. Storing it verbatim would give the column two values meaning "empty" and force every reader to check for both. |

`description: null` therefore passes `@IsOptional()` and reaches Prisma as an
explicit `null`, which is what makes "clear the description" a request the API
can express at all — distinct from omitting the field, which changes nothing.

`DepartmentQueryDto` extends `PaginationQueryDto`, which is the extension point
Feature 006 built it for: `page`, `limit`, the defaults and the page-size cap
apply here without being restated. It adds `search`, `sortBy` and `sortOrder`,
the last two with property initialisers so the service always receives a
concrete ordering.

The default is `sortBy=name&sortOrder=asc`, not `createdAt desc`. Departments
are reference data a user scans alphabetically, and — more concretely — `name`
is unique, so the ordering is total and a row cannot shift between two pages of
the same listing.

### Entity

`DepartmentEntity` is an interface plus a `toDepartmentEntity` mapper, not a
class. It exists because the row and the resource are two contracts that only
happen to agree today: returning `DepartmentModel` straight from a handler would
publish every column the generator emits, so a future `deletedAt` or internal
flag would leak the moment it was added rather than when someone decided to
expose it.

The visible difference is the timestamps — `Date` in the row, ISO-8601 `string`
here, which is what the client actually receives once the body is serialised.
Declaring them as `string` makes the type honest and routes the format through
`toIsoTimestamp`, whose first non-infrastructure caller this is, exactly as
Feature 006 predicted.

### Service

`DepartmentService` holds every rule. Five public methods, three private helpers
and four module-level functions; nothing is longer than a screen.

**`findAll`** reads the page and the total in one `prisma.$transaction([...])`.
Run separately, a concurrent insert between them would produce a `total` that
does not describe the page just returned. The same `where` object is passed to
`findMany` and `count`; a spec asserts they match, because the day those two
diverge the pagination metadata starts lying.

`buildSearchFilter` returns `undefined` — not `{}` — when there is no term,
because `undefined` is what both delegates read as "no filter".

`buildOrderBy` emits `[{ [sortBy]: order }, { id: 'asc' }]`. The tie-break is
what makes pagination safe under `?sortBy=createdAt`: that column is not unique,
and two rows sharing a value could otherwise come back in a different relative
order on each query, letting a record repeat on one page and vanish from the
next.

**`findOne`** and the 404 path of `update` share `findOrThrow`, so the message
is written once.

**`update`** checks existence *before* uniqueness, so patching a missing id
reports the missing id rather than a conflict with whichever department happens
to own the submitted code. The `data` object lists all four fields; Prisma omits
`undefined` from the `UPDATE`, which is what makes a partial body partial.

**`remove`** reads existence and the employee count in one query:

```ts
select: { _count: { select: { employees: true } } }
```

so the common case is a single round trip, and 404 and 409 cannot be decided
from two different snapshots.

### Duplicate protection

`assertCodeAndNameAreFree` is the one query both `create` and `update` use:

- it builds an `OR` of only the fields actually submitted — a patch touching
  neither `code` nor `name` skips the query entirely rather than running a
  `WHERE OR ()`;
- `excludeId` adds `NOT: { id }` on update, so a department is never a conflict
  with itself;
- comparison is case-insensitive (`mode: 'insensitive'`), because `Development`
  and `development` are the same department to a human;
- both conflicts are reported together, as a `string[]`, the same shape the
  `ValidationPipe` produces and the filter already normalises — so a form can
  mark both offending inputs instead of revealing the second problem only after
  the first is fixed.

Known limitation, recorded rather than hidden: the PostgreSQL unique index is
case-sensitive, so it backs this check for the *exact-case* race between the
read and the write, but two concurrent requests submitting `Dev` and `DEV` could
both pass. Closing that needs a `citext` column or a functional unique index —
a schema change, which this feature is not allowed to make. For `code` the gap
is already closed in practice, since the DTO upper-cases before the check.

### Controller

Five one-line delegations. Validation is the DTOs' job, the success envelope the
interceptor's, error rendering the filter's, everything else the service's.

`id` is taken as a plain `string`: ids are cuids, so `ParseUUIDPipe` would
reject valid ones, and a malformed id simply matches no row and yields the same
404 as an id that never existed.

`DELETE` answers **200 with `{ "success": true, "data": null }`, not 204** — a
204 must carry an empty body, which would make it the one endpoint whose
response is not the envelope. Feature 006 chose the explicit `data: null` for
precisely this case.

### Registration

`DepartmentModule` is added to `AppModule`'s imports under a `// Business
modules` comment. It does not import `PrismaModule`, which is `@Global`. It
*exports* `DepartmentService`, because the Employees module will need to confirm
a department exists before assigning someone to it and should ask this module
rather than query the table itself.

## Database

No change. `schema.prisma`, the migrations and the seed are untouched, and **no
migration is required** — the module is built on the existing `Department`
model and the `departments` table created by `20260801124229_init`.

The columns it relies on: `id`, `code` (unique), `name` (unique), `description`
(nullable), `isActive`, `createdAt`, `updatedAt`, plus the `employees` back
relation, which is what makes the delete check a `_count` rather than a second
query.

## API

Base path `/api/v1/departments`. Every response is wrapped by the global
interceptor; every failure by the global filter.

| Method | Path | Success | Failures |
| --- | --- | --- | --- |
| `GET` | `/departments` | `200` | `400` invalid query parameter |
| `GET` | `/departments/:id` | `200` | `404` unknown id |
| `POST` | `/departments` | `201` | `400` invalid body, `409` duplicate code or name |
| `PATCH` | `/departments/:id` | `200` | `400` invalid body, `404` unknown id, `409` duplicate code or name |
| `DELETE` | `/departments/:id` | `200`, `data: null` | `404` unknown id, `409` employees still assigned |

### `GET /api/v1/departments`

| Parameter | Type | Default | Rules |
| --- | --- | --- | --- |
| `page` | int | `1` | ≥ 1 (inherited) |
| `limit` | int | `20` | 1–100, above the cap is rejected, not clamped (inherited) |
| `search` | string | — | trimmed, ≤ 100 chars, case-insensitive substring of `code` **or** `name` |
| `sortBy` | enum | `name` | `code` \| `name` \| `createdAt` |
| `sortOrder` | enum | `asc` | `asc` \| `desc` |

```http
GET /api/v1/departments?search=dev&sortBy=code&sortOrder=desc&page=1&limit=2
```

```json
{
  "success": true,
  "data": {
    "items": [
      {
        "id": "clx1…",
        "code": "DEV",
        "name": "Development",
        "description": "Software design, implementation and code review.",
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

### `POST /api/v1/departments`

```json
{ "code": "dev-ops", "name": "  DevOps  ", "description": "  " }
```

stores `code: "DEV-OPS"`, `name: "DevOps"`, `description: null`,
`isActive: true`, and answers `201` with the created resource.

### Validation rules

| Field | Create | Patch | Rules |
| --- | --- | --- | --- |
| `code` | required | optional | string, trimmed, upper-cased, non-empty, ≤ 20, `^[A-Z0-9]+([-_][A-Z0-9]+)*$` |
| `name` | required | optional | string, trimmed, non-empty, ≤ 100 |
| `description` | optional | optional | string, trimmed, ≤ 500; blank or `null` clears it |
| `isActive` | optional | optional | boolean; defaults to `true` in the schema |

Unknown properties are rejected with `400`, not ignored — the global pipe runs
with `forbidNonWhitelisted`, so a typo in a payload is reported rather than
silently dropped.

### Error bodies

```json
{
  "success": false,
  "statusCode": 409,
  "message": [
    "A department with code \"DEV\" already exists",
    "A department with name \"Development\" already exists"
  ],
  "path": "/api/v1/departments",
  "timestamp": "2026-08-03T09:12:44.001Z"
}
```

```json
{
  "success": false,
  "statusCode": 409,
  "message": "Department clx1… cannot be deleted while 4 employee(s) are assigned to it",
  "path": "/api/v1/departments/clx1…",
  "timestamp": "2026-08-03T09:13:02.114Z"
}
```

## Frontend

No change — the frontend directory is still empty. When it exists, this resource
is the one to build the first list screen against: `meta` maps onto a pagination
component, `sortBy` / `sortOrder` onto column headers, `search` onto a single
input, and the `409` message array onto per-field errors on the form.

## Testing

Jest was already configured, so tests were written rather than introduced.

| Spec | Covers |
| --- | --- |
| `department.service.spec.ts` | `findAll` mapping, `skip`/`take`, the tie-broken `orderBy`, the insensitive search filter, `where: undefined` with no term, list and count agreeing on the filter, the single transaction; `findOne` found and 404; `create` happy path, the uniqueness query, duplicate code, both duplicates reported together; `update` 404 before conflict, `NOT: { id }`, the query skipped when neither unique field changes, `undefined` preserved for omitted fields, duplicate name; `remove` delete, 404, 409 with the count |
| `department.controller.spec.ts` | Each route reaches the matching service method with the arguments it was given, and adds nothing on the way back |
| `create-department.dto.spec.ts` | Run through a real `ValidationPipe`: the transforms (trim, upper-case, blank → `null`), missing and blank fields, illegal code characters, non-string and non-boolean values, unknown properties, and every maximum length |
| `update-department.dto.spec.ts` | Only the differences from creation — empty body, single field, `description: null`, and that a blank name is still rejected rather than treated as absent |
| `department-query.dto.spec.ts` | Defaults, inherited pagination, trimmed search, each sortable column, both directions, rejected column / direction / unknown parameter, search length cap |

`test/app.e2e-spec.ts` gained three cases that need no database, because they
are rejected by the `ValidationPipe` before the handler runs: the page-size cap,
an unsortable column, and an empty creation payload reporting both missing
fields. What they prove is the wiring — the module is mounted under
`/api/v1`, its DTOs are applied by the global pipe, and a rejection comes back
as the error envelope.

**Not covered, and worth being explicit about:** no test exercises a real
PostgreSQL query. The service specs mock `PrismaService`, so they pin the
arguments handed to Prisma, not what Prisma does with them — `mode:
'insensitive'`, the `_count` selection and the `$transaction` batch are checked
by the compiler and by construction, not by execution. Verifying those needs a
database-backed suite, which is its own feature (see below).

Results: `npm run typecheck` clean, `npm test` 122 passed (16 suites),
`npm run test:e2e` 9 passed, `npm run build` clean, `prettier --check` clean.

## Files Created

| File | Purpose |
| --- | --- |
| `backend/src/common/enums/sort-order.enum.ts` | `SortOrder` — `asc` / `desc`, shared by every sortable endpoint |
| `backend/src/common/decorators/trim.decorator.ts` | `@Trim()` — strips surrounding whitespace before validation |
| `backend/src/modules/departments/department.module.ts` | Wires the controller and the service; exports the service |
| `backend/src/modules/departments/department.controller.ts` | The five routes, one line each |
| `backend/src/modules/departments/department.controller.spec.ts` | Delegation tests |
| `backend/src/modules/departments/department.service.ts` | All business rules, Prisma access, uniqueness and delete guards |
| `backend/src/modules/departments/department.service.spec.ts` | Unit tests against a mocked `PrismaService` |
| `backend/src/modules/departments/department.constants.ts` | Lengths, code pattern, sortable columns, default sort |
| `backend/src/modules/departments/dto/create-department.dto.ts` | `POST` body |
| `backend/src/modules/departments/dto/create-department.dto.spec.ts` | Validation and transform tests |
| `backend/src/modules/departments/dto/update-department.dto.ts` | `PATCH` body, every field optional |
| `backend/src/modules/departments/dto/update-department.dto.spec.ts` | Tests for what differs from creation |
| `backend/src/modules/departments/dto/department-query.dto.ts` | `GET` query — extends `PaginationQueryDto` |
| `backend/src/modules/departments/dto/department-query.dto.spec.ts` | Defaults, sorting, search, rejections |
| `backend/src/modules/departments/dto/department-field.decorators.ts` | Per-field constraints shared by the create and update DTOs |
| `backend/src/modules/departments/entities/department.entity.ts` | `DepartmentEntity` and the row → resource mapper |
| `FEATURES/007-departments-module.md` | This document |

## Files Modified

| File | Change |
| --- | --- |
| `backend/src/app.module.ts` | Imports `DepartmentModule` |
| `backend/test/app.e2e-spec.ts` | Three database-free cases for the new routes |
| `FEATURES/HISTORY.md` | Feature 007 row |
| `FEATURES/README.md` | Feature 007 row |

Untouched, as required: `schema.prisma`, the migrations, `prisma/seed*`,
`docker-compose.yml`, `.env*`, and everything under `src/common` that existed
before this feature.

## Notes

- No `PrismaExceptionFilter`. Feature 006 listed one as a future improvement for
  "the first module that writes to the database" — this one — but the service
  checks uniqueness and existence explicitly, so `P2002` and `P2025` are
  unreachable through the endpoints except in the narrow races described above,
  and a filter written now could not be verified against a real constraint by
  any test in the suite. The right moment is a module whose invariants cannot be
  checked in advance.
- No `isActive` filter on the list endpoint. It is an obvious next parameter,
  but the feature specified pagination, sorting and search, and a filter added
  speculatively would be one more thing to keep and test without a caller.
- An empty `PATCH` body is accepted and returns the department unchanged — with
  a refreshed `updatedAt`, since Prisma's `@updatedAt` fires on any `update`.
  Rejecting it would need a custom validator for a request that costs one query
  and breaks nothing.
- `code` is upper-cased silently rather than rejected when lowercase. That is a
  deliberate normalisation, not leniency: it makes the unique index authoritative
  (see above). A client that echoes the request body back to the user should
  read `code` from the response.
- The `409` on delete counts *all* employees, including inactive and terminated
  ones. Their history still points at the department, which is exactly why it
  cannot be removed.

## Future Improvements

- **Database-backed tests.** The gap this feature leaves. A suite running
  against the Compose PostgreSQL — or Testcontainers — would exercise the real
  `mode: 'insensitive'` comparison, the `_count` selection, the `$transaction`
  batch and the unique constraints, none of which a mocked client can prove.
- Install `@nestjs/mapped-types` and reduce `UpdateDepartmentDto` to
  `PartialType(CreateDepartmentDto)`, retiring `department-field.decorators.ts`.
  Needs user approval for the package.
- Add `?isActive=` filtering once a screen needs it, and lift the shared parts
  into a `FilterQueryDto` when a second module wants the same parameter.
- Promote `sortOrder` into a shared `SortQueryDto` when a second list endpoint
  confirms the shape.
- Replace the hard delete with a soft delete (`deletedAt`) if departments turn
  out to need archiving rather than removal. That is a schema change and a
  migration, and it would also change what `DepartmentEntity` exposes — which is
  the reason the entity exists.
- Swagger annotations for the DTOs and the envelope, when Swagger arrives.
- Guard the write endpoints once authentication exists; creating or deleting a
  department is an HR/admin action, not something any authenticated user should
  do.
