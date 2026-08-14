# Feature 014 — Project Roster Endpoint

## Goal

Add `GET /api/v1/projects/:projectId/members`: one project, published once, with
the people on it.

It exists because of a redundancy in
[013](013-project-members-module.md). `GET /api/v1/project-members?projectId=…`
answers "who is on this project", but repeats the same `project` object on every
row — on a six-person team, five copies of the same five fields, and on a
fifty-person team, forty-nine.

This feature removes that repetition **without** changing the flat collection,
because the two endpoints answer different questions and the fix for one is not
a change to the other.

## Requirements

- A project-scoped roster: the project once, each member entry carrying only the
  person and the membership.
- The same filtering and sorting the flat listing offers, minus the two id
  filters the URL makes redundant.
- Pagination, from the shared infrastructure.
- `404` for a project that does not exist.
- No change to `/api/v1/project-members`, no schema change, no migration.

## Backend

### Why a second endpoint rather than a different response shape

The obvious alternative was to make `/project-members?projectId=…` group its
results — return the project once and an array of employees. It was rejected for
three reasons, in order of weight:

**1. The response shape would depend on the query.** The same endpoint answers
the inverse question: `?employeeId=…` lists one person's projects, and there it
is the *employee* that repeats. Grouping by project when `projectId` is supplied
means grouping by employee when `employeeId` is, and staying flat when neither
is — three shapes discriminated by query parameters. A client could no longer
type one interface for the response, and `ProjectMemberEntity` would become a
union every consumer has to unpack.

**2. Pagination would lose its meaning.** Today `total: 6` means six
memberships. In a `{ project, members: [...] }` shape returned by a *filter*,
`meta` describes either the projects (one) or the members (six), and neither
reading survives `?limit=20` honestly. Scoped by URL, as it is here, the
ambiguity disappears: there is exactly one project and `meta` can only be about
the members.

**3. The payload cost is smaller than it looks.** The repeated `project` block
is ~140 bytes minified — ~700 wasted on six members, ~7 KB on fifty. Over gzip
the repeats become back-references and the real cost falls to tens of bytes. It
reads badly in a client; it does not weigh much on the wire.

What *is* a real problem is ergonomics: rendering a team from the flat listing
means `items.map(m => m.employee)` plus reading the project from `items[0]`,
which breaks when the list is empty. A URL that names the project fixes that
properly, and that is what this feature adds.

### Controller

`ProjectRosterController` — a **second controller**, declared in
`ProjectMemberModule`, serving the `projects` path.

Not a method on `ProjectController`, even though the path lives under
`projects`: that would make `ProjectModule` depend on `ProjectMemberModule`,
which already depends on `ProjectModule`. Only a `forwardRef` could break the
cycle, and a `forwardRef` is a note that the layering is wrong rather than a fix
for it. Declared here, the graph stays acyclic and the module that owns
memberships owns every route that returns them.

Nest resolves `/projects/:id` and `/projects/:projectId/members` by segment
count, so the two controllers do not collide — see
[Route resolution](#route-resolution).

### Service

`ProjectMemberService.findRoster(projectId, query)`:

1. Reads the project through `ProjectService.findOne`, which owns the table and
   throws the `404`.
2. Reads the members and their total in one `$transaction`, scoped to that
   project.
3. Returns `{ project, members, meta }`.

The project is read **first**, deliberately. It is what turns an unknown id into
a `404` rather than an empty list, and it is what lets an existing project with
nobody on it return itself with an empty roster instead of being
indistinguishable from one that does not exist.

`ProjectService.findOne` is reused rather than a new summary method being added:
it already produces the `404` with the right message, and the project is read
once per request, so the handful of extra columns cost nothing.

### The 404 difference

| Request | Unknown project |
| --- | --- |
| `GET /project-members?projectId=nope` | `200`, empty page |
| `GET /projects/nope/members` | `404` |

Both are correct, because the id plays a different role. As a **filter**, an id
that matches nothing honestly matches nothing. As a **resource in the path**, it
is missing.

## Frontend

Not touched.

## Database

**No schema change. No migration. No new query patterns** — the roster reads the
same table with the same filters, minus the `project` join.

## API

### `GET /api/v1/projects/:projectId/members`

| Parameter | Values | Default |
| --- | --- | --- |
| `page` | integer ≥ 1 | `1` |
| `limit` | integer, capped by the shared maximum | `20` |
| `isProjectManager` | `true` / `false` | unfiltered |
| `activeOnly` | `true` | unfiltered |
| `sortBy` | `joinedAt`, `leftAt` | `joinedAt` |
| `sortOrder` | `asc` / `desc` | `asc` |

`?projectId=` and `?employeeId=` are **rejected** with a `400`. The first is
already in the path and could only be ignored or contradict it; the second would
narrow a roster to one person, which is what
`GET /project-members/:projectId/:employeeId` is for.

```json
{
  "success": true,
  "data": {
    "project": {
      "id": "cmsd8u9qb000eawd5bjzizdc6",
      "code": "CRM-TS",
      "name": "CRM TimeSheet",
      "clientName": "Internal",
      "description": "Internal time tracking platform.",
      "estimatedHours": 2400,
      "color": "#2563EB",
      "projectStatus": "ACTIVE",
      "projectPriority": "HIGH",
      "isArchived": false,
      "startDate": "2026-01-12T00:00:00.000Z",
      "endDate": null,
      "createdAt": "2026-08-01T10:00:00.000Z",
      "updatedAt": "2026-08-02T11:30:00.000Z"
    },
    "members": [
      {
        "employee": {
          "id": "cmsafiz05000mp8d5b6ktgz2z",
          "employeeCode": "EMP-0002",
          "firstName": "Maria",
          "lastName": "Ionescu",
          "seniority": "SENIOR",
          "status": "ACTIVE",
          "department": { "id": "…", "code": "DEV", "name": "Development" },
          "position": { "id": "…", "code": "TL", "name": "Team Leader" }
        },
        "isProjectManager": true,
        "joinedAt": "2026-01-12T00:00:00.000Z",
        "leftAt": null
      }
    ],
    "meta": {
      "page": 1,
      "limit": 20,
      "total": 6,
      "totalPages": 1,
      "hasPreviousPage": false,
      "hasNextPage": false
    }
  }
}
```

### Why the project is returned in full

The nested project on the flat listing is a five-field summary, sized down
because it is repeated per row. Here it appears once, so trimming it buys
nothing — and returning the **full `ProjectEntity`** buys two things: it is the
same representation `GET /api/v1/projects/:id` returns, so a client types the
project once and can render a whole project page from a single request.

### Why `meta` is flat, not nested inside `members`

`{ project, members: [...], meta }` rather than `{ project, members: { items,
meta } }`. `meta` has exactly one meaning across this API — the pagination block
— and it means the same thing here. Nesting it would add a third level
(`data.members.items[0]`) to say something the shape already says.

`meta` describes `members`. There is only one project, so there is nothing else
it could describe.

### What was *not* de-duplicated

The `department` and `position` objects still repeat across members — four
Development entries in a six-person team. That was left alone on purpose.

Normalising them into a lookup table plus ids would force every client to
re-join the data before it could render a row, which is a real cost paid on
every read to save a few dozen bytes. The project was worth removing because it
is the **parent resource** — one per response by definition, and already named
by the URL. A department is an attribute of a member, and it belongs on the
member.

The `employee` wrapper key was kept for the same kind of reason: flattening it
into the entry would mix employee fields with membership fields and make `id`
ambiguous, and a client could no longer reuse an employee type.

## Route resolution

`ProjectController` declares `@Get(':id')` and `ProjectRosterController`
declares `@Get(':projectId/members')`, both under `projects`, from two different
modules.

`project-roster.routing.spec.ts` boots a real Nest application with both
controllers — registered in the order `AppModule` registers their modules — and
issues both requests through `supertest`, asserting each reaches its own
handler.

This is checked rather than asserted in a comment because the failure mode is
silent: if `:id` ever swallowed the two-segment path, `GET /projects/x/members`
would return a project instead of a roster, and every unit test in both modules
would still pass.

## Files Created

| File | Purpose |
| --- | --- |
| `backend/src/modules/project-members/project-roster.controller.ts` | The roster route. |
| `backend/src/modules/project-members/entities/project-roster.entity.ts` | `ProjectRosterEntity`. |
| `backend/src/modules/project-members/dto/project-member-filter.dto.ts` | The filters shared by both listings; the roster's query string. |
| `backend/src/modules/project-members/project-roster.controller.spec.ts` | Delegation test. |
| `backend/src/modules/project-members/project-roster.routing.spec.ts` | Route-resolution test against a real Nest app. |
| `backend/src/modules/project-members/dto/project-member-filter.dto.spec.ts` | Filter DTO validation tests. |

## Files Modified

| File | Change |
| --- | --- |
| `backend/src/modules/project-members/entities/project-member.entity.ts` | Split out `ProjectMemberRosterEntry`, `PROJECT_MEMBER_ROSTER_SELECT` and `toProjectMemberRosterEntry`; the flat entity, select and mapper are now built on them. |
| `backend/src/modules/project-members/dto/project-member-query.dto.ts` | Now extends `ProjectMemberFilterDto`; keeps only the two id filters. |
| `backend/src/modules/project-members/project-member.service.ts` | Added `findRoster`. |
| `backend/src/modules/project-members/project-member.module.ts` | Registered `ProjectRosterController`. |
| `backend/src/modules/project-members/project-member.service.spec.ts` | Covered `findRoster`. |

### The shared halves

Both the select and the DTO were split rather than duplicated, and the split
runs the same way in each: the roster's version is the smaller one, and the flat
collection's is built from it.

```ts
export const PROJECT_MEMBER_PUBLIC_SELECT = {
  ...PROJECT_MEMBER_ROSTER_SELECT,
  project: { select: { … } },
};
```

```ts
export interface ProjectMemberEntity extends ProjectMemberRosterEntry {
  project: ProjectMemberProjectSummary;
}
```

`toProjectMemberEntity` calls `toProjectMemberRosterEntry` for the same reason:
the employee mapping exists once, so the two payloads cannot end up describing
the same person differently. The relationship — *the flat resource is a roster
entry plus the project* — is stated in the code instead of being a convention
two files have to remember.

`ProjectMemberQueryDto extends ProjectMemberFilterDto` is the same split
`SortQueryDto` makes over `PaginationQueryDto`.

## Notes

- **Verified before completion.** `tsc --noEmit` clean, `nest build` clean,
  **693 tests passing across 47 suites** — 17 new, and Feature 013's existing
  tests unchanged, which is what confirms the flat endpoint still behaves
  exactly as documented.
- **No new dependency.** `supertest` was already a devDependency.
- **`/api/v1/project-members` is unchanged.** Same shape, same filters, same
  behaviour. It remains the endpoint for "what is this person working on" and
  for flat exports.
- **The roster is paginated**, like every other listing. A fifty-person project
  is normal; a two-hundred-person one is possible.

## Future Improvements

- **The inverse endpoint** — `GET /api/v1/employees/:employeeId/projects`,
  publishing the employee once and their projects as a list. It is the exact
  mirror of this feature and would be built the same way, from the same shared
  halves; it has not been written because nobody has asked for it, and one
  speculative endpoint is enough.
- **Sorting a roster by surname or seniority**, which needs an `orderBy` on the
  relation rather than on `project_members` — the same open point Feature 013
  recorded.
- **A summary block** (`total`, `active`, `managers`) beside the roster, if a
  project page wants counts without paging through the members.
- Guards and role checks, once authentication and authorization exist.
