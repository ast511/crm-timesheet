# Feature 011 — Projects Module

## Goal

Expose the `projects` table as a REST resource under `/api/v1/projects`, with
the same paginated listing, searching, sorting, filtering and validation the
Departments ([007](007-departments-module.md)), Positions
([008](008-positions-module.md)), Users ([009](009-users-module.md)) and
Employees ([010](010-employees-module.md)) modules established.

A project is a customer or internal engagement that employees will later log
hours against. This feature covers **project management only**. Project
memberships, time entries and reports belong to later features, and nothing here
anticipates them beyond refusing to delete a project that memberships already
reference.

## Requirements

- Extend the existing `Project` model with `clientName`, `estimatedHours`,
  `color`, `projectStatus` and `projectPriority`.
- Full CRUD, with a hard delete guarded against existing project members.
- `code` unique, `estimatedHours` never negative, `endDate` never before
  `startDate`, `color` a valid `#RRGGBB` value.
- Archived projects stay editable.
- Reuse the shared infrastructure from [006](006-shared-backend-infrastructure.md):
  pagination, sorting, the global exception filter and the response interceptor.

Out of scope, as stated in the feature brief: project members, time entries,
vacations, holidays, authentication, authorization, reports and file uploads.

## Backend

`src/modules/projects/`, laid out exactly like the four modules before it.

### Controller

`ProjectController` is five one-line delegations. Validation is the DTOs' job,
the success envelope is the global interceptor's, error rendering is the global
filter's, and every rule is the service's. `id` is taken as a plain `string`:
ids are cuids, so a `ParseUUIDPipe` would reject valid ones.

As with Employees, there is **no guard and no role check** — authentication and
authorization are later features, and a half-written access check reads as
protection while providing none.

### Service

`ProjectService` holds every rule. Three are specific to this resource:

1. **The schedule is one value spread over two columns.** `endDate` only means
   something relative to `startDate`, so the check cannot live in a DTO — see
   [Date validation](#date-validation).
2. **Archiving is not deleting.** `isArchived` is an ordinary editable column.
   An archived project still answers `GET`, still appears in listings, and still
   accepts a `PATCH`; nothing in the module special-cases it, and it can be
   un-archived by setting the flag back to `false`.
3. **Deleting is refused while memberships exist** — see
   [Delete protection](#delete-protection).

`findAll` reads the page and the total in a single `prisma.$transaction([...])`
so both see the same snapshot; run separately, a concurrent insert between them
would produce a `total` that does not describe the page just returned.

`exists(id)` is public and `ProjectService` is exported, the same hand-off
`DepartmentService` and `PositionService` make to Employees: the project-members
feature will confirm a project through this method rather than querying the
`projects` table itself.

### DTOs

| File | Purpose |
| --- | --- |
| `dto/project-field.decorators.ts` | Per-field constraints, composed with `applyDecorators`. |
| `dto/create-project.dto.ts` | Body of `POST`. |
| `dto/update-project.dto.ts` | Body of `PATCH`; every field optional. |
| `dto/project-query.dto.ts` | Query string of `GET`, extending `SortQueryDto`. |

The split the earlier modules established is kept: **constraints** live in the
decorator file, **optionality** stays on the DTO class, because `@IsOptional()`
versus `@ValidateIfPresent()` is the entire difference between creating and
patching and has to be readable where it applies.

`@ValidateIfPresent()` — introduced by Feature 010 — marks a field optional
*without* also accepting `null`. It is used on every non-nullable column, so
`{"estimatedHours": null}` is a `400` naming the field rather than a `500` from
the driver. `@IsOptional()` is used only on the four nullable columns, where
`null` is a real value meaning "clear this".

## Database

### Schema changes

Two enums were added:

```prisma
enum ProjectStatus {
  ACTIVE    @map("active")
  COMPLETED @map("completed")
  ON_HOLD   @map("on_hold")
  CANCELLED @map("cancelled")
}

enum ProjectPriority {
  LOW    @map("low")
  MEDIUM @map("medium")
  HIGH   @map("high")
}
```

`ON_HOLD` is stored as `on_hold`, with an underscore rather than a hyphen, to
match `EmployeeStatus.ON_LEAVE`. The stored value is what every query, export
and enum literal repeats, so keeping the two vocabularies consistent matters
more than the hyphen does.

Five columns were added to `Project`:

| Field | Column | Type | Notes |
| --- | --- | --- | --- |
| `clientName` | `client_name` | `TEXT NOT NULL` | Required. An internal project names the company itself rather than leaving it empty. |
| `estimatedHours` | `estimated_hours` | `INTEGER NOT NULL DEFAULT 0` | `0` means "not estimated yet", which is why it is defaulted rather than nullable. |
| `color` | `color` | `VARCHAR(7)` | Nullable. Seven characters is exactly `#RRGGBB`, so the length is part of the column. |
| `projectStatus` | `project_status` | `ProjectStatus NOT NULL DEFAULT 'active'` | Lifecycle state. |
| `projectPriority` | `project_priority` | `ProjectPriority NOT NULL DEFAULT 'medium'` | Scheduling priority. |

No `Department` relation was added, as the brief specified, and no other model
was touched.

`projectStatus` and `isActive` / `isArchived` are deliberately separate axes: a
project can be `ON_HOLD` while still being an active record, and `COMPLETED`
while not yet archived. The seed illustrates this with `PORTAL`.

### Migration

`prisma/migrations/20260803120000_extend_project_model/migration.sql`

The migration is required because Prisma Migrate is the only sanctioned way this
project changes the database, and because three of the five columns cannot be
added naively:

- **`client_name` is `NOT NULL` with no default.** A plain
  `ADD COLUMN ... NOT NULL` fails on the rows the seed already wrote. The column
  is added with a temporary `DEFAULT 'Internal'` to backfill them, then the
  default is dropped — so existing rows get a sensible value and every future
  insert must state a client, which is the rule the model expresses.
- **The two enum columns need their types created first**, and their defaults
  double as the backfill: an unclassified project reads as active and
  normal-priority rather than as an empty cell every consumer has to defend
  against.

Command, to be run from `backend/`:

```bash
npm run prisma:migrate
```

`prisma generate` was run after the schema change so the client carries the new
fields and the two enums.

### Seed

`prisma/seeds/projects.seed.ts` was updated: the five projects now carry a
client, an estimate, an accent colour, a lifecycle state and a priority. The
data spans internal and external clients, estimates across two orders of
magnitude so `?sortBy=estimatedHours` has something to order, and three of the
four statuses.

## API

Base path `/api/v1/projects`. Every response uses the Feature 006 envelope.

### `GET /api/v1/projects`

| Parameter | Values | Default |
| --- | --- | --- |
| `page` | integer ≥ 1 | `1` |
| `limit` | integer, capped by the shared maximum | `20` |
| `search` | ≤ 100 chars, matched against `code`, `name`, `clientName` | — |
| `isActive` | `true` / `false` | unfiltered |
| `isArchived` | `true` / `false` | unfiltered |
| `projectStatus` | `ACTIVE`, `COMPLETED`, `ON_HOLD`, `CANCELLED` | unfiltered |
| `projectPriority` | `LOW`, `MEDIUM`, `HIGH` | unfiltered |
| `sortBy` | `code`, `name`, `clientName`, `estimatedHours`, `startDate`, `createdAt` | `code` |
| `sortOrder` | `asc` / `desc` | `asc` |

Search is case-insensitive (`mode: 'insensitive'`), matching a substring. The
parameters are independent and combine with `AND`, so `?isArchived=false`
narrows whatever `?search=` matched rather than replacing it.

Ordering always appends `id ASC` as a tie-break. Of the six sortable columns
only `code` is unique; without the tie-break two projects sharing a client, an
estimate or a start date could be returned in a different relative order on each
query, letting a record repeat on one page and vanish from the next.

Omitting `isArchived` lists archived and live projects alike. Hiding archived
rows by default would be a policy the caller can neither see nor turn off.

### `GET /api/v1/projects/:id`

Returns the project, or `404` with `Project <id> was not found`.

### `POST /api/v1/projects`

`201` with the created project. Returns `400` for a malformed body or a
reversed date range, `409` for a duplicate code.

### `PATCH /api/v1/projects/:id`

Partial update; every field is optional and an absent one is left alone.
Returns `404` for an unknown id, `400` for a malformed body or a reversed range,
`409` for a code another project holds.

Existence is checked **before** the body, so patching a missing id reports the
missing id rather than a complaint about the payload.

### `DELETE /api/v1/projects/:id`

Hard delete. `200` with `data: null`, `404` for an unknown id, `409` while
project members reference it.

## Validation rules

| Field | Rule |
| --- | --- |
| `code` | Required, non-empty, ≤ 20 chars, `^[A-Z0-9]+([-_][A-Z0-9]+)*$`. Trimmed and upper-cased first. |
| `name` | Required, non-empty, ≤ 100 chars. Trimmed, case preserved. |
| `clientName` | Required, non-empty, ≤ 100 chars. Trimmed, case preserved, no pattern. |
| `description` | Optional, ≤ 500 chars. Trimmed; blank becomes `null`. |
| `estimatedHours` | Required integer, ≥ 0, ≤ 1 000 000. |
| `color` | Optional, `#RRGGBB`. Trimmed and upper-cased; blank becomes `null`. |
| `projectStatus` | Optional; one of the four enum values. |
| `projectPriority` | Optional; one of the three enum values. |
| `isActive` / `isArchived` | Optional booleans. |
| `startDate` / `endDate` | Optional ISO-8601 date or timestamp strings. |

`clientName` gets no character pattern for the same reason people's names get
none: a company name carries diacritics, ampersands, dots and legal suffixes
(`S.R.L.`, `& Co`), and any pattern narrow enough to be worth writing eventually
rejects a real customer.

`estimatedHours` uses `@IsInt()` rather than `@Type(() => Number)`: this arrives
in a JSON body, where `120` and `"120"` are genuinely different values, and
coercing the string would accept a payload the client should fix. Fractions are
rejected too — the `integer` column would silently truncate them. The upper
bound is not cosmetic: `estimated_hours` is a 32-bit `integer`, so without it a
value past 2^31−1 would surface as a driver `500` instead of a `400` naming the
field.

### Date validation

The rule is `endDate >= startDate`, and it lives in the service — not in a DTO —
because it spans two fields *and*, on a `PATCH`, the row already stored. Three
cases have to come out right, and only the service sees all three:

| Request | Behaviour |
| --- | --- |
| `POST` with both dates | Compared against each other. |
| `PATCH { endDate }` | Compared against the **stored** `startDate`. |
| `PATCH { startDate: null, … }` | Constraint lifted — an open start cannot be violated. |

`resolveDateRange` reconstructs both ends (body value where the body has one,
stored value otherwise, `null` where the body clears one) and
`assertOrderedDateRange` judges the result. An open end — either date missing —
is an unknown rather than a violation, so the rule only applies when both are
present.

The comparison is `<`, so a project that starts and finishes on the same day is
allowed: a one-day engagement is real, and `endDate === startDate` is not
"before".

A reversed range is a **`400`, not a `409`**: nothing in the database conflicts
with the request, the submitted range simply contradicts itself. The message is
an array — the same shape `ValidationPipe` produces — so a form handles it with
the code it already has for field errors.

The ISO strings are parsed into `Date` objects exactly once, in the service, on
their way into Prisma. The DTOs keep them as validated strings, because
`@Type(() => Date)` would hand `@IsDateString()` a `Date` to reject, and a bare
`new Date(value)` would accept `01/13/2020` — a format whose meaning depends on
which side of the Atlantic reads it.

### HEX colour validation

One spelling is accepted: `#` followed by six hexadecimal digits. Not the
three-digit shorthand (`#FFF`), not a named colour, not `rgb(...)`. A single
stored format means every consumer — a CSS variable, a chart legend, an exported
report — parses it the same way, and it is the format the `varchar(7)` column is
sized for.

Input is trimmed and **upper-cased before the pattern runs**, so
`PROJECT_COLOR_PATTERN` needs no case-insensitive flag and `#3b82f6` and
`#3B82F6` become literally the same stored value rather than two spellings of
one colour — enough to break an equality check in a legend or a diff of two
projects.

A blank string collapses to `null`, which is what lets a UI clear the accent by
submitting an emptied input rather than storing `""` in a column whose only
valid contents are seven characters long.

### Duplicate protection

`code` is the only unique column on `projects`, and the only one checked. Two
clients really can both have a project called "Website Redesign", so `name` is
deliberately **not** treated as an identifier.

The check is case-insensitive, because `crm-ts` and `CRM-TS` are the same code
to a human while PostgreSQL's unique index sees two rows. The index still backs
the check for the exact-case race between the read and the write — and the DTO
upper-cases before either, so in practice the gap is closed.

On `PATCH` the project's own id is excluded (`NOT: { id }`), so re-sending the
code it already holds is not a conflict with itself. A body that does not carry
a code skips the query entirely.

### Delete protection

`DELETE` counts `ProjectMember` rows before deleting and answers `409` if any
exist, rather than cascading. A membership records that somebody worked on this
project; deleting it to remove a project entry would rewrite that person's
history and — once time entries hang off a membership — silently drop the hours
behind an invoice. The `409` asks the caller to remove the memberships first or
to archive the project instead, which is what `isArchived` is for. That is a
decision only a human should make.

The count is part of the existence query:

```ts
select: { _count: { select: { memberships: true } } }
```

so the common case is one round trip, and the `404` and the `409` cannot be
decided from two different snapshots.

### Why `select` and not `include`

Every Prisma call in the module reads through `PROJECT_PUBLIC_SELECT`.

`include` would return *every* column of the row plus whole related records —
here that means dragging each project's `memberships` into a listing that has no
use for them, and it would keep publishing every column added to `projects`
later. A `deletedAt` for soft deletes, an internal margin, a rate: each would
leak the moment it was added rather than when somebody decided to publish it.
`select` publishes a field only when someone decides to publish it, and it is
what keeps the payload of a fifty-row page proportional to what the page renders.

The constant is declared `as const satisfies Prisma.ProjectSelect`, and
`PublicProjectRow` is derived from its keys, so a column renamed in
`schema.prisma` breaks the build rather than the runtime.

## Files Created

| File | Purpose |
| --- | --- |
| `backend/prisma/migrations/20260803120000_extend_project_model/migration.sql` | Adds the two enums and five columns, with the `client_name` backfill. |
| `backend/src/modules/projects/project.module.ts` | Wires the controller and service; exports the service. |
| `backend/src/modules/projects/project.controller.ts` | The five routes. |
| `backend/src/modules/projects/project.service.ts` | Every rule about projects. |
| `backend/src/modules/projects/project.constants.ts` | Lengths, patterns, bounds, sortable columns. |
| `backend/src/modules/projects/entities/project.entity.ts` | `ProjectEntity`, `PROJECT_PUBLIC_SELECT`, the mapper. |
| `backend/src/modules/projects/dto/project-field.decorators.ts` | Shared per-field constraints. |
| `backend/src/modules/projects/dto/create-project.dto.ts` | `POST` body. |
| `backend/src/modules/projects/dto/update-project.dto.ts` | `PATCH` body. |
| `backend/src/modules/projects/dto/project-query.dto.ts` | `GET` query string. |
| `backend/src/modules/projects/project.service.spec.ts` | Service unit tests. |
| `backend/src/modules/projects/project.controller.spec.ts` | Controller delegation tests. |
| `backend/src/modules/projects/dto/create-project.dto.spec.ts` | `POST` validation tests. |
| `backend/src/modules/projects/dto/update-project.dto.spec.ts` | `PATCH` validation tests. |
| `backend/src/modules/projects/dto/project-query.dto.spec.ts` | Query validation tests. |

## Files Modified

| File | Change |
| --- | --- |
| `backend/prisma/schema.prisma` | Added `ProjectStatus` and `ProjectPriority`; added five fields to `Project`. |
| `backend/prisma/seeds/projects.seed.ts` | Seeded the five new columns. |
| `backend/src/app.module.ts` | Registered `ProjectModule`. |
| `backend/src/common/utils/date.util.ts` | Added `toNullableIsoTimestamp`. |
| `backend/src/common/utils/date.util.spec.ts` | Covered the new helper. |

`toNullableIsoTimestamp` was added rather than folded into `toIsoTimestamp`,
because that function defaults an *absent* argument to "now" — exactly the wrong
answer for a `null` a nullable column deliberately stores. Projects are the
first resource with optional dates; vacations and time entries will have more,
so the null-handling is written once instead of as a ternary in each mapper.

## Notes

- **No new dependency.** `PartialType` from `@nestjs/mapped-types` is the usual
  way to derive an update DTO, but the package is not installed and installing
  one was not this feature's call to make. `applyDecorators` covers it.
- **Verified before completion.** `tsc --noEmit` clean, `nest build` clean,
  `prisma validate` clean, 595 tests passing across 39 suites (142 of them new).
- **`projectStatus` and `projectPriority` are filterable but not sortable.**
  Both *could* be ordered — a PostgreSQL enum sorts by declaration order, which
  is lifecycle order for one and low-to-high for the other — but this feature
  fixed the sortable set. Adding either is a one-line change in
  `PROJECT_SORT_FIELDS`.

## Future Improvements

- Add `projectStatus` and `projectPriority` to the sortable columns if a UI
  wants a priority-ordered backlog.
- Reconsider whether `isActive` and `projectStatus` should stay independent.
  They are separate axes today, which is defensible, but a UI that has to render
  both may find the combination `isActive: false, projectStatus: ACTIVE`
  confusing; a later feature may want to derive one from the other.
- Case-variant races on `code` still slip past both the read and the index. A
  `citext` column or a functional unique index would close them — a schema
  change, out of scope here, and the same open point Feature 007 recorded.
- A lifecycle state machine (which `projectStatus` transitions are legal) has
  not been written, on purpose: no one has asked for one, and the module records
  the state somebody chose rather than policing it.
- Guards and role checks, once authentication and authorization exist.
