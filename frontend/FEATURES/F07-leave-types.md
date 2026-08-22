# Leave Types — the first real list page

## Goal

Turn `/app/team/settings/leave-types` from a placeholder into a working
screen: list the kinds of leave the company recognises, add one, change
one, remove one.

The screen matters less than what it establishes. F01 built the shared
`DataTable` — server-side by design, table on desktop and cards below
`lg` — and nothing had used it. **This is its first consumer**, so the
way it is wired here is the way employees, timesheets, projects and
reports will be wired. A leave type is the right entity to do that on:
twelve flat fields, no relations, no state machine.

## Requirements

- The list page, built on the **existing** `DataTable` — no second table,
  no client-side paging, no re-solved responsiveness.
- Server-side throughout: sorting, searching and paging each fetch.
- Sorts offered only for the columns the backend enumerates.
- Create and edit through one react-hook-form + Zod form.
- Delete behind a confirmation, with the in-use conflict handled.
- Empty and error states, distinguishable from one another.
- Permission gating on `LEAVES` — page, and each action separately.
- `TimeSheet | Tipuri de concediu`, `ro`/`en`, responsive, accessible.
- Type-check, lint and build clean.

---

## The correction the brief needed

The brief asked for the coded error to be shown "on the right field" for
a duplicate `code` or `reportMarker`. It cannot be, and the reason is in
the contract rather than in the UI.

`LeaveTypesController` predates the backend's error-code catalogue
(Feature 033). Its `409` carries **no `errorCode`** — only a status and
an English sentence written for a log, which `CLAUDE.md` forbids
rendering. Which of the three unique fields collided is stated *only* in
that sentence. So there are three options: parse the English (forbidden,
and it is documented as free to be reworded), guess a field and mark the
wrong one red, or say what is true.

This screen says what is true. `useLeaveTypeErrorMessage` supplies the
sentence the generic `409` fallback cannot — "the code, the name or the
report marker is already used by another leave type" — derived from what
the *contract* documents a `409` to mean on this endpoint, not from what
the message says. It names all three because the API named none.

The same applies to `DELETE`, where the endpoint documents its `409`
precisely: a balance or a leave request still references the type. That
one is turned into a sentence that also points at what was almost
certainly meant — deactivate it instead, which retires the type without
touching anything recorded against it.

Both are marked in the code as deletions-in-waiting: when the backend
gives these two an `errorCode`, the codes go in the `errors` bundles
beside every other one and `leave-type-errors.ts` goes away.

---

## Routing and permissions

`/app/team/settings/leave-types`, the stub `settingsLeaveTypesRoute`
already declared. Only its `component` changed; the guard did not.

| Gate | Key | Where |
| --- | --- | --- |
| Open the page | `LEAVES.PAGE_ACCESS` | `requirePermission` in `team.routes.tsx` |
| Add | `LEAVES.CREATE` | `LeaveTypeCreateButton` |
| Edit | `LEAVES.EDIT` | the row menu's first item |
| Delete | `LEAVES.DELETE` | the row menu's second item |

**The resource is `LEAVES`, not `LEAVE_REQUESTS`.** The catalog holds
both and they are easy to confuse: `LEAVES` is the leave *configuration*
— the types themselves, the balances, the policies — while
`LEAVE_REQUESTS` is the separate screen where absences are asked for and
approved. A leave type is configuration, so this page and every action on
it gate on `LEAVES`. `LEAVES.VIEW` is deliberately not required on top of
`PAGE_ACCESS`: the catalog gives the resource both, the route guard
already refuses anybody without page access, and requiring two keys to
read one screen would hide it from an account the administrator meant to
grant it to.

`LEAVES.CONFIGURE` is not used here either. Its description in the
catalog is the rules balances are *judged* by — carry-over policy across
a year-end, notification addresses, the year-end generation run — which
is the Leave Balances feature, not this one. Creating a leave type is a
`CREATE`.

When neither `EDIT` nor `DELETE` is held the row menu is not rendered at
all, rather than rendered empty: a `…` that opens onto nothing is worse
than no `…`.

---

## The DataTable wiring — the part later lists should copy

```tsx
const { state, actions: baseActions } = useDataTableState({ sortBy: 'label' });
const { actions, isPending } = useDataTableTransition(baseActions);
const { items, meta } = useSuspenseLeaveTypes(state);   // key contains `state`
```

Four facts, and every one of them is load-bearing:

1. **`state` is the query key.** `leaveTypesQueryOptions` puts the
   resolved query in it, so page 2 is a *different cache entry* from page
   1 rather than an overwrite. Paging back is instant; a sort is a fetch
   of the sorted page rather than a re-order of the twenty rows on
   screen; nothing has to be invalidated for a control to take effect.
2. **The query is keyed on the resolved parameters, not on the raw
   state.** A search of `''` and a search of `'  '` are one request, so
   they are one entry rather than two fetches for one answer.
3. **`sortBy` is narrowed to the backend's enum.**
   `LeaveTypeSortKey` is read off the generated operation, so a column
   can only offer a sort the API accepts — and a column dropped from the
   backend's enum stops compiling here rather than answering `400` on the
   first click.
4. **`isActive` becomes a boolean at the edge.** `DataTableState.filters`
   is `Record<string, string | undefined>` because the shared table
   serves every resource and cannot know any endpoint's filters. The
   typed half belongs at the call site, which is `toLeaveTypesQuery`.

### `useDataTableTransition`, and why it had to exist

`CLAUDE.md` asks screens to read with `useSuspenseQuery`. Pair that
directly with a table whose state is in the query key and **every page
click blanks the table back to its skeleton** — a placeholder flashing on
every interaction, which is worse than the wait it covers.
`useSuspenseQuery` cannot take `placeholderData`, so `keepPreviousData`
is not available.

React already answers this: an update marked as a transition does not
re-show a `<Suspense>` fallback for a boundary that has already
rendered. So the table's actions are wrapped once, in a hook added beside
the `DataTable` rather than in this feature — the next list needs it just
as much — and `isPending` is fed to `DataTable`'s `isFetching`, which is
exactly the small toolbar spinner that prop was built for.

The **first** load still suspends into `DataTableSkeleton`. That is
correct: there is no previous content to keep, which is the case a
skeleton is for.

### Columns

| Column | `sortKey` | Rendering |
| --- | --- | --- |
| `code` | `code` | the icon tinted with the type's colour, then the code in mono |
| `label` | `label` | the name, with the description beneath it, clamped to two lines |
| `reportMarker` | — | the glyph in a bordered mono chip, as a report prints it |
| `defaultAllocatedDays` | `defaultAllocatedDays` | `21 zile`, or `—` for `null` |
| `allowsCarryOver` | — | a badge plus the ceiling in words |
| `isPaid` | — | `Plătit` / `Neplătit` |
| `requiresApproval` | — | `Cu aprobare` / `Fără aprobare` |
| `isActive` | — | `Activ` / `Inactiv` |
| actions | — | the `…` menu; `hideOnCard` |

**A column with no `sortKey` is not sortable, and five of them have
none deliberately.** Ordering a list by a two-valued column groups it
rather than sorts it, which `?isActive=` already does and does better —
the backend makes the same call, which is why its `sortBy` enum has four
entries and not eight.

`createdAt` is the fourth entry and is *also* not offered. Rendering an
instant needs the company timezone from `GET /api/v1/work-schedule`,
which nothing reads yet, and a date this application cannot format
correctly is worse than a date it does not show. It is the same deferral
F06 made for the same reason, and it lands in *Future Improvements*
again.

Every boolean prints **both** states rather than a badge for true and an
empty cell for false. An empty cell is ambiguous — unpaid, not loaded, or
not applicable — and each badge carries its word, so nothing depends on
colour alone.

`meta.label` on every column is not decoration: below `lg` the same cells
become a card's key/value pairs, and the label is the key.

### The filter slot

`?isActive=` only. `DataTable` takes filters as a slot rather than as
configuration, because every endpoint accepts a different set — so the
control belongs to the screen while its *value* goes through
`actions.setFilter` into `state.filters`, and therefore into the query
key, like every other control.

The endpoint also accepts `?isPaid=` and `?requiresApproval=`. Neither is
rendered: both columns are visible on every row and this list is short
enough to read, so those filters would save nobody a scroll. Retired
types are the one case where the list genuinely hides what somebody is
looking for.

---

## Forms & validation

One form for both writes. `UpdateLeaveTypeDto` is `CreateLeaveTypeDto`
with every field optional, so a second component would be the same twelve
inputs kept in step by hand. Which mutation runs follows from whether a
row was passed in.

The update sends **every** field rather than a diff. A `PATCH` naming a
field with its current value is a no-op on the server, and diffing buys
nothing while introducing the classic bug where clearing a field looks
identical to not touching it.

### Every rule is borrowed

`leave-type-schemas.ts` mirrors `leave-type.constants.ts` and the
`@IsLeaveType*()` decorators, with a table in its header naming the
backend constant each bound comes from. Two deliberate matches:

- **`code` and `reportMarker` are upper-cased before the pattern runs**,
  exactly as the DTO's `@Transform` does — so a lower-case code is
  accepted and stored upper-cased rather than refused for a rule the
  backend does not apply. A browser rule stricter than the server's would
  reject a value the API would have taken, which is the one direction a
  UX check must never err in.
- **`icon` has no pattern**, because the backend has none and says why:
  the vocabulary is the frontend's to choose.

### Empty is `null`, decided once

Four fields are nullable and every one means something specific when
absent: no accent colour, no description, *no suggested allocation*
(different from a suggestion of zero), *no carry-over ceiling*
(different from a ceiling of zero). An `<input>` produces `''`, so the
conversion lives in the schema and no component repeats it. A `0` typed
deliberately survives as `0`.

### The three fields that are not plain inputs

- **Icon** — a `Select` over the vocabulary this application ships,
  rendered as glyphs. `icon` is required, and a free text field would let
  somebody store `umbrela` and discover the broken glyph on somebody
  else's screen. `leave-type-icons.ts` is the vocabulary, stored under
  lucide's own kebab-case ids so the value means something outside this
  map. An unknown stored name renders a question mark rather than
  crashing — the column can hold a name seeded before the list existed.
- **Colour** — a native swatch picker and the hex code over one value,
  plus a clear button. `<input type="color">` alone cannot express "no
  colour", and it is fed a value only when the current one is a complete
  `#RRGGBB`, so a half-typed `#22C` does not flash black.
- **Carry-over ceiling** — kept visible and *disabled* while carry-over
  is off, rather than hidden. Hiding it would make the switch look
  consequence-free, and removing the input would discard a ceiling
  already stored on the record.

### Where a failure is reported

| Outcome | Where it shows |
| --- | --- |
| Create / update succeeded | list invalidated, dialog closed, success toast |
| Create / update `409` | `FormAlert` in the open form; dialog stays put |
| Create / update `VALIDATION_ERROR` | the named fields marked invalid *and given a sentence*, via `useServerFieldErrors` |
| Delete succeeded | list invalidated, dialog closed, success toast |
| Delete `409` | the sentence inside the still-open confirmation |

The rule, stated once: **a failure with an inline home is reported
inline; toasts are for successes and for failures with nowhere else to
go.** A rejected save happens with the form still open and the person
still looking at the fields, and `CLAUDE.md` puts validation feedback in
the form rather than in a toast. The delete follows it for a sharper
reason — closing the dialog and leaving a toast to explain a row that is
still in the list is exactly the half-deleted state to avoid.

Two consequences worth writing down: the form dialog unmounts with its
portal, so `defaultValues` are read fresh on every open and an abandoned
edit leaves nothing behind. The *delete* dialog does not — the mutation
outlives the popup — so it resets on close, or reopening would show the
previous attempt's refusal as though the new one had already failed.

---

## Empty and error states

Three different nothings, and the screen distinguishes all three:

| State | What renders |
| --- | --- |
| No leave types configured at all | `LeaveTypesEmptyState` **in place of** the table |
| A search or filter matched nothing | the table, with its own message inside it |
| The fetch failed | `QueryErrorState` — the translated error and a retry |

The first two are told apart by whether anything was asked for, not by
the count. A search that matches nothing keeps the toolbar, because the
term still in the box is the way out of it; an unconfigured list has no
term to clear and no rows to page, so a toolbar over an empty table would
offer controls for data that does not exist. The empty state's only
content is the call to action — and for somebody without `LEAVES.CREATE`
it renders the explanation alone, which is correct: they can see the list
is empty and that filling it is not their job.

The failure is a `QueryBoundary` away from the empty case by
construction: a thrown query cannot render as an empty list.

---

## Deleting the last row of a page

Removing the only row on page 3 leaves the table standing on a page the
result set no longer has. The backend answers that with an empty page
rather than an error — an empty screen that reads as "no leave types" and
is not — so the list steps back one page. `useDataTableState` documents
the same hazard for filters and solves it there; this is the one case it
cannot see, because it does not know a row was removed.

---

## UI primitives added

Four, all hand-written against Base UI — the kit `ui/` already uses — so
nothing had to be installed:

- `badge.tsx` — every variant from theme tokens, so a badge follows the
  account's palette. **No `success` green**: a hard-coded green would be
  the one element on screen ignoring the theme.
- `switch.tsx` — Base UI's, which renders a real hidden `<input>`, so it
  is focusable, Space-operable and announced as a switch.
- `alert-dialog.tsx` — separate from `Dialog` for the one difference that
  matters: it cannot be dismissed by the backdrop or Escape, so a
  destructive question is answered rather than waved away.
- `textarea.tsx` — `Input`'s counterpart, same tokens.

Plus two shared form pieces, `FormSwitchField` and `FormTextareaField`,
which do for a boolean and for prose what `FormField` already does for an
input: tie one generated id to the label, the control and the error, so
the wiring cannot drift per form.

---

## Theming / i18n

Everything is `ro` with an `en` fallback, both bundles complete — the
`satisfies` in `i18n/config.ts` makes a key added to one and forgotten in
the other a compile error. The icon names are translated too, since they
are shown to a person choosing one.

The only colour not from the theme is the leave type's own, which comes
from the database and is applied as an inline style — a value chosen per
record cannot be a Tailwind class. It tints a glyph and a faint disc
behind it, never any text, so nothing readable depends on a colour
somebody picked without a contrast check.

Page metadata is `usePageMeta`, as everywhere: `TimeSheet | Tipuri de
concediu` and a page-specific description.

---

## Files Created

| File | Purpose |
| --- | --- |
| `src/app/pages/LeaveTypesPage.tsx` | The screen: metadata, heading, create button, boundary. |
| `src/features/leave-types/leave-types-api.ts` | Generated types, the five calls, `toLeaveTypesQuery`. |
| `src/features/leave-types/leave-types-query.ts` | The list query options and the shared key prefix. |
| `src/features/leave-types/useLeaveTypes.ts` | The suspense read and the three mutations. |
| `src/features/leave-types/leave-type-schemas.ts` | The Zod schema and the backend's bounds. |
| `src/features/leave-types/useLeaveTypeSchemas.ts` | The same, in the current language. |
| `src/features/leave-types/leave-type-errors.ts` | The two `409`s the contract documents and the API does not code. |
| `src/features/leave-types/leave-type-icons.ts` | The icon vocabulary. |
| `src/features/leave-types/components/LeaveTypesTable.tsx` | The `DataTable` wiring. |
| `src/features/leave-types/components/useLeaveTypeColumns.tsx` | Columns, labels and sort keys. |
| `src/features/leave-types/components/LeaveTypeBadges.tsx` | The boolean and carry-over cells. |
| `src/features/leave-types/components/LeaveTypeGlyph.tsx` | Icon tinted with the record's colour. |
| `src/features/leave-types/components/LeaveTypeRowActions.tsx` | The per-row menu and its dialogs. |
| `src/features/leave-types/components/LeaveTypeForm.tsx` | One form, both writes. |
| `src/features/leave-types/components/LeaveTypeFormDialog.tsx` | The form's modal. |
| `src/features/leave-types/components/LeaveTypeCreateButton.tsx` | Button and dialog, self-contained. |
| `src/features/leave-types/components/LeaveTypeIconField.tsx` | The icon picker. |
| `src/features/leave-types/components/LeaveTypeColorField.tsx` | Swatch, hex and clear, over one value. |
| `src/features/leave-types/components/DeleteLeaveTypeDialog.tsx` | The confirmation. |
| `src/features/leave-types/components/LeaveTypesEmptyState.tsx` | Nothing configured yet. |
| `src/features/leave-types/components/LeaveTypesActiveFilter.tsx` | `?isActive=`, into the toolbar slot. |
| `src/components/data-table/useDataTableTransition.ts` | Keeps the current page while the next loads. |
| `src/components/form/FormSwitchField.tsx` | Labelled switch row. |
| `src/components/form/FormTextareaField.tsx` | `FormField`, for prose. |
| `src/components/ui/badge.tsx` | Status and flag labels. |
| `src/components/ui/switch.tsx` | Base UI switch. |
| `src/components/ui/alert-dialog.tsx` | The undismissable confirmation. |
| `src/components/ui/textarea.tsx` | Multi-line input. |
| `FEATURES/F07-leave-types.md` | This document. |

## Files Modified

| File | Change |
| --- | --- |
| `src/routes/team.routes.tsx` | `settingsLeaveTypesRoute` renders the page instead of the placeholder. |
| `src/locales/{ro,en}/common.json` | The `leaveTypes` bundle; `actions.cancel`, `actions.edit`, `actions.delete`. |

Nothing else. The route stub, its guard, the sidebar entry and the
`DataTable` itself were all already correct.

## Dependencies

None. `@base-ui/react`, `lucide-react` and `zod` were already installed;
the four new primitives are written against them.

---

## Verification

`npm run typecheck`, `npm run lint`, `npm run build` — all clean.

**No browser run this time**, unlike F03–F06. Exercising this screen
needs the API and the database up, which is a `docker compose up` and a
migration — environment changes `CLAUDE.md` requires approval for, and
none was asked for in this session. So the claims above are the ones
static analysis and the contract support, and these are *not* yet
verified against a running backend:

- that a sort, a search and a page click each produce one request and the
  expected rows;
- that a duplicate `code` really answers `409` here and not `400`;
- that a leave type referenced by a balance refuses deletion;
- the responsive switch at 390 / 834 / 1440 px.

The last four features each found a real defect that way. This one
should get the same treatment before it is called done — see *Future
Improvements*.

### And it found one immediately

Opening the page in a real browser found what the three clean commands
could not: **the "Coloane" button crashed the screen.** The cause was not
in this feature — `DropdownMenuLabel` is Base UI's `Menu.GroupLabel` and
throws without a `Menu.Group` above it, in a popup that is portalled in
only on open, in a `DataTable` that had never had a consumer. It is
written up as an amendment to F01, which owns the component.

Two things this feature owns came out of it. The row-actions column now
declares `enableHiding: false`, so the visibility menu cannot offer to
hide the only way to act on a row — the convention for every later list.
And it is the fifth consecutive feature where a browser found a defect
that static analysis could not, which is the argument for item 1 below,
made once more.

---

## Notes

### What was deliberately not built

- **No second table.** The requirement was to prove the shared one, and
  the proof is that this feature adds no sorting, no pagination and no
  responsive logic — the only thing it adds *near* the `DataTable` is the
  transition hook, which is about `useSuspenseQuery`, not about tables.
- **No view dialog.** The mock's actions menu has View, Edit, Delete. A
  leave type has twelve fields and eight of them are already columns;
  a read-only dialog would be the edit form with the inputs turned off.
  The description — the one field not on screen — is under the label in
  the `label` column.
- **No optimistic writes.** The profile's theme is optimistic because the
  cache *is* the rendering. A list row is not: a create that appears and
  vanishes is worse than one that appears a moment late, and the
  server's own copy is what lands in the cache either way.
- **No `LEAVES.VIEW` on top of `PAGE_ACCESS`.** Reasoned above.

### The one thing a future change could quietly break

The four sort keys are typed from the generated operation, so they cannot
drift. The **filter name** cannot be: `IS_ACTIVE_FILTER` is a string
constant matched against `LeaveTypesQuery`'s optional `isActive`, and
renaming the parameter on the backend would type-check here and silently
stop filtering. It is one line in `toLeaveTypesQuery`, which is why it is
in one place — but it is the seam worth watching in every later list.

---

## Future Improvements

1. **Run the browser checks**, as F03–F06 did. Four features, four
   throwaway harnesses, four real defects found. This is the fifth time
   of asking for a committed Playwright suite instead.
2. **Show `createdAt`**, and offer the sort the backend already accepts,
   once something reads `GET /api/v1/work-schedule` and can supply the
   company timezone.
3. **`errorCode`s for this module's `409`s.** The backend gives them none
   (it predates Feature 033), which is the entire reason
   `leave-type-errors.ts` exists. Two codes — one for the duplicate, one
   for the in-use delete, ideally with `params` naming the field that
   collided — would let the codes go in `errors.json` beside every other
   one, delete that file, and let the form mark the *right* field.
4. **Deactivate from the row menu.** Retiring a type is the action the
   in-use conflict points at, and it is currently four clicks away
   through the edit form. A third menu item doing one `PATCH` would make
   the advice actionable where it is given.
5. **Remember the table state in the URL.** `useDataTableState` holds it
   in component state, so a reload or a shared link loses the page, the
   sort and the search. TanStack Router has typed search params for
   exactly this; it belongs in the shared hook, not in this screen, and
   it is worth doing before there are ten list pages rather than after.
6. **A shared `ListPage` shell.** The heading, the primary action, the
   `QueryBoundary` and the skeleton are the same four things every list
   screen will assemble. Correct to write out twice; worth naming by the
   third.
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
