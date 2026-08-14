# Feature 031 — Reporting

**Status:** Completed
**Date:** 2026-08-07

## Goal

Five predefined reports, each generated on demand for a single `(month, year)`,
previewed as JSON and exportable as PDF or Excel.

This is the first module in the application that **owns no table and writes
nothing**. Every other feature configures something or records something; this
one reads what the previous thirty produced and renders it. That constraint is
the feature's shape rather than a limitation of it.

**Nothing is stored.** No report row, no generated file on disk, no cache. Each
request recomputes from live data, a preview returns a structured JSON model, and
an export streams a freshly generated file that is discarded when the response
ends.

**Not included, and deliberately:** an asynchronous job pipeline, a
`@RequirePermission()` guard or any wiring into the permission system,
authentication, any change to how timesheets or leave record data, "Cod
subproiect" (which does not exist in this application), a sixth report type, and
any frontend.

## Requirements

- Five fixed reports, each for one month, each with a KPI header, a grid and —
  where it uses markers — a legend.
- One builder per report producing a typed data model, feeding **three**
  renderers: JSON, Excel, PDF.
- Preview and both exports of the same report showing identical numbers, by
  construction rather than by discipline.
- Reports 1 and 5 sharing one aggregation, computed once.
- Day classification taken from the existing working-days service, public
  holidays and approved leave — never reimplemented.
- Hour totals computed with Prisma aggregation, never by loading entries.
- Synchronous generation, with a documented cap and a documented threshold.
- Administrative roles only, enforced as a domain rule in the service.
- The caller taken from `@CurrentUser()`; no user hardcoded.
- Controllers thin, rules in the services, Prisma nowhere in this module.

## Decisions taken before implementation

Five points where the specification met the existing schema and the difference
had to be settled rather than guessed at. The first two were put to the user and
answered before any code was written.

### 1. Leave markers are configuration — `LeaveType.reportMarker` was added

The specification asked reports 2, 3 and 4 to count **medical** days separately
from ordinary leave, and to print `C` for leave and `M` for medical on the grids.
`LeaveType` had no flag saying a type is medical: only `code`, `label`,
`requiresApproval`, `isPaid` and `defaultAllocatedDays`.

Three ways to answer were put to the user:

| Approach | Why not |
| --- | --- |
| A `MEDICAL_LEAVE_TYPE_CODES` set in the reporting module | Hard-codes a fact about leave types inside a feature that only reads them; a type added later is invisible or collides |
| Derive from `requiresApproval === false` | The schema comment does say medical leave is "notified, not requested" — but any future no-approval type (bereavement, jury duty) would silently be reported as medical |
| A column on `LeaveType` | A schema change in a feature specified as read-only |

**Decision (user's):** the third, and wider than the question asked. There is no
fixed medical-versus-leave split at all. `LeaveType` gains a `reportMarker` — one
to three characters, unique across leave types — and **every** report uses it:

- each leave day prints its own type's marker;
- report 2 has one **dynamic column per leave type that occurs in the period**,
  not a fixed pair of leave/medical columns;
- the legend on reports 3 and 4 is built from the types that actually occur;
- a leave type added later appears automatically, with no code change anywhere.

The non-leave classes stay fixed, because they are facts about the calendar
rather than rows somebody configures — see [Day classification](#day-classification).

See [the Feature 021 amendment](021-leave-configuration.md#amended-by-feature-031--reportmarker).

### 2. Report 5 is **not** the transpose of report 1

The specification called report 5 "the TRANSPOSE of Report 1" and then described
the same rows and columns as report 1 in the next clause. The first
implementation reading took "transpose" literally — employees down the side,
projects across the top.

**Decision (user's), from the reference designs:** both reports put **projects in
rows and employees in columns**. They are the same matrix. What differs is the
presentation and which total the reader is meant to land on:

| | Report 1 | Report 5 |
| --- | --- | --- |
| Rows | projects, **banded under each client** | projects, **flat** |
| Client | a full-width group band | an ordinary column |
| Identity columns | `Nume Proiect`, `COD Proiect` | `Proiect`, `Client` |
| Employee column sub-label | the department code | the employee code |
| Right-hand total | `Total Ore` per project | `Total` per project |
| Bottom total row | `TOTAL GENERAL` | `Total per angajat` |
| KPIs | four | five — plus average per project |

Report 1 is read **across** — what did this project cost, and who worked on it.
Report 5 is read **down** — what did this person do with their month. The
`describe('and differ only in presentation')` block in
`project-employee-hours.aggregator.spec.ts` pins every row of that table.

### 3. There is no `Team` and no `Client` — `departmentId` and `clientName`

The specification asked for `teamId` and `clientId` filters.

**No `Team` model exists** anywhere in this project. `Employee` belongs to a
`Department` and a `Position`. The filter is `departmentId`, which is the call
Feature 029 makes naming its permission resource `DEPARTMENTS` and Feature 030
makes with its timesheet filter.

**No `Client` model exists either.** `Project.clientName` is a required text
column — it is what report 1 bands by and what report 5 prints in its second
column. So the filter is `clientName`, compared exactly and case-insensitively.
A `clientId` would name a resource nothing could look up.

The same reasoning removes **"Cod subproiect"**, which appears in the reference
designs: this application has no sub-project, and a column that could only ever
be empty invites somebody to fill it.

### 4. The company timezone applies to instants, **not** to calendar dates

The specification asked for day-level grouping "by the company timezone … NOT the
server's local zone and NOT raw UTC slicing", and noted that the schema stores
calendar dates at UTC midnight.

Those two statements pull in opposite directions, and getting it wrong is the
most damaging bug this feature could ship. The resolution:

- **A calendar date is not an instant.** `TimesheetEntry.date`,
  `LeaveRequest.startDate`/`endDate` and a holiday's span hold a *calendar day* at
  UTC midnight, because a client posted `2026-09-07` and the time of day is
  padding rather than data. Passing `2026-09-07T00:00Z` through
  `America/New_York` yields **the 6th** — so every such day would shift one column
  left on every grid. These are read with UTC accessors, which is what
  `toDateKey` and `weekdayOf` already do.
- **`updatedAt`, `submittedAt` and `reviewedAt` genuinely are instants**, and
  which calendar day they belong to genuinely depends on where the company is. A
  timesheet submitted at `2026-09-07T22:30Z` was submitted on the 8th in
  Bucharest.

So the company zone **is** read, from the Work Schedule singleton through
`WorkScheduleService.findTimezone()`, and it is applied where it is correct: the
`Ultima modificare` column of report 2. It is reported on `period.timezone` in
every preview and printed on every export, so a reader knows which clock was
used. `toZonedDateKey` was added to `common/utils/date.util.ts` and its
documentation states both halves of the rule.

Two tests pin it: a calendar day stays in its own column under
`America/New_York`, and an instant at `22:30Z` renders as the following day in
`Europe/Bucharest`.

### 5. `WorkingDaysService` is exported — and the calculator gained two methods

Day classification needs to tell a **holiday** from a **non-working weekday** —
the attendance sheet prints `S` on one and `L` on the other. `isWorkingDay`
conflates them (`weekday is worked && not a holiday`), which is right for counting
a leave span and useless here.

Rather than expanding holiday spans a third time in a third module, the existing
calculator gained `isWorkingWeekday` and `isPublicHoliday`, with `isWorkingDay`
now visibly derived from them. No existing caller changed, and the reporting
module reads holidays through `WorkingDaysService` — which is why
`PublicHolidayModule` is deliberately **not** among its imports.

`LeaveRequestsModule` had to **export** `WorkingDaysService` for that, which it
had explicitly declined to do until there was a second caller — "exporting it
before there is a second caller would be guessing at what that caller needs". The
guess would in fact have been wrong: reporting needed not the counting but the
two facts underneath it, which is why the export and the two new methods arrived
together.

**This was found at boot rather than by the test suite, and that gap is now
closed.** Every other spec in this feature substitutes its collaborators — which
is what makes the builders and the classifier testable without a database — so a
provider that is injected but not exported by the module that owns it looks
correct to all of them. `npm run build` does not catch it either: TypeScript
resolves the import, and only Nest's injector discovers the missing export.
`reporting.module.spec.ts` now compiles the **real** graph, with no substitutes
but the database, and reproduces the exact `UnknownDependenciesException` if the
export is removed.

## Backend

### Files created

```text
src/modules/reporting/
├── reporting.module.ts                 five imports, four providers, one controller
├── reporting.constants.ts              the five keys, the day classes, the caps, the source notes
├── reporting.types.ts                  the seam between the I/O half and the pure half
├── reporting.controller.ts             GET /reports, preview, export — thin
├── reporting.service.ts                access check, dispatch, sourcing → builder → renderer
├── reporting-source.service.ts         every query, and day classification
├── builders/
│   ├── project-employee-hours.aggregator.ts   the matrix reports 1 and 5 share
│   ├── project-hours-per-employee.builder.ts  report 1
│   ├── employee-hours-per-project.builder.ts  report 5
│   ├── timesheet-status.builder.ts            report 2
│   ├── attendance-sheet.builder.ts            report 3
│   ├── leave-calendar.builder.ts              report 4
│   └── report-cells.ts                        cell construction and legend building
├── renderers/
│   ├── report-data-model.ts            the typed model all three renderers read
│   ├── excel.renderer.ts               model → xlsx buffer
│   └── pdf.renderer.ts                 model → pdf buffer
└── dto/
    ├── report-query.dto.ts             month, year and the four filters
    ├── export-query.dto.ts             ?format=pdf|excel
    ├── report-type-params.dto.ts       :reportType, validated against the five
    └── reporting-field.decorators.ts
```

Each file, and what it is for:

| File | Responsibility |
| --- | --- |
| `reporting.module.ts` | Registers four providers and one controller; imports the five modules whose data a report reads. Exports nothing — nothing reads a report. |
| `reporting.constants.ts` | The five report keys, the two formats, month/year bounds, the population caps, the fixed day classes and their markers, the per-report source notes and the month names. **Contains no leave marker** — every one of those is configuration. |
| `reporting.types.ts` | `ReportEmployee`, `ReportProject`, `ClassifiedDay`, `ClassifiedMonth` and friends: the vocabulary the source service produces and the builders consume. A file of its own because both sides depend on it. |
| `reporting.controller.ts` | Three routes, each a one-line delegation. The export sets its own headers and returns a `StreamableFile`. |
| `reporting.service.ts` | The access check, the dispatch on report type, and the wiring from sources through a builder to a renderer. Does no arithmetic. |
| `reporting-source.service.ts` | Every query in the feature, the day classification, and the population caps. |
| `builders/project-employee-hours.aggregator.ts` | The `project × employee` matrix, folded once from the grouped rows. |
| `builders/*.builder.ts` | One per report; each a **pure function** from resolved inputs to a data model. |
| `builders/report-cells.ts` | Cell construction, hour formatting, the client badge, and `buildLegend` — the function the dynamic-marker rule lives in. |
| `renderers/report-data-model.ts` | The typed model: KPIs, columns, rows, cells, legend, orientation, source note. |
| `renderers/excel.renderer.ts` | Model → `xlsx`, in memory. Numeric cells stay numeric. |
| `renderers/pdf.renderer.ts` | Model → PDF, in memory. Landscape, repeating headers, unbroken rows. |
| `dto/*.dto.ts` | The three request shapes. |

### Files modified

| File | Change |
| --- | --- |
| `prisma/schema.prisma` | `LeaveType.reportMarker` — one column, no new model; plus `@db.Timestamptz(3)` on the 53 instant columns and the convention block explaining the split — see [the Feature 003 amendment](003-prisma-orm-setup.md#amended-by-feature-031--timestamptz-for-instants) |
| `prisma/migrations/20260807160000_add_leave_type_report_marker/` | Add, backfill, tighten, index |
| `src/app.module.ts` | Registers `ReportingModule` with an explanatory comment |
| `src/common/utils/date.util.ts` | Adds `toZonedDateKey` (the ISO key), `toZonedDate` and `toZonedTimestamp` (the localised display forms), and states the calendar-date/instant rule |
| `src/common/interceptors/response.interceptor.ts` | Passes a `StreamableFile` through unwrapped |
| `src/modules/leave-configuration/leave-types/*` | `reportMarker` through the constants, decorator, both DTOs and the entity |
| `src/modules/leave-configuration/leave-types.service.ts` | `reportMarker` on create/update; `assertCodeAndLabelAreFree` → `assertUniqueFieldsAreFree`, now three fields |
| `src/modules/leave-requests/leave-requests.service.ts` | `findApprovedForEmployeesInSpan` and `ApprovedLeaveSpan` |
| `src/modules/leave-requests/working-days.service.ts` | `isWorkingWeekday` and `isPublicHoliday` on the calculator |
| `src/modules/leave-requests/leave-requests.module.ts` | Exports `WorkingDaysService` |
| `src/modules/timesheet-management/timesheet.service.ts` | Three reporting reads and their row types |
| `src/modules/timesheet-management/timesheet-management.module.ts` | Exports `TimesheetService` |
| `src/modules/employees/employee.service.ts` | `findForReporting`, `EmployeeReportRow`, `EmployeeReportFilter` |
| `src/modules/projects/project.service.ts` | `findForReporting`, `ProjectReportRow`, `ProjectReportFilter` |
| `backend/package.json` | `exceljs`, `pdfmake`, `@types/pdfmake` |

## Aggregate once, render three ways

The architecture, and the reason preview and export can never disagree.

```text
  sources          builder              data model            renderers
  ───────          ───────              ──────────            ─────────
  timesheets  ┐                                          ┌─► JSON   (the model *is* the response)
  leave       ├─►  pure function  ─►  ReportDataModel  ───┼─► Excel  (formats)
  holidays    │                                          └─► PDF    (formats)
  employees   │
  projects    ┘
```

**One builder per report produces one data model.** That model is *presentation
complete*: rows are already in final order, group bands and total rows are
already in the list, and every cell already carries both its machine value and
the text a renderer should print.

**A renderer only formats.** There is no `SUM` in either renderer, no re-sorting,
no filtering, and no branch on which report is being drawn beyond the layout
hints the model carries. The Excel renderer writes a number cell's `value` so the
column can be summed in the spreadsheet; the PDF renderer writes the same cell's
`text`. Neither invents or loses a figure.

Why this matters more here than elsewhere: **an export that quietly disagrees
with the screen it was downloaded from is worse than one that fails**, because
somebody forwards the file. Three renderers each doing their own arithmetic would
eventually round a total differently, and nothing would catch it. Here the parity
test is a real assertion — one model, three outputs, the same numbers — rather
than a hope.

The `data model` layer also makes each piece testable in isolation: a builder is
a pure function with no database, and a renderer is a pure function of a model.

## The five reports

All five are for one `(month, year)`. Every one states on its face which
timesheet states it counted, via `sourceNote`.

### Report 1 — `project-hours-per-employee`

*Centralizator ore proiect per angajat.*

Rows are projects **banded under their client**; columns are employees. Last
column is the project's total; last row is `TOTAL GENERAL` per employee.

- **Columns:** `Nume Proiect`, `COD Proiect` (the real `Project.code`), one per
  employee sub-labelled with their **department code**, then `Total Ore`.
- **KPIs:** total employees, total projects, total hours, average hours/employee.
- **Source:** `APPROVED` timesheets only, `WORK` entries only.
- Landscape.

### Report 2 — `timesheet-status`

*Centralizator stare timesheeturi.*

One row per employee: name, year, month, status, last modified, and the day
breakdown.

- **Status labels:** `DRAFT` → *Ciornă*, `SUBMITTED` → *În așteptare*,
  `APPROVED` → *Aprobat*, `REJECTED` → *Respins*. An employee with **no
  timesheet** is *Fără timesheet* — not a fifth status and not blank, because
  "this person has not opened their month" is the most actionable line on the
  report.
- **Day columns:** one **dynamic column per leave type occurring in the period**,
  headed by that type's `reportMarker` and sub-labelled with its full name; then
  `Total concedii`, `Sărbători`, `Zile libere`, `În afara angajării`,
  `Zile lucrătoare`, `Total zile`.
- **Invariant:** `concedii + sărbători + libere + în afara angajării + lucrătoare
  = zilele lunii`, per employee. Asserted by test.
- **KPIs:** total timesheets, approved, pending, rejected.
- **Source:** **every** timesheet state, since the state is what it reports.
- Portrait — the one report narrow enough to read upright.

### Report 3 — `attendance-sheet`

*Foaie colectivă de prezență.*

Rows are employees, columns are the days of the month, last column is total
hours.

- A **worked day** shows `09:00-18:00` and the hours. **The clock times come from
  the Work Schedule, not from the timesheet** — this application records hours per
  day, never a start and an end, so the window printed is
  `workStartTime`–`workEndTime` and the hours beside it are the real approved
  total. Inventing an end time from the hours would be the report making up a fact
  nobody recorded.
- A **non-worked day** shows its marker. A day of half-day leave that also carries
  work shows **both** — `C 4h` — rather than choosing.
- **Legend** built from the markers actually used.
- **Source:** `APPROVED` timesheets only.
- Landscape.

### Report 4 — `leave-calendar`

*Situații lunare concedii angajați.*

Rows are employees, columns are days. Per-employee absence total, and a
`Total pe zi` row — how many people are away on the 14th, which is what this
report is actually consulted for.

- **It reads no timesheet at all.** Absence is settled by an approved leave
  request and a public holiday, both known in advance. Gating it on timesheet
  approval would make next month's calendar permanently empty — and next month is
  exactly when somebody plans cover.
- An ordinary working day is **blank**, not marked: the grid exists to make
  absence visible, and a marker on every Tuesday would bury the days that matter.
- The per-day total counts leave only, not holidays and weekends — everybody is
  absent on a Sunday, and a row reading "13" every weekend would drown the number
  somebody is looking for.
- Landscape.

### Report 5 — `employee-hours-per-project`

*Centralizator ore utilizator per proiect.*

The same matrix as report 1, presented and totalled the other way. See
[decision 2](#2-report-5-is-not-the-transpose-of-report-1) for the full
difference table.

- **Columns:** `Proiect`, `Client`, one per employee sub-labelled with their
  **employee code**, then `Total`.
- **Rows:** flat, no client bands. Bottom row `Total per angajat`.
- **KPIs:** five — the four above plus **average hours/project**.
- **Source:** `APPROVED` timesheets only, `WORK` entries only.
- Landscape.

## The shared aggregator

Reports 1 and 5 are one computation. `toProjectEmployeeHours` folds the grouped
hour rows into a matrix exposing `cell`, `projectTotal`, `employeeTotal` and
`grandTotal`, and both builders read it.

Written twice, the two would drift the first time somebody fixed a rounding rule
in one of them — and the failure would be invisible: two documents about the same
month that quietly disagree, each internally consistent. Because there is one
computation, the reconciliation test is meaningful:

- the sum of per-project totals equals the grand total;
- the sum of per-employee totals equals the grand total;
- the sum of every cell equals the grand total;
- report 1 and report 5 report the same grand total, the same KPI, the same
  per-project totals, the same per-employee totals and the same value in every
  cell.

**Two asymmetries, both deliberate:**

- **An employee with no hours keeps their column**, with dashes and a total of
  zero. The employee axis is the population being reported on, and "Maria booked
  no hours in September" is the finding; dropping her would read as though she had
  not been asked.
- **A project with no hours is dropped.** A company accumulates projects for
  years, and a grid with three hundred empty rows is unreadable. The project axis
  is what people did, not who they are.

## Day classification

One classifier, in `ReportingSourceService.classifyMonth`, feeding reports 2, 3
and 4. Three builders each asking "was the 25th a holiday" would eventually give
three answers.

**Precedence, and it matches Feature 030's fill-in engine exactly** — a report
that classified days differently from the module that recorded them would show
hours on days the timesheet said could not carry any:

| Order | Class | Marker | Rule |
| --- | --- | --- | --- |
| 1 | `NOT_EMPLOYED` | `·` | Outside `[hireDate, terminationDate]`. Somebody who joined on the 12th was not *absent* on the 5th. |
| 2 | `NON_WORKING` | `L` | The weekday is not in `WorkSchedule.workingDays`. Beats a holiday: a company that does not work Sundays does not observe one falling on a Sunday. |
| 3 | `HOLIDAY` | `S` | A public holiday on a working weekday. Beats leave — nobody spends allowance to be absent from a day the office was shut. |
| 4 | `LEAVE` | `LeaveType.reportMarker` | Approved leave. **Keeps the hours**, so a half day shows marker and work. |
| 5 | `WORKED` | — | A working day with approved hours. |
| 6 | `EXPECTED` | — | A working day with nothing recorded. |

The classes are **mutually exclusive and total**, which is what lets report 2
assert its counts sum to the length of the month.

**Single source of truth for each input:**

| Fact | Where from |
| --- | --- |
| Which weekdays are worked | `WorkingDayCalculator.isWorkingWeekday` — from `WorkSchedule.workingDays` |
| Which days the company is closed | `WorkingDayCalculator.isPublicHoliday` — from `PublicHolidayService.findYear` |
| Which days are absence, and of what kind | `LeaveRequestsService.findApprovedForEmployeesInSpan` |
| The marker a kind of absence prints | `LeaveType.reportMarker` |
| Which days carry hours | `TimesheetService.findApprovedDailyHours` |
| The employment window | `EmployeeService.findForReporting` |

**There is no weekend rule.** Feature 030 established that "not loggable" means
"not in `workingDays`", so `NON_WORKING` is one class covering both weekend and
free day — `L` for *liber*. Splitting it would require this module to invent
which of the two a Saturday is.

## Timezone

Stated in full on [decision 4](#4-the-company-timezone-applies-to-instants-not-to-calendar-dates)
and in the documentation of `toZonedDateKey`. In short:

- **Calendar-date columns** (`TimesheetEntry.date`, leave spans, holidays) are
  read with UTC accessors and never passed through a zone.
- **Instant columns** (`updatedAt`) are rendered in the company zone, read via
  `WorkScheduleService.findTimezone()`.
- The zone is reported on `period.timezone` and printed on every export.
- Reporting introduces **no timezone configuration of its own**.

## The JSON preview contract

`POST /api/v1/reports/:reportType/preview` returns the data model, wrapped by the
Feature 004 interceptor as `{ "success": true, "data": … }`. Every report has the
same envelope; only `columns`, `rows`, `kpis` and `legend` differ.

```jsonc
{
  "reportType": "attendance-sheet",
  "title": "Collective attendance sheet",
  "romanianTitle": "Foaie colectivă de prezență",
  "subtitle": "Prezența pentru 13 angajați, 30 zile",
  "period": {
    "month": 9, "year": 2026,
    "label": "September 2026",
    "key": "2026-09",
    "timezone": "Europe/Bucharest"
  },
  "generatedAt": "2026-10-01T08:00:00.000Z",
  "orientation": "landscape",
  "sourceNote": "Source: APPROVED timesheets only. …",

  "kpis": [
    { "key": "totalEmployees", "label": "Total Angajați", "value": 13, "unit": "angajați" }
  ],

  "columns": [
    { "key": "employee",   "label": "Angajat", "sublabel": null,  "type": "text",   "isTotal": false },
    { "key": "2026-09-01", "label": "1",       "sublabel": null,  "type": "marker", "isTotal": false },
    { "key": "total",      "label": "Total ore","sublabel": null, "type": "number", "isTotal": true }
  ],

  "rows": [
    {
      "key": "emp-1",
      "kind": "data",          // "data" | "group" | "total"
      "label": "Ion Popescu",
      "badge": null,           // a client band's short badge, e.g. "TEC"
      "cells": {
        "employee":   { "kind": "text",   "text": "Ion Popescu" },
        "2026-09-01": { "kind": "number", "value": 8, "text": "09:00-18:00\n8h" },
        "2026-09-05": { "kind": "marker", "marker": "L", "text": "L",
                        "legendKey": "class:NON_WORKING" },
        "2026-09-07": { "kind": "marker", "marker": "C", "text": "C",
                        "legendKey": "leave:lvt-1" },
        "total":      { "kind": "number", "value": 168, "text": "168h" }
      }
    }
  ],

  "legend": [
    { "key": "leave:lvt-1",      "marker": "C", "label": "Annual Leave" },
    { "key": "class:NON_WORKING","marker": "L", "label": "Free / non-working day" }
  ]
}
```

**How a client renders this without knowing which report it asked for:**

- Draw the KPI strip from `kpis`.
- Draw a header from `columns`, using `sublabel` as a second line.
- Walk `rows` in order. `kind: "group"` is a full-width band showing
  `badge` + `label`; `kind: "total"` is emphasised; `kind: "data"` is ordinary.
- For each row, look up `cells[column.key]` and switch on `kind`: `text` prints
  `text` (`null` is blank), `number` prints `text` and sorts by `value`, `marker`
  prints `marker` and links to `legend` by `legendKey`.
- Draw the legend only if `legend` is non-empty.
- `orientation` is a hint for print styling.

**A missing cell is legal**: a group band has `cells: {}`, and a client treats an
absent key as blank.

## Export flow

`POST /api/v1/reports/:reportType/export?format=pdf|excel`.

1. The same builder runs over the same sources as the preview. **It regenerates
   from live data** and does not depend on a preview having been called — there is
   nothing to carry between them and no state to go stale in the gap.
2. The renderer produces a `Buffer` **in memory**. No temporary file is created at
   any point, so nothing has to be cleaned up and a crashed request leaves nothing
   behind.
3. The controller sets `Content-Type`, `Content-Disposition: attachment;
   filename="…"` and `Cache-Control: no-store`, then returns a `StreamableFile`.

**Filename convention:** `<reportType>_<YYYY-MM>.<ext>` —
`attendance-sheet_2026-09.xlsx`, `leave-calendar_2026-09.pdf`. The period comes
from the *model* rather than from the query, so the name can never describe a
month other than the one inside the file.

**The one response that is not the success envelope.** `ResponseInterceptor` was
taught a single exception: a `StreamableFile` passes through unwrapped. Wrapping
one would serialise the stream into `{"success":true,"data":{}}` and send it with
a `Content-Type` promising a spreadsheet — a corrupt download rather than a
differently-shaped response. The carve-out is tied to a Nest type only a file
response can produce, so no ordinary handler can escape the envelope by accident.

### Libraries chosen

| Library | Why |
| --- | --- |
| **ExcelJS** | The only maintained library in this ecosystem that writes a *real* `xlsx` — typed cells, frozen panes, column widths — **to a buffer**. Lighter CSV-shaped writers cannot express a frozen header or a numeric cell, and both matter: a spreadsheet whose hour cells are strings looks correct and silently returns zero from `SUM`. |
| **pdfmake** | Declarative layout. A table is a table, with `headerRows` that repeat on every page and `dontBreakRows` that keeps a row whole. pdfkit — the other candidate — is an imperative cursor that would have meant measuring text, tracking a y-position and implementing page breaks by hand for five fixed grids, three of them 31 columns wide. |

**Roboto rather than the PDF standard-14 fonts**, and this is not cosmetic:
Helvetica and its siblings are WinAnsi-encoded, which is Latin-1 and has no `ă`,
no `ș` and no `ț`. Every report has a Romanian title. pdfmake ships Roboto, which
covers Latin Extended-A, and the path is resolved through `require.resolve` so it
survives pnpm, hoisting and bundling.

Excel specifics: title block, KPI rows, **two frozen header rows**, first column
frozen, numeric cells as numbers, per-report sheet name (sanitised and truncated
to Excel's 31-character limit), group bands and total rows in bold, legend below
the grid.

PDF specifics: landscape for the four grid reports, portrait for the status
summary; repeating headers; unbroken rows; the legend on reports 3 and 4; the KPI
strip; a footer naming the report, the period and the page number.

## Synchronous generation, caps and the threshold

**Generation is synchronous**: the request computes and returns within its own
lifecycle. At this scale that is the right call — a month of a few dozen
employees is a handful of queries and a document built in well under a second,
and an asynchronous pipeline would mean a job table, a poll endpoint, a temporary
store and signed download URLs: four moving parts to remove a wait nobody
notices.

**Caps**, enforced in `ReportingSourceService` and answered as a `400` naming the
cap and the filters that narrow past it:

| Cap | Value | Why |
| --- | --- | --- |
| `REPORT_MAX_EMPLOYEES` | 500 | A 500 × 31 grid is ~15,000 cells — under a second to render, and a PDF somebody can still open |
| `REPORT_MAX_PROJECTS` | 500 | One column (or row) per project; thousands of archived projects would produce a spreadsheet nobody can scroll |

A `400` rather than a slow `200`, because a request that merely took two minutes
would look like a broken server rather than one that should have been scoped.

**Threshold, recorded and not built.** Beyond roughly a few hundred employees
across a full month — or if the caps ever need raising — a synchronous export
becomes slow enough to matter, and the next step is an asynchronous pipeline:
enqueue a generation job, return a job id, poll for completion, and hand back a
temporary signed download URL. That needs a job table, a worker, an expiry policy
and a cleanup schedule, and **none of it is built here**.

## Access

**Only `SUPERADMIN`, `ADMIN` and `HR` may generate a report**, checked by
`assertReportingAccess` using the shared `isAdministrativeRole`, and answering
`403`.

**A domain rule in the service, not a guard and not the permission engine.** A
report is a company-wide document: the attendance sheet lists everybody's
absences and the hour matrices state what each colleague spent their month on.
"These are administrative documents" is what they *are*, in the same way that "an
administrator reviews a timesheet somebody else filled in" is what a timesheet is
— it would be true under any permission system.

Feature 029 built the permission catalog and enforces none of it, because
enforcement needs authentication first; Feature 030 followed that and so does
this. No `@RequirePermission()`, no guard, no wiring. When authentication lands
this check stays exactly as it is, with a guard added in front of it.

A `403` rather than a `404`, because the endpoint plainly exists and hiding it
would send somebody looking for a typo instead of for the role they lack.

## Database

### Column added

| Model | Column | Notes |
| --- | --- | --- |
| `LeaveType` | `report_marker VARCHAR(3)` | `NOT NULL`, `UNIQUE`. See [decision 1](#1-leave-markers-are-configuration--leavetypereportmarker-was-added) |

**No new model, no new table.** Reporting reads existing data.

### Migration — **not yet applied**

Per CLAUDE.md the schema is written and validated (`prisma validate` passes,
`prisma generate` has run) and the migration awaits explicit approval:

```bash
cd backend
npx prisma migrate dev
```

The migration is at
`prisma/migrations/20260807160000_add_leave_type_report_marker/migration.sql`.

**It is hand-authored, and it has to be.** The column is `NOT NULL` and `UNIQUE`
and `leave_types` may already hold rows, so it cannot be added in one statement:
there is no default that could satisfy a unique index across several existing
rows, and a backfill cannot be expressed in `schema.prisma`. The migration
therefore:

1. adds the column nullable;
2. derives a marker for every existing row, in a `DO` block;
3. sets `NOT NULL`;
4. creates the unique index.

**The derivation:** take the alphanumerics of `code`, upper-cased, and use its
first character; if taken, widen to two, then three; if all three are taken,
suffix a number within the three characters the column allows. Rows are processed
in `code` order, so the outcome is deterministic. `ANNUAL` → `A`, `MEDICAL` →
`M`, and a second `A…` code becomes `AN`.

Afterwards the marker is an ordinary editable field — an algorithm's choice is a
starting point, not a decision — validated like `code` and `label`.

**No seed data changes.** `prisma/seeds/` contains no leave-type seed, so the
backfill affects only rows a user created.

## API

All under `/api/v1`. The two generating endpoints answer `200` rather than the
`201` Nest gives a `POST` by default, because nothing was created.

### `GET /reports`

The menu. Static metadata; no query runs. Behind the same access check, since
listing documents somebody may not generate would produce five buttons that all
answer `403`.

```jsonc
{ "success": true, "data": [
  { "key": "project-hours-per-employee",
    "name": "Project hours per employee",
    "romanianName": "Centralizator ore proiect per angajat",
    "description": "… Counts APPROVED timesheets only, WORK entries only." }
] }
```

### `POST /reports/:reportType/preview`

```jsonc
// Request
{ "month": 9, "year": 2026,
  "departmentId": "dep-1", "employeeId": "emp-1",
  "projectId": "prj-1", "clientName": "Acme" }
```

Returns the data model. `400` on an unknown `:reportType`, **naming the five
valid keys**; `400` on a missing or out-of-range `month`/`year`; `400` on any
unknown property.

**Why `POST` for a read:** the parameters are a body so the preview and the
export take *identical* input — which is what the parity guarantee rests on — and
because a `GET` returning a streamed attachment is the shape browsers and proxies
cache most eagerly, which is exactly wrong for a document regenerated from live
data on every request.

### `POST /reports/:reportType/export?format=pdf|excel`

Same body. Streams the file. `400` on a missing or unrecognised `format`.

### Parameters

| Parameter | Where | Required | Applies to |
| --- | --- | --- | --- |
| `month` | body | yes | all |
| `year` | body | yes | all |
| `departmentId` | body | no | all |
| `employeeId` | body | no | all |
| `projectId` | body | no | reports 1, 5 |
| `clientName` | body | no | reports 1, 5 |
| `format` | query | yes (export) | export only |

**One DTO for all five reports**, and a filter that does not apply to a report is
ignored by its builder rather than rejected. Five DTOs were considered and
rejected: a client rendering the menu builds one filter panel and posts the same
body whichever report was picked, so five shapes would mean the frontend
re-implementing the applicability table, and switching report type with filters
already set would start failing.

**A future month is allowed** and yields an empty report — which is what lets
somebody open next month's leave calendar to see who has already booked time off.
Refusing it would be this module inventing a rule; a month cannot be *filled in*
before it happens, but it can certainly be asked about.

**An unknown filter id yields an empty report, not a `404`** — the standard
behaviour across this project.

## Frontend

None built. This feature is backend only, and the
[JSON preview contract](#the-json-preview-contract) is specified above so the
frontend can be built against it.

One **convention** is recorded here rather than left to be discovered, because
the wrong version of it is shorter, works perfectly on a laptop in Bucharest,
and fails only for a colleague in another country — which is exactly the kind of
bug that passes review. The short rule is in
[CLAUDE.md § Frontend](../CLAUDE.md#dates-and-times); this is the reasoning.

### Formatting is the frontend's job

The API sends ISO-8601 UTC with a `Z` and never a formatted date. That is not
laziness: a formatted date cannot be sorted, compared or re-rendered, and the
backend does not know who is reading. Every timestamp in every response goes
through `toIsoTimestamp`, and the frontend converts.

### Render in the company timezone, not the browser's

```ts
new Intl.DateTimeFormat('ro-RO', {
  timeZone: companyTimezone, // GET /api/v1/work-schedule → timezone
  year: 'numeric', month: '2-digit', day: '2-digit',
  hour: '2-digit', minute: '2-digit', hour12: false,
}).format(new Date(isoString));
```

**The company's zone, and this is the decision worth understanding.** These are
shared business facts — when a month was submitted, when leave was approved, when
a deadline falls — and they have to mean the same thing to everybody. Rendered in
each reader's own zone, a remote employee would see a different deadline from the
colleague sitting next to the person who set it, and "when was this submitted"
would have no single answer.

It is also what keeps the screen and the file consistent. The exports are fixed
to the company zone because a PDF travels by email and has to say the same thing
wherever it lands — so if the screen rendered `11:36` and the PDF said `08:36`,
that is the same class of defect as the generation timestamp that printed a UTC
time under a Bucharest label. Same principle as
[aggregate once, render three ways](#aggregate-once-render-three-ways), applied
one layer out.

**The trap:** `new Date(iso).toLocaleString('ro-RO')` — without `timeZone` it
silently uses the machine's zone. One helper, used everywhere, and no
`toLocaleString` in a component.

### Only instants are converted

The same distinction the backend keeps. `createdAt`, `updatedAt`, `submittedAt`
and `reviewedAt` are moments and are rendered in the zone. A **calendar date** —
a timesheet entry's `date`, a leave span, a holiday, a hire date — is a *day*
stored at UTC midnight, and passing it through a zone west of Greenwich turns it
into the day before. Those are rendered from their date part alone, never
converted. See `toZonedDateKey` for the full statement.

## Files Created

**Module (17 files)** — listed in [Files created](#files-created).

**Tests (6 files)**

| File | Covers |
| --- | --- |
| `builders/project-employee-hours.aggregator.spec.ts` | 20 tests: cell placement, `null` vs `0`, summing repeated pairs, dropping empty projects, keeping idle employees, rounding, three reconciliation identities, and the nine assertions that reports 1 and 5 agree and differ only in presentation |
| `reporting-source.service.spec.ts` | 19 tests: period and timezone resolution, caps, filter pass-through, the full classification precedence, dynamic markers, and the two timezone assertions |
| `builders/day-reports.spec.ts` | 17 tests: report 2's count invariant and dynamic columns, the *Fără timesheet* state, the zone-rendered instant, report 3's clock window and legend, report 4's totals and its independence from timesheets |
| `renderers/renderer-parity.spec.ts` | 5 tests: every model number present in the sheet **as a number**, the grand total identical, a real PDF produced, both renderers returning buffers rather than paths |
| `routing.spec.ts` | 19 tests: the five report types accepted, an unknown one refused naming the valid set, month/year validation, unknown filters refused, `Content-Disposition` and `Content-Type`, the raw file rather than the envelope, `format` validation, `Cache-Control`, the route that deliberately does not exist, and the access rule for all four roles |
| `reporting.module.spec.ts` | 6 tests: the **real** dependency graph compiled with no substitutes but `PrismaService`, so a provider that is injected without being exported fails here rather than at boot. Added after exactly that happened — see [decision 5](#5-workingdaysservice-is-exported--and-the-calculator-gained-two-methods) |

Plus fixture updates to `leave-types.service.spec.ts` and
`create-leave-type.dto.spec.ts` for `reportMarker`, including four new
assertions about its normalisation, bounds, requiredness and uniqueness.

**Documentation (1 file)** — this document.

## Notes

### Verification

| Check | Result |
| --- | --- |
| `npx prisma validate` | passes |
| `npx prisma generate` | passes |
| `npm run typecheck` | passes, no errors |
| `npm run build` | passes |
| `npm test` | **2282 passed / 2282**, 115 suites (was 2189 / 109) |
| Application boots | `NestFactory.create(AppModule)` resolves every provider |
| `npx prettier --check "src/**/*.ts"` | passes |
| Existing tests broken | none — the two leave-type suites needed fixture updates and were updated, not weakened |
| Migration applied | **no** — awaiting approval |

### What this feature deliberately does not do

- **No storage of any kind.** No report table, no file on disk, no cache.
- **No async pipeline.** Recorded above as the threshold, not built.
- **No permission check and no guard.** See [Access](#access).
- **No `PublicHolidayModule` import.** Holidays are reached through
  `WorkingDaysService`, so "what kind of day is this" has one answer.
- **No timezone configuration of its own.** The zone is the Work Schedule's.
- **No seed data.** A report is generated, never stored.

### Known limitations, stated rather than hidden

1. **The attendance sheet's clock times are the configured working hours**, not
   per-entry times, because the schema records hours per day. Argued in
   [Report 3](#report-3--attendance-sheet).
2. **The population cap is 500.** Beyond it the answer is the async pipeline, not
   a bigger number.
3. **Report 4 shows a "worked" day as blank** rather than reading hours — it is
   deliberately not timesheet-gated.
4. **The reports are Romanian; every other string this API produces is English.**
   That is the one deliberate exception, stated as `REPORT_LOCALE = 'ro-RO'` in
   `reporting.constants.ts`: a printed document with a Romanian title, Romanian
   headings and a *Legendă* has to write its dates `07.08.2026`, not
   `2026-08-07`. The English title is carried alongside on every model.

   **The locale governs display only.** `toDateKey` and `toZonedDateKey` still
   produce ISO strings because those are *keys* — a grid column, a `Map` entry —
   and a key whose shape changed with the language would break every lookup.
   `toZonedDate` and `toZonedTimestamp` are the display counterparts, and they
   take the locale as an argument so `date.util.ts` continues to decide no policy.
5. **The client badge on report 1's bands is derived from the name** (first three
   characters), so two clients may share one. It is presentation; nothing keys off
   it.
6. **`?sortBy=` is not offered on any report.** Row order is part of the report's
   definition, and a client can sort a grid it already holds.

## Future Improvements

- **Asynchronous generation** — enqueue, poll, temporary signed download — once
  the population outgrows the caps. Needs a job table, a worker, an expiry policy
  and a cleanup schedule.
- **`LeaveType.reportColor`**, so the leave calendar can be coloured per type in
  the PDF as the reference designs show. `LeaveType.color` already exists and
  could be reused; it was left alone because it is a UI accent rather than a print
  colour, and the two may want to differ.
- **Per-entry start and end times**, if the attendance sheet ever needs real clock
  windows. That is a `TimesheetEntry` schema change and a change to how people fill
  a month in, so it belongs to a timesheet feature rather than to reporting.
- **A `clients` table**, if client ever becomes more than a name on a project. It
  would turn `clientName` into `clientId` and give report 1's bands a real code
  instead of a derived badge.
- **Refactoring `expandHolidays`** — `WorkingDaysService` and
  `TimesheetFillService` still each expand holiday spans. Reporting reuses the
  former rather than adding a third copy, but the remaining two could share one.
- **A `?locale=` parameter**, when the API gains one, so the Romanian titles and
  status labels are a rendering choice rather than a constant.
- **CSV export**, if somebody wants the grid without the formatting. It would need
  a decision about how group bands and the two header rows flatten.
