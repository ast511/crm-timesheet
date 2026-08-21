# F09 — Public Holidays

## Goal

Replace the placeholder at `/app/team/settings/public-holidays` with a real CRUD
screen for `PublicHoliday`, built on the `DataTable` that F07 (Leave Types) and
F08 (Departments) already proved.

It is the third list page, and it deliberately adds two dimensions the two
before it did not have:

- **Dates.** The first screen in this application that renders and edits a date.
- **A type-conditional form.** The first form whose *fields* depend on one of its
  own values — `validFromYear` / `validToYear` exist only for a `FIXED` holiday,
  and the backend answers `400` if they are sent for a `VARIABLE` one.

Everything else is the sibling pattern, unchanged and uncopied: nothing about
sorting, pagination, responsiveness or search debouncing is re-implemented here.

## Requirements

- The list on the existing server-side `DataTable`: page, page size, sort,
  search and filters as query parameters, wired into the TanStack Query key.
- Sortable on `name` and `startDate` only — the backend's enum has three
  entries, and `createdAt` is deferred for the reason F06–F08 deferred it.
- Two server-side filters: `?type=` and `?isNational=`.
- Create / edit in one dialog form, with the FIXED/VARIABLE conditional encoded
  in Zod, not only in the rendering.
- Delete behind an `AlertDialog` confirmation.
- Calendar dates displayed in `ro-RO` with **no timezone day-shift**.
- Gated on the `PUBLIC_HOLIDAYS` resource; page metadata
  `TimeSheet | Sărbători legale`.

## UI / Components

The whole set mirrors `features/departments/`, one file per responsibility.

| Component | What it is |
| --- | --- |
| `PublicHolidaysTable` | The `DataTable` in a `Card`, with both filters in the filter slot |
| `usePublicHolidayColumns` | Column definitions, `sortKey` on two of them |
| `PublicHolidaySpan` | The *Dată* cell — the whole date decision lives here |
| `PublicHolidayBadges` | `PublicHolidayTypeBadge`, `PublicHolidayScopeBadge`, `PublicHolidayValidity` |
| `PublicHolidaysTypeFilter` / `PublicHolidaysScopeFilter` | The two toolbar selects |
| `PublicHolidayFormDialog` / `PublicHolidayForm` | One form for create and edit |
| `DeletePublicHolidayDialog` | The confirmation |
| `PublicHolidaysEmptyState` | Replaces the table when nothing is configured |
| `PublicHolidayCreateButton` | Button + dialog, gated, used in the header and the empty state |

### Columns

| Column | Sortable | Cell |
| --- | --- | --- |
| Denumire | `name` | The name, emphasised |
| Tip | — | `Fixă` / `Variabilă` badge |
| Dată | `startDate` | `PublicHolidaySpan` — see below |
| Interval ani | — | `Permanent` / `Din 2020` / `Până în 2026` / `2020 – 2026`, or `—` on a VARIABLE row |
| Aplicabilitate | — | `Națională` / `Companie` badge |
| … | — | The row menu (`hideOnCard`, `enableHiding: false`) |

`type` and `isNational` are not sortable and the backend agrees — its `sortBy`
enum has three entries. Ordering by a two-valued column groups rather than
sorts, and both of those columns have a *filter* instead, which is the control
somebody actually wants.

**`createdAt` is the third key the API accepts and is still not offered.** The
same deferral F06, F07 and F08 made: rendering an instant needs the company
timezone from `GET /api/v1/work-schedule`, which nothing reads yet. It does
**not** touch *Dată* — `startDate` and `endDate` are calendar dates, not
instants, which is precisely why this page can show a date column when the three
before it could not.

### Two new shared form primitives

Both go in `components/form/` rather than in the feature, because neither is
about holidays:

- **`FormDateField`** — `FormField` with `type="date"`. The native input, not a
  rendered calendar: it is keyboard-operable by segment, announced correctly,
  opens the OS picker on a phone, and needs no dependency. Critically, its value
  is `yyyy-MM-dd` — a day with no time and no zone.
- **`FormSelectField`** — a labelled `<Select>` over a closed list, with the
  label/error/`aria-invalid` wiring done once. `LeaveTypeIconField` was the
  first field of this shape and stayed in its feature because its options render
  as glyphs; this is the plain case, shared from the start rather than copied a
  third time.

## State & Data (TanStack Query)

`public-holidays-query.ts` is `departments-query.ts` with the names changed:
`queryOptions` keyed on the **resolved** query (so `search: ''` and
`search: '  '` share one entry), 30 s `staleTime`, and one
`PUBLIC_HOLIDAYS_QUERY_KEY` prefix that every write invalidates in full — a new
holiday sorts into whichever page its name falls on, and a retyped one leaves or
joins whatever `?type=` is showing.

`usePublicHolidays.ts` holds the suspense query and the three mutations. Where
each failure is reported follows the rule F07 set: **successes toast, failures
with an inline home are reported inline.** Neither form mutation toasts its
error — the form is still open and the message belongs beside the fields — and
the delete dialog stays open on failure rather than closing and leaving a toast
to explain a row that is still in the list.

## API Integration

`public-holidays-api.ts`. Every type comes from the generated OpenAPI contract:

- `PublicHoliday` = `components['schemas']['PublicHolidayEntity']`
- `CreatePublicHoliday` / `UpdatePublicHoliday` = the two DTO schemas
- `PublicHolidaysQuery` = `operations['PublicHolidayController_findAll_v1']['parameters']['query']`
- `PublicHolidaySortKey` = `PublicHolidaysQuery['sortBy']`, so a column can only
  offer a sort the backend accepts — a removed key is a compile error in
  `usePublicHolidayColumns` rather than a `400` on the first click
- `HolidayType` = `PublicHoliday['type']`

Endpoints used: `GET /public-holidays`, `POST`, `PATCH /{id}`,
`DELETE /{id}`. **The `calendar/{year}` and `calendar/{year}/{month}` endpoints
are deliberately unused** — they answer with `PublicHolidayOccurrenceEntity`, a
holiday resolved onto a particular year, which is what a calendar screen needs
and the opposite of what this one does. This screen edits the rule, not an
occurrence of it.

`DEFAULT_PUBLIC_HOLIDAY_SORT` is `name`, the backend's own default and the
surprising one for a list of dates. Its reasoning is inherited rather than
second-guessed: a `FIXED` holiday's stored year is whatever year the row was
entered for, so New Year saved as `2025-01-01` and Christmas as `2026-12-25`
would sort a year apart while describing the same twelve months.

Filters are omitted when unset rather than sent empty — `?type=` is not "any
type" to a validated enum, it is a `400`.

### Errors

`public-holiday-errors.ts`, and it emits **no error codes**, for the reason F07
and F08 documented: there is no `PUBLIC_HOLIDAY_*` in
`error-codes.constants.ts`, `PublicHolidayService` throws a bare
`ConflictException`, and the exception filter only assigns a code for a `500` or
a `BadRequestException`. A `409` therefore arrives with `errorCode: null`
(confirmed live — see Verification), and the generic fallback says "conflicts
with existing data", which tells nobody what to change.

Unlike departments, **this screen knows which rule refused it**, because the two
conflicts belong to the two types and the type is a field the person just chose:

- `FIXED` → another recurring holiday already falls on that month and day *in
  overlapping years*. Both halves are in the sentence, because the way out is
  usually a narrower validity range rather than a different day.
- `VARIABLE` → a holiday of that name already starts on that date.

The three service-level `400`s need nothing from this module: they are
`BadRequestException`s carrying a message array whose lines begin with the
offending property (`endDate must not be before startDate`), so they arrive as
an ordinary `VALIDATION_ERROR` and `rejectedFields` maps them onto the right
input unaided.

## Forms & Validation (react-hook-form + Zod)

`public-holiday-schemas.ts` — every bound is the backend's own: name ≤ 100,
description ≤ 500 with blank → `null`, years within 1970–2100.

### The type-conditional

The form hides `validFromYear` / `validToYear` when the type is `VARIABLE`, but
hiding a control is a rendering decision and this is a contract. So the schema's
**output is a discriminated union**: the `VARIABLE` branch has no such keys at
all.

```ts
values.type === 'VARIABLE'
  ? { ...shared, type: 'VARIABLE' }
  : { ...shared, type: 'FIXED', validFromYear, validToYear }
```

That makes "never send a validity range on a variable holiday" something the
type system enforces rather than something a component remembers — a stale value
left in the form after a type change has nowhere in the output to go. The form
*also* clears both inputs when `VARIABLE` is chosen, so the two do not disagree
when the type is switched back.

On `PATCH` the two omissions mean different things and both are wanted:
omitting the keys on a `VARIABLE` body lets `mergeFacts` clear the stored range,
which is what reclassifying a holiday should do; sending them on a `FIXED` body
— `null` included — is what lets a bound be re-opened, since an absent key would
leave the old one in place.

`isRecurring` is never sent. The backend derives it from `type` and rejects a
value that contradicts one, so stating it would be a second spelling of a fact
already in the body, with a `400` waiting if the two drift.

### Cross-field rules

`superRefine` mirrors the two the backend checks across fields, so they are
answered before a request rather than by one:

- `endDate` before `startDate` → error on `endDate`. `yyyy-MM-dd` sorts
  correctly as text, so the span needs no parsing to compare.
- `validToYear` before `validFromYear`, when both ends are stated and the type
  is `FIXED` → error on `validToYear`.

Both use `<`, so a one-day holiday (the same date at both ends) and a range
valid for exactly one year are allowed — as the backend allows them.

Each check is written so a single mistake produces a **single** message: an
empty date reports "choose a date" and not also "that is not a date", and `20`
in a year field reports "enter a four-digit year" and not also "out of range".

### Small conveniences

- Picking a start date fills an **empty** end date with it. Most holidays are
  one day, which this API spells as the same date at both ends; an already
  entered span is never overwritten.
- `useWatch` rather than `watch('type')`: the type drives which fields exist and
  is read on every render, and the subscription hook is a value the React
  Compiler can memoise around.
- The conditional fieldset enters and exits through `AnimatePresence`, honouring
  `prefers-reduced-motion` — an enter/exit is the thing CSS alone cannot do, and
  the motion says the section belongs to the choice above it.

## Dates (the first page with them)

The project has **no `date-fns` and no `date-fns-tz`** — the `Dates and times`
section of `CLAUDE.md` still describes them, but `package.json` carries neither
and `src/lib/datetime.ts` is a native-`Intl` helper built on `ro-RO` with an
explicit zone required by every signature. This feature used and extended that
helper rather than introducing a library. *(The stale section is noted under
Future Improvements.)*

Three functions were added to `datetime.ts`, the single date helper:

| Function | Result | For |
| --- | --- | --- |
| `formatCalendarDayMonth(iso)` | `01.01` | A `FIXED` holiday, whose year is not a fact |
| `toCalendarDateInput(iso)` | `2026-01-01` | Loading a stored date into the date input |
| `toCalendarDateIso(value)` | `2026-01-01T00:00:00.000Z` | Sending a picked date |

`formatCalendarDate` (already present) renders `01.01.2026`.

**No day-shift, by construction.** All formatting fixes the zone to `UTC` — the
zone these values were written in — because a holiday is a day on a calendar
rather than a moment, and rendering midnight UTC in any zone west of Greenwich
prints the previous day. `toCalendarDateIso` appends the suffix as *text* rather
than round-tripping through `Date`, so no zone is consulted at any point.
`formatDate` and the company timezone remain for instants such as `createdAt`.

**The year is shown only when the year is a fact.** `PublicHolidaySpan` prints a
`VARIABLE` holiday as `02.05.2027` — that row *is* one year — and a `FIXED` one
as `25.12`, because the year inside its `startDate` is whatever year the row
happened to be entered for. Printing it would invite a reader to conclude two
recurring holidays are a year apart, or to "correct" a year that means nothing.
A single-day holiday prints once rather than as `01.01 – 01.01`.

## Theming / i18n

A `publicHolidays` block in `ro` and `en` `common.json`, mirroring the
`departments` block: columns, flags, filters, form fields and hints, validation
messages, the two conflict sentences, toasts, the delete confirmation and the
empty state. `pages.settingsPublicHolidays` already existed and is reused.

Every badge draws its variant from theme tokens and carries a word as well as a
colour, so nothing depends on colour alone. Numbers in validation messages are
interpolated from the shared constants, so a translation and the rule it
describes cannot disagree about a bound.

## Routing

`settingsPublicHolidaysRoute` in `team.routes.tsx` swaps
`WorkspacePlaceholderPage` for `PublicHolidaysPage`. **The guard is unchanged at
`PUBLIC_HOLIDAYS.EDIT`, and that is not a slip.** Its siblings guard on their
resource's `PAGE_ACCESS`, but every employee holds
`PUBLIC_HOLIDAYS.PAGE_ACCESS` — that is the key that opens their own holiday
calendar at `/app/public-holidays`. Guarding this screen with it would put the
company's settings in front of the whole company. Maintaining the calendar is
the administrative act, which is exactly the distinction `TEAM_NAVIGATION`
already records for this item and for timesheets (`TIMESHEET.APPROVE`). Same
resource, the action that means "team screen".

Actions carry their own keys: `PUBLIC_HOLIDAYS.CREATE`, `.EDIT`, `.DELETE` — all
five actions are seeded for this resource.

## Files Created

- `src/features/public-holidays/public-holidays-api.ts`
- `src/features/public-holidays/public-holidays-query.ts`
- `src/features/public-holidays/public-holiday-schemas.ts`
- `src/features/public-holidays/usePublicHolidaySchemas.ts`
- `src/features/public-holidays/public-holiday-errors.ts`
- `src/features/public-holidays/usePublicHolidays.ts`
- `src/features/public-holidays/components/PublicHolidaysTable.tsx`
- `src/features/public-holidays/components/usePublicHolidayColumns.tsx`
- `src/features/public-holidays/components/PublicHolidaySpan.tsx`
- `src/features/public-holidays/components/PublicHolidayBadges.tsx`
- `src/features/public-holidays/components/PublicHolidaysTypeFilter.tsx`
- `src/features/public-holidays/components/PublicHolidaysScopeFilter.tsx`
- `src/features/public-holidays/components/PublicHolidayForm.tsx`
- `src/features/public-holidays/components/PublicHolidayFormDialog.tsx`
- `src/features/public-holidays/components/PublicHolidayRowActions.tsx`
- `src/features/public-holidays/components/DeletePublicHolidayDialog.tsx`
- `src/features/public-holidays/components/PublicHolidaysEmptyState.tsx`
- `src/features/public-holidays/components/PublicHolidayCreateButton.tsx`
- `src/components/form/FormDateField.tsx`
- `src/components/form/FormSelectField.tsx`
- `src/app/pages/PublicHolidaysPage.tsx`

## Files Modified

- `src/lib/datetime.ts` — three calendar-date functions added
- `src/routes/team.routes.tsx` — the real page replaces the placeholder
- `src/locales/ro/common.json`, `src/locales/en/common.json` — the
  `publicHolidays` block

## Verification

`tsc -b --force`, `eslint .` and `npm run build` all pass clean.

### Browser verification was NOT performed

`CLAUDE.md` requires the Playwright MCP before "done", and it says plainly that
a check which did not happen must not be reported as one. **The Playwright MCP
was not available in the session this feature was built in**, so the page has
not been opened in a real browser. The interactions still to be exercised are
the ones the rule lists: the "Coloane" menu opening, the responsive cards path
below `lg`, the date picker on a real control, the conditional fieldset
animating in and out, and the toasts.

What was done instead, so the claims above are not merely argued from the
contract:

**1. The live API, with the app running** (frontend `:5173`, backend `:3000`,
seeded — 5 holidays, including a multi-day `FIXED` (Crăciun 25–26.12), two
`VARIABLE` rows, and two `Ziua Copilului` versions with non-overlapping validity
ranges). Signed in as the seeded superadmin, every query this screen builds was
sent:

| Sent | Result |
| --- | --- |
| default state (`sortBy=name&sortOrder=asc&page=1&limit=20`) | 5 rows, `meta` as expected |
| `sortBy=startDate&sortOrder=desc` | correctly re-ordered across the set |
| `type=FIXED` / `type=VARIABLE` | 3 / 2 rows |
| `isNational=true` / `=false` | 5 / 0 rows |
| `search=Cră` | 1 row |
| `type=FIXED&isNational=true` | both applied together |
| `sortBy=isNational` | `400` — confirms why only three columns carry a `sortKey` |
| `isActive=true` (invented) | `400 property isActive should not exist` — confirms why unset filters are omitted |

**2. The write-path rules the conditional form exists for**, each sent as the
exact body the form produces:

| Sent | Result |
| --- | --- |
| `VARIABLE` carrying `validFromYear`/`validToYear` | `400 VALIDATION_ERROR` — the rule the schema's union prevents |
| `endDate` before `startDate` | `400`, line starts with `endDate` → maps to the field |
| `validToYear` before `validFromYear` | `400`, line starts with `validToYear` → maps to the field |
| duplicate `FIXED` day (25 Dec) | `409`, **`errorCode` absent** — confirms the coded-sentence approach |
| duplicate `VARIABLE` (name + start) | `409`, `errorCode` absent |
| create `FIXED` with `validFromYear: 2027, validToYear: 2031` | `201`, range stored, `isRecurring: true` derived |
| create `VARIABLE` with **no year keys** | `201`, `isRecurring: false` derived |
| `PATCH` `FIXED → VARIABLE` omitting the year keys | range cleared to `null` — the form's omission is correct |

Both probe rows were deleted afterwards; the list is back to its original five.

**3. The schema and the date helpers, executed** (headless, via `jiti`), under
`Europe/Bucharest` **and** `America/Los_Angeles`:

- `2026-01-01T00:00:00.000Z` renders as `01.01.2026` and `01.01` in **both**
  zones, and round-trips through the input value unchanged — no day-shift.
- `FIXED` outputs carry `validFromYear` / `validToYear`; `VARIABLE` outputs do
  not carry the keys **even when the inputs still hold values**.
- Every validation rule fires on the right field, with exactly one message per
  mistake.

## Notes

- The shared `DataTable` needed **no changes**. A date is a cell like any other,
  and the formatting decisions belong to `PublicHolidaySpan`. Two filters in the
  slot instead of one needed nothing either.
- This is the third page built from the same pattern, and the two features
  before it are what made it cheap: the only genuinely new thinking here was
  dates and the type-conditional.

## Future Improvements

- **Open the page in the Playwright MCP** and exercise the interactions listed
  above. This is the one acceptance criterion from `CLAUDE.md` that is
  outstanding.
- **`CLAUDE.md`'s `Dates and times` section is stale.** It prescribes `date-fns`
  and `date-fns-tz` and forbids `Intl.DateTimeFormat`; the project has neither
  library and `src/lib/datetime.ts` is built on `Intl` with a required explicit
  zone. The file should be corrected to describe what exists, or the libraries
  adopted — but not left saying one thing while the code does another.
- **`createdAt` as a column and a sort**, once something reads the company
  timezone from `GET /api/v1/work-schedule`. Carried over from F06–F08.
- **A `description` column**, hidden by default in the "Coloane" menu. It is
  editable in the form but invisible in the list today.
- **Coded `409`s from the backend** would delete `public-holiday-errors.ts`
  entirely, as it would `leave-type-errors.ts` and `department-errors.ts`.
- **The date input's display format follows the browser locale**, not `ro-RO`.
  The stored and rendered values are unaffected. A `ro-RO` calendar popover
  would fix the last inconsistency, at the cost of a dependency or a hand-built
  widget.
- **A calendar view** of the year, from the `calendar/{year}` endpoints — the
  employee-facing `/app/public-holidays` screen, not this one.
