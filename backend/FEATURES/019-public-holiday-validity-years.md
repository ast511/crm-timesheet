# Feature 019 — Public Holiday Validity Years

**Status:** Completed
**Date:** 2026-08-04

## Goal

Make a past year's calendar stay correct.

[Feature 018](018-public-holiday-calendar-endpoints.md) shipped
`GET /public-holidays/calendar/:year` and documented one limit under *Future
Improvements*: the calendar was active-only, `isActive` carried no date, so
asking for a past year returned **today's** calendar projected onto it. Switch
Children's Day off in 2029 and it vanished from 2026 — a year the office really
was closed.

This feature removes that limit. Asking for 2026 now returns the holidays as
2026 had them: the versions in force that year, on the dates those versions
carried, however many times a holiday has since been repealed, reinstated or
moved.

## Requirements

- A repeal takes effect **from** a year; earlier years keep their answer.
- A holiday may be repealed and reinstated any number of times.
- A reinstated holiday may fall on a different day, and the old day must stay
  correct for the years it applied to.
- No second way to ask whether a holiday is in force.
- Reuse the module, endpoints and shared infrastructure already in place.

## Why `repealedAt` was not enough

The change was requested as a `repealedAt` column. It would not have done the
job, and that is worth recording because the reasoning is the whole design.

A single repeal timestamp records **one** transition, once. What was actually
described — off, on again years later, possibly on a different date — is a
*history of versions*. A second repeal has nowhere to go, and a changed date has
nowhere to go at all: patching `startDate` rewrites every year the row already
answered for.

Two facts shaped what was built instead:

1. **`VARIABLE` holidays were already correct.** Easter 2026 is its own row with
   its own dates, and nothing ever rewrites it. The defect was confined to
   `FIXED` holidays, where one row is reused for every year.
2. **`isActive` was the defect, not a missing column.** A boolean with no date
   attached cannot say *when* something stopped, so it can only answer
   retroactively.

So the unit of storage becomes a **version**: a row is one holiday as it applied
over a range of years.

## Database

### `PublicHoliday` — two columns added, one dropped

```prisma
validFromYear Int? @map("valid_from_year")
validToYear   Int? @map("valid_to_year")
```

```prisma
- isActive Boolean @default(true) @map("is_active")
```

Both new columns are nullable, and null means **open**: no `validFromYear` is
"as far back as this system knows", no `validToYear` is "still in force". A row
with neither — which is every row an administrator enters normally — is in force
in every year, exactly as before the columns existed.

Five decisions worth recording:

1. **Years, not dates.** The module already thinks in years, the calendar
   endpoints take a year, and a holiday is legislated per year — a repeal
   effective 15 June would mean a holiday that applied in the first half of a
   year and not the second, which is not a thing that happens. The query stays
   an integer comparison.
2. **`FIXED` only.** A `VARIABLE` row already *is* one year, named by
   `startDate`. A range on it would be a second statement of the same fact, free
   to disagree with the first, so the service rejects one with a `400` — the
   same shape of rule as the `isRecurring` check, and there for the same reason.
3. **The range says nothing about the year inside `startDate`.** That year stays
   meaningless for a fixed holiday; only the month and day are read. A version
   valid from 2029 may perfectly well store `2025-06-01`.
4. **`isActive` is gone rather than kept alongside.** Keeping both would have
   left two ways to say "not a holiday any more", one of which silently rewrites
   the past — and the wrong one is the shorter one to type. This is the same
   call [Feature 012](012-project-status-consolidation.md) made when it dropped
   `Project.isActive`: a second, contradictable statement of a fact the other
   column already carries.
5. **Still no index.** The table holds a national calendar plus one row per
   variable holiday per year — tens of rows, which PostgreSQL sequential-scans
   faster than it would descend an index.

### Migration

`backend/prisma/migrations/20260804160000_public_holiday_validity_years/migration.sql`

```sql
ALTER TABLE "public_holidays" ADD COLUMN "valid_from_year" INTEGER;
ALTER TABLE "public_holidays" ADD COLUMN "valid_to_year" INTEGER;
ALTER TABLE "public_holidays" DROP COLUMN "is_active";
```

The two additions need no back-fill: null/null means always-in-force, which is
exactly what `is_active = true` meant.

**The drop discards data.** A row with `is_active = false` becomes
always-in-force, because a boolean cannot say which year the holiday stopped —
recovering that is precisely what the range exists for and precisely what the
flag never recorded. On a populated database, set the range on those rows first:

```sql
UPDATE "public_holidays" SET "valid_to_year" = <last year it applied>
WHERE "is_active" = false;
```

In practice there is nothing to migrate here: the table was introduced by
[Feature 017](017-public-holidays-module.md), whose migration has not yet been
applied in this repository, so both run in the same deployment and the column is
dropped before any row has used it.

Awaiting approval, as before:

```bash
cd backend && npx prisma migrate deploy
```

## Backend

### The calendar read

`yearFilter` now decides the whole in-force question in SQL, and the two types
are narrowed on different columns because they record the same fact differently:

```ts
OR: [
  { type: FIXED,
    AND: [
      { OR: [{ validFromYear: null }, { validFromYear: { lte: year } }] },
      { OR: [{ validToYear:   null }, { validToYear:   { gte: year } }] },
    ] },
  { type: VARIABLE, startDate: { gte: Jan 1, lt: Jan 1 next } },
]
```

What is left for TypeScript is only *which day* a fixed holiday lands on, which
`occurrenceSpanIn` already decided. The `isActive: true` the read used to carry
is gone with the column.

### Duplicate protection, now range-aware

The fixed-holiday rule was "one per month and day". It is now **one per month
and day among versions whose years overlap**:

| | Conflict? |
| --- | --- |
| Children's Day 1 June, through 2026 — and 1 June, from 2029 | no |
| Children's Day 1 June, through 2026 — and 1 June, from 2026 | yes |
| Children's Day 1 June, through 2026 — and 1 June, no range | yes (the second claims every year) |
| Christmas 25 December, no range — and 25 December, no range | yes |

Open ends resolve to infinities once (`toYearRange`) so the overlap test is a
pair of ordinary comparisons rather than four null checks that one of would
eventually get wrong. The `409` names the conflicting version's years —
`already falls on 06-01 in every year up to 2026` — because with versions, "it
clashes" is not enough to act on.

The variable rule is unchanged: same name, same `startDate`.

### Recording a change versus correcting one

The distinction the API now rests on, and the one a client has to get right:

| What happened | What to send |
| --- | --- |
| The holiday was repealed | `PATCH { "validToYear": 2026 }` |
| The repeal was entered by mistake | `PATCH { "validToYear": null }` |
| A typo in this version | `PATCH` the field |
| The holiday came back, or moved to another day | `POST` a **new version** |

`PATCH` rewrites every year the version covers, which is right for a typo and
wrong for a change in the world. That is why reinstating is a `POST`: the years
the holiday was absent have to stay absent.

Nothing treats a fixed holiday as read-only — no field is frozen, `type` itself
can be patched — so a version entered wrongly is fixed in place.

### Merge behaviour on `PATCH`

`mergeFacts` resolves the range like every other field, with one extra rule:
reclassifying a holiday as `VARIABLE` **clears** the range rather than carrying
it over. Otherwise a patch that changed only the type would inherit a range the
new type cannot have and be rejected for a contradiction the client did not
write.

Both columns are always written on update, like `isRecurring` and for the same
reason: the value is the resolved one, so a type change cannot leave a stale
range behind.

## API

### Changed

| | Before | After |
| --- | --- | --- |
| `PublicHolidayEntity` | `isActive: boolean` | `validFromYear: number \| null`, `validToYear: number \| null` |
| `POST` / `PATCH` body | `isActive` | `validFromYear`, `validToYear` (both optional, both nullable on patch) |
| `GET /public-holidays?isActive=` | filtered records | `400` — unknown parameter |
| `GET /calendar/:year` | today's calendar, dated to the year | the calendar **that year had** |

`?isActive=` is gone rather than renamed: "is it still in force" is a question
about a year, and the endpoint that takes a year is the calendar. The list
endpoint now shows every version ever recorded, repealed ones included, which is
what an administrator maintaining the history needs to see. It keeps `?search=`,
`?type=` and `?isNational=`.

This changes behaviour shipped in Features 017 and 018; those documents are left
as the record of what was true at the time.

### Validation added

| Rule | Status |
| --- | --- |
| `validToYear` on or after `validFromYear` (when both given) | `400` |
| Either year on a `VARIABLE` holiday | `400` |
| Either year outside 1970–2100, fractional, or sent as a string | `400` |
| Same month and day as an overlapping fixed version | `409` |

The year bounds are the constants the calendar routes already used: a version
valid from a year no calendar can ask about would be a row nothing could return.
`@IsInt()` and not `@Type(() => Number)`, because these arrive in a JSON body
where `2026` and `"2026"` are genuinely different values — the opposite call
from the path parameters, where a segment is text by definition.

### Worked example

The scenario as described: Children's Day, 1 June, repealed after 2026, back in
2029 on a different day.

```http
POST /api/v1/public-holidays
{ "name": "Children's Day", "type": "FIXED",
  "startDate": "2020-06-01", "endDate": "2020-06-01" }

PATCH /api/v1/public-holidays/hol-old        ← repealed
{ "validToYear": 2026 }

POST /api/v1/public-holidays                 ← back, on the 5th
{ "name": "Children's Day", "type": "FIXED", "validFromYear": 2029,
  "startDate": "2029-06-05", "endDate": "2029-06-05" }
```

| Request | Answer |
| --- | --- |
| `GET /calendar/2026` | `hol-old`, `2026-06-01` |
| `GET /calendar/2027` | absent |
| `GET /calendar/2030` | `hol-new`, `2030-06-05` |

The second `POST` is accepted despite sharing 1 June's successor day with an
existing fixed holiday, because the ranges do not overlap.

## Frontend

No change — the directory is still empty. Worth noting for when it is built: the
administrative screen now edits *versions*, so "repeal" is a year input rather
than a toggle, and "the holiday came back" is a create rather than an edit. The
calendar screen is unaffected and gets more correct for free.

## Testing

| Spec | Covers |
| --- | --- |
| `public-holiday.service.spec.ts` | the range stored, defaulted to null, one-year versions, a range ending before it begins, either year rejected on a `VARIABLE` holiday; the overlap-aware duplicate rule in four configurations, the conflicting years named in the message, the range read alongside the day; the in-force SQL filter; the repeal-and-reinstate scenario end to end — 2026 on the old day, nothing in 2027, 2030 on the new one; `validToYear` patched, re-opened, and the other end preserved |
| `create-public-holiday.dto.spec.ts` | the range absent by default, accepted on a fixed holiday, and rejected as a string, fractional or out of range; `isActive` rejected as removed |
| `update-public-holiday.dto.spec.ts` | `validToYear` on its own, `null` re-opening an end, and the same rejections |
| `public-holiday-query.dto.spec.ts` | `?isActive=` rejected as removed |
| `public-holiday.controller.spec.ts` | the repeal body passed through unchanged |

Results: `npm run typecheck` clean, `npm test` 937 passed (57 suites, 172 of them
in this module), `npm run build` clean, `prettier --check` clean.

## Files Created

| File | Purpose |
| --- | --- |
| `backend/prisma/migrations/20260804160000_public_holiday_validity_years/migration.sql` | The two columns, and the drop |
| `FEATURES/019-public-holiday-validity-years.md` | This document |

## Files Modified

| File | Change |
| --- | --- |
| `backend/prisma/schema.prisma` | `validFromYear` / `validToYear` added, `isActive` removed |
| `backend/src/modules/public-holidays/public-holiday.service.ts` | Range resolution and merge, two new assertions, overlap-aware duplicate rule, in-force `yearFilter`, `describeOverlap` |
| `backend/src/modules/public-holidays/entities/public-holiday.entity.ts` | `isActive` → the two year columns |
| `backend/src/modules/public-holidays/dto/create-public-holiday.dto.ts` | `isActive` removed, range added |
| `backend/src/modules/public-holidays/dto/update-public-holiday.dto.ts` | Same, plus the repeal-versus-correction rule |
| `backend/src/modules/public-holidays/dto/public-holiday-query.dto.ts` | `?isActive=` removed |
| `backend/src/modules/public-holidays/dto/public-holiday-field.decorators.ts` | `IsPublicHolidayYear()` |
| The five specs above | Updated and extended |
| `FEATURES/HISTORY.md`, `FEATURES/README.md` | Feature 019 row |

## Notes

- The two versions of a holiday are not linked to each other. They share a name
  and nothing else, which is all the calendar needs; a `previousVersionId` would
  be a column nothing reads. Grouping a holiday's history is `?search=<name>` on
  the list endpoint.
- Nothing prevents a *gap* between versions, and nothing should: 2027 and 2028
  having no Children's Day is the fact being recorded.
- `occurrenceSpanIn` is unchanged. The range decides *whether* a version applies
  to a year, the projection decides *which day* — keeping the two apart is why
  this feature touched no date arithmetic.

## Future Improvements

- Expose a holiday's full history as one payload (versions ordered by year), if
  an administrative screen ever needs to show it as a timeline rather than as
  rows in a list.
- Guard against overlapping *gaps* being created by accident — a version added
  with a range that leaves a hole is legal and probably intended, but a warning
  in the UI would catch the typo case.
- The observance rule for a fixed holiday landing on a weekend, still open from
  Feature 017 and still belonging in the projection.
