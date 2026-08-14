# Feature 008 — Positions Module

**Status:** Completed
**Date:** 2026-08-03

## Goal

A complete CRUD resource at `/api/v1/positions`, built on the infrastructure
from [Feature 006](006-shared-backend-infrastructure.md) and following the
architecture [Feature 007](007-departments-module.md) established — and, by
being the *second* module rather than the first, settling the question Feature
007 could not: which parts of a CRUD module are genuinely shared, and which only
look alike.

The answer this feature records is deliberately narrow. Exactly one thing moved
into `src/common`, and it is the one thing Feature 007 named in advance.

## Requirements

- Full CRUD over the existing `Position` model, no schema change, no migration.
- List endpoint with pagination, sorting and case-insensitive search.
- `code` and `name` required on creation, unique, and unique case-insensitively.
- Partial updates that never blank a field the client did not mention.
- Hard delete, refused with `409` while employees still reference the position.
- Every request validated by `class-validator` / `class-transformer`.
- Controllers thin; all rules in the service; no response formatting in either.
- Reuse `PaginationQueryDto`, `toSkipTake`, `buildPaginatedResult`,
  `AllExceptionsFilter`, `ResponseInterceptor`, `toIsoTimestamp`, `@Trim()`,
  `SortOrder`.

## Backend

### Structure added

```text
backend/src/common/dto/
├── sort-query.dto.ts                 # NEW — SortQueryDto, holds sortOrder
└── sort-query.dto.spec.ts

backend/src/modules/positions/
├── position.module.ts
├── position.controller.ts
├── position.controller.spec.ts
├── position.service.ts
├── position.service.spec.ts
├── position.constants.ts             # lengths, code pattern, sortable columns
├── dto/
│   ├── create-position.dto.ts
│   ├── create-position.dto.spec.ts
│   ├── update-position.dto.ts
│   ├── update-position.dto.spec.ts
│   ├── position-query.dto.ts
│   ├── position-query.dto.spec.ts
│   └── position-field.decorators.ts
└── entities/
    └── position.entity.ts
```

This is the layout Feature 007 introduced, unchanged: the folder is `positions/`
(the resource, plural) while the files inside are `position.*` (the thing,
singular), and it sits under `src/modules/` because that is where business
resources live while the top level holds infrastructure.

### The one extraction: `SortQueryDto`

Feature 007 declined to create this class, and said why:

> Deliberately **not** shared yet: a `SortQueryDto` base class. It could only
> hold `sortOrder` … and a base class carrying one field, extending another base
> class, is the kind of abstraction that should wait until a second module
> confirms the shape.

This is that second module, and the shape held. `sortOrder` is now declared once:

```ts
export class SortQueryDto extends PaginationQueryDto {
  @IsOptional()
  @IsEnum(SortOrder)
  readonly sortOrder: SortOrder = SortOrder.ASC;
}
```

`DepartmentQueryDto` and `PositionQueryDto` both extend it, and neither declares
`sortOrder`. **This changes a Feature 007 file** — `department-query.dto.ts`
loses three lines and one import — which is recorded here per the rule in
`FEATURES/README.md` that a later feature documenting a change to earlier
behaviour links back to it. The department endpoint's behaviour is identical;
its own spec, unmodified, still passes.

`sortBy` stays per-module. Its allowed values name columns of one table and
reach Prisma's `orderBy` as keys, so each resource must enumerate its own.

### What was *not* extracted, and why

`position-field.decorators.ts`, `position.constants.ts` and the private helpers
in `position.service.ts` are close parallels of their department counterparts.
Generalising them — `IsResourceCode(maxLength)`, a shared search-filter builder,
a base CRUD service — was considered and rejected for this feature:

| Candidate | Why it stayed module-local |
| --- | --- |
| Field decorators | The similarity is real but shallow: what varies is the max length *today*, and what a shared decorator would have to absorb tomorrow is every divergence between resources — a code pattern that admits dots, a name that is not unique, a field one resource trims and another does not. Two resources agreeing is not yet evidence of a rule. |
| `buildSearchFilter` / `buildOrderBy` | Each is four lines and closes over a `Prisma.<Model>WhereInput`. A generic version needs the model type threaded through, which trades four readable lines for a type parameter at every call site. |
| A base CRUD service | The methods differ in their entity mapper, their delegate, their relation counted on delete and every message. What remains after abstracting those is control flow, and it is more legible written out. |

The instruction for this feature was that Positions become *the template for
future CRUD modules*. A template is copied, so it has to be readable end to end
without following an inheritance chain — which is also why the third module is
the right place to revisit this, with three data points instead of two.

### `position.constants.ts`

Lengths (`20` / `100` / `500` / `100`), the code pattern and the sortable column
list, so no number is spelled inline. The columns are `text` in PostgreSQL and
therefore unbounded — these limits are an API contract, not a schema mirror.

`POSITION_SORT_FIELDS` is a closed `as const` tuple because the chosen value
becomes a key in Prisma's `orderBy`; anything not enumerated must be rejected by
validation before it can get there. `PositionSortField` is derived from the
tuple, so adding a column is one edit and the type follows.

### DTOs

`CreatePositionDto` requires `code` and `name`; `description` and `isActive` are
optional. `isActive` is not defaulted here — the schema's `true` default already
says "a new position is active".

`UpdatePositionDto` is the same fields, all optional.

The constraints live in `position-field.decorators.ts` as `IsPositionCode()`,
`IsPositionName()` and `IsPositionDescription()`, composed with Nest's
`applyDecorators`, keeping the split Feature 007 chose:

> **constraints** in the composed decorator, **optionality** on the DTO.

Three transforms carry real behaviour:

| Field | Transform | Why |
| --- | --- | --- |
| `code` | trim, then upper-case | PostgreSQL's unique index is case-sensitive, so without folding, `dev` and `DEV` are two positions as far as the database is concerned. Normalising at the edge makes that index the real guarantee. |
| `name` | trim | A trailing space would otherwise create a near-duplicate the uniqueness check cannot see. |
| `description` | trim, blank → `null` | A cleared textarea posts `""`, which is not a shorter description but the absence of one. |

`description: null` passes `@IsOptional()` and reaches Prisma as an explicit
`null`, which is what makes "clear the description" a request the API can
express — distinct from omitting the field, which changes nothing.

`PositionQueryDto` extends `SortQueryDto` and adds `search` and `sortBy`. The
default is `sortBy=name&sortOrder=asc`, matching departments: positions are
reference data scanned alphabetically, and `name` is unique, so the ordering is
total and a row cannot shift between two pages of the same listing.

### Entity

`PositionEntity` is an interface plus a `toPositionEntity` mapper, not a class.
Returning `PositionModel` straight from a handler would publish every column the
generator emits, so a future `deletedAt` or internal flag would leak the moment
it was added rather than when someone decided to expose it.

The visible difference is the timestamps — `Date` in the row, ISO-8601 `string`
here, routed through `toIsoTimestamp`.

### Service

`PositionService` holds every rule. Five public methods, three private helpers
and four module-level functions.

**`findAll`** reads the page and the total in one `prisma.$transaction([...])`.
Run separately, a concurrent insert between them would produce a `total` that
does not describe the page just returned. The same `where` object is passed to
`findMany` and `count`; a spec asserts they match.

`buildSearchFilter` returns `undefined` — not `{}` — when there is no term,
because `undefined` is what both delegates read as "no filter".

`buildOrderBy` emits `[{ [sortBy]: order }, { id: 'asc' }]`. The tie-break makes
pagination safe under `?sortBy=createdAt`: that column is not unique, and two
rows sharing a value could otherwise come back in a different relative order on
each query, letting a record repeat on one page and vanish from the next.

**`findOne`** and the 404 path of `update` share `findOrThrow`.

**`update`** checks existence *before* uniqueness, so patching a missing id
reports the missing id rather than a conflict with whichever position happens to
own the submitted code. The `data` object lists all four fields; Prisma omits
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
  neither `code` nor `name` skips the query entirely;
- `excludeId` adds `NOT: { id }` on update, so a position is never a conflict
  with itself;
- comparison is case-insensitive (`mode: 'insensitive'`), because `Developer`
  and `developer` are the same position to a human;
- both conflicts are reported together, as a `string[]`, the same shape the
  `ValidationPipe` produces — so a form can mark both offending inputs instead
  of revealing the second problem only after the first is fixed.

Known limitation, carried over from Feature 007 and recorded rather than hidden:
the PostgreSQL unique index is case-sensitive, so it backs this check for the
*exact-case* race between the read and the write, but two concurrent requests
submitting `Dev` and `DEV` could both pass. Closing that needs a `citext` column
or a functional unique index — a schema change, which this feature is not
allowed to make. For `code` the gap is already closed in practice, since the DTO
upper-cases before the check.

### Delete protection

`DELETE` never cascades. The employee count is read as part of the existence
query, and a non-zero count is a `409` naming the number:

```text
Position pos-1 cannot be deleted while 4 employee(s) are assigned to it
```

`Employee.positionId` is a **required** field in the schema, so a cascade would
have to delete the employees themselves — the database would refuse to orphan
them. The 409 asks the caller to reassign or deactivate first. The count
includes inactive and terminated employees: their history still points at the
position, which is exactly why it cannot be removed.

### Controller

Five one-line delegations. Validation is the DTOs' job, the success envelope the
interceptor's, error rendering the filter's, everything else the service's.

`id` is taken as a plain `string`: ids are cuids, so `ParseUUIDPipe` would
reject valid ones, and a malformed id simply matches no row and yields the same
404 as an id that never existed.

`DELETE` answers **200 with `{ "success": true, "data": null }`, not 204** — a
204 must carry an empty body, which would make it the one endpoint whose
response is not the envelope.

### Registration

`PositionModule` is added to `AppModule`'s imports under the existing
`// Business modules` comment. It does not import `PrismaModule`, which is
`@Global`. It *exports* `PositionService`, because the Employees module will
need to confirm a position exists before assigning someone to it and should ask
this module rather than query the table itself.

## Database

No change. `schema.prisma`, the migrations and the seed are untouched, and **no
migration is required** — the module is built on the existing `Position` model
and the `positions` table created by `20260801124229_init`.

The columns it relies on: `id`, `code` (unique), `name` (unique), `description`
(nullable), `isActive`, `createdAt`, `updatedAt`, plus the `employees` back
relation, which is what makes the delete check a `_count` rather than a second
query.

## API

Base path `/api/v1/positions`. Every response is wrapped by the global
interceptor; every failure by the global filter.

| Method | Path | Success | Failures |
| --- | --- | --- | --- |
| `GET` | `/positions` | `200` | `400` invalid query parameter |
| `GET` | `/positions/:id` | `200` | `404` unknown id |
| `POST` | `/positions` | `201` | `400` invalid body, `409` duplicate code or name |
| `PATCH` | `/positions/:id` | `200` | `400` invalid body, `404` unknown id, `409` duplicate code or name |
| `DELETE` | `/positions/:id` | `200`, `data: null` | `404` unknown id, `409` employees still assigned |

### `GET /api/v1/positions`

| Parameter | Type | Default | Rules |
| --- | --- | --- | --- |
| `page` | int | `1` | ≥ 1 (inherited) |
| `limit` | int | `20` | 1–100, above the cap is rejected, not clamped (inherited) |
| `search` | string | — | trimmed, ≤ 100 chars, case-insensitive substring of `code` **or** `name` |
| `sortBy` | enum | `name` | `code` \| `name` \| `createdAt` |
| `sortOrder` | enum | `asc` | `asc` \| `desc` (inherited from `SortQueryDto`) |

```http
GET /api/v1/positions?search=dev&sortBy=code&sortOrder=desc&page=1&limit=2
```

```json
{
  "success": true,
  "data": {
    "items": [
      {
        "id": "clx1…",
        "code": "DEV",
        "name": "Developer",
        "description": "Designs and implements software.",
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

### `POST /api/v1/positions`

```json
{ "code": "qa-lead", "name": "  QA Lead  ", "description": "  " }
```

stores `code: "QA-LEAD"`, `name: "QA Lead"`, `description: null`,
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
    "A position with code \"DEV\" already exists",
    "A position with name \"Developer\" already exists"
  ],
  "path": "/api/v1/positions",
  "timestamp": "2026-08-03T09:12:44.001Z"
}
```

```json
{
  "success": false,
  "statusCode": 409,
  "message": "Position clx1… cannot be deleted while 4 employee(s) are assigned to it",
  "path": "/api/v1/positions/clx1…",
  "timestamp": "2026-08-03T09:13:02.114Z"
}
```

## Frontend

No change — the frontend directory is still empty. When it exists, positions and
departments are the same screen twice, which is the first real test of whether
the planned reusable list/form components hold.

## Testing

Jest was already configured, so tests were written rather than introduced.

| Spec | Covers |
| --- | --- |
| `position.service.spec.ts` | `findAll` mapping, `skip`/`take`, the tie-broken `orderBy`, the insensitive search filter, `where: undefined` with no term, list and count agreeing on the filter, the single transaction; `findOne` found and 404; `create` happy path, the uniqueness query, duplicate code, both duplicates reported together; `update` 404 before conflict, `NOT: { id }`, the query skipped when neither unique field changes, `undefined` preserved for omitted fields, duplicate name; `remove` delete, 404, 409 with the count |
| `position.controller.spec.ts` | Each route reaches the matching service method with the arguments it was given, and adds nothing on the way back |
| `create-position.dto.spec.ts` | Run through a real `ValidationPipe`: the transforms (trim, upper-case, blank → `null`), missing and blank fields, illegal code characters, non-string and non-boolean values, unknown properties, and every maximum length |
| `update-position.dto.spec.ts` | Only the differences from creation — empty body, single field, `description: null`, and that a blank name is still rejected rather than treated as absent |
| `position-query.dto.spec.ts` | Defaults, inherited pagination, trimmed search, each sortable column, both directions, rejected column / direction / unknown parameter, search length cap |
| `sort-query.dto.spec.ts` | The new base class on its own: the `asc` default, the inherited pagination defaults, both directions, a rejected direction |

`test/app.e2e-spec.ts` gained a `positions` block mirroring the departments one
— the page-size cap, an unsortable column, and an empty creation payload
reporting both missing fields. All three are rejected by the `ValidationPipe`
before the handler runs, so they need no database. Repeating them against the
second module is worthwhile for a different reason than the first time: they
prove `PositionModule` is mounted under `/api/v1` with its own DTOs, not that
the pipe works.

**Not covered, and worth being explicit about:** no test exercises a real
PostgreSQL query. The service specs mock `PrismaService`, so they pin the
arguments handed to Prisma, not what Prisma does with them — `mode:
'insensitive'`, the `_count` selection and the `$transaction` batch are checked
by the compiler and by construction, not by execution. This is the same gap
Feature 007 left, now twice as large, and it is the strongest argument for the
database-backed suite listed below.

Results: `npm run typecheck` clean, `npm test` 191 passed (22 suites),
`npm run test:e2e` 12 passed, `npm run build` clean, `prisma validate` clean,
`prettier --check` clean. The 69 new unit tests are additive; every Feature 007
test still passes unmodified.

## Files Created

| File | Purpose |
| --- | --- |
| `backend/src/common/dto/sort-query.dto.ts` | `SortQueryDto` — pagination plus `sortOrder`, for every sortable list endpoint |
| `backend/src/common/dto/sort-query.dto.spec.ts` | Defaults, inheritance and rejection tests for the base class |
| `backend/src/modules/positions/position.module.ts` | Wires the controller and the service; exports the service |
| `backend/src/modules/positions/position.controller.ts` | The five routes, one line each |
| `backend/src/modules/positions/position.controller.spec.ts` | Delegation tests |
| `backend/src/modules/positions/position.service.ts` | All business rules, Prisma access, uniqueness and delete guards |
| `backend/src/modules/positions/position.service.spec.ts` | Unit tests against a mocked `PrismaService` |
| `backend/src/modules/positions/position.constants.ts` | Lengths, code pattern, sortable columns, default sort |
| `backend/src/modules/positions/dto/create-position.dto.ts` | `POST` body |
| `backend/src/modules/positions/dto/create-position.dto.spec.ts` | Validation and transform tests |
| `backend/src/modules/positions/dto/update-position.dto.ts` | `PATCH` body, every field optional |
| `backend/src/modules/positions/dto/update-position.dto.spec.ts` | Tests for what differs from creation |
| `backend/src/modules/positions/dto/position-query.dto.ts` | `GET` query — extends `SortQueryDto` |
| `backend/src/modules/positions/dto/position-query.dto.spec.ts` | Defaults, sorting, search, rejections |
| `backend/src/modules/positions/dto/position-field.decorators.ts` | Per-field constraints shared by the create and update DTOs |
| `backend/src/modules/positions/entities/position.entity.ts` | `PositionEntity` and the row → resource mapper |
| `FEATURES/008-positions-module.md` | This document |

## Files Modified

| File | Change |
| --- | --- |
| `backend/src/app.module.ts` | Imports `PositionModule` |
| `backend/src/modules/departments/dto/department-query.dto.ts` | Extends `SortQueryDto` instead of `PaginationQueryDto`; `sortOrder` removed as now inherited — see [Feature 007](007-departments-module.md) |
| `backend/test/app.e2e-spec.ts` | A `positions` block of three database-free cases |
| `FEATURES/HISTORY.md` | Feature 008 row |
| `FEATURES/README.md` | Feature 008 row |

Untouched, as required: `schema.prisma`, the migrations, `prisma/seed*`,
`docker-compose.yml`, `.env*`, and every other file under `src/common`.

## Notes

- **The seed already provides eight positions**, via
  `prisma/seeds/positions.seed.ts`: `MGR`, `TL`, `BA`, `HR-SPEC`, `DEV`,
  `SUP-ENG`, `TECHN`, `INTERN`. Every one satisfies this module's validation
  unchanged — each code matches `POSITION_CODE_PATTERN` (including the hyphens
  in `HR-SPEC` and `SUP-ENG`), and no name or description exceeds its limit — so
  `GET /api/v1/positions` returns a populated first page against a seeded
  database with no seeder change. The seeder upserts on `code`, which is the same
  unique key this module's duplicate check defends.
- The seed comment on `positions.seed.ts` is worth reading before extending this
  module: a position is *what a person does*, never how senior they are.
  Seniority is a separate axis on `Employee.seniority`, which is why there is one
  `DEV` row rather than one per level.
- No `PrismaExceptionFilter`, for the same reason Feature 007 gave: the service
  checks uniqueness and existence explicitly, so `P2002` and `P2025` are
  unreachable through the endpoints except in the narrow races described above.
- No `isActive` filter on the list endpoint. It is an obvious next parameter and
  now wanted by two resources, which is exactly the evidence that would justify
  a shared `FilterQueryDto` — but adding it speculatively would be one more
  thing to keep and test without a caller.
- An empty `PATCH` body is accepted and returns the position unchanged — with a
  refreshed `updatedAt`, since Prisma's `@updatedAt` fires on any `update`.
- `code` is upper-cased silently rather than rejected when lowercase. That is a
  deliberate normalisation, not leniency: it makes the unique index
  authoritative. A client that echoes the request body back to the user should
  read `code` from the response.
- `Position.isActive` and `Department.isActive` are both `Boolean @default(true)`
  *without* an `@map`, unlike `Employee.isActive` and `User.isActive` which map
  to `is_active`. The columns are therefore literally named `isActive` in
  PostgreSQL for these two tables. Nothing here depends on it — Prisma handles
  the naming — but it is an inconsistency worth knowing about before writing any
  raw SQL or a migration against these tables.

## Future Improvements

- **Database-backed tests.** The gap this feature widens. A suite running
  against the Compose PostgreSQL — or Testcontainers — would exercise the real
  `mode: 'insensitive'` comparison, the `_count` selection, the `$transaction`
  batch and the unique constraints, none of which a mocked client can prove.
- **Revisit the shared/local line at the third module.** This feature kept the
  field decorators, constants and query helpers module-local on the grounds that
  two resources agreeing is not yet a rule. A third CRUD module is the point at
  which to either extract `IsResourceCode(maxLength)` and friends, or accept the
  parallelism as intentional. Deciding it then, with three examples, is a better
  bet than guessing now.
- Install `@nestjs/mapped-types` and reduce both update DTOs to
  `PartialType(Create…Dto)`, retiring the two `*-field.decorators.ts` files.
  Needs user approval for the package.
- Add `?isActive=` filtering once a screen needs it, and lift the shared parts
  into a `FilterQueryDto` — now wanted by two resources.
- Replace the hard delete with a soft delete (`deletedAt`) if positions turn out
  to need archiving rather than removal. That is a schema change and a
  migration.
- Swagger annotations for the DTOs and the envelope, when Swagger arrives.
- Guard the write endpoints once authentication exists; creating or deleting a
  position is an HR/admin action, not something any authenticated user should
  do.
