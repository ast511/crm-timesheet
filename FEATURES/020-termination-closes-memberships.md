# Feature 020 — Termination Closes Project Memberships

**Status:** Completed
**Date:** 2026-08-04

## Goal

Stop somebody who has left the company from still being on a project.

Until now, setting an employee's status to `TERMINATED` changed one column and
nothing else. Their rows in `project_members` kept `left_at = NULL`, which is
the storage's way of saying "still on this project" — so every roster, every
`?activeOnly=true` listing and every future headcount counted a person who no
longer works here. Someone had to remember to close each membership by hand,
and there was nothing to catch them when they forgot.

Terminating an employee now ends their open memberships, dated to the moment
the termination was recorded.

## Requirements

- `status → TERMINATED` sets `left_at` on every membership still open, using
  the employee's own `updated_at` — the instant the status changed.
- Memberships that already ended keep their own date.
- The employee row and the memberships change together or not at all.
- No terminated employee can be left holding, or given, an open membership.
- Reuse the existing modules; no schema change.

## The invariant

This feature is not a cleanup routine, it is a rule:

> **No terminated employee holds an open membership.**

Stated that way, the work is not "close the memberships on termination" but
"close the three doors through which the rule could be broken":

| Door | Guard |
| --- | --- |
| The employee is terminated | `ProjectMemberService.closeOpenMemberships` |
| A terminated employee is assigned to a project | `assertTerminatedMembershipIsClosed`, on `POST` |
| A terminated employee's membership is reopened (`leftAt: null`) | the same function, on `PATCH` |

Without the second and third, the rule would hold only until the next request.

## Database

**No schema change and no migration.** `ProjectMember.leftAt` already exists and
already means "this membership ended"; what was missing was anything that wrote
it when the person left the company. `Employee.updatedAt` is `@updatedAt`, so the
timestamp this feature needs is already maintained by Prisma.

## Backend

### `EmployeeService.update` — one transaction, two tables

```ts
const currentStatus = await this.findStatusOrThrow(id);

const isBeingTerminated =
  dto.status === EmployeeStatus.TERMINATED &&
  currentStatus !== EmployeeStatus.TERMINATED;

const updated = await this.prisma.$transaction(async (tx) => {
  const employee = await tx.employee.update({ /* … */ });

  if (isBeingTerminated) {
    await this.projectMembers.closeOpenMemberships(id, employee.updatedAt, tx);
  }

  return employee;
});
```

Four decisions worth recording:

1. **It is one transaction.** Either the employee is terminated and the
   memberships close, or neither happens. Two separate writes could leave a
   terminated employee on a project if the second failed — the exact state this
   feature exists to prevent.
2. **`leftAt` is the employee's own `updatedAt`,** read back from inside the
   transaction rather than a second `new Date()`. This was the request as
   stated: the membership ends at the moment the status changed, not a few
   milliseconds after it. The two timestamps are identical, not merely close.
3. **Only a *transition* triggers it.** Re-sending `TERMINATED` to somebody
   already terminated changes nothing about the world, so it must not stamp a
   fresh `leftAt` on memberships recorded since. This is why the stored status
   is read before the write.
4. **The reverse is not symmetrical.** `TERMINATED → ACTIVE` reopens nothing.
   Which projects somebody rejoins is not derivable from the fact that they
   came back, so it stays an explicit `PATCH` on the membership or a new `POST`.

### `EmployeeService.exists` → `findStatus`

The employees module used to export `exists(id): Promise<boolean>` for other
modules to confirm an employee before writing something against them. It now
exports `findStatus(id): Promise<EmployeeStatus | null>` instead.

One query, two answers: whether the person is there, and whether they are still
with the company — which is what both callers now need at the same moment. It
still returns `null` rather than throwing, for the reason `exists` returned a
boolean: the caller knows what a missing employee means in its own request (a
`400` naming a body field, for project members) while the employees module could
only guess.

`exists` was removed rather than kept alongside. Two methods asking the same
table the same question, one of them strictly weaker, is the duplication this
project's rules exist to avoid.

### `ProjectMemberService.closeOpenMemberships`

The write lives in the module that owns `project_members`, and takes the
transaction from its caller:

```ts
async closeOpenMemberships(
  employeeId: string,
  leftAt: Date,
  tx: Prisma.TransactionClient,
): Promise<void>
```

`tx` is **required, not optional**. The caller must do both writes or neither;
an optional transaction would let a future caller break the invariant if its
second statement failed.

**Already-closed memberships are not touched** — `where: { leftAt: null }`.
Their `leftAt` records when that assignment actually ended, and overwriting it
with a later date would rewrite history.

**The write is split in two**, because of one case the bulk update cannot
express:

| Membership | Closed at |
| --- | --- |
| `joinedAt` on or before the termination | the termination date |
| `joinedAt` **after** it — an assignment planned before the person left | its own `joinedAt` |

Closing a planned assignment at the termination date would store a period ending
before it starts — exactly what `assertOrderedMembershipPeriod` refuses from
callers, and the service must not write what its own API rejects. Those rows
become a zero-length period instead: planned, never worked. They need a value
per row, which `updateMany` cannot do, and they are rare — the common case stays
a single statement.

### Module graph — a cycle, deliberately

`EmployeeModule` and `ProjectMemberModule` now import each other, both wrapped in
`forwardRef`, and both services inject the other with `@Inject(forwardRef(…))`.

The alternative was writing `project_members` directly from `EmployeeService`,
which keeps the graph acyclic at the cost of putting one table's rules in two
modules — against the hand-off every module in this project documents. A cycle
declared in two places and explained in both is the smaller price. Verified by
the e2e suite, which boots the real `AppModule`.

## API

### Changed behaviour

| Request | Before | After |
| --- | --- | --- |
| `PATCH /employees/:id { "status": "TERMINATED" }` | status changed | status changed **and** every open membership closed at `updatedAt` |
| `POST /projects/:id/members` for a terminated employee, no `leftAt` | created | `400` |
| `PATCH /projects/:p/members/:e { "leftAt": null }` on a terminated employee | reopened | `400` |

Message for both refusals:

```
leftAt is required: a terminated employee cannot hold an open membership
```

An array, like every other field error in this module, so a form marks the
offending input with the code it already has.

### A closed membership for a terminated employee is still accepted

Worth stating explicitly, because it is a deliberate narrowing of "block
assigning terminated employees":

```http
POST /api/v1/projects/prj-1/members
{ "employeeId": "emp-9", "joinedAt": "2026-01-12", "leftAt": "2026-06-30" }
```

is accepted even when `emp-9` is terminated. Recording that somebody worked on a
project until they left is what the history is for, and
[Feature 013](013-project-members-module.md) documented `leftAt`-on-create as
the backfill/import path. Refusing every membership for a terminated employee
would have closed that path to no benefit: it is the *open* membership that
contradicts the person having left, and that is what is refused.

### Not affected

- `DELETE /employees/:id` still answers `409` while any membership references
  the employee, closed ones included. A membership is history; terminating
  somebody does not make their record deletable, and should not.
- Both listings, their filters and their pagination are unchanged. A terminated
  employee's memberships simply now have a `leftAt`, so `?activeOnly=true`
  stops returning them — which is the point.

## Frontend

No change — the directory is still empty. Worth noting for when it is built:
the "terminate employee" action has a side effect the user should be told about
before confirming ("this will also end N project assignments"), and the response
carries only the employee, so a roster on screen needs refetching.

## Testing

| Spec | Covers |
| --- | --- |
| `employee.service.spec.ts` | memberships closed at the termination `updatedAt`; both writes in one transaction; no closing on any other status; no re-closing when already terminated; nothing reopened when a terminated employee returns; `findStatus` answering the status, `null`, and reading one column |
| `project-member.service.spec.ts` | `closeOpenMemberships` — the bulk close, closed rows left alone, a future `joinedAt` closed at its own date, one statement when nothing is future-dated, and the write going through the transaction it was given; `POST` refusing an open membership for a terminated employee and accepting a closed one; `PATCH` refusing to reopen one and still allowing a correction; the status read from the row already loaded |
| `test/app.e2e-spec.ts` | unchanged, but now also proves the `forwardRef` cycle resolves at boot |

Results: `npm run typecheck` clean, `npm test` 955 passed (57 suites),
`npm run test:e2e` 28 passed, `npm run build` clean, `prettier --check` clean.

## Files Created

| File | Purpose |
| --- | --- |
| `FEATURES/020-termination-closes-memberships.md` | This document |

No source files were created: the change extends two existing modules.

## Files Modified

| File | Change |
| --- | --- |
| `backend/src/modules/employees/employee.service.ts` | `update` wrapped in a transaction that closes memberships on a termination; `exists` replaced by `findStatus`; `assertExists` replaced by `findStatusOrThrow` |
| `backend/src/modules/employees/employee.module.ts` | `forwardRef(() => ProjectMemberModule)` |
| `backend/src/modules/project-members/project-member.service.ts` | `closeOpenMemberships`; `assertEmployeeExists` → `assertEmployeeAccepts`; `assertTerminatedMembershipIsClosed` on `POST` and `PATCH`; `forwardRef` on the injected `EmployeeService` |
| `backend/src/modules/project-members/project-member.module.ts` | `forwardRef(() => EmployeeModule)` |
| `backend/src/modules/employees/employee.service.spec.ts` | Termination and `findStatus` suites; `$transaction` mock extended to the callback form |
| `backend/src/modules/project-members/project-member.service.spec.ts` | `closeOpenMemberships` suite; the terminated-employee cases on `POST` and `PATCH`; `employees.exists` mock → `findStatus` |
| `FEATURES/HISTORY.md`, `FEATURES/README.md` | Feature 020 row |

## Notes

- Nothing back-fills existing data. An employee terminated **before** this
  feature still has open memberships, and no migration closes them, because the
  date to close them at is not recorded anywhere — `updated_at` has since moved
  on. If any exist, close them with a `PATCH` per membership, choosing the date
  deliberately.
- `Employee.remove` is unchanged and still counts `projectMemberships` for its
  `409`. That count includes closed memberships, which is correct: the row is
  the record that the person was there.
- The transaction is Prisma's interactive form, the first in this codebase. The
  loop inside `closeOpenMemberships` is sequential rather than `Promise.all`
  because an interactive transaction's client is a single connection.

## Future Improvements

- The same rule for the features still to come: a terminated employee should
  not be able to log time or request vacation either. Both will hang off the
  employee, and both should ask `findStatus` — the method exists for that.
- Nothing reports what a termination closed. A response carrying the affected
  memberships, or an audit entry, would let the UI say "3 assignments ended"
  instead of the user discovering it on the next roster load.
- `INACTIVE` and `SUSPENDED` are left alone deliberately — they are temporary
  states, and a suspended employee is expected back on the same projects. If
  that turns out to be wrong for one of them, the transition test in `update` is
  the single place it changes.
