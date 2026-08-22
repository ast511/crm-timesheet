# Departments — the second list page, and the test of the first

## Goal

Turn `/app/team/settings/departments` from a placeholder into a working
screen: list the organisational units employees belong to, add one,
change one, remove one.

The screen is not the point. F07 built the leave-types page as the first
consumer of the shared `DataTable` and wrote down the wiring every later
list should copy. **This feature is the check that the wiring is
copyable** — that the pattern is a pattern and not one screen's
arrangement described after the fact. A department is the right entity
to run it on: four flat fields, no relations to render, no state
machine, nothing interesting except being ordinary.

The result: it copied cleanly. `DepartmentsTable` is `LeaveTypesTable`
with the names changed and one control removed, and **no shared code
needed fixing** — no change to `DataTable`, `useDataTableState`,
`useDataTableTransition`, or any `ui/` primitive. The full inventory of
what this feature adds *near* the shared pieces is: nothing.

## Requirements

- The list page, built on the **existing** `DataTable` — no second
  table, no client-side paging, no re-solved responsiveness.
- Server-side throughout: sorting, searching and paging each fetch.
- Sorts offered only for the columns the backend enumerates.
- Create and edit through one react-hook-form + Zod form.
- Delete behind a confirmation, with the in-use conflict handled.
- Empty and error states, distinguishable from one another.
- Permission gating on `DEPARTMENTS` — page, and each action separately.
- `TimeSheet | Departamente`, `ro`/`en`, responsive, accessible.
- Type-check, lint and build clean.

---

## Two corrections the brief needed

Both were found by reading the contract rather than by assuming F07's
contract carried over. Neither is a judgement call — in each case the
briefed behaviour would have produced a broken screen.

### 1. There is no `isActive` filter, and adding one would be a `400`

The brief asked for an `isActive` filter in the toolbar, mirroring
`LeaveTypesActiveFilter`. **`GET /api/v1/departments` accepts no filter
at all.**

`DepartmentQueryDto` declares exactly two properties of its own,
`search` and `sortBy`, and inherits `page`, `limit` and `sortOrder` from
`SortQueryDto`. The generated contract agrees — `DepartmentController_findAll_v1`
publishes those five parameters and nothing else. `LeaveTypeQueryDto`
has `isActive`, `isPaid` and `requiresApproval`; this one has none, and
`DepartmentService.findAll()` builds its `where` from `search` alone.

This is not a filter that would have been quietly ignored. The global
`ValidationPipe` runs with `forbidNonWhitelisted`, so an invented
`?isActive=true` is **rejected by name with a `400`** — meaning the
briefed control would not have under-delivered, it would have broken
every interaction that touched it.

So no filter control is rendered, and `toDepartmentsQuery` deliberately
does not spread `state.filters` into its result. The brief's own
instruction — *"verify the exact query params in `DepartmentQueryDto`
and only offer what's accepted"* — is what this follows.

`isActive` is still a **field**: it has a column, it has a badge, and it
is editable in the form. It is simply not a way to query the list. The
consequence for the screen is one line: `isFiltered` in
`DepartmentsTable` tests the search term alone, because there is only
one way to narrow this list.

Adding the filter to the backend is a reasonable thing to want — it is
in *Future Improvements* — but it is a backend feature, not something a
frontend page can decide for itself.

### 2. The `409`s carry no `errorCode`

The brief said departments errors "use the standard envelope with
`errorCode`" and that a duplicate must therefore "surface a coded error
on the right field". The first half is not true of this module's
conflicts, which makes the second half unreachable.

`error-codes.constants.ts` holds eleven codes — the generic three, the
auth ones, the account-lifecycle ones. There is **no `DEPARTMENT_*` code
and no code for a conflict of any kind.** `DepartmentService` throws a
bare `ConflictException`, and `all-exceptions.filter.ts` only ever
*assigns* a code for a `500` (`INTERNAL_ERROR`) or a
`BadRequestException` (`VALIDATION_ERROR`). A `409` from here arrives
with `errorCode: null`, exactly as `/leave-types` does and for the same
reason: the module predates Feature 033.

So this screen does what F07 did — `department-errors.ts` supplies the
sentence the generic `409` fallback cannot, derived from what the
*contract* documents a `409` to mean on each verb, never from the
English message.

**Why the duplicate does not mark one field.** This backend is actually
more helpful than the leave-types one: `describeConflicts()` reports
both collisions at once, one array entry per offending field. But those
entries are English prose written for a log — `A department with code
"DEV" already exists` — which `CLAUDE.md` forbids rendering and the
backend documents as free to be reworded. There is no `errorCode` and no
`params.field`, so which column collided is recoverable *only* by
pattern-matching that sentence.

`rejectedFields` is not a way around it: it gates on `errorCode ===
'VALIDATION_ERROR'`, and its contract is that a detail line *starts with
the property name*, which these do not.

Three options, then: parse the English (forbidden, and documented as
unstable), guess a field and mark the wrong input red, or say what is
true. This says what is true, and names both fields because the API
named neither. The brief's own parenthetical — *"like leave-types
handled duplicate code/reportMarker"* — points at exactly this
behaviour.

Both sentences are marked in the code as deletions-in-waiting.

---

## Routing and permissions

`/app/team/settings/departments`, the stub `settingsDepartmentsRoute`
already declared. Only its `component` changed; the guard did not.

| Gate | Key | Where |
| --- | --- | --- |
| Open the page | `DEPARTMENTS.PAGE_ACCESS` | `requirePermission` in `team.routes.tsx` |
| Add | `DEPARTMENTS.CREATE` | `DepartmentCreateButton` |
| Edit | `DEPARTMENTS.EDIT` | the row menu's first item |
| Delete | `DEPARTMENTS.DELETE` | the row menu's second item |

All four are real: the seed gives `DEPARTMENTS` the five-action row
`PAGE_ACCESS · VIEW · CREATE · EDIT · DELETE`. This matters because
`PermissionKey` is a template-literal cross product (12 resources × 7
actions = 84 keys against a catalog of 55), so a plausible-but-unseeded
pair type-checks and then silently hides a control forever. The seed was
checked rather than assumed.

`DEPARTMENTS.VIEW` is deliberately not required on top of `PAGE_ACCESS`,
the same call F07 made: the route guard already refuses anybody without
page access, and requiring two keys to read one screen would hide it
from an account the administrator meant to grant it to.

The resource is `DEPARTMENTS` and there is no near-miss to confuse it
with — unlike `LEAVES` / `LEAVE_REQUESTS`. The seed's own comment
explains why it is not called `TEAMS`: there is no team in this system,
and naming a permission after a screen that does not exist would leave
an administrator granting something they could not find.

When neither `EDIT` nor `DELETE` is held the row menu is not rendered at
all, rather than rendered empty.

---

## The DataTable wiring — copied, not re-derived

```tsx
const { state, actions: baseActions } = useDataTableState({ sortBy: DEFAULT_DEPARTMENT_SORT });
const { actions, isPending } = useDataTableTransition(baseActions);
const { items, meta } = useSuspenseDepartments(state);   // key contains `state`
```

Three lines, identical to F07's but for the names. The four facts F07
wrote down all held without modification:

1. **`state` is the query key.** `departmentsQueryOptions` puts the
   resolved query in it, so page 2 is a different cache entry from page
   1 rather than an overwrite.
2. **The query is keyed on the resolved parameters**, so a search of
   `''` and a search of `'  '` are one request and one entry.
3. **`sortBy` is narrowed to the backend's enum.** `DepartmentSortKey`
   is read off the generated operation, so a column can only offer a
   sort the API accepts.
4. **The typed half of the filters belongs at the call site** — which
   here means there is no typed half, because there are no filters.

`useDataTableTransition` earned its keep a second time: it exists so
that pairing `useSuspenseQuery` with a state-keyed query does not blank
the table to its skeleton on every page click. It was written beside the
`DataTable` rather than inside leave-types precisely so the next list
could use it unchanged, and this is that next list.

### Columns

| Column | `sortKey` | Rendering |
| --- | --- | --- |
| `code` | `code` | the code in mono |
| `name` | `name` | the name, in medium weight |
| `description` | — | clamped to two lines; `—` for `null` |
| `isActive` | — | `Activ` / `Inactiv` badge |
| actions | — | the `…` menu; `hideOnCard`, `enableHiding: false` |

**Sortable: `code` and `name` only.** `description` and `isActive` carry
no `sortKey`, and the backend agrees — `DEPARTMENT_SORT_FIELDS` has
three entries, not five. Ordering a list by a two-valued column groups
it rather than sorts it, and ordering it by free prose sorts nothing
anybody was looking for.

**`createdAt` is the third key the API accepts and is not offered
either** — the same deferral F06 and F07 made, for the same reason.
Rendering an instant needs the company timezone from `GET
/api/v1/work-schedule`, which nothing reads yet, and `CLAUDE.md`
requires every timestamp in that zone rather than the browser's. A date
this application cannot format correctly is worse than one it does not
show, and a sort header over a column nobody can see would sort by an
invisible value. It lands in *Future Improvements* for the third time.

Two conventions inherited rather than re-decided: `meta.label` on every
column, because below `lg` those labels are the keys of the card's
key/value pairs; and `enableHiding: false` on the actions column, the
rule F07 added after a browser found that the visibility menu would
otherwise offer to hide the only way to act on a row.

`description` is its own column here, where the leave-types page tucked
it under the label. A department has four fields and two of them are
identifiers, so there is room — and it is the field that actually
distinguishes one row from another once the codes stop being
self-explanatory.

---

## Forms & validation

One form for both writes. `UpdateDepartmentDto` is `CreateDepartmentDto`
with every field optional, so a second component would be the same four
inputs kept in step by hand. Which mutation runs follows from whether a
row was passed in.

The update sends **every** field rather than a diff. A `PATCH` naming a
field with its current value is a no-op on the server, and diffing buys
nothing while introducing the classic bug where clearing a field looks
identical to not touching it — which on this endpoint is a live
distinction, since `description: null` clears the column and `undefined`
leaves it alone.

### Every rule is borrowed

`department-schemas.ts` mirrors `department.constants.ts` and the
`@IsDepartment*()` decorators, with a table in its header naming the
backend constant each bound comes from. Two deliberate matches with the
DTO's `@Transform`s:

- **`code` is upper-cased before the pattern runs**, exactly as
  `IsDepartmentCode()` does — so `dev` is accepted and stored as `DEV`
  rather than refused for a rule the backend does not apply. A browser
  rule stricter than the server's would reject a value the API would
  have taken, which is the one direction a UX check must never err in.
  The upper-casing is normalisation rather than cosmetics: PostgreSQL's
  unique index is case-sensitive, and folding the case at the edge is
  what makes it a real guarantee.
- **A blank `description` becomes `null`**, as
  `IsDepartmentDescription()` does. A cleared textarea posts `''`, which
  is not a shorter description but the absence of one; storing it
  verbatim would give the column two values meaning "empty". An
  `<input>` cannot express `null`, so the conversion lives in the schema
  and no component repeats it.

`isActive` defaults to `true` in `emptyValues`, matching the schema
default the backend applies when a `POST` omits it —
`CreateDepartmentDto` deliberately does not repeat it, so "a new
department is active" stays one decision in one place. Stating it in the
form means the switch shows what will actually be stored.

### Where a failure is reported

| Outcome | Where it shows |
| --- | --- |
| Create / update succeeded | list invalidated, dialog closed, success toast |
| Create / update `409` | `FormAlert` in the open form; dialog stays put |
| Create / update `VALIDATION_ERROR` | the named fields marked invalid *and given a sentence*, via `useServerFieldErrors` |
| Delete succeeded | list invalidated, dialog closed, success toast |
| Delete `409` | the sentence inside the still-open confirmation |

The rule, unchanged from F07: **a failure with an inline home is
reported inline; toasts are for successes and for failures with nowhere
else to go.**

The delete's conflict is not an edge case here. `DepartmentService.remove()`
counts employees before deleting, and the backend's reasoning is
explicit — a department with staff is a reporting dimension for their
history, so removing it would either orphan those rows or delete people
to delete a label. The sentence therefore names both ways out: reassign
the employees, or deactivate the department.

Two consequences inherited: the form dialog unmounts with its portal, so
`defaultValues` are read fresh on every open and an abandoned edit
leaves nothing behind. The *delete* dialog does not — the mutation
outlives the popup — so it resets on close, or reopening would show the
previous attempt's refusal as though the new one had already failed.

---

## Empty and error states

Three different nothings, all distinguished:

| State | What renders |
| --- | --- |
| No departments configured at all | `DepartmentsEmptyState` **in place of** the table |
| A search matched nothing | the table, with its own message inside it |
| The fetch failed | `QueryErrorState` — the translated error and a retry |

The first two are told apart by whether anything was asked for, not by
the count. A search that matches nothing keeps the toolbar, because the
term still in the box is the way out of it; an unconfigured list has no
term to clear and no rows to page, so a toolbar over an empty table
would offer controls for data that does not exist. The empty state's
only content is the call to action — and for somebody without
`DEPARTMENTS.CREATE` it renders the explanation alone.

The failure is a `QueryBoundary` away from the empty case by
construction: a thrown query cannot render as an empty list.

Deleting the last row of a page steps the list back one page, the hazard
`useDataTableState` documents for filters and cannot see for a removal.

---

## State & Data (TanStack Query)

| Piece | Purpose |
| --- | --- |
| `DEPARTMENTS_QUERY_KEY` | `['departments']` — the prefix a write invalidates |
| `departmentsQueryOptions(state)` | `[...prefix, 'list', resolvedQuery]`, `staleTime` 30s |
| `useSuspenseDepartments` | the suspense read |
| `useCreateDepartment` / `useUpdateDepartment` / `useDeleteDepartment` | the three writes |

Every write invalidates the **whole prefix**, not the page it happened
on: a new department sorts into whichever page its name falls on, a
renamed one moves, and a deleted one shifts every row after it up by
one. Anything narrower would leave a neighbouring page one row out of
date.

Thirty seconds of `staleTime`, matching leave types and for the same
reason: departments are configuration several administrators share, so a
colleague's edit should surface on the next interaction rather than the
next session, while paging back to a page just visited stays a cache
read.

## API Integration

| Call | Endpoint |
| --- | --- |
| `fetchDepartments` | `GET /api/v1/departments` |
| `createDepartment` | `POST /api/v1/departments` → `201` |
| `updateDepartment` | `PATCH /api/v1/departments/{id}` |
| `deleteDepartment` | `DELETE /api/v1/departments/{id}` → `200` with `data: null` |

`GET /api/v1/departments/:id` exists and is **not used**: the row is
already in the list, and re-fetching it to populate an edit form would
be a request for data the table is holding. Noted because the brief
listed it.

Every type comes from the generated contract — `DepartmentEntity`,
`CreateDepartmentDto`, `UpdateDepartmentDto`, and the query read off
`DepartmentController_findAll_v1`. Nothing is hand-written.

---

## Theming / i18n

Everything is `ro` with an `en` fallback, both bundles complete — the
`satisfies` in `i18n/config.ts` makes a key added to one and forgotten
in the other a compile error. The `departments` bundle mirrors the
`leaveTypes` one key-for-key where the two screens say the same kind of
thing, so the pages read as siblings.

No colour is introduced. The status badge uses the same two variants as
`LeaveTypeActiveBadge`, both from theme tokens, so "Activ" means the
same thing and looks the same on both settings screens and both follow
the account's palette. Nothing depends on colour alone — every badge
carries its word.

Page metadata is `usePageMeta`, as everywhere: `TimeSheet | Departamente`
and a page-specific description. Both keys already existed, left by the
placeholder route.

---

## Files Created

| File | Purpose |
| --- | --- |
| `src/app/pages/DepartmentsPage.tsx` | The screen: metadata, heading, create button, boundary. |
| `src/features/departments/departments-api.ts` | Generated types, the four calls, `toDepartmentsQuery`. |
| `src/features/departments/departments-query.ts` | The list query options and the shared key prefix. |
| `src/features/departments/useDepartments.ts` | The suspense read and the three mutations. |
| `src/features/departments/department-schemas.ts` | The Zod schema and the backend's bounds. |
| `src/features/departments/useDepartmentSchemas.ts` | The same, in the current language. |
| `src/features/departments/department-errors.ts` | The two `409`s the contract documents and the API does not code. |
| `src/features/departments/components/DepartmentsTable.tsx` | The `DataTable` wiring. |
| `src/features/departments/components/useDepartmentColumns.tsx` | Columns, labels and sort keys. |
| `src/features/departments/components/DepartmentBadges.tsx` | The `isActive` cell. |
| `src/features/departments/components/DepartmentRowActions.tsx` | The per-row menu and its dialogs. |
| `src/features/departments/components/DepartmentForm.tsx` | One form, both writes. |
| `src/features/departments/components/DepartmentFormDialog.tsx` | The form's modal. |
| `src/features/departments/components/DepartmentCreateButton.tsx` | Button and dialog, self-contained. |
| `src/features/departments/components/DeleteDepartmentDialog.tsx` | The confirmation. |
| `src/features/departments/components/DepartmentsEmptyState.tsx` | Nothing configured yet. |
| `FEATURES/F08-departments.md` | This document. |

## Files Modified

| File | Change |
| --- | --- |
| `src/routes/team.routes.tsx` | `settingsDepartmentsRoute` renders `DepartmentsPage` instead of the placeholder. |
| `src/locales/{ro,en}/common.json` | The `departments` bundle. |

Nothing else — and that is the finding. No shared component, no `ui/`
primitive, no hook and no `data-table/` file needed a change. The route
stub, its guard, the sidebar entry and the `DataTable` were all already
correct.

## Dependencies

None. No new package, and no new `ui/` primitive: `badge`, `switch`,
`alert-dialog` and `textarea` all arrived with F07 and were reused as
they stand.

---

## Verification

`npm run typecheck`, `npm run lint`, `npm run build` — all clean.

**No browser run**, for the reason F07 gave: exercising this screen needs
the API and the database up, which is a `docker compose up` and a
migration — environment changes `CLAUDE.md` requires approval for, and
none was asked for in this session. So the claims above are the ones
static analysis and the contract support, and these are **not** yet
verified against a running backend:

- that a sort, a search and a page click each produce one request and
  the expected rows;
- that a duplicate `code` or `name` really answers `409` here and not
  `400`;
- that a department with employees refuses deletion;
- that the "Coloane" menu opens (it crashed on F07's first browser open,
  for a reason fixed in F01 — this page uses the fixed component, but
  "uses the fixed component" is an argument, not an observation);
- the responsive switch at 390 / 834 / 1440 px.

Six consecutive features have found a real defect the moment a browser
was pointed at them. The argument for a committed Playwright suite is
made once more below, and it is now the sixth time of asking.

---

## Notes

### What this feature was for, and what it found

The brief's own framing: *"validate that the leave-types pattern + the
DataTable are now solid and cleanly copyable on a trivial entity."*

They are. The evidence is the Files Modified table — two entries, both
of them this feature's own wiring. Copying the pattern required no
change to any shared piece, which is the difference between a pattern
and a description of one screen.

What it *did* find is that **the contract is the part that does not
copy.** Both corrections above came from reading `DepartmentQueryDto`,
the seed and the error-code catalogue rather than assuming the
leave-types contract generalised — and one of them (`?isActive=`) would
have shipped a control that answers `400`, not a control that quietly
does nothing, because `forbidNonWhitelisted` turns an invented parameter
into a hard failure. The lesson for list page three is that the
*structure* is copyable and the *parameters* must be re-read every time.

### What was deliberately not built

- **No filter control.** The endpoint accepts none. Argued above.
- **No `createdAt` column.** No company timezone yet. Argued above.
- **No view dialog.** The mock's menu has View, Edit, Delete. A
  department has four fields and all four are on screen; a read-only
  dialog would be the edit form with the inputs turned off.
- **No `GET /departments/:id` read.** The row is already in the list.
- **No optimistic writes.** A list row that appears and vanishes is
  worse than one that appears a moment late.
- **No `DEPARTMENTS.VIEW` on top of `PAGE_ACCESS`.** Reasoned above.

### The seam worth watching

F07 flagged that `IS_ACTIVE_FILTER` was a string constant that could
drift from the backend's parameter name without a compile error. That
seam **does not exist here**, because there is no filter — this screen's
entire query is either typed from the generated operation (`sortBy`,
`sortOrder`, `page`, `limit`) or supplied by the shared `toQueryParams`
(`search`). It is the one way in which the simpler entity is genuinely
safer, and it will come back the moment departments gain a filter.

---

## Future Improvements

1. **Run the browser checks**, as F03–F06 did and F07 did partially.
   Six features, six real defects found the moment a browser opened the
   page. This is the sixth time of asking for a committed Playwright
   suite instead of a throwaway harness.
2. **An `?isActive=` filter on the backend.** `LeaveTypeQueryDto` has
   one; `DepartmentQueryDto` does not, so a company with retired
   departments cannot hide them from this list. One optional boolean on
   the DTO and one clause in `buildSearchFilter` — and then
   `DepartmentsActiveFilter` here, a near-copy of the leave-types one.
   It is a backend feature and is noted as one.
3. **`errorCode`s for this module's `409`s.** The backend gives them
   none (it predates Feature 033), which is the entire reason
   `department-errors.ts` exists. Two codes — one for the duplicate, one
   for the in-use delete — plus `params.field` naming the column that
   collided and `params.count` naming how many employees block the
   delete, would let the codes go in `errors.json` beside every other
   one, delete that file, and let the form mark the *right* field. The
   service already computes both facts; it just has nowhere to put them.
4. **Show `createdAt`**, and offer the sort the backend already accepts,
   once something reads `GET /api/v1/work-schedule` and can supply the
   company timezone. Third feature carrying this item.
5. **Deactivate from the row menu.** Retiring a department is the action
   the in-use conflict points at, and it is currently four clicks away
   through the edit form. A third menu item doing one `PATCH` would make
   the advice actionable where it is given. Carried from F07, and now
   wanted on two screens — which is the argument for doing it.
6. **Remember the table state in the URL.** `useDataTableState` holds it
   in component state, so a reload or a shared link loses the page, the
   sort and the search. TanStack Router has typed search params for
   exactly this; it belongs in the shared hook. Carried from F07 and now
   affecting two screens.
7. **A shared `ListPage` shell.** The heading, the primary action, the
   `QueryBoundary` and the skeleton are now written out **twice**,
   identically, in `LeaveTypesPage` and `DepartmentsPage` — and F07 said
   "correct to write out twice; worth naming by the third". The third is
   the next list page. This is the item to do first.

---

# Amendment: the shared `VALIDATION_ERROR` fix (accessibility)

A field this form marked from a server rejection was **announced as valid**:
`setError(field, { type: 'server' })` carried no message, and `FormField`
derives `aria-invalid` and `aria-describedby` from whether there is one. The
submit was blocked while a screen reader said the input was fine.

Found by F11 on `/projects`, and identical in the six sibling forms, so it is
fixed **once, in a shared place** — `src/hooks/useServerFieldErrors.ts`, now the
only thing allowed to turn a rejected field name into a form error. This form
calls it instead of writing the loop; `lib/form-errors.ts` still recovers the
names and nothing else. The field carries `errors:field.rejected` ("the server
did not accept this value"), while the form-level `FormAlert` keeps saying *why*
the request failed, translated by `errorCode` — two different sentences, so
nothing prints twice.

The `409` handling on this screen is unchanged and still marks no field: the API
names no field for it, so marking one would mean guessing. That is argued in this
document's error section and is not the same defect.

Full reasoning, the file list and the browser evidence — `aria-invalid` before
and after, per screen — are in **F03's amendment, "a field the server rejected
was announced as *valid*"**. Cross-references F11's finding.
