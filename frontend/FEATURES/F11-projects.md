# F11 — Projects

## Goal

Replace the placeholder at `/app/team/settings/projects` with a real CRUD screen
for `Project`, built on the `DataTable` that F07 (Leave Types), F08
(Departments) and F09 (Public Holidays) already proved.

It is the fourth list page and the **richest entity so far** — eleven writable
fields, two enums, a colour, a bounded integer and two nullable calendar dates —
but structurally it is the same CRUD, and that is the point of it. Nothing about
sorting, pagination, responsiveness or search debouncing is re-implemented here,
and **the shared `DataTable` needed no changes at all**.

The genuinely new thinking was in four places:

- **Three server-side filters** rather than two, and both enum filters are
  filterable-but-not-sortable columns.
- **A conflict that can name its field.** `Project.code` is the only unique
  column on the table, so unlike the three sibling screens this one can mark the
  offending input rather than naming two fields it cannot tell apart.
- **Optional dates at both ends.** A public holiday's span is required; a
  project's is not, and clearing one end is a request the API understands.
- **A colour, which meant promoting a control** out of `features/leave-types/`
  rather than copying it.

## Requirements

- The list on the existing server-side `DataTable`: page, page size, sort,
  search and three filters as query parameters, wired into the TanStack Query
  key.
- Sortable on `code`, `name`, `clientName`, `estimatedHours` and `startDate`
  only — `createdAt` is the sixth key the API accepts and is deferred for the
  reason F06–F09 deferred it.
- Three server-side filters: `?projectStatus=`, `?projectPriority=`,
  `?isArchived=`.
- Create / edit in one dialog form; delete behind an `AlertDialog` confirmation
  that handles the endpoint's expected `409`.
- Calendar dates displayed in `ro-RO` with **no timezone day-shift**.
- The page gated on `PROJECTS.EDIT`, each action on its own `PROJECTS` key; page
  metadata `TimeSheet | Proiecte`.
- **Project members are out of scope** — a separate resource with its own
  endpoints.

## UI / Components

The whole set mirrors `features/public-holidays/`, one file per responsibility.

| Component | What it is |
| --- | --- |
| `ProjectsTable` | The `DataTable` in a `Card`, with all three filters in the filter slot |
| `useProjectColumns` | Column definitions, `sortKey` on five of them |
| `ProjectSwatch` | The accent colour, as a square beside the code |
| `ProjectBadges` | `ProjectStatusBadge`, `ProjectPriorityBadge`, `ProjectArchivedBadge` |
| `ProjectPeriod` | The *Perioadă* cell — the whole date decision lives here |
| `ProjectEstimate` | The *Ore estimate* cell, where `0` means "not estimated" |
| `ProjectsStatusFilter` / `ProjectsPriorityFilter` / `ProjectsArchivedFilter` | The three toolbar selects |
| `ProjectFormDialog` / `ProjectForm` | One form for create and edit |
| `DeleteProjectDialog` | The confirmation, and the `409` it expects |
| `ProjectsEmptyState` | Replaces the table when nothing is configured |
| `ProjectCreateButton` | Button + dialog, gated, used in the header and the empty state |

### Columns

| Column | Sortable | Cell |
| --- | --- | --- |
| Cod | `code` | `ProjectSwatch` + the code, monospaced |
| Denumire | `name` | The name, emphasised, with the *Arhivat* badge and the description beneath |
| Client | `clientName` | `clientName` |
| Status | — | `Activ` / `În așteptare` / `Finalizat` / `Anulat` badge |
| Prioritate | — | `Scăzută` / `Medie` / `Ridicată` badge |
| Ore estimate | `estimatedHours` | `2400 h`, or `Neestimat` when `0` |
| Perioadă | `startDate` | `ProjectPeriod` — see below |
| … | — | The row menu (`hideOnCard`, `enableHiding: false`) |

**`projectStatus` and `projectPriority` are not sortable and the backend
agrees** — `PROJECT_SORT_FIELDS` has six entries and neither is among them.
`project.constants.ts` even notes that the two *could* be ordered, since a
PostgreSQL enum sorts by declaration order, and that the feature chose not to.
This screen has the better reason to agree: ordering a list by a four-valued
column groups it rather than sorts it, and both columns have a **filter**
instead, which is the control somebody actually wants.

**`createdAt` is the sixth accepted key and is still not offered.** The same
deferral F06 through F09 made: rendering an instant needs the company timezone
from `GET /api/v1/work-schedule`, which nothing reads yet. It does **not** touch
*Perioadă* — `startDate` and `endDate` are calendar dates, not instants, which
is why this page can sort by `startDate` while `createdAt` waits.

### Two facts share a cell rather than taking a column

The colour swatch rides in *Cod* and the archived badge in *Denumire*. Both are
properties of the project's identity rather than values to compare down a
column: a swatch column would be a strip of colour under an empty header, and an
*Arhivat* column would print a badge on the few archived rows and nothing on the
rest — for which there is already a filter. It also keeps the table at seven
columns, which is what fits before the horizontal scroll the responsive rules
forbid.

`ProjectArchivedBadge` is consequently the one badge here that prints a single
state. The sibling screens print both sides of a flag because an empty cell in a
column headed *Stare* is ambiguous; this is not a column, it marks an exception,
and "Nearhivat" on nearly every row would be noise carrying no information.

Archived is also **not** the same fact as `COMPLETED`, which is why it is not a
fifth status: the status says what happened to the work, and `isArchived` says
whether the project is still offered for new hours.

### One shared control was promoted, not copied

`FormColorField` now lives in `components/form/`. The swatch-picker-plus-hex
pair was `LeaveTypeColorField`, and a project's `color` is an identically
specified `#RRGGBB` column — so everything general about it moved (one value
across two inputs, the guard that stops an incomplete hex flashing black in the
picker, the clear button that reaches the "no colour" state neither input can
express, the label/error wiring). `LeaveTypeColorField` is now that component
plus its own three sentences, so `LeaveTypeForm` is untouched. Same move F09
made with `FormSelectField`.

## State & Data (TanStack Query)

`projects-query.ts` is `public-holidays-query.ts` with the names changed:
`queryOptions` keyed on the **resolved** query (so `search: ''` and
`search: '  '` share one entry), 30 s `staleTime`, and one `PROJECTS_QUERY_KEY`
prefix that every write invalidates in full — a new project sorts into whichever
page its code falls on, and a re-prioritised or archived one leaves or joins
whatever the filters are showing.

`useProjects.ts` holds the suspense query and the three mutations. Where each
failure is reported follows the rule F07 set: **successes toast, failures with
an inline home are reported inline.** Neither form mutation toasts its error,
and the delete dialog stays open on failure rather than closing and leaving a
toast to explain a row that is still in the list — which matters more here than
anywhere, since this delete's `409` is the *expected* answer.

## API Integration

`projects-api.ts`. Every type comes from the generated OpenAPI contract:

- `Project` = `components['schemas']['ProjectEntity']`
- `CreateProject` / `UpdateProject` = the two DTO schemas
- `ProjectsQuery` = `operations['ProjectController_findAll_v1']['parameters']['query']`
- `ProjectSortKey` = `ProjectsQuery['sortBy']`, so a column can only offer a sort
  the backend accepts — a removed key is a compile error in `useProjectColumns`
  rather than a `400` on the first click
- `ProjectStatus` / `ProjectPriority` = `Project['projectStatus']` and
  `Project['projectPriority']`

Endpoints used: `GET /projects`, `POST`, `PATCH /{id}`, `DELETE /{id}`. The
`/projects/{id}/members` and roster endpoints are deliberately unused — see
*Members are out of scope*.

`DEFAULT_PROJECT_SORT` is `code`, the backend's own default, and its reasoning is
worth repeating rather than inheriting silently: `code` is required *and* unique,
so the order is total and a row can never shift between two pages of one
listing. Names are neither — two clients can both have a "Website Redesign".

Filters are omitted when unset rather than sent empty: `?projectStatus=` is not
"any status" to a validated enum, it is a `400`.

### The enum options come from a record, not a list

```ts
const PROJECT_STATUS_ORDER: Record<ProjectStatus, number> = {
  ACTIVE: 0, ON_HOLD: 1, COMPLETED: 2, CANCELLED: 3,
};
export const PROJECT_STATUS_OPTIONS = /* keys, in that order */;
```

A `Record<ProjectStatus, …>` rather than an array, so a status added to the
contract is a **compile error at that record** — in the one place that has to
offer it — rather than a value the form silently cannot produce and the filter
silently cannot select. The display order is stated explicitly (lifecycle order
for status, low-to-high for priority) instead of inherited from however the enum
happens to be declared, which for `ProjectPriority` is `MEDIUM | LOW | HIGH`.

One list feeds three consumers: the Zod enum, the form's select and the toolbar
filter. The badges and the two selects then look their labels up through
`Record<ProjectStatus, CommonKey>` maps for the same reason — a new status stops
compiling instead of rendering the raw `ON_HOLD` from the API.

### Errors

`project-errors.ts`, and it emits **no error codes**, for the reason F07, F08 and
F09 documented: there is no `PROJECT_*` in `error-codes.constants.ts`,
`ProjectService` throws a bare `ConflictException`, and the exception filter only
assigns a code for a `500` or a `BadRequestException`. A `409` arrives with
`errorCode: null` (confirmed live — see Verification), and the generic fallback
says "conflicts with existing data", which tells nobody what to change.

**Unlike departments, the duplicate can mark a field.** `DepartmentService` has
two unique columns and reports both collisions as English prose, so that screen
names both fields because the API named neither. `Project.code` is the *single*
unique column, `assertCodeIsFree` is the only source of a `409` on create and
update, and the service says outright that `name` is deliberately not treated as
an identifier. So a `409` here is necessarily about `code` — no message-parsing,
no guessing — and `ProjectForm` marks that input invalid **and** puts the
sentence on it, suppressing the form-level alert so the same sentence is not
printed twice.

The inference is the only thing keeping that honest, so it is stated where it
would break: a second unique index on this table would make the marked field a
guess again.

The delete's `409` is the other case, and the sentence names both relations that
can block it and points at `isArchived` as the way past.

## Forms & Validation (react-hook-form + Zod)

`project-schemas.ts` — every bound is the backend's own, from
`project.constants.ts` and the `@IsProject*()` decorators: code ≤ 20 matching
`^[A-Z0-9]+([-_][A-Z0-9]+)*$` and upper-cased, name and `clientName` ≤ 100,
description ≤ 500 with blank → `null`, `estimatedHours` a whole number in
0 – 1 000 000, colour `#RRGGBB` upper-cased with blank → `null`.

`clientName` deliberately has **no pattern**, for the reason the backend gives: a
company name carries diacritics, ampersands, dots and legal suffixes (`S.R.L.`,
`& Co`), and every pattern narrow enough to be worth writing eventually rejects a
real customer. It is *required* rather than nullable because an internal project
names the company itself — which the form says under the field, since a required
field that looks optional is the one people leave blank.

### `estimatedHours`, and why the form does not pre-fill `0`

The column carries a `@default(0)` and the DTO still requires the number, and the
backend states why: the default is the *database's* answer for rows written
outside the API, while over HTTP "not estimated yet" should be a deliberate `0`
rather than an omission nobody notices. The form follows that exactly — the
field is required, starts **empty**, and its placeholder is `0` with a hint
saying what `0` means. Pre-filling it would record that claim on every project
nobody thought about the estimate for.

`ProjectEstimate` closes the loop in the list: `0` renders as *Neestimat* in the
muted tone rather than as `0 h`, which would state a budget of nothing.

### The cross-field rule

`superRefine` mirrors `assertOrderedDateRange`, so it is answered before a
request rather than by one — and it mirrors it **exactly**, including when it
does not apply:

- Only when **both** ends are stated. An open end is not a violation but an
  unknown, and the service resolves a patch that clears `startDate` by lifting
  the constraint rather than failing against a value that is no longer there.
- `<` rather than `<=`, so a project that starts and ends the same day is
  allowed, as the backend allows it.

By that point both values are full ISO instants at midnight UTC, so they sort
correctly as text and no zone is consulted to compare two days.

### The `PATCH` sends every field

A `PATCH` naming a field with its current value is a no-op on the server, and
diffing would buy nothing while introducing the classic bug where clearing a
field looks identical to not touching it — which on this endpoint is a real
distinction three times over: `description: null` clears the column,
`color: null` clears the accent, and each date's `null` clears that end of the
schedule, while `undefined` would leave all of them alone. Sending both dates
every time also settles the ordering rule the cleanest way, since a body that
always names both is one the service's resolution has nothing to do to.

## Dates

`startDate` and `endDate` are **calendar dates, and both are optional** — the
contract says a project may be planned before its dates are known. That is the
one substantive difference from F09's holiday span, where both ends are
required.

Nothing was added to `src/lib/datetime.ts`; F09's helpers cover this feature
unchanged:

| Function | Result | Used for |
| --- | --- | --- |
| `formatCalendarDate(iso)` | `01.09.2026` | Rendering either end in *Perioadă* |
| `toCalendarDateInput(iso)` | `2026-09-01` | Loading a stored date into the date input |
| `toCalendarDateIso(value)` | `2026-09-01T00:00:00.000Z` | Sending a picked date |

**No day-shift, by construction.** All formatting fixes the zone to `UTC` — the
zone these values were written in — because a project's start is a day on a
calendar rather than a moment, and rendering midnight UTC in any zone west of
Greenwich prints the previous day. `toCalendarDateIso` appends the suffix as
*text* rather than round-tripping through `Date`, so no zone is consulted at any
point.

`ProjectPeriod` prints four cases, and none of them is missing data: `—` for a
project with no dates yet, `Din 01.09.2026` for an open end, `Până la
31.12.2026` for a deadline with no recorded start, and `01.09.2026 –
31.12.2026` for a settled span. A one-day project prints once rather than as
`01.09.2026 – 01.09.2026`.

Unlike `PublicHolidaySpan`, the **year is always printed**: a project's dates
name one specific span and there is nothing recurring about them.

## Members are out of scope

Neither `CreateProjectDto` nor `UpdateProjectDto` carries a member, and neither
does this feature. Who is on a project, who manages it and when they joined are
the `/projects/{id}/members` resource (backend Features 013 and 014), with their
own endpoints, their own entity (`ProjectRosterEntity`) and their own frontend
feature to come. Putting a roster in this dialog would be a second way to write
data this screen does not own.

Note that `PROJECTS.EDIT`'s seeded description — *"Change a project, including
its roster"* — already anticipates that the same key will gate both.

## Theming / i18n

A `projects` block in `ro` and `en` `common.json`, mirroring the `publicHolidays`
block: columns, the two enum vocabularies, flags, period phrasings, the three
filters, form fields and hints, validation messages, the two conflict sentences,
toasts, the delete confirmation and the empty state. `pages.settingsProjects`
already existed and is reused.

Every badge draws its variant from theme tokens and carries a word as well as a
colour, so nothing depends on colour alone — which matters more here than on the
sibling screens, since a row *also* carries a free colour the person picked.
`ProjectSwatch` tints a twelve-pixel square and no text, so a colour chosen
without a contrast check cannot make anything unreadable.

Numbers in validation messages are interpolated from the shared constants, so a
translation and the rule it describes cannot disagree about a bound.

## Routing

`settingsProjectsRoute` in `team.routes.tsx` swaps `WorkspacePlaceholderPage`
for `ProjectsPage`. **The guard is unchanged at `PROJECTS.EDIT`** — it was
already that on the placeholder, and `TEAM_NAVIGATION` gates the sidebar entry
identically; the two have to agree or a visible menu item leads to a refusal.
`EDIT` rather than `PAGE_ACCESS` is the same judgement F09 made for holidays and
F05 made for team timesheets: page-access keys are held further along the roles
than the people who should be changing a shared configuration.

Actions carry their own keys: `PROJECTS.CREATE` on the button, `.EDIT` and
`.DELETE` on the row menu. All five `PROJECTS` actions are seeded.

### `GET /projects` stays ungated, deliberately

`ProjectController` declares no `@RequirePermission()`. For the list route that
is a property to **preserve** rather than an oversight: the timesheet's project
picker reads it for every employee, and the `USER` baseline holds no `PROJECTS.*`
key at all — F05's *the personal workspace does not vary by role* records that
the baseline dropped `PROJECTS.PAGE_ACCESS`, and notes that the picker was never
affected precisely because the endpoint is ungated. Guarding it would empty that
picker. The **screen** is what gets narrowed, in the router and the sidebar.

> **The write verbs are ungated too, and that is a backend gap.** `POST`,
> `PATCH` and `DELETE` on this controller carry no `@RequirePermission()`
> either, so the API does not currently refuse a write from an account lacking
> `PROJECTS.CREATE` / `.EDIT` / `.DELETE` the way it refuses one to
> `/permissions`. Hiding the controls is the whole of today's enforcement, which
> is presentation and not protection. A frontend cannot fix this; it is recorded
> here and under *Future Improvements* rather than papered over. Note the
> asymmetry is only about the write verbs — the `GET` should stay exactly as it
> is.

## Files Created

- `src/features/projects/projects-api.ts`
- `src/features/projects/projects-query.ts`
- `src/features/projects/project-schemas.ts`
- `src/features/projects/useProjectSchemas.ts`
- `src/features/projects/project-errors.ts`
- `src/features/projects/useProjects.ts`
- `src/features/projects/components/ProjectsTable.tsx`
- `src/features/projects/components/useProjectColumns.tsx`
- `src/features/projects/components/ProjectSwatch.tsx`
- `src/features/projects/components/ProjectBadges.tsx`
- `src/features/projects/components/ProjectPeriod.tsx`
- `src/features/projects/components/ProjectEstimate.tsx`
- `src/features/projects/components/ProjectsStatusFilter.tsx`
- `src/features/projects/components/ProjectsPriorityFilter.tsx`
- `src/features/projects/components/ProjectsArchivedFilter.tsx`
- `src/features/projects/components/ProjectForm.tsx`
- `src/features/projects/components/ProjectFormDialog.tsx`
- `src/features/projects/components/ProjectRowActions.tsx`
- `src/features/projects/components/DeleteProjectDialog.tsx`
- `src/features/projects/components/ProjectsEmptyState.tsx`
- `src/features/projects/components/ProjectCreateButton.tsx`
- `src/components/form/FormColorField.tsx`
- `src/app/pages/ProjectsPage.tsx`

## Files Modified

- `src/routes/team.routes.tsx` — the real page replaces the placeholder
- `src/features/leave-types/components/LeaveTypeColorField.tsx` — now a thin
  adapter over the shared `FormColorField`; its props and its call site in
  `LeaveTypeForm` are unchanged
- `src/locales/ro/common.json`, `src/locales/en/common.json` — the `projects`
  block

## Verification

`tsc -b --force`, `eslint .` and `npm run build` all pass clean.

### Browser verification (Playwright MCP)

The app was running — frontend `:5173`, backend `:3000`, migrated and seeded
with five projects covering all four statuses, all three priorities, an archived
row, a colour on every row, an open-ended span and a closed one.

**Gating.** Opened `/app/team/settings/projects` while signed in as the seeded
HR account (`elena.dumitrescu`), which does not hold `PROJECTS.EDIT`: redirected
to `/app/not-authorized?required=PROJECTS.EDIT`. Signed in as the superadmin
(`andrei.popescu`) for everything below.

**The list.** Loaded with real data, title `TimeSheet | Proiecte`, sorted by
`code` ascending, both badge columns, the swatch, the archived badge on
`WEBSITE`, `Din 12.01.2026` on an open-ended row and `06.05.2024 – 29.11.2024`
on a closed one.

**Sorting** — each of the four non-default sortable headers was clicked and each
issued a real request:

| Clicked | Request |
| --- | --- |
| (initial) | `?page=1&limit=20&sortBy=code&sortOrder=asc` |
| Ore estimate | `sortBy=estimatedHours` |
| Perioadă | `sortBy=startDate` |
| Client | `sortBy=clientName` |
| Denumire | `sortBy=name` |

*Status* and *Prioritate* render as plain `columnheader`s with no button, so
neither offers a sort the backend would refuse.

**The three filters and search**, applied in turn, composed correctly on the
wire and each triggered a refetch:

```
…&projectStatus=ON_HOLD
…&projectStatus=ON_HOLD&projectPriority=HIGH
…&projectStatus=ON_HOLD&projectPriority=HIGH&isArchived=true
…&search=Aurora&projectStatus=ON_HOLD&projectPriority=HIGH&isArchived=true
```

The last combination matches nothing, and the table kept its toolbar and printed
*"Niciun proiect nu corespunde filtrelor."* inside itself rather than showing the
unconfigured empty state — the distinction the two states exist for.

**The "Coloane" menu opened** (the interaction that crashed in F01) and listed
the seven data columns with their labels; *Acțiuni* is correctly absent, since
`enableHiding: false`. Unchecking *Client* removed the column from the header
and the rows.

**Create.** Filled every field, deliberately typing the code in lowercase. The
`POST` body was exactly:

```json
{"code":"MIG-2026","name":"Migrare infrastructură","clientName":"Aurora Retail Group",
 "description":"…","estimatedHours":640,"color":"#0EA5E9","projectStatus":"ON_HOLD",
 "projectPriority":"HIGH","isArchived":false,
 "startDate":"2026-01-01T00:00:00.000Z","endDate":"2026-09-30T00:00:00.000Z"}
```

— `mig-2026` upper-cased, `#0ea5e9` upper-cased, the estimate a **number** and
not the string the input holds, and both dates midnight UTC. `201`, the dialog
closed, the list refreshed to six rows with the new project sorted into place,
and the period rendered **`01.01.2026 – 30.09.2026`** — the day that was typed,
which is the whole point of the UTC discipline. The classic defect would have
printed `31.12.2025`.

**Duplicate code.** Submitted `SUPPORT`. The `409` arrived with **no
`errorCode`** — confirming why `project-errors.ts` exists — and the form:

- stayed open,
- put `aria-invalid="true"` on the `Cod` input,
- associated it via `aria-describedby` with *"Codul este deja folosit de alt
  proiect. Alege altul."*, announced through `role="alert"`,
- printed that sentence **once** (the form-level alert suppresses conflicts).

> This was found by the browser, not by the code. The first version called
> `setError('code', { type: 'server' })` with no `message`, exactly as the
> sibling features do — and `FormField` derives `aria-invalid` from whether
> there *is* a message, so the field was styled and announced as valid while the
> form refused to submit it. The live check reported `ariaInvalid: "false"`, and
> the fix was to pass the translated sentence as the field's message and drop it
> from the alert.

**Cross-field dates.** Start `2026-09-30`, end `2026-01-01`: exactly one message,
on `endDate` only (*"Data de sfârșit nu poate fi înaintea datei de început."*),
with `aria-invalid` on that field alone and **no request sent** — the browser
answered it, as the schema is there to.

**Edit.** The dialog loaded the stored row correctly: `2026-01-01` / `2026-09-30`
back in the date inputs unshifted, `#0ea5e9` feeding the colour picker, both
selects on their stored values. Changed the status to `COMPLETED`, cleared the
end date and switched *Arhivat* on. The `PATCH` sent `"endDate":null` explicitly
— the clear the API understands — and `"color":"#0EA5E9"`. The row came back as
*Finalizat*, with the *Arhivat* badge, and its period collapsed to
`Din 01.01.2026`.

**Toast.** *"Proiectul „Company Website” a fost actualizat."* captured in the DOM
immediately after a save.

**Delete, both paths.**

| Attempt | Result |
| --- | --- |
| `CRM TimeSheet` (has members and timesheet entries) | `409`, dialog **stayed open** and showed *"Proiectul nu poate fi șters cât timp are membri sau ore pontate. Arhivează-l…"* |
| `MIG-2026` (the probe row, nothing references it) | `200`, dialog closed, row gone, list back to five |

**Responsive, at 420 × 900** (below `lg`): the table gave way to one card per
project with the column labels as `<dt>`/`<dd>` pairs, the row menu on its own
line at the foot of each card (`hideOnCard`), search / the three filters /
pagination all still present, `document.scrollWidth === clientWidth` (**no
horizontal scroll**), *"Coloane"* correctly gone, and *"Sortare"* in its place
listing exactly the five sortable columns — *Status* and *Prioritate* absent
there too.

**Console.** Across the whole session the only errors were the pre-sign-in
`401`s on `/auth/me` and the three `409`s deliberately provoked above. No
exceptions, no React warnings.

**Seed data restored.** The probe project was deleted and the list is back to its
original five. `Company Website` received one no-op `PATCH` (identical values) to
capture the toast, which changed nothing but its `updatedAt`.

### What was not exercised live

- **The unconfigured empty state** (`ProjectsEmptyState`). Reaching it needs an
  empty `projects` table, and the seeded five cannot be deleted — the backend
  refuses each with the `409` verified above. Its filtered counterpart *was*
  exercised, and the component is structurally identical to the three siblings'.
- **`QueryErrorState`**, for the same kind of reason: it needs the list request
  to fail, which the running stack does not do on demand.

## Notes

- **The shared `DataTable` needed no changes.** A colour, two badges and a date
  range are cells, and three filters in the slot instead of two needed nothing
  either. This is the fourth page from the same pattern and the cheapest so far.
- The one shared file that *did* change is `FormColorField`, and it moved rather
  than being copied — the fourth control to be promoted out of a feature once a
  second feature needed it (`FormDateField` and `FormSelectField` were F09's).

## Future Improvements

- **Gate the write verbs on the backend.** `POST`, `PATCH` and `DELETE
  /projects` carry no `@RequirePermission()`, so `PROJECTS.CREATE` / `.EDIT` /
  `.DELETE` are enforced only by this screen hiding its controls. The keys are
  seeded and the frontend already uses them; the decorators are a three-line
  change on `ProjectController`. **`GET /projects` must stay ungated** — see
  Routing.
- ~~**A `VALIDATION_ERROR` still does not mark its fields.** `rejectedFields`
  returns the field names and every caller does `setError(field, { type:
  'server' })` with no message — which, as the duplicate-code fix above found,
  leaves `aria-invalid` false. This affects F07, F08, F09 and F11 identically and
  wants one shared fix: either an `invalid` prop on `FormField` /
  `FormSelectField`, or a shared "the server rejected this value" sentence.~~
  **Done (2026-08-22)** — the second route, in one shared place:
  `hooks/useServerFieldErrors.ts` is now the only thing that turns a rejected
  field name into a form error, and it always attaches
  `errors:field.rejected`. All seven forms use it, `ProjectForm` included; the
  `409` branch here is unchanged. See F03's amendment, *"a field the server
  rejected was announced as valid"*, for the reasoning and the browser evidence.
  The `invalid`-prop route was rejected: it would have let a caller mark a field
  invalid while still saying nothing.
- **Coded `409`s from the backend** would delete `project-errors.ts` entirely, as
  they would `leave-type-errors.ts`, `department-errors.ts` and
  `public-holiday-errors.ts`. With `params.field` on the duplicate, the field
  marking here would stop resting on "`code` is the only unique column".
- **`createdAt` as a column and a sort**, once something reads the company
  timezone from `GET /api/v1/work-schedule`. Carried over from F06–F09.
- **The project roster**, from `/projects/{id}/members` — out of scope here, and
  the obvious next screen for this resource. `PROJECTS.EDIT`'s seeded
  description already says it gates both.
- **`?isArchived=false` as the default filter.** Deliberately not done: a filter
  applied without being asked for is a list that quietly omits rows. Worth
  revisiting only if an installation accumulates enough archived projects that
  the unfiltered list stops being useful.
- **The date input's display format follows the browser locale**, not `ro-RO`.
  The stored and rendered values are unaffected. Carried over from F09.
- **`CLAUDE.md`'s `Dates and times` section is still stale** — it prescribes
  `date-fns` / `date-fns-tz` and forbids `Intl.DateTimeFormat`, while the project
  has neither library and `src/lib/datetime.ts` is built on `Intl`. Raised in
  F09 and still outstanding.
