# Feature 030 — Timesheet Management

**Status:** Completed
**Date:** 2026-08-06

## Goal

Monthly timesheets that employees fill in and submit, and that administrators
review, approve or reject.

A timesheet is one employee's record of work — and of leave and holidays — for a
single `(month, year)`. It moves through an explicit lifecycle, it is validated
against the company's configuration rather than against constants, and it is
aggregated for the people who review it.

This is the feature the previous twenty-nine were building towards. It is the
first module whose data is **produced by employees** rather than configured by
administrators, and the widest reader in the application: the work schedule, the
public holidays, the approved leave, the employment dates and the projects all
have to agree about a single day before an hour can be booked to it.

**Not included, and deliberately:** email sending, sockets, the delivery
mechanism itself (all 025/028), background jobs or cron, a `@RequirePermission()`
guard or any wiring into the permission system, authentication, billing or
invoicing on top of the hour aggregates, and any frontend.

## Requirements

- A `Timesheet` header and its `TimesheetEntry` lines, one timesheet per employee
  per month per year.
- A four-state lifecycle — `DRAFT → SUBMITTED → APPROVED | REJECTED → SUBMITTED`
  — with every transition atomic and guarded on the current status.
- Fill-in rules taken **entirely from configuration**: which days are loggable,
  where a week starts, the per-entry, per-day and per-week ceilings, and what a
  full day of leave or holiday is worth.
- Leave and public holidays pre-populated and not editable as to type or hours,
  including half-day leave.
- Retroactive dependency changes handled without ever rewriting somebody's
  entries.
- Hour aggregates split by category, computed with Prisma aggregation.
- Notifications emitted through the Notification Delivery Engine (028) and never
  sent by this feature.
- Pagination, search, filtering and sorting reusing
  [Feature 006](006-shared-backend-infrastructure.md).
- The caller taken from the `@CurrentUser()` placeholder; no user hardcoded.
- Controllers thin, rules in the services, Prisma nowhere else.

## Decisions taken before implementation

Five points where the specification met the existing codebase and the difference
had to be settled rather than guessed at. The first two were put to the user and
answered before any code was written.

### 1. There is no `Task` model — `taskId` was dropped

The specification asked for `taskId -> Task nullable` on an entry. **No `Task`
model exists anywhere in this project**, and no feature 001–029 introduced one:
011, 013, 014 and 015 are Projects, Members and Rosters.

Inventing one here would have meant designing a whole resource nobody has
specified — its name, its code, its lifecycle, its scoping to a project, its CRUD
and its permissions — inside a feature about timesheets.

**Decision (user's):** an entry references a `Project` and nothing else. When a
Tasks feature exists, `task_id` is a nullable foreign key and a one-line
migration. Recorded under [Future Improvements](#future-improvements).

### 2. `Employee.terminationDate` did not exist and was added

The rule "entries must fall in `[hireDate, terminationDate ?? today]`" needs a
termination date. `Employee` had only `hireDate` and a `status` enum containing
`TERMINATED`; Feature 020 closes project memberships from the status *transition*
and stores no date.

**Decision (user's):** add a nullable `termination_date` column, as a small
self-contained extension of Feature 010 — the same treatment this feature gives
the Leave half-day fields. Without it, a leaver's final month is either wholly
unfillable or fillable for ever, and neither is right.

The column is deliberately **independent of `status`**: somebody serving notice is
`ACTIVE` and has a termination date. See
[the Feature 010 amendment](010-employees-module.md#amended-by-feature-030--terminationdate).

### 3. `WorkSchedule.weekStartsOn` was added — a weekly cap needs a week

Raised by the user during implementation, and it is the sharpest configuration
point in the feature.

The weekly ceiling requires grouping days into weeks, and **the working week does
not begin on Monday everywhere**: it begins on Sunday across much of the Middle
East, Asia and the Americas. A Monday baked into the grouping would split such a
company's week across two buckets, and a ceiling checked over half a week each
time is a ceiling that never binds.

It cannot be derived from `workingDays`: a company working Sunday–Thursday and one
working Tuesday–Saturday can hold overlapping arrays, and "the first working day"
would call a Tuesday–Saturday week a week beginning on Tuesday. Two independent
facts, stated independently.

The same conversation settled the other half explicitly: **there is no weekend
rule anywhere in this module.** "Not loggable" means "not in
`WorkSchedule.workingDays`", so a company that works Monday to Sunday can log all
seven days. See
[the Feature 016 amendment](016-work-schedule-configuration.md#amended-by-feature-030--weekstartson).

### 4. `?sortBy=totalHours` was specified and is **not** implemented

The one thing this feature was asked for and did not build. It is called out here
rather than buried, and the reasoning is the project's own.

The hour aggregates are `SUM(hours)` over `timesheet_entries`, computed on the way
out. There is no column for Prisma's `orderBy` to name — exactly the situation
`LeaveRequest.requestedWorkingDays` (023) and `EmployeeLeaveBalance.remainingDays`
(022) are both in, and both of those modules refuse the sort for the same reason.

The three ways to offer it, and why none was taken:

| Approach | Why not |
| --- | --- |
| Sort the page after fetching | Sorts the wrong rows — the page was already chosen |
| Raw SQL | CLAUDE.md admits it only on explicit request |
| Page through a `groupBy` over the entries | Silently drops any timesheet with **no** entries — a rejected month somebody emptied — from a list that still counts it |

The four figures **are** on every row, so a client can sort a page it already
holds. A correct implementation needs either a denormalised `total_hours` column
maintained on write (which the schema argues against everywhere else) or a raw
SQL page query. Recorded under [Future Improvements](#future-improvements) for the
user to choose.

### 5. `@@index([employeeId])` on `Timesheet` was specified and omitted

The specification asked for `unique (employeeId, month, year)` **and** a separate
`index (employeeId)`. The unique constraint leads with `employee_id`, so a second
index on that column alone duplicates its leading column and buys nothing —
which is exactly the call `UserPermissionOverride` records in this schema
("a separate index on `user_id` alone would duplicate that leading column").
Following the codebase's stated convention; noted so it does not read as an
oversight.

## Backend

### Files created

```text
src/modules/timesheet-management/
├── timesheet-management.module.ts        the feature's six imports, three providers
├── timesheet-management.constants.ts     bounds, sortable columns, status sets
├── timesheet-management.rules.ts         the shared, pure assertions
├── timesheet.controller.ts               /timesheets and /timesheets/me
├── timesheet.service.ts                  lifecycle, visibility, aggregates, staleness
├── timesheet-fill.service.ts             the fill-in rule engine
├── timesheet-notification.service.ts     builds the four payloads, hands them to 028
├── entities/
│   ├── timesheet.entity.ts               header + entries + totals
│   ├── timesheet-entry.entity.ts         one line
│   └── timesheet-list-row.entity.ts      the admin row, with aggregates and no lines
└── dto/
    ├── create-timesheet.dto.ts           POST /timesheets/me
    ├── set-timesheet-entries.dto.ts      PUT .../entries
    ├── reject-timesheet.dto.ts           POST /timesheets/:id/reject
    ├── timesheet-query.dto.ts            both query shapes
    └── timesheet-management-field.decorators.ts
```

Each file, and what it is for:

| File | Responsibility |
| --- | --- |
| `timesheet-management.module.ts` | Registers the three services and one controller; imports the six modules whose facts a day depends on. Exports nothing. |
| `timesheet-management.constants.ts` | Month/year bounds, payload caps, the sortable columns, and the five status sets the lifecycle is stated in. **Contains no hour figure** — every one of those is configuration. |
| `timesheet-management.rules.ts` | `assertOwner`, `assertAdministrative`, `assertStatusIs`, `assertNotApproved`, `assertAdminVisible`, `assertMonthIsFillable`, `assertRejectionReasonGiven`, `describePeriod`, and the shared `NotFoundTimesheet`. Every function is pure. |
| `timesheet.controller.ts` | Nine routes, each a one-line delegation. Owner routes declared first so `me` is matched before `:id`. |
| `timesheet.service.ts` | The four transitions, ownership and visibility, the aggregates, and the staleness refresh. |
| `timesheet-fill.service.ts` | The month plan, the pre-population, the validation, and the approval snapshot. Reads four modules; writes nothing. |
| `timesheet-notification.service.ts` | Composes the four announcements and calls `NotificationDispatcher.executeEvent`. Holds all the wording. |
| `entities/timesheet.entity.ts` | `TIMESHEET_BASE_SELECT`, `TIMESHEET_DETAIL_SELECT`, the row types, the mappers, and `TimesheetHours`. |
| `entities/timesheet-entry.entity.ts` | The line's select, row type and mapper, plus `isLockedType` — the single statement of which lines the employee does not own. |
| `entities/timesheet-list-row.entity.ts` | The admin row: everything except the entries and the snapshot. |
| `dto/*.dto.ts` | The four request shapes. |
| `dto/timesheet-management-field.decorators.ts` | Per-field constraints; **nothing here consults the work schedule.** |

### Files modified

| File | Change |
| --- | --- |
| `prisma/schema.prisma` | Three enums, two models, four column additions, three relation additions |
| `src/app.module.ts` | Registers `TimesheetManagementModule` with an explanatory comment |
| `src/common/utils/date.util.ts` | Adds `weekdayOf`, `daysSinceWeekStart`, `toDateKey` |
| `src/modules/leave-requests/working-days.service.ts` | Uses the shared helpers instead of its own copies (no behaviour change) |
| `src/modules/leave-requests/leave-requests.service.ts` | Half-day validation and persistence; `findApprovedInSpan` and `hasApprovalsSince` for this module |
| `src/modules/leave-requests/dto/*.ts`, `entities/leave-request.entity.ts` | The half-day fields |
| `src/modules/employees/employee.service.ts` | `terminationDate` on create/update, the span rule, `findEmploymentWindow`, timesheets counted in `remove` |
| `src/modules/employees/dto/*.ts`, `entities/employee.entity.ts` | `terminationDate` |
| `src/modules/work-schedule/*` | `weekStartsOn` through the DTO, entity and service |
| `src/modules/projects/project.service.ts` | `findExistingIds`; timesheet entries counted in `remove` |
| `src/modules/projects/project.service.spec.ts` | Covers both of the above |
| `src/modules/notification-delivery/*` | A third delivery source — see [Notifications](#notifications) |

### The two services, and why they are two

`TimesheetService` owns **the lifecycle**: the four transitions, who may trigger
each, the ownership and visibility rules, and the hour aggregates.

`TimesheetFillService` owns **what may go on a day**: the month plan, the
pre-population, every ceiling, and the approval snapshot.

The split is along a real seam. The engine reads four other modules and writes
nothing; the lifecycle service writes two tables and knows no calendar rules.
Nothing is duplicated across it: there is exactly one function that validates a
month (`assertEntriesAreValid`) and exactly one place that writes a status.

Written as one service, the file would both move statuses and know how long a
Tuesday is — and its tests would have had to open a timesheet, save entries and
submit it to find out whether a Saturday is loggable. Separated, the engine is a
thing that takes a plan and a set of entries and answers with problems, which is
what `timesheet-fill.service.spec.ts` exercises without a database.

## Database

### Enums added

| Enum | Values (stored) | Notes |
| --- | --- | --- |
| `TimesheetStatus` | `draft`, `submitted`, `approved`, `rejected` | Four states, three transitions plus one loop |
| `TimesheetEntryType` | `work`, `leave`, `holiday` | Only the first is the employee's to write |
| `LeaveHalfDayPortion` | `first_half`, `second_half` | On `LeaveRequest`, not on a timesheet |

### The `Timesheet` header

| Column | Type | Notes |
| --- | --- | --- |
| `id` | `cuid` | |
| `employee_id` | FK → `employees` | `RESTRICT` — a month somebody worked is not erased with their personnel record |
| `month`, `year` | `Int` | Two integers, not a date pinned to the 1st |
| `status` | `TimesheetStatus` | Defaults to `DRAFT` |
| `submitted_at`, `reviewed_at` | `DateTime?` | Separate from `updated_at`, which moves whenever anything does |
| `reviewed_by_employee_id` | FK → `employees`, nullable | `SetNull` — a decision survives the decider leaving |
| `rejection_reason` | `String?` | Required by the API on a rejection; **not** cleared on resubmission |
| `is_stale` | `Boolean` | A dependency moved — advisory, never acted on |
| `schedule_snapshot` | `Json?` | Captured at approval; null on everything else |
| `created_at`, `updated_at` | | |

Indexes: `@@unique([employeeId, month, year])`, `@@index([status])`,
`@@index([reviewedByEmployeeId])`.

**Why a header and lines rather than one flat table.** A timesheet has facts that
belong to the *month* and to no day in it: whether it was submitted, who reviewed
it, why it was refused, whether its schedule has since changed. Hung off the
entries those facts would be repeated on every row and could then disagree —
twenty lines each naming a different reviewer — and a month with no hours logged
yet could not exist at all, which is exactly what `DRAFT` describes.

**Why `(employee_id, month, year)` is unique.** A person accounts for a month
once. Two rows would be two answers to "how much did this person work in
September" and no reader could choose. It is also what makes `POST
/timesheets/me` idempotent: the guarantee is the index, not a check.

### The `TimesheetEntry` line

| Column | Type | Notes |
| --- | --- | --- |
| `id` | `cuid` | |
| `timesheet_id` | FK → `timesheets` | **`Cascade`** — a line says nothing without its month |
| `date` | `DateTime` | The calendar day at UTC midnight |
| `type` | `TimesheetEntryType` | |
| `project_id` | FK → `projects`, nullable | `RESTRICT`; required for `WORK`, refused otherwise |
| `hours` | `Decimal(5,2)` | Never `double` — see below |
| `leave_request_id` | FK → `leave_requests`, nullable | `SetNull` |
| `description` | `String?` | |
| `created_at`, `updated_at` | | |

Indexes: `@@index([timesheetId, date])`, `@@index([projectId])`,
`@@index([leaveRequestId])`.

**Why a day holds multiple entries.** The entry list — not a column per day, and
not one row per day — is the source of truth. Three hours on Project Alpha and
five on Project Beta is two rows on one date; a half day of leave plus half a day
of work is two rows on one date; a day nobody has filled in is no rows at all. A
per-day unique constraint would make the first two unstatable, and an `hours`
column on a `timesheet_days` table would force every split into a description
somebody typed.

It follows that the day's total is a **sum** and the ceilings are checked over the
set — which is why `assertDailyTotals` and `assertWeeklyTotals` run over the whole
month rather than per line.

**Why `Decimal(5,2)`.** The same type and precision `work_schedules` states its
bounds in, and the agreement is load-bearing: these are the numbers compared
against `max_hours_per_day` and summed into a week. Binary floating point cannot
hold `0.1` exactly, so a column of totals would drift and a `>=` at the ceiling
would come out differently depending on how the total was reached.

**`onDelete`, and why each:**

| Relation | Rule | Reason |
| --- | --- | --- |
| entry → timesheet | `Cascade` | The only cascade here. A line is meaningless without its month, and keeping it would make a deletable timesheet undeletable. |
| timesheet → employee | `RESTRICT` | A month somebody worked is what payroll is drawn from. `EmployeeService.remove` already refuses to delete anybody with leave behind them; this is a stronger record. |
| timesheet → reviewer | `SetNull` | A decision survives the decider leaving — the call `leave_requests.processed_by_id` already makes. |
| entry → project | `RESTRICT` | A project with hours booked to it cannot vanish under the timesheets that recorded them. |
| entry → leave request | `SetNull` | The case barely arises (only `PENDING` requests are deletable, and those have no entries). If one ever were removed, *the hours were still not worked*: cascading would change an approved month, `RESTRICT` would let a timesheet veto somebody else's request. Blanking the pointer is the smallest loss. |

### Columns added to existing models

| Model | Column | Notes |
| --- | --- | --- |
| `Employee` | `termination_date DateTime?` | Independent of `status`; see [Feature 010 amendment](010-employees-module.md#amended-by-feature-030--terminationdate) |
| `LeaveRequest` | `is_half_day Boolean @default(false)` | Orthogonal to `leave_type_id` |
| `LeaveRequest` | `half_day_portion LeaveHalfDayPortion?` | Required iff `is_half_day` |
| `WorkSchedule` | `week_starts_on Weekday @default(MONDAY)` | See [Feature 016 amendment](016-work-schedule-configuration.md#amended-by-feature-030--weekstartson) |

### Migration

**Not yet applied.** Per CLAUDE.md, the schema is written and validated
(`prisma validate` passes, `prisma generate` has run) and the migration awaits
explicit approval:

```bash
cd backend
npx prisma migrate dev --name add_timesheet_management
```

It will create `timesheets` and `timesheet_entries`, three enum types, and add
four columns to three existing tables. **Every addition is backwards
compatible**: the three columns on existing tables are either nullable or
defaulted, so no existing row needs a value and no existing request body becomes
invalid.

## Lifecycle

```text
  DRAFT ──submit (owner)──▶ SUBMITTED ──approve (admin)──▶ APPROVED  (terminal)
                                │
                                └──reject (admin)──▶ REJECTED ──resubmit (owner)──▶ SUBMITTED
```

| State | Who sees it | What can happen |
| --- | --- | --- |
| `DRAFT` | The owner only — an administrator gets a `404` | Edit freely; submit |
| `SUBMITTED` | Owner and administrators | Approve or reject (admin only); no edits |
| `APPROVED` | Owner and administrators | **Nothing.** Terminal and immutable |
| `REJECTED` | Owner and administrators | Edit and resubmit (owner); carries the reason |

| Transition | Who | Endpoint | Guard |
| --- | --- | --- | --- |
| `DRAFT → SUBMITTED` | owner | `POST /timesheets/me/:id/submit` | `status IN (draft, rejected)` |
| `REJECTED → SUBMITTED` | owner | the same endpoint | the same guard |
| `SUBMITTED → APPROVED` | administrator | `POST /timesheets/:id/approve` | `status = submitted` |
| `SUBMITTED → REJECTED` | administrator | `POST /timesheets/:id/reject` | `status = submitted` |

**Every transition is a conditional `updateMany` guarded on the current status in
its own `WHERE`**, never a read followed by a write. Two administrators pressing
approve and reject at the same moment resolve the way the delivery engine's
campaign claim does: the first moves one row, the second moves none and gets a
`409` telling it to reload. Reading the status and then writing it would leave
exactly that window — and it is not theoretical, since a review queue is a screen
several people have open.

**A notification is emitted only when a row actually moved.** The same
`count === 1` that proves the transition happened gates the announcement, so a
double submit produces one notification rather than two.

`REJECTED` is a state of its own rather than a return to `DRAFT` because it
carries the reason and is rendered differently; collapsing them would erase the
fact that somebody looked at the month and said no.

**Deletion:** an administrator may delete any timesheet that is not `APPROVED`.
The entries go with it by the cascade. A `DRAFT` is deletable although an
administrator cannot *read* one — reading exposes a half-finished month, deleting
is the housekeeping the feature asks for, and the owner may simply open the month
again.

## Fill-in rules

Applied by `TimesheetFillService`. **Every limit comes from configuration.**
There is no `8`, no `40`, no `4` for a half day and no test for Saturday anywhere
in the module.

| Rule | Where the limit comes from |
| --- | --- |
| One timesheet per employee per month | the unique constraint |
| A future month is refused | the server clock; the current month is allowed |
| Entries within `[hireDate, terminationDate ?? today]` | `employees` |
| Only days in `WorkSchedule.workingDays` are loggable | `work_schedules` |
| Per-entry bounds | `min_hours_per_entry`, `max_hours_per_entry` |
| Per-day ceiling, summed over every line | `max_hours_per_day` |
| Per-week ceiling | `standard_hours_per_week`, grouped by `week_starts_on` |
| Leave and holiday hours | `standard_hours_per_day` (halved for a half day) |
| Under the daily norm | **not a blocker** — six hours on an eight-hour day is fine |

**There is no weekend rule.** "Not loggable" means "not in `workingDays`", so a
company working Monday to Sunday can log all seven days and a company working
Tuesday to Saturday logs those. A hard-coded weekend would contradict the
configuration screen on every request.

**The weekly ceiling counts only the part of the week inside this month.** A week
straddling the 1st is validated on the days belonging to *this* timesheet, because
the other days belong to another timesheet the request cannot see. This is a
deliberate under-approximation: somebody could exceed a weekly ceiling across a
month boundary and no single request would notice. The alternative — reading the
neighbouring month — would make one timesheet's validity depend on another's
contents, so saving September could start failing because somebody edited August.

**A month with no entries at all is submittable.** That follows from "under the
norm is not a blocker" taken to its limit. An administrator seeing a submitted
month of zero hours has everything they need to reject it, which is a better
answer than this API deciding on their behalf.

Every problem in one request is reported at once, as an array — the shape the
global `ValidationPipe` produces — so a form marks every offending day. A month is
filled on one screen; one error at a time would be thirty round trips.

## Leave and holiday pre-population

A fresh draft arrives already carrying what the company knows:

- **Public holidays** become `HOLIDAY` lines at `standard_hours_per_day`, named
  after the holiday ("Christmas Day").
- **Approved leave** becomes `LEAVE` lines at `standard_hours_per_day`, or half of
  it for a half day, named after the leave type ("Annual Leave (first half)").
- **No `WORK` line is invented** — nothing in the system knows what anybody did.

Neither is written on a day that is not a working day or falls outside the
employment: booking Christmas for somebody who joined in March would put hours in
a month they were not here for.

**A holiday wins over leave when both fall on one day.** Only one line is written.
Booking both would double the day — sixteen unremovable hours breaking the daily
ceiling — and "the office was closed" is the truer account: nobody spends leave to
be absent from a day the company is shut.

**Type and hours are not the employee's to change.** A client may echo the whole
month back (which is what a form does) and the engine checks each echoed line
against what it computed, then stores its own copy. Three refusals:

| Body | Answer |
| --- | --- |
| `LEAVE` on a day with no approved request | *"…cannot be marked as leave: there is no approved leave request covering it. File the leave request first…"* |
| `HOLIDAY` on a day the company was open | *"…is not a public holiday and cannot be marked as one"* |
| Either, with different hours | *"…the hours of a LEAVE entry are set from the work schedule and cannot be changed"* |

Omitting a locked line is **not** an error: the engine writes it regardless, so a
client that strips locked rows before saving still gets a correct month. Only a
contradiction is refused.

**Half days.** `isHalfDay` + `halfDayPortion` on the leave request produce a
`LEAVE` line of half the configured hours, leaving the rest of the day's ceiling
free for `WORK`. The portion decides *which* half is left — somebody away for the
morning fills the afternoon. Entries carry `isLocked: true`, derived from `type`
and published so a client can grey the row without re-deriving a rule this module
owns.

## Retroactive dependency changes

Leave approvals, holiday corrections and schedule edits happen **after** people
fill their months in. The strategy is two rules:

### `APPROVED` months are frozen

At approval, `scheduleSnapshot` captures the working days, the week start, all
five hour figures and the forced days **as they stood**. An approved month is
never recomputed; its entries and its snapshot are the record of what was agreed.
Without it, opening a 2026 approval in 2028 would judge it against 2028's schedule
and report violations of a policy that did not exist when somebody signed it off.

`Json` rather than columns because it is a *photograph*: nothing queries inside
it, nothing joins to it, and the day the work schedule grows a field the snapshot
should grow one too without a migration per approval.

### `DRAFT` and `SUBMITTED` months go stale and notify

They are **not** silently rewritten either. On every single-timesheet read,
`refreshStaleness` compares what the engine would produce *today* against the
`LEAVE`/`HOLIDAY` lines actually stored, and re-runs the ceilings over the stored
work. If either disagrees, `is_stale` is raised and the owner is told once.

Three properties:

- **It is exact and needs no timestamps.** An earlier design compared `updatedAt`
  against when each dependency last changed, which marks every draft in the system
  stale when HR corrects a holiday in a different year. Comparing the *computed
  result* asks the only question that matters: would this month be filled
  differently now?
- **It never edits an entry.** A leave approved after the fact may mean a day is
  now absence, or may mean nothing because the person already accounted for it —
  and only they can say which. Rewriting would mean opening a timesheet to find
  hours nobody entered, with nothing saying who changed them.
- **It announces once.** The flag is raised by a conditional `updateMany` guarded
  on `isStale: false`, so several concurrent reads produce one notification.

The flag is lowered when the owner saves their entries again or submits — both are
the person confirming the month against the dependencies as they now stand.

**How dependencies signal this module.** The project has one cross-module reaction
pattern — a port the consumer declares and the producer registers into
(`NotificationEventPublisher`, Feature 026) — and it was deliberately not used
here, because it would mean the Leave, Public Holiday and Work Schedule modules
each growing a publisher for one consumer. Flag-on-read costs three queries on a
read that is already happening and needs no other module to change. The intended
push-based hook, if the volume ever justifies it, is a
`TimesheetDependencyPublisher` port on this module registered from those three;
recorded under [Future Improvements](#future-improvements).

**Staleness is refreshed on the single-timesheet reads only.** The administrative
list reports the stored flag: recomputing per row would be three queries per row.

**No cron, no scheduler, no background job.** Staleness is flag-on-read.

## Hour aggregates

Four figures on the list row **and** the detail:

| Field | What it sums |
| --- | --- |
| `workedHours` | `WORK` lines — the hours booked to projects |
| `leaveHours` | `LEAVE` lines — approved absence at the configured rate |
| `holidayHours` | `HOLIDAY` lines — days the company was closed |
| `totalHours` | all three |

**Four rather than one**, because "this person logged 168 hours" is not
reviewable: it does not say whether they worked a heavy month or were away for two
weeks at Christmas. It is what makes a list row triageable without opening it.

**None is a column.** They are computed on the way out, for the reason
`EmployeeLeaveBalance.remainingDays` is not a column: a stored total is a second
home for a fact the entries already state, and the day an `UPDATE` touched one and
not the other the database would hold a timesheet contradicting its own lines.

**One `groupBy` per page**, never one per row:

```ts
prisma.timesheetEntry.groupBy({
  by: ['timesheetId', 'type'],
  where: { timesheetId: { in: ids } },
  _sum: { hours: true },
});
```

Grouping by `(timesheetId, type)` answers all four figures in one round trip — the
three categories come back as rows and the total is their sum. A timesheet with no
entries produces no rows and is mapped to zeros by the caller, which is the honest
shape.

## Ownership and visibility

| Rule | Answer when broken |
| --- | --- |
| Only the owner may fill, submit or resubmit | `403` |
| Only an administrator may approve, reject or delete | `403` |
| An administrator never sees a `DRAFT` | `404` |
| A regular user only ever reaches their own timesheet, through `/me` | `403` |
| Editing a `SUBMITTED` or `APPROVED` month | `409` |

**The status codes are consistent and deliberate:** `403` is about *who is
asking*, `409` is about *the state of the resource*, `400` is about *the submitted
body*. Refusing to edit an approved month is **not** a permission problem —
nobody may, including the administrator who approved it — so answering `403` there
would send somebody looking for a role they are missing.

Ownership is a `403` rather than the `404` Feature 023 gives somebody else's leave
request, and the difference is the route. There, the id arrives on a `/me`
collection where distinguishing "not yours" from "does not exist" would confirm a
colleague has leave pending. Here the caller has *already been shown* the id by
their own endpoint, so the only way to meet the refusal is to send somebody else's
id deliberately.

A `DRAFT` addressed by an administrator is the one `404`, and for the leaking
reason: distinguishing "not finished" from "does not exist" would let them
discover a colleague has started their month.

### Why this is domain logic and not a guard

These rules are **not** authorization arriving early. "A timesheet is filled in by
the person it is about, and reviewed by somebody else" is what a timesheet *is* —
it would be true under any permission system, and it is the same kind of rule as
"only a `PENDING` leave request may be decided" (023) or "the administrative
notification workspace is administrative" (026).

Feature 029 built the permission catalog and enforces none of it, because
enforcement needs authentication first. This module follows that: no
`@RequirePermission()`, no guard, no wiring into the permission system.
`PermissionResource.TIMESHEET` is already seeded and waiting for the feature that
enforces it. When authentication lands, these checks stay exactly as they are and
a guard is added in front of them.

## Notifications

Four events, all emitted through **`NotificationDispatcher.executeEvent`**. This
feature sends nothing: no SMTP, no socket, no `notifications` row written here.

| Event | To | Channels | Carries |
| --- | --- | --- | --- |
| `timesheet_submitted` | administrators | in-app + email | employee name and code + period |
| `timesheet_approved` | the owner | in-app + email | period |
| `timesheet_rejected` | the owner | in-app + email | period + the rejection reason |
| `timesheet_stale` | the owner | in-app only | period + what changed |

**Every payload identifies which timesheet it refers to.** A person with three
months in flight must be able to tell from the message alone which one changed —
so every announcement names the period, and the administrative one names whose
month it is as well, because "a timesheet was submitted" is unactionable without
that.

`timesheet_stale` sends **no email**, deliberately: staleness is advisory and can
be raised by an unrelated correction, and a mail for each would train people to
ignore the ones that matter.

**An announcement can never fail the thing it announces.** Every method swallows
its errors and logs them. An approval that succeeded and then returned a `500`
because a mail server was down would be the worst of both: the month is approved,
the client believes it is not, and the retry meets an immutable timesheet.

### What was added to Feature 028

Feature 028 said its dispatcher would be reached "when the timesheet and leave
features want to announce something — by importing this module then", and
declined to export it earlier. This is that caller. The additions are additive;
campaigns and reminders behave exactly as before.

| Change | Why |
| --- | --- |
| `DeliverySource.Event` | A third source, and the first that is not a stored row |
| `NotificationDispatcher.executeEvent` | The entry point. No claim and no `SENT` — an event has no row to claim, and what stops a duplicate is the status-guarded transition that raised it |
| `EventDelivery`, `EventAudience` | What a producing module hands over |
| `DeliveryPlan.workspace` / `.recipientType` | Were implicit (`PERSONAL`+`USER`) and written into the dispatcher; stated on the plan now, because an administrative event is neither |
| `DeliveryPlan.emailRecipients` | Separated from `targets`, because an administrative broadcast reaches a *workspace* in-app but needs an address for email |
| `DeliveryPlan.eventKey`, `DeliveryResultEntity.eventKey` | Which event a run announced |
| `WorkScheduleModule` imported | For `findEmails` — the timesheet approval addresses |
| `NotificationDispatcher` exported | For this module |

**The administrative audience is one `ADMINISTRATIVE_USERS` notification, not a
fan-out.** The argument that makes a fan-out right for a campaign is that each
employee should own their copy. Administrative review is the opposite: "a
timesheet is waiting" is one piece of work one administrator picks up, and three
copies would leave the other two chasing a month a colleague already approved.
Feature 026's shared `isRead` is a limitation for an announcement and exactly the
semantics wanted here.

The email copy goes to **`timesheet_approval_emails`** — the list Feature 016
created as "an address notified when a timesheet needs approval", which nothing
had read until now. An empty list, or an unconfigured schedule, is a normal answer
and not a failure: the in-app notification is the channel administrators work
from.

No new email *template* was needed. Feature 028's `renderNotificationEmail` takes
a subject and a body, which is exactly what this feature composes; the wording
lives in `timesheet-notification.service.ts` because only the producing module
knows which timesheet and whose.

## API

All under `/api/v1`. Responses are wrapped by the Feature 004 interceptor as
`{ "success": true, "data": … }`.

### `GET /timesheets/me?month=&year=`

The caller's own month, in full. Both parameters required.

**Answers `404` when the month has not been opened** rather than an empty draft
shell — the choice the specification left open. A shell would be a resource the
client could not act on (no id, so it cannot be sent entries or submitted) and
would be indistinguishable from a real empty draft, so "have I started this
month?" would have no answer. The `404` says what is true; the client's response
to it is `POST /timesheets/me`.

Refreshes `isStale` on the way out.

```jsonc
{
  "id": "tsh-1",
  "employee": { "id": "emp-1", "employeeCode": "EMP-0001", "firstName": "Ion",
                "lastName": "Popescu",
                "department": { "id": "dep-1", "code": "DEV", "name": "Development" },
                "position":   { "id": "pos-1", "code": "DEV-SR", "name": "Senior Developer" } },
  "month": 9, "year": 2026,
  "status": "DRAFT",
  "submittedAt": null, "reviewedAt": null, "reviewedBy": null,
  "rejectionReason": null,
  "isStale": false,
  "scheduleSnapshot": null,
  "workedHours": 120, "leaveHours": 16, "holidayHours": 8, "totalHours": 144,
  "entries": [
    { "id": "tse-1", "date": "2026-09-01T00:00:00.000Z", "type": "WORK",
      "hours": 8, "project": { "id": "prj-1", "code": "ALPHA", "name": "Alpha",
                               "clientName": "Acme" },
      "leaveRequestId": null, "description": "Sprint work",
      "isLocked": false,
      "createdAt": "…", "updatedAt": "…" },
    { "id": "tse-2", "date": "2026-09-07T00:00:00.000Z", "type": "LEAVE",
      "hours": 4, "project": null, "leaveRequestId": "lvr-1",
      "description": "Annual Leave (first half)",
      "isLocked": true, "createdAt": "…", "updatedAt": "…" }
  ],
  "createdAt": "…", "updatedAt": "…"
}
```

### `POST /timesheets/me`

Opens the month, or returns the one that exists. **Idempotent** — a second call
returns the same timesheet, backed by the unique constraint. A fresh draft is
pre-populated with the leave and holidays. Answers `201`.

```jsonc
// Request
{ "month": 9, "year": 2026 }
```

`400` for a future month, an account with no employee record, or any extra field
(`employeeId`, `status` and `entries` are all refused).

### `PUT /timesheets/me/:id/entries`

Replaces the entry set. **The complete month, not the changes to it**: a day
omitted is a day cleared, an empty array clears the month, and the same body twice
leaves the same month.

```jsonc
// Request
{ "entries": [
    { "date": "2026-09-01", "type": "WORK", "hours": 8,
      "projectId": "prj-1", "description": "Sprint work" }
] }
```

Returns the whole timesheet. `409` if `SUBMITTED` or `APPROVED`, `403` if not the
caller's, `400` with **every** offending day named.

### `POST /timesheets/me/:id/submit`

`DRAFT|REJECTED → SUBMITTED`. Runs the full validation against the calendar as it
is now. Idempotent — a double submit moves no row and announces nothing. No body.
Answers `201`.

### `GET /timesheets`

The review queue. `?page= &limit= &sortBy= &sortOrder= &search= &month= &year=
&status= &departmentId=`.

- **Search** (case-insensitive): employee name, employee code, position name.
- **Filters:** status, month, year, department.
- **Sort:** `submittedAt` (default), `status`, `employee`, `createdAt`. See
  [decision 4](#4-sortbytotalhours-was-specified-and-is-not-implemented) for
  `totalHours`.
- **Never returns a `DRAFT`.** `?status=DRAFT` intersects to nothing and answers
  an empty page.
- There is no `?employeeId=` — a scope belongs in the URL (Feature 015).

Each row is the header, the employee with department and position, and the four
hour figures. **No entries and no snapshot.**

### `GET /timesheets/:id`

One month in full — the "see how it was filled" view. `404` on a `DRAFT`.
Refreshes `isStale`.

### `POST /timesheets/:id/approve`

`SUBMITTED → APPROVED`, guarded on `SUBMITTED`. Captures `scheduleSnapshot`.
**No body** — an approval carries nothing a client could state, and an optional
note would be stored as a caveat. Answers `201`. `409` if the month is not
submitted, or if somebody reviewed it a moment earlier.

### `POST /timesheets/:id/reject`

`SUBMITTED → REJECTED`, guarded on `SUBMITTED`.

```jsonc
// Request
{ "rejectionReason": "The 14th is missing." }
```

The reason is **required** — that is why this transition has a body and the
approval does not. `400` on a missing or whitespace-only reason.

### `DELETE /timesheets/:id`

Administrator only, non-`APPROVED` only. `409` on an approved month. Answers `200`
with `{ "success": true, "data": null }`.

## Leave Request half-day extension

`LeaveRequest` gains two **orthogonal** fields:

```prisma
isHalfDay      Boolean              @default(false) @map("is_half_day")
halfDayPortion LeaveHalfDayPortion? @map("half_day_portion")
```

**Two fields rather than a new leave type**, and that is the whole decision. Half
a day is a *quantity*, not a kind of leave: annual, medical and unpaid leave can
each be taken for half a day. An `ANNUAL_HALF_DAY` type would have doubled every
type HR maintains, doubled the balances hanging off them, and left every report
having to remember that two rows are one thing.

**Validation:** `halfDayPortion` is required when `isHalfDay` is true and refused
otherwise, judged in `LeaveRequestsService` against the state a write would leave
behind — because on a `PATCH` neither field alone is wrong. Sending
`{ "isHalfDay": false }` on a request that carries a portion **clears** it rather
than failing, since that body is a caller saying "a whole day again"; an
explicitly sent portion beside a false flag is still refused.

**Hours are not stated here.** A half day is half of that day's
`standard_hours_per_day` — a company on a seven-hour day gets three and a half.

**What did not change:** balances are still counted in whole days, so a half-day
request still consumes one. Making the day count fractional is a decision with its
own migration and is recorded under
[Future Improvements](#future-improvements) rather than taken quietly.

Two read methods were added to `LeaveRequestsService` for this module —
`findApprovedInSpan` and `hasApprovalsSince` — following the project's rule that
the module owning a table is the only one that queries it. Feature 023 exported
the service for exactly this and wrote no method in advance.

See [the Feature 023 amendment](023-leave-requests.md#amended-by-feature-030--half-day-absences).

## Frontend

None. This feature is backend only.

## Files Created

**Module (15 files)** — listed in [Files created](#files-created) above.

**Tests (5 files)**

| File | Covers |
| --- | --- |
| `timesheet-fill.service.spec.ts` | 31 tests: loggable days, weekend configurability, employment window, daily/weekly ceilings, week-start grouping, leave and holiday pre-population, half days, locked lines, project existence, snapshot |
| `timesheet.service.spec.ts` | 48 tests: the four transitions, idempotence, concurrency guards, immutability, ownership, visibility, aggregates, list filters, staleness |
| `timesheet-notification.service.spec.ts` | Payload identity, audiences, severities, channels, and that an announcement never fails its transition |
| `routing.spec.ts` | Route existence and ordering (`/me` before `/:id`), the header seam, validation at the routes, and the routes that deliberately do not exist |
| plus additions to `date.util.spec.ts`, `leave-requests.service.spec.ts`, `update-work-schedule.dto.spec.ts` | The shared calendar helpers, the half-day rules, and `weekStartsOn` |

**Documentation (1 file)** — this document.

## Files Modified

Listed in [Files modified](#files-modified) above, plus the amendment sections
appended to the Feature 010, 016, 023 and 028 documents.

## Notes

### Verification

| Check | Result |
| --- | --- |
| `npx prisma validate` | passes |
| `npx prisma generate` | passes |
| `npm run typecheck` | passes, no errors |
| `npm test` | **2162 passed / 2162**, 109 suites |
| `npx prettier --check "src/**/*.ts"` | passes |
| `npm run build` | passes |
| Existing tests broken | none — the four suites that needed fixture updates were updated, not weakened |

### What this feature deliberately does not do

- **No cron, no scheduler, no background worker.** Staleness is flag-on-read.
- **No email, no socket, no `notifications` row written here.** Everything goes
  through `NotificationDispatcher`.
- **No permission check.** See
  [Why this is domain logic](#why-this-is-domain-logic-and-not-a-guard).
- **No seed data.** `prisma/seed.ts` is untouched: a timesheet is produced by a
  person, and seeding one would put invented hours in a table payroll is drawn
  from. The seeded work schedule, holidays and projects are enough to fill one by
  hand.

### Known limitations, stated rather than hidden

1. **The weekly ceiling does not see across a month boundary.** Argued in
   [Fill-in rules](#fill-in-rules).
2. **Staleness on the administrative list is the stored flag**, refreshed only by
   a single-timesheet read.
3. **Month names in messages are English only.** This API has no locale to render
   into; every other human-readable string it produces is English too.
4. **A half day still consumes a whole day of balance.**
5. **`?sortBy=totalHours` is not offered.** See
   [decision 4](#4-sortbytotalhours-was-specified-and-is-not-implemented).

## Future Improvements

- **`taskId` on an entry**, once a Tasks feature exists. A nullable foreign key
  and a one-line migration.
- **`?sortBy=totalHours`**, needing either a denormalised `total_hours` column
  maintained on write or a raw SQL page query — a decision for the user.
- **Push-based staleness**: a `TimesheetDependencyPublisher` port on this module,
  registered from the Leave, Public Holiday and Work Schedule modules, replacing
  flag-on-read if the volume justifies it.
- **Fractional leave days**, so a half-day absence consumes half a day of balance.
  Needs a migration on `employee_leave_balances` and a decision about rounding.
- **A cross-month weekly ceiling**, and a decision about what it means for a
  timesheet's validity to depend on a neighbouring month.
- **Timesheet reminders**: `Reminder.daysBeforeDeadline` (027) exists and the
  scheduler runs, but "the timesheet deadline" is not yet a date this module
  publishes. The natural next step is a method here that answers which employees
  have not submitted a given month, narrowing 028's reminder audience from
  everybody to the people it is actually for.
- **A per-timesheet delivery report**, as Feature 028 already notes for campaigns.
- **Localised month names**, when the API gains a locale.
- **An entry-level `PATCH`**, if replacing the whole set ever proves too coarse
  for a client. It was not built because the rules are statements about the whole
  set.
