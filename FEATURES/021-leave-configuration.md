# Feature 021 — Leave Configuration

**Status:** Completed
**Date:** 2026-08-04

## Goal

Configure the leave system: what kinds of leave the company recognises, and who
is notified about leave activity.

Configuration rather than data — the third of the same set as
[Feature 016](016-work-schedule-configuration.md) (which weekdays are worked) and
[Feature 017](017-public-holidays-module.md) (which of those days the company is
nevertheless closed on). This feature says which *reasons* a day may be taken
off for. None of the three records anything that happened.

Explicitly **not** included, and left to the features that own them:

- Employee leave balances
- Leave requests
- Leave approval
- Replacement employees
- The leave validation engine
- Email sending and notifications
- Authentication and authorization

## Requirements

- Two resources: leave types and notification addresses.
- Leave types: full CRUD, unique `code` and `label`, a required icon **name**
  (bounded, otherwise unconstrained), an optional HEX colour, an optional
  non-negative suggested allocation, and three booleans.
- List endpoint with pagination, case-insensitive search, three filters and four
  sort columns.
- Notification addresses: CRUD with pagination, search and sorting; unique,
  valid email.
- Reuse of the Feature 006 infrastructure: pagination DTOs and helpers, the
  global exception filter, the global response interceptor.
- No employee leave allocation is stored or performed.

A **leave policy** — a singleton row carrying a company-wide `carryOverEnabled`
flag — was specified, built, and then dropped before the migration was ever
applied. See *Why there is no leave policy*.

## Database

Two models, no enum. Both tables are new and nothing existing is touched.

### Model `LeaveType`

```prisma
model LeaveType {
  id                   String   @id @default(cuid())
  code                 String   @unique
  label                String   @unique
  icon                 String
  color                String?  @db.VarChar(7)
  description          String?
  defaultAllocatedDays Int?     @map("default_allocated_days")
  requiresApproval     Boolean  @default(true) @map("requires_approval")
  isPaid               Boolean  @default(true) @map("is_paid")
  isActive             Boolean  @default(true) @map("is_active")
  createdAt            DateTime @default(now()) @map("created_at")
  updatedAt            DateTime @updatedAt @map("updated_at")

  @@map("leave_types")
}
```

A kind of leave an employee can take. Field by field:

| Field | Why it is shaped this way |
| --- | --- |
| `code` | The natural key an export, an integration or a URL quotes (`ANNUAL`). Unique. |
| `label` | What a person reads on a form ("Annual Leave"). Unique too — two rows sharing one would be indistinguishable on every screen that lists them. |
| `icon` | The **name** of an icon, never the icon. See *Why the icon stores a name*. |
| `color` | UI accent, `varchar(7)` because `#RRGGBB` is exactly seven characters — the same call `projects.color` makes, so the format is a property of the column and not only of the API. |
| `description` | Optional prose. Nullable; blank collapses to `null` so the column has one value meaning "empty". |
| `defaultAllocatedDays` | A **suggestion**, nullable. See *The purpose of `defaultAllocatedDays`*. |
| `requiresApproval` | Defaulted `true`: approval is the norm (annual leave is agreed in advance), and the exception is deliberate (medical leave is notified, not requested). |
| `isPaid` | Defaulted `true` for the same reason: unpaid leave is the exception that has to be stated. |
| `isActive` | Retires a type without deleting it, so leave already recorded against it keeps its meaning. A separate axis from the other two booleans. |

Two unique constraints and no other index: this table holds the kinds of leave a
company recognises — a handful of rows — which PostgreSQL sequential-scans faster
than it would descend an index.

**No relation to anything.** A leave type stands on its own. Leave Requests and
Leave Balances will point at it, but neither foreign key exists yet, and
inventing one now would be guessing at their shape.

### Model `LeaveNotificationEmail`

```prisma
model LeaveNotificationEmail {
  id        String   @id @default(cuid())
  email     String   @unique
  createdAt DateTime @default(now()) @map("created_at")
  updatedAt DateTime @updatedAt @map("updated_at")

  @@map("leave_notification_emails")
}
```

An address notified when leave activity needs attention. A table rather than an
array column, for the reason `TimesheetApprovalEmail` is one: each address is
addressable on its own, so `DELETE /leave-notification-emails/:id` removes one
without rewriting the rest, and `email` gets a unique index an array could not
have.

Two differences from `TimesheetApprovalEmail`, both deliberate:

- **No foreign key.** That list hangs off `WorkSchedule` by a required key and
  cannot exist without it. This one stands on its own: there is no leave
  configuration row for it to belong to — the list *is* the configuration.
- **`updatedAt` exists**, because this collection supports `PATCH`: correcting a
  typo in an address is an edit, not a delete followed by an insert.

### Migration

`backend/prisma/migrations/20260804180000_add_leave_configuration/migration.sql`

Purely additive — two `CREATE TABLE`s and three unique indexes, no `ALTER`, no
`DROP` — so it is safe to apply to a populated database and no existing data is
touched or lost. Nothing is back-filled, and in particular **no leave is
allocated to anybody**: these tables describe what leave *is*.

The migration contains a comment where a third table used to be, recording that
`leave_policies` was removed and why, so the absence reads as a decision rather
than an oversight. The table was taken out of this migration in place rather
than dropped by a follow-up one, because the migration had never been applied to
any database — there was nothing to undo, and a `CREATE` followed later by a
`DROP` would leave two files describing a table that never existed.

`prisma generate` has been run; the client in `backend/src/generated/prisma`
carries `LeaveType` and `LeaveNotificationEmail`.

The migration is **not applied automatically**. The command, awaiting approval:

```bash
cd backend && npx prisma migrate deploy   # applies the checked-in SQL as-is
```

## Backend

### Structure added

```text
backend/src/modules/leave-configuration/
├── leave-configuration.module.ts
├── leave-types.controller.ts
├── leave-types.service.ts
├── leave-types.service.spec.ts
├── leave-notification-emails.controller.ts
├── leave-notification-emails.service.ts
├── leave-notification-emails.service.spec.ts
├── leave-types/
│   ├── leave-type.constants.ts
│   ├── dto/
│   │   ├── create-leave-type.dto.ts
│   │   ├── create-leave-type.dto.spec.ts
│   │   ├── update-leave-type.dto.ts
│   │   ├── update-leave-type.dto.spec.ts
│   │   ├── leave-type-query.dto.ts
│   │   ├── leave-type-query.dto.spec.ts
│   │   └── leave-type-field.decorators.ts
│   └── entities/
│       └── leave-type.entity.ts
└── leave-notification-emails/
    ├── leave-notification-email.constants.ts
    ├── dto/
    │   ├── create-leave-notification-email.dto.ts
    │   ├── update-leave-notification-email.dto.ts
    │   └── leave-notification-email-query.dto.ts
    └── entities/
        └── leave-notification-email.entity.ts
```

**One module, two resources, two services.** They are together because they
configure one thing — how leave works here — and apart from each other because
they answer different questions. Two services keeps each one small and single
purpose, which is what `WorkScheduleService` gave up when it took both the
schedule and its addresses; two *modules* would instead have split a feature an
administrator experiences as one screen.

The controllers and services sit at the module root and each resource keeps its
DTOs, entity and constants in a folder of its own, which is the layout the
feature asked for. Within each folder the layout is the one every module since
Feature 007 uses, including the `*-field.decorators.ts` split: **constraints**
live in the shared decorators, **optionality** stays on each DTO, because
`@IsOptional()` versus `@ValidateIfPresent()` is what distinguishes create from
patch and has to be readable on the class it applies to.

**Nothing new was added to `src/common`.** Every shared piece this module needed
already existed — `PaginationQueryDto`, `SortQueryDto`, `toSkipTake`,
`buildPaginatedResult`, `toIsoTimestamp`, `@Trim()`, `@ToBoolean()`,
`@ValidateIfPresent()`, `@IsEmailAddress()` — which is the payoff of Features 006
and 016 and the reason this module is mostly rules rather than plumbing. In
particular `@IsEmailAddress()`, which Feature 016 lifted out of the users module,
is reused verbatim rather than a third copy of the trim/lower-case/validate
sequence being written.

### Every created file

| File | What it holds |
| --- | --- |
| `leave-configuration.module.ts` | The feature module: two controllers, two providers, both services exported |
| `leave-types.controller.ts` | The five leave-type routes, each a one-line delegation |
| `leave-types.service.ts` | Every leave-type rule: the duplicate check, existence, the `where`, the ordering |
| `leave-types/leave-type.constants.ts` | Lengths (icon included), the code and colour patterns, the allocation bounds, the sortable columns and the default |
| `leave-types/dto/create-leave-type.dto.ts` | `POST` body — `code`, `label`, `icon` required |
| `leave-types/dto/update-leave-type.dto.ts` | `PATCH` body — every field optional, three of them nullable |
| `leave-types/dto/leave-type-query.dto.ts` | `GET` query string — search, three filters, four sort columns |
| `leave-types/dto/leave-type-field.decorators.ts` | Per-field constraints shared by the two body DTOs |
| `leave-types/entities/leave-type.entity.ts` | The published resource, the `select`, the row type and the mapper |
| `leave-notification-emails.controller.ts` | The four address routes |
| `leave-notification-emails.service.ts` | The duplicate rule, existence, the search `where` and the ordering |
| `leave-notification-emails/leave-notification-email.constants.ts` | The search bound, the sortable columns and the default |
| `leave-notification-emails/dto/create-leave-notification-email.dto.ts` | `POST` body — one field |
| `leave-notification-emails/dto/update-leave-notification-email.dto.ts` | `PATCH` body — one optional field |
| `leave-notification-emails/dto/leave-notification-email-query.dto.ts` | `GET` query string — search and sorting |
| `leave-notification-emails/entities/leave-notification-email.entity.ts` | The published resource, the `select`, the row type and the mapper |

Every query uses Prisma `select`, never `include`. Neither table has a relation
today, which is exactly why the habit is worth keeping: the first one added —
when leave requests arrive — must not appear in a payload by default.

### Why there is no leave policy

This feature was specified with a third resource: a `LeavePolicy` singleton
carrying one company-wide flag, `carryOverEnabled`, exposed at
`GET`/`PATCH /api/v1/leave-policy`. It was built as specified — model, migration
table, service, controller, DTO, entity and tests — and then removed before the
migration had been applied to any database.

**The reason is where leave is actually decided.** HR sets each employee's days
at the start of the year, one person at a time, against their contract, their
seniority and what they carried over. That is the moment the number is fixed, and
it is fixed *per employee*. A company-wide switch sitting beside it could not
decide anything the per-employee grant does not already decide:

- If HR enters the days including whatever was carried over, the flag has already
  been applied by hand before any code reads it.
- If HR enters the days without it, a global flag cannot know how many days to
  add for a person whose entitlement, absences and start date it has never seen.

Either way the flag is a second statement of a fact the balance already holds,
free to disagree with it — and the direction that disagreement resolves in would
be decided by whichever query happened to be written first. **A flag nobody reads
is a flag that eventually contradicts the data.**

The singleton machinery was sound in itself: a constant primary-key default
making "only one row" a database guarantee rather than a service promise, one
`upsert` reached by both endpoints, no `POST` and no `DELETE`. That pattern
remains in use on `WorkSchedule`, where it earns its place — the working schedule
really is one fact about the whole company, read identically for every employee.
Carry-over is not that kind of fact.

**Where the rule goes instead.** If carry-over needs rules — a cap, an expiry
date, a per-department exception — they belong to the Leave Balances feature,
next to the balances they would apply to and with the per-employee, per-year
grain that makes them answerable. Adding a column there is a smaller change than
reconciling a global flag with a table that disagrees with it.

### Why the icon stores a name

`icon` holds `umbrella-beach` — the **name** of an icon, not the icon.

- **A picture in a column is a picture no consumer can use.** The web app, a
  native client and a PDF export each need their own drawing of the same idea,
  and only the consumer knows which icon set it ships. Storing the name lets each
  of them resolve it; storing an SVG serves one of them and blocks the rest.
- **It keeps the row small and diffable.** A name is a key; a sprite is a
  payload, and a payload in a `text` column is one nobody can index, compare or
  read in a database console.

**The API does not constrain the spelling, and that is deliberate.** The
validation is: required, string, trimmed, non-empty, at most 50 characters. There
is no pattern and no case folding.

An earlier draft of this feature matched `icon` against
`/^[a-z0-9]+(-[a-z0-9]+)*$/` and lower-cased it. That was dropped, because icon
sets do not agree on a spelling: one publishes `umbrella-beach`, another
`umbrellaBeach`, a third `ph:umbrella-beach`. A pattern narrow enough to be worth
writing would reject whichever set the frontend actually ships, and lower-casing
would quietly turn a camelCase key into one that resolves to nothing — a broken
glyph with no error anywhere to explain it. The vocabulary belongs to the
frontend, so the name a client sends is the name it gets back.

What is left doing the work is the **length**: 50 characters hold any icon name
in use and nothing that could be mistaken for a sprite sheet. `umbrella-beach`,
`hospital`, `baby`, `graduation-cap`, `wallet` and `briefcase` are examples in
this document, not an enum in the code — the set of icons is the frontend's to
grow, and pinning it here would mean a deployment every time a designer adds one.

### The purpose of `defaultAllocatedDays`

The number HR is **suggested** when it creates an employee's annual balance for
this leave type. Annual Leave carries `21`; medical leave carries nothing.

**Nothing is allocated by this column.** It is a default a future form will be
pre-filled with, not an entitlement, and nothing in this feature writes it
anywhere else. Changing it moves the suggestion and cannot alter what an employee
has already been granted.

It is **nullable, and `null` is not `0`**. `0` says "this type suggests no days";
`null` says "this type makes no suggestion", which is what medical leave granted
against a certificate does. Collapsing the two would make an unanswered question
look like an answer of zero.

### Why employee leave allocations are not stored here

Entitlement is **per employee and per year**; a leave type is neither.

What an employee is actually granted depends on facts this table does not hold
and should not: seniority, contract terms, the hire date they started part-way
through the year on, days carried over from last year, days already taken, an
exception HR agreed to once. A number on the *type* cannot express any of them —
it is one value for everybody.

The distinction is also what protects history. If the type carried the
allocation, then correcting `21` to `22` next year would silently restate what
everybody was given in every previous year, and there would be no record that
last year's grant was 21. A balance row per employee per year records what was
actually granted, when, and by whom; the suggestion on the type is only where the
form starts.

So this feature stores the suggestion and stops. `Employee.maxVacationDays`
already exists from Feature 010 and is untouched — reconciling it with the
balances table is the Leave Balances feature's decision to make, with the
migration that goes with it, and pre-empting it here would be guessing at a shape
nobody has designed.

### Duplicate protection

| Resource | Rejected when | Status |
| --- | --- | --- |
| Leave type | another row has the same `code`, case-insensitively | `409` |
| Leave type | another row has the same `label`, case-insensitively | `409` |
| Notification email | another row has the same `email`, case-insensitively | `409` |

Every check runs **before** the write, so the answer is a `409` naming the value
rather than the driver's unique-violation surfacing as a `500`. Each runs on
create *and* on patch, and on patch the row's own id is excluded so re-sending
what it already holds is not a conflict with itself — re-submitting an unedited
form is not an error.

The leave-type check reads both fields in **one query** and reports both problems
at once, as an array — the same shape the `ValidationPipe` produces — so a form
can mark each offending input instead of discovering the second problem only
after fixing the first.

Comparison is case-insensitive on all three, because `Annual Leave` and
`annual leave` are one leave type to a human and `HR@company.com` and
`hr@company.com` are one mailbox to every mail server, while PostgreSQL's unique
indexes see two rows each.

**The database indexes still back every check**, for the exact-case race between
the read and the write. The DTOs close the rest of the gap by normalising first:
`code` is upper-cased and `email` is lower-cased before either the check or the
insert sees them, so for those two a case-variant race cannot arise. `label`
preserves the case a person typed — it is prose, with diacritics — so a
simultaneous `Annual Leave` / `annual leave` pair could in principle slip past
both; closing that needs a `citext` column or a functional index, which is a
schema change and out of scope here. It is the same position every module since
Feature 007 is in, documented in the same place.

### Validation rules

Shape is the DTOs' job, run by the global `ValidationPipe`
(`whitelist`, `forbidNonWhitelisted`, `transform`).

#### Leave type

| Field | Create | Patch | Rule |
| --- | --- | --- | --- |
| `code` | required | optional | trimmed, **upper-cased**, non-empty, ≤ 20, `^[A-Z0-9]+([-_][A-Z0-9]+)*$`. Unique (service) |
| `label` | required | optional | trimmed, non-empty, ≤ 100. Case and diacritics preserved. Unique (service) |
| `icon` | required | optional | trimmed, non-empty, ≤ 50. No pattern, no case folding — stored exactly as typed |
| `color` | optional, nullable | optional, nullable | trimmed, **upper-cased**, `^#[0-9A-F]{6}$`; blank collapses to `null` |
| `description` | optional, nullable | optional, nullable | trimmed, ≤ 500; blank collapses to `null` |
| `defaultAllocatedDays` | optional, nullable | optional, nullable | integer, ≥ 0, ≤ 366 |
| `requiresApproval` | optional | optional | boolean; `null` is a `400` |
| `isPaid` | optional | optional | boolean; `null` is a `400` |
| `isActive` | optional | optional | boolean; `null` is a `400` |

- **Upper-casing `code` is normalisation, not cosmetics.** PostgreSQL's unique
  index is case-sensitive, so without it `annual` and `ANNUAL` would be two leave
  types as far as the database is concerned. Folding at the edge is what makes
  that index the real guarantee.
- **`defaultAllocatedDays` is `@IsInt()`, not coerced.** This arrives in a JSON
  body, where `21` and `"21"` are genuinely different values; coercing the string
  would accept a payload the client should fix. `21.5` is rejected too — the
  `integer` column would silently truncate it. The `0` minimum is the rule the
  feature states; the `366` maximum is a calendar year, and it exists so a typo
  is a `400` naming the field rather than a value past 2^31-1 that the driver
  rejects as a `500`.
- **`color` accepts one spelling**: `#RRGGBB`. Not `#FFF`, not `red`, not
  `rgb(…)`. One stored format means every consumer parses it the same way, and it
  is what the `varchar(7)` is sized for.
- **`@ValidateIfPresent()` on every non-nullable field in the patch DTO.**
  `@IsOptional()` also skips its constraints for `null`, which would let a `null`
  reach a `NOT NULL` column and surface as a `500` where the client deserved a
  `400`. The three nullable columns keep `@IsOptional()`, because there `null` is
  a real request: "clear it".

#### Notification email

| Field | Create | Patch | Rule |
| --- | --- | --- | --- |
| `email` | required | optional | `@IsEmailAddress()` — trimmed, **lower-cased**, non-empty, RFC-valid, ≤ 254. Unique (service) |

`null` is rejected: the column is `NOT NULL`, and an address is removed with
`DELETE`, the endpoint that means it. The `PATCH` body may be empty, which
returns the row unchanged.

Unknown properties never reach any DTO: a typo in a payload or an unexpected
query parameter is a `400` rather than a silently ignored field.

## API

Base paths `/api/v1/leave-types` and `/api/v1/leave-notification-emails`. The
prefix and version come from `configureApp`; every response is wrapped by the
global interceptor and every failure rendered by the global filter, so **no
controller method builds a response**. Every method is a one-line delegation.

`id` is taken as a plain string everywhere: ids are cuids, so `ParseUUIDPipe`
would reject valid ones, and a malformed id matches no row and yields the same
`404` as an id that never existed.

### Leave types

| Method | Path | Success | Body / Query |
| --- | --- | --- | --- |
| `GET` | `/leave-types` | 200 | pagination, search, filters, sorting |
| `GET` | `/leave-types/:id` | 200 | — |
| `POST` | `/leave-types` | 201 | `CreateLeaveTypeDto` |
| `PATCH` | `/leave-types/:id` | 200 | `UpdateLeaveTypeDto` |
| `DELETE` | `/leave-types/:id` | 200, `data: null` | — |

Errors: `400` for a rejected body or query, `404` for an unknown id, `409` for
either duplicate rule.

```http
GET /api/v1/leave-types?search=annual&isActive=true&sortBy=label&page=1&limit=20
```

```json
{
  "success": true,
  "data": {
    "items": [
      {
        "id": "clx…",
        "code": "ANNUAL",
        "label": "Annual Leave",
        "icon": "umbrella-beach",
        "color": "#3B82F6",
        "description": "Paid days off agreed in advance.",
        "defaultAllocatedDays": 21,
        "requiresApproval": true,
        "isPaid": true,
        "isActive": true,
        "createdAt": "2026-08-04T10:00:00.000Z",
        "updatedAt": "2026-08-04T10:00:00.000Z"
      }
    ],
    "meta": {
      "page": 1, "limit": 20, "total": 1, "totalPages": 1,
      "hasPreviousPage": false, "hasNextPage": false
    }
  }
}
```

`POST` with the three required fields:

```json
{ "code": "MEDICAL", "label": "Medical Leave", "icon": "hospital",
  "requiresApproval": false }
```

`DELETE` is a **hard delete**, and existence is verified first so an unknown id
is a `404` naming it rather than Prisma's `P2025` surfacing as a `500`. Nothing
refers to a leave type yet, so there is no history to protect and no count to
guard the delete with — unlike `DepartmentService.remove`, which refuses to
delete a department that still has employees.

**That changes when leave requests arrive.** A type somebody has taken leave
under is the reason those days were not worked, and deleting it would strip that
reason from a record of the past. The guard belongs to the feature that creates
the relation, where it can count the rows it introduced; adding a count against a
table that does not exist would be a guess at its shape. In the meantime
`PATCH { "isActive": false }` is what retires a type, and it is what an
administrator should reach for — `DELETE` is for a row entered by mistake.

### Notification emails

| Method | Path | Success | Body / Query |
| --- | --- | --- | --- |
| `GET` | `/leave-notification-emails` | 200 | pagination, search, sorting |
| `POST` | `/leave-notification-emails` | 201 | `CreateLeaveNotificationEmailDto` |
| `PATCH` | `/leave-notification-emails/:id` | 200 | `UpdateLeaveNotificationEmailDto` |
| `DELETE` | `/leave-notification-emails/:id` | 200, `data: null` | — |

There is no `GET /:id`, which is the endpoint set the feature specified. The
resource has one field beyond its timestamps and the list returns all of it, so a
single-row read would be a second way to obtain what the caller already has.

A **top-level** collection, where `/work-schedule/emails` is a sub-resource. The
difference is what the two lists belong to: that one hangs off the schedule by a
required foreign key and cannot exist without it, while this one stands on its
own — there is no leave configuration row for it to be nested under, because this
list *is* the configuration. Nesting it would put a scope in the path that no
column enforces.

It is **paginated**, where `/work-schedule/emails` returns a plain array. That
collection is a sub-resource of a singleton holding a handful of addresses; this
one is a top-level resource with no ceiling on how many addresses a company ends
up notifying, and Feature 006's envelope is what every top-level list endpoint
returns.

`DELETE` is a hard delete: an address is a routing rule, not a record of anything
that happened, so nothing refers back to it and removing it rewrites no history.

### Searching, filtering, sorting and pagination

**Pagination** is Feature 006's, unchanged and not restated: both query DTOs
extend `SortQueryDto`, which extends `PaginationQueryDto`, so `?page=` (default
1) and `?limit=` (default 20, capped) behave exactly as they do on every other
list endpoint, and the response carries the same `meta`. `toSkipTake` does the
`(page - 1) * limit` arithmetic in one tested place.

In both services the rows and the total are read in a **single `$transaction`**,
so both see the same snapshot: run separately, a concurrent insert between them
would produce a `total` that does not describe the page just returned. The two
share one `where` object for the same reason.

**Searching** is a case-insensitive substring (`contains` + `mode: 'insensitive'`),
bounded at 100 characters so a huge term cannot be pushed into a `LIKE` scan.
Absent and empty are the same thing — an empty term matches every row, which is
what the endpoint already does without it.

| Endpoint | `?search=` matches |
| --- | --- |
| `/leave-types` | `code`, `label` |
| `/leave-notification-emails` | `email` |

`description` is deliberately not searched: it is prose about the leave type, and
matching it would make a search for "leave" return everything that merely
mentions it.

**Filtering** — leave types only:

| Parameter | Values | Effect |
| --- | --- | --- |
| `?isActive=` | `true`, `false` | exact |
| `?requiresApproval=` | `true`, `false` | exact |
| `?isPaid=` | `true`, `false` | exact |

All three combine with `AND` and with `?search=`: `?isPaid=false` narrows
whatever the search matched rather than replacing it. Omitting one means "do not
filter" — in particular, omitting `isActive` lists retired types alongside
available ones, because hiding them by default would be a policy the caller
cannot see or turn off, and this endpoint is the screen an administrator
maintains them on. `false` is a filter, not an absence; only `undefined` skips.

Query parameters are text, so `@ToBoolean()` converts the two exact spellings and
passes anything else through to `@IsBoolean()` — `?isPaid=yes` is a `400` naming
the field rather than a filter the caller did not ask for.

`/leave-notification-emails` has no filter parameter: the resource has one field
beyond its timestamps and `?search=` already narrows on it.

**Sorting** — `?sortBy=` against a closed list, because the value reaches Prisma's
`orderBy` key; `?sortOrder=` accepts `asc` (default) and `desc`.

| Endpoint | `?sortBy=` | Default |
| --- | --- | --- |
| `/leave-types` | `code`, `label`, `defaultAllocatedDays`, `createdAt` | `label` |
| `/leave-notification-emails` | `email`, `createdAt` | `email` |

Both defaults are **unique columns**, which is the point: the order is total, so
a record can never shift between two pages of the same listing — and both are
lists a person scans alphabetically rather than in the order somebody happened to
add rows.

Every ordering is tie-broken by `id`. That is what makes pagination safe:
`createdAt` is not unique, and `defaultAllocatedDays` is neither unique nor even
always present, so without the tie-break two rows sharing a value could come back
in a different relative order on each query — letting a record repeat on one page
and vanish from the next.

The three booleans are filterable but not sortable: ordering a list by a
two-valued column groups it rather than sorts it, which `?isPaid=` already does,
and better.

## Frontend

No change — the frontend directory is still empty. When it is built, this feature
is one settings screen with two sections: a table of leave types (the icon name
resolved against whichever icon set the app ships, the colour as a swatch) and a
list of notification addresses.
`PaginationMeta` maps onto the pagination component as it does for every other
list.

## Testing

Unit tests, all new, extending the existing Jest setup — no new framework, no new
configuration. 103 tests across 5 new specs; the full suite is 1058 tests, all
passing.

| Spec | Covers |
| --- | --- |
| `leave-types.service.spec.ts` | the mapped page and its metadata, skip/take, ordering and the id tie-break, case-insensitive search across both columns, filter combination, `false` treated as a filter, the shared `where` for rows and count; 404s on read, patch and delete; the duplicate check on both fields, both conflicts reported together, case-insensitive comparison, the check skipped when neither unique field is sent, `excludeId` on patch, `null` reaching the nullable columns |
| `leave-notification-emails.service.spec.ts` | the mapped page, search, the shared `where`, ordering; create and the duplicate `409`; patch reporting a missing id before a conflict, excluding itself, rejecting another row's address, and leaving the row alone on an empty body; delete and its 404 |
| `create-leave-type.dto.spec.ts` | required fields, code upper-cased, icon trimmed with its case kept, blank colour and description → `null`, icon names in every convention (kebab, camel, prefixed) accepted unchanged, and the rejections — a blank or over-long or non-string icon, bad colours, negative/fractional/oversized/string allocations, bad codes, unknown properties, lengths |
| `update-leave-type.dto.spec.ts` | the empty body, single-field patches, the same normalisation as create, `null` accepted on the three nullable columns and rejected on the six that are not |
| `leave-type-query.dto.spec.ts` | inherited defaults, the module's own default sort field, every sortable column accepted and unsortable ones rejected, boolean coercion of all three filters, the rejected spellings, unstated filters left `undefined`, search trimming, unknown parameters |

Every service spec runs against a mocked `PrismaService`, the same technique the
modules before it use, so the rules are asserted without a database. Every DTO
spec runs through a real `ValidationPipe` configured exactly like the global one,
so what is asserted is the object the controller receives — transforms included.

## Files Created

| File | Purpose |
| --- | --- |
| `backend/prisma/migrations/20260804180000_add_leave_configuration/migration.sql` | The two tables and their unique indexes |
| `backend/src/modules/leave-configuration/leave-configuration.module.ts` | The feature module |
| `backend/src/modules/leave-configuration/leave-types.controller.ts` | Leave-type routes |
| `backend/src/modules/leave-configuration/leave-types.service.ts` | Leave-type rules |
| `backend/src/modules/leave-configuration/leave-types.service.spec.ts` | Unit tests against a mocked Prisma client |
| `backend/src/modules/leave-configuration/leave-types/leave-type.constants.ts` | Lengths, patterns, bounds, sortable columns |
| `backend/src/modules/leave-configuration/leave-types/dto/create-leave-type.dto.ts` | `POST` body |
| `backend/src/modules/leave-configuration/leave-types/dto/create-leave-type.dto.spec.ts` | Unit tests through a real `ValidationPipe` |
| `backend/src/modules/leave-configuration/leave-types/dto/update-leave-type.dto.ts` | `PATCH` body |
| `backend/src/modules/leave-configuration/leave-types/dto/update-leave-type.dto.spec.ts` | Unit tests, focused on nullability |
| `backend/src/modules/leave-configuration/leave-types/dto/leave-type-query.dto.ts` | `GET` query string |
| `backend/src/modules/leave-configuration/leave-types/dto/leave-type-query.dto.spec.ts` | Unit tests |
| `backend/src/modules/leave-configuration/leave-types/dto/leave-type-field.decorators.ts` | Per-field constraints shared by the body DTOs |
| `backend/src/modules/leave-configuration/leave-types/entities/leave-type.entity.ts` | Published resource, `select`, row type, mapper |
| `backend/src/modules/leave-configuration/leave-notification-emails.controller.ts` | Address routes |
| `backend/src/modules/leave-configuration/leave-notification-emails.service.ts` | Address rules |
| `backend/src/modules/leave-configuration/leave-notification-emails.service.spec.ts` | Unit tests against a mocked Prisma client |
| `backend/src/modules/leave-configuration/leave-notification-emails/leave-notification-email.constants.ts` | Search bound, sortable columns |
| `backend/src/modules/leave-configuration/leave-notification-emails/dto/create-leave-notification-email.dto.ts` | `POST` body |
| `backend/src/modules/leave-configuration/leave-notification-emails/dto/update-leave-notification-email.dto.ts` | `PATCH` body |
| `backend/src/modules/leave-configuration/leave-notification-emails/dto/leave-notification-email-query.dto.ts` | `GET` query string |
| `backend/src/modules/leave-configuration/leave-notification-emails/entities/leave-notification-email.entity.ts` | Published resource, `select`, row type, mapper |
| `FEATURES/021-leave-configuration.md` | This document |

## Files Modified

| File | Change |
| --- | --- |
| `backend/prisma/schema.prisma` | `LeaveType` and `LeaveNotificationEmail` models |
| `backend/src/app.module.ts` | Registers `LeaveConfigurationModule` |
| `FEATURES/HISTORY.md` | Feature 021 row |
| `FEATURES/README.md` | Feature 021 row |

## Notes

- The seed is untouched. A development set of leave types would be one company's
  policy, and seeding it would put a claim about an employer into a fixture every
  developer inherits. The API creates one in three requests.
- Both services are exported. Leave Requests will ask `LeaveTypesService` whether
  a type requires approval, and the feature that eventually sends mail will ask
  `LeaveNotificationEmailsService` where to send it — each rather than querying
  these tables itself. Neither has a purpose-built method yet: what those
  questions look like belongs to the feature that asks them, and writing one now
  would be guessing at the signature.
- `Employee.maxVacationDays` (Feature 010) is untouched and is *not* the same
  thing as `defaultAllocatedDays`. Reconciling the two — probably by moving the
  employee's number into a balance row — is the Leave Balances feature's
  decision, with the migration that goes with it. That decision is now the
  natural home for carry-over as well, since the policy that would have carried
  it no longer exists.
- No guard, no role check, no notion of who is calling, even though both
  resources are administrator-only configuration in practice. Authentication and
  authorization are later features, and half of an access check is worse than
  none: it reads as protection while providing none.
- `LEAVE_TYPE_COLOR_PATTERN` is deliberately a second copy of
  `PROJECT_COLOR_PATTERN` rather than a shared constant. Both are `#RRGGBB` by
  coincidence of taste, not by a rule either module owns, and a project accent
  and a leave-type accent should be free to diverge without one feature editing
  the other's validation.

## Future Improvements

- A delete guard on leave types, once leave requests exist: a `409` refusing to
  delete a type somebody has taken leave under, counted the way
  `DepartmentService.remove` counts employees.
- Carry-over rules — whether at all, how many days, and an expiry — as columns on
  the Leave Balances feature's own table, at the per-employee, per-year grain
  that makes them answerable. Explicitly *not* as a company-wide singleton; that
  is the shape this feature tried and removed.

  > **Delivered by [Feature 024](024-leave-balance-generation.md), in a different
  > shape than anticipated here.** The *policy* — `allowsCarryOver` and
  > `maxCarryOverDays` — went onto `LeaveType` rather than onto the balance,
  > because whether annual leave carries over and medical leave does not is true
  > of every employee at once; stating it per employee per year would be the same
  > answer copied a thousand times. What did land at the per-employee, per-year
  > grain is the *record of what happened*: `EmployeeLeaveBalance.expiredDays`,
  > which says how many days that person lost in that year. This is still not the
  > company-wide singleton this feature removed — the rule is per leave type, and
  > the outcome is per person.
- A `citext` column or a functional unique index on `leave_types.label`, if the
  case-variant race the duplicate check cannot close ever becomes real rather
  than theoretical.
- Per-department or per-position leave types, if the company ever grants
  different leave to different groups. That is a scope column and a filter on the
  list, not a second table.
