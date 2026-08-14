# Feature 018 — Public Holiday Calendar Endpoints

**Status:** Completed
**Date:** 2026-08-04

## Goal

Answer the question the stored rows cannot answer directly: **which days is the
company closed in a given year, and in a given month.**

[Feature 017](017-public-holidays-module.md) stores holidays as *records*. A
fixed holiday's record carries whatever year it was first entered with — enter
Christmas once as `2025-12-25` and it is still `2025-12-25` in the table in 2031,
because the month and day are the fact and the year is noise. That is the right
way to store it and the wrong thing to hand a calendar view.

This feature adds the projection:

```http
GET /api/v1/public-holidays/calendar/2027       → every day closed in 2027
GET /api/v1/public-holidays/calendar/2027/5     → …narrowed to May
```

No database change. No new business rule. One computation — a stored month and
day re-anchored onto a year the caller named — plus the removal of a filter that
half-answered the same question.

## Requirements

- Holidays of one year, with fixed ones projected onto that year.
- The same, narrowed to one month.
- Both in date order, both active-only.
- No second way to ask a question that now has an answer.
- No value repeated back that the caller supplied in the URL.
- Reuse Feature 017's module, service and constants; reuse the Feature 006
  envelope and the global validation pipe.

## Design decisions

### The URL

Requested as `/calendar/2027` and `/month/2027/5`. Shipped as:

| | |
| --- | --- |
| `/public-holidays/calendar/:year` | the year |
| `/public-holidays/calendar/:year/:month` | the same calendar, narrowed |

One namespace instead of two, because the month is not a different resource — it
is the year's calendar with a narrower window. `/month/2027/5` would have made
`calendar` and `month` two words for one concept, each needing its own row in
the docs, its own tests and its own answer to "which one do I call". The nested
form says the relationship in the URL itself, which is the shape
[Feature 015](015-scoped-membership-endpoints.md) settled on for the same
reason.

### `?year=` was removed from `GET /public-holidays`

Feature 017 shipped a `?year=` filter on the list endpoint. It is gone.

It answered a *near*-miss of this question: it kept every fixed holiday and
bounded the variable ones by their stored start date. Useful-looking, and
subtly wrong for the thing people actually wanted — a caller asking `?year=2027`
got Christmas back reading `2025-12-25`, because the filter can select rows but
cannot re-date them. `/calendar/2027` returns `2027-12-25`.

Keeping both would have left two endpoints answering one question, one of them
with a date the caller has to correct by hand. The list endpoint keeps
`?search=`, `?type=`, `?isActive=` and `?isNational=` — those narrow *records*,
which is what that endpoint is for.

This changes behaviour shipped in Feature 017; that document is left as the
record of what was true at the time. `?year=` is now rejected as an unknown
parameter, with a `400`, because the global pipe runs with
`forbidNonWhitelisted` — a client still sending it is told, rather than silently
served an unfiltered page.

### Occurrences are a different resource from records

`PublicHolidayOccurrenceEntity` is not `PublicHolidayEntity` with fewer fields;
it is the answer to a different question, and three fields are deliberately
absent:

| Absent | Why |
| --- | --- |
| `isActive` | every occurrence returned is active — a repealed holiday is not a day the company is closed. A column that is `true` on every row is noise. |
| `isRecurring` | `type` already says it, and the API keeps the two in step. One fact, one field. |
| `year` / `month` | the caller put them in the URL. A response never repeats what was just supplied. |

`id` **is** kept — it is the record the occurrence was computed from, so a
calendar entry can be clicked through to `GET`, `PATCH` or `DELETE` without a
lookup by name.

### Neither endpoint is paginated or sortable

A year holds on the order of fifteen holidays. A page envelope around fifteen
rows is ceremony a client unwraps for nothing — the same call
[Feature 016](016-work-schedule-configuration.md) made for the approval-address
list. And a calendar has exactly one useful order, so a `?sortBy=` would be a
second way to ask a question that already has one answer.

The order is projected `startDate`, then `name` — a total order, so two holidays
landing on the same day come out the same way on every request.

### Active-only, and what that costs

Both endpoints read `isActive: true` only. That is right for the question — a
repealed holiday is not a day off — but it has a limit worth stating rather than
discovering: **`isActive` carries no date.** Asking for a past year returns
*today's* calendar projected onto it, not the calendar as it stood then. If
Children's Day was repealed in 2026, `/calendar/2024` will not show it, even
though the office really was shut that day.

Reconstructing a historical calendar would need the repeal to be dated, which no
requirement has asked for. Listed under *Future Improvements* rather than
guessed at.

## Backend

### The projection

[public-holiday-occurrence.entity.ts](../src/modules/public-holidays/entities/public-holiday-occurrence.entity.ts)
holds `occurrenceSpanIn(row, year)`, and the two types take opposite paths
through it:

- **`VARIABLE`** — not projected at all. The dates *are* the fact; a moving
  holiday recorded for 2026 says nothing about 2027, so a row whose start falls
  outside the year yields `null` rather than being dragged into it. This is why
  Easter is entered per year, and it is the same reason nothing in this project
  calculates it.
- **`FIXED`** — the month and day of `startDate` are re-anchored onto the
  requested year, and the span is carried over **by its length in days** rather
  than by its stored end. Carrying the length is what makes a holiday running
  from 31 December to 1 January come out as `2027-12-31 → 2028-01-01` instead of
  collapsing into a single year.

Two edge cases are handled rather than left to `Date`:

- **29 February in a common year.** `Date.UTC(2027, 1, 29)` does not fail — it
  rolls into 1 March. The projection checks the month it landed on and returns
  `null` instead: a day that does not exist in that year is not a day the
  company is closed, and putting the holiday on the wrong day is worse than
  omitting it.
- **A span crossing New Year**, as above.

Everything is computed in **UTC** on both sides, the same reasoning the fixed
duplicate check rests on: the columns are `timestamp` and a client posting
`2026-01-01` gets UTC midnight, so reading the local month and day would make
the projection depend on the server's timezone.

### The read

`findOccurrences(year)` narrows in SQL as far as SQL can express it and no
further:

```ts
where: { isActive: true, ...yearFilter(year) }
```

`yearFilter` is the helper Feature 017 wrote for `?year=`; it survives the
removal of that parameter because this is the query it was always right for.
Variable holidays belonging to other years never leave the database — that is
the half of the table which grows every year forever. Fixed holidays cannot be
filtered by year at all, which is the point of them, so they all come back and
the projection decides in TypeScript whether each has a day in this year.

### The month window

A holiday is included when its span **overlaps** the month, not merely when it
starts inside it: a holiday running from 31 December to 1 January closes a day in
each, and a December view omitting it would be wrong about a day the office is
shut.

`month` is one-based, as a person writes a date — `/calendar/2027/5` is May. The
conversion to `Date`'s zero-based months happens once, where the range is built.

One boundary is worth naming: an occurrence belongs to the year it **begins** in.
A fixed holiday starting 31 December 2026 appears in `/calendar/2026/12` and not
in `/calendar/2027/1`, even though it covers 1 January 2027. No real holiday
does this — 1 January holidays start on 1 January — and the alternative is
computing three years' occurrences for every request to serve a case that does
not exist.

### Path parameters

`YearParamsDto` and `MonthParamsDto` (the latter extending the former, so the
year's bounds are stated once) rather than `@Param('year', ParseIntPipe)`,
because the parameters need a *range* and not merely a type. `ParseIntPipe`
would accept `/calendar/0` and `/calendar/20227` and hand them to a query that
returns an empty calendar, which reads as "no holidays that year" rather than as
"that is not a year". Validated by the same global `ValidationPipe` everything
else goes through, so the rejection is the familiar `400` naming the parameter.

The bounds: year 1970–2100 (the constants Feature 017 already had), month 1–12.

### Route order

The two calendar routes are declared **before** `@Get(':id')`. Nest matches in
declaration order, and while `/calendar/2027` could not collide with a
one-segment `:id` anyway, relying on that would make the safety of these routes
a fact about how many segments they happen to have.
[routing.spec.ts](../src/modules/public-holidays/routing.spec.ts) checks
the resolution through a real HTTP request rather than trusting the comment —
the same technique [Feature 015](015-scoped-membership-endpoints.md) introduced.

## API

| Method | Path | Success | Returns |
| --- | --- | --- | --- |
| `GET` | `/public-holidays/calendar/:year` | 200 | `PublicHolidayOccurrenceEntity[]` |
| `GET` | `/public-holidays/calendar/:year/:month` | 200 | `PublicHolidayOccurrenceEntity[]` |

`400` for a year outside 1970–2100, a month outside 1–12, or either segment not
being a whole number.

```http
GET /api/v1/public-holidays/calendar/2027
```

```json
{
  "success": true,
  "data": [
    {
      "id": "clx…",
      "name": "New Year",
      "description": null,
      "type": "FIXED",
      "isNational": true,
      "startDate": "2027-01-01T00:00:00.000Z",
      "endDate": "2027-01-02T00:00:00.000Z"
    },
    {
      "id": "clx…",
      "name": "Easter",
      "description": null,
      "type": "VARIABLE",
      "isNational": true,
      "startDate": "2027-05-02T00:00:00.000Z",
      "endDate": "2027-05-03T00:00:00.000Z"
    }
  ]
}
```

Note the two dates: `New Year` is stored with whatever year it was entered for
and comes back as 2027; `Easter` comes back on the dates it was entered with,
because a variable holiday's dates are the fact.

The array sits under `data` untouched — the Feature 006 interceptor never
spreads an array into the envelope.

### Changed

| Endpoint | Before (Feature 017) | After |
| --- | --- | --- |
| `GET /public-holidays?year=2027` | fixed holidays with their stored year, plus that year's variable ones | `400` — unknown parameter |

## Database

No change. `schema.prisma` is untouched, no migration is required, and the
Feature 017 migration is unaffected.

## Frontend

No change — the directory is still empty. When a calendar view is built, these
are the two endpoints behind it: one request per rendered year or month, no
client-side date arithmetic, and no need for the client to know that a fixed
holiday's stored year is meaningless.

## Testing

| Spec | Covers |
| --- | --- |
| `public-holiday.service.spec.ts` (extended) | a fixed holiday re-anchored onto the requested year; a variable one left on its own dates; a variable one from another year dropped; ordering by *projected* date rather than by the year in the rows; a span carried across New Year; 29 February omitted in a common year and kept in a leap year; the active-only, year-narrowed read; the three absent fields; no pagination. For the month: one-based reading, a projected fixed holiday, an empty month, an overlapping span included, a neighbouring month excluded |
| `routing.spec.ts` (new) | `calendar` not shadowed by `:id`, both depths reaching their handler, an out-of-range year and a thirteenth month rejected at the route before the service is called, and no fourth segment |
| `month-params.dto.spec.ts` (new) | coercion, both boundaries of each parameter, the year rules inherited rather than restated, and the rejections — out of range, non-numeric, fractional, empty |
| `public-holiday.controller.spec.ts` (extended) | both calendar routes unwrapping their parameters and passing them in order |
| `public-holiday-query.dto.spec.ts` (updated) | `?year=` now rejected as an unknown parameter |

Results: `npm run typecheck` clean, `npm test` 911 passed (57 suites, 146 of
them in this module), `npm run build` clean, `prettier --check` clean.

## Files Created

| File | Purpose |
| --- | --- |
| `backend/src/modules/public-holidays/entities/public-holiday-occurrence.entity.ts` | The occurrence resource, its `select`, the projection and the mapper |
| `backend/src/modules/public-holidays/dto/year-params.dto.ts` | `:year`, with its range |
| `backend/src/modules/public-holidays/dto/month-params.dto.ts` | `:year/:month`, extending the above |
| `backend/src/modules/public-holidays/dto/month-params.dto.spec.ts` | Unit tests for both parameter DTOs |
| `backend/src/modules/public-holidays/routing.spec.ts` | Route resolution through real requests |
| `FEATURES/018-public-holiday-calendar-endpoints.md` | This document |

## Files Modified

| File | Change |
| --- | --- |
| `backend/src/modules/public-holidays/public-holiday.service.ts` | `findYear`, `findMonth`, `findOccurrences`; `yearFilter` re-pointed from the list `where` to the calendar read |
| `backend/src/modules/public-holidays/public-holiday.controller.ts` | The two calendar routes, declared before `:id` |
| `backend/src/modules/public-holidays/public-holiday.constants.ts` | Month bounds; the year bounds' doc now names the calendar route |
| `backend/src/modules/public-holidays/dto/public-holiday-query.dto.ts` | `?year=` removed, with the reason recorded |
| `backend/src/modules/public-holidays/public-holiday.service.spec.ts` | Year-filter tests replaced by the calendar suite |
| `backend/src/modules/public-holidays/public-holiday.controller.spec.ts` | Calendar route tests |
| `backend/src/modules/public-holidays/dto/public-holiday-query.dto.spec.ts` | `?year=` asserted as rejected |
| `FEATURES/HISTORY.md` | Feature 018 row |
| `FEATURES/README.md` | Feature 018 row |

## Notes

- Nothing was added to `src/common`. The projection is specific to how this
  module stores a holiday, and a `common/utils/calendar.util.ts` would have been
  a home for one caller.
- The occurrence type has no `PaginatedResult` wrapper and no `meta`. If a
  future consumer genuinely needs paging over a decade of calendars, that is a
  reporting feature with its own shape, not a parameter on this one.

## Future Improvements

- Date the repeal. A `repealedAt` (or a validity range) would let
  `/calendar/2024` reconstruct the calendar as it stood in 2024 instead of
  projecting today's. Worth doing the first time a report has to be correct
  about a past year.
- A `?from=&to=` range endpoint, if a consumer ever needs a window that is not a
  whole year or a whole month. Not written now: the two shapes asked for cover
  every screen that exists.
- Observance rules for a fixed holiday landing on a weekend — still the item
  Feature 017 listed, and this is the code it would change: the projection is
  now the single place a "moved to the following Monday" rule would apply.
