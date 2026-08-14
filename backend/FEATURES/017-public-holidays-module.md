# Feature 017 — Public Holidays Module

**Status:** Completed
**Date:** 2026-08-04

## Goal

Let an administrator maintain the calendar of days the company does not work,
covering both kinds of holiday a real calendar contains:

- **fixed** — the same month and day every year (1 January, 25 December),
  entered once and never re-entered;
- **variable** — a date that moves (Easter, Pentecost, Good Friday), entered per
  year.

Configuration rather than data, like
[Feature 016](016-work-schedule-configuration.md): the work schedule says which
weekdays are worked, this says which of those days the company is nevertheless
closed on. The two together are what the Timesheets and Vacations features will
read.

Explicitly **not** included, and left to the features that own them: automatic
Easter calculation, timesheets, work-schedule interaction, vacations, vacation
balances and approvals, authentication, authorization, and reports.

## Requirements

- One resource covering both holiday kinds, distinguished by `type`.
- Fixed holidays configured once; the year they were entered for must not have
  to be updated annually.
- Variable holidays entered per year, the same name recurring across years.
- Either kind may span several consecutive days.
- **A holiday is switched off, not deleted.** A repealed holiday keeps its row,
  so the years already recorded against it keep their meaning.
- `isNational` distinguishes a legal national holiday from a company day off.
- List endpoint with pagination, search, four filters and three sort columns.
- Duplicate protection appropriate to each kind.
- Reuse of the Feature 006 infrastructure: pagination DTO and helpers, the
  global exception filter, the global response interceptor.

## Database

### Enum `HolidayType`

```prisma
enum HolidayType {
  FIXED    @map("fixed")
  VARIABLE @map("variable")
}
```

Two values because there are two genuinely different ways to answer "when is
this holiday", and the answer decides how the rest of the row is read:

| | `FIXED` | `VARIABLE` |
| --- | --- | --- |
| What identifies it | month and day of `startDate` | `name` + `startDate` |
| The stored year | disregarded | the fact itself |
| `isRecurring` | `true` | `false` |
| Next year | the same row | a new row |

Values are stored lower-case, matching `ProjectStatus`, `EmployeeStatus` and
`Weekday`; the TypeScript vocabulary stays upper-case and Prisma maps between
them, so the API publishes `FIXED` rather than the `@map` PostgreSQL wants.

A third value was considered and rejected. "Fixed but observed on the following
Monday when it falls on a weekend" is a real rule in some countries, but it is a
*policy applied to* a fixed holiday rather than a third kind of holiday, and it
belongs to the feature that computes working days — not to the table that
records which days exist.

### Model `PublicHoliday`

```prisma
model PublicHoliday {
  id          String      @id @default(cuid())
  name        String
  description String?
  type        HolidayType
  isNational  Boolean     @default(true) @map("is_national")
  isActive    Boolean     @default(true) @map("is_active")
  startDate   DateTime    @map("start_date")
  endDate     DateTime    @map("end_date")
  isRecurring Boolean     @default(false) @map("is_recurring")
  createdAt   DateTime    @default(now()) @map("created_at")
  updatedAt   DateTime    @updatedAt @map("updated_at")

  @@map("public_holidays")
}
```

Five decisions worth recording:

1. **`endDate` is required, not nullable.** A one-day holiday stores the same
   date twice. The alternative — a null end meaning "one day" — would give every
   consumer a special case in the one query they all have to run, which is
   "which days is the company closed".
2. **There is no `year` column.** It would be authoritative for `VARIABLE` rows
   and misleading for `FIXED` ones, and it would be derivable from `startDate`
   for the half where it means anything — a second place for one fact to be
   wrong. `?year=` is answered from `startDate`; see *Filtering*.
3. **`isRecurring` is derived from `type` and stored anyway.** Storing it is
   what lets a report or an export state the fact without also having to know
   the rule. Keeping the two in step is the API's job, not the column's; the
   `false` default is the database's answer for a row written outside the API.
4. **No unique constraint, and no index.** `name` cannot be unique — "Easter" is
   a different row every year — and the rule that applies to fixed holidays is
   *one per month and day*, a function of a column rather than a column, which a
   unique index cannot state without `EXTRACT`. Putting half the rule in the
   database and half in the service would leave two places to read it, so both
   live in `PublicHolidayService`. No performance index either: this table holds
   a national calendar, on the order of tens of rows.
5. **No relation to anything.** A holiday stands on its own. Timesheets and
   Vacations will *read* it, but neither owns a foreign key into it, and
   inventing one now would be guessing at their shape.

### Migration

`backend/prisma/migrations/20260804140000_add_public_holidays/migration.sql`

Purely additive — one enum type, one table — so it is safe to apply to a
populated database and no existing data is touched or lost. Nothing is
back-filled: which days a country closes on is a fact about that country, and
the schema should not assume one. The calendar is entered through the API.

The migration is **not applied automatically**. The command, awaiting approval:

```bash
cd backend && npx prisma migrate deploy   # applies the checked-in SQL as-is
```

## Backend

### Structure added

```text
backend/src/modules/public-holidays/
├── public-holiday.constants.ts
├── public-holiday.controller.ts
├── public-holiday.controller.spec.ts
├── public-holiday.module.ts
├── public-holiday.service.ts
├── public-holiday.service.spec.ts
├── dto/
│   ├── create-public-holiday.dto.ts
│   ├── create-public-holiday.dto.spec.ts
│   ├── update-public-holiday.dto.ts
│   ├── update-public-holiday.dto.spec.ts
│   ├── public-holiday-query.dto.ts
│   ├── public-holiday-query.dto.spec.ts
│   └── public-holiday-field.decorators.ts
└── entities/
    └── public-holiday.entity.ts
```

The same layout as Departments, Positions, Users, Employees and Projects,
including the `*-field.decorators.ts` split: **constraints** live in the shared
decorators, **optionality** stays on each DTO, because `@IsOptional()` versus
`@ValidateIfPresent()` is what distinguishes create from patch and has to be
readable on the class it applies to.

Nothing new was added to `src/common`. Every shared piece this module needed
already existed — `PaginationQueryDto`, `SortQueryDto`, `toSkipTake`,
`buildPaginatedResult`, `toIsoTimestamp`, `@Trim()`, `@ToBoolean()`,
`@ValidateIfPresent()`, `@IsIsoDateString()` — which is the payoff of Features
006 and 013 and the reason this module is mostly rules rather than plumbing.

### Recurring holiday logic

The rule is one function:

```ts
function recurrenceFor(type: HolidayType): boolean {
  return type === HolidayType.FIXED;
}
```

Everything about recurrence follows from it.

- **On create**, `isRecurring` is derived and written; the client never decides
  it.
- **On patch**, it is re-derived from the *resolved* type, so a holiday
  reclassified from `VARIABLE` to `FIXED` has its flag corrected in the same
  request rather than left contradicting its type.
- **A body may state it**, and a body that states it wrongly is a `400` naming
  the rule — `isRecurring must be true for a FIXED holiday`. It is never quietly
  overwritten. That is what makes *"if type == FIXED then isRecurring must be
  true"* a rule the API enforces rather than a convention it silently repairs.

The requirement was stated as a validation ("`isRecurring` must be `true` when
type is `FIXED`"). Deriving it and validating what was stated satisfies that
rule and also closes the case it left open — `VARIABLE` with `isRecurring: true`
— which is the same contradiction from the other side.

What *fixed recurrence means in practice* is that the stored year is
disregarded. A holiday entered once as `2025-12-25` is 25 December in 2027 and
in 2031 too; nothing has to be re-entered, no job runs at midnight on 1 January,
and the year filter cannot exclude it. This module does not expand a fixed
holiday into per-year occurrences — the consumer that needs "the dates in 2028"
combines the month and day with the year it is asking about, which is one line
where it is needed and a table of duplicated rows if it were done here.

### Duplicate protection

Two rules, because the two types identify a holiday differently. Using one rule
for both would be wrong in both directions: month-and-day applied to variable
holidays would reject Easter 2027 for colliding with Easter 2026, while
name-and-date applied to fixed ones would let "New Year" and "New Year's Day"
both claim 1 January.

| Type | Rejected when | Status |
| --- | --- | --- |
| `FIXED` | another fixed holiday has the same **month and day**, any year | `409` |
| `VARIABLE` | another variable holiday has the same **name** (case-insensitively) **and** the same **startDate** | `409` |

Both run on create and on patch, and on patch the holiday's own id is excluded
so re-sending what it already holds is not a conflict with itself. On patch they
are applied to the *resolved* holiday, so changing `type` switches which rule is
used, and renaming a variable holiday re-checks the new name against the start
date already stored.

The fixed check reads every fixed row and compares in TypeScript rather than
filtering in the `WHERE`. Matching a month and a day needs `EXTRACT(...)`, which
Prisma cannot express and which CLAUDE.md admits only as raw SQL on request —
and the set being read is a national calendar, tens of rows of two columns, so
the read is cheaper than the index that would avoid it. Should this table ever
hold a decade of every region's holidays, a generated `month_day` column is the
change to make, and it would leave the method's signature untouched.

The comparison is in **UTC** on both sides. The columns are `timestamp` and a
client posting `2026-01-01` gets UTC midnight, so reading the local month and
day would make the answer depend on the server's timezone — 1 January would
become 31 December for anyone west of Greenwich, and the duplicate check would
pass or fail by deployment.

### Validation rules

Shape is the DTOs' job:

| Field | Create | Patch | Rule |
| --- | --- | --- | --- |
| `name` | required | optional | trimmed, non-empty, ≤ 100. Case and diacritics preserved — it is a proper noun, not a natural key |
| `description` | optional | optional, nullable | trimmed, ≤ 500; blank collapses to `null` |
| `type` | required | optional | `FIXED` or `VARIABLE` |
| `isNational` | optional | optional | boolean; `null` is a `400` |
| `isActive` | optional | optional | boolean; `null` is a `400` |
| `isRecurring` | optional | optional | boolean; checked against `type` by the service |
| `startDate` | required | optional | ISO-8601 date or timestamp |
| `endDate` | required | optional | ISO-8601 date or timestamp |

`@ValidateIfPresent()` rather than `@IsOptional()` on every non-nullable field:
`@IsOptional()` also skips its constraints for `null`, which would let a `null`
travel through the DTO into a column that cannot hold it and surface as a `500`
where the client deserved a `400` naming the field. `description` is the one
nullable column and therefore the one field where `null` is a request.

Two rules cannot live in a DTO, because each needs two values at once and each
has to be answered on `PATCH` against what is already stored:

- **`endDate` on or after `startDate`** — `400`, message
  `endDate must not be before startDate`. The comparison is `<`, so a one-day
  holiday with identical ends is allowed. A patch carrying only `endDate` is
  judged against the stored `startDate`.
- **`isRecurring` agreeing with `type`** — `400`, as described above.

Both are `400` and not `409`: nothing in the database conflicts with the
request, the submitted body simply contradicts itself. Both messages are arrays,
the shape the global `ValidationPipe` produces, so a form handles them with the
code it already has for field errors.

Unknown properties never reach any of the three DTOs — the global pipe runs with
`forbidNonWhitelisted`, so `?month=12` or a misspelt body field is a `400`
rather than a silently ignored one.

### `isNational`

A plain editable boolean, defaulted to `true`, with no behaviour attached in
this feature:

- `true` — a legal holiday the whole country observes. The company is closed and
  nobody is expected to book time.
- `false` — a day this company grants on its own: a founding anniversary, a
  bridge day, an optional day off.

Defaulted to `true` because the set this table is created to hold is the
national calendar; a company day off is the deliberate exception, and typing one
extra field for it is better than every national holiday needing one.

It is filterable (`?isNational=`) so the two lists can be shown apart, and it is
deliberately a **separate axis from `isActive`**: a company day off that has
been discontinued is `isNational: false, isActive: false`, and neither value
implies the other. Whether a non-national holiday should be treated differently
when validating a timesheet — deducted from a leave balance, say — is a decision
for the feature that validates timesheets, which is why nothing here does
anything with the flag beyond recording and reporting it.

### Why fixed holidays remain editable instead of being recreated yearly

The rule the feature is built around, and it has two halves.

**Not recreated yearly.** A fixed holiday recurs by month and day, so the row
entered in 2025 is still the answer in 2035. If it were re-entered per year, the
calendar would be a maintenance task somebody has to remember every December,
the duplicate rule would have to permit twenty New Years, and a year nobody
remembered to configure would silently become a year with no holidays — a
timesheet system quietly accepting bookings on 25 December. Configuring once is
what makes the absence of a holiday mean something.

**Still editable.** A calendar that is entered once is not a calendar that is
correct forever. Governments add holidays, move them and repeal them. The
example the feature gives: Children's Day stops being a legal holiday. The
answer is

```http
PATCH /api/v1/public-holidays/:id
{ "isActive": false }
```

and *not* `DELETE`. The difference matters because the row is the reason
something else is true. Timesheets recorded for past years, and vacation days
counted against past balances, were computed against a calendar that included
that holiday; deleting the row would leave a day in 2024 unexplained — nobody
worked, and nothing says why. Deactivating states exactly what happened: it was
a holiday, and from now on it is not. It is also reversible in one request,
which a delete is not.

`DELETE` exists for the case it is actually for — a row entered by mistake, a
typo, a duplicate slipped in before the constraint caught it — and is a hard
delete because there is nothing to preserve about a row that should never have
existed. This is a rule about which endpoint to call rather than something the
service can enforce, which is why `isActive` is an ordinary editable column and
why nothing in the module treats a fixed holiday as read-only: no field is
frozen, `type` itself can be changed, and a repealed holiday can be switched
back on.

## API

Base path `/api/v1/public-holidays`. The prefix and version come from
`configureApp`; every response is wrapped by the global interceptor, every
failure rendered by the global filter, so no controller method builds a response.

| Method | Path | Success | Body / Query |
| --- | --- | --- | --- |
| `GET` | `/public-holidays` | 200 | pagination, search, filters, sorting |
| `GET` | `/public-holidays/:id` | 200 | — |
| `POST` | `/public-holidays` | 201 | `CreatePublicHolidayDto` |
| `PATCH` | `/public-holidays/:id` | 200 | `UpdatePublicHolidayDto` |
| `DELETE` | `/public-holidays/:id` | 200, `data: null` | — |

Error statuses: `400` for a rejected body or query, `404` for an unknown id,
`409` for either duplicate rule.

`DELETE` answers 200 with `{ "success": true, "data": null }` rather than 204,
for the reason Feature 006 chose: a 204 carries no body, which would make it the
one endpoint whose response is not the envelope.

### `GET /api/v1/public-holidays`

```http
GET /api/v1/public-holidays?year=2026&isActive=true&sortBy=startDate&page=1&limit=50
```

```json
{
  "success": true,
  "data": {
    "items": [
      {
        "id": "clx…",
        "name": "Christmas Day",
        "description": "First and second day of Christmas.",
        "type": "FIXED",
        "isNational": true,
        "isActive": true,
        "startDate": "2025-12-25T00:00:00.000Z",
        "endDate": "2025-12-26T00:00:00.000Z",
        "isRecurring": true,
        "createdAt": "2026-08-04T10:00:00.000Z",
        "updatedAt": "2026-08-04T10:00:00.000Z"
      }
    ],
    "meta": {
      "page": 1, "limit": 50, "total": 1, "totalPages": 1,
      "hasPreviousPage": false, "hasNextPage": false
    }
  }
}
```

`startDate` and `endDate` are rendered as full ISO-8601 instants rather than
truncated to `YYYY-MM-DD`, for the reason `Project.startDate` is: the columns
are `timestamp`, so printing only the date would quietly assume a timezone this
module has no way to know. A client that wants "25 December" reads the first ten
characters of a UTC instant it was given as UTC.

#### Searching

`?search=` — a case-insensitive substring of **`name`**.

`name` alone, not `description`: the description is prose about the holiday, and
matching it would make a search for "day" return everything that merely mentions
one. Absent and empty are the same thing — an empty term matches every row,
which is what the endpoint already does without it. Bounded at 100 characters so
a huge term cannot be pushed into a `LIKE` scan.

#### Filtering

| Parameter | Values | Effect |
| --- | --- | --- |
| `?type=` | `FIXED`, `VARIABLE` | exact |
| `?isActive=` | `true`, `false` | exact |
| `?isNational=` | `true`, `false` | exact |
| `?year=` | 1970–2100 | see below |

All four combine with `AND` and with `?search=` — `?isActive=true` narrows
whatever the search matched rather than replacing it. Omitting one means "do not
filter"; in particular, omitting `isActive` lists repealed holidays alongside
current ones, because hiding them by default would be a policy the caller cannot
see or turn off, and the whole point of `isActive` is that a repealed holiday is
still there.

**`?year=` narrows variable holidays only**, and that is the design of the
parameter rather than a limitation of it. It compiles to

```ts
{ OR: [ { type: FIXED },
        { startDate: { gte: Jan 1 of year, lt: Jan 1 of next year } } ] }
```

A fixed holiday has no year — it is the same holiday in every one of them — so
no year can exclude it, and a "2026 calendar" that dropped Christmas because the
row happens to store `2025-12-25` would be wrong. `?year=2026` therefore answers
*"what is the company closed for in 2026"*: every fixed holiday, plus the
variable ones falling in that year.

To see one year's variable holidays alone, combine the two:
`?year=2026&type=VARIABLE`. There is deliberately no second spelling of the same
question.

The bounds are a half-open UTC range, so the last instant of 31 December is
included without the query naming it. A variable holiday belongs to the year its
`startDate` falls in, so one spanning New Year's Eve lists under the year it
began and does not appear twice — reporting it in both would claim two holidays
where there is one.

The 1970–2100 bounds exist so a typo (`?year=20226`, `?year=0`) is a `400`
naming the parameter rather than a silently empty page.

#### Sorting

`?sortBy=` accepts `name`, `startDate`, `createdAt`; `?sortOrder=` accepts `asc`
(default) and `desc`. A closed list, because the value reaches Prisma's
`orderBy` key.

The default is **`name`**, which is the one place this module departs from what a
calendar would suggest — and it departs for a reason particular to this table. A
fixed holiday's stored year is disregarded by the recurrence rule, so it is
whatever year the row happened to be entered for: New Year saved as `2025-01-01`
and Christmas saved as `2026-12-25` would sort a year apart while describing the
same twelve months. `name` is the only key that means the same thing for both
types. A caller who wants calendar order asks for
`?sortBy=startDate&type=VARIABLE`, where the year is real.

Every ordering is tie-broken by `id`, which is what makes pagination safe: none
of the three sortable columns is unique — two holidays share a name across
years, and a multi-day holiday's neighbours can share its start date — so
without the tie-break a record could repeat on one page and vanish from the next.

### `POST /api/v1/public-holidays`

A fixed holiday, entered once and never again:

```json
{
  "name": "New Year",
  "type": "FIXED",
  "startDate": "2025-01-01",
  "endDate": "2025-01-02"
}
```

A variable one, entered for its year:

```json
{
  "name": "Easter",
  "type": "VARIABLE",
  "startDate": "2026-04-12",
  "endDate": "2026-04-13"
}
```

`isRecurring` comes back `true` and `false` respectively without either body
mentioning it.

### `PATCH /api/v1/public-holidays/:id`

Partial; every rule is re-checked against the result, not against the body.
Repealing a holiday:

```json
{ "isActive": false }
```

## Frontend

No change — the frontend directory is still empty. When it is built, the two
holiday kinds are one screen and not two: `type` is a field on the form, and the
only thing it changes is whether the year in the date picker is meaningful.
`PaginationMeta` maps onto a pagination component as it does for every other
list.

## Testing

Unit tests, all new, extending the existing Jest setup — no new framework, no
new configuration:

| Spec | Covers |
| --- | --- |
| `public-holiday.service.spec.ts` | the mapped page and its metadata, skip/take, ordering and the id tie-break, search, filter combination, the year filter in both forms, the shared `where` for rows and count, the single transaction; 404s; date parsing, the ordered span on create and on both patch directions; recurrence derived, stated correctly, and contradicted from both sides; both duplicate rules, the same variable holiday accepted in another year, the rule switching when `type` changes; deactivation instead of deletion, and reactivation |
| `public-holiday.controller.spec.ts` | each route reaching the matching service method with the arguments it was given, and adding nothing on the way back |
| `create-public-holiday.dto.spec.ts` | required fields, trimming, blank description → `null`, ISO forms accepted, and the rejections — missing fields, the stored enum spelling, ambiguous dates, `null` on non-nullable fields, unknown properties, lengths |
| `update-public-holiday.dto.spec.ts` | the empty body, single-field patches, `description` cleared by `null` and by blank, and `null` rejected on every non-nullable field |
| `public-holiday-query.dto.spec.ts` | defaults, inherited pagination, trimming, every sort field, every type, boolean coercion, year coercion and its boundaries, and the rejections — unsortable columns, out-of-range and fractional years, unknown parameters |

The service spec is run against a mocked `PrismaService`, the same technique the
five modules before it use, so the rules are asserted without a database.

## Files Created

| File | Purpose |
| --- | --- |
| `backend/prisma/migrations/20260804140000_add_public_holidays/migration.sql` | `HolidayType` enum and `public_holidays` table |
| `backend/src/modules/public-holidays/public-holiday.constants.ts` | Lengths, year bounds, the sortable columns and the default |
| `backend/src/modules/public-holidays/public-holiday.module.ts` | The feature module; exports the service for Timesheets and Vacations |
| `backend/src/modules/public-holidays/public-holiday.controller.ts` | The five routes, each a one-line delegation |
| `backend/src/modules/public-holidays/public-holiday.controller.spec.ts` | Unit tests for the delegation |
| `backend/src/modules/public-holidays/public-holiday.service.ts` | Every rule: the span, recurrence, both duplicate rules, the year filter |
| `backend/src/modules/public-holidays/public-holiday.service.spec.ts` | Unit tests against a mocked Prisma client |
| `backend/src/modules/public-holidays/dto/create-public-holiday.dto.ts` | `POST` body |
| `backend/src/modules/public-holidays/dto/create-public-holiday.dto.spec.ts` | Unit tests through a real `ValidationPipe` |
| `backend/src/modules/public-holidays/dto/update-public-holiday.dto.ts` | `PATCH` body |
| `backend/src/modules/public-holidays/dto/update-public-holiday.dto.spec.ts` | Unit tests, focused on nullability |
| `backend/src/modules/public-holidays/dto/public-holiday-query.dto.ts` | `GET` query string |
| `backend/src/modules/public-holidays/dto/public-holiday-query.dto.spec.ts` | Unit tests |
| `backend/src/modules/public-holidays/dto/public-holiday-field.decorators.ts` | Per-field constraints shared by the two body DTOs |
| `backend/src/modules/public-holidays/entities/public-holiday.entity.ts` | The published resource, the `select`, the row type and the mapper |
| `FEATURES/017-public-holidays-module.md` | This document |

## Files Modified

| File | Change |
| --- | --- |
| `backend/prisma/schema.prisma` | `HolidayType` enum and `PublicHoliday` model |
| `backend/src/app.module.ts` | Registers `PublicHolidayModule` |
| `FEATURES/HISTORY.md` | Feature 017 row |
| `FEATURES/README.md` | Feature 017 row |

## Notes

- The seed is untouched. A development calendar would be one country's, and
  seeding it would put a claim about a jurisdiction into a fixture every
  developer inherits. The API creates one in a handful of requests.
- Nothing in this module computes a date. Easter is entered, not calculated: the
  rule differs by confession and by calendar, and a wrong answer would be
  indistinguishable from a right one until somebody worked on the wrong day.
- `PublicHolidayService` is exported but has no `exists()` or `isHoliday()` yet.
  What Timesheets and Vacations will ask — "is this date a holiday", "how many
  working days lie between these two" — belongs to the feature that asks it, and
  writing it now would be guessing at the signature.
- The fixed duplicate check reads every fixed row into memory. Documented in
  the service and bounded by what the table is for; the note there says what to
  change if that ever stops being true.

## Future Improvements

- A working-days helper, once Timesheets or Vacations needs one: it belongs
  here, beside the calendar, rather than in whichever module happens to need it
  first — and it is where the fixed/variable distinction stops being a storage
  detail and starts being arithmetic.
- Observance rules for a fixed holiday landing on a weekend ("moved to the
  following Monday"), if a jurisdiction the company operates in has them. A
  column on this model, applied by the working-days helper.
- Per-region holidays, if the company opens an office abroad. That is a `region`
  column and a scope on the duplicate rules, not a second table.
- A bulk endpoint for importing a year of variable holidays in one request, if
  entering three per year ever becomes a complaint.
