# Leave Notification Emails — a second section on somebody else's page

## Goal

Let an administrator configure the addresses a leave request is sent to
for approval — `hr@firma.ro` and its colleagues — from the screen that
already holds the rest of the leave configuration.

The backend module was already complete: a top-level collection with
four verbs, a paginated list, and one meaningful field. So this feature
is entirely about *where* that list belongs and what a screen for a
five-row configuration list should look like when the application's
default list component is a server-side `DataTable` with a search box, a
sort menu, a column-visibility menu and a page-size selector.

## Requirements

- A clearly separated section **below** the leave-types table on
  `LeaveTypesPage.tsx` — no new route, no new menu item, and never mixed
  into the table.
- Its own feature folder, mirroring `leave-types/`, so the page composes
  it and knows nothing else.
- List, add, correct and remove, against the existing endpoints, with the
  generated types.
- A duplicate address reported without inventing an error code.
- Delete behind a confirmation.
- Actions gated on the same `LEAVES` keys the leave types on this page
  use.
- `ro`/`en`, responsive, accessible, toasts, unchanged page metadata.
- Type-check, lint and build clean, **and browser-verified**.

---

## The three decisions worth arguing

### 1. A list, not the `DataTable`

`CLAUDE.md` makes the server-side `DataTable` the default for any list
that can grow, and adds the exemption this uses: *"if a table is
genuinely tiny and fixed (e.g. a short config list)"*.

A row here is **one value**. A `DataTable` would render a single column
carrying a search box, a sort menu, a column-visibility menu with nothing
to hide, a page-size selector and a responsive table→cards switch — all
to display text that already fits on a phone. The controls would outweigh
the data, on a section sitting under somebody else's table.

**What is not dropped is the server.** The endpoint is paginated and the
list pages against it: `page` goes into the TanStack Query key, so page 2
is a request and a cache entry of its own rather than a slice held in the
browser, and paging is wrapped in a `useTransition` for the same reason
`useDataTableTransition` exists — without it every click would suspend
the section back to its skeleton. Ten rows a page, smaller than the
shared default of twenty, because this is a section rather than a screen.
The pager renders only when there is a second page, which for most
companies is never.

Two things are deliberately not offered. `?search=` — the resource has
one field, the list is alphabetical, and a search box over five addresses
saves nobody a scroll. `?sortBy=` — `email` ascending is the backend's
own default and the order a person reads addresses in; the alternative,
`createdAt`, needs the company timezone that nothing reads yet (the same
deferral F06 and F07 both made). Both are one argument away in
`toLeaveNotificationEmailsQuery`.

### 2. Add is inline; correcting is a dialog

A leave type is twelve fields and needs a modal. An address is **one**,
and putting one input behind a button, a portal and a dismissal is more
ceremony than the thing it collects. So the add form is permanently
visible at the top of the section, which has a second effect worth
having: the field is labelled, so what the list holds is legible before
anything is clicked — and the empty state therefore needs no call to
action of its own, because the affordance is already on screen.

**Editing is kept** rather than reduced to delete-and-re-add, because the
`PATCH` exists precisely so a typo can be corrected without changing the
id a client may hold or losing `createdAt` — the record of when the
company started notifying that mailbox. It opens in a dialog because an
edit belongs to a *row*, and an input appearing inside a list, shifting
everything under it, is harder to follow than a modal that says which
address it is about.

Both use **one** `LeaveNotificationEmailForm`; which mutation runs follows
from whether a row was passed in, exactly as `DepartmentForm` decides it.

### 3. The `409` goes on the field — the first screen that can do this

F07 and F08 both answer a duplicate with a sentence naming *every* unique
column, because their `409` could have come from any of two or three and
the API says which only in English prose that `CLAUDE.md` forbids
rendering.

This resource has **one field**. `LeaveNotificationEmailsService` raises
its only `ConflictException` in `assertEmailIsFree`, on a
case-insensitive match against `email`, and the contract declares one
`409` per write verb. There is nothing to disambiguate, so the message is
set on `email` through `setError`, where the value to change is — and the
form-level `FormAlert` is suppressed for that one case, so a refusal on a
single-input form is reported once rather than twice.

No code is invented for it. `leave-notification-email-errors.ts` exports
one predicate over the *status*, with the reasoning written down, and is
a deletion-in-waiting: when the backend gives this `409` an `errorCode`,
the code joins `errors.json` beside every other one and the file goes
away. Everything that is not a `409` — a `VALIDATION_ERROR` naming the
field, a `404` on a row somebody else just removed, a `403`, a dead
network — keeps the ordinary treatment through `useApiErrorMessage`.

---

## UI / Components

```
LeaveTypesPage
└── LeaveNotificationEmailsSection          <section>, <h2>, rule, Card
    ├── LeaveNotificationEmailAddForm        gated on LEAVES.CREATE
    │   └── LeaveNotificationEmailForm       one input, both writes
    └── QueryBoundary → LeaveNotificationEmailsList
        ├── LeaveNotificationEmailsEmptyState
        ├── rows + LeaveNotificationEmailRowActions
        │   ├── LeaveNotificationEmailFormDialog   → the same form
        │   └── DeleteLeaveNotificationEmailDialog  AlertDialog
        └── the pager (only when totalPages > 1)
```

**Three things keep it from reading as part of the table above**, and all
three are needed: a rule and a wide top margin, so the break is visible
rather than a gap; its own `<h2>` and description, so the reader is told
this is a different subject; and its own `Card`, so the addresses sit on
their own surface. The heading is an `<h2>` under the page's `<h1>` — the
outline reads "Leave types → notification addresses", which is what the
page is.

The heading and the add form are **outside** the query boundary: both
state facts that do not depend on the response, so they render
immediately and stay put while the list suspends into
`LeaveNotificationEmailsSkeleton` — shaped like the list, not like a
`DataTable`, because a placeholder for controls that never appear is a
promise the real component breaks. A failed fetch renders
`QueryErrorState` inside the card, so the section fails on its own
without taking the leave types down with it.

Rows animate in and out with `AnimatePresence` (opacity + height, and
`layout` only when motion is allowed), honouring `prefers-reduced-motion`
by collapsing the duration to zero — the shared rule from `FadeIn` and
`FormAlert`.

## State & Data (TanStack Query)

| | |
| --- | --- |
| Key | `['leave-notification-emails', 'list', resolvedQuery]` |
| Read | `useSuspenseQuery`, 30 s stale time — configuration several administrators share |
| Paging | local `useState` + `useTransition`, page in the key |
| After a write | invalidate the **whole** prefix, not one page |

Every page is invalidated because the list is ordered by `email`: a new
address sorts into whichever page it falls on, a corrected one moves, and
a removed one shifts every row after it up by one.

Removing the only row of page 2 leaves the list on a page the result set
no longer has — the backend answers that with an empty page rather than
an error — so the list steps back one, the same hazard `LeaveTypesTable`
handles and for the same reason.

## API Integration

All four verbs of the existing module, through the generated operations
and `apiGet`/`apiPost`/`apiPatch`/`apiDelete`:

| Call | Endpoint | Notes |
| --- | --- | --- |
| list | `GET /api/v1/leave-notification-emails` | `page`, `limit`, `sortBy: 'email'`, `sortOrder: 'asc'` — all four required by the generated query type |
| add | `POST` | body is `{ email }` **only**; `forbidNonWhitelisted` makes anything else a `400` |
| correct | `PATCH /{id}` | the one field |
| remove | `DELETE /{id}` | `200` with `data: null`; nothing references an address, so there is no in-use `409` |

`LeaveNotificationEmail`, the two DTOs and the sortable-column union are
read off `components['schemas']` and the `findAll` operation — so a
column dropped from the backend's `sortBy` enum is a compile error here
rather than a `400` at runtime.

## Forms & Validation

One Zod schema, one field, every bound borrowed:

| Field | Rule | Backend source |
| --- | --- | --- |
| `email` | required, ≤ 254, valid, trimmed, **lower-cased** | `@IsEmailAddress()`, `EMAIL_MAX_LENGTH` |

The lower-casing is the deliberate match with the DTO's `@Transform`:
PostgreSQL's unique index is case-sensitive while every mail server
treats one mailbox as one mailbox, so folding here means the value the
form sends is the value that gets stored — and `HR@firma.ro` collides
with an existing `hr@firma.ro` instead of looking like a new address
right up until the `409`.

Messages are injected from the bundles through
`useLeaveNotificationEmailSchemas`, the arrangement F06–F08 all use.

The inline form `reset()`s itself on success, because it stays mounted;
the dialog does not need to, because it unmounts with its portal and
re-reads `defaultValues` on every open. The delete dialog *does* reset
its mutation on close, because it outlives the popup.

## Permissions — and how they line up with the backend

| Affordance | Key |
| --- | --- |
| See the section | `LEAVES.PAGE_ACCESS` (the route's guard, unchanged) |
| Add | `LEAVES.CREATE` |
| Correct | `LEAVES.EDIT` |
| Remove | `LEAVES.DELETE` |

**What the backend actually enforces is authentication, and nothing
more.** `PermissionsGuard` is a global `APP_GUARD`, but it gates only
routes carrying `@RequirePermission()` — it explicitly lets an undeclared
route through, because Feature 035 rolled the gate out module by module
rather than inventing a policy for thirty existing ones.
`LeaveNotificationEmailsController` carries none. Neither does
`LeaveTypesController`. So both lists on this page are, today,
**authenticated-only** on the server.

Given that, the honest choice is the one made here: gate the section's
actions on exactly the keys the leave types beside them use, so one page
does not offer two different answers to "may I change the leave
configuration". The `LEAVES` resource is the leave *configuration* — as
F07 argued, `LEAVE_REQUESTS` is the separate screen where absences are
asked for — and an address on this list is configuration by the same
reading. `LEAVES.CONFIGURE` is deliberately not used: the catalog
describes it as the rules balances are judged by, which is the Leave
Balances feature.

This is presentation, not protection, and the code says so where it
matters. **The moment the backend declares a requirement on these routes,
this table is what it should be declared as** — and if it declares
something else, this is the one place to change.

The ladder makes the difference visible: `HR - Standard` holds
`LEAVES.CREATE` and `LEAVES.EDIT` but not `LEAVES.DELETE`, so an HR
account gets the add form and a row menu with one item. Verified in the
browser, below.

## Theming / i18n

A `leaveNotificationEmails` bundle in both `ro` and `en`, complete in
each — the `satisfies` in `i18n/config.ts` makes a key added to one and
forgotten in the other a compile error. The pager reuses the existing
`table.*` keys (`totalRecords`, `pageOf`, `previousPage`, `nextPage`)
rather than adding a second set of words for the same controls.

No new colours, no theme changes. Page metadata is untouched: this is
still `TimeSheet | Tipuri de concediu`, because it is still that page.

## Routing

**None.** No route, no menu item, no guard change. The section is a
component the existing page renders.

## Files Created

| File | Purpose |
| --- | --- |
| `src/features/leave-notification-emails/leave-notification-emails-api.ts` | Generated types, the four calls, the query builder. |
| `src/features/leave-notification-emails/leave-notification-emails-query.ts` | The list query options and the shared key prefix. |
| `src/features/leave-notification-emails/useLeaveNotificationEmails.ts` | The suspense read and the three mutations. |
| `src/features/leave-notification-emails/leave-notification-email-schemas.ts` | The Zod schema and the backend's bounds. |
| `src/features/leave-notification-emails/useLeaveNotificationEmailSchemas.ts` | The same, in the current language. |
| `src/features/leave-notification-emails/leave-notification-email-errors.ts` | The uncoded `409`, and why it may name the field. |
| `src/features/leave-notification-emails/components/LeaveNotificationEmailsSection.tsx` | The section: heading, card, boundary. |
| `src/features/leave-notification-emails/components/LeaveNotificationEmailsList.tsx` | The rows, the pager, the page state. |
| `src/features/leave-notification-emails/components/LeaveNotificationEmailForm.tsx` | One form, both writes. |
| `src/features/leave-notification-emails/components/LeaveNotificationEmailAddForm.tsx` | The inline add, gated. |
| `src/features/leave-notification-emails/components/LeaveNotificationEmailFormDialog.tsx` | The edit modal. |
| `src/features/leave-notification-emails/components/LeaveNotificationEmailRowActions.tsx` | The per-row menu and its dialogs. |
| `src/features/leave-notification-emails/components/DeleteLeaveNotificationEmailDialog.tsx` | The confirmation. |
| `src/features/leave-notification-emails/components/LeaveNotificationEmailsEmptyState.tsx` | Nothing configured yet. |
| `src/features/leave-notification-emails/components/LeaveNotificationEmailsSkeleton.tsx` | The suspense fallback, shaped like the list. |
| `FEATURES/F10-leave-notification-emails.md` | This document. |

## Files Modified

| File | Change |
| --- | --- |
| `src/app/pages/LeaveTypesPage.tsx` | Renders `<LeaveNotificationEmailsSection />` below the table; the doc comment says why both live here. |
| `src/locales/{ro,en}/common.json` | The `leaveNotificationEmails` bundle. |

Nothing else. No new UI primitive, no new shared component, no
dependency — `alert-dialog`, `dialog`, `dropdown-menu`, `FormField`,
`FormAlert`, `SubmitButton`, `QueryBoundary` and `Spinner` were all
already there.

---

## Verification

`npm run typecheck`, `npm run lint`, `npm run build` — all clean.

### Browser (Playwright MCP, against the running API)

Exercised on `/app/team/settings/leave-types` at 1440 px and 390 px, as
`SUPERADMIN` and then as `HR`:

| Checked | Result |
| --- | --- |
| The page shows the table **and** the section below it | Both render; rule, `<h2>` and separate card keep them apart |
| Add an address | Appears in place (sorted), field clears, toast `Adresa „…” a fost adăugată.` |
| Add a **duplicate**, upper-cased (`CONCEDII@FIRMA.RO`) | `409` → the coded/handled sentence **on the field**, `aria-invalid`, no crash, no second alert |
| An invalid address | Caught by Zod, message tied to the input by `aria-describedby`, **no request sent** |
| Correct an address (`Concedii.HR@firma.ro`) | Stored lower-cased, dialog closes, focus returns to the row's trigger |
| Delete | `AlertDialog` confirm → row removed, toast, dialog closed |
| Delete the only row on page 2 | List steps back to page 1; pager disappears at 10 records |
| Pagination | With 11 addresses: `11 înregistrări · Pagina 1 din 2`, next/prev correct and correctly disabled |
| Empty state | With the list cleared: "Nicio adresă de notificare" and the pointer at the field above |
| Permissions (`HR`) | Add form present; row menu offers **only** *Modifică* — no *Șterge*, matching `HR - Standard` |
| Keyboard | Menu opens, `Escape` closes it and returns focus to its trigger; `Enter` submits the add form |
| Responsive at 390 px | Section, form and rows stack; **no horizontal scroll** (`scrollWidth === clientWidth`) |
| Console | Only the pre-login `401`s on `/auth/me` and `/auth/refresh`, and the expected `409` |

Two notes on the run itself:

- **Toasts needed a real measurement, not a look.** Sonner's default
  duration is four seconds, which is shorter than a round trip through
  the MCP — so a snapshot taken after the click finds an empty toaster
  and looks exactly like a broken toast. Polling the DOM from inside the
  page found each one within 100 ms, with the right text. Worth
  remembering: *"I did not see the toast"* is not evidence here.
- The addresses on the development database were removed and re-created
  to test the empty state; `hr@test.com` and `test@test.com` were
  restored through the form afterwards.

---

## Notes

### What was deliberately not built

- **No route and no menu item.** The addresses are leave configuration,
  gated the same way, read by the same person in the same sitting. A
  sidebar entry for a list of three would cost more than the screen
  behind it.
- **No search or sort control.** Reasoned above; the endpoint supports
  both and the client is one argument from either.
- **No `isActive` on an address.** The model has no such column — an
  address is removed with `DELETE`, which is the endpoint that means it.
  (The controller's `PATCH` summary mentions "the active flag"; the DTO,
  the entity and the schema all disagree with it, and the generated
  contract is what this feature followed. Worth a line in the backend's
  docs.)
- **No optimistic writes**, for the reason F07 gives: a row that appears
  and vanishes is worse than one that appears a moment late.

### The seam worth watching

`toLeaveNotificationEmailsQuery` hard-codes `sortOrder: 'asc'` and the
page size. Both are typed, so neither can drift into an invalid value —
but the *choice* of `email` as the sort is a decision this file makes
alone, and it is what lets the list be read without a search box. If the
default ever changes, the argument for having no search changes with it.

---

## Future Improvements

1. **An `errorCode` for this module's `409`.** The backend emits none
   (it predates Feature 033 for this purpose), which is the entire reason
   `leave-notification-email-errors.ts` exists. One code — ideally with
   `params.email` — would let the sentence live in `errors.json` beside
   every other one and delete that file.
2. **Declare the permission on the backend routes.** The UI gates on
   `LEAVES.CREATE`/`EDIT`/`DELETE` while the API asks only for a valid
   token. Adding `@RequirePermission()` to both this controller and
   `LeaveTypesController` would make the screen's gating a statement
   about access rather than about menus. The table in *Permissions*
   above is the proposal.
3. **Search, if the list ever grows.** `?search=` is already there; the
   control is a `FormField` and one piece of state away. Not before it is
   needed.
4. **Show `createdAt`**, once something reads `GET /api/v1/work-schedule`
   and can supply the company timezone — the same deferral F06 and F07
   made, and the same third time of asking.
5. **A shared `Section` shell.** The heading, the description, the rule
   and the card are the four things any second section on a page will
   assemble. This is the first; correct to write out twice, worth naming
   by the third — the same note F07 left about a `ListPage` shell.
