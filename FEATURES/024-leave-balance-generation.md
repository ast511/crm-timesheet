# Feature 024 — Leave Balance Generation

## Goal

Let HR open a year's leave balances in one call, instead of one `POST` per
employee per leave type, and settle the carry-over policy that
[Feature 022](022-employee-leave-balances.md) deliberately left unspecified.

The feature exists because of a bug report that turned out not to be a bug. A
`SICK_LEAVE` request was refused with:

```
Insufficient leave: 3 working day(s) requested, 0 day(s) available
```

for an employee who had only ever taken annual leave. Nothing was wrong with the
arithmetic — balances are scoped by `(employee, leave type, year)` and always
were, so annual leave had not touched the medical pot. The employee simply had
**no medical balance at all**, because Feature 022 created balances only through
`POST` and nothing else ever had. With 30 employees × 4 leave types × every year,
that is 120 hand-made requests a year, and the first one anybody forgets surfaces
months later as the message above.

## Requirements

1. One call creates the missing balances for a year, for many employees and many
   leave types at once.
2. The same call serves a new hire: name one employee, get their balances now.
3. Allocations come from the leave type's `defaultAllocatedDays` — the
   application must still never invent an entitlement.
4. An employee hired mid-year gets a proportional first-year allocation.
5. Days left at the end of a year survive or expire according to a policy that is
   stated per leave type.
6. Running it twice is safe.
7. A leave type that cannot produce a balance must be reported, loudly, at the
   moment of the run — not discovered later by an employee being refused leave.

## Backend

### The discovery that shaped the design

The obvious implementation of carry-over — "compute last year's remainder, write
it into this year's `carriedOverDays`" — **double-counts every day it moves.**

`EmployeeLeaveBalancesService.findAvailable` reads

```ts
where: { employeeId, leaveTypeId, year: { lte: upToYear } }
```

so a remainder sitting in a closed year is *already* spendable in the next one,
and `consume` already draws the oldest year first. Copying three surviving 2026
days into the 2027 row would leave the 2026 row still reporting them as
remaining, and the employee would hold six days where they had earned three.

Restated: **carrying days forward is what the system already does, without a
limit. What a carry-over policy actually needs is to take back the part that is
not allowed to survive.**

So the year-end operation is an *expiry*, recorded where the days were:

| Situation | `remaining` | Policy | Survives | `expiredDays` written |
| --- | --- | --- | --- | --- |
| Annual, 21 allocated, 4 used | 17 | carries over, cap 5 | 5 | **12** |
| Annual, 21 allocated, 18 used | 3 | carries over, cap 5 | 3 | 0 |
| Annual, no cap configured | 17 | carries over, no cap | 17 | 0 |
| Medical, 180 allocated, 4 used | 176 | carries nothing over | 0 | **176** |
| Any type, overdrawn | −3 | any | — | 0 (skipped) |

The survivors are never moved. They stay in the year they belong to, where
consumption reaches them first, and the row keeps a full account of itself:
granted, taken, lost.

### `expiredDays` on the balance

`remainingDays` is therefore now

```ts
allocatedDays + carriedOverDays - usedDays - expiredDays
```

This revises a formula Feature 022 documented at length, and the revision is the
feature's one breaking design change. It is kept apart from `usedDays` because
the two are different facts: days somebody **took** and days somebody **lost**.
Summed together, no report could tell an employee who used their allowance from
one who forfeited it, and the year-end run would look like it had approved
absences nobody requested.

Two properties of the expiry formula are relied on elsewhere:

- **It is idempotent.** `expire = remaining - min(remaining, cap)` leaves nothing
  above the cap, so a second run finds `remaining` already at or below it and
  takes nothing more. That is what makes the endpoint re-runnable without a guard
  against having been run before.
- **It never touches an overdrawn balance.** A negative remainder is skipped
  outright; without that guard `remaining - keep` would be a *negative* expiry
  that handed days back to somebody who had already taken too many.

`carriedOverDays` survives untouched, and the generation never writes it. It is
now exclusively HR's: for migrations from a previous system, and for corrections.

### The carry-over policy lives on `LeaveType`

Two columns, because the policy is a property of the **kind** of leave rather
than of one person's year — annual leave carries over and medical leave does not,
and that is true of every employee at once.

| Column | Meaning |
| --- | --- |
| `allowsCarryOver` | Whether a remainder may survive a year-end. Defaults to `false`. |
| `maxCarryOverDays` | The ceiling on it. `null` means no ceiling; read only when `allowsCarryOver` is `true`. |

`allowsCarryOver` defaults to `false` deliberately: after the migration, **no
type carries anything over** until somebody sets the flag. The opposite default
would have silently granted a policy nobody chose to every type already in the
table.

`maxCarryOverDays` is nullable rather than defaulted, because "carries over,
without a ceiling" is a real policy and `0` states the opposite of it. Nothing
rejects a cap on a type that carries nothing over — it is inert rather than
contradictory, and refusing the pair would stop HR from setting the ceiling first
and turning the policy on afterwards.

### The generation itself

`EmployeeLeaveBalancesService.generate` extends the existing module rather than
adding a new one, so `employee_leave_balances` keeps exactly one owner and
`usedDays` exactly one writer.

Its shape:

1. Read the employees and the leave-type policies **concurrently** — one query
   each, never per pair.
2. Drop employees hired after the target year; warn once, with a count.
3. Narrow the types to those that are active *and* have a
   `defaultAllocatedDays`; warn about each one dropped.
4. Read the target year's and the previous year's balances in **one** query.
5. Plan the creations and the expiries in memory.
6. Write both in **one transaction**, or — on `dryRun` — write nothing.

**Existing balances are never touched.** A row already filed for the year is
counted as `skipped` and left exactly as it is, because it may hold a figure
somebody negotiated. That is what makes the endpoint re-runnable: run it in
December, run it again in January when three more people have joined.

**A problem warns; it does not fail.** One leave type without a default must not
cost the other three their run, and one stale id in a list of two hundred must
not cost the other hundred and ninety-nine. The only `400`s are the two that make
the request itself unanswerable: a year outside the DTO's bounds, and — as an
empty report rather than an exception — nothing at all in scope.

### Pro-rata for a first year

```
round(defaultAllocatedDays × monthsRemaining ÷ 12)
```

counting the month of hire as worked. Somebody hired on 15 July 2027, on a type
allocating 21 days, gets `round(21 × 6 / 12) = 11` days for 2027 and the full 21
from 2028 onwards.

Rounded rather than floored: the arithmetic is an estimate of a contractual
figure, and flooring would systematically under-grant. HR corrects the exceptions
with a `PATCH`, which is where a number that came from a contract rather than
from a formula belongs.

### Who takes part

`EmployeeService.findGenerationCandidates` excludes exactly one status:
`TERMINATED`.

`ON_LEAVE`, `SUSPENDED` and `INACTIVE` all describe people the company still
employs, and somebody on long-term medical leave on 1 January needs next year's
balances **more** than anybody. Restricting the run to `ACTIVE` would leave those
people without balances and reproduce, in a new place, the exact failure this
feature was written to prevent.

Note that this is not the same as refusing to *allocate* to a leaver, which the
module still permits by hand: a person who left in July had days in that year,
and recording them has to stay possible.

## Frontend

None. This feature is backend-only.

The report is shaped for a screen that does not exist yet — a "generate balances"
action with a preview — and `dryRun` is the field that screen will need first.

## Database

### Migration

`backend/prisma/migrations/20260805120000_add_leave_balance_generation/migration.sql`

Purely additive. Three columns, all with defaults, no data rewritten and no
column dropped:

```sql
ALTER TABLE "leave_types" ADD COLUMN "allows_carry_over" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "leave_types" ADD COLUMN "max_carry_over_days" INTEGER;
ALTER TABLE "employee_leave_balances" ADD COLUMN "expired_days" INTEGER NOT NULL DEFAULT 0;
```

`expired_days DEFAULT 0` means every existing balance is unaffected:
`remainingDays` returns exactly what it returned before the migration for every
row already stored.

### After migrating

Nothing carries over until it is configured. For each type that should:

```
PATCH /api/v1/leave-types/:id
{ "allowsCarryOver": true, "maxCarryOverDays": 5 }
```

And any type with `defaultAllocatedDays: null` will produce no balances and a
warning on every run — which is the state that caused the original report.

## API

### `POST /api/v1/employee-leave-balances/generate`

Answers `200`, not `201`: a `Location` header would have nothing to point at, a
re-run that creates nothing is a complete success, and `dryRun` writes nothing —
none of which `201 Created` describes.

```json
{
  "year": 2027,
  "employeeIds": ["emp-1"],
  "leaveTypeIds": ["lvt-annual"],
  "dryRun": true
}
```

| Field | Required | Meaning |
| --- | --- | --- |
| `year` | **yes** | The year to **open**. The carry-over policy is applied to `year - 1`. |
| `employeeIds` | no | Omitted, everybody not `TERMINATED`. Bounded at 500, no duplicates. |
| `leaveTypeIds` | no | Omitted, every active type. Same bounds. |
| `dryRun` | no | Compute everything, write nothing. Defaults to `false`. |

**`allocatedDays` and `carriedOverDays` are not fields**, and sending either is a
`400` — `forbidNonWhitelisted` says so rather than ignoring it. The first comes
from the leave type; the second is decided by the policy.

An **empty** `employeeIds` array is a real request meaning "nobody", and stays
distinguishable from omitting the field, which means "everybody". Collapsing the
two would let a filtered UI that matched nothing generate for the whole company.

The response:

```json
{
  "success": true,
  "data": {
    "year": 2027,
    "created": 96,
    "skipped": 12,
    "expiredFromPreviousYear": 143,
    "expiredBalances": 27,
    "dryRun": false,
    "warnings": [
      "Leave type SICK_LEAVE has no defaultAllocatedDays; 30 employee(s) were not given a balance for it"
    ]
  }
}
```

Every count is of **balances**, never of employees: one person contributes as
many entries as there are leave types in scope.

A summary rather than the rows, because a January run touches every employee ×
every leave type and the rows are already addressable at
`GET /employee-leave-balances?year=2027`. Publishing them here would be a second
way to ask one question.

### Warnings

| Condition | Reported |
| --- | --- |
| Leave type has no `defaultAllocatedDays` | Always, naming the code and how many people it cost |
| Leave type is retired, and was named explicitly | Yes — the caller typed it and is owed an answer |
| Leave type is retired, swept up by the default set | No — nobody asked, and it would be noise on every run |
| Employee id names nobody, or a leaver | Yes, per id |
| Leave type id names nothing | Yes, per id |
| Employee hired after the target year | Once, as a count |

### Changed elsewhere

- `LeaveTypeEntity` gains `allowsCarryOver` and `maxCarryOverDays`; both DTOs
  accept them.
- `EmployeeLeaveBalanceEntity` gains `expiredDays`, and `remainingDays` now
  subtracts it. Both balance DTOs accept `expiredDays` — on create for migrations
  that arrive with days already written off, on patch so an over-expiry can be
  corrected.

## Files Created

- `backend/prisma/migrations/20260805120000_add_leave_balance_generation/migration.sql`
- `backend/src/modules/employee-leave-balances/dto/generate-leave-balances.dto.ts`
- `backend/src/modules/employee-leave-balances/dto/generate-leave-balances.dto.spec.ts`
- `backend/src/modules/employee-leave-balances/entities/leave-balance-generation-report.entity.ts`
- `backend/src/modules/employee-leave-balances/employee-leave-balances.generation.spec.ts`
- `FEATURES/024-leave-balance-generation.md`

## Files Modified

- `backend/prisma/schema.prisma`
- `backend/src/modules/employee-leave-balances/employee-leave-balances.service.ts`
- `backend/src/modules/employee-leave-balances/employee-leave-balances.controller.ts`
- `backend/src/modules/employee-leave-balances/employee-leave-balance.constants.ts`
- `backend/src/modules/employee-leave-balances/entities/employee-leave-balance.entity.ts`
- `backend/src/modules/employee-leave-balances/dto/create-employee-leave-balance.dto.ts`
- `backend/src/modules/employee-leave-balances/dto/update-employee-leave-balance.dto.ts`
- `backend/src/modules/employee-leave-balances/dto/employee-leave-balance-field.decorators.ts`
- `backend/src/modules/employee-leave-balances/employee-leave-balances.service.spec.ts`
- `backend/src/modules/employees/employee.service.ts`
- `backend/src/modules/leave-configuration/leave-types.service.ts`
- `backend/src/modules/leave-configuration/leave-types.service.spec.ts`
- `backend/src/modules/leave-configuration/leave-types/entities/leave-type.entity.ts`
- `backend/src/modules/leave-configuration/leave-types/dto/create-leave-type.dto.ts`
- `backend/src/modules/leave-configuration/leave-types/dto/update-leave-type.dto.ts`
- `backend/src/modules/leave-configuration/leave-types/dto/leave-type-field.decorators.ts`

## Notes

**Two bugs the type system caught during implementation**, both worth recording
because neither would have failed a test:

1. `findAvailable` selected four columns and passed them to
   `computeRemainingDays`. Adding `expiredDays` to the formula's parameter type
   broke that call at compile time — without it, every availability check would
   have ignored expiry entirely and quietly handed back days the policy had taken.
   This is the `satisfies`/`Pick` trip-wire the project has used since Feature 007
   doing exactly what it is for.
2. `create` and `update` did not forward `expiredDays` to Prisma after the DTOs
   started accepting it, so the field would have been validated and then dropped.

**One inconsistency a test caught**: `dryRun` was written with `@IsOptional()`,
which also skips its constraints for `null` — and `null` would have been read as
"not a preview" and written. It uses `@ValidateIfPresent()`, like every other
non-nullable optional in the codebase.

**"Nothing is granted automatically" is intact.** Feature 022 stated that rule
when `POST` was the only way a balance could exist. Generation creates them in
bulk and does not weaken it: every figure written is the leave type's
`defaultAllocatedDays`, which HR configured, and a type that states no default
produces no balance and a warning. What the rule forbids is a number nobody
decided, and there is still no path to one.

**No authentication or authorization**, consistent with every module up to this
point. Generating a year's balances is plainly an HR action, and this endpoint
checks nothing — half an access check reads as protection while providing none.

## Future Improvements

- **A scheduled run.** The endpoint is the mechanism; nothing calls it on 1
  January. A cron-driven job would need a decision about what happens when it
  fails silently, which is why it is not here.
- **Expiry that reports who lost days.** `expiredFromPreviousYear` is a total. An
  employee who forfeits twelve days deserves to be told, which is a notification
  feature, not a generation one.
- **A carry-over *deadline*.** Romanian practice gives carried days a window
  (commonly 18 months) rather than only a ceiling. The current model expires at
  the year boundary or not at all; a deadline would need a date column on the
  balance and a second, time-driven expiry pass.
- **Undo for a run.** Today a mistaken run is corrected with `PATCH` per row, or
  `DELETE` for rows created in error. A run id on each balance would make
  "reverse the run of 2 January" a single call — at the cost of a column that
  exists only for that.
- **Pro-rata on termination.** A leaver's final year is currently whatever was
  allocated in January. Reducing it to the months worked is the mirror of the
  hire-date rule and was left out because it interacts with settlement pay, which
  nothing in this system models.
