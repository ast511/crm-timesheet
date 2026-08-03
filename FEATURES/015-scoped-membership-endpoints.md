# Feature 015 — Scoped Membership Endpoints

## Goal

Delete `/api/v1/project-members` and move every membership operation under the
resource that scopes it.

Features [013](013-project-members-module.md) and
[014](014-project-roster-endpoint.md) left the API with two ways to ask "who is
on this project" and two ways to ask "what is this person working on" — and the
worse of each pair repeated, on every row, the very thing the caller had just
named in the query string.

This feature removes the duplication at the root instead of adding another
endpoint on top of it. **Every endpoint is now scoped**, so no response ever
echoes back the id the caller supplied.

> The table is untouched. `project_members`, its composite key and its relations
> are exactly as Feature 013 left them. This is an API-surface change only.

## Requirements

- Memberships become a sub-resource of a project: read *and* write.
- One read-only mirror on the employee side.
- `/api/v1/project-members` is removed entirely, with its `?projectId=` and
  `?employeeId=` filters.
- No schema change, no migration, no seed change.

## Backend

### The endpoint map

| Before (013 / 014) | After |
| --- | --- |
| `GET /project-members?projectId=X` | `GET /projects/X/members` |
| `GET /project-members?employeeId=Y` | `GET /employees/Y/projects` |
| `GET /projects/X/members` | unchanged |
| `GET /project-members/X/Y` | `GET /projects/X/members/Y` |
| `POST /project-members` `{projectId, employeeId, …}` | `POST /projects/X/members` `{employeeId, …}` |
| `PATCH /project-members/X/Y` | `PATCH /projects/X/members/Y` |
| `DELETE /project-members/X/Y` | `DELETE /projects/X/members/Y` |
| `GET /project-members` (unscoped) | **removed** |

### Why the unscoped collection went

It was kept in 013 on a principle — *a resource should have a URL* — rather than
on a need, and the need never appeared. Reviewed honestly, `?projectId=`
answered exactly what `GET /projects/X/members` answers, and worse: an unknown
id returned an empty page instead of a `404`, and the answer carried one copy of
the project per row. `?employeeId=` had the identical problem mirrored.

What is genuinely lost is the *unfiltered* listing: "every membership in the
system", "every project manager across all projects", an export. Those are
**reporting** questions, and reporting was explicitly out of scope from Feature
013's brief onward. When a reporting module exists, the endpoint gets written
then — and by then its shape will be known rather than guessed.

### Controllers

Two, both hanging off paths that other modules own:

| Controller | Path | Routes |
| --- | --- | --- |
| `ProjectMembersController` | `projects` | roster, item read, create, update, delete |
| `EmployeeProjectsController` | `employees` | assignments list only |

Both are declared in `ProjectMemberModule`, not on `ProjectController` or
`EmployeeController`. Putting them there would make `ProjectModule` and
`EmployeeModule` depend on `ProjectMemberModule`, which already depends on both.
Only a `forwardRef` could break those cycles, and a `forwardRef` is a note that
the layering is wrong rather than a fix for it.

`ProjectMemberController` and `ProjectRosterController` were deleted; the latter
became `ProjectMembersController` when it absorbed the four operations the flat
controller used to serve.

### The write asymmetry

Writes live **only** on the project side. `/employees/:employeeId/projects` is
read-only.

This is a decision, not a consequence. Two write paths for one row is exactly
the duplication this feature removes, and "manage the team from the project" is
the natural reading — a project's membership list is a thing somebody
administers, while a person's assignment list is a view of it.

### Service

`ProjectMemberService` lost `findAll` and gained `findAssignments`; `create` now
takes the project from its caller rather than from the body. Every method is
scoped to one side, because every endpoint is.

## Frontend

Not touched.

## Database

**No schema change. No migration. No seed change.** `prisma validate` re-run to
confirm.

## API

### `GET /api/v1/projects/:projectId/members`

Unchanged from Feature 014: the project once, the members beside it, `meta`
describing the members. `404` for an unknown project.

### `GET /api/v1/employees/:employeeId/projects`

The mirror. The employee once — as the full `EmployeeEntity`, the same
representation `GET /api/v1/employees/:id` returns — then their projects.

```json
{
  "success": true,
  "data": {
    "employee": {
      "id": "cmsafiz05000mp8d5b6ktgz2z",
      "employeeCode": "EMP-0002",
      "firstName": "Maria",
      "lastName": "Ionescu",
      "…": "the full employee resource"
    },
    "projects": [
      {
        "project": {
          "id": "cmsd8u9r7000hawd5vzhfgfj1",
          "code": "WEBSITE",
          "name": "Company Website",
          "clientName": "Aurora Retail Group",
          "color": "#DB2777"
        },
        "isProjectManager": true,
        "joinedAt": "2024-05-06T00:00:00.000Z",
        "leftAt": "2024-11-29T00:00:00.000Z"
      }
    ],
    "meta": { "page": 1, "limit": 20, "total": 2, "…": "" }
  }
}
```

Both listings accept the same query string:

| Parameter | Values | Default |
| --- | --- | --- |
| `page` / `limit` | from the shared pagination DTO | `1` / `20` |
| `isProjectManager` | `true` / `false` | unfiltered |
| `activeOnly` | `true` | unfiltered |
| `sortBy` | `joinedAt`, `leftAt` | `joinedAt` |
| `sortOrder` | `asc` / `desc` | `asc` |

`?projectId=` and `?employeeId=` are now a **`400`** on both, via
`forbidNonWhitelisted`. A caller who sends one is asking for a scope the URL
already fixed.

### `POST /api/v1/projects/:projectId/members`

```json
{ "employeeId": "cmsafiz05000mp8d5b6ktgz2z", "isProjectManager": true }
```

`projectId` left the body. It is in the path, the same way `PATCH` and `DELETE`
have always carried it, and a body field would be a second place to say one
thing — two places that can disagree.

**The two sides now fail differently, and that is the point:**

| Problem | Status | Why |
| --- | --- | --- |
| `projectId` names no project | `404` | It came from the path: the collection being posted to does not exist. |
| `employeeId` names no employee | `400` | It came from the body: the collection is fine, the payload is wrong. |
| The pair is already a membership | `409` | Unchanged — the composite key. |
| `leftAt` before `joinedAt` | `400` | Unchanged. |

Before this feature both ids arrived in the body and both were a `400`. Moving
the project into the URL is what makes the `404` the honest answer, and it is
checked first — a request to a collection that does not exist is not a payload
problem.

### `GET`, `PATCH`, `DELETE` `/api/v1/projects/:projectId/members/:employeeId`

Same semantics as before, at the new path. `404` for a pair that is not a
membership.

### What every response under `/projects/:projectId/members` omits

The project. Not just on the list — on the item read, on the create, on the
update. The client wrote `:projectId` into the URL a moment ago; echoing it back
in the response is the same redundancy the roster removed, one row at a time.

## The entity, restructured

Feature 014 split the select and the mapper in two. Three shapes needed three,
so this feature split them into the pieces they were always made of:

```ts
const MEMBERSHIP_SELECT      = { isProjectManager, joinedAt, leftAt };
const MEMBER_EMPLOYEE_SELECT = { employee: { select: … } };
const MEMBER_PROJECT_SELECT  = { project:  { select: … } };

PROJECT_MEMBER_ROSTER_SELECT     = { ...MEMBERSHIP_SELECT, ...MEMBER_EMPLOYEE_SELECT };
PROJECT_MEMBER_ASSIGNMENT_SELECT = { ...MEMBERSHIP_SELECT, ...MEMBER_PROJECT_SELECT };
```

and the mappers compose the same way, from `toMembershipPeriod`,
`toEmployeeSummary` and `toProjectSummary`. No payload in the module can
describe the same person or the same project differently from another.

### What got deleted as dead

`ProjectMemberEntity`, `PROJECT_MEMBER_PUBLIC_SELECT`,
`ProjectMemberWithRelationsRow` and `toProjectMemberEntity` — the "both sides at
once" shape.

It existed only for the unscoped listing. Once every URL names one side, every
payload publishes the other, and a type no endpoint returns is dead weight.
That it fell out on its own is the clearest evidence the new shape is the right
one.

`ProjectMemberFilterDto`, introduced by Feature 014, was also removed: with the
id filters gone, it and `ProjectMemberQueryDto` had become the same class, so
the two were merged back under the name the other modules use.

## Route resolution

`routing.spec.ts` boots a real Nest application with all four controllers —
registered in the order `AppModule` registers their modules — and checks all
five paths through `supertest`:

| Request | Reaches |
| --- | --- |
| `/projects/prj-1` | `ProjectController.findOne` |
| `/projects/prj-1/members` | `ProjectMembersController.findRoster` |
| `/employees/emp-1` | `EmployeeController.findOne` |
| `/employees/emp-1/projects` | `EmployeeProjectsController.findAssignments` |
| `/project-members` | nothing — `404` |

Checked rather than asserted in a comment, because the failure mode is silent:
if `:id` ever swallowed a deeper path, `GET /projects/x/members` would return a
project instead of a roster and every unit test in all three modules would still
pass. The last row pins the removal itself, so the old collection cannot
reappear unnoticed.

## Files Created

| File | Purpose |
| --- | --- |
| `backend/src/modules/project-members/project-members.controller.ts` | All five operations, under `/projects/:projectId/members`. |
| `backend/src/modules/project-members/employee-projects.controller.ts` | The read-only mirror. |
| `backend/src/modules/project-members/entities/employee-projects.entity.ts` | `EmployeeProjectsEntity`. |
| `backend/src/modules/project-members/project-members.controller.spec.ts` | Delegation tests for the five routes. |
| `backend/src/modules/project-members/employee-projects.controller.spec.ts` | Delegation test for the mirror. |

## Files Deleted

| File | Why |
| --- | --- |
| `project-member.controller.ts` + spec | `/api/v1/project-members` is gone. |
| `project-roster.controller.ts` + spec | Became `project-members.controller.ts`. |
| `dto/project-member-filter.dto.ts` + spec | Merged back into `ProjectMemberQueryDto`. |

## Files Modified

| File | Change |
| --- | --- |
| `entities/project-member.entity.ts` | Split into three composable select pieces and three mappers; added the assignment shapes; deleted the both-sides shape. |
| `entities/project-roster.entity.ts` | Unchanged in shape; still the project side. |
| `dto/project-member-query.dto.ts` | Absorbed the shared filters; dropped `projectId` and `employeeId`. |
| `dto/create-project-member.dto.ts` | Dropped `projectId` — the path carries it. |
| `project-member.service.ts` | Removed `findAll`; added `findAssignments`; `create(projectId, dto)`; split the relation check into a `404` and a `400`. |
| `project-member.module.ts` | Two controllers, neither on a path of its own. |
| `project-member.service.spec.ts` | Rewritten against the scoped surface. |
| `routing.spec.ts` | Renamed from `project-roster.routing.spec.ts`; now covers both prefixes and the removal. |

`app.module.ts` was **not** touched: `ProjectMemberModule` is still registered,
it simply no longer owns a top-level path.

## Notes

- **Verified before completion.** `tsc --noEmit` clean, `nest build` clean,
  `prisma validate` clean, **693 tests passing across 46 suites**.
- **This is a breaking API change**, and deliberately taken now: nothing
  consumes these endpoints yet — there is no frontend — so the cost is zero
  today and permanent if deferred.
- **Three doc comments went stale in the move** and were corrected rather than
  left; a comment naming an endpoint that no longer exists is worse than no
  comment.
- The rule that one employee cannot hold two memberships of the same project
  still stands, and rejoining still means clearing `leftAt` — see
  [013](013-project-members-module.md).

## Future Improvements

- **A reporting endpoint** for the cross-cutting questions the unscoped
  collection used to be able to answer — all memberships, all project managers.
  It belongs to a reporting feature, with its own shape.
- **Writes on the employee side**, if assigning somebody from their own page
  ever becomes a real workflow. It would need a rule for which side wins, which
  is why it is not there now.
- **Sorting a roster by surname or seniority**, which needs an `orderBy` on the
  relation rather than on `project_members` — open since Feature 013.
- **A summary block** (`total`, `active`, `managers`) beside either listing.
- Guards and role checks, once authentication and authorization exist.
