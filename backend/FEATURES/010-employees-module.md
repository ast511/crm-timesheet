# Feature 010 — Employees Module

**Status:** Completed
**Date:** 2026-08-03

## Goal

A complete CRUD resource at `/api/v1/employees`, built on the infrastructure
from [Feature 006](006-shared-backend-infrastructure.md) and following the
architecture [Feature 007](007-departments-module.md) established and Features
[008](008-positions-module.md) and [009](009-users-module.md) confirmed.

An employee is the person: a name, a hire date, a seniority, an employment
status, and — the part that makes this module different — three required
relations to a `User`, a `Department` and a `Position`.

This module manages employees and nothing else. Projects, project memberships,
vacations, holidays and time entries are later features.

Three things make it more than a fourth copy of the same CRUD shape, and they
are what most of this document is about:

1. It is the first module whose rows **point at** other tables, so a write has
   to confirm that what it references actually exists.
2. It is the first whose responses **embed** other resources, so the question
   "which fields of a user may an employee publish?" had to be answered.
3. `Employee.userId` is **unique**, so an account belongs to exactly one
   employee — a rule the API states before the database has to.

## Requirements

- Full CRUD over the existing `Employee` model, **no schema change, no
  migration**.
- List endpoint with pagination, case-insensitive search over `employeeCode`,
  `firstName` and `lastName`, five filters and five sortable columns.
- Every response — list, read, create, update — carries the related
  `department`, `position` and `user` as nested objects rather than foreign
  keys, and never `passwordHash`.
- Referenced user, department and position confirmed to exist on every write
  that names them.
- `employeeCode` unique; a `User` linked to at most one `Employee`.
- Hard delete, refused with `409` while a `ProjectMember` references the row.
- Every request validated by `class-validator` / `class-transformer`.
- Controllers thin; all rules in the service; no response formatting in either.
- Reuse `SortQueryDto`, `PaginationQueryDto`, `toSkipTake`,
  `buildPaginatedResult`, `AllExceptionsFilter`, `ResponseInterceptor`,
  `toIsoTimestamp`, `@Trim()`, `@ToBoolean()` and `SortOrder`.

## Backend

### Structure added

```text
backend/src/common/decorators/
├── validate-if-present.decorator.ts        # NEW — @ValidateIfPresent()
└── validate-if-present.decorator.spec.ts

backend/src/modules/employees/
├── employee.module.ts
├── employee.controller.ts
├── employee.controller.spec.ts
├── employee.service.ts
├── employee.service.spec.ts
├── employee.constants.ts
├── dto/
│   ├── create-employee.dto.ts
│   ├── create-employee.dto.spec.ts
│   ├── update-employee.dto.ts
│   ├── update-employee.dto.spec.ts
│   ├── employee-query.dto.ts
│   ├── employee-query.dto.spec.ts
│   └── employee-field.decorators.ts
└── entities/
    └── employee.entity.ts
```

The layout Feature 007 introduced, unchanged: the folder is `employees/` (the
resource, plural) while the files inside are `employee.*` (the thing, singular).

### File by file

| File | What it is |
| --- | --- |
| `employee.module.ts` | Wires `EmployeeController` and `EmployeeService`, imports `UserModule`, `DepartmentModule` and `PositionModule`, exports the service. Does not import `PrismaModule`, which is `@Global`. |
| `employee.controller.ts` | The five routes, one line each. No guards — see below. |
| `employee.service.ts` | Every rule: pagination, search, filtering, relation validation, duplicate protection, delete protection, and the row → resource mapping. |
| `employee.constants.ts` | Field lengths, the code pattern, the vacation bounds, `EMPLOYEE_SORT_FIELDS`, `DEFAULT_EMPLOYEE_SORT_FIELD`. |
| `dto/create-employee.dto.ts` | `POST` body: nine required fields, three optional. |
| `dto/update-employee.dto.ts` | `PATCH` body: all twelve optional; `null` accepted only for `phone`. |
| `dto/employee-query.dto.ts` | `GET` query: extends `SortQueryDto`, adds `search`, five filters and `sortBy`. |
| `dto/employee-field.decorators.ts` | Per-field constraints shared by the create and update DTOs. |
| `entities/employee.entity.ts` | `EmployeeEntity`, the three nested summary types, `EMPLOYEE_PUBLIC_SELECT`, `EmployeeWithRelationsRow` and the mapper. The response contract. |
| `common/decorators/validate-if-present.decorator.ts` | `@ValidateIfPresent()` — the one thing that moved into `src/common`. |

### The endpoints

Five, all under `/api/v1/employees`, all unauthenticated (see the warning at the
end of this section).

| Endpoint | What the service does |
| --- | --- |
| `GET /employees` | Builds a `WHERE` from `search` and the five filters, an `ORDER BY` from `sortBy`/`sortOrder` plus an `id` tie-break, and reads the page and the total in one `$transaction`. Returns `{ items, meta }`. |
| `GET /employees/:id` | One `findUnique` through `EMPLOYEE_PUBLIC_SELECT`. `404` if there is no such row. |
| `POST /employees` | Confirms the three referenced rows exist and the user is free (`400` / `409`), then that `employeeCode` is not taken (`409`), then inserts. Answers `201` with the created resource, relations included. |
| `PATCH /employees/:id` | Confirms the employee exists (`404`), re-runs the relation checks for whichever ids the body carries, re-checks `employeeCode` if it changed, then updates. Omitted fields are left alone. |
| `DELETE /employees/:id` | Confirms the employee exists (`404`) and that no `ProjectMember` references it (`409`), then hard-deletes. Answers `200` with `data: null`. |

### Validation rules

Every field, with the rule and where it comes from:

| Field | Create | Patch | Rules |
| --- | --- | --- | --- |
| `employeeCode` | required | optional | string, trimmed, **upper-cased**, non-empty, ≤ 20, matches `^[A-Z0-9]+([-_][A-Z0-9]+)*$` |
| `firstName` | required | optional | string, trimmed, non-empty, ≤ 100 |
| `lastName` | required | optional | string, trimmed, non-empty, ≤ 100 |
| `phone` | optional | optional | string, trimmed, ≤ 30; blank or `null` removes it |
| `hireDate` | required | optional | string, trimmed, valid ISO-8601 date or timestamp |
| `userId` | required | optional | string, trimmed, non-empty, ≤ 50 |
| `departmentId` | required | optional | string, trimmed, non-empty, ≤ 50 |
| `positionId` | required | optional | string, trimmed, non-empty, ≤ 50 |
| `seniority` | required | optional | one of `INTERN` \| `JUNIOR` \| `MID` \| `SENIOR` \| `LEAD` |
| `status` | required | optional | one of `ACTIVE` \| `INACTIVE` \| `ON_LEAVE` \| `SUSPENDED` \| `TERMINATED` |
| `canReplaceOthers` | optional | optional | boolean; defaults to `false` in the schema |
| `maxVacationDays` | optional | optional | integer, 1–365; defaults to `21` in the schema |

Six choices worth stating:

- **`employeeCode` is upper-cased**, exactly as departments and positions
  upper-case their `code`. PostgreSQL's unique index is case-sensitive, so
  without folding, `emp-0001` and `EMP-0001` would be two employees as far as
  the database is concerned. Folding at the edge makes that index the real
  guarantee.
- **`seniority` and `status` are required on create** because their columns have
  no default — there is no value for an omission to fall back to.
  `canReplaceOthers` and `maxVacationDays` *do* have defaults (`false`, `21`),
  which are left to the schema rather than repeated in the DTO, so each stays
  one decision made in one place.
- **Names have no character pattern.** Names carry diacritics (`Ștefan`),
  hyphens, apostrophes and spaces, and every pattern narrow enough to be worth
  writing eventually rejects somebody's real name.
- **`phone` has no format check** for the same reason: the column holds whatever
  a human typed, in whichever national convention. Normalising to E.164 is a
  decision for whenever something actually dials it.
- **`hireDate` stays a string in the DTO** and becomes a `Date` in the service.
  `@Type(() => Date)` would hand `@IsDateString()` a `Date` to reject, and
  converting first with a bare `new Date(value)` would accept `01/13/2020` — a
  format whose meaning depends on which side of the Atlantic reads it. So the
  string is validated as ISO-8601 and parsed once, on its way into Prisma.
- **`maxVacationDays` is not coerced.** This arrives in a JSON body, where `21`
  and `"21"` are genuinely different values; `@IsInt()` rejects the string
  rather than quietly accepting a payload the client should fix. The upper bound
  of 365 is a sanity check, not a policy — a year's worth of days is already past
  any entitlement anyone negotiates, and without it a typo stores a number that
  later arithmetic has to defend against.

### The one extraction: `@ValidateIfPresent()`

`@IsOptional()` skips every constraint when the value is `undefined` **or**
`null`. For a nullable column that is exactly right — `phone: null` is how a
phone number is removed. For a **required** column it is a hole:

```jsonc
// with @IsOptional(), before this decorator existed
PATCH /api/v1/employees/emp-1  { "departmentId": null }
// → constraints skipped → null reaches Prisma → driver error → 500
```

`@ValidateIfPresent()` is `@ValidateIf((_, value) => value !== undefined)`: it
runs the constraints on anything actually sent, `null` included, and skips them
only for a field the body omitted. `null` then fails the `@IsString()` behind it
and the client gets a `400` naming the field.

It lives in `src/common/decorators/` beside `@Trim()` and `@ToBoolean()` because
it is the same kind of thing — a transport concern with nothing resource-specific
in it, which every `PATCH` DTO over a required column needs.

In this module it is on every field **except `phone`**, which is the only
nullable column and therefore the only field where `null` is a value rather than
a mistake. See the Notes for the same latent issue in the three earlier modules,
which this feature deliberately did not change.

### Relationship validation

`assertRelationsExist` is the one method both `create` and `update` use. It
takes whichever of the three ids the body carries — `undefined` means "not
changing", and an unchanged relation costs no query — and does two things in
order.

**First, existence.** The three lookups run concurrently, and every missing
reference is reported at once, as a `string[]` — the same shape the
`ValidationPipe` produces — so a form can mark each offending input instead of
discovering the second problem only after fixing the first:

```json
{
  "success": false,
  "statusCode": 400,
  "message": [
    "User clx1… does not exist",
    "Department clx2… does not exist"
  ],
  "path": "/api/v1/employees",
  "timestamp": "2026-08-03T09:12:44.001Z"
}
```

A missing reference is a **`400`, not a `404`**: the employee being addressed is
fine, it is the submitted body that names something that is not there. On
`PATCH` this matters — a `404` would be read as "no such employee", which is a
different problem with a different fix.

The database would catch all three too, as a foreign-key violation surfacing as
a `500`; asking first is what turns it into a message naming the field.

**Second, the link.** `Employee.userId` is unique, so an account belongs to at
most one employee. The same query that confirmed the user exists also reports
which employee — if any — already holds it:

```text
User clx1… is already linked to employee clx9…
```

That is a `409`, not a `400`: the account exists, it is simply taken. On
`PATCH`, the employee's own id is excluded, so re-sending the `userId` it
already has is not a conflict with itself.

**Where the checks happen.** The three referenced tables are read through the
services that own them:

```ts
this.users.findEmployeeLink(userId)      // UserService
this.departments.exists(departmentId)    // DepartmentService
this.positions.exists(positionId)        // PositionService
```

This is the hand-off Features 007, 008 and 009 each wrote into their own module
— *"Employees must confirm a … exists before assigning someone to it, and should
ask this module rather than query the table itself."* Three small public methods
were added to honour it (see **Files Modified**); `UserService.findEmployeeLink`
answers both questions from one read and now backs that module's own
`remove` guard as well, so the pair of facts is derived in exactly one place.

The one thing that *does* reach those tables directly is the employee query
itself, through the nested `select` described next — composing a joined read out
of separate service calls would be one round trip per employee per relation.

### Duplicate protection

`assertEmployeeCodeIsFree` is the one query both `create` and `update` use:

- an absent code — a patch that does not touch it — skips the query entirely;
- `excludeId` adds `NOT: { id }` on update, so an employee is never a conflict
  with itself;
- the comparison is case-insensitive (`mode: 'insensitive'`), because
  `emp-0001` and `EMP-0001` are the same code to a human.

```text
An employee with code "EMP-0001" already exists
```

Unlike departments and positions, there is only **one** unique text column here,
so this returns a single message rather than the array those modules build:
there is no second field to report alongside it.

The PostgreSQL unique index still backs the check for the race between the read
and the write. The case-variant race Features 007–009 documented is closed in
practice for this column, because the DTO upper-cases before either runs.

The `userId` uniqueness described in the previous section is the module's second
duplicate protection; it is reported separately because it is about a different
table's row being taken, not about this row colliding.

### Delete protection

`DELETE` never cascades. Existence and the dependency count are read in one
query, so the common case is a single round trip and a `404` and a `409` cannot
be decided from two different snapshots:

```ts
select: { _count: { select: { projectMemberships: true } } }
```

```text
Employee clx1… cannot be deleted while 3 project membership(s) reference it
```

A `ProjectMember` row records that this person worked on that project. Deleting
it to remove a personnel record would rewrite the project's history, so the
`409` asks the caller to remove the memberships first — or to set the employee's
`status` to `TERMINATED`, which is what the enum is for. That is a decision only
a human should make.

`projectMemberships` is the only relation `Employee` is on the far side of
today. The features that add vacations and time entries will each add a line to
that `_count` and to the message.

This is the `_count` form the departments and positions modules use, not the
one-to-one `select` the users module needed — `_count` covers to-many relations,
which is what this is.

### How related entities are loaded, and why `select` rather than `include`

Every endpoint that returns an employee returns it through one constant:

```ts
export const EMPLOYEE_PUBLIC_SELECT = {
  id: true, employeeCode: true, firstName: true, lastName: true,
  phone: true, hireDate: true, seniority: true, status: true,
  canReplaceOthers: true, maxVacationDays: true,
  department: { select: { id: true, code: true, name: true } },
  position:   { select: { id: true, code: true, name: true } },
  user: {
    select: { id: true, email: true, username: true,
              role: true, isActive: true },
  },
  createdAt: true, updatedAt: true,
} as const satisfies Prisma.EmployeeSelect;
```

It is passed to `findMany`, `findUnique`, `create` and `update` alike, so the
list, the read, the creation response and the update response are the same shape
by construction rather than by four people remembering.

**Why `select` and not `include`.** `include` is the shorter spelling and it is
the wrong one here, for four reasons:

1. **It returns every column of each related row.** `include: { user: true }`
   fetches `User.passwordHash` — the one value Feature 009 built two layers of
   type machinery to keep out of the process. One convenience keyword would
   undo it, and the leak would be in the response body, not in a log.
2. **It keeps returning every column added later.** A `deletedAt`, an internal
   flag, a salary column: with `include`, a schema change publishes itself the
   day it is written. With `select`, a field appears in the API when someone
   decides it should.
3. **It does not scale down.** A client rendering a table needs a department's
   name, not its `description`, `isActive` and timestamps. Reading three full
   rows per employee, twenty employees per page, is sixty rows of columns nobody
   renders.
4. **It cannot be checked.** `satisfies Prisma.EmployeeSelect` verifies every
   key against the model, so a column renamed in `schema.prisma` breaks the
   build here rather than at runtime. There is nothing equivalent to check about
   `include: true`.

The foreign keys are deliberately **absent** from the projection: `userId`,
`departmentId` and `positionId` are replaced by the records they point at.
Nothing is lost, because each nested object carries its own `id` — which is what
a form posts back.

The nested shapes are typed as `Pick`s of the owning module's row:

```ts
export type EmployeeUserSummary =
  Pick<UserModel, 'id' | 'email' | 'username' | 'role' | 'isActive'>;
```

so the summary has no `passwordHash` for a mapper to copy, and renaming a column
in `schema.prisma` breaks the build here too. `EmployeeWithRelationsRow` is the
matching row type, which is what `toEmployeeEntity` accepts — a `select` left off
a query produces a row the mapper rejects, the same compile-time trip-wire
`PublicUserRow` gives the users module.

The user summary is deliberately **not** `UserEntity`: that resource carries
`createdAt` and `updatedAt`, which describe the account rather than the person,
and an employee payload has no use for them.

### Service

`EmployeeService` holds every rule. Five public methods, three private helpers
and three module-level functions.

**`findAll`** reads the page and the total in one `prisma.$transaction([...])`.
Run separately, a concurrent insert between them would produce a `total` that
does not describe the page just returned. The same `where` object is passed to
`findMany` and `count`; a spec asserts they match.

`buildWhere` combines the search and the five filters with `AND`, so
`?status=ACTIVE` narrows whatever `?search=` matched rather than replacing it,
and returns `undefined` — not `{}` — when nothing was requested, because
`undefined` is what both delegates read as "no filter". The two id filters are
compared exactly: they are opaque keys a client copies from a previous response,
not something anybody types, so folding their case would only make the
comparison slower.

`buildOrderBy` emits `[{ [sortBy]: order }, { id: 'asc' }]`. The tie-break makes
pagination safe: of the five sortable columns only `employeeCode` is unique, and
two people sharing a surname or a hire date could otherwise come back in a
different relative order on each query, letting a record repeat on one page and
vanish from the next.

**`update`** checks existence before anything else, so patching a missing id
reports the missing id rather than a complaint about the body. `assertExists`
selects `id` alone — the full record, with its three joins, is read by the
`update` that follows.

### Controller

Five one-line delegations, and — as with the three modules before it — `id` is
taken as a plain `string`, because ids are cuids and `ParseUUIDPipe` would reject
valid ones.

`DELETE` answers **200 with `{ "success": true, "data": null }`, not 204**, so
every endpoint returns the same envelope.

**No guards, and this is worth stating plainly:** every endpoint here is
unauthenticated. Employees are the most sensitive resource in the API so far —
names, phone numbers, hire dates, employment status — and anyone who can reach
the API can read or rewrite all of it. That is a direct consequence of the
feature boundary (authentication and authorization are later features), and half
an access check would be worse than none, because it reads as protection while
providing none. The API must not be exposed beyond local development until the
auth feature lands.

### Registration

`EmployeeModule` is added to `AppModule`'s imports under the existing
`// Business modules` comment, after the three modules it depends on. It imports
`UserModule`, `DepartmentModule` and `PositionModule` — none of which imports it
back, so the graph stays acyclic — and exports `EmployeeService`, because project
memberships, vacations and time entries all hang off an employee and will each
need to confirm one exists before recording anything against it.

## Database

No change. `schema.prisma`, the migrations and the seed are untouched, and **no
migration is required** — the module is built on the existing `Employee` model
and the `employees` table created by `20260801124229_init`.

The columns it relies on: `id`, `employee_code` (unique), `first_name`,
`last_name`, `phone` (nullable), `hire_date`, `user_id` (unique FK → `users`),
`department_id` (FK → `departments`), `position_id` (FK → `positions`),
`seniority`, `status`, `can_replace_others`, `max_vacation_days`, `created_at`,
`updated_at`, plus the `projectMemberships` back relation, which is what makes
the delete check a single query.

Two schema facts the module leans on:

- `userId` is `@unique`, which is what makes "a user belongs to one employee" a
  rule the database enforces and this module reports.
- All three relations are **required**, which is why `null` is rejected for each
  of them and why there is no "unassign" to express.

## API

Base path `/api/v1/employees`. Every response is wrapped by the global
interceptor; every failure by the global filter. **No response, on any endpoint,
contains `passwordHash` or a bare foreign key.**

| Method | Path | Success | Failures |
| --- | --- | --- | --- |
| `GET` | `/employees` | `200` | `400` invalid query parameter |
| `GET` | `/employees/:id` | `200` | `404` unknown id |
| `POST` | `/employees` | `201` | `400` invalid body or missing relation, `409` duplicate code or user already linked |
| `PATCH` | `/employees/:id` | `200` | `400` invalid body or missing relation, `404` unknown id, `409` duplicate code or user already linked |
| `DELETE` | `/employees/:id` | `200`, `data: null` | `404` unknown id, `409` project memberships reference it |

### `GET /api/v1/employees`

| Parameter | Type | Default | Rules |
| --- | --- | --- | --- |
| `page` | int | `1` | ≥ 1 (inherited) |
| `limit` | int | `20` | 1–100, above the cap is rejected, not clamped (inherited) |
| `search` | string | — | trimmed, ≤ 100 chars, case-insensitive substring of `employeeCode` **or** `firstName` **or** `lastName` |
| `departmentId` | string | — | exact match; an unknown id yields an empty page, not an error |
| `positionId` | string | — | exact match, as above |
| `seniority` | enum | — | `INTERN` \| `JUNIOR` \| `MID` \| `SENIOR` \| `LEAD` |
| `status` | enum | — | `ACTIVE` \| `INACTIVE` \| `ON_LEAVE` \| `SUSPENDED` \| `TERMINATED` |
| `canReplaceOthers` | boolean | — | exactly `true` or `false`; anything else is a `400` |
| `sortBy` | enum | `employeeCode` | `employeeCode` \| `firstName` \| `lastName` \| `hireDate` \| `createdAt` |
| `sortOrder` | enum | `asc` | `asc` \| `desc` (inherited from `SortQueryDto`) |

```http
GET /api/v1/employees?search=popescu&status=ACTIVE&sortBy=lastName&limit=2
```

```json
{
  "success": true,
  "data": {
    "items": [
      {
        "id": "clx1…",
        "employeeCode": "EMP-0001",
        "firstName": "Ion",
        "lastName": "Popescu",
        "phone": "+40 722 123 456",
        "hireDate": "2020-01-13T00:00:00.000Z",
        "seniority": "SENIOR",
        "status": "ACTIVE",
        "canReplaceOthers": true,
        "maxVacationDays": 21,
        "department": { "id": "clx2…", "code": "DEV", "name": "Development" },
        "position": { "id": "clx3…", "code": "DEV-SR", "name": "Senior Developer" },
        "user": {
          "id": "clx4…",
          "email": "ion.popescu@example.com",
          "username": "IPO",
          "role": "USER",
          "isActive": true
        },
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

`hireDate` is rendered as a full instant rather than truncated to `YYYY-MM-DD`,
because the column is a `timestamp` and the seed writes UTC midnight: printing
only the date would quietly assume a timezone this module has no way to know.

### `POST /api/v1/employees`

```json
{
  "employeeCode": "  emp-0013  ",
  "firstName": "  Ion  ",
  "lastName": "Popescu",
  "phone": "+40 722 123 456",
  "hireDate": "2020-01-13",
  "userId": "clx4…",
  "departmentId": "clx2…",
  "positionId": "clx3…",
  "seniority": "SENIOR",
  "status": "ACTIVE"
}
```

stores `employeeCode: "EMP-0013"`, `firstName: "Ion"`, `canReplaceOthers: false`,
`maxVacationDays: 21`, and answers `201` with the created resource — relations
nested, foreign keys absent.

### `PATCH /api/v1/employees/:id`

`{ "status": "ON_LEAVE" }` changes one column and leaves the rest untouched.
`{ "phone": null }` removes the phone number. `{ "departmentId": "clx9…" }`
re-validates the new department before writing. `{ "departmentId": null }` is a
`400`.

### Error bodies

```json
{
  "success": false,
  "statusCode": 400,
  "message": ["Department clx2… does not exist"],
  "path": "/api/v1/employees",
  "timestamp": "2026-08-03T09:12:44.001Z"
}
```

```json
{
  "success": false,
  "statusCode": 409,
  "message": "User clx4… is already linked to employee clx9…",
  "path": "/api/v1/employees",
  "timestamp": "2026-08-03T09:12:44.001Z"
}
```

```json
{
  "success": false,
  "statusCode": 409,
  "message": "Employee clx1… cannot be deleted while 3 project membership(s) reference it",
  "path": "/api/v1/employees/clx1…",
  "timestamp": "2026-08-03T09:13:02.114Z"
}
```

## Frontend

No change — the frontend directory is still empty. When it exists, the employees
screen is the first that needs three lookup selects (department, position,
account) and the first whose form can fail for a reason that is about a *different*
resource: the chosen account already belongs to someone.

## Testing

Jest was already configured, so tests were written rather than introduced.

| Spec | Covers |
| --- | --- |
| `employee.service.spec.ts` | `findAll` mapping, the `select` passed and the absence of `passwordHash` from it, `skip`/`take`, the tie-broken `orderBy`, the three-column insensitive search, each of the five filters alone, all six combined under `AND`, `where: undefined` with no parameters, list and count agreeing, the single transaction; `findOne` with nested relations and no foreign keys, 404; `create` happy path, each relation confirmed through its own service, the ISO date parsed into a `Date`, a missing department, all three missing references reported at once, a user already linked, a duplicate code and the insensitive comparison, and that relations are checked before the code query; `update` 404 before anything else, only the changed relations re-validated, the uniqueness query skipped when the code is untouched, `NOT: { id }`, the user it already holds accepted, another employee's user refused, `undefined` preserved for omitted fields, `null` clearing the phone, a new hire date parsed; `remove` delete, 404, 409 with the count in the message, and both answers from one read |
| `employee.controller.spec.ts` | Each route reaches the matching service method with the arguments it was given, and adds nothing on the way back |
| `create-employee.dto.spec.ts` | Through a real `ValidationPipe`: the transforms (code trim + upper-case, name trim with diacritics preserved, phone kept as typed, blank → `null`), the ISO date kept as a string, every seniority and every status accepted, each of the nine required fields missing, a malformed code, blank names and ids, two bad date formats, enum violations, a non-integer and a string entitlement, `null` for two non-nullable fields, unknown properties, both vacation bounds, and all four maximum lengths |
| `update-employee.dto.spec.ts` | Only what differs from creation: an empty body, a single field, `phone: null` and blank → `null`, the code still normalised, a new relation accepted — and ten `null`s rejected, one per non-nullable column |
| `employee-query.dto.spec.ts` | Defaults, inherited pagination, trimmed search, each sortable column, both id filters, each seniority, each status, `canReplaceOthers` in both spellings, and the rejected column / relation column / direction / enum / boolean spelling / unknown parameter |
| `validate-if-present.decorator.spec.ts` | An omitted field skipped, a sent value checked, `null` rejected, a wrong type rejected, and `@IsOptional()` left alone so a nullable field can still be cleared |

The three services that gained a method gained tests for it:
`department.service.spec.ts` and `position.service.spec.ts` each cover `exists`
true, false, and that it selects `id` alone; `user.service.spec.ts` covers
`findEmployeeLink` free, taken, no such account, and that nothing but ids is read.

`test/app.e2e-spec.ts` gained an `employees` block of five cases: the page-size
cap, an unsortable column, a status outside the enum, a creation payload
reporting all nine missing fields at once, and a zero-day entitlement on a
`PATCH`. All five are handled by the `ValidationPipe` before the handler runs, so
the suite still needs no database — which is also why the relation checks
themselves are not exercised there.

Results: `npm run typecheck` clean, `npm test` **451 passed (34 suites)**,
`npm run test:e2e` **22 passed**, `npm run build` clean, `prisma validate`
clean, `prettier --check` clean. The 158 new unit tests are additive; every
Feature 007, 008 and 009 test still passes unmodified.

**Not covered, and worth being explicit about:** no test exercises a real
PostgreSQL query. The service specs mock `PrismaService` and the three
collaborating services, so they pin the arguments handed to Prisma, not what
Prisma does with them — `mode: 'insensitive'`, the nested `select` projections
and the `$transaction` batch are checked by the compiler and by construction, not
by execution. This is the same gap Features 007–009 left, and it matters here
too: "the response carries no `passwordHash`" is guaranteed by the type system
and by a spec asserting the `select` argument, which is strong, but not the same
as observing a body over the wire against a real database.

## Files Created

| File | Purpose |
| --- | --- |
| `backend/src/common/decorators/validate-if-present.decorator.ts` | `@ValidateIfPresent()` — optional without also meaning nullable |
| `backend/src/common/decorators/validate-if-present.decorator.spec.ts` | The difference from `@IsOptional()`, pinned |
| `backend/src/modules/employees/employee.module.ts` | Wires the controller and the service; imports the three modules it validates against; exports the service |
| `backend/src/modules/employees/employee.controller.ts` | The five routes, one line each |
| `backend/src/modules/employees/employee.controller.spec.ts` | Delegation tests |
| `backend/src/modules/employees/employee.service.ts` | All business rules, Prisma access, relation validation, uniqueness and delete guards |
| `backend/src/modules/employees/employee.service.spec.ts` | Unit tests against a mocked `PrismaService` and three mocked services |
| `backend/src/modules/employees/employee.constants.ts` | Lengths, the code pattern, vacation bounds, sortable columns, default sort |
| `backend/src/modules/employees/dto/create-employee.dto.ts` | `POST` body |
| `backend/src/modules/employees/dto/create-employee.dto.spec.ts` | Validation and transform tests |
| `backend/src/modules/employees/dto/update-employee.dto.ts` | `PATCH` body, every field optional, `null` only for `phone` |
| `backend/src/modules/employees/dto/update-employee.dto.spec.ts` | Tests for what differs from creation |
| `backend/src/modules/employees/dto/employee-query.dto.ts` | `GET` query — extends `SortQueryDto`, adds five filters |
| `backend/src/modules/employees/dto/employee-field.decorators.ts` | Per-field constraints shared by the create and update DTOs |
| `backend/src/modules/employees/entities/employee.entity.ts` | `EmployeeEntity`, the nested summaries, `EMPLOYEE_PUBLIC_SELECT`, the row type, the mapper |
| `FEATURES/010-employees-module.md` | This document |

## Files Modified

| File | Change |
| --- | --- |
| `backend/src/app.module.ts` | Imports `EmployeeModule` |
| `backend/src/modules/users/user.service.ts` | Adds the exported `UserEmployeeLink` type and the public `findEmployeeLink(id)`, which `remove` now uses as well — the same pair of facts, derived once. No behaviour change to any endpoint. |
| `backend/src/modules/users/user.service.spec.ts` | Four cases for `findEmployeeLink` |
| `backend/src/modules/departments/department.service.ts` | Adds the public `exists(id)` — see [Feature 007](007-departments-module.md), which anticipated it |
| `backend/src/modules/departments/department.service.spec.ts` | Three cases for `exists` |
| `backend/src/modules/positions/position.service.ts` | Adds the public `exists(id)` — see [Feature 008](008-positions-module.md), which anticipated it |
| `backend/src/modules/positions/position.service.spec.ts` | Three cases for `exists` |
| `backend/test/app.e2e-spec.ts` | An `employees` block of five database-free cases |
| `FEATURES/HISTORY.md` | Feature 010 row |
| `FEATURES/README.md` | Feature 010 row |

Untouched, as required: `schema.prisma`, the migrations, `prisma/seed*`,
`docker-compose.yml`, `.env*`, `package.json` (no package installed), and every
endpoint of the departments, positions and users modules.

## Notes

- **The seed already provides twelve employees**, via
  `prisma/seeds/users.seed.ts`, one per seeded account — every `SeniorityLevel`
  and every `EmployeeStatus` appears at least once, so `GET /api/v1/employees`
  returns a populated first page against a seeded database with no seeder change,
  and all five filters have data to work with. **Every seeded user is already
  linked**, so `POST /employees` against seeded data hits the "already linked to
  employee" `409` unless a fresh account is created first via `POST /users`.
- Some seeded employees hold project memberships, so `DELETE` will hit the `409`
  path on those. `EMP-0009` upward are the ones to try first if you want to
  exercise a successful delete.
- **The same `@IsOptional()` hole exists in the three earlier modules** —
  `PATCH /users/:id { "role": null }`, `PATCH /departments/:id { "code": null }`
  and the equivalent on positions all skip their constraints and reach Prisma as
  `null`, producing a `500` where a `400` belongs. It is **not fixed here**:
  those are other features' documented DTOs, and changing their behaviour was not
  this feature's call. `@ValidateIfPresent()` is in `src/common` precisely so the
  fix is one decorator per field whenever that is picked up. Listed under Future
  Improvements.
- No `PrismaExceptionFilter`, for the same reason Features 007–009 gave: the
  service checks existence, uniqueness and every relation explicitly, so `P2002`,
  `P2003` and `P2025` are unreachable through the endpoints except in the narrow
  races described above.
- An empty `PATCH` body is accepted and returns the employee unchanged — with a
  refreshed `updatedAt`, since Prisma's `@updatedAt` fires on any `update`.
- `?departmentId=` with an id matching no department returns an empty page rather
  than a `400`. Filters describe what to match; an empty result is the honest
  answer to "who works in a department that does not exist". Writes are the
  opposite, because there the id becomes a stored reference.
- `status` and `User.isActive` are two different flags and neither is enforced
  yet — nothing checks either, because nothing authenticates. They become
  meaningful when the auth module refuses a token for an inactive account and
  when scheduling refuses to assign a `TERMINATED` employee.
- `canReplaceOthers` is stored and filtered on but has no behaviour attached to
  it; it belongs to the vacation-replacement flow, which is a later feature.
- Employees are ordered by `employeeCode` by default. That is the natural key,
  not the alphabetical listing a person expects — `?sortBy=lastName` is the query
  a UI should send, and the tie-break on `id` makes it safe to paginate.

## Future Improvements

- **Guard every endpoint.** The most important follow-up by a wide margin, and
  more urgent than it was for users: this endpoint publishes names, phone
  numbers, hire dates and employment status to anyone who can reach it. Reading
  should be restricted to authenticated employees, and writing to
  `SUPERADMIN`/`ADMIN`/`HR`.
- **Close the `@IsOptional()` null hole in departments, positions and users**
  with `@ValidateIfPresent()`, as described in the Notes.
- **Database-backed tests.** A suite running against the Compose PostgreSQL — or
  Testcontainers — would prove the nested `select` really omits `passwordHash`
  over the wire, and exercise the real `mode: 'insensitive'` comparison, the
  `$transaction` batch, the unique constraints and the foreign keys.
- **Sorting and filtering by related fields** — `?sortBy=department.name`,
  `?departmentCode=DEV` — which Prisma expresses through relation filters rather
  than a plain `orderBy` key, and which needs a decision about how far the query
  DTO should let a client reach.
- **A `search` that spans the full name.** `?search=ion popescu` matches nothing
  today, because the term is compared against each column separately. A
  `firstName || ' ' || lastName` functional index would fix it; that is a schema
  change.
- **Soft delete** (`deletedAt`), if personnel records turn out to need archiving
  rather than removal — which the `409` and the `TERMINATED` status together
  suggest they do. Schema change and a migration.
- An audit trail for changes to seniority, status and department, which are the
  fields a person will eventually want a history of. Schema change.
- Swagger annotations for the DTOs and the envelope, when Swagger arrives.

---

## Amended by Feature 030 — `terminationDate`

[Feature 030](030-timesheet-management.md) added one nullable column to
`Employee`. **Nothing in this document is retracted**; what follows is the
addition and the reasoning behind it.

```prisma
/// The last day the person worked here, or null while they still do.
terminationDate DateTime? @map("termination_date")
```

### Why it was needed

Feature 030 bounds a timesheet entry at `[hireDate, terminationDate ?? today]`.
Without a stored date there are only two possible rules for a leaver's final
month, and both are wrong: refuse the whole month, so the days they *did* work
cannot be accounted for, or allow the whole month, so hours can be booked weeks
after they left.

### Why it is independent of `status`

The two facts are deliberately not kept in step, and this is the part worth
reading before somebody "fixes" it:

- `status` says where a person stands **now** and is what every list filters on.
- `terminationDate` says **when** they left, which a status cannot carry.

A notice period is real. Somebody whose last day is in three weeks is `ACTIVE`
*and* has a termination date, and coupling the two would either terminate them
early or refuse to record the date. Setting one therefore does not set the other,
in either direction.

This does **not** change Feature 020's behaviour: `TERMINATED` still closes open
project memberships, still from the status *transition*, and still stamping
`leftAt` from the employee's own `updatedAt`. That write is untouched.

### API changes

| Endpoint | Change |
| --- | --- |
| `POST /api/v1/employees` | Accepts an optional `terminationDate` (ISO-8601 or `null`) |
| `PATCH /api/v1/employees/:id` | The same, and the **second nullable field**: an explicit `null` says the person is not leaving after all, which has to be undoable |
| every employee response | Carries `terminationDate: string \| null` |

One cross-field rule was added, checked in `EmployeeService` against the state a
write would leave behind: **`terminationDate` must not precede `hireDate`**. The
comparison is `<`, so a single day's contract — hired and terminated on the same
date — is allowed. A `400`, because nothing stored conflicts; the submitted span
simply contradicts itself.

### `DELETE /api/v1/employees/:id`

`timesheets` joins the four relations already counted, and is the strongest of
them: a month somebody worked is what payroll and reporting are drawn from.
`reviewedTimesheets` is deliberately **not** counted, for the same reason
`processedLeaveRequests` is not — that foreign key is `SetNull`, and counting it
would make an administrator undeletable for as long as any month they ever
reviewed exists.

### New hand-off

`EmployeeService.findEmploymentWindow(id)` returns `{ hireDate, terminationDate }`
or `null`, on the same principle as `findStatus` and `findExistingIds`: this
module owns the `employees` table, so the timesheet module asks it rather than
querying. It returns the two dates as `Date`s rather than the whole employee,
because publishing `findOne()` to a consumer would hand it three joined records it
has no business reading.

### Migration

Part of `add_timesheet_management`. The column is nullable, so no existing row
needs a value and no existing request body becomes invalid.
