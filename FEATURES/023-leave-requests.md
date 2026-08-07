# Feature 023 — Leave Requests

## Goal

Record the leave employees ask for, and the decisions taken on it.

This is the module that joins the leave area up. Features 016–022 each built one
independent fact — which weekdays the company works, which days it is closed,
what kinds of leave exist, how many days each person holds — and none of them
computed anything or wrote another module's table. A leave request is the point
where all four have to agree, and it is the first write in this application that
moves data another module owns: approving a request deducts days from
`employee_leave_balances`.

Not in scope, and not partially in scope: authentication, authorization, email,
notifications and reports. Each is a later feature.

## Requirements

| # | Requirement | Where it lives |
| --- | --- | --- |
| 1 | An employee files, edits, withdraws and lists their own requests | `MyLeaveRequestsController` |
| 2 | HR/Admin lists everybody's requests and decides them | `LeaveRequestsController` |
| 3 | A request names at least one replacement, who must exist, must not be the requester, and must be free | `LeaveRequestsService.assertReplacementsAreAvailable` |
| 4 | A request must not overlap leave the same person already had approved | `LeaveRequestsService.assertNoApprovedOverlap` |
| 5 | Working days are calculated from the schedule, the holidays and the span — never stored | `WorkingDaysService` |
| 6 | Balances are consumed oldest year first, and only up to the leave's own year | `EmployeeLeaveBalancesService.consume` |
| 7 | A leave type that requires no approval produces an `APPROVED` request immediately | `LeaveRequestsService.createOwn` |
| 8 | `REJECTED` and `CANCELLED` never touch a balance | `LeaveRequestsService.decide` |
| 9 | Only a `PENDING` request may be edited, deleted or decided | `assertStillPending` |

## Database

### Enum: `LeaveRequestStatus`

`pending`, `approved`, `rejected`, `cancelled` — stored lower-case like every
other enum in this schema.

**The state machine has exactly one transition: out of `PENDING`.** `PENDING`
may become any of the other three; none of those three becomes anything. That is
what lets "a decision never moves balances back" be a rule the state machine
keeps rather than a promise the service has to remember. In particular
`CANCELLED` is a decision recorded against a request that was still waiting, not
an undo of an approval — see [Cancel](#cancel).

### Model: `LeaveRequest` → `leave_requests`

| Column | Type | Notes |
| --- | --- | --- |
| `id` | `text`, cuid | |
| `employee_id` | `text`, FK → `employees` `RESTRICT` | Who will be away. Never changes after creation. |
| `leave_type_id` | `text`, FK → `leave_types` `RESTRICT` | |
| `start_date` | `timestamp` | Inclusive. UTC midnight. |
| `end_date` | `timestamp` | **Inclusive.** A one-day absence stores the same date twice. |
| `reason` | `text?` | Why the person is asking. Nullable — see below. |
| `status` | `LeaveRequestStatus`, default `pending` | |
| `processed_by_id` | `text?`, FK → `employees` **`SET NULL`** | Who decided. |
| `processed_at` | `timestamp?` | When. |
| `decision_reason` | `text?` | Why the decision went the way it did. |
| `created_at` / `updated_at` | `timestamp` | |

Indexes: `(employee_id, status)`, `(leave_type_id)`, `(start_date)`.

**`reason` is nullable** because "no reason given" is a real answer rather than a
missing one. Leave of a type that requires no approval is notified rather than
requested, and demanding an explanation for a medical absence would put a
diagnosis into a column every screen listing requests reads.

**There is no `requested_working_days` column** — see
[Why `requestedWorkingDays` is calculated](#why-requestedworkingdays-is-calculated-and-not-stored).

### Model: `LeaveRequestReplacement` → `leave_request_replacements`

| Column | Type | Notes |
| --- | --- | --- |
| `leave_request_id` | `text`, FK → `leave_requests` **`CASCADE`** | |
| `employee_id` | `text`, FK → `employees` `RESTRICT` | |
| `created_at` | `timestamp` | |

Primary key: `(leave_request_id, employee_id)`. Index: `(employee_id)`.

A **table rather than an array column** on `LeaveRequest`, and the argument is
stronger than it was for `timesheet_approval_emails`: each entry is a *foreign
key*. An array of ids would be a relation PostgreSQL could not enforce, so a
replacement could name an employee who had since been deleted and nothing would
notice.

**The composite primary key states the rule directly**: a person may cover a
request once. Listing somebody twice is not a stronger nomination, and without
the constraint it would silently double every count taken over this table.

**There is no `id` and no `updated_at`.** Nothing about a nomination is editable
— changing who covers a request is deleting one row and inserting another, which
is exactly what `PATCH` does — so the pair is the whole identity and a surrogate
key would only add a second way to name it.

### Relationships added to existing models

| Model | Field | Notes |
| --- | --- | --- |
| `Employee` | `leaveRequests` | Leave they asked for. |
| `Employee` | `processedLeaveRequests` | Leave they decided, via the named relation `LeaveRequestProcessor`. Two relations to one table need explicit names. |
| `Employee` | `leaveRequestReplacements` | Requests they are covering. |
| `LeaveType` | `requests` | The second relation into `leave_types`, and the one that finally gives `requiresApproval` a reader. |

### Referential actions

Four of the five foreign keys are `RESTRICT`, matching every other key in this
schema. Two are deliberately different:

- **`processed_by_id` is `SET NULL`.** The fact that a decision was made
  survives the decider leaving the company, and `processed_at` keeps saying when
  it happened. `RESTRICT` would make an HR manager undeletable for as long as any
  request they ever touched exists.
- **`leave_request_id` is `CASCADE`** — the only cascade in this schema. A
  nomination is part of the request rather than a fact of its own: it says nothing
  once the request it belongs to is gone, so deleting a `PENDING` request takes
  its replacements with it.

## API

The header `x-employee-id` names the caller. It stands in for authentication —
see [The `x-employee-id` header](#the-x-employee-id-header).

### Employee endpoints

| Method | Path | Header | Notes |
| --- | --- | --- | --- |
| `GET` | `/api/v1/me/leave-requests` | required | Paginated, sortable, filterable |
| `GET` | `/api/v1/me/leave-requests/:id` | required | 404 for somebody else's request |
| `POST` | `/api/v1/me/leave-requests` | required | 201 |
| `PATCH` | `/api/v1/me/leave-requests/:id` | required | `PENDING` only, else 409 |
| `DELETE` | `/api/v1/me/leave-requests/:id` | required | `PENDING` only. **Hard delete.** 200 with `data: null` |

Filters: `?year=`, `?leaveTypeId=`, `?status=`.
Sort: `startDate` (default), `endDate`, `status`, `createdAt`.
Pagination: `?page=`, `?limit=`, `?sortOrder=` — Feature 006's shared DTOs.

`POST` body:

```json
{
  "leaveTypeId": "cm3…",
  "startDate": "2026-09-07",
  "endDate": "2026-09-11",
  "reason": "Family trip",
  "replacementEmployeeIds": ["cm3…"]
}
```

`PATCH` takes the same fields, all optional. `replacementEmployeeIds` **replaces
the whole set** rather than adding to it: the rule is "at least one replacement,
each free for the whole span", which is a statement about the set. Judged one
nomination at a time, removing the last one would have to be refused by a rule
that read as if it were about that person rather than about the request.

**There is no `employeeId`, `status`, `processedById` or `requestedWorkingDays`
in either body**, and sending one is a `400` — the global `ValidationPipe` runs
with `forbidNonWhitelisted`, so a client is told rather than having the field
silently ignored.

### HR/Admin endpoints

| Method | Path | Header | Notes |
| --- | --- | --- | --- |
| `GET` | `/api/v1/leave-requests` | — | Paginated, searchable, filterable, sortable |
| `GET` | `/api/v1/leave-requests/:id` | — | |
| `PATCH` | `/api/v1/leave-requests/:id/status` | required | The decision |

Filters: `?year=` (**defaults to the current year**), `?leaveTypeId=`,
`?status=`, `?departmentId=`, `?employeeId=`.
Search: `?search=` over the employee's `employeeCode`, `firstName`, `lastName`,
case-insensitively.
Sort: the four above, plus `employee` (the person's surname then given name).

```json
{ "status": "REJECTED", "decisionReason": "Team is short-staffed that week" }
```

`status` accepts `APPROVED`, `REJECTED`, `CANCELLED` — **never `PENDING`**.

**There is no `POST` and no `DELETE` on this collection**, and their absence is
deliberate rather than pending. Leave is asked for by the person taking it, so
filing on somebody else's behalf would put a request in their name that they
never made; and deleting one would erase a record of something that happened.

### Response shape

`/me` payloads carry **no `employee` object**. The person is the caller, and a
response must never repeat what the request already stated. HR payloads do carry
one, because there the rows really are about different people. Both carry
`requestedWorkingDays`, computed on every read.

## Validation rules

Applied in this order, so the escalation is honest: a body that contradicts
itself is a `400`, a request clashing with something stored is a `409`, and only
a request sound in every other way is finally weighed against the balance.

| Rule | Code | Where |
| --- | --- | --- |
| Body shape, at least one replacement, no duplicate replacements, bounded text | 400 | DTOs |
| `endDate` not before `startDate` | 400 | `assertOrderedSpan` |
| Span at most 366 days | 400 | `assertSpanIsBounded` |
| Both dates between 2000 and 2100 | 400 | `assertYearsAreInRange` |
| Leave type exists | 400 | `assertLeaveTypeAccepts` |
| Leave type is `isActive` | 400 | `assertLeaveTypeAccepts` |
| Replacement is not the requester | 400 | `assertReplacementsAreAvailable` |
| Every replacement exists | 400 | `assertReplacementsAreAvailable` |
| No replacement is on approved leave over the span | 400 | `assertReplacementsAreAvailable` |
| Requester has no approved leave over the span | **409** | `assertNoApprovedOverlap` |
| The span contains at least one working day | 400 | `countAndAssertWorkingDays` |
| The balance covers the request | 400 | `assertBalanceCovers` |
| Only `PENDING` may be edited, deleted or decided | **409** | `assertStillPending` |
| `decisionReason` required for `REJECTED`/`CANCELLED`, refused for `APPROVED` | 400 | `assertDecisionReasonMatches` |

The span cap is a rule about cost as much as about validity: it bounds the
day-by-day walk in `WorkingDaysService`, so no caller can make that loop run
longer than a year.

**A span with no working days is refused.** A request covering only weekends and
public holidays consumes nothing and grants nothing — the person was already not
working those days — so storing it would put a row in the ledger that deducts
zero and means zero, and would let somebody "book" a bank holiday.

**`isActive` on a leave type now means something.** Feature 021 made it a flag
rather than a delete so leave already recorded against a retired type keeps its
meaning; refusing *new* requests is the other half of that, and until this
feature nothing enforced it.

## Working day calculation

`WorkingDaysService` — a dedicated service, as the feature requires — and the
count it produces is stored nowhere.

It considers four things:

1. **Which weekdays the company works** — `WorkSchedule.workingDays`, read
   through the new `WorkScheduleService.findWorkingDays()`. Feature 016 wrote
   that configuration and said nothing would compute against it until a feature
   had a reason to; this is that feature, and Feature 016 still computes nothing.
2. **Saturdays and Sundays** — excluded *because they are not in `workingDays`*,
   not by a rule of their own. That is deliberate: a company that works Saturdays
   says so in its schedule, and a hard-coded weekend rule would then contradict
   the configuration on every request. One source of truth, and the weekend is a
   consequence of it.
3. **Public holidays** — every day covered by a holiday in force that year, read
   through `PublicHolidayService.findYear`, which Feature 019 made historically
   correct. A request in 2026 is counted against the holidays 2026 actually had,
   not against today's calendar.
4. **The span**, both ends inclusive, matching how the dates are stored.

Everything is computed in **UTC** on both sides. The columns are `timestamp` and
a client posting `2026-09-07` gets UTC midnight, so reading a local weekday would
make the count depend on where the server is deployed — a Monday west of
Greenwich would be the previous Sunday, and a five-day request would come back as
four.

### The calculator shape

`createCalculator(years)` loads the schedule and the holidays **once**, then
returns an object that counts any span by arithmetic. A page of fifty requests
therefore costs two queries and fifty hash-lookup walks, not a hundred queries.
`yearsSpannedBy` builds the year set from **both ends** of every span, so a
request running from December into January loads both years' holidays — the case
a "year of the start date" shortcut gets wrong, and gets wrong silently.

The walk is day by day rather than "whole weeks times the working days in one,
plus the remainder". The arithmetic shortcut would be faster and would then need
its own correction for holidays, which do not distribute evenly over weeks; at
the span lengths this feature admits, being obviously right is worth more.

If no work schedule has been configured, `findWorkingDays()` throws its module's
`404` and it propagates. That is the honest answer — without knowing which
weekdays the company works, a day count is not a number anything can guess — and
the message names the request that fixes it. An **empty** list page short-circuits
before asking, so `GET` on an unconfigured system still answers normally.

## Replacement validation

Three rules, each failing for a different reason, and **all reported at once** as
an array so a form can mark every offending name instead of surfacing the second
problem only after the first is fixed:

1. **Nobody may replace themselves.** A person who is away is not covering their
   own work, and accepting it would let a request satisfy the "at least one
   replacement" rule while nominating nobody at all.
2. **Every replacement must exist** — a `400` naming each missing id rather than
   a foreign-key violation surfacing as a `500`.
3. **No replacement may already be on `APPROVED` leave over the same days.**
   Cover that is itself away is not cover. Only `APPROVED` counts: a colleague's
   `PENDING` request may yet be refused, and blocking on it would let an
   unanswered request veto somebody else's.

Replacements are named in the message by employee code and surname rather than by
id, because the person reading it chose them from a list of names.

**`Employee.canReplaceOthers` is deliberately not enforced.** The column exists
and this feature is its natural reader, but the specification enumerated exactly
three replacement rules and this is not one of them — adding it would refuse
requests the feature as stated accepts. See [Future improvements](#future-improvements).

## Overlap validation

Two comparisons, both inclusive: two spans intersect when each begins on or
before the other ends. Written once (`overlapFilter`) because the requester's own
check and the replacements' availability check are the same question asked of
different people, and two spellings would eventually disagree about the boundary
— a request starting on the day another ends **is** an overlap.

Only `APPROVED` requests block. Two `PENDING` requests over the same days are not
yet a contradiction; refusing the second at filing time would make the first
one's mere existence a decision nobody took.

It is a **`409`**, not a `400`: the submitted body is well formed, it conflicts
with something already stored.

The check runs again **at approval time**. Time passes between filing and
deciding, and another approval may have claimed the same dates in between.

## Leave balance consumption

Owned by `EmployeeLeaveBalancesService`, not by this module — so
`employee_leave_balances.used_days` keeps exactly one writer. Feature 022
exported its service for this caller and deliberately wrote no method in advance;
these are what the caller turned out to need:

| Method | Answers |
| --- | --- |
| `findAvailable(scope, client?)` | The balances that may be drawn on, oldest year first, each with `remainingDays` |
| `countAvailableDays(scope)` | Their sum |
| `consume(scope, days, tx)` | Takes the days, oldest first. Throws if short. |

`remainingDays` is `allocatedDays + carriedOverDays - usedDays`, computed by
Feature 022's `computeRemainingDays` — still never a column.

**Oldest year first, and that ordering is not cosmetic.** Days carried over from
earlier years expire before this year's do, so consuming the newest first would
quietly let the oldest lapse unused — the employee would lose days they were
entitled to, and nothing in the data would say why.

**Never a year later than the leave.** `upToYear` is the year the absence *ends*
in. A balance for a later year is next year's entitlement, already entered by HR;
spending it on this year's absence would let somebody take twenty-one days in
September and have HR discover in January that the year had already been drawn. A
leave running from December into January *may* reach the new year, because the
January days genuinely belong to it.

Exhausted and **overdrawn** years are dropped rather than returned as zero or as
a debt: Feature 022 deliberately allows a negative remainder, and letting the next
year's allocation silently settle it would hide exactly the situation somebody
needs to see.

The check is made **twice**, and the duplication is deliberate:

- **Before writing**, so "you do not have enough leave" reaches the employee
  while they are still choosing dates rather than a fortnight later.
- **Inside the approving transaction**, against a snapshot that may have moved.
  Only this one is a guarantee; only the other is timely.

Both report the same message (`insufficientLeaveMessage`), stating both numbers —
knowing you have four days and asked for five tells you to shorten the request.

## Automatic approval

`LeaveType.requiresApproval = false`:

- the request is created with `status = APPROVED`
- the days are consumed **in the same transaction** that creates it
- `processedAt` is set — the decision happened at a moment
- `processedById` stays `null` — **no person made it**

Those two columns together are the only way to tell an automatic approval from a
human one afterwards, which is [why there are two of them](#why-processedbyid-and-processedat).

## Manual approval

`LeaveType.requiresApproval = true` (the default):

- the request is created with `status = PENDING`
- **no balance is touched**
- the balance is still *checked*, so an impossible request is refused at filing
  time
- when HR sends `PATCH /leave-requests/:id/status` with `APPROVED`, the overlap
  and the balance are re-checked, the days are **recounted** against today's
  calendar, and status + deduction are written in one transaction

**Approval and the deduction are one transaction.** Either the status is written
and the days come out, or neither happens. Two writes could leave somebody with
approved leave nobody paid for.

**The days are recounted, not remembered.** The company calendar may have changed
since the request was filed — a public holiday corrected, a working day added —
and the deduction should reflect the calendar as it is. Which is the same
argument for not storing the count in the first place.

## Reject

`REJECTED` **never modifies balances.** There is no branch in `decide` that
writes a balance for it, which is a stronger statement than a comment: the
deduction happens in one place, under one condition.

`decisionReason` is **required**. "No" without one is not an answer the employee
can act on — they cannot tell whether to shorten the request, move it, or go and
talk to somebody. A whitespace-only reason collapses to `null` and is refused, so
it cannot satisfy the presence check while telling them nothing.

## Cancel

`CANCELLED` **never modifies balances** either, and `decisionReason` is likewise
required.

**Only a `PENDING` request can be cancelled**, and that reading is deliberate.
The specification says decided requests are read-only and that cancelling must
never touch a balance; those two only hold together if cancellation is confined to
requests that never consumed anything. Allowing an `APPROVED` request to be
cancelled without releasing its days would leave the balance describing leave
nobody took — the opposite of what a ledger is for.

**This means an approved absence cannot currently be called off through the API.**
That is a real limitation, stated rather than hidden; releasing days on
cancel-after-approval is a decision with its own rules (does a half-taken absence
release all of it? which year do the days go back to?) and belongs to the feature
that decides them. See [Future improvements](#future-improvements).

## Why `processedById` and `processedAt`

**Two columns rather than one, and both nullable**, because they can be absent
for different reasons:

- A `PENDING` request has neither.
- An automatically approved request has `processedAt` but **not**
  `processedById` — the decision happened at a moment, but no person made it.
- A humanly decided request has both.

Neither can be derived from what is already stored. `updatedAt` moves whenever
*any* column does, so it cannot say when the decision was taken; and `status`
alone cannot tell an automatic approval from a human one.

`processedById` is an **employee** rather than a user, so a decision can be
rendered as a name beside the request without a second join through `users`. It
is the one `SET NULL` foreign key in the schema, so the fact that a decision was
made survives the decider leaving.

It comes from the `x-employee-id` header rather than the body, so a client cannot
sign somebody else's name to a decision; `processedAt` comes from the transaction
rather than from the client's clock.

## Why `requestedWorkingDays` is calculated and not stored

It depends on **three things the company keeps editing**: which weekdays it
works, which days it is closed, and the span itself. A column would freeze an
answer its own inputs could later contradict — correcting a public holiday HR
entered on the wrong date would leave every request that spanned it carrying a
day count nothing in the database agrees with, and no reader could say which of
the two was right.

It is the same call Feature 022 made for `remainingDays`, applied to a value with
three *inputs* rather than three columns — and it is why `?sortBy=requestedWorkingDays`
is rejected: there is no column for `orderBy` to name, and sorting a page after it
was fetched would sort the wrong rows, since the page was already chosen.

The days a request actually *consumed* **are** recorded — as
`employee_leave_balances.used_days`. That is the ledger; a request is the document
that moved it.

## The `x-employee-id` header

Authentication is out of scope, but `/me` routes and a signed decision need to
know who is calling. The header is that stand-in, and three things about it are
the point:

1. **It is one seam, in one file** — `@CurrentEmployeeId()`. When auth arrives,
   the body of that function becomes `request.user.employeeId` and no controller,
   service, DTO or test signature moves.
2. **It is a header rather than a body or query field.** A caller's identity is
   not a property of the resource being created and not a filter over a
   collection. In the body it would make `employeeId` a field a client could set
   per request — which is what it will stop being; in the query string it would
   make `/me` a lie, since the scope would then be stated twice.
3. **It authenticates nothing and authorises nothing.** Any caller may claim any
   employee id, and every HR route is entirely open. That is not a weakness to be
   patched here — half an access check reads as protection while providing none —
   it is the honest shape of an API whose auth feature has not been written.

What the `/me` methods *do* enforce is **ownership**: a request belonging to
somebody else answers the same `404` as one that does not exist, so the endpoint
cannot be used to discover that a colleague has leave pending.

The value is validated for shape only — present, non-empty, at most
`RELATION_ID_MAX_LENGTH`. A header sent twice arrives as an array and is refused
rather than having its first value taken, so a second claim cannot be smuggled
past anything that logged only one.

## Backend

### Files created

| File | Purpose |
| --- | --- |
| `src/common/decorators/current-employee-id.decorator.ts` | `@CurrentEmployeeId()` — the single authentication seam |
| `src/modules/leave-requests/leave-request.constants.ts` | Bounds, sort fields, the decision vocabulary |
| `src/modules/leave-requests/leave-requests.module.ts` | Wiring; five imports, two controllers, two providers |
| `src/modules/leave-requests/my-leave-requests.controller.ts` | `/api/v1/me/leave-requests` |
| `src/modules/leave-requests/leave-requests.controller.ts` | `/api/v1/leave-requests` |
| `src/modules/leave-requests/leave-requests.service.ts` | Every rule in the feature |
| `src/modules/leave-requests/working-days.service.ts` | The whole of the working-day count |
| `src/modules/leave-requests/dto/create-leave-request.dto.ts` | `POST` body |
| `src/modules/leave-requests/dto/update-leave-request.dto.ts` | `PATCH` body |
| `src/modules/leave-requests/dto/update-leave-request-status.dto.ts` | The decision body |
| `src/modules/leave-requests/dto/leave-request-query.dto.ts` | Three classes: shared filters, `/me` list, HR list |
| `src/modules/leave-requests/dto/leave-request-field.decorators.ts` | Per-field rules shared by the DTOs |
| `src/modules/leave-requests/entities/leave-request.entity.ts` | Two selects, two payloads, two mappers |
| `src/modules/leave-requests/leave-requests.service.spec.ts` | 45 tests over the business rules |
| `src/modules/leave-requests/working-days.service.spec.ts` | 17 tests over the calculation |
| `src/modules/leave-requests/routing.spec.ts` | The two collections do not collide; the header decorator |
| `src/modules/leave-requests/dto/create-leave-request.dto.spec.ts` | |
| `src/modules/leave-requests/dto/update-leave-request-status.dto.spec.ts` | |
| `prisma/migrations/20260804200000_add_leave_requests/migration.sql` | |

**Two controllers, one service.** `/me/leave-requests` and `/leave-requests`
answer genuinely different questions and their payloads differ, so they are two
files — the specification named one, and splitting it is the smaller deviation
than putting two unrelated payload shapes in one class. The rules they enforce
are the same rules, so there is one service: splitting *that* would have given
the overlap check, the working-day count and the balance arithmetic two homes.

### Files modified

| File | Change | Why |
| --- | --- | --- |
| `prisma/schema.prisma` | `LeaveRequestStatus`, `LeaveRequest`, `LeaveRequestReplacement`; four relation fields on `Employee` and `LeaveType` | The feature |
| `src/app.module.ts` | Registers `LeaveRequestsModule` | |
| `src/common/decorators/trim.decorator.ts` | Trims each element of an array | `replacementEmployeeIds` is the first list of foreign keys; without it an array fell into the pass-through and reached the database with a client's whitespace on it |
| `src/common/decorators/is-relation-id.decorator.ts` | Accepts `ValidationOptions` | So `{ each: true }` works on a list of ids without respelling the three rules |
| `src/modules/work-schedule/work-schedule.service.ts` | `findWorkingDays()` | The hand-off Feature 016 anticipated. Returns the array, not the entity — a consumer has no business reading eight hour figures |
| `src/modules/leave-configuration/leave-types.service.ts` | `findPolicy()`; `remove()` counts requests | `requiresApproval` and `isActive` in one round trip; a type a request points at can no longer be deleted |
| `src/modules/employee-leave-balances/employee-leave-balances.service.ts` | `findAvailable`, `countAvailableDays`, `consume`, `insufficientLeaveMessage` | The methods Feature 022 said would be written by the feature that asked |
| `src/modules/employees/employee.service.ts` | `remove()` counts requests and replacements | Two new relations point at an employee. `processedLeaveRequests` is deliberately **not** counted — see below |
| `src/modules/employee-leave-balances/employee-leave-balances.service.spec.ts` | +12 tests | The consumption methods |
| `test/app.e2e-spec.ts` | +11 tests | Route wiring and the fields a client is refused |

`EmployeeService.remove` counts `projectMemberships`, `leaveBalances`,
`leaveRequests` and `leaveRequestReplacements` — but **not**
`processedLeaveRequests`, matching the `SET NULL` on that key. Counting it would
make an HR manager undeletable for as long as any request they ever touched
exists.

### Module graph

`LeaveRequestsModule` imports `EmployeeModule`, `LeaveConfigurationModule`,
`EmployeeLeaveBalancesModule`, `WorkScheduleModule` and `PublicHolidayModule` —
the widest import list in the project, which is the honest shape of a feature that
is the point where five previously independent facts have to agree. **None of the
five imports it back**, so the graph stays acyclic and no `forwardRef` is needed:
this module reads four of them and writes exactly one table it does not own, and
does that *through the owning service* rather than by reaching into the table.

## Frontend

None. Feature 023 is backend only.

## Migration

`prisma/migrations/20260804200000_add_leave_requests/migration.sql`

**Purely additive.** One enum and two tables are created; no existing column is
dropped, narrowed or back-filled, and nothing already recorded changes meaning.
Applying it to a populated database costs two empty tables. This is the opposite
of Feature 022's migration, which dropped `employees.max_vacation_days` and its
data.

To apply:

```bash
cd backend
npm run prisma:migrate
```

`prisma generate` has already been run, so `src/generated/prisma` is current; it
is gitignored and rebuilt by `postinstall`.

## Testing

| Suite | Tests |
| --- | --- |
| `leave-requests.service.spec.ts` | 45 — span, leave type, replacements, overlap, balance, both approval paths, the state machine, decisions, listing |
| `working-days.service.spec.ts` | 17 — inclusive spans, configured weekdays, holidays, cross-year, one calendar per page |
| `routing.spec.ts` | 21 — collection collision, the header, query validation |
| `create-leave-request.dto.spec.ts` | 18 |
| `update-leave-request-status.dto.spec.ts` | 11 |
| `employee-leave-balances.service.spec.ts` | +12 — oldest-year-first, the `upToYear` bound, overdrawn years, the shortfall |
| `app.e2e-spec.ts` | +11 |

Whole suite: **1273 unit tests, 39 e2e**, all passing. `tsc --noEmit` clean,
`nest build` clean.

## Notes

### Where the specification and the codebase disagreed

- **The specification numbered Work Schedule Configuration as 019 and Public
  Holidays as 020.** In this repository they are **016** and **017**; 019 is
  Public Holiday Validity Years and 020 is Termination Closes Project
  Memberships. The modules reused are the right ones — `WorkScheduleModule` and
  `PublicHolidayModule` — whatever number they carry.
- **`?leaveType=` is spelled `?leaveTypeId=`**, matching
  `EmployeeLeaveBalanceQueryDto`. The value is an id; a parameter named
  `leaveType` would invite clients to send `ANNUAL`.
- **The HR list defaults to the current year**, as specified — and that is the
  one place this module departs from the rule `EmployeeLeaveBalanceQueryDto`
  states, that a filter should never take the place of a default. The reason it
  is right here and wrong there is growth: balances are one row per person per
  type per year, while this table gains a row for every absence every employee
  ever takes. **The cost is real: there is no way to ask for every year at once.**

### What this feature does not do

No email, no authentication, no authorization, no notifications, no reports —
each a later feature. `LeaveRequestsService` is exported for the first two of
those to build on, with no method written in advance.

## Future improvements

1. **Release days when an approved absence is called off.** The blocking design
   question is what "cancelling" an approved request means: does a half-taken
   absence release all of its days, and to which year do they return? A new
   status (`WITHDRAWN`) with its own transition out of `APPROVED`, plus a
   `release` method beside `consume`, is the shape to reach for.
2. **Enforce `Employee.canReplaceOthers`.** The column exists and this is its
   natural reader; it was left out because the specification enumerated exactly
   three replacement rules. One line in `assertReplacementsAreAvailable`.
3. **Refuse a terminated employee as a replacement.** Same place, same
   reasoning — and arguably more urgent than the flag.
4. **`?year=all` on the HR list**, if the missing "every year" answer turns out
   to matter. A union type on the parameter, and `buildFilters` skipping the range.
5. **Sorting by `requestedWorkingDays`** would need a generated column or raw
   SQL over three tables. Both are real options; neither is worth doing before
   somebody asks.
6. **Cross-employee overlap reporting** — "how much of the Development team is
   away that week" — belongs to a reporting feature, deliberately deferred.

---

## Amended by Feature 030 — Half-day absences

[Feature 030](030-timesheet-management.md) extended this feature with two columns
and two read methods. **Nothing in this document is retracted**: the state
machine, the balance arithmetic, the overlap rules and the working-day count are
all unchanged.

### The two columns

```prisma
isHalfDay      Boolean              @default(false) @map("is_half_day")
halfDayPortion LeaveHalfDayPortion? @map("half_day_portion")
```

`LeaveHalfDayPortion` is a new enum with two values, `FIRST_HALF` and
`SECOND_HALF`.

### Why not a new leave type

This is the whole decision, and it was made against the obvious alternative.

**Half a day is a quantity, not a kind of leave.** Annual, medical and unpaid
leave can each be taken for half a day. Spelled as a `LeaveType`, every existing
type would have needed a half-day twin: the vocabulary HR maintains doubles, the
balances hanging off each type double, `defaultAllocatedDays` has to be stated
twice, and every report has to remember that `ANNUAL` and `ANNUAL_HALF_DAY` are
one thing added together. The two columns are **orthogonal to `leave_type_id`**,
which is what lets any type — including one added next year — be taken either way
with no further work.

Two values and no third. Quarter days and arbitrary hour ranges are deliberately
not expressible: a vocabulary of fractions is a small language, and inventing one
before anybody has asked would fix its syntax before anything could show which
fractions are actually wanted.

### Why the portion is stored rather than assumed

It decides **which hours are left for work**. Somebody away for the morning fills
the afternoon; a timesheet that could not say which half would be describing a
different day. It is read only by the Timesheets module — nothing in this feature
acts on it.

### Validation

`halfDayPortion` is required exactly when `isHalfDay` is true, and refused
otherwise. Enforced in `LeaveRequestsService` rather than by a CHECK constraint,
for the reason `decisionReason` is: it is a rule about two fields at once, judged
against the state a write would **leave behind**, which a `PATCH` carrying only
one of them makes unavoidable.

One asymmetry is deliberate. Sending `{ "isHalfDay": false }` on a request that
carries a portion **clears** the portion rather than failing — that body is a
caller saying "this is a whole day again", and refusing it would demand they also
send `halfDayPortion: null` to state the same thing twice. An explicitly *sent*
portion beside a false flag is still refused, because that body contradicts
itself.

Both DTOs accept the pair; both are optional, and `isHalfDay` carries
`@ValidateIfPresent()` (the column is not nullable) while `halfDayPortion` carries
`@IsOptional()` (it is).

### How many hours half a day is — not stated here

Deliberately absent from this feature, which computes no hours and has no opinion
about them. The Timesheets module books half of that day's
`WorkSchedule.standardHoursPerDay`, so a company on a seven-hour day gets three
and a half rather than a hard-coded four.

### What did **not** change: the balance

**A half-day absence still consumes a whole day of balance.**
`requestedWorkingDays` is not halved, `EmployeeLeaveBalancesService.consume` is
untouched, and `employee_leave_balances` is still counted in whole days.

That is a stated limitation rather than an oversight. Making the day count
fractional means a migration on the balance columns and a decision about how
rounding works when somebody has half a day left and asks for a whole one — which
is a leave-policy decision with its own name on it, not something to slip into a
timesheet feature. It is recorded in Feature 030's Future Improvements.

### Two read methods added

Feature 023 exported `LeaveRequestsService` saying "the notifications feature will
have to know when a request changes state" and wrote no method in advance. The
Timesheets module is the caller that arrived first, and it needed:

| Method | Answers |
| --- | --- |
| `findApprovedInSpan(employeeId, span)` | every **approved** absence of one person touching a span, with its half-day pair and its leave type label |
| `hasApprovalsSince(employeeId, span, since)` | whether any approval touching that span was decided after a moment |

Both are here rather than in the timesheet module for the rule this project keeps
everywhere: the module that owns a table is the only one that queries it.

Two details worth naming. `findApprovedInSpan` returns **only `APPROVED`**
requests — a `PENDING` one may yet be refused, and pre-populating a timesheet from
it would put hours on somebody's month for an absence nobody granted, and leave
them there looking approved. `hasApprovalsSince` compares `processedAt` and not
`updatedAt`, because `updatedAt` moves whenever any column does: a typo corrected
in a reason would otherwise mark every timesheet touching that month as needing
review.

### API changes

`isHalfDay` and `halfDayPortion` are accepted on `POST` and `PATCH
/api/v1/me/leave-requests`, and appear on every leave-request response — both the
employee's own and the HR list.

### Migration

Part of `add_timesheet_management`. `is_half_day` is defaulted and
`half_day_portion` is nullable, so every request written before this extension is
what it always was: a whole-day absence.
