# Feature 029 — Permission Management

**Status:** Completed
**Date:** 2026-08-06

## Goal

Let Super Admin, Admin and HR configure **fine-grained permissions** for
application users: an enterprise RBAC model with a per-user override layer,
exactly the shape the reference UI renders — a matrix of resources × actions,
quick-apply preset cards, and a per-user change history.

**This feature stores and resolves permission configuration. It does not enforce
it.** No guard, no decorator, no request is blocked, and no existing module's
endpoints were gated. Section [Why no enforcement](#why-no-enforcement-is-shipped)
is the argument, and it is the same split this project already applies:
Notification Management (027) stores what to say and the Delivery Engine (028)
sends it; Leave Configuration (021) stores the policy and Leave Requests (023)
consumes it.

Also not included, and deliberately: authentication, login, JWT, sessions, a
`@RequirePermission()` guard, runtime CRUD for the catalog or the presets, and
any frontend.

## Requirements

- A seeded permission catalog of `(resource, action)` pairs, addressable by a
  stable key such as `TIMESHEET.CREATE`.
- A role baseline reusing the existing `UserRole` enum — no second role
  vocabulary, no new enum values.
- Named presets as their own tables, listable with a count and a target role.
- A per-user override layer that stores **only** deviations from the baseline.
- One tested service method that resolves an effective permission set.
- A full old → new audit trail, written in the same transaction as the change.
- Pagination, search, filtering and sorting reusing
  [Feature 006](006-shared-backend-infrastructure.md).
- The caller taken from the `@CurrentUser()` placeholder of
  [Feature 026](026-notification-center.md); no user hardcoded anywhere.
- Controllers thin, rules in the services, Prisma nowhere else.

## Decisions taken before implementation

Five points where the specification met an existing project rule or a question
only the user could settle. The first was put to the user and answered before any
seed was written; the rest are recorded because a reader will otherwise wonder.

| Question | Decision | Why |
| --- | --- | --- |
| Should `SUPERADMIN` have a seeded baseline "the same as ADMIN"? | **No — it stays a total bypass, and nothing is seeded for it** (user's decision, after the question was raised) | A seeded copy of `ADMIN`'s set would tie the super-admin to whatever `ADMIN` happens to hold, so the day `ADMIN` is restricted — which is the point of having tiers — the super-admin is silently restricted with it. The bypass holds every permission in the catalog *independently*, including permissions a future migration adds, and there is no dead data for a resolution branch to ignore. |
| `TEAMS` as a resource, as the specification listed? | **`DEPARTMENTS`** (user's correction) | There is no team in this system; there are departments ([Feature 007](007-departments-module.md)). Naming a permission after a screen that does not exist would leave an administrator granting something they could not find. Project rosters are not a resource of their own either — a membership is part of the project it is on, so it lives under `PROJECTS`. |
| One controller/service, as specified? | **Two controllers, two services, no repository** | They answer different questions — *what can be granted* and *what has been granted to whom* — and they cannot share a `@Controller()` prefix, since the per-user routes are mounted on `users/:id/permissions`. The repository is absent for the reason `ReminderService` has none: the queries share no predicate, so a layer between the services and Prisma would be a file that forwarded arguments. |
| Presets as extra `UserRole` values? | **Their own two tables** | A role is *who somebody is*, stored on their account and read by four other features; a preset is *a set of permissions somebody named*, applied once and then irrelevant. Spelling "HR - View Only" as a role would put six values into an enum other features branch on, and would make a person's role change every time their permissions were adjusted. |
| `PUT` or `PATCH` for the matrix? | **`PUT`, with the full intended set** | A `PATCH` of grants and revocations would require every client to hold a correct copy of the role baseline in order to compose one — and the day a baseline changed, every open tab would be diffing against a stale copy. Sending the intended state lets the server, which owns the baseline, do the only calculation that depends on it. It also makes the endpoint idempotent all the way down to the history. |

## Database

Four enums, six tables. The migration is purely additive: no existing column is
dropped, narrowed or back-filled.

### The permission catalog — `Permission`

Table `permissions`. One row per `(resource, action)` pair.

| Column | Type | Notes |
| --- | --- | --- |
| `id` | `String` cuid | |
| `key` | `String` **unique** | `RESOURCE.ACTION`, e.g. `TIMESHEET.CREATE` |
| `resource` | `PermissionResource` | The matrix rows |
| `action` | `PermissionAction` | The matrix columns |
| `label` | `String` | What the cell says |
| `description` | `String?` | Written only where the label is not enough |
| `created_at` / `updated_at` | `DateTime` | |

Three things about it are worth recording.

**The catalog is seeded, not CRUD-managed.** There is no `POST /permissions` and
no `DELETE /permissions/:id`. A permission row is meaningless unless something in
the application actually checks it, so inventing one through an API would put a
cell on the matrix screen that nothing anywhere reads. New permissions arrive
with the feature that enforces them — as a seed entry and a migration — which is
the call [Feature 003](003-prisma-orm-setup.md) already recorded for how roles
and permissions would be added.

**`key` is stored, not derived on every read.** It is what an API body quotes,
what the audit line displays, what `?search=` matches, what the seeds resolve ids
by, and what a future `@RequirePermission('TIMESHEET.CREATE')` will name. One
literal, not a formatting convention five layers repeat. The format has a single
definition — `permissionKey()` in `entities/user-permission-matrix.entity.ts` —
which the seed imports rather than spelling out again.

**Only the meaningful pairs exist.** Twelve resources × seven actions would be
eighty-four rows and most would be nonsense: `DASHBOARD.DELETE` names nothing,
`WORK_SCHEDULE.CREATE` names a second copy of a table that holds exactly one row.
**Fifty-five** are seeded; the matrix screen renders an empty cell where a pair
does not exist, which is the honest drawing of "this cannot be granted because it
cannot be done".

### The role baseline — `RolePermission`

Table `role_permissions`. `id`, `role` (`UserRole`), `permission_id`,
`created_at`. Unique on `(role, permission_id)`.

**`SUPERADMIN` is not stored here and must never be** — see
[The SUPERADMIN bypass](#the-superadmin-bypass). The role is the existing
`UserRole` rather than a second vocabulary, the call
[Feature 026](026-notification-center.md) already makes with `recipient_role`: a
`permission_roles` table would let `users.role` and a role row disagree about who
somebody is, and every query joining a person to their permissions would
translate between two spellings of `admin` forever.

There is no runtime API for this table either. Changing what a *role* means is a
decision about the product, not about one person — the per-user override is how
one person is treated differently.

No `updated_at`: a binding is not editable, so the column would only ever repeat
`created_at`.

### Presets — `PermissionPreset` and `PermissionPresetItem`

Tables `permission_presets` (`id`, `key` unique, `name`, `description`,
`target_role`, timestamps) and `permission_preset_items` (`id`, `preset_id`,
`permission_id`, `created_at`, unique on the pair).

`target_role` **groups the cards on the screen and constrains nothing**: a preset
may be applied to any account that is not a super-admin, because "give this
particular `USER` what an HR person gets" is a real thing an administrator does,
and refusing it would send them to toggle thirty-five cells by hand.
`SUPERADMIN` is not a target of any card — that role already holds everything.

Items are a join table rather than an array of keys on the preset, because each
entry is a *foreign key*: an array of strings would be a relation the database
could not enforce, so a preset could name a permission that had since been
renamed and nothing would notice until somebody applied it.

**Applying a preset stores no link back to it.** The user's overrides are
recomputed so their effective set equals the preset, and the fact that a preset
was the reason lives in the audit log. A column claiming "this user is on HR -
Standard" would stop being true the moment somebody toggled one cell, and would
then be a label disagreeing with the matrix underneath it.

### The per-user override — `UserPermissionOverride`

Table `user_permission_overrides`. `id`, `user_id`, `permission_id`, `effect`
(`GRANT` / `REVOKE`), timestamps. Unique on `(user_id, permission_id)`.

**Only the deviation is stored, never a copy of the matrix.** A user whose
permissions are exactly their role's has zero rows here; a user given one extra
permission has exactly one. That is the feature's central storage decision, and
it earns three things:

1. the table stays proportional to the *exceptions* an organisation actually
   makes rather than to (users × 55);
2. "reset this person to their role" is one `DELETE … WHERE user_id = …`, an
   operation that cannot half-succeed, instead of a rewrite of every row to match
   a baseline read from somewhere else;
3. **most importantly, a change to a role baseline reaches everybody it should.**
   With the full matrix copied per user, the day `HR` gained a permission every
   existing HR user would keep the frozen copy taken when their account was set
   up, and the new grant would apply only to people hired afterwards. Storing the
   exception means the baseline is read fresh every time and the exception
   survives on top of it.

An override that *agrees* with the baseline is therefore never written. The
service normalises every submitted matrix against the role before persisting, so
a `GRANT` of something the role already gives is dropped rather than stored — it
states a fact the baseline already states, and the two copies would disagree the
moment the baseline changed.

`updated_at` is kept here, unlike on the two join tables, because this row
genuinely changes: flipping a cell updates `effect` in place rather than deleting
and re-inserting, so "when was this exception last touched" is answerable and
`created_at` keeps saying since when it has been in force.

### The audit trail — `PermissionAuditLog`

Table `permission_audit_logs`.

| Column | Type | Notes |
| --- | --- | --- |
| `id` | `String` cuid | |
| `target_user_id` | `String` | Whose permissions changed. **Cascade** |
| `changed_by_user_id` | `String` | Who changed them, from `@CurrentUser()`. **Restrict** |
| `permission_id` | `String?` | Null on the two summary actions |
| `action` | `PermissionAuditAction` | |
| `previous_effect` | `PermissionEffect?` | Override state before |
| `new_effect` | `PermissionEffect?` | Override state after |
| `preset_id` | `String?` | Set on `PRESET_APPLIED` |
| `created_at` | `DateTime` | No `updated_at`: a record of a moment is never edited |

**Each row is a transition, not a snapshot.** `previous_effect → new_effect` is
the whole content: `null → GRANT` is a permission added on top of the role,
`REVOKE → null` is an exception withdrawn so the role applies again. A snapshot
per change would grow by fifty-five rows per click and still not say what moved.

**Audit rows share the transaction with the overrides they describe.** A history
written separately is a second statement about one event, and the run where the
second statement failed would leave a permission granted with nothing recording
who granted it — the one question an audit trail exists to answer.

`permission_id` is nullable and exactly two of the five actions leave it null:
`PRESET_APPLIED` and `RESET_TO_ROLE` are summaries of a whole operation, written
once beside the per-permission rows that make it up and sharing their timestamp
to the millisecond. A separate summary table would mean the History tab reading
two tables and interleaving them by timestamp to render one list.

### The four enums

- `PermissionResource` — 12 values, the matrix rows. They name *screens* rather
  than tables: `LEAVES` (the configuration HR maintains) and `LEAVE_REQUESTS`
  (what employees file against it) are two of them because no useful permission
  set grants both together, and `NOTIFICATION_CONFIG` is Feature 027's reminders
  and campaigns rather than Feature 026's inbox — reading your own notifications
  is not a permission anybody is denied.
- `PermissionAction` — 7 values, the matrix columns. `PAGE_ACCESS` and `VIEW` are
  deliberately two: reaching a screen and reading the records on it are different
  grants, and folding them together would make the narrower unstatable.
  `CONFIGURE` is likewise not `EDIT` — editing changes a record, configuring
  changes the *rules* records are judged by.
- `PermissionEffect` — `GRANT` / `REVOKE`. No third value, because an override
  that agrees with the baseline is the absence of one.
- `PermissionAuditAction` — three per-permission transitions, two whole-operation
  summaries.

### Foreign keys

Every reference to `permissions` is **RESTRICT**: the catalog outlives its
bindings, its presets, the exceptions taken against it and the history that names
it. `permission_preset_items.preset_id` and `user_permission_overrides.user_id`
are **CASCADE** — an item is part of its preset, and an override says nothing
once the account it qualifies is gone.

The two user references on the audit log are **deliberately asymmetric**, and it
is the decision worth reading twice:

- **`target_user_id` cascades.** The history is only read through
  `GET /users/:id/permissions/history`, a route scoped to an account: once the
  account is deleted the rows are unaddressable, the overrides they describe have
  cascaded away, and keeping them would preserve a history of a state that no
  longer exists while making the account undeletable. It would also silently
  change what `DELETE /users/:id` means — [Feature 009](009-users-module.md)
  refuses that call only when an employee is linked. The trade-off is real: a
  compliance regime requiring permission changes to outlive the account needs an
  append-only export or a nullable target, and that is recorded in
  [Future Improvements](#future-improvements).
- **`changed_by_user_id` restricts**, the schema's standing rule for every
  reference to a person that records something somebody *did*
  (`notification_campaigns.created_by_employee_id`,
  `leave_request_replacements.employee_id`). Granting a permission is an act, and
  the act outlives the actor's account: an administrator cannot be deleted out
  from under the record of what they authorised, which is the difference between
  an audit trail and a list.

### Indexes

| Index | Why |
| --- | --- |
| `permissions(key)` unique | The addressable name every other layer quotes |
| `permissions(resource, action)` | The catalog's three filter shapes and its default order |
| `role_permissions(role, permission_id)` unique | One binding per role per permission |
| `permission_presets(key)` unique, `(target_role)` | The list filter |
| `permission_preset_items(preset_id, permission_id)` unique | Listing twice would double the count the cards render |
| `user_permission_overrides(user_id, permission_id)` unique | Makes "the exception" a singular noun; leads with `user_id`, so it also serves every effective resolution |
| `permission_audit_logs(target_user_id, created_at)` | The history read, filter and sort in one scan |
| `role_permissions(permission_id)`, `permission_preset_items(permission_id)`, `user_permission_overrides(permission_id)`, `permission_audit_logs(changed_by_user_id / permission_id / preset_id)` | Foreign keys the composites do not lead with; each is read backwards by a `RESTRICT`ed delete |

**There is deliberately no separate index on `user_permission_overrides(user_id)`,**
although the specification listed one: the unique index above already leads with
that column, so a second one would duplicate it and cost writes for nothing.
`permission_id` is indexed instead, which is the foreign key the composite cannot
serve.

## The effective-resolution algorithm

One method — `PermissionService.resolveEffective(userId, role)` — and every
endpoint that reports an effective set calls it.

```text
  if role == SUPERADMIN:
      effective = every permission in the catalog          (readOnly)
  else:
      baseline  = RolePermission[role]
      effective = (baseline ∪ GRANT overrides) − REVOKE overrides
```

It returns **every** catalog permission, granted or not, each with a `source`:

| `source` | Meaning |
| --- | --- |
| `SUPERADMIN` | Granted because the account is a super-admin; nothing stored, nothing editable |
| `ROLE` | Granted by the baseline, no exception recorded |
| `OVERRIDE_GRANT` | Granted although the role does not grant it |
| `OVERRIDE_REVOKE` | **Not** granted although the role does — the value that makes a removal distinguishable from something nobody ever had |
| `NONE` | Not granted, and no exception |

`source` is derived on every read and never stored: a stored copy is the one that
would go stale the day a role baseline changed.

**Why it lives in exactly one place.** An effective set computed in two places is
two answers to one question, and the day they disagree the screen shows a
permission the enforcement layer does not grant. `/permissions/me/effective`,
`GET /users/:id/permissions` and the matrix returned by each of the three write
endpoints all come out of this method; `/me/effective` reduces it to the granted
keys with a `filter`, because the long list cannot be derived from the short one.
When Permission Enforcement is written, its guard calls this method too.

The role is a *parameter* rather than something the method looks up: two callers
know it already and for different reasons — the caller's own role comes from
`@CurrentUser()`, the target's from the users module, which owns that table — so
reading it here would add a query to one path and a second source of truth to the
other.

## The SUPERADMIN bypass

A super-admin holds every permission, and **its set is neither stored nor
editable**. Three consequences, all deliberate:

1. **Nothing is seeded into `role_permissions` for it.** The set is a statement
   about what the role *is* — the account that can always fix the system,
   including a matrix somebody has locked themselves out of — rather than a
   configuration somebody made. Seeded as rows it would become editable, and the
   first edit would create a super-admin who could no longer administer. It would
   also tie the super-admin to whatever `ADMIN` holds today, so restricting
   `ADMIN` would silently restrict the super-admin with it.
2. **The resolution branch reads nothing.** It does not query `role_permissions`
   or `user_permission_overrides`, because a super-admin has rows in neither and
   never will. A permission added by a future migration is held the day it
   exists, with no seed to remember to update.
3. **All three write endpoints refuse a super-admin target with a `409`.**
   Persisting a `REVOKE` against an account whose resolution never reads
   overrides would store an exception that silently did nothing, and the screen
   would then show a permission removed while the account still held it. The
   status is a `409` rather than a `403` because it is a statement about the
   state of the resource, not about who is asking — the call
   `NotificationCampaignService` makes for a campaign that has already been sent.
   When authorization exists, "may this caller edit permissions at all" will be a
   `403` raised elsewhere, and the two will not be confusable.

`GET /users/:id/permissions` on a super-admin returns every permission granted,
sourced `SUPERADMIN`, with `readOnly: true` — the crown state the UI renders.

## The seeded sets

### Catalog — 55 permissions

```text
                        PAGE  VIEW  CREATE  EDIT  DELETE  APPROVE  CONFIGURE
  DASHBOARD              x     x                                              2
  TIMESHEET              x     x     x      x      x        x                 6
  EMPLOYEES              x     x     x      x      x                          5
  LEAVE_REQUESTS         x     x     x      x      x        x                 6
  REPORTS                x     x                                              2
  PROJECTS               x     x     x      x      x                          5
  LEAVES                 x     x     x      x      x                 x        6
  WORK_SCHEDULE          x     x            x                        x        4
  PUBLIC_HOLIDAYS        x     x     x      x      x                          5
  DEPARTMENTS            x     x     x      x      x                          5
  NOTIFICATION_CONFIG    x     x     x      x      x                          5
  PERMISSIONS            x     x            x                        x        4
                                                                             55
```

`WORK_SCHEDULE` has no `CREATE`/`DELETE` — it is one row for the whole company.
`DASHBOARD` and `REPORTS` are read-only — both render other tables and store
nothing. `PERMISSIONS` has no `CREATE`/`DELETE` — the catalog and the presets are
seeded, so the only writes the screen performs are to a person's matrix (`EDIT`)
and the two bulk operations (`CONFIGURE`).

### Role baselines

```text
  USER    16 of 55   their own work
  HR      35         + the people side, read and write, no deletes
  ADMIN   46         + the administration screens
  SUPERADMIN         every permission, by resolution — nothing seeded
```

**`USER` (16)** — the minimal set: `DASHBOARD.{PAGE_ACCESS,VIEW}`,
`TIMESHEET.{PAGE_ACCESS,VIEW,CREATE,EDIT,DELETE}`,
`LEAVE_REQUESTS.{PAGE_ACCESS,VIEW,CREATE,EDIT,DELETE}`,
`PROJECTS.{PAGE_ACCESS,VIEW}`, `PUBLIC_HOLIDAYS.{PAGE_ACCESS,VIEW}`.

"Their own" is not expressed in these permissions, and cannot be:
`TIMESHEET.EDIT` says somebody may edit a timesheet, not whose. Scoping to the
holder's own records is a rule about *rows* rather than about capabilities, and a
matrix of (resource × action) cannot state it — a `TIMESHEET.EDIT_OWN` beside
`TIMESHEET.EDIT` would double the catalog to express one idea. The modules
already scope their own endpoints (`/me/...`); Permission Enforcement will
combine the two, with this set saying *what* and the route saying *whose*.

`PROJECTS` and `PUBLIC_HOLIDAYS` are read-only here because an employee filling
in a timesheet has to pick a project and one booking leave has to see which days
the office is closed. `WORK_SCHEDULE` is absent: the hours that constrain an
entry are shown by the timesheet screen itself.

**`HR` (35)** = `USER` + `EMPLOYEES.{PAGE_ACCESS,VIEW,CREATE,EDIT}` +
`LEAVES.{PAGE_ACCESS,VIEW,CREATE,EDIT}` + `REPORTS.{PAGE_ACCESS,VIEW}` +
`DEPARTMENTS.{PAGE_ACCESS,VIEW,CREATE,EDIT}` +
`WORK_SCHEDULE.{PAGE_ACCESS,VIEW}` + `PUBLIC_HOLIDAYS.{CREATE,EDIT}` +
`LEAVE_REQUESTS.APPROVE`. No `DELETE` at all — that is the line the tier draws.
`LEAVE_REQUESTS.APPROVE` is here and `TIMESHEET.APPROVE` is not: approving leave
is HR's job, signing off a timesheet belongs to whoever manages the work.

**`ADMIN` (46)** = `HR` + `TIMESHEET.APPROVE` +
`NOTIFICATION_CONFIG.{PAGE_ACCESS,VIEW,CREATE,EDIT}` +
`PERMISSIONS.{PAGE_ACCESS,VIEW}` + `PROJECTS.{CREATE,EDIT}` +
`WORK_SCHEDULE.EDIT` + `LEAVES.CONFIGURE`.

What it withholds is statable in one sentence, which is why the tier is worth
having: **no deletes on the directory and configuration resources, no
`WORK_SCHEDULE.CONFIGURE`, and no writing of permissions.** Exactly nine cells —
`EMPLOYEES.DELETE`, `PROJECTS.DELETE`, `LEAVES.DELETE`,
`WORK_SCHEDULE.CONFIGURE`, `PUBLIC_HOLIDAYS.DELETE`, `DEPARTMENTS.DELETE`,
`NOTIFICATION_CONFIG.DELETE`, `PERMISSIONS.EDIT`, `PERMISSIONS.CONFIGURE` — each
an act whose consequences outlive the click.

`PERMISSIONS.EDIT` and `PERMISSIONS.CONFIGURE` are held by **no** baseline, which
is deliberate: managing what other people may do is an explicit grant, made one
account at a time through the "Admin - Full Access" preset or a per-user
override. A super-admin holds both regardless, by the bypass, so the system is
never left with nobody able to administer it.

### Presets — 6 cards, 243 items

```text
  HR - View Only       26 of 55   see the HR side, change nothing
  HR - Standard        35         + the day-to-day HR work           = HR baseline
  HR - Full Access     41         + deletes, leave policy, timesheet approval
  Admin - Limited      40         HR - Standard + approvals + admin reads
  Admin - Standard     46         + the admin writes                 = ADMIN baseline
  Admin - Full Access  55         the entire catalog
```

- **HR - View Only** = `USER` + `PAGE_ACCESS`/`VIEW` on `EMPLOYEES`, `LEAVES`,
  `REPORTS`, `DEPARTMENTS`, `WORK_SCHEDULE`. Not one write.
- **HR - Standard** = HR - View Only + `EMPLOYEES.{CREATE,EDIT}`,
  `LEAVE_REQUESTS.APPROVE`, `LEAVES.{CREATE,EDIT}`,
  `PUBLIC_HOLIDAYS.{CREATE,EDIT}`, `DEPARTMENTS.{CREATE,EDIT}`.
- **HR - Full Access** = HR - Standard + `TIMESHEET.APPROVE`,
  `EMPLOYEES.DELETE`, `LEAVES.{DELETE,CONFIGURE}`, `PUBLIC_HOLIDAYS.DELETE`,
  `DEPARTMENTS.DELETE`. It stops at the administration half.
- **Admin - Limited** = HR - Standard + `TIMESHEET.APPROVE`,
  `NOTIFICATION_CONFIG.{PAGE_ACCESS,VIEW}`, `PERMISSIONS.{PAGE_ACCESS,VIEW}`.
- **Admin - Standard** = Admin - Limited + `PROJECTS.{CREATE,EDIT}`,
  `LEAVES.CONFIGURE`, `WORK_SCHEDULE.EDIT`,
  `NOTIFICATION_CONFIG.{CREATE,EDIT}`.
- **Admin - Full Access** = the whole catalog, derived from it rather than
  listed, so it stays complete the day a permission is added.

**Two of the six are exactly a role baseline**, and that is the property that
makes the model coherent: applying "HR - Standard" to a fresh `HR` account leaves
it with *no overrides at all*, because the intended set and the baseline agree
everywhere. The sets are defined once in `prisma/seeds/permission-sets.ts` and
imported by both the baseline seed and the preset seed — two copies would be two
lists, and the first edit to one would make the preset start writing exceptions
on accounts that already held the permissions.

**The sets nest**, deliberately: each is a superset of the one above it in its
column, so moving somebody up a tier only ever adds. Verified: `USER ⊂
HR - View Only ⊂ HR - Standard ⊂ {HR - Full Access, Admin - Limited} ⊂
Admin - Standard ⊂ Admin - Full Access`.

Nothing seeds a `UserPermissionOverride` or a `PermissionAuditLog`: those are
runtime data, and inventing one would put an exception on a development account
that nobody made.

## API

All under `/api/v1`. Every response goes through Feature 006's envelope.

### `GET /permissions`

The catalog, blocked by resource so the matrix renders without a client-side
reduce.

Query: `?page=&limit=&search=&resource=&action=&sortBy=&sortOrder=`.
`sortBy ∈ {resource, action, key}`, default `resource`; search is
case-insensitive over `key` and `label`.

```jsonc
{
  "success": true,
  "data": {
    "items": [
      {
        "resource": "TIMESHEET",
        "permissions": [
          { "id": "…", "key": "TIMESHEET.PAGE_ACCESS", "resource": "TIMESHEET",
            "action": "PAGE_ACCESS", "label": "Page access", "description": null,
            "createdAt": "…", "updatedAt": "…" }
        ]
      }
    ],
    "meta": { "page": 1, "limit": 20, "total": 55, "totalPages": 3, … }
  }
}
```

**`meta` describes permissions, not groups** — `page` and `limit` select
permission rows, which is the only unit for which `total` can be honest. The
grouping is a view of the page, so a resource whose actions straddle a page
boundary appears on both pages with the actions that page carries. In practice no
client meets it: the catalog is 55 rows against a cap of 100, so `?limit=100`
returns the whole matrix in one request.

The default sort is `resource` rather than the project-wide `createdAt`, because
a catalog is a matrix and the only order that means anything is the one it is
drawn in. `action` is applied as a secondary sort so a resource's cells never
come back shuffled.

### `GET /permissions/presets`

Query: `?page=&limit=&targetRole=`. No `?sortBy=` and no `?sortOrder=`: six fixed
cards in two groups, ordered by `targetRole` (`ADMIN` before `HR`, the enum's
declaration order) then `name`.

```jsonc
{ "id": "…", "key": "HR_FULL_ACCESS", "name": "HR - Full Access",
  "description": "…", "targetRole": "HR", "permissionCount": 41,
  "createdAt": "…", "updatedAt": "…" }
```

### `GET /permissions/me/effective`

The caller's own effective set, as a flat list of keys — **the endpoint a
frontend gates its UI on**. Reads `x-user-id` and `x-user-role` through
`@CurrentUser()`.

```jsonc
{ "userId": "usr-1", "role": "HR", "readOnly": false,
  "permissions": ["DASHBOARD.PAGE_ACCESS", "…"], "total": 35 }
```

Deliberately the smallest possible payload: a client turns it into a `Set` once
and asks `has('TIMESHEET.CREATE')` thereafter. Sending the whole matrix would
tempt a client into branching on `source`, which is an administrator's concern
rather than a renderer's.

### `GET /users/:id/permissions`

The user's matrix: every catalog permission with `granted` and `source`, grouped
by resource. Never paginated — a matrix is meaningless in pieces.

```jsonc
{ "userId": "usr-1", "role": "HR", "readOnly": false,
  "grantedCount": 36, "totalCount": 55,
  "resources": [
    { "resource": "TIMESHEET",
      "permissions": [
        { "…": "…", "key": "TIMESHEET.APPROVE", "granted": true,
          "source": "OVERRIDE_GRANT" }
      ] }
  ] }
```

A super-admin target comes back fully granted, sourced `SUPERADMIN`, with
`readOnly: true`. `404` for an id matching no account.

### `PUT /users/:id/permissions`

Body: `{ "permissionKeys": ["TIMESHEET.VIEW", "…"] }` — the **full intended
matrix**, not a list of changes. May be empty; keys are trimmed and must be
unique.

The service rejects a super-admin target (`409`), normalises the submitted set
against the role baseline, persists only genuine deviations, deletes overrides
that no longer deviate, and writes one audit row per changed permission — all in
one transaction. Returns the resulting matrix, which is not always the matrix
that was asked for: a submitted permission the role already grants produces no
exception at all, and that is precisely the case a client cannot work out for
itself.

Errors: `400` naming every unknown key (`Permission "PAYROLL.RUN" does not
exist`), `400` naming `x-user-id` if the caller's own account does not exist,
`409` on a super-admin target, `404` on an unknown user.

**Idempotent.** The same body twice leaves the same overrides *and* writes no
second batch of history — the diff is computed before the transaction is opened,
and an empty diff skips it entirely.

`{ "permissionKeys": [] }` is a legitimate request meaning "hold nothing", which
revokes everything the role grants. It is deliberately **not** the same as
`DELETE`, which removes the exceptions so the role applies in full; the two are
opposite ends of the same axis.

### `POST /users/:id/permissions/apply-preset`

Body: `{ "presetKey": "HR_FULL_ACCESS" }`. Replaces the user's overrides so the
effective set equals the preset. Answers `201` with the resulting matrix.

A **replace, not a merge**: applying "HR - View Only" to somebody who had three
extra permissions removes those three, because otherwise "what does this preset
give somebody" would have as many answers as there are people it is applied to.
`targetRole` is not checked against the user's role.

Writes a `PRESET_APPLIED` summary row naming the preset **plus** the
per-permission diff rows, in one transaction. The summary is written even when
the diff is empty — applying a preset is an act somebody performed, and a history
that omitted it would leave an administrator wondering whether the click
registered. (`PUT` is a declaration of state, so a `PUT` that changes nothing is
nothing.)

Errors: `404` naming an unknown preset key, `409` on a super-admin target.

### `DELETE /users/:id/permissions`

Reset to role: clears every exception. Answers `200` with the resulting matrix
rather than `204` — Feature 006's call, and useful here because a reset is
exactly the case where the screen needs redrawing.

Expressed internally as "intend the baseline" rather than a bare `deleteMany`, so
the deletion goes through the same normalisation as every other write and the
per-permission `OVERRIDE_CLEARED` rows come out of the same diff. Writes a
`RESET_TO_ROLE` summary even for a user who had no exceptions. `409` on a
super-admin target.

### `GET /users/:id/permissions/history`

Query: `?page=&limit=&action=&sortBy=createdAt&sortOrder=`. Newest first by
default — the second list in this project to depart from the shared ascending
default, for the reason the notification centre does: a history is a feed.

```jsonc
{ "id": "aud-1", "action": "PERMISSION_GRANTED",
  "permission": { "id": "…", "key": "EMPLOYEES.VIEW", "resource": "EMPLOYEES",
                  "action": "VIEW", "label": "View" },
  "preset": null, "previousEffect": null, "newEffect": "GRANT",
  "changedBy": { "id": "usr-2", "email": "…", "username": "MIO" },
  "createdAt": "2026-08-06T12:00:00.000Z" }
```

No `?search=`: a history row holds no free text — every field is an enum, a
foreign key or a timestamp. No `?changedByUserId=` either: "everything this
administrator did" spans users and belongs on a route that is not scoped to one
account. `404` for an unknown user rather than an empty page, because an empty
history is a real state that most accounts have.

`changedBy` resolves to an **account** rather than an employee, unlike a
campaign's author: permissions are held by accounts, and not every account has an
employment record — a super-admin created to administer the system would
otherwise render as null on the very screen that records what they did.

## Why no enforcement is shipped

**Authentication does not exist.** `@CurrentUser()` reads `x-user-id` and
`x-user-role` from headers, which any caller may set to anything. A
`@RequirePermission()` guard on top of that would resolve the permissions of
whoever the request *claimed* to be and refuse or admit accordingly — a check
that reads as protection while providing none, and one the first penetration test
would find in a minute. Worse, it would make every subsequent feature *feel*
protected, so the missing half would stop being obvious.

This is the same split the project already applies at every layer: 027 stores
what to say and 028 sends it; 021 stores leave policy and 023 consumes it. Here:

```text
  permission-management   who may do what             (this feature)
  authentication          who the caller actually is  (not written)
  permission enforcement  refusing the request        (not written)
```

What ships instead is `GET /permissions/me/effective`, for soft UI gating. Hiding
a button is a courtesy to the person using the screen, honestly labelled as such,
and it is exactly the part of enforcement that does not depend on the caller
being who they say they are.

**No guard, no decorator, and no dead code.** A `@RequirePermission()` that
nothing applies would be unexercised code the feature which finally needs it
would have to audit before trusting.

### The intended guard, designed and not implemented

```ts
// src/common/decorators/require-permission.decorator.ts   (NOT WRITTEN)
export const REQUIRED_PERMISSION = 'requiredPermission';

export const RequirePermission = (key: string) =>
  SetMetadata(REQUIRED_PERMISSION, key);
```

```ts
// src/common/guards/permission.guard.ts                   (NOT WRITTEN)
@Injectable()
export class PermissionGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly permissions: PermissionService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const required = this.reflector.getAllAndOverride<string>(
      REQUIRED_PERMISSION,
      [context.getHandler(), context.getClass()],
    );

    if (required === undefined) {
      return true;                       // an ungated route stays ungated
    }

    // Once authentication exists this is `request.user`, populated from a
    // verified token — the same object `resolveCurrentUser` returns today.
    const user = resolveCurrentUser(context.switchToHttp().getRequest());

    const { permissions } = await this.permissions.resolveEffective(
      user.userId,
      user.role,
    );

    const granted = permissions.some(
      (cell) => cell.key === required && cell.granted,
    );

    if (!granted) {
      throw new ForbiddenException(`${required} is required`);
    }

    return true;
  }
}
```

Applied as `@RequirePermission('TIMESHEET.APPROVE')` on the handlers of the
existing modules. Three things about the design are settled now so the later
feature does not have to relitigate them:

1. **It calls `resolveEffective` rather than reimplementing three lines it can
   see.** That is the whole reason the method is public and the module exports
   `PermissionService`.
2. **It reads the caller through the same seam every controller does.** When
   `resolveCurrentUser` starts reading a verified token instead of headers, the
   guard changes in no way at all.
3. **It will need a per-request cache.** `resolveEffective` runs three queries;
   on a gated route that is three queries per request. A request-scoped memo — or
   a permission set placed on the token at login — is the obvious answer, and it
   is a decision for the feature that measures it rather than one to guess now.

## How a future Authentication + Enforcement feature reuses this

- **`Permission`** is the vocabulary the guard's argument is drawn from. A
  `@RequirePermission('TIMESHEET.APPROVE')` names a `key` that already exists,
  and a typo is a permission nobody holds rather than a silently open route —
  which is an argument for a generated union type over the catalog, listed under
  [Future Improvements](#future-improvements).
- **`RolePermission`** stays the baseline, unchanged. Authentication adds *who
  the role belongs to*, not what it grants.
- **`UserPermissionOverride`** stays the exception layer, unchanged. Nothing
  about enforcement changes what is stored.
- **`resolveEffective`** becomes the guard's single call, and — usefully — the
  natural place for a login to build the permission set it puts on a token: the
  claim and the check would then come from one function, so a token can never
  claim a permission the resolution would deny.
- **`PermissionAuditLog.changedByUserId`** starts holding a *verified* identity
  instead of a claimed one, with no schema change and no code change in this
  module: it already comes from `@CurrentUser()` on every path.

## Backend

```text
src/modules/permission-management/
├── permission-management.module.ts
├── permission-management.constants.ts
├── permission-management.rules.ts
├── permission.controller.ts          /permissions
├── permission.service.ts             catalog, presets, resolveEffective
├── user-permission.controller.ts     /users/:id/permissions
├── user-permission.service.ts        writes, audit, matrix
├── dto/
└── entities/
```

`PermissionService` reads, `UserPermissionService` writes and calls it. The
per-user controller is mounted at `users/:id/permissions` — the URL of the thing
the sub-resource belongs to, [Feature 015](015-scoped-membership-endpoints.md)'s
shape — while `UserController` is untouched.

**`UserModule` is the only import**, for exactly one fact: which role an account
holds. `UserService.findRole()` was added for it — a purely additive read,
following the pattern Feature 028 used when the delivery engine needed three
methods on `NotificationCampaignService`. `EmployeeModule` is deliberately
absent: permissions are held by accounts, not by employment records.

## Frontend

None. Backend only, as specified.

## Files Created

| File | Purpose |
| --- | --- |
| `backend/prisma/migrations/20260806120000_add_permission_management/migration.sql` | Four enums, six tables, fourteen indexes, nine foreign keys |
| `backend/prisma/seeds/permissions.seed.ts` | The 55-permission catalog and the `PermissionKey` literal union |
| `backend/prisma/seeds/permission-sets.ts` | The named sets, defined once for both seeds below |
| `backend/prisma/seeds/role-permissions.seed.ts` | The `USER` / `HR` / `ADMIN` baselines |
| `backend/prisma/seeds/permission-presets.seed.ts` | The six cards and their 243 items |
| `backend/src/modules/permission-management/permission-management.module.ts` | Wires two controllers and two services |
| `backend/src/modules/permission-management/permission-management.constants.ts` | Bounds, sort fields, defaults |
| `backend/src/modules/permission-management/permission-management.rules.ts` | `assertNotSuperadmin`, `assertKnownPermissionKeys` |
| `backend/src/modules/permission-management/permission.controller.ts` | `/permissions` |
| `backend/src/modules/permission-management/permission.service.ts` (+ `.spec.ts`) | Catalog, presets, and `resolveEffective` |
| `backend/src/modules/permission-management/user-permission.controller.ts` | `/users/:id/permissions` |
| `backend/src/modules/permission-management/user-permission.service.ts` (+ `.spec.ts`) | Overrides, presets, reset, audit, matrix |
| `backend/src/modules/permission-management/routing.spec.ts` | Route tests through a real application |
| `backend/src/modules/permission-management/dto/permission-management-field.decorators.ts` | Shared per-field rules |
| `backend/src/modules/permission-management/dto/permission-query.dto.ts` (+ `.spec.ts`) | Query string of the catalog |
| `backend/src/modules/permission-management/dto/preset-query.dto.ts` | Query string of the preset list |
| `backend/src/modules/permission-management/dto/set-user-permissions.dto.ts` (+ `.spec.ts`) | Body of `PUT /users/:id/permissions` |
| `backend/src/modules/permission-management/dto/apply-preset.dto.ts` | Body of `apply-preset` |
| `backend/src/modules/permission-management/dto/permission-history-query.dto.ts` | Query string of the history |
| `backend/src/modules/permission-management/entities/permission.entity.ts` | Catalog shape, `select`, row type, mappers |
| `backend/src/modules/permission-management/entities/permission-preset.entity.ts` | Preset card shape and `_count` select |
| `backend/src/modules/permission-management/entities/user-permission-matrix.entity.ts` | Sources, cells, both resolution payloads, `permissionKey()` |
| `backend/src/modules/permission-management/entities/permission-audit-log.entity.ts` | History line shape, `select`, mapper |
| `FEATURES/029-permission-management.md` | This document |

## Files Modified

| File | Change |
| --- | --- |
| `backend/prisma/schema.prisma` | Four enums; six models; three `User` back-relations |
| `backend/src/modules/users/user.service.ts` | `findRole()` — additive read; no existing behaviour changed |
| `backend/prisma/seed.ts` | Three seed calls, in dependency order |
| `backend/src/app.module.ts` | Registers `PermissionManagementModule` |
| `FEATURES/HISTORY.md` | Feature 029 row |
| `FEATURES/README.md` | Feature 029 row |

## Testing

106 tests across five suites; the full backend suite is 2017 tests, all passing.

- **Catalog** — grouped by resource in page order; `meta` counts permissions;
  search over key and label; filters combined with `AND`; `undefined` where no
  filter was asked for; three-level ordering that does not sort by `action`
  twice; skip/take.
- **Presets** — count and target role; the `targetRole` filter; the fixed order.
- **Resolution** — baseline only; baseline ∪ `GRANT`; baseline − `REVOKE` with
  `OVERRIDE_REVOKE` distinguishable from `NONE`; `SUPERADMIN` returns all and is
  read-only; the super-admin branch reads **neither** table; every catalog
  permission returned, not only the granted ones.
- **Matrix** — every cell with its source, grouped; super-admin read-only; `404`.
- **`PUT`** — redundant overrides dropped; one audit row per change with old →
  new; `changedByUserId` from the caller; idempotent (second identical body
  writes nothing); no transaction opened when nothing changes; an effect flipped
  in place; an exception cleared; empty body revokes the baseline; unknown keys
  reported together and nothing written; `409` on super-admin; `400` naming
  `x-user-id`; `404` on an unknown target.
- **`apply-preset`** — effective set equals the preset; `PRESET_APPLIED` summary
  above the diff rows; the summary written even when nothing changes; `404` on an
  unknown key; `409` on super-admin.
- **Reset** — every exception deleted, `RESET_TO_ROLE` written, each cleared
  exception recorded; the act recorded even for a user with no exceptions.
- **History** — scoped and read under one snapshot; newest first with an `id`
  tie-break; `?action=`; row mapping; `404` rather than an empty page.
- **Routing** — every route exists and `POST /permissions`,
  `POST /permissions/presets`, `GET /permissions/:id` and a per-permission toggle
  do not; the sub-resource does not collide with the users module; `@CurrentUser()`
  through the real pipeline on all four caller-carrying routes; validation at the
  routes.
- **DTOs** — defaults, coercion, bounds, enum rejection, the empty-array case,
  duplicate rejection, `whitelist` rejection of fields a client may not write.

The seeded set sizes and their nesting were verified against the catalog
(55/16/26/35/41/40/46/55, no duplicates, every subset relation holding, 243
preset items).

## Notes

- **Nothing here enforces anything.** No guard, no decorator, no access check on
  any existing endpoint. `resolveEffective` computes a set and blocks nothing.
- **`SUPERADMIN` has no stored rows**, by the user's decision, so restricting
  `ADMIN` later cannot restrict the super-admin by accident.
- **`DEPARTMENTS`, not `TEAMS`** — the resource names the screen that exists.
- **The `flipped` branch in `applyIntendedSet` is reachable only after a baseline
  change.** With a fixed baseline a permission yields `GRANT` or `REVOKE` but
  never both, so a stored override only flips direction when a migration moves
  the permission into or out of the role. The test models exactly that case.
- **No separate `user_permission_overrides(user_id)` index**, contrary to the
  specification: the unique index already leads with that column.
- **`prisma generate` was run; `prisma migrate` and the seed were not.** The
  migration SQL is written and reviewed but has not touched any database — see
  [Migration](#migration).

## Migration

`schema.prisma` gained four enums, six models and three `User` back-relations. A
migration is required because none of those tables or types exist in the
database; without it every query in this module fails at runtime, and the seed
has nothing to write into.

```bash
cd backend
npm run prisma:migrate -- --name add_permission_management
```

The SQL is already written at
`prisma/migrations/20260806120000_add_permission_management/migration.sql`, so
Prisma will apply it rather than generate a new one.

Then seed the catalog, the baselines and the presets:

```bash
cd backend
npm run prisma:seed
```

Both are idempotent: the seed upserts on natural keys, so a second run refreshes
the same rows. Neither has been executed — they wait on approval, per the
project's command-execution policy.

## Future Improvements

- **A generated `PermissionKey` union for the application**, not only the seed.
  `prisma/seeds/permissions.seed.ts` already derives one from the catalog tuple,
  which makes a typo in a *seed* a compile error; the guard's
  `@RequirePermission('TIMESHET.APPROVE')` would still compile. Exporting the
  union into `src/` — or generating it from the database — closes that, and it is
  the single most valuable follow-up before enforcement is written.
- **Permission Enforcement**, the feature this one exists for: the guard designed
  above, after Authentication. It will also need the per-request caching noted
  there.
- **An append-only export of the audit trail**, or a nullable
  `target_user_id`, for a compliance regime that requires permission changes to
  outlive the account they were made against. Today they cascade — recorded in
  [Foreign keys](#foreign-keys) with the argument for it.
- **Runtime CRUD for presets.** Deliberately out of scope here; the tables are
  ready, and it is a controller, two DTOs and a service away.
- **Row-scoped permissions** — "edit *your own* timesheet" as opposed to "edit
  timesheets". A (resource × action) matrix cannot state it, and doubling the
  catalog with `_OWN` variants is the wrong answer; the scope belongs on the
  route, combined with the capability at enforcement time.
- **`POSITIONS` as a resource.** [Feature 008](008-positions-module.md) has a
  screen and no permission covering it; it was left out because the specification
  did not list it and adding resources unasked would have widened the catalog by
  guesswork. One enum value, five seed rows, one migration.
- **A cross-user activity feed** — "everything this administrator did" — which
  `?changedByUserId=` deliberately does not answer on a route scoped to one
  account.
- **`?resource=` and `?action=` filters on the history**, once accounts
  accumulate enough rows for the `?action=` filter alone to feel coarse.
- **Bulk apply-preset** for several users at once, which is what an
  administrator onboarding a team actually wants; it is the same transaction
  repeated, and the audit trail already records each target separately.

---

# Amendment: the `USER` baseline drops the two reference pages

## The report

> A plain employee sees five items in their sidebar. They should see three:
> Panou principal, Pontajul meu, Cererile mele de concediu. *Proiecte* and
> *Sărbători legale* must go — from the menu and from access — without breaking
> the timesheet, which still needs projects and holidays underneath.

## What was there

`OWN_WORK` in `prisma/seeds/permission-sets.ts` — the `USER` baseline — held
sixteen keys, four of which were the two reference resources read-only:

```text
PROJECTS.PAGE_ACCESS   PROJECTS.VIEW
PUBLIC_HOLIDAYS.PAGE_ACCESS   PUBLIC_HOLIDAYS.VIEW
```

The original argument for them is recorded in that file and was reasonable at the
time: *an employee filling in a timesheet has to pick a project, and one booking
leave has to see which days the office is closed*. It turns out neither of those
needs is met by a page, and the second half of this amendment is the evidence.

The frontend needed no diagnosis. `features/workspace/navigation.ts` gates the
personal *Proiecte* item on `PROJECTS.PAGE_ACCESS` and *Sărbători legale* on
`PUBLIC_HOLIDAYS.PAGE_ACCESS`, and `routes/personal.routes.tsx` guards the two
routes on the same two keys — the property F04 was built for. Withdrawing the
permission removes the menu entry and shuts the URL at once, with no frontend
change at all.

## The change: a split, not a delete

The four keys moved out of `OWN_WORK` into a new `PERSONAL_REFERENCE`, and
`HR_VIEW_ONLY` spreads both.

```text
OWN_WORK            = dashboard + timesheet + leave requests        12
PERSONAL_REFERENCE  = the project register + the holiday calendar    4
USER baseline       = OWN_WORK                                      12   (was 16)
HR - View Only      = OWN_WORK + PERSONAL_REFERENCE + HR reads      24   (unchanged)
```

**Deleting the four lines would have been wrong**, and this is the part worth
recording. `OWN_WORK` is spread into `HR_VIEW_ONLY`, which is spread into
`HR_STANDARD`, and so on up to `ADMIN_FULL_ACCESS` — the nesting this feature
established deliberately. Removing the keys outright would have taken the two
personal screens away from HR and from administrators as well: a second, larger
decision, made by accident, on top of the one that was asked for. Splitting the
constant confines the change to the one baseline that was meant to move.

Every tier from `HR - View Only` upwards is therefore **byte-for-byte what it
was** — 24, 33, 39, 40, 46, 55 — and the six preset cards hand out exactly what
they handed out before. `HR - View Only` remains the card an auditor is put on,
project register and calendar included.

## Why the timesheet does not notice

The requirement was explicit that this must not break the timesheet, and it does
not, because neither mechanism the timesheet uses ever consulted these
permissions.

**Projects.** An employee picks from *every* project — there is no per-employee
assignment — and the list comes from `GET /api/v1/projects`. That route carries
no `@RequirePermission`, and [Feature 035](035-authorization-enforcement.md)'s
guard admits any authenticated caller to a route that declares no requirement.
`PROJECTS.VIEW` gated the *page*, never the endpoint. Confirmed unchanged: no
decorator was added, and none was removed.

**Public holidays.** They reach a timesheet through `TimesheetFillService`, which
injects `PublicHolidayService` and pre-populates the draft server-side
([Feature 030](030-timesheet-management.md)). The caller's permission set is not
read on that path and cannot be — a holiday lands on the draft because the
company is closed that day, not because the employee may open a screen.

So what the employee loses is two pages. The project selection underneath the
timesheet and the holidays applied to it are untouched, and that independence is
what made this a four-row change rather than a feature.

## Database

No schema change. What this needs is a **withdrawal of four seeded rows**, and
`role-permissions.seed.ts` says in its own prose why that cannot come from a
re-run: *this seed adds and never withdraws*, because taking a permission away
changes what people can do and belongs in an act somebody performed on purpose.

`prisma/migrations/20260821120000_user_baseline_drops_reference_pages/migration.sql`
is that act:

```sql
DELETE FROM "role_permissions"
WHERE "role" = 'user'
  AND "permission_id" IN (
    SELECT "id" FROM "permissions"
    WHERE "key" IN ('PROJECTS.PAGE_ACCESS', 'PROJECTS.VIEW',
                    'PUBLIC_HOLIDAYS.PAGE_ACCESS', 'PUBLIC_HOLIDAYS.VIEW')
  );
```

Four rows on any database that has been seeded, and none on a fresh one, where
the amended seed never writes them. `WHERE "role" = 'user'` is load-bearing
rather than defensive: it is the line that keeps HR and administrators out of a
change that was not about them.

**`'user'`, lower case.** `UserRole` is declared `USER @map("user")`, so the
label in the Postgres enum is the mapped one; `'USER'` is the TypeScript name.
The first attempt used it and Postgres refused the whole statement with `22P02`,
*invalid input value for enum "UserRole"* — worth recording because it is the
**good** failure mode. A mapped enum does not quietly match nothing: a typo in
this predicate cannot delete zero rows and report success, which is exactly what
a `WHERE` clause on a plain text column would have done.

**Per-user overrides are deliberately left alone.** An individual employee who
was *granted* one of these keys through the permissions screen keeps it, and
keeps the screen — that grant is an exception somebody made on purpose about one
account, which is precisely what a baseline change must not quietly overrule. A
stale `REVOKE` of a key the role no longer grants resolves to the same absence
either way and is harmless.

## Files

| File | Change |
| --- | --- |
| `prisma/seeds/permission-sets.ts` | `OWN_WORK` reduced to twelve; new `PERSONAL_REFERENCE`; `HR_VIEW_ONLY` spreads both; the ladder and the amendment note. |
| `prisma/seeds/role-permissions.seed.ts` | The `USER` line of the summary table: sixteen → twelve, and where the four keys went. |
| `prisma/migrations/20260821120000_user_baseline_drops_reference_pages/migration.sql` | New. The four-row withdrawal, and the argument for each clause in it. |
| `modules/authorization/routing.spec.ts` | A `describe('the personal workspace')`; `ProjectController` and `PublicHolidayController` added to the module. |

Frontend: no behavioural change. `navigation.ts`, `routes/personal.routes.tsx`,
`routes/team.routes.tsx` and `PublicHolidaysPage.tsx` had comments asserting that
*every employee holds `PUBLIC_HOLIDAYS.PAGE_ACCESS`*, which stopped being true;
those were corrected. See the frontend's `F05-app-layout.md`.

## Verification

`tsc --noEmit` clean on both sides. **The full backend suite: 137 suites, 2 974
tests, all passing.**

`routing.spec.ts` gains four assertions, and they are deliberately a pair of
opposing claims — a change that only made the first would be a regression nobody
noticed until somebody could not book their hours:

| Assertion | What it protects |
| --- | --- |
| `USER_BASELINE` excludes the four keys and has length 12 | Putting any of them back fails the test |
| A `USER`'s effective set has exactly three `PAGE_ACCESS` keys | The sidebar is three items, asserted through the real resolver |
| A `USER` gets `200` from `GET /projects` **and** `GET /public-holidays` | The timesheet's project picker still works |
| `HR_STANDARD` and `ADMIN_STANDARD` still contain all four | The split did not become a delete |

The third runs the real `ProjectController` and `PublicHolidayController` over
stubbed services — the pattern this file already uses — so it is the decorators
those routes actually carry that answer, not a reading of them.

### Against the development database

Applied with `npm run prisma:migrate:deploy` — `deploy` rather than `dev`,
because `migrate status` reported no drift and one pending folder, and `deploy`
cannot reset a database under any circumstance. `role_permissions` counted by
role, before and after:

| Role | Before | After | Of the 4 reference keys |
| --- | --- | --- | --- |
| `ADMIN` | 46 | 46 | 4 → 4 |
| `HR` | 35 | 35 | 4 → 4 |
| `USER` | **16** | **12** | **4 → 0** |

A `USER`'s remaining page access is `DASHBOARD`, `LEAVE_REQUESTS`, `TIMESHEET` —
the three-item sidebar, read back out of the database rather than reasoned about.
There were **no per-user overrides on any of the four keys**, so the clause that
leaves individual grants alone did not have to protect anything on this database;
it still states the rule for one that does.

Re-seeding cannot undo this. `role-permissions.seed.ts` writes `USER_BASELINE`,
which is now the twelve keys, so `npm run prisma:seed` has nothing to re-add —
the property the test asserting `USER_BASELINE` has length 12 exists to keep.

And through the running API, signed in as `cristian.stan@example.com`, a seeded
plain employee — the two claims of this amendment, in one session:

| Request | Result |
| --- | --- |
| `GET /permissions/me/effective` | 12 permissions; page access to `DASHBOARD`, `LEAVE_REQUESTS`, `TIMESHEET`; **no** `PROJECTS.*` or `PUBLIC_HOLIDAYS.*` |
| `GET /projects` | `200`, 5 projects — the timesheet picker, unmoved |
| `GET /public-holidays` | `200`, 5 definitions |
| `GET /public-holidays/calendar/2026` | `200`, 2 occurrences |

The employee who can no longer open either page is the same employee still being
served both lists, which is the distinction the whole change rests on.

**An unrelated observation, recorded because the counts show it:** `HR` holds 35
rows where `HR_STANDARD` lists 33. The two extra are `REPORTS.PAGE_ACCESS` and
`REPORTS.VIEW`, left behind on this database by
[Feature 035](035-authorization-enforcement.md) — which moved them out of the HR
column and noted, correctly, that a seed does not withdraw what it once wrote.
This is that note coming true. It is out of scope here and is **not** something
this migration should have swept up: withdrawing the reports from HR is the
separate deliberate act 035 described, and doing it silently inside a change
about the sidebar is precisely the accident the `WHERE "role" = 'user'` clause
above exists to prevent.
