# Feature 022 — Employee Leave Balances

**Status:** Completed
**Date:** 2026-08-04

## Goal

Record how much leave each employee has, of each kind, in each year — allocated
by hand by HR/Admin.

This is the first module in the leave area that holds **data** rather than
configuration. [Feature 021](021-leave-configuration.md) says what kinds of leave
exist; this says who has how many days of them.

Two rules shape everything below:

- **Nothing is allocated automatically.** Creating an employee grants no leave.
  A balance exists because somebody decided a number.
- **`remainingDays` is never stored.** It is computed on every read from the
  three columns that are the single source of truth.

Explicitly **not** included, and left to the features that own them: leave
requests, approval, automatic deduction, the leave validation engine,
replacement employees, email notifications, authentication and authorization.

## Requirements

- Remove `maxVacationDays` from `Employee`.
- New `EmployeeLeaveBalance`, related to both `Employee` and `LeaveType`.
- One balance per `(employee, leave type, year)` — enforced, not merely
  documented.
- `allocatedDays`, `carriedOverDays`, `usedDays` stored; `remainingDays`
  computed and returned by every endpoint.
- Full CRUD with pagination, case-insensitive search, three filters and five
  sort columns.
- Reuse of the Feature 006 infrastructure: pagination DTOs and helpers, the
  global exception filter, the global response interceptor.

## Database

### Why `maxVacationDays` was removed from `Employee`

The column held one integer per person — `21`, `25`, `18`. It could not survive
this feature because of what it failed to say:

| Question | What the column answered |
| --- | --- |
| How many days? | one number |
| Of **which leave type**? | nothing — `21` was implicitly annual leave, and nothing recorded that |
| For **which year**? | nothing — it was an entitlement "in general" |
| How many are **left**? | nothing — no days were ever counted against it |
| What was it **last year**? | nothing — changing it erased the old value |

Every one of those is a question HR actually asks. A single number attached to a
person cannot answer them, and stretching it to try — a second column for medical
leave, a third for unpaid — would recreate `employee_leave_balances` one column
at a time, without the year.

Keeping it alongside the new table would have been worse than either: two places
claiming to say how much leave somebody has, free to disagree, with nothing
stating which one wins. So it is gone, and `Employee` now carries a
`leaveBalances` relation instead — the same fact at the grain it is actually
decided in.

The bounds that guarded it (`EMPLOYEE_MIN_VACATION_DAYS`,
`EMPLOYEE_MAX_VACATION_DAYS`) and its validator (`IsEmployeeMaxVacationDays()`)
went with it; the equivalent rules now live in
`employee-leave-balance.constants.ts`. Both files keep a short note where the
code used to be, so the removal reads as a decision rather than as something
mislaid.

### Model `EmployeeLeaveBalance`

```prisma
model EmployeeLeaveBalance {
  id              String   @id @default(cuid())
  employeeId      String   @map("employee_id")
  employee        Employee @relation(fields: [employeeId], references: [id])
  leaveTypeId     String   @map("leave_type_id")
  leaveType       LeaveType @relation(fields: [leaveTypeId], references: [id])
  year            Int
  allocatedDays   Int      @map("allocated_days")
  carriedOverDays Int      @default(0) @map("carried_over_days")
  usedDays        Int      @default(0) @map("used_days")
  notes           String?
  createdAt       DateTime @default(now()) @map("created_at")
  updatedAt       DateTime @updatedAt @map("updated_at")

  @@unique([employeeId, leaveTypeId, year])
  @@index([leaveTypeId])
  @@index([year])
  @@map("employee_leave_balances")
}
```

One row is *one grant*: this person, this kind of leave, this year.

| Field | Meaning, and why it is shaped this way |
| --- | --- |
| `employeeId` + `leaveTypeId` + `year` | Together, the balance's **identity** — the unique constraint is on exactly this triple. Not three editable properties; see *`PATCH`* below. |
| `year` | A calendar year, not a date range. Leave is budgeted per year, and a year is what makes "one balance per person per type per year" statable. |
| `allocatedDays` | Days granted by HR. **Required, no default** — a balance exists because somebody decided a number, and `0` is a decision that has to be typed. |
| `carriedOverDays` | Days brought forward from earlier years. Defaults to `0`. |
| `usedDays` | Days already consumed by approved leave. Defaults to `0`. |
| `notes` | Optional HR note: why the allocation is what it is. Read by nothing. |

**Why the three counts are separate columns** rather than one running total: they
are written by different hands and consumed in a different order. HR sets
`allocatedDays`, a year-end process will set `carriedOverDays`, and Leave
Requests will move `usedDays`. Added together at entry, a balance that looked
wrong could not be audited — nobody could say which of the three had changed —
and the "carried-over days first" consumption rule the next feature needs could
never be applied.

**`carriedOverDays` is not derived from last year's balance**, deliberately.
Carrying days over is a policy decision with a cap and an expiry that nobody has
specified yet ([Feature 021](021-leave-configuration.md) removed the global flag
that tried to). Until that feature exists, the number is entered, which is
honest; computing it from a rule nobody has written would invent one.

**Indexes.** Three, where the configuration tables of Features 016–021
deliberately have almost none. The difference is growth: those hold tens of rows
and PostgreSQL scans them faster than it would descend an index, while this table
gains a row for every employee × every leave type × every year and never shrinks.
The unique index also serves `employeeId` lookups, since it leads with that
column; `?leaveTypeId=` and `?year=` are exactly the two filters it cannot serve,
so each gets its own.

**Foreign keys are `ON DELETE RESTRICT`**, matching every other relation in this
schema. A balance is a statement about a person and a kind of leave; deleting
either out from under it would leave a number belonging to nobody.

### Why `remainingDays` is not stored

It is `allocatedDays + carriedOverDays - usedDays` — a function of three columns
that are already there.

Storing it would give one fact two homes. The moment any code path updated
`usedDays` without recomputing the copy — a bulk correction, a migration, a
future approval routine, a hand-run `UPDATE` — the row would hold a balance that
contradicts its own parts, and **nothing in the database could say which of the
two was right**. That is not a hypothetical failure mode; it is the ordinary fate
of every denormalised total that is not maintained by a trigger.

The alternatives, and why the computed field wins:

| Option | Why not |
| --- | --- |
| A stored `remaining_days` column | Two sources of truth for one fact. Every writer must remember to update it, and the one that forgets is silent. |
| A PostgreSQL generated column | Safe from drift, but it makes the arithmetic a **schema change**: revising the formula (say, if carried-over days stop counting toward the total) becomes a migration instead of a line of TypeScript. Wrong place for a rule the business may revise. |
| A database view | Same objection, plus a second object to keep in step with the table. |
| **Computed in the entity mapper** | The three columns stay the only truth, the formula is one function, and changing it is a code change with a test. |

### How `remainingDays` is calculated

One function, in `entities/employee-leave-balance.entity.ts`:

```ts
export function computeRemainingDays({
  allocatedDays,
  carriedOverDays,
  usedDays,
}): number {
  return allocatedDays + carriedOverDays - usedDays;
}
```

`toLeaveBalanceEntity` calls it, and every endpoint that publishes a balance goes
through that mapper — list, detail, create and update alike. Nothing else
computes it, which is what keeps the formula a single decision rather than one
repeated in four handlers where the fourth copy eventually forgets
`carriedOverDays`.

**It may return a negative number, and that is deliberate.** If HR reduces an
allocation after days have been taken, or opens a balance for somebody who joined
mid-year having already used more than they were given, the honest answer is that
the person is overdrawn. Clamping at zero would hide exactly the situation
somebody needs to see; refusing to store it would block a correction that is the
reason the screen exists. Nothing in this feature acts on the number — what an
overdrawn balance means for a *new request* is the Leave Requests feature's
decision.

The API never accepts it. Neither DTO declares `remainingDays`, and the global
`ValidationPipe` runs with `forbidNonWhitelisted`, so a client that sends one
gets a `400` naming the field rather than having it silently ignored — the
strongest available form of "the API never persists it".

### Migration

`backend/prisma/migrations/20260804190000_add_employee_leave_balances/migration.sql`

**Not purely additive.** It does two things:

1. `ALTER TABLE "employees" DROP COLUMN "max_vacation_days";` — **destructive,
   and the data is lost.**
2. `CREATE TABLE "employee_leave_balances"` with its unique index, two ordinary
   indexes and two foreign keys.

**There is no back-fill, and that is a decision rather than an omission.** The
old column cannot be translated into a balance without inventing two facts it
never held: *which leave type* those days were (`21` was implicitly annual leave,
but nothing recorded it, so the migration would have to guess a `leave_type_id`)
and *which year* they applied to. Beyond that, back-filling is precisely the
thing this feature says must not happen — the application assigning leave on its
own.

The migration comment carries the snapshot query to run **before** applying it:

```sql
SELECT employee_code, first_name, last_name, max_vacation_days
FROM employees ORDER BY employee_code;
```

and the old numbers are then re-entered through the API, choosing the type and
the year deliberately. In this repository the seed set the column (18–25 per
person) and now simply stops setting it; no employee record is otherwise touched.

`prisma generate` has been run; the client in `backend/src/generated/prisma`
carries `EmployeeLeaveBalance` and no longer carries `Employee.maxVacationDays`.

The migration is **not applied automatically**. The command, awaiting approval:

```bash
cd backend && npx prisma migrate deploy   # applies the checked-in SQL as-is
```

## Backend

### Structure added

```text
backend/src/modules/employee-leave-balances/
├── employee-leave-balance.constants.ts
├── employee-leave-balances.controller.ts
├── employee-leave-balances.module.ts
├── employee-leave-balances.service.ts
├── employee-leave-balances.service.spec.ts
├── dto/
│   ├── create-employee-leave-balance.dto.ts
│   ├── create-employee-leave-balance.dto.spec.ts
│   ├── update-employee-leave-balance.dto.ts
│   ├── update-employee-leave-balance.dto.spec.ts
│   ├── employee-leave-balance-query.dto.ts
│   ├── employee-leave-balance-query.dto.spec.ts
│   └── employee-leave-balance-field.decorators.ts
└── entities/
    └── employee-leave-balance.entity.ts
```

The feature specified the module, controller, service and three DTOs. The
`entities/`, `*.constants.ts` and `*-field.decorators.ts` files are the layout
every module since Feature 007 uses, and they are here for the reason they exist
elsewhere: the entity keeps the published shape and the `select` out of the
service, the constants keep the magic numbers in one place, and the decorators
keep the two body DTOs from spelling the same four rules twice.

**Nothing new was added to `src/common`.** Every shared piece this module needed
already existed — `PaginationQueryDto`, `SortQueryDto`, `toSkipTake`,
`buildPaginatedResult`, `toIsoTimestamp`, `@Trim()`, `@IsRelationId()`,
`@ValidateIfPresent()`.

### Every created file

| File | What it holds |
| --- | --- |
| `employee-leave-balance.constants.ts` | Year bounds (2000–2100), day bounds (0–366), the notes and search lengths, the sortable columns and the default |
| `employee-leave-balances.controller.ts` | The five routes, each a one-line delegation |
| `employee-leave-balances.service.ts` | Every rule: both relation checks, the duplicate triple, the `where`, the ordering |
| `employee-leave-balances.service.spec.ts` | Unit tests against a mocked Prisma client and two mocked services |
| `employee-leave-balances.module.ts` | The feature module; imports `EmployeeModule` and `LeaveConfigurationModule`, exports the service |
| `dto/create-employee-leave-balance.dto.ts` | `POST` body — the triple plus `allocatedDays` required |
| `dto/update-employee-leave-balance.dto.ts` | `PATCH` body — the four value fields only |
| `dto/employee-leave-balance-query.dto.ts` | `GET` query string — search, three filters, five sort columns |
| `dto/employee-leave-balance-field.decorators.ts` | Per-field constraints shared by the two body DTOs |
| `entities/employee-leave-balance.entity.ts` | The published resource, the `select`, the row type, `computeRemainingDays` and the mapper |

Every query uses Prisma `select`, never `include`. That matters more here than in
most modules: this row joins to `employees`, which itself joins to `departments`,
`positions` and `users` — an `include` would return every column of each, putting
`User.passwordHash` one careless nesting away from a balances page.

### Files changed outside the new module

Removing the column and adding the relation reached six other places:

| File | Change |
| --- | --- |
| `employees/entities/employee.entity.ts` | `maxVacationDays` out of the interface, the `select`, the row `Pick` and the mapper |
| `employees/employee.service.ts` | Out of `create` and `update`; **`remove` now also counts leave balances** |
| `employees/employee.constants.ts` | The two vacation bounds removed, with a note pointing at the new home |
| `employees/dto/employee-field.decorators.ts` | `IsEmployeeMaxVacationDays()` removed, with the same note |
| `employees/dto/create-employee.dto.ts`, `update-employee.dto.ts` | The field removed |
| `prisma/seeds/users.seed.ts` | The field removed from the seed interface and all twelve accounts |
| `leave-configuration/leave-types.service.ts` | **`remove` now counts balances**, and a new `exists()` hand-off |

Two of those are more than mechanical:

**`LeaveTypesService.remove` gained the guard Feature 021 promised.** That
feature wrote the method without one and said a guard "belongs to the feature
that creates the relation, where it can count the rows it introduced". This is
that feature. Deleting a leave type somebody holds a balance in is now a `409`
naming the count and suggesting `isActive: false` instead. This is not optional
politeness: with `ON DELETE RESTRICT` in place, without the check the delete
would fail at the driver and surface as a `500`.

**`EmployeeService.remove` gained the same**, for the same reason — a balance is
the ledger behind every leave day that person was granted.

**`LeaveTypesService.exists()`** is new, and is the hand-off `DepartmentService`,
`PositionService` and `ProjectService` each provide: the balances module confirms
a leave type through the module that owns the table rather than querying
`leave_types` itself.

### Duplicate protection

**One balance per employee, per leave type, per year.** Ion Popescu holds exactly
one Annual Leave balance for 2026. Two would each be a partial truth, and no
reader could say which one the year's entitlement was — or whether it was their
sum.

Enforced twice, and the database's half is the real one:

1. `@@unique([employeeId, leaveTypeId, year])` — a unique index, which is what
   closes the race between the check and the insert.
2. `assertBalanceIsFree` in the service, run before every `POST`, producing a
   `409` naming all three values.

The service check is a `findUnique` on the compound key
(`employeeId_leaveTypeId_year`) rather than a `findFirst` with three conditions:
it reads the unique index directly and cannot drift from the constraint it is
checking.

`PATCH` needs no duplicate check at all, and that follows from the DTO rather
than from an oversight — the body cannot carry any of the three fields, so the
triple cannot move and cannot collide.

The same employee and type in a **different year** is not a duplicate; that is
the whole point of the year being part of the key.

### Validation rules

Shape is the DTOs' job, run by the global `ValidationPipe`
(`whitelist`, `forbidNonWhitelisted`, `transform`).

| Field | Create | Patch | Rule |
| --- | --- | --- | --- |
| `employeeId` | **required** | **not accepted** | `@IsRelationId()` — trimmed, non-empty, bounded. Existence checked by the service |
| `leaveTypeId` | **required** | **not accepted** | same |
| `year` | **required** | **not accepted** | integer, 2000–2100 |
| `allocatedDays` | **required** | optional | integer, 0–366 |
| `carriedOverDays` | optional | optional | integer, 0–366; schema default `0` |
| `usedDays` | optional | optional | integer, 0–366; schema default `0` |
| `notes` | optional, nullable | optional, nullable | trimmed, ≤ 500; blank collapses to `null` |
| `remainingDays` | **rejected** | **rejected** | computed, never accepted |

- **`allocatedDays` is required on create** — the deliberate half of "the
  application must not assign leave on its own". `0` is a legal value and a real
  statement ("no days of this type this year"); what is not allowed is leaving it
  unsaid.
- **`usedDays` is statable on create**, not forced to zero: a balance is not
  always opened at the start of a year. Somebody joining mid-year, or a migration
  from whatever HR used before, arrives with days already taken.
- **The day maximum is 366.** No single year can grant, carry or consume more
  days than it contains, and the bound keeps the arithmetic far from the edges of
  a 32-bit `integer` — a value past 2^31-1 would be a `500` from the driver
  rather than a `400` naming the field.
- **Year bounds are 2000–2100.** A guard against a typo (`202`, `20226`) rather
  than a claim about company history.
- **Numbers are `@IsInt()`, not coerced, in the body.** `21` and `"21"` are
  genuinely different values in JSON, and coercing would accept a payload the
  client should fix. `10.5` is rejected too — the `integer` column would silently
  truncate it. The **query string** is the opposite case and does coerce
  `?year=`, because a parameter is text by definition.
- **`@ValidateIfPresent()` on the three day counts in the patch DTO.**
  `@IsOptional()` also skips its constraints for `null`, which would let a `null`
  reach a `NOT NULL` column and surface as a `500`. `notes` keeps `@IsOptional()`,
  because there `null` is a real request: "clear it".

Beyond shape, the service enforces:

- **The employee exists** and **the leave type exists** — both looked up
  concurrently through the owning services, with both failures reported at once
  as a `400` array so a form can mark each input.
- **The triple is free** — the `409` above.

**Employment status is deliberately not checked.** Allocating leave to a
`TERMINATED` employee is allowed: a balance records what a year held, and somebody
who left in July still had days in that year. Refusing would make the leaver's own
year unrecordable, which is the opposite of what a ledger is for.

## API

Base path `/api/v1/employee-leave-balances`. The prefix and version come from
`configureApp`; every response is wrapped by the global interceptor and every
failure rendered by the global filter, so **no controller method builds a
response**. Every method is a one-line delegation.

| Method | Path | Success | Errors |
| --- | --- | --- | --- |
| `GET` | `/employee-leave-balances` | 200 | 400 |
| `GET` | `/employee-leave-balances/:id` | 200 | 404 |
| `POST` | `/employee-leave-balances` | 201 | 400, 409 |
| `PATCH` | `/employee-leave-balances/:id` | 200 | 400, 404 |
| `DELETE` | `/employee-leave-balances/:id` | 200, `data: null` | 404 |

A **top-level collection** rather than `/employees/:id/leave-balances`, which
[Feature 015](015-scoped-membership-endpoints.md) might suggest. The reason is
what the endpoint is for: the primary screen is HR's and it reads *across*
people — "everyone's 2026 annual leave", sorted by employee, filtered by
department. A nested URL would make that the one question the API could not
answer without a request per employee, while the per-employee view remains
available as `?search=EMP-0001`. Feature 015's rule was that a scope in the path
must not *also* be a filter; it did not say every relation must become a path.

`id` is a plain string: ids are cuids, so `ParseUUIDPipe` would reject valid ones,
and a malformed id matches no row and yields the same `404` as one that never
existed.

### `GET /api/v1/employee-leave-balances`

```http
GET /api/v1/employee-leave-balances?year=2026&departmentId=dep-1&sortBy=employee&page=1&limit=20
```

```json
{
  "success": true,
  "data": {
    "items": [
      {
        "id": "clx…",
        "employee": {
          "id": "emp-1",
          "employeeCode": "EMP-0001",
          "firstName": "Ion",
          "lastName": "Popescu",
          "department": { "id": "dep-1", "code": "DEV", "name": "Development" }
        },
        "leaveType": {
          "id": "lvt-1",
          "code": "ANNUAL",
          "label": "Annual Leave",
          "icon": "umbrella-beach",
          "color": "#3B82F6"
        },
        "year": 2026,
        "allocatedDays": 21,
        "carriedOverDays": 3,
        "usedDays": 5,
        "remainingDays": 19,
        "notes": "Carried three days from 2025.",
        "createdAt": "2026-08-04T10:00:00.000Z",
        "updatedAt": "2026-08-04T11:30:00.000Z"
      }
    ],
    "meta": {
      "page": 1, "limit": 20, "total": 1, "totalPages": 1,
      "hasPreviousPage": false, "hasNextPage": false
    }
  }
}
```

The foreign keys are replaced by the records they point at — the same treatment
`EmployeeEntity` gives `departmentId`. Nothing is lost: each nested object
carries its `id`, which is what a form posts back. The employee summary carries
its department because `?departmentId=` filters on it, and the leave type carries
`icon` and `color` so a row can be drawn the way the leave-types screen draws it.
`requiresApproval`, `isPaid` and `defaultAllocatedDays` are *not* repeated on
every balance — a client that needs them asks `/api/v1/leave-types`.

`remainingDays` is `21 + 3 - 5 = 19`, computed on the way out.

#### Searching

`?search=` — a case-insensitive substring of the **employee's** `employeeCode`,
`firstName` and `lastName`, bounded at 100 characters.

The searchable text belongs to the related row rather than to this one: a balance
is three numbers and a year, and nobody looks one up by typing `21`. The leave
type is not searched either — it is a closed vocabulary, so `?leaveTypeId=`
answers exactly where a substring would guess. Absent and empty are the same
thing.

#### Filtering

| Parameter | Values | Effect |
| --- | --- | --- |
| `?year=` | 2000–2100 | exact |
| `?leaveTypeId=` | an id | exact |
| `?departmentId=` | an id | exact, matched through `employee.departmentId` |

All three combine with `AND` and with `?search=`. An id matching nothing is not
an error — it matches no balance, and an empty page is the honest answer.

**`?year=` is not defaulted to the current year.** It would be the convenient
choice and it is the wrong one: a client asking for every balance would silently
receive one year's, and no parameter it could send would say "all years" — the
filter would have replaced the default rather than narrowing it. A UI that wants
the current year sends `?year=2026`, which is visible in the URL and in the logs.

`?departmentId=` reaching through the employee is what makes "the Development
team's 2026 annual leave" one request rather than a client fetching a
department's employees and filtering balances by hand.

#### Sorting

`?sortBy=` accepts `employee`, `year`, `allocatedDays`, `usedDays`, `createdAt`;
`?sortOrder=` accepts `asc` (default) and `desc`. A closed list, because the
value reaches Prisma's `orderBy` key.

`employee` is the one entry that is not a column of this table: it orders by the
related employee's surname and then given name, which is what a person means by
"sort by employee" — `employeeId` would sort by cuid, which is to say by nothing.
Prisma expresses this as an ordering on a to-one relation, so it stays one query.

The default is `employee`: this endpoint's ordinary use is a roster, and a person
scans one alphabetically. Ordering by year ascending would instead open on the
oldest year on record, which is nobody's first question.

Every ordering is tie-broken by `id`. None of the sortable values is unique — a
year, a day count and even a full name are shared by many rows — so without it a
record could repeat on one page and vanish from the next.

**`remainingDays` is not sortable.** It is computed, so there is no column for
`orderBy` to name, and the two ways to offer it are both wrong: sorting the page
after fetching it sorts the *wrong rows* (the page was already chosen), and raw
SQL is something CLAUDE.md admits only on request. A caller who wants the
smallest balances sorts by `allocatedDays` and reads `remainingDays` from the
payload. If this ever needs to be a real ordering, a PostgreSQL generated column
is the change to make — it would leave every signature here untouched.

### `POST /api/v1/employee-leave-balances`

```json
{
  "employeeId": "emp-1",
  "leaveTypeId": "lvt-1",
  "year": 2026,
  "allocatedDays": 21,
  "carriedOverDays": 3,
  "notes": "Carried three days from 2025."
}
```

Answers `201` with the created balance, `remainingDays` included. `400` if either
referenced row is missing (both reported at once); `409` if the triple is taken.

### `PATCH /api/v1/employee-leave-balances/:id`

Partial, and limited to the four value fields:

```json
{ "usedDays": 8 }
```

**`employeeId`, `leaveTypeId` and `year` are not accepted**, and this is the one
place the feature's endpoint list left a decision to be made. They are not three
editable properties of a balance — together they are its identity. Changing one
would not be an edit of this balance but a claim that it was always a different
one: the 2026 row would become the 2027 row, and whatever the 2027 row said would
either be overwritten or collide with it.

A balance filed against the wrong employee, type or year is corrected by deleting
it and creating the right one — one extra request, and no ambiguity about which
grant is which. That trade is recorded in *Future Improvements* in case it ever
proves too strict in practice.

### `DELETE /api/v1/employee-leave-balances/:id`

Hard delete; existence is verified first, so an unknown id is a `404` naming it
rather than Prisma's `P2025` surfacing as a `500`. Nothing references a balance
yet, so there is no count to guard it with — the guard belongs to the feature
that creates the relation, which is exactly the note Feature 021 left on leave
types and which *this* feature has now honoured.

## How this prepares the application for Leave Requests

The next feature deducts days after approval. Everything it needs to write
against now exists, and nothing it will decide has been pre-empted:

| Leave Requests will need | What Feature 022 provides |
| --- | --- |
| A row to deduct from | `EmployeeLeaveBalance`, findable by the exact triple through a unique index |
| A number to check against | `remainingDays`, already the single definition of "what is left" |
| Somewhere to record consumption | `usedDays`, a column it moves — no other total needs updating, because there is no stored `remainingDays` to keep in step |
| Carried-over days consumed **first** | `carriedOverDays` kept separate from `allocatedDays`, which is what makes an ordering between them expressible at all |
| The **oldest year** consumed first | `year` on every row, and an index on it |
| An entry point | `EmployeeLeaveBalancesService`, exported by the module |

**None of it is implemented here**, and deliberately not even in outline: no
method computes an entitlement, orders candidate balances, or moves a day.
What those questions look like — "which balance does this request draw on", "may
this request be approved" — belongs to the feature that asks them, and writing a
signature now would be code against a design nobody has settled.

The one thing this feature *did* settle in advance is the shape of the ledger:
three stored numbers, one derived, one row per person per type per year. That is
what makes "consume carried-over days first, oldest year first" a query over
existing columns rather than a schema change.

## Frontend

No change — the frontend directory is still empty. When it is built, this is one
HR screen: a table of balances filtered by year and department, `remainingDays`
shown as a computed column (and read-only, since the API will reject it), and a
per-employee drill-down that is the same endpoint with `?search=`.

## Testing

Unit tests, all new, extending the existing Jest setup — no new framework, no new
configuration. 98 tests across 4 new specs; the full suite is 1154 tests, all
passing.

| Spec | Covers |
| --- | --- |
| `employee-leave-balances.service.spec.ts` | `remainingDays` computed, recomputed from whatever the row holds, going negative when overdrawn, and absent from what `create` and `update` write; the mapped page and its metadata, skip/take, relation ordering for `employee`, plain-column ordering with the id tie-break, search across the three employee fields, the department filter through the relation, every filter combined, the shared `where` for rows and count; both relations confirmed through the owning services, both failures reported together, relations checked before the duplicate, a terminated employee still allocatable; the duplicate read on the compound key, the `409`, the same pair allowed in another year, defaults left to the schema; patch reporting a missing id, applying a partial change, clearing `notes`, and consulting neither relation service; delete and its 404 |
| `create-employee-leave-balance.dto.spec.ts` | The four required fields, `remainingDays` rejected, each missing field, zero accepted and negatives/fractions/over-366 rejected on all three counts, numeric strings rejected, year bounds including both boundaries, note trimming and blank → `null`, lengths, unknown properties |
| `update-employee-leave-balance.dto.spec.ts` | The empty body, single-field patches, `remainingDays` rejected, **each of the three identifying fields rejected**, zero accepted and negatives rejected on all three counts, `null` rejected on the non-nullable counts and accepted on `notes` |
| `employee-leave-balance-query.dto.spec.ts` | Inherited defaults and this module's default sort field, every sortable column accepted, `remainingDays` and unsortable columns rejected, `?year=` coerced from text with its bounds, unstated filters left `undefined`, search trimming, unknown parameters |

Existing specs were updated rather than worked around: `employee.service.spec.ts`
gained a case for the new leave-balance delete guard (and its `_count` mocks now
carry both relations), `leave-types.service.spec.ts` gained two for the guard
Feature 021 deferred, and the employee DTO specs now assert that
`maxVacationDays` is rejected as an *unknown property* rather than as an
out-of-range one.

## Files Created

| File | Purpose |
| --- | --- |
| `backend/prisma/migrations/20260804190000_add_employee_leave_balances/migration.sql` | Drops `max_vacation_days`; creates `employee_leave_balances` |
| `backend/src/modules/employee-leave-balances/employee-leave-balance.constants.ts` | Year and day bounds, lengths, sortable columns |
| `backend/src/modules/employee-leave-balances/employee-leave-balances.module.ts` | The feature module |
| `backend/src/modules/employee-leave-balances/employee-leave-balances.controller.ts` | The five routes |
| `backend/src/modules/employee-leave-balances/employee-leave-balances.service.ts` | Every rule |
| `backend/src/modules/employee-leave-balances/employee-leave-balances.service.spec.ts` | Unit tests against a mocked Prisma client |
| `backend/src/modules/employee-leave-balances/dto/create-employee-leave-balance.dto.ts` | `POST` body |
| `backend/src/modules/employee-leave-balances/dto/create-employee-leave-balance.dto.spec.ts` | Unit tests through a real `ValidationPipe` |
| `backend/src/modules/employee-leave-balances/dto/update-employee-leave-balance.dto.ts` | `PATCH` body |
| `backend/src/modules/employee-leave-balances/dto/update-employee-leave-balance.dto.spec.ts` | Unit tests |
| `backend/src/modules/employee-leave-balances/dto/employee-leave-balance-query.dto.ts` | `GET` query string |
| `backend/src/modules/employee-leave-balances/dto/employee-leave-balance-query.dto.spec.ts` | Unit tests |
| `backend/src/modules/employee-leave-balances/dto/employee-leave-balance-field.decorators.ts` | Per-field constraints |
| `backend/src/modules/employee-leave-balances/entities/employee-leave-balance.entity.ts` | Published resource, `select`, row type, `computeRemainingDays`, mapper |
| `FEATURES/022-employee-leave-balances.md` | This document |

## Files Modified

| File | Change |
| --- | --- |
| `backend/prisma/schema.prisma` | `maxVacationDays` removed; `EmployeeLeaveBalance` added; back-relations on `Employee` and `LeaveType` |
| `backend/src/app.module.ts` | Registers `EmployeeLeaveBalancesModule` |
| `backend/src/modules/employees/entities/employee.entity.ts` | `maxVacationDays` removed from the interface, `select`, row type and mapper |
| `backend/src/modules/employees/employee.service.ts` | Field removed from `create`/`update`; `remove` counts leave balances |
| `backend/src/modules/employees/employee.constants.ts` | Vacation bounds removed |
| `backend/src/modules/employees/dto/employee-field.decorators.ts` | `IsEmployeeMaxVacationDays()` removed |
| `backend/src/modules/employees/dto/create-employee.dto.ts` | Field removed |
| `backend/src/modules/employees/dto/update-employee.dto.ts` | Field removed |
| `backend/src/modules/employees/employee.service.spec.ts` | Delete-guard case added; `_count` mocks updated |
| `backend/src/modules/employees/dto/*.spec.ts` | `maxVacationDays` now asserted as an unknown property |
| `backend/src/modules/leave-configuration/leave-types.service.ts` | `remove` counts balances; `exists()` added |
| `backend/src/modules/leave-configuration/leave-types.service.spec.ts` | Guard cases added |
| `backend/prisma/seeds/users.seed.ts` | `maxVacationDays` removed from the seed interface and all twelve accounts |
| `backend/test/app.e2e-spec.ts` | The two `maxVacationDays` cases updated |
| `FEATURES/HISTORY.md` | Feature 022 row |
| `FEATURES/README.md` | Feature 022 row |

## Notes

- The seed creates **no balances**. Seeding them would put a claim about
  somebody's entitlement into a fixture every developer inherits, and it would
  contradict the feature's own rule that leave is allocated by hand. Three
  requests create one.
- **[Feature 010](010-employees-module.md)'s `maxVacationDays` is gone, and that
  document is not rewritten.** It records what was true when it was written; this
  one records the change, which is the workflow `FEATURES/README.md` describes.
- [Feature 021](021-leave-configuration.md)'s note that
  `Employee.maxVacationDays` was "untouched and *not* the same thing as
  `defaultAllocatedDays`" has been overtaken by this feature: the column is gone,
  and `defaultAllocatedDays` is now what it always said it was — a suggestion for
  the form that creates one of these balances.
- No guard, no role check, no notion of who is calling, even though allocating
  leave is an HR/Admin action in practice. Authentication and authorization are
  later features, and half of an access check is worse than none.
- `usedDays` stays editable rather than becoming read-only in anticipation of
  Leave Requests. Until requests exist, it is the only way to record days
  somebody has taken — and a correction to a miscounted figure has to remain
  possible afterwards.

## Future Improvements

- A delete guard on balances, once leave requests exist: a `409` refusing to
  delete a balance a request draws on, counted the way this feature taught
  `LeaveTypesService.remove` to count.
- Re-keying a balance — allowing `PATCH` to change the employee, type or year
  after re-running the duplicate check — if deleting and recreating a misfiled
  row proves too blunt in practice. It is a deliberate omission today, not an
  oversight.
- A `remainingDays` PostgreSQL generated column, **only** if sorting or filtering
  by it becomes a real requirement. It would keep the single source of truth
  intact while making the value indexable; the cost is that the formula becomes a
  migration.
- A year-end carry-over routine, once somebody specifies the cap and the expiry —
  the rules [Feature 021](021-leave-configuration.md) removed a global flag for
  rather than guess at. It belongs beside the balances, at the per-employee grain.
- A bulk allocation endpoint — "give every active employee 21 days of annual
  leave for 2027" — which is the request that will otherwise be sent a hundred
  times each January.
