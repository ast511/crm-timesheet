# Feature 013 — Project Members Module

## Goal

Expose the `project_members` table as a REST resource under
`/api/v1/project-members`, managing the many-to-many relationship between
Employees ([010](010-employees-module.md)) and Projects
([011](011-projects-module.md)).

An employee can belong to many projects; a project can hold many employees.
This feature covers **membership only** — who is on what, since when, until
when, and who leads it. Time entries, vacations and reports are later features,
and nothing here anticipates them beyond leaving the delete guard a place to
grow.

This is the first module that is a **join rather than a table**. It owns no
resource of its own, only the relationship between two that already existed, and
almost everything below follows from that.

> **Numbering note.** The feature brief was headed "Feature 013" but its
> documentation step asked for "Feature 012". `012` is already taken by
> [Project Status Consolidation](012-project-status-consolidation.md), and
> feature documents are never overwritten, so this is `013` — which is what the
> brief's own title said.

## Requirements

- Full CRUD over the existing `ProjectMember` model, addressed by its composite
  key.
- Listing with pagination, filtering (`projectId`, `employeeId`,
  `isProjectManager`, `activeOnly`) and sorting (`joinedAt`, `leftAt`).
- Both sides of a membership must exist before it can be created.
- No duplicate membership for a pair.
- `leftAt >= joinedAt` whenever both are known.
- Every response carries a trimmed summary of the project, the employee, and the
  employee's department and position.
- Reuse the shared infrastructure from
  [006](006-shared-backend-infrastructure.md): pagination, sorting, the global
  exception filter and the response interceptor.
- **No schema change and no migration.**

Out of scope, as stated in the brief: time entries, vacation requests, holidays,
authentication, authorization, reports and file uploads.

## Backend

`src/modules/project-members/`, laid out like the five modules before it — with
one file deliberately missing, and one shared file newly created.

### What is missing: `dto/*-field.decorators.ts`

Every module so far has one. This one does not, and the absence is the result
rather than an oversight: a membership has no columns of its own beyond two
foreign keys, a flag and two dates, so every constraint it needs already existed
elsewhere. Writing `IsProjectMemberDate()` here would have been a **third** copy
of a rule already stated twice.

Instead, two decorators were promoted into `common/decorators/` — see
[Shared decorators promoted](#shared-decorators-promoted).

### Controller

`ProjectMemberController` is five one-line delegations. Validation is the DTOs'
job, the success envelope is the global interceptor's, error rendering is the
global filter's, and every rule is the service's.

The item routes take **two** path segments, because the resource has no id of
its own. `/project-members/:projectId/:employeeId` is the natural addressing of
a row that is a relationship rather than a thing, and it needs no synthetic key
invented purely to shorten a path.

As with Employees and Projects, there is **no guard and no role check** —
authentication and authorization are later features, and a half-written access
check reads as protection while providing none.

Both ids are taken as plain `string`s: they are cuids, so a `ParseUUIDPipe`
would reject valid ones.

### Service

`ProjectMemberService` holds every rule. Three are specific to a join table:

1. **The identity is a pair, not an id** — see
   [Composite key usage](#composite-key-usage).
2. **Both sides have to exist before they can be joined** — see
   [Relationship validation](#relationship-validation).
3. **A membership has a period, not a date** — see
   [joinedAt / leftAt validation](#joinedat--leftat-validation).

`findAll` reads the page and the total in a single `prisma.$transaction([...])`
so both see the same snapshot; run separately, a concurrent insert between them
would produce a `total` that does not describe the page just returned.

`ProjectMemberService` is exported, the same hand-off the other modules make:
time entries hang off a membership — an hour is logged by a person against a
project they are on — and that feature will need to confirm one exists.

### DTOs

| File | Purpose |
| --- | --- |
| `dto/create-project-member.dto.ts` | Body of `POST`. |
| `dto/update-project-member.dto.ts` | Body of `PATCH`; the three mutable fields only. |
| `dto/project-member-query.dto.ts` | Query string of `GET`, extending `SortQueryDto`. |

`projectId` and `employeeId` appear on the create DTO and **not** on the update
DTO. They are the primary key and they are already in the URL; accepting them in
a `PATCH` body would mean either ignoring them — a field that silently does
nothing — or supporting a "move this membership to another project" operation,
which is not an edit of this row but the creation of a different one.
`forbidNonWhitelisted` turns an attempt into a `400` naming the field.

`@ValidateIfPresent()` versus `@IsOptional()` follows the rule Feature 010
established: `leftAt` is the only nullable column, so it is the only field where
`null` is a value rather than a mistake.

## Frontend

Not touched. This feature is backend-only, as every feature since
[006](006-shared-backend-infrastructure.md) has been.

## Database

**No schema change. No migration.** `ProjectMember` already existed, with
exactly the shape this feature needs:

```prisma
model ProjectMember {
  projectId  String
  employeeId String

  isProjectManager Boolean @default(false) @map("is_project_manager")

  project  Project  @relation(fields: [projectId],  references: [id])
  employee Employee @relation(fields: [employeeId], references: [id])

  joinedAt DateTime  @default(now()) @map("joined_at")
  leftAt   DateTime? @map("left_at")

  @@id([projectId, employeeId])
  @@map("project_members")
}
```

`prisma validate` was re-run to confirm the schema is untouched and valid.

### Composite key usage

`@@id([projectId, employeeId])` is the whole identity of the row, and it shapes
four things:

**1. Every read and write addresses the pair.** Prisma exposes a composite `@@id`
as a single generated key name — `projectId_employeeId` — which is not a name
anybody would guess, and getting the two ids the wrong way round in one of the
five places it is needed would produce a lookup that silently matches nothing.
So it is written once:

```ts
function membershipKey(projectId: string, employeeId: string) {
  return { projectId_employeeId: { projectId, employeeId } };
}
```

**2. The URL spells the pair.** No surrogate id was added to the model to make
the routes shorter. Adding one would have been a schema change in a feature that
was told not to make one, and it would have given the same row two identities.

**3. The database enforces uniqueness.** See
[Duplicate membership protection](#duplicate-membership-protection).

**4. The pair is the pagination tie-break.** See
[Sorting](#sorting).

The two ids are not published as top-level fields. Each is already the `id` of
its nested record, and reading one value twice is how two spellings eventually
disagree.

## API

Base path `/api/v1/project-members`. Every response uses the Feature 006
envelope.

### `GET /api/v1/project-members`

| Parameter | Values | Default |
| --- | --- | --- |
| `page` | integer ≥ 1 | `1` |
| `limit` | integer, capped by the shared maximum | `20` |
| `projectId` | an id | unfiltered |
| `employeeId` | an id | unfiltered |
| `isProjectManager` | `true` / `false` | unfiltered |
| `activeOnly` | `true` | unfiltered |
| `sortBy` | `joinedAt`, `leftAt` | `joinedAt` |
| `sortOrder` | `asc` / `desc` | `asc` |

The filters are independent and combine with `AND`, so
`?projectId=…&activeOnly=true` is today's roster for one project rather than
either half of that question.

An id matching no row is not an error: it simply matches no membership, and an
empty page is the honest answer to "who is on a project that does not exist".

**There is no `?search=`.** A membership has no text of its own to match. What a
caller would search for — a name, a project code — belongs to the related rows,
and matching across a join is a different feature from the substring search the
other modules offer. `projectId` and `employeeId` answer the two questions this
endpoint actually exists for: *who is on this project*, and *what is this person
working on*.

### `GET /api/v1/project-members/:projectId/:employeeId`

Returns the membership, or `404` with
`Employee <employeeId> is not a member of project <projectId>`.

### `POST /api/v1/project-members`

`201` with the created membership. The pair arrives in the **body**, not the
path: a `PUT /project-members/:projectId/:employeeId` would name a row that does
not exist yet, and would blur creating a membership with editing one.

| Outcome | Status |
| --- | --- |
| Malformed body, or a period that ends before it starts | `400` |
| `projectId` or `employeeId` names no row | `400`, listing every missing one |
| The pair is already a membership | `409` |

The three checks escalate, cheapest and most local first: a body that
contradicts itself never reaches the database, a body pointing at rows that are
not there is answered without a write, and only a body sound in both respects
can go on to conflict.

### `PATCH /api/v1/project-members/:projectId/:employeeId`

Partial update of `isProjectManager`, `joinedAt` and `leftAt`. An absent field
is left alone. Returns `404` for a pair that is not a membership, `400` for a
malformed body or a reversed period.

Existence is checked **before** the body, so patching a pair that is not a
membership reports that rather than a complaint about the payload.

### `DELETE /api/v1/project-members/:projectId/:employeeId`

Hard delete. `200` with `data: null`, `404` for a pair that is not a membership.

There is **no `409` guard**, unlike Employees and Projects — nothing references a
membership yet. That changes with time entries, and `remove()` is where that
check will belong.

Deleting is not how a membership normally ends: setting `leftAt` does that while
keeping the record that the person was there. A `DELETE` says the row should
never have existed.

### Response shape

```json
{
  "project": {
    "id": "…",
    "code": "CRM-001",
    "name": "CRM TimeSheet",
    "clientName": "ACME Corporation",
    "color": "#2563EB"
  },
  "employee": {
    "id": "…",
    "employeeCode": "EMP001",
    "firstName": "Ion",
    "lastName": "Popescu",
    "seniority": "SENIOR",
    "status": "ACTIVE",
    "department": { "id": "…", "code": "DEV", "name": "Development" },
    "position": { "id": "…", "code": "DEV_SR", "name": "Senior Developer" }
  },
  "isProjectManager": true,
  "joinedAt": "2026-08-01T00:00:00.000Z",
  "leftAt": null
}
```

The two foreign keys are replaced by the records they point at — the same
treatment `EmployeeEntity` gives `departmentId` and `positionId`. A roster
renders in one request, and nothing is lost: each nested object carries its
`id`, which is what a caller puts back in a URL.

The nested project is deliberately **not** `ProjectEntity`, and the nested
employee is deliberately not `EmployeeEntity`. Those resources carry
descriptions, estimates, lifecycle flags, phone numbers and their own
timestamps, none of which say anything about *this person's membership*. In
particular the employee summary has **no `user`**: a membership is about who
works on a project, not about how they sign in.

## Validation rules

| Field | Rule |
| --- | --- |
| `projectId` | Required on `POST`, absent from `PATCH`. Trimmed, non-empty, ≤ 50 chars. |
| `employeeId` | Same. |
| `isProjectManager` | Optional boolean. `null` rejected — the column is not nullable. |
| `joinedAt` | Optional ISO-8601 date or timestamp. `null` rejected. |
| `leftAt` | Optional ISO-8601 date or timestamp, **or `null`** to reopen a membership. |

The id bound is a length, not a format check: ids are cuids — 25 characters
today — so 50 is headroom whose job is to keep a megabyte of text out of an
indexed lookup, not to decide what a valid id looks like.

The dates are validated as strings rather than transformed: `@Type(() => Date)`
would hand `@IsDateString()` a `Date` to reject, and a bare `new Date(value)`
would accept `01/13/2020` — a format whose meaning depends on which side of the
Atlantic reads it. They are parsed once, in the service, on their way into
Prisma.

### Relationship validation

Before a membership is written, both sides are confirmed to exist:

```ts
const [projectExists, employeeExists] = await Promise.all([
  this.projects.exists(projectId),
  this.employees.exists(employeeId),
]);
```

Four decisions are packed into that:

- **It is asked at all.** The database would answer too, but as a foreign-key
  violation surfacing as a `500`; asking first turns it into a `400` naming the
  field.
- **It is asked through the owning service.** `ProjectService.exists` and
  `EmployeeService.exists`, not a query against `projects` or `employees` from
  here — the hand-off both of those modules documented when they exported their
  service. (`EmployeeService.exists` is new; see
  [Files Modified](#files-modified).)
- **The two lookups run concurrently**, and **both** failures are reported at
  once, as an array — the same shape `ValidationPipe` produces — so a form can
  mark each offending input instead of discovering the second problem only after
  fixing the first.
- **It is a `400`, not a `404`.** This is a `POST` to the collection: no
  membership is being addressed and none is missing. It is the submitted body
  that names something that is not there.

`PATCH` does not re-run this check, because it cannot change either id.

### Duplicate membership protection

`@@id([projectId, employeeId])` is what actually guarantees uniqueness — the
database cannot hold two rows for one pair, and that index closes the race
between the read and the write that follows it. What the read adds is the
*answer*: a `409` naming both sides, instead of a unique-constraint violation
surfacing as a `500`.

```ts
const existing = await this.prisma.projectMember.findUnique({
  where: membershipKey(projectId, employeeId),
  select: { projectId: true },
});
```

The rule is stricter than "not on this project twice at the same time": a
**past** membership blocks a new row just as an active one does, because the key
does not include a date. Somebody rejoining a project they had left is expressed
by clearing `leftAt` on the existing membership, not by inserting a second one.

That is a real constraint, and it is the schema's rather than this module's — it
is recorded under [Future Improvements](#future-improvements). It does have one
thing going for it: the history of a person on a project stays in one row rather
than being scattered across several that a reader has to reassemble.

### `activeOnly` filtering

A membership becomes inactive when `leftAt` is set, so an active one is simply
one that has not ended:

```ts
if (activeOnly === true) {
  filters.push({ leftAt: null });
}
```

Two decisions worth stating:

**`false` and *absent* mean the same thing**, and the parameter is named for
that. "Only the active ones", turned off, is not "only the inactive ones" — it
is the unfiltered listing. This is the one filter compared against `true` rather
than `undefined`, and it is the reason the tests pin `?activeOnly=false`
explicitly.

**Historical memberships are returned by default.** They are part of the record —
the business rule this feature states is that they are preserved until
explicitly deleted — so hiding them unless asked would be a policy the caller can
neither see nor turn off. A caller who wants today's roster asks for it.

The complement — memberships that *have* ended — is deliberately not offered.
Nobody has asked for it, and an `?endedOnly=` alongside this one would create a
pair of flags that can contradict each other.

### `joinedAt` / `leftAt` validation

The rule is `leftAt >= joinedAt`, and it lives in the **service**, not in a DTO,
because it spans two fields *and*, on a `PATCH`, the row already stored. Four
cases have to come out right, and only the service sees all four:

| Request | Compared against |
| --- | --- |
| `POST` with both dates | Each other. |
| `POST` with only `leftAt` | The **resolved** `joinedAt` — see below. |
| `PATCH { leftAt }` | The **stored** `joinedAt`. |
| `PATCH { joinedAt }` | The **stored** `leftAt`. |

`resolveMembershipPeriod` reconstructs both ends (body value where the body has
one, stored value otherwise) and `assertOrderedMembershipPeriod` judges the
result.

The third and fourth rows are why the check cannot be a DTO decorator, and the
fourth is easy to miss: a "correction" that moves only the start can push it past
an end nobody re-sent.

**The second row is the subtle one.** `joinedAt` carries `@default(now())` in the
schema, so an omitted value would normally be the column's problem. But the
default applies *after* validation — so `POST { "leftAt": "2020-01-01" }` with no
`joinedAt` would pass a check against nothing and then store a period that ended
six years before it began. The service therefore resolves `joinedAt` to the
current time itself and writes that explicit value, so **the value compared is
the value stored**. This is covered by a test that says exactly that.

An open end — `leftAt` still `null` — is not a violation but the normal state of
somebody currently on a project, so the rule only applies once both ends are
known.

The comparison is `<`, so joining and leaving on the same day is allowed: a
one-day assignment is real, and `leftAt === joinedAt` is not "before".

A reversed period is a **`400`, not a `409`**: nothing in the database conflicts
with the request, the submitted period simply contradicts itself. The message is
an array — the shape `ValidationPipe` produces — so a form handles it with the
code it already has for field errors.

### Sorting

Only the two dates are sortable, which is what the feature asked for and also
what is useful: `isProjectManager` has two values and would order rows into two
undifferentiated blocks, and the ids are opaque keys nobody reads in sequence.

`joinedAt` is the default, because every membership has one. `leftAt` is `null`
for exactly the rows a caller usually cares about most, which makes it a poor
default however its nulls are placed.

**The tie-break needs both ids.** Neither sortable column is unique — a project's
whole founding team shares a `joinedAt`, and every active membership shares a
`leftAt` of `null` — so without it a record could repeat on one page and vanish
from the next. The pair is the only total order the table has:

```ts
[{ joinedAt: sortOrder }, { projectId: 'asc' }, { employeeId: 'asc' }]
```

**`leftAt` states its null placement** instead of inheriting PostgreSQL's, which
is `NULLS LAST` ascending and `NULLS FIRST` descending. An open membership has no
end date; it is neither the earliest nor the latest, so `nulls: 'last'` keeps it
at the end in both directions rather than letting the whole active roster jump
between the two ends of the listing when a caller flips `?sortOrder=`.

### Why `select` and not `include`

Every Prisma call in the module reads through `PROJECT_MEMBER_PUBLIC_SELECT`,
and here that choice does more work than in any module so far.

This row joins to two tables that themselves join to two more. `include` would
return *every* column of each — an employee's `phone`, `hireDate` and
`maxVacationDays`, a project's description and estimate, a department's
`isActive` — and, through `Employee.user`, would put **`User.passwordHash` one
careless nesting away from a roster endpoint**. It would also keep publishing
every column added to any of those five tables later: a `deletedAt`, an internal
margin, a rate — each would leak the moment it was added rather than when
somebody decided to publish it.

`select` publishes a field only when someone decides to publish it, and it is
what keeps the payload of a fifty-row page proportional to what the page renders.

The constant is declared `as const satisfies Prisma.ProjectMemberSelect`, and
`ProjectMemberWithRelationsRow` is derived from it, so a column renamed in
`schema.prisma` breaks the build rather than the runtime. A test asserts that
neither `user` nor `phone` appears in the employee sub-select.

### Shared decorators promoted

Two rules were found written a second and a third time, so they moved into
`common/` rather than being copied again. This is the call Feature 008 made when
`sortOrder` moved into `SortQueryDto`.

| New file | Replaces | Was written in |
| --- | --- | --- |
| `common/decorators/is-relation-id.decorator.ts` | `IsRelationId()` | Employees (010) |
| `common/decorators/is-iso-date-string.decorator.ts` | `IsEmployeeHireDate()`, `IsProjectDate()` | Employees (010), Projects (011) |
| `common/constants/relation.constants.ts` | `EMPLOYEE_RELATION_ID_MAX_LENGTH` | Employees (010) |

Neither carried anything specific to an employee or a project — a foreign key is
a foreign key, and every date this API accepts is the same kind of value with the
same reasoning behind it. Behaviour is unchanged: the bodies moved verbatim, and
the existing employee and project test suites pass untouched, which is what
confirms it.

## Files Created

| File | Purpose |
| --- | --- |
| `backend/src/modules/project-members/project-member.module.ts` | Wires the controller and service; imports `ProjectModule` and `EmployeeModule`; exports the service. |
| `backend/src/modules/project-members/project-member.controller.ts` | The five routes. |
| `backend/src/modules/project-members/project-member.service.ts` | Every rule about memberships. |
| `backend/src/modules/project-members/project-member.constants.ts` | Sortable columns and the default ordering. |
| `backend/src/modules/project-members/entities/project-member.entity.ts` | `ProjectMemberEntity`, `PROJECT_MEMBER_PUBLIC_SELECT`, the mapper. |
| `backend/src/modules/project-members/dto/create-project-member.dto.ts` | `POST` body. |
| `backend/src/modules/project-members/dto/update-project-member.dto.ts` | `PATCH` body. |
| `backend/src/modules/project-members/dto/project-member-query.dto.ts` | `GET` query string. |
| `backend/src/common/decorators/is-relation-id.decorator.ts` | Shared foreign-key constraints. |
| `backend/src/common/decorators/is-iso-date-string.decorator.ts` | Shared ISO-date constraints. |
| `backend/src/common/constants/relation.constants.ts` | `RELATION_ID_MAX_LENGTH`. |
| `backend/src/modules/project-members/project-member.service.spec.ts` | Service unit tests. |
| `backend/src/modules/project-members/project-member.controller.spec.ts` | Controller delegation tests. |
| `backend/src/modules/project-members/dto/create-project-member.dto.spec.ts` | `POST` validation tests. |
| `backend/src/modules/project-members/dto/update-project-member.dto.spec.ts` | `PATCH` validation tests. |
| `backend/src/modules/project-members/dto/project-member-query.dto.spec.ts` | Query validation tests. |

## Files Modified

| File | Change |
| --- | --- |
| `backend/src/app.module.ts` | Registered `ProjectMemberModule`. |
| `backend/src/modules/employees/employee.service.ts` | Added the public `exists(id)`; `assertExists` now builds on it. |
| `backend/src/modules/employees/employee.constants.ts` | Removed `EMPLOYEE_RELATION_ID_MAX_LENGTH` (moved to `common/constants`). |
| `backend/src/modules/employees/dto/employee-field.decorators.ts` | Removed `IsRelationId` and `IsEmployeeHireDate` (moved to `common/decorators`). |
| `backend/src/modules/employees/dto/create-employee.dto.ts` | Imports the two shared decorators. |
| `backend/src/modules/employees/dto/update-employee.dto.ts` | Imports the two shared decorators. |
| `backend/src/modules/employees/dto/employee-query.dto.ts` | Imports the shared `IsRelationId`. |
| `backend/src/modules/projects/dto/project-field.decorators.ts` | Removed `IsProjectDate` (moved to `common/decorators`). |
| `backend/src/modules/projects/dto/create-project.dto.ts` | Imports the shared `IsIsoDateString`. |
| `backend/src/modules/projects/dto/update-project.dto.ts` | Imports the shared `IsIsoDateString`. |

`EmployeeService.exists()` was added rather than querying `employees` from the
new service, because `EmployeeModule` already exported its service "for project
memberships" and this is the method that hand-off needed. `assertExists` was
rewritten to call it, so the two are one query rather than two copies of one.

**No schema change, no migration, no seed change.**

## Notes

- **Verified before completion.** `tsc --noEmit` clean, `nest build` clean,
  `prisma validate` clean, **676 tests passing across 44 suites** — 79 of them
  new, and the 597 pre-existing ones untouched, which is what confirms the
  decorator promotion changed no behaviour.
- **No new dependency.**
- **One manager per project is not enforced.** The schema does not enforce it,
  the feature did not ask for it, and a rule invented in a `PATCH` handler is a
  policy nobody can see. A project with two leads — or with none, between one
  person leaving and the next being named — is a situation this module records
  rather than prevents.
- **An archived or completed project still accepts new members.** Nothing
  cross-checks `Project.projectStatus` or `Project.isArchived` here. Backfilling
  who worked on a finished project is a normal thing to do, and refusing it
  would be an unrequested policy.
- **An employee's `status` is not checked either.** A `TERMINATED` employee can
  still hold a membership, which is the point: the membership is the historical
  record that they worked on it.

## Future Improvements

- **Rejoining a project cannot create a second row.** The composite key has no
  date in it, so a person who left and came back reopens the original membership
  by clearing `leftAt`, and the gap between the two stints is not recorded.
  Modelling that properly means a surrogate key plus a uniqueness rule over
  active rows only — a schema change, out of scope here, and worth doing only if
  somebody actually needs the gap.
- **Search across the join.** `?search=popescu` matching an employee's name or a
  project's code is the obvious next request. It needs a `where` on the relation
  rather than on this table, and a decision about which related columns count.
- **Sorting by a related column** — a roster ordered by surname, a person's
  projects ordered by project code — is the same kind of change and would extend
  `PROJECT_MEMBER_SORT_FIELDS` beyond keys `orderBy` can take directly.
- **A `409` guard on `DELETE`**, once time entries hang off a membership.
  Deleting one then would drop the hours behind an invoice, which is the same
  reasoning Features 010 and 011 used for their own guards.
- **A bulk assign endpoint.** Adding eight people to a new project is eight
  `POST`s today.
- Guards and role checks, once authentication and authorization exist.
