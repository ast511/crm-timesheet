# Feature 016 — Work Schedule Configuration

**Status:** Completed
**Date:** 2026-08-04

## Goal

Let an administrator state how the company works: which weekdays are working
days, when the office opens and closes, the bounds an individual time entry has
to respect, what a standard day and week add up to, how long lunch is — and who
is notified when a timesheet needs approval.

That is the whole feature. It **configures**; it calculates nothing. The
Timesheets module will read this configuration and validate entries against it,
and that module is where any arithmetic belongs.

Explicitly **not** included, and deliberately left to their own features:
timesheets, time calculations, overtime, automatic lunch-break deduction,
holiday and vacation integration, authentication, authorization, notifications
and reports.

> **Numbering note.** The request asked for this to be documented as "Feature
> 013". 013 is already taken by the
> [Project Members Module](013-project-members-module.md), and previous feature
> documents are never overwritten, so this took the next free number — 016,
> which is also the number in the request's own title.

## Requirements

- One configuration for the whole application, and no way to end up with two.
- `PUT` creates it when absent and replaces it when present, so a client never
  has to ask which of the two is happening.
- Working days chosen from the seven weekdays, with duplicates refused.
- Times as `HH:mm`; hour values validated as stated (`> 0`, or `>= 0` for the
  lunch break) with `maxHoursPerEntry` above `minHoursPerEntry`.
- Approval addresses added and removed individually, each unique.
- `lunchBreakHours` recorded and applied to nothing.
- Reuse of the [Feature 006](006-shared-backend-infrastructure.md)
  infrastructure — the global filter and the response envelope — and of the
  module shape Departments, Positions, Users, Employees, Projects and Project
  Members already share. No pagination: the request did not ask for it, and the
  address list is a handful of rows a person maintains by hand.

## Database

Two models and one enum, all new. Nothing existing was touched, so the migration
is purely additive.

### `Weekday` enum

```prisma
enum Weekday {
  MONDAY    @map("monday")
  …
  SUNDAY    @map("sunday")
}
```

Declared Monday-first, and the declaration order is load-bearing rather than
cosmetic: it is the order `workingDays` is sorted into. The stored values are
lower-case, matching `ProjectStatus` and `EmployeeStatus`; the API vocabulary
stays upper-case, and Prisma maps between them.

### `WorkSchedule`

| Column | Type | Notes |
| --- | --- | --- |
| `id` | `text` | Primary key, defaulted to the constant `'work_schedule'` |
| `working_days` | `"Weekday"[]` | PostgreSQL array of the enum |
| `work_start_time` / `work_end_time` | `varchar(5)` | `HH:mm`, 24-hour |
| `min_hours_per_entry` | `decimal(5,2)` | Smallest bookable entry |
| `max_hours_per_entry` | `decimal(5,2)` | Largest single entry |
| `max_hours_per_day` | `decimal(5,2)` | Ceiling across one day |
| `standard_hours_per_day` | `decimal(5,2)` | What a full day should total |
| `standard_hours_per_week` | `decimal(5,2)` | What a full week should total |
| `lunch_break_hours` | `decimal(5,2)` | Recorded only — see below |
| `created_at` / `updated_at` | `timestamp(3)` | As everywhere else |

Three decisions worth recording:

1. **The hours are `decimal`, never `double precision`.** These are the numbers
   the Timesheets module will compare and sum, and binary floating point cannot
   hold `0.1` exactly — a column of totals would drift by fractions, and a `>=`
   at the boundary would answer differently depending on how the value was
   reached. `(5, 2)` covers two decimals (the quarter-hour granularity people
   book in) up to `999.99`, comfortably past the 168 hours in a week.
2. **The times are text, not `time`.** `09:00` here is a wall-clock label —
   "the office opens at nine" — not an instant. Prisma's `time` maps to a
   `DateTime`, which would drag a date and a timezone along with a value that
   has neither. `varchar(5)` is exactly the format's width, so the shape is part
   of the column rather than only an API rule.
3. **The working days are an enum array, not `text[]`.** PostgreSQL itself then
   rejects `'Funday'`. What it cannot express is "no duplicates" — an array
   column has no such constraint — so that rule lives in the DTO.

### `TimesheetApprovalEmail`

| Column | Type | Notes |
| --- | --- | --- |
| `id` | `text` | cuid |
| `email` | `text` | **Unique** across the table |
| `work_schedule_id` | `text` | FK → `work_schedules.id`, `ON DELETE RESTRICT` |
| `created_at` | `timestamp(3)` | |

A table rather than an array column on `WorkSchedule`, because each address has
to be addressable on its own: `DELETE /work-schedule/emails/:id` removes one
without rewriting the rest, and `email` gets a unique index an array could not
have.

`One WorkSchedule has many TimesheetApprovalEmail` — the relation the request
asked for. With a single schedule the foreign key is close to a constant today,
and it is still worth having: it is what makes "an address belongs to a
configuration" a fact the database enforces, and what makes the addresses
disappear along with the configuration if one is ever deleted deliberately.

### How "only one configuration" is enforced

Three layers, so the guarantee does not rest on the service alone:

1. **The primary key has a constant default.** `id` defaults to
   `'work_schedule'`, so an `INSERT` that does not name a key resolves to the
   row that already exists and is rejected as a duplicate primary key. A second
   configuration cannot be created by accident — only by someone deliberately
   naming a different key by hand.
2. **The service addresses that key and nothing else.** Every read is
   `findUnique({ where: { id: WORK_SCHEDULE_ID } })` and the write is an
   `upsert` on the same value. There is no `findFirst`, so there is no "whichever
   row came back first" ambiguity, and no code path that supplies an id from a
   request.
3. **The API offers no way to ask for a second one.** The path carries no id,
   there is no `POST`, and the create half of the upsert states the constant
   rather than accepting one.

`WORK_SCHEDULE_ID` in `work-schedule.constants.ts` and the `@default` in
`schema.prisma` are the same literal in two languages; neither can be derived
from the other, so both carry a comment saying they move together.

### Migration

`prisma/migrations/20260804120000_add_work_schedule_configuration/migration.sql`

It creates the `Weekday` type, the two tables, the unique index on `email` and
the foreign key. **Additive only** — no existing table, column or row is
touched, so it is safe on a populated database and nothing is lost. Nothing is
back-filled either: `work_schedules` starts empty on purpose, because a
configuration nobody entered would be a guess about how this company works.

Required, rather than optional, because the models cannot exist without it —
`prisma db push` is forbidden by the project rules and would in any case leave
no record of the change.

The command, to be run once PostgreSQL is up:

```bash
cd backend && npm run prisma:migrate
```

`prisma generate` has already been run, so `src/generated/prisma` matches the
schema and the project type-checks and builds.

## Backend

### Structure added

```text
backend/src/modules/work-schedule/
├── work-schedule.module.ts
├── work-schedule.controller.ts
├── work-schedule.controller.spec.ts
├── work-schedule.service.ts
├── work-schedule.service.spec.ts
├── work-schedule.constants.ts
├── dto/
│   ├── update-work-schedule.dto.ts
│   ├── update-work-schedule.dto.spec.ts
│   ├── create-timesheet-approval-email.dto.ts
│   ├── create-timesheet-approval-email.dto.spec.ts
│   └── work-schedule-field.decorators.ts
└── entities/
    ├── work-schedule.entity.ts
    └── timesheet-approval-email.entity.ts
```

The same shape as the five modules before it — controller, service, DTOs,
entities, constants, field decorators — so there is nothing new to learn in
order to read it.

### Every created file, and what it is for

| File | Purpose |
| --- | --- |
| `work-schedule.module.ts` | Declares the controller and the service, and exports the service. `PrismaModule` is not imported: it is `@Global`. The export exists because the Timesheets module should read the configuration through this service rather than querying `work_schedules` itself — the same hand-off `ProjectService` and `EmployeeService` make. |
| `work-schedule.controller.ts` | The five routes, each a one-line delegation. Singular path, no id, `PUT` for the write. |
| `work-schedule.service.ts` | Every rule: the single-row upsert, the entry-range check, the duplicate-address check, the "not configured yet" 404. |
| `work-schedule.constants.ts` | `WORK_SCHEDULE_ID`, the `HH:mm` pattern, the decimal-places and hour ceilings, and `compareWeekdays` — the week ordering, derived from the enum's declaration order rather than written out a second time. |
| `dto/update-work-schedule.dto.ts` | Body of `PUT /work-schedule`. Every field required, because a `PUT` replaces. |
| `dto/create-timesheet-approval-email.dto.ts` | Body of `POST /work-schedule/emails`. One field. |
| `dto/work-schedule-field.decorators.ts` | The per-field constraints, shared by the fields that repeat them: `IsWorkingDays`, `IsWorkTime`, `IsHours`, `IsWeeklyHours`, `IsLunchBreakHours`. |
| `entities/work-schedule.entity.ts` | `WorkScheduleEntity`, the `select` every query uses, and the row → resource mapper. |
| `entities/timesheet-approval-email.entity.ts` | The same three things for an approval address. |
| `common/constants/email.constants.ts` | `EMAIL_MAX_LENGTH` — RFC 5321's 254, which belongs to email rather than to any one module. |
| `common/decorators/is-email-address.decorator.ts` | `@IsEmailAddress()` — trim, lower-case, validate, bound. |
| `prisma/seeds/work-schedule.seed.ts` | The development configuration and two approval addresses. |

Plus the four spec files and this document.

### The shared email decorator

Feature 009 wrote the trim-and-lower-case email rule inside the users module as
`IsUserEmail`. This feature needed the identical rule for approval addresses, so
the rule moved to `common/decorators/is-email-address.decorator.ts` instead of
being copied — the same journey `@IsIsoDateString()` made in Feature 013, and
for the same reason: a second copy is the one that eventually stops folding the
case, and the folding is what makes the unique index a real guarantee.

`USER_EMAIL_MAX_LENGTH` moved with it and became `EMAIL_MAX_LENGTH`. The users
module now spells `email` as `@IsEmailAddress()`; nothing about its behaviour
changed, and its specs still pass unmodified apart from the constant's name.

### Why nothing is computed

`WorkScheduleService` reads and writes the configuration. It counts no days,
sums no weeks and judges no entry. That separation is the point: the rules can
change without migrating anything already recorded, and the Timesheets module
gets one place to ask what the rules currently are.

## API

All five endpoints sit under `/api/v1`, wrapped by the Feature 006 envelopes.
No controller builds a response by hand.

### `GET /api/v1/work-schedule`

The current configuration.

```json
{
  "success": true,
  "data": {
    "workingDays": ["MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY"],
    "workStartTime": "09:00",
    "workEndTime": "18:00",
    "minHoursPerEntry": 0.5,
    "maxHoursPerEntry": 8,
    "maxHoursPerDay": 8,
    "standardHoursPerDay": 8,
    "standardHoursPerWeek": 40,
    "lunchBreakHours": 1,
    "createdAt": "2026-08-04T09:00:00.000Z",
    "updatedAt": "2026-08-04T10:30:00.000Z"
  }
}
```

`404` while nothing has been stored, with a message naming the endpoint that
creates it. A body of defaults was the alternative and was rejected: defaults
would be a guess dressed as an answer, and a client could not tell it apart from
a configuration somebody actually entered.

`id` is not published. There is one configuration and its key is a constant, so
publishing it would only invite a client to address it.

### `PUT /api/v1/work-schedule`

Creates the configuration if absent, replaces it if present. `200` in both
cases — a `201` would let a client tell the two apart, which is exactly what
this endpoint spares it. The body is the complete configuration, and the
response is the stored result, shaped as above.

Implemented as a single `upsert` rather than a read followed by a create or an
update: the two would race, and two administrators saving at once could both
find nothing and both insert.

`400` when a field is missing, malformed, or when `maxHoursPerEntry` does not
exceed `minHoursPerEntry`.

### `GET /api/v1/work-schedule/emails`

Every approval address, ordered by address — a total order, since `email` is
unique, so the list is stable between two requests that changed nothing.

```json
{
  "success": true,
  "data": [
    { "id": "clx…", "email": "hr@example.com", "createdAt": "2026-08-04T09:00:00.000Z" }
  ]
}
```

`404` while the schedule does not exist. The addresses hang off it by a required
foreign key, so without it the collection is not empty — it is not there. An
empty array would claim the schedule was configured and simply had no addresses.

`workScheduleId` is not published: it would repeat the collection the caller
just addressed and can only ever hold one value. Feature 015 made that the rule
for sub-resources.

### `POST /api/v1/work-schedule/emails`

```json
{ "email": "hr@company.com" }
```

`201` with the created address. `400` for a malformed address or for a body
carrying anything else (`workScheduleId` included — the path already says it).
`409` for an address already on the list. `404` while the schedule does not
exist.

### `DELETE /api/v1/work-schedule/emails/:id`

Removes one address. `200` with `"data": null` — the Feature 006 convention, so
a client reads the same two fields whatever it called — and `404` for an unknown
id.

A hard delete, unlike the deletes in the other modules: an address on this list
is a routing rule, not a record of something that happened, so nothing refers
back to it and removing it rewrites no history.

### Status codes, in one place

| Situation | Code |
| --- | --- |
| Configuration read or written | `200` |
| Address added | `201` |
| Address removed | `200`, `data: null` |
| Malformed body, or `maxHoursPerEntry <= minHoursPerEntry` | `400` |
| Configuration not yet created (any route) | `404` |
| Unknown approval-address id | `404` |
| Address already on the list | `409` |

## Validation

Applied by the global `ValidationPipe`, which runs with `whitelist`,
`forbidNonWhitelisted` and `transform` — so an unknown property is a `400`
rather than a silently ignored field.

| Field | Rules |
| --- | --- |
| `workingDays` | Required. An array (`@IsArray`), non-empty (`@ArrayNotEmpty`), without duplicates (`@ArrayUnique`), every element a `Weekday` (`@IsEnum(Weekday, { each: true })`). Sorted into week order before validation. |
| `workStartTime`, `workEndTime` | Required. Trimmed, then matched against `/^([01]\d\|2[0-3]):[0-5]\d$/` — anchored, so `9:00`, `09:00:00` and `24:00` are all refused. |
| `minHoursPerEntry` | Required. A JSON number, at most 2 decimals, `> 0`, at most 24. |
| `maxHoursPerEntry` | The same, and **greater than `minHoursPerEntry`** (service). |
| `maxHoursPerDay` | Required, `> 0`, at most 24. |
| `standardHoursPerDay` | Required, `> 0`, at most 24. |
| `standardHoursPerWeek` | Required, `> 0`, at most 168. |
| `lunchBreakHours` | Required, `>= 0`, at most 24. |
| `email` | Required. Trimmed, lower-cased, a valid address, at most 254 characters, and unique across the list (service). |

Points worth stating rather than leaving to the code:

- **An empty week is refused.** A company with no working days has no schedule
  to configure, so `[]` is a mistake rather than an answer.
- **The upper bounds are not policy, they are physics.** A day has 24 hours and
  a week has 168; a maximum above either could never be reached. They exist so a
  typo — `80` for `8` — is a `400` naming the field rather than a configuration
  nothing will ever satisfy.
- **A third decimal is refused rather than rounded.** `decimal(5,2)` would round
  `0.125` to `0.13`, leaving the stored configuration different from the one
  submitted.
- **A numeric string is refused.** These arrive in a JSON body, where `8` and
  `"8"` are genuinely different values; coercing would accept a payload the
  client should fix.
- **`workEndTime` before `workStartTime` is allowed.** A shift running 22:00 to
  06:00 crosses midnight and is a real schedule. Rejecting it would make this
  module unable to describe a company that works nights; interpreting a crossing
  day is the Timesheets module's job, and it can read both values.
- **The entry-range rule lives in the service**, next to the other statements
  about what a valid configuration is, rather than on the DTO. It answers with a
  `400` whose message is an array — the same shape the pipe produces — so a form
  handles it with the code it already has.

### How working days are stored

As a PostgreSQL array of the `Weekday` enum: `{monday,tuesday,wednesday}`. The
column therefore rejects anything that is not a day of the week, which a
`text[]` would have accepted.

Before validation, `@IsWorkingDays()` sorts the submitted array into the enum's
declaration order — Monday first. The order is taken from `Object.values(Weekday)`
rather than written out again, so there is no second list to fall out of step
with the schema. A canonical order means two configurations holding the same
days are equal arrays whatever order the boxes were ticked in, which lets a
client, a diff or a test compare them without sorting first.

Duplicates are rejected rather than silently collapsed: `["MONDAY", "MONDAY"]`
is not a Monday that counts twice — there is no such thing — so it is a payload
the client should fix.

### Why `lunchBreakHours` is stored but not used

Because hours are what an employee books. Quietly removing an hour from a day
somebody logged would make the stored total disagree with what they entered, and
the disagreement would be invisible — nothing in the payload would say an hour
had been taken out.

The value is here so that a report, a payroll export or a future policy can
*state* the company's lunch break. Whether it should ever be **deducted** is a
different decision, with different consequences for every number derived from a
timesheet, and it belongs to the feature that has a reason to make it. Until
then: recorded, published, and subtracted from nothing. The service spec pins
that, so an "improvement" that starts deducting it fails a test with the reason
written next to it.

### Duplicate email protection

Two layers:

1. **A unique index on `email`.** The database guarantee, which holds even when
   two requests race.
2. **A case-insensitive check before the insert**, so the answer is a `409`
   naming the address rather than the driver error a unique violation would
   otherwise surface as a `500`.

The DTO lower-cases at the edge, which is what closes the gap between the two:
without folding, `HR@company.com` and `hr@company.com` would be two rows
notifying one mailbox twice, and the index would not have objected.

## Seeding

`prisma/seeds/work-schedule.seed.ts` writes the documented example
configuration — Monday to Friday, 09:00–18:00, `0.5` minimum entry, 8-hour
maximum entry and day, 8 standard hours per day, 40 per week, a 1-hour lunch
break — plus two approval addresses (`hr@example.com`, `payroll@example.com`),
whose domain matches the seeded accounts.

It exists for a practical reason: `GET /api/v1/work-schedule` answers `404`
until something is stored, so without it every developer's first request against
the module would be an error. Idempotent like every other seed — the schedule is
upserted on the same constant key the application uses, so a re-run refreshes
one row rather than creating a second, and each address is upserted on its
unique `email`. A real deployment states its own configuration through `PUT`;
nothing back-fills it.

## Frontend

No change — the frontend directory is still empty. When it is built, this
configuration is one form: seven checkboxes, two time inputs, six numbers, and a
small list beneath with an "add address" field. Two notes for whoever writes it:
`GET` answering `404` is the "not configured yet" state rather than an error to
show, and the hour fields should submit numbers, not strings.

## Testing

Unit tests, all new:

| Spec | Covers |
| --- | --- |
| `work-schedule.service.spec.ts` | The constant-key read and its 404, the decimals leaving as numbers, the upsert (create and update halves), the entry-range rule including equal bounds, `lunchBreakHours` stored untouched and deducted from nothing, the address list and its ordering, the duplicate `409`, the case-insensitive comparison, the 404 before the schedule exists, and both delete paths |
| `work-schedule.controller.spec.ts` | Each route reaching the matching service method with the arguments it was given, and adding nothing on the way back |
| `update-work-schedule.dto.spec.ts` | Run through a `ValidationPipe` configured exactly like the global one: the week-order sort, duplicates, non-weekdays, the lower-case spelling, the empty week, both time formats including the night shift, zero and negative hours, the quarter hour, the third decimal, the numeric string, both ceilings, and the entry-range rule deliberately *not* being applied here |
| `create-timesheet-approval-email.dto.spec.ts` | Trimming and lower-casing, malformed addresses, the RFC length, and a `workScheduleId` in the body being refused |

`test/app.e2e-spec.ts` gained a `work schedule` block, following the pattern the
other modules established there: the missing-field report, a non-weekday, a
malformed time, a malformed address, a `workScheduleId` in the body, and the
absence of any route addressing a configuration by id. Like the rest of that
suite it exercises only what the `ValidationPipe` rejects before the handler
runs, so it still needs no database.

Results: `npm run typecheck` clean, `npm test` 765 passed (50 suites),
`npm run test:e2e` 28 passed, `npm run build` clean, `prettier --check` clean.

## Files Created

| File | Purpose |
| --- | --- |
| `backend/prisma/migrations/20260804120000_add_work_schedule_configuration/migration.sql` | The `Weekday` type, both tables, the unique index and the foreign key |
| `backend/prisma/seeds/work-schedule.seed.ts` | Development configuration and two approval addresses |
| `backend/src/common/constants/email.constants.ts` | `EMAIL_MAX_LENGTH` |
| `backend/src/common/decorators/is-email-address.decorator.ts` | `@IsEmailAddress()`, shared with the users module |
| `backend/src/modules/work-schedule/work-schedule.module.ts` | The feature module |
| `backend/src/modules/work-schedule/work-schedule.controller.ts` | The five routes |
| `backend/src/modules/work-schedule/work-schedule.controller.spec.ts` | Delegation tests |
| `backend/src/modules/work-schedule/work-schedule.service.ts` | Every rule |
| `backend/src/modules/work-schedule/work-schedule.service.spec.ts` | Unit tests |
| `backend/src/modules/work-schedule/work-schedule.constants.ts` | The singleton key, the time pattern, the bounds, the week ordering |
| `backend/src/modules/work-schedule/dto/update-work-schedule.dto.ts` | `PUT` body |
| `backend/src/modules/work-schedule/dto/update-work-schedule.dto.spec.ts` | Unit tests through a real `ValidationPipe` |
| `backend/src/modules/work-schedule/dto/create-timesheet-approval-email.dto.ts` | `POST /emails` body |
| `backend/src/modules/work-schedule/dto/create-timesheet-approval-email.dto.spec.ts` | Unit tests |
| `backend/src/modules/work-schedule/dto/work-schedule-field.decorators.ts` | Per-field constraints |
| `backend/src/modules/work-schedule/entities/work-schedule.entity.ts` | Entity, `select`, mapper |
| `backend/src/modules/work-schedule/entities/timesheet-approval-email.entity.ts` | Entity, `select`, mapper |
| `FEATURES/016-work-schedule-configuration.md` | This document |

## Files Modified

| File | Change |
| --- | --- |
| `backend/prisma/schema.prisma` | `Weekday` enum, `WorkSchedule` and `TimesheetApprovalEmail` models |
| `backend/prisma/seed.ts` | Runs `seedWorkSchedule` and reports it |
| `backend/src/app.module.ts` | Registers `WorkScheduleModule` |
| `backend/src/modules/users/dto/user-field.decorators.ts` | `IsUserEmail` removed; the rule now lives in `common/decorators` |
| `backend/src/modules/users/dto/create-user.dto.ts` | Uses `@IsEmailAddress()` |
| `backend/src/modules/users/dto/create-user.dto.spec.ts` | Imports `EMAIL_MAX_LENGTH` |
| `backend/src/modules/users/user.constants.ts` | `USER_EMAIL_MAX_LENGTH` removed; the note says where it went |
| `backend/test/app.e2e-spec.ts` | New `work schedule` block |
| `FEATURES/HISTORY.md` | Feature 016 row |
| `FEATURES/README.md` | Feature 016 row |

## Notes

- The addresses are not paginated. The collection is a handful of role mailboxes
  maintained by hand, and a page envelope around four rows would be ceremony a
  client has to unwrap for nothing. If it ever grows, `PaginationQueryDto` is
  one import away.
- No guard, no role check, no notion of who is calling — even though this is
  administrator-only configuration in practice. Authentication and authorization
  are later features, and half an access check is worse than none: it reads as
  protection while providing none.
- Deleting the configuration is not possible through the API. There is no
  endpoint for it, deliberately: "no configuration" is a state the application
  starts in, not one it should be returned to while timesheets are being
  validated against it.
- The relationship between the numbers is barely constrained. Only
  `maxHoursPerEntry > minHoursPerEntry` was asked for and only that is enforced;
  a configuration where `standardHoursPerDay` exceeds `maxHoursPerDay`, or where
  `standardHoursPerWeek` is not `standardHoursPerDay × workingDays.length`, is
  accepted. Some of those are genuinely valid (a four-day week with longer days),
  and guessing which are not is how a validation rule ends up refusing a real
  company.

## Future Improvements

- The Timesheets module: read this configuration and validate entries against
  the working days, the entry bounds and the daily ceiling. That is what the
  feature exists for, and `WorkScheduleService` is exported ready for it.
- Decide, explicitly and with a name on it, whether `lunchBreakHours` should
  ever be deducted — and if so, by which consumer. It must not become a quiet
  subtraction inside a total.
- Warn rather than refuse on the relationships listed above, once there is a UI
  that can show a warning without blocking a save.
- An audit trail. `updatedAt` says the configuration changed but not who changed
  it or what it was before, and a timesheet rejected under a rule that has since
  been edited is hard to explain without that history. It needs authentication
  first, to have a name to record.
- Per-employee or per-department schedules, if part-time contracts arrive. The
  singleton would become a default, and this feature's URL would keep meaning
  "the company's", which is why the path says `work-schedule` rather than
  `settings`.

---

## Amended by Feature 030 — `weekStartsOn`

[Feature 030](030-timesheet-management.md) added one column to `WorkSchedule` and
gave two of its existing ones their first reader. **Nothing in this document is
retracted**, including the claim that this module computes nothing — it still
does not.

```prisma
/// Which weekday a week begins on, for the purpose of a weekly total.
weekStartsOn Weekday @default(MONDAY) @map("week_starts_on")
```

### Why a week needs a start

The timesheet feature caps hours per **week**, and a weekly cap is meaningless
without saying where a week ends and the next begins.

**The working week does not begin on Monday everywhere this application may be
deployed.** It begins on Sunday across much of the Middle East, Asia and the
Americas, and on Saturday in parts of the Gulf. A Monday assumed in the grouping
would split such a company's week across two buckets — and a ceiling checked over
half a week each time is a ceiling that never binds. That is not a cosmetic bug:
it is a limit the configuration screen claims to enforce and silently does not.

### Why it cannot be derived from `workingDays`

The obvious shortcut — "the first working day" — is wrong. A company working
Sunday to Thursday and one working Tuesday to Saturday can hold overlapping
arrays, and the shortcut would call a Tuesday-to-Saturday week a week beginning on
Tuesday. The two are independent facts and are stated independently.

It is also **not constrained** to be a working day. A company working Monday to
Friday whose payroll week begins on Sunday is an ordinary arrangement, and
requiring the start to be worked would refuse it for no reason a weekly total
cares about.

### Why it is optional on the `PUT`

This is the one field on `UpdateWorkScheduleDto` that is not required, which
departs from the "every field is required, because `PUT` replaces" rule stated
above. The exception is the migration rather than the design: a `PUT` written
against the previous contract must not start failing because a field nobody knew
about is now compulsory. The DTO carries `MONDAY` as a property initialiser, so an
old body and a new one store the same thing — and the column defaults to the same
value, so rows written before the migration keep the grouping they always had.

### Restated: there is no weekend rule anywhere

`workingDays` was always the only statement about which days are worked, and
Feature 030 is the first consumer that could have contradicted it. It does not.
"Not loggable" means "not in `workingDays`", so:

- a company that works Saturdays lists Saturday and can log Saturdays;
- a company that works Monday **to Sunday** lists all seven and can log all seven.

A `getUTCDay() === 0 || === 6` anywhere in the timesheet module would have
contradicted this screen on every request. There is none.

### The hour columns finally have readers

Feature 016 said "the Timesheets module will read this configuration and validate
against it" and that nothing would compute against it until something had a reason
to. That module now exists, and reads:

| Column | Read for |
| --- | --- |
| `workingDays` | whether a day may be logged at all |
| `weekStartsOn` | which week a day belongs to |
| `minHoursPerEntry`, `maxHoursPerEntry` | the bounds on one line |
| `maxHoursPerDay` | the ceiling over every line on a day |
| `standardHoursPerWeek` | the ceiling over a week |
| `standardHoursPerDay` | what a full day of leave or holiday is worth — **halved** for a half-day absence |

`lunchBreakHours` is still read by nothing, exactly as this document insists. The
timesheet module subtracts it from nothing, and the open question about whether it
should ever be deducted stays open with nobody's name on it yet.

`WorkScheduleService.find()` is the hand-off the timesheet module uses, rather
than a narrow method like `findWorkingDays`. That is deliberate and is the
opposite call Feature 023 made: leave needed one column, while the fill-in engine
needs seven of the eight, so publishing the whole configuration is the honest
seam rather than six accessors.

### `timesheet_approval_emails` has a reader

The table this feature created as "an address notified when a timesheet needs
approval" was unread for fourteen features. Feature 030 emails the timesheet
*submitted* announcement to it, through the Notification Delivery Engine — which
reaches it via `WorkScheduleService.findEmails()`, not by querying the table. An
empty list is a normal answer: the in-app notification is the channel
administrators actually work from, and the email is the copy.

### Migration

Part of `add_timesheet_management`. The column is defaulted, so the existing
configuration row keeps the Monday-first grouping it always had.
