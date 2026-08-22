# Feature 041 — Authorization Write Sweep

## Goal

Close the gap Feature 035 left open on purpose: make **every write endpoint in
the API declare the permission it requires**, so that refusing an action is the
backend's job rather than the frontend's.

Feature 035 shipped `PermissionsGuard` globally and applied `@RequirePermission()`
to eleven routes — permission management, reporting, and the two timesheet review
actions — then recorded the rest as "a gradual, per-module effort". The guard
allows any authenticated request to a route that declares nothing, which is the
right default for the reads everybody may do and the wrong outcome for the
writes nobody was checking. In between, roughly twenty controllers exposed
`POST`, `PATCH`, `PUT` and `DELETE` verbs that any signed-in employee could call
with `curl`.

Surfaced by the F11 projects work on the frontend: `ProjectController` had no
requirement on its three writes, so a plain `USER` — who holds no `PROJECTS.*`
key at all — could create, edit and delete projects through the API while the
screen carefully hid the buttons. The same shape repeated across the codebase.

**This is code-only.** No `schema.prisma` change, no migration, no new
permission key. Every key used here was already seeded by Feature 029.

## Requirements

1. Every write verb (`POST` / `PATCH` / `PUT` / `DELETE`) either declares a
   `@RequirePermission()` with an **exact catalog key**, or is documented as
   deliberately open with the reason.
2. Keys come from the catalog. No invented key, ever — a requirement naming a
   key the seed does not create refuses everybody but a super-admin, forever, and
   looks like a working access rule while doing it.
3. **No self-service regression.** An employee must still edit their own
   profile, file and amend and withdraw their own leave, clear their own inbox,
   and pick a project for their timesheet.
4. **No read is gated.** In particular `GET /projects` stays open: the timesheet
   picker reads it for every employee, none of whom holds `PROJECTS.VIEW` since
   the `USER` baseline dropped the two reference pages.
5. Tests assert both directions — a role lacking the key gets `403`, a caller
   holding it gets through.

## Backend

### What was gated

Forty-four write verbs across seventeen controllers. Every key below is one the
seed already creates; the "why" column quotes the seed's own description of the
key wherever it names the act directly.

| Controller | Verb | Key | Why that key |
| --- | --- | --- | --- |
| `ProjectController` | `POST /projects` | `PROJECTS.CREATE` | the resource's own |
| | `PATCH /projects/:id` | `PROJECTS.EDIT` | |
| | `DELETE /projects/:id` | `PROJECTS.DELETE` | |
| `ProjectMembersController` | `POST /projects/:id/members` | `PROJECTS.EDIT` | "Change a project, **including its roster**" — a membership is part of the project, and the catalog deliberately has no `PROJECT_MEMBERS` resource |
| | `PATCH /projects/:id/members/:employeeId` | `PROJECTS.EDIT` | |
| | `DELETE /projects/:id/members/:employeeId` | `PROJECTS.EDIT` | removing a *member*, not the project — see Notes |
| `PublicHolidayController` | `POST` / `PATCH` / `DELETE` | `PUBLIC_HOLIDAYS.CREATE` / `.EDIT` / `.DELETE` | the resource's own |
| `EmployeeController` | `POST` / `PATCH` / `DELETE` | `EMPLOYEES.CREATE` / `.EDIT` / `.DELETE` | the resource's own |
| `PositionController` | `POST` / `PATCH` / `DELETE` | `EMPLOYEES.CREATE` / `.EDIT` / `.DELETE` | **no `POSITIONS` resource exists** — see Notes |
| `DepartmentController` | `POST` / `PATCH` / `DELETE` | `DEPARTMENTS.CREATE` / `.EDIT` / `.DELETE` | the resource's own |
| `LeaveTypesController` | `POST` / `PATCH` / `DELETE` | `LEAVES.CREATE` / `.EDIT` / `.DELETE` | "Add a leave type", "Change a leave type", "Remove a leave type or a balance" |
| `LeaveNotificationEmailsController` | `POST` / `PATCH` / `DELETE` | `LEAVES.CONFIGURE` | "…carry-over, approval requirements, **notification addresses**…" — the catalog names this list under `CONFIGURE` and under nothing else |
| `EmployeeLeaveBalancesController` | `POST /employee-leave-balances` | `LEAVES.CREATE` | "allocate somebody a balance" |
| | `POST /employee-leave-balances/generate` | `LEAVES.CONFIGURE` | "run the year-end generation" — one call rewrites the whole company's leave position |
| | `PATCH /:id` | `LEAVES.EDIT` | "correct an allocated balance" |
| | `DELETE /:id` | `LEAVES.DELETE` | "Remove a leave type or a balance" |
| `WorkScheduleController` | `PUT /work-schedule` | `WORK_SCHEDULE.EDIT` | "Change the working days, hours and entry limits" |
| | `POST /work-schedule/emails` | `WORK_SCHEDULE.CONFIGURE` | "Maintain the addresses notified when a timesheet needs approval" |
| | `DELETE /work-schedule/emails/:id` | `WORK_SCHEDULE.CONFIGURE` | |
| `LeaveRequestsController` | `PATCH /leave-requests/:id/status` | `LEAVE_REQUESTS.APPROVE` | "Approve or reject leave, which is what moves an employee balance" |
| `MyLeaveRequestsController` | `POST /me/leave-requests` | `LEAVE_REQUESTS.CREATE` | in `OWN_WORK`; every employee holds it — see Notes |
| | `PATCH /me/leave-requests/:id` | `LEAVE_REQUESTS.EDIT` | |
| | `DELETE /me/leave-requests/:id` | `LEAVE_REQUESTS.DELETE` | |
| `ReminderController` | `POST` / `PATCH` / `DELETE` | `NOTIFICATION_CONFIG.CREATE` / `.EDIT` / `.DELETE` | "Add a reminder rule", "Change or cancel a reminder rule", "Remove a reminder rule" |
| `NotificationCampaignController` | `POST` / `PATCH` / `DELETE` | `NOTIFICATION_CONFIG.CREATE` / `.EDIT` / `.DELETE` | "…or compose an announcement" |
| `NotificationController` | `POST /notifications` | `NOTIFICATION_CONFIG.CREATE` | the temporary testing route, whose body chooses the audience — `ALL_USERS` included |
| `NotificationDeliveryController` | `POST /notification-delivery/execute/:campaignId` | `NOTIFICATION_CONFIG.EDIT` | it moves a campaign to `SENT` and puts mail on the wire; `EDIT` is "an announcement that has not been sent" |
| `EmailController` | `POST /email/test` | `NOTIFICATION_CONFIG.EDIT` | no `EMAIL` resource exists — the closest key the catalog states, and an operator's action |

Thirty distinct keys are now in use across fifty-six gated routes (Feature 035's
twelve plus these forty-four).

### What was deliberately left open, and why

| Route(s) | Decision | Reason |
| --- | --- | --- |
| Everything on `AuthController` — login, refresh, logout, activate, forgot / reset / change-password | **untouched** | Pre-auth or self-service. `PublicRouteValidator` refuses `@Public()` beside `@RequirePermission()` at startup, so gating these is not merely wrong, it would not boot. |
| `PATCH /profile/me` | **untouched** | The caller's own profile. The controller already documents this: "these are the two routes every authenticated caller may use, whatever their permission matrix says", and gating them would mean an employee could not read their own name. |
| `PATCH /notifications/read-all`, `DELETE /notifications`, `PATCH /notifications/:id/read`, `DELETE /notifications/:id` | **left open** | The caller's own inbox. The service resolves the audiences the caller holds and answers `404` outside them, so the scoping is a property of the query. The catalog says it outright, under `NOTIFICATION_CONFIG.VIEW`: "Reading your own inbox is not governed by this and is denied to nobody." |
| `PATCH /administrative/notifications/read-all`, `DELETE /administrative/notifications` | **left open** | Same, plus an existing administrative-role check in `NotificationService`. This is inbox management, not notification configuration. |
| Every route on `UserController` | **untouched** | Already protected, and by a *role* check rather than a permission, on purpose: whoever can set a role can set their own, so a configurable permission to administer accounts would be a configurable way to grant oneself everything else. `user.rules.ts` argues it; this feature does not reopen it. |
| `POST /timesheets/me`, `PUT /timesheets/me/:id/entries`, `POST /timesheets/me/:id/submit`, `DELETE /timesheets/:id` | **left as they were** | Not in this feature's scope, and not the vulnerability class it exists for: all four already run real server-side rules — `assertAdministrative`, `assertAdminVisible`, `assertStatusIs` — rather than relying on a hidden button. Recorded below. |
| `GET /email/health` | **left open** | Sends nothing, and deliberately answers `200` even when mail is broken so a probe can distinguish "email is down" from "this endpoint is down". A `403` in front of it breaks exactly that. |
| **Every read in the application** | **untouched** | The sweep touched write verbs only. `GET /projects` in particular is load-bearing — see below. |

### `GET /projects` must stay ungated

Every employee filling in a timesheet picks from the project list, and since the
`USER` baseline dropped `PROJECTS.PAGE_ACCESS` and `PROJECTS.VIEW` (the amendment
recorded in Feature 029), the **only** thing keeping that picker working is that
the route declares no requirement. It is asserted in
`authorization/routing.spec.ts` rather than left to a comment, so gating it later
is a failing test rather than a support ticket.

### The layering did not change

Every domain rule that ran before still runs, underneath the new gate:

- `POST /employees` with an `account` in the body is still refused for anybody
  who is not `ADMIN`/`SUPERADMIN` — a rule about the *body*, so it could never
  have been a route-level gate. An HR user now clears `EMPLOYEES.CREATE` and is
  still refused the login, and the two refusals carry different `errorCode`s.
- Deleting a department that still has employees is still a `409`; deleting a
  leave type a balance names is still a `409`; a `SENT` campaign is still a `409`.
  Those are statements about the resource, not about the caller.

## Frontend

Almost none — but not none, and the exception is worth recording because it is
the exact failure this feature exists to prevent.

The frontend's soft gating reads `GET /permissions/me/effective` and hides what a
caller cannot do; this feature makes the server refuse what the screen was
already hiding. The two cannot disagree about *resolution*, because the guard
reduces its answer through the same `toEffectivePermissionsEntity` that endpoint
uses. They can still disagree about **which key a given button names**, and one
did.

Auditing every `useCan` / `<Can>` key in the frontend against the table above
found thirteen action gates, twelve of which already matched:
`PROJECTS.CREATE/EDIT/DELETE`, `DEPARTMENTS.CREATE/EDIT/DELETE`,
`PUBLIC_HOLIDAYS.CREATE/EDIT/DELETE` and the leave-types `LEAVES.CREATE/EDIT/DELETE`.

The thirteenth did not. The **leave-notification-emails** section gated its add
form and its row menu on `LEAVES.CREATE` / `.EDIT` / `.DELETE`, where this
feature gates the API on `LEAVES.CONFIGURE`. `LEAVES.CONFIGURE` appeared nowhere
in the frontend at all. That broke `HR - Standard` specifically — they hold
`LEAVES.CREATE` and `.EDIT` but not `.CONFIGURE`, so the "Add an address" field
rendered and the `POST` answered `403`.

**The backend is right and the screen was wrong**, on the catalog's own wording:
`LEAVES.CONFIGURE` is described as changing "the rules balances are judged by —
carry-over, approval requirements, **notification addresses** — and running the
year-end generation". The three components were aligned to `LEAVES.CONFIGURE`;
see the amendment appended to `frontend/FEATURES/F10-leave-notification-emails.md`.

This is a real permission change, not a refactor: **`HR - Standard` can no longer
manage the leave-notification addresses.** Adding a leave type is day-to-day HR
work; deciding who is emailed about leave is a routing decision about the
company, and `HR - Full Access` and the admin tiers are where it now sits. An
individual HR lead who needs it can be granted `LEAVES.CONFIGURE` through the
permissions screen, with an audit row saying who granted it.

One other behaviour is now visible that was not: a client that skips the soft
gating and draws every button meets a real `403` carrying
`AUTHORIZATION_PERMISSION_DENIED`, with `requiredPermissions` and `mode` in
`params`.

## Database

**None.** No schema change, no migration, no seed change. Every key was seeded by
Feature 029 and every role baseline is exactly what Feature 029 and its amendment
left.

## API

No route was added, removed or renamed, and no payload changed. What changed is
which callers get an answer:

- Forty-four write endpoints can now answer `403` with
  `AUTHORIZATION_PERMISSION_DENIED`. Each documents it via
  `@ApiStandardErrors(HttpStatus.FORBIDDEN, …)` — added per method rather than
  per class, so a route that cannot `403` does not claim it can.
- The OpenAPI document regenerates from the controllers, so `/api/docs` picks all
  of this up with nothing hand-written.

Practical effect by role, for the writes that moved:

- **`USER`** — loses every administrative write it could previously reach.
  Keeps: own profile, own leave requests, own timesheet, own inbox, and reading.
- **`HR`** — keeps employees, departments, public holidays, leave types (create
  and edit), and leave approval. Does **not** hold any `DELETE`, nor
  `LEAVES.CONFIGURE`, nor anything under `NOTIFICATION_CONFIG` or
  `WORK_SCHEDULE`.
- **`ADMIN`** — additionally holds projects (create/edit), `LEAVES.CONFIGURE`,
  `WORK_SCHEDULE.EDIT`, and notification create/edit. Does **not** hold the
  deletes on directory and configuration resources, nor
  `WORK_SCHEDULE.CONFIGURE`, nor `PROJECTS.DELETE`.
- **`SUPERADMIN`** — everything, by resolution rather than by configuration.

Anything an administrator is missing can be granted per account through the
permissions screen, which is the whole reason this is a permission rather than a
role check.

## Files Created

| File | Purpose |
| --- | --- |
| `backend/FEATURES/041-authorization-write-sweep.md` | This document |

## Files Modified

| File | Change |
| --- | --- |
| `backend/src/modules/projects/project.controller.ts` | `PROJECTS.CREATE` / `.EDIT` / `.DELETE`; the class comment now explains why `GET /projects` stays open |
| `backend/src/modules/project-members/project-members.controller.ts` | `PROJECTS.EDIT` on all three writes |
| `backend/src/modules/public-holidays/public-holiday.controller.ts` | `PUBLIC_HOLIDAYS.CREATE` / `.EDIT` / `.DELETE` |
| `backend/src/modules/employees/employee.controller.ts` | `EMPLOYEES.CREATE` / `.EDIT` / `.DELETE`; the account opt-in rule documented as the second layer |
| `backend/src/modules/positions/position.controller.ts` | `EMPLOYEES.*`, with the whole argument for why in the class comment |
| `backend/src/modules/departments/department.controller.ts` | `DEPARTMENTS.CREATE` / `.EDIT` / `.DELETE` |
| `backend/src/modules/leave-configuration/leave-types.controller.ts` | `LEAVES.CREATE` / `.EDIT` / `.DELETE` |
| `backend/src/modules/leave-configuration/leave-notification-emails.controller.ts` | `LEAVES.CONFIGURE` on all three writes |
| `backend/src/modules/employee-leave-balances/employee-leave-balances.controller.ts` | `LEAVES.CREATE` / `.EDIT` / `.DELETE`, and `LEAVES.CONFIGURE` on `generate` |
| `backend/src/modules/work-schedule/work-schedule.controller.ts` | `WORK_SCHEDULE.EDIT` on the schedule, `WORK_SCHEDULE.CONFIGURE` on the addresses |
| `backend/src/modules/leave-requests/leave-requests.controller.ts` | `LEAVE_REQUESTS.APPROVE` on the decision |
| `backend/src/modules/leave-requests/my-leave-requests.controller.ts` | `LEAVE_REQUESTS.CREATE` / `.EDIT` / `.DELETE` — the three keys the `USER` baseline already holds |
| `backend/src/modules/notification-management/reminder.controller.ts` | `NOTIFICATION_CONFIG.CREATE` / `.EDIT` / `.DELETE`; delivers the ADMIN-not-HR narrowing Feature 027 only wrote down |
| `backend/src/modules/notification-management/notification-campaign.controller.ts` | `NOTIFICATION_CONFIG.CREATE` / `.EDIT` / `.DELETE` |
| `backend/src/modules/notifications/notification.controller.ts` | `NOTIFICATION_CONFIG.CREATE` on the temporary create route; the other five writes documented as deliberately open |
| `backend/src/modules/notifications/administrative-notification.controller.ts` | Comment only: why both writes stay ungated |
| `backend/src/modules/notification-delivery/notification-delivery.controller.ts` | `NOTIFICATION_CONFIG.EDIT` on the send trigger |
| `backend/src/modules/email/email.controller.ts` | `NOTIFICATION_CONFIG.EDIT` on `POST /email/test`; `GET /email/health` left open with the reason |
| `backend/src/modules/authorization/catalog.spec.ts` | Nineteen gated controllers instead of four; fifty-six routes; thirty keys; a new assertion that every key in use is one the widest preset can actually grant |
| `backend/src/modules/authorization/routing.spec.ts` | Two new blocks — `the write sweep` (the forty-four-row table, both directions) and `no self-service regression` |
| `backend/test/app.e2e-spec.ts` | `PermissionService` overridden with the seeded baselines so the suite keeps running without PostgreSQL; the two approval-address DTO cases sent as `SUPERADMIN` |
| `backend/FEATURES/035-authorization-enforcement.md` | Its "migrate the remaining routes" improvement marked addressed |
| `backend/FEATURES/HISTORY.md` | Feature 041 row and the narrative note |

Three frontend files were realigned to the key this feature gates their endpoints
on. They belong to `frontend/FEATURES/`, which has its own numbering and its own
rules, so they are recorded as an amendment to F10 rather than here — but they
are listed for completeness, because a reader tracing the `HR - Standard` change
should not have to guess where the screen half of it happened:

| File | Change |
| --- | --- |
| `frontend/src/features/leave-notification-emails/components/LeaveNotificationEmailAddForm.tsx` | `LEAVES.CREATE` → `LEAVES.CONFIGURE` |
| `frontend/src/features/leave-notification-emails/components/LeaveNotificationEmailRowActions.tsx` | `anyOf: ['LEAVES.EDIT', 'LEAVES.DELETE']` → `LEAVES.CONFIGURE`; the two per-item `<Can>` wrappers go with it, since one key now governs both |
| `frontend/src/features/leave-notification-emails/components/LeaveNotificationEmailsEmptyState.tsx` | `LEAVES.CREATE` → `LEAVES.CONFIGURE`, so its two sentences follow the form above it |

## Notes

### Three judgement calls, and the reasoning behind each

**`PositionController` is gated on `EMPLOYEES.*`.** There is no `POSITIONS`
resource in the catalog — Feature 029 seeded twelve resources and job titles are
not one of them, while `DEPARTMENTS` is. Three options existed and only one was
acceptable: inventing `POSITIONS.CREATE` produces a gate no grant can satisfy
(the exact failure `catalog.spec.ts` exists to prevent); adding the enum value is
a migration, which a code-only sweep must not smuggle in; so the writes take the
keys of the resource a position actually belongs to. A position is a column on an
employee, maintained by whoever maintains the directory, and the frontend has no
positions screen at all. It is a deliberate approximation, recorded below as the
thing to revisit.

**`POST /email/test` is gated on `NOTIFICATION_CONFIG.EDIT`.** Same shape: no
`EMAIL` resource exists. The old comment on that controller argued the exposure
was acceptable because "the payload is a single address, so somebody could only
make the server send a fixed test message" — which is a smaller hole, not the
absence of one: an unauthorised caller could emit mail from the company's own
`From` header, to an address of their choosing, as often as the rate limiter
allowed. `NOTIFICATION_CONFIG.EDIT` is the closest thing the catalog states
("administers how this company sends messages"), it is what the delivery trigger
takes for the same reason, and it is in `Admin - Standard` and no HR tier.

**`POST /notification-delivery/execute/:campaignId` was gated despite being
labelled a development endpoint.** "For development and Postman testing"
describes the intent; what the route does is write a notification for every
recipient of a campaign and put email on the wire, immediately, for anybody who
can name a campaign id — and campaign ids are readable from
`GET /notification-campaigns`. Being marked deprecated is not a defence: a route
that exists is a route that answers.

### The `/me` leave requests are gated on keys every employee already holds

`LEAVE_REQUESTS.CREATE`, `.EDIT` and `.DELETE` are all in `OWN_WORK`, so gating
those three routes refuses nobody today. That is intentional, and gating them on
an approver's key would have locked the entire workforce out of asking for a day
off.

What the gate buys is not a refusal but a *statement*: filing leave is a
capability the company grants, and it can now be withdrawn from one account
through the permissions screen — with an audit row saying who withdrew it.
Before this, the only way to stop somebody filing was to deactivate their
account. The permission says **what**; the `/me` scope says **whose**, and it is
the one scope that cannot be aimed at somebody else.

The write-sweep table proves the gate is live on exactly these rows by revoking
the key with a per-user exception — which is the real mechanism, not a test
contrivance.

### Roster deletes take `PROJECTS.EDIT`, not `PROJECTS.DELETE`

Removing a member removes a membership, not the project. Somebody trusted to
maintain a roster should not need the permission that erases the whole project in
order to do it — and read the other way, `Admin - Standard` holds `PROJECTS.EDIT`
and not `PROJECTS.DELETE`, so the split is exactly what lets that tier run
projects without being able to delete one.

### The e2e suite kept its "no PostgreSQL" property

`PermissionsGuard` resolves through `PermissionService.resolveEffective`, which
reads the catalog and two tables on **every** gated route — including for a
super-admin, whose branch still fetches the catalog rows it maps. Until this
feature that cost `app.e2e-spec.ts` nothing, because none of the routes it
exercises declared a requirement. Gating forty-four write verbs would have
quietly made half that suite require a database to answer a question about the
`ValidationPipe`.

`PermissionService` is therefore overridden there with the **seeded** role sets,
imported from `prisma/seeds/permission-sets.ts` — the same trade the suite
already makes for `AuthService`. It substitutes the layer that file is not about
and keeps what is being asserted real, and because the sets are the shipped ones
rather than invented, a test that fails because an `ADMIN` genuinely lacks a key
keeps failing for that reason. Two did: the approval-address DTO cases, since
`Admin - Standard` deliberately withholds `WORK_SCHEDULE.CONFIGURE`. They are now
sent as a super-admin, which is the honest fix for a test about validation.

### What the tests actually claim

`authorization/routing.spec.ts` drives a forty-four-row table twice:

- **Refused without the key** — `403`, `errorCode` is
  `AUTHORIZATION_PERMISSION_DENIED`, `params.requiredPermissions` is the exact
  key, and the service stub was **not** called. The last clause is the one that
  matters: the refusal happened in front of the service rather than inside it.
- **Admitted with the key** — not a `403`. Where the table supplies a body the
  route's DTO accepts (every `DELETE`, and every `PATCH` whose DTO is a partial),
  the stronger claim is also made: the request reached the service. Where it does
  not — a project's code, a holiday's two dates, a reminder's schedule — the row
  is marked `'dto'` and only the guard's verdict is asserted, because validating
  those payloads is each module's own spec's job. Guards run before pipes, so the
  *refusal* half of the claim is complete for every row regardless.

A second block, `no self-service regression`, asserts the other direction: an
employee holding nothing but the twelve-key baseline can still read and edit
their own profile, manage their own leave, clear their own inbox, read the
reference lists, and `GET /projects` — while the same caller, on the same server,
is refused `POST /projects`.

`catalog.spec.ts` checks the other property: every key any route declares is one
the seed actually creates, and — new here — one the widest preset can actually
grant. The two files together are "every write names a key, and every key
exists".

## Future Improvements

- **A `POSITIONS` resource in the catalog.** The one place this feature had to
  approximate. It needs a `PermissionResource` enum value, a migration, five
  seeded rows and a decision about which presets carry them — then
  `PositionController`'s three decorators change and its long explanatory comment
  gets shorter.
- **An `EMAIL` (or `SYSTEM`) resource**, for the same reason, covering
  `POST /email/test` and anything else operational that arrives later.
- **The remaining timesheet writes.** `POST /timesheets/me`,
  `PUT /timesheets/me/:id/entries`, `POST /timesheets/me/:id/submit` and
  `DELETE /timesheets/:id` were out of this feature's scope. All four already run
  real domain rules, so none is the hole this sweep existed to close, but
  declaring `TIMESHEET.CREATE` / `.EDIT` / `.DELETE` would make the module say
  what it requires rather than leaving it implicit. Note that all three keys are
  in the `USER` baseline, so — exactly as for the `/me` leave routes — the gate
  would narrow rather than widen, and `assertAdministrative` would still be what
  stops an employee deleting somebody else's month.
- **Row-level scoping for `GET /leave-requests` and `GET /timesheets`.** Both read
  across everybody and both are ungated. A `LEAVE_REQUESTS.VIEW` gate would be
  worse than none, because the `USER` baseline holds that key — it would refuse
  nobody while looking like it did. What those routes need is a rule about
  *rows*, which a matrix of (resource × action) cannot express; Feature 035's own
  improvement list says the same thing and it has not changed.
- **Per-recipient notification read and delete state.** `DELETE /administrative/notifications`
  removes shared `ADMINISTRATIVE_USERS` announcements for every administrative
  user, because there is one flag on the row. That is a schema change rather than
  a permission, and it is Feature 026's to make.
- **Reads.** The sweep touched write verbs only, deliberately, because gating a
  read is a product decision about who may *see* something rather than a security
  fix for something anybody could *do*. Whether an ordinary employee should be
  able to list every employee, every leave request and every leave balance is a
  question worth asking on its own, with the answer per resource.
- **`@RequirePermission()` on the controller class where every route takes the
  same key.** `LeaveNotificationEmailsController` and `ReminderController` come
  close. It was not done here because the reads on those controllers are
  deliberately open, and a class-level requirement would gate them too — but a
  controller that is entirely writes could say it once.
