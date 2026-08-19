# Profile — the account screen

## Goal

Give the person a page about themselves: what the company records about
them, and the very short list of it they own.

F05 already read `GET /profile/me` — the header needed a username and a
chosen palette had to survive a reload — so the plumbing existed and the
*screen* did not. This feature is the screen, its route, and the account
menu's link to it. Nothing here re-fetches, re-types or re-wraps what F05
built.

## Requirements

- A `/profile` route in the authenticated area. Authentication only, no
  permission.
- An entry point from the account menu.
- Account read-only: email, username, role, status.
- Employment read-only, HR-owned, with the no-employee case handled.
- One editable field, and its save translated, toasted and validated.
- Theme preferences reused rather than rebuilt — and a decision about
  whether they belong here at all.
- Suspense + a skeleton shaped like the page, responsive, `TimeSheet |
  Profil`, `ro`/`en`.
- Type-check, lint and build clean.

---

## The correction the brief needed

The brief said the phone is an **account** field, editable beside the
email and the username. It is not: `phone` is a column of `employees`,
and `ProfileEntity` publishes it inside the employment half.

The wire hides that — one `PATCH /profile/me` body spans two tables, and
`ProfileService` splits it — with **one consequence a caller can see**:

> an account with no employment record may set its preferences and may
> not set a phone, because there is no row to set it on. Asking anyway is
> a `403` carrying `AUTH_NO_EMPLOYEE_RECORD`.

So the phone form is **inside the employment card**, not the account
card. That is not filing; it is what makes the empty case explain itself.
A *Contact* card of its own would have had to disappear for an account
with no employee while looking like it belonged to the account — which is
precisely the arrangement in which a missing field reads as a bug. Put it
on the record it belongs to, and "no employment record → no employment
card → no phone field" follows from the layout.

The rest of the brief's list held exactly: everything else is read-only,
and the reason is `UpdateProfileDto`'s — three writable fields, two of
which are the theme.

---

## Routing

`/app/profile`, hanging off `workspaceRoute`.

The brief asked for "a `/profile` route in the authenticated area", and
in this route tree those are the same sentence. `workspaceRoute` carries
the **only** authentication guard, deliberately — F05's argument is that
one `beforeLoad` covers every child, present and future, so a screen
added next year cannot be public because somebody forgot to protect it. A
top-level `/profile` would be a second place that check has to be
written, and the first one anybody would forget to update.

It also settles the workspace without deciding anything: `workspaceForPath`
reads the `/app/team` prefix, this is not under it, so the sidebar keeps
the personal menu. Your own account is your own work, not administration.

### It declares no permission, and that is the whole rule

Every other screen under `/app` names the `PermissionRequirement` its
menu item names. This one has neither. A profile is the caller's own
record, `GET /profile/me` cannot name anybody else, and a permission
gating it would be a permission that can be revoked to lock somebody out
of their own phone number.

`workspaceIndexRoute` is the only other unguarded route under `/app`, for
an unrelated reason F05 gives. Two exceptions, both argued.

---

## The entry point, and why there is exactly one

`SidebarUserMenu`'s profile item — the seam F05 left present and disabled
— now renders `<Link to="/app/profile">`.

It is `render={<Link/>}` rather than an `onClick` that navigates, so the
item **is** an anchor: middle-clickable, openable in a new tab, announced
as a link. Verified in the DOM: `A`, `href="/app/profile"`,
`data-slot="dropdown-menu-item"`.

**The header strip did not get a second one.** The brief allowed either
or both, and F05 had already recorded the answer to the question the
second one asks: sign out appearing in both the header and the sidebar
menu was one control too many, and the likely resolution was for the
account *menu* to own the account actions. Adding a second door to the
profile would have been that same mistake made again with the answer
already written down.

**It is not in the sidebar menu either.** That menu is the workspace's
screens, filtered by permission; an account screen is neither.

### But the header still has to say where you are

`findActiveTarget` reads the navigation, so a screen absent from it fell
back to the application's name — the header would have read *TimeSheet*
on a page whose heading said *Profil*.

`navigation.ts` gains `ACCOUNT_TARGETS`, a list of routes that have
titles without being menu items, searched alongside the menu. It is the
smaller of the two claims available: it names screens, not permissions,
so the profile does not acquire a permission it does not have or a
workspace row it does not want.

Longest match still decides, which fixes a second thing for free: on
`/app/profile` the dashboard's `/app` no longer wins, so the sidebar
highlights **nothing** — correct for a screen that is not in its menu,
and better than leaving the dashboard lit on a page that is not the
dashboard.

---

## UI / Components

| Component | What it is |
| --- | --- |
| `ProfilePage` | The route component: metadata, heading, and the boundary. |
| `ProfileSections` | The three cards, and the one place the profile is read. |
| `ProfileAccountCard` | Email, username, role, status. Text, not disabled inputs. |
| `ProfileEmploymentCard` | The HR-owned facts, the phone form, or the empty state. |
| `ProfilePhoneForm` | The only editable field on the screen. |
| `ProfileAppearanceCard` | F05's pickers, on the page. |
| `ProfileDetailList` | A `<dl>` of labelled facts. Both cards render one. |
| `ProfileSkeleton` | The same three cards, in the same grid, as skeletons. |
| `ThemePreferenceFields` | **Extracted from `ThemePaletteDialog`** — see below. |

### Read-only means text, not a disabled input

There is not one `disabled` field on this page. A greyed-out input
advertises an edit that is coming; email, username, role and status are
not coming — each is changed elsewhere by somebody entitled to, and the
backend's DTO lists where. Text is the honest rendering of a value
somebody else owns.

Measured rather than asserted: the page contains **exactly one**
`input`/`select`/`textarea`, `type="tel"`, `name="phone"`.

### `ProfileDetailList` is a `<dl>` because that is what it is

A grid of `<div>`s would look the same and say nothing. `<dt>`/`<dd>`
tells a screen reader that *Departament* labels *Development* rather than
the two being adjacent text, which is the entire content of the
component.

Each pair is wrapped so it **stacks** below `sm` — label above value —
and the wrapper becomes `display: contents` at `sm`, dissolving into the
grid so every label lines up in one column. One markup, two layouts.

A `null` renders as `—` rather than as a blank: an empty cell is
indistinguishable from a rendering fault, while a dash says the field is
genuinely empty.

### The cards do not stretch

`items-start` on the grid. Grid items stretch by default, which gave the
account card — four facts — the height of the employment card's eight
plus a form, and a card whose lower half is empty reads as something that
failed to load.

---

## The theme on this page: reused, by extraction

**Decision: yes, the pickers are on the profile page — and there is still
only one implementation of them.**

The argument for putting them here is that they are the *other* thing on
this screen that belongs to the person rather than to the company. The
profile is, in total, a phone number and two preferences. A profile page
that sent somebody to a header icon to change their own theme would be an
account screen that omits half the account.

The argument against — a second copy of the UI that agrees today and
drifts later — is exactly the failure F05 documents in the mock, whose
`ThemeCustomizer` was a second theme system beside the first and was
*already* wrong. So it was not copied. The two pickers and the mutation
behind them moved out of `ThemePaletteDialog` into
`ThemePreferenceFields`, and both surfaces mount that.

"Behaves identically to the dialog" is therefore a property of there
being one component, not a claim to re-check whenever either changes.

It renders a **fragment of two sections** rather than a container, so each
caller keeps its own spacing — which is what lets the dialog add a third
section after them without a prop deciding whether the preview shows.

**The card has no preview, and the dialog keeps one.** A dialog covers
the page it is changing, so it has to show a swatch of what it did. The
card covers nothing: the cards around it re-round and the button below it
recolours as the choice is made. The page is the preview; a preview *of*
the page inside the page would be the smaller, worse copy.

Light/dark stays out of both, for the reason `theme.ts` gives at length
and the card's description now states on screen: the palette and the
radius are stored on the account, light versus dark is stored on the
device.

---

## State & Data

No new endpoint, no new query. One new mutation.

| Hook | New? | What it does |
| --- | --- | --- |
| `useProfile` | no | `Profile \| undefined`, for the shell. |
| `useSuspenseProfile` | **yes** | `Profile`, for a screen whose subject it is. |
| `useUpdateThemePreferences` | no | The theme, optimistically. |
| `useUpdatePhone` | **yes** | The phone, not optimistically. |
| `useProfileQueryKey` | **yes**, private | The account-scoped key, derived once. |

### Two read hooks, because there are two kinds of caller

`useProfile` answers `undefined` for an anonymous session **without
consulting the cache**, and its callers need that: the header falls back
to the address, the theme falls back to the backend's column defaults.

A profile *page* has no such fallback — an undefined profile is not a page
with less on it, it is no page at all — so it reads the query the way
`CLAUDE.md` asks a screen to: `useSuspenseQuery`, suspending into a
skeleton shaped like what arrives, throwing to an error boundary when it
fails. It may only be called under `/app`, where the guard has already
redirected an anonymous visitor and awaited `loadProfile`.

In practice it suspends for no time at all. The boundary earns its place
on a hard reload of `/app/profile` and on the refetch after `staleTime`.

### The phone mutation is deliberately *not* optimistic

`useUpdateThemePreferences` writes the cache before the request settles
because the cache **is** the rendering — a palette that waited for a round
trip would feel broken. A phone number renders nothing but itself, in a
field the person is still looking at. There is nothing to gain by showing
it as saved before it is, and a rollback in a field somebody may have kept
typing into is worse than a short wait and an honest answer.

So it waits, then replaces the entry with the **server's own copy** of the
whole profile — which is possible because the endpoint answers
`ProfileEntity`. The cache ends up holding what was stored, trimmed and
folded to `null` by `@IsEmployeePhone()`, not what was typed. Verified:
saving `+40 700 123 456` and then reading `GET /profile/me` returns it,
and the field shows the server's value.

### `useProfileQueryKey`

The key is scoped to the account, for the reason `profile-query.ts` gives:
a profile belonging to somebody else is then a *different query* rather
than a stale entry. Two mutations now write it, so it is derived in one
place rather than restated — the second copy is the one that forgets the
scope when it changes.

---

## Forms & Validation

`react-hook-form` + Zod through `zodResolver`, and the rules are the
backend's, borrowed rather than invented:

| Rule | Value | Source |
| --- | --- | --- |
| max length | 30 | `EMPLOYEE_PHONE_MAX_LENGTH` |
| trimmed | yes | `@IsEmployeePhone()`'s `@Transform` |
| blank → `null` | yes | the same, and the column is nullable |

**No format check**, matching the backend decision rather than improving
on it: the column holds whatever a person typed, in whichever national
convention. A browser rule stricter than the server's would refuse a
value the API would have accepted, which is the one direction a UX check
must never err in.

### Clearing it is a request, not an omission

An emptied `<input type="tel">` posts `''`. That is not a shorter phone
number — it is the absence of one, and the request expressing it is
`phone: null`. The schema's `transform` does that conversion once, so the
component never decides it twice and the mutation is handed what the wire
wants. Verified end to end: the field cleared and saved leaves
`employee.phone === null`.

### The button is disabled until something changes

A `PATCH` naming nothing writes nothing and answers the profile unchanged
— the backend is explicit that this is not an error — so an untouched
submit would be a request, a success toast, and nothing to report.
`isDirty` turns that into a button that says there is nothing to save.

`reset` on success re-baselines against what was actually stored, so the
field stops being dirty and shows the server's trimmed value.

### Errors

Translated by `errorCode`, never the raw message — `useApiErrorMessage`,
as everywhere. `rejectedFields` marks the input when a `VALIDATION_ERROR`
names it. `AUTH_NO_EMPLOYEE_RECORD` joined both error bundles: the form is
not rendered without an employment record, so it should not normally be
reachable, but a form that cannot normally produce an error is not the
same as one whose errors need not be readable.

---

## Dates

`hireDate` needed a new helper, and the reason is a real bug avoided.

`CLAUDE.md` requires every timestamp in the **company timezone**, and
`lib/datetime.ts` enforces it in the signature: all three functions
*require* a zone. `formatCalendarDate` is the deliberate exception and
fixes the zone to `UTC`.

A hire date is a day on a calendar, not a moment. The backend parses
`2026-09-01` into a `DateTime`, which lands on midnight UTC and comes
back as `2026-09-01T00:00:00.000Z`. Rendering *that instant* in any zone
west of Greenwich prints the previous day — a hire date one day early for
a colleague in London, and nobody would guess why. Reading it back in the
zone it was written in returns the day that was typed, and there is no
other day it could mean.

The helper is shared rather than local because holidays and leave dates
are the same kind of value.

### `createdAt` is not shown, and that is not an oversight

It is a genuine instant, so the company-timezone rule applies to it, and
`GET /api/v1/work-schedule` is not read by any feature yet. Printing it in
the browser's zone to avoid an empty row would be the one thing that rule
exists to prevent. It joins the card the day the work-schedule query does.

---

## Password

Nothing was built and nothing was linked. Changing a password requires
proving the current one, which a `PATCH` cannot do; it is
`POST /auth/change-password` and its own feature. The brief allowed a link
to the future screen — there is no future screen to link to yet, and a
control leading nowhere is what F05 declined to ship for the profile entry
itself.

---

## Theming / i18n

Both bundles, `ro` and `en`:

- `pages.profile.{title,description}` — the title is `Profil`, so the
  document reads `TimeSheet | Profil`.
- `profile.*` — the three cards, the phone form and its validation.
- `accountStatus.*`, `employeeStatus.*`, `seniority.*` — three enums the
  page is the first to render. Keyed by the contract's own member names,
  like `roles.*`, so a member added to the backend is a missing key rather
  than a wrong label.
- `actions.save`.
- `errors.AUTH_NO_EMPLOYEE_RECORD`.
- `account.unavailable` **pruned** — the string said the profile screen
  was coming, and it is here.

---

## Files Created

| File | What it is |
| --- | --- |
| `src/routes/profile.route.tsx` | `/app/profile`, guarded by its parent and nothing else. |
| `src/app/pages/ProfilePage.tsx` | Metadata, heading, and the query boundary. |
| `src/features/profile/profile-schemas.ts` | The phone rule, and `'' → null`. |
| `src/features/profile/useProfileSchemas.ts` | The same, in the current language. |
| `src/features/profile/components/ProfileSections.tsx` | The three cards. |
| `src/features/profile/components/ProfileAccountCard.tsx` | Read-only account. |
| `src/features/profile/components/ProfileEmploymentCard.tsx` | Read-only employment, plus the form or the empty state. |
| `src/features/profile/components/ProfilePhoneForm.tsx` | The one editable field. |
| `src/features/profile/components/ProfileAppearanceCard.tsx` | The pickers, on the page. |
| `src/features/profile/components/ProfileDetailList.tsx` | Labelled facts, responsive. |
| `src/features/profile/components/ProfileSkeleton.tsx` | The fallback, shaped like the page. |
| `src/components/theme/ThemePreferenceFields.tsx` | The pickers and their mutation, extracted from the dialog. |
| `FEATURES/F06-profile.md` | This document. |

## Files Modified

| File | Change |
| --- | --- |
| `src/features/profile/useProfile.ts` | `useSuspenseProfile`, `useUpdatePhone`, and the shared query key. |
| `src/components/theme/ThemePaletteDialog.tsx` | Renders the extracted fields; keeps the dialog and the preview. |
| `src/components/layout/SidebarUserMenu.tsx` | The disabled profile item becomes a link. |
| `src/features/workspace/navigation.ts` | `ACCOUNT_TARGETS`, searched by `findActiveTarget`. |
| `src/routes/routeTree.ts` | `profileRoute` under `/app`. |
| `src/lib/datetime.ts` | `formatCalendarDate`. |
| `src/locales/{ro,en}/common.json` | `profile`, `pages.profile`, three enums, `actions.save`; `account.unavailable` pruned. |
| `src/locales/{ro,en}/errors.json` | `AUTH_NO_EMPLOYEE_RECORD`. |

## Dependencies

None.

---

## Verification

`npm run typecheck`, `npm run lint`, `npm run build` — all clean.

### In a real browser

Headless Chrome over the DevTools Protocol, the approach F03–F05 used.
**35 assertions, all passing, console clean.** The harness lives in the
session scratchpad and is not committed — the fourth feature in a row to
say so, and see *Future Improvements*.

| Group | Checks |
| --- | --- |
| The way in | the account menu's item is an `A` with `href="/app/profile"`, not disabled |
| The page | route resolves; `document.title` is `TimeSheet \| Profil`; a page-specific meta description; the header names *Profil* |
| Account | address, `MIO`, `Administrator`, `Activ` — each read out of its own `<dt>`/`<dd>` pair |
| Employment | name, `EMP-0002`, department, position, `17.06.2019` as `dd.MM.yyyy`, and an absent end date as `—` |
| What is editable | **exactly one** input on the page, `type="tel"`, `name="phone"`; no password field anywhere |
| Appearance | eight swatches and five radius tiles, one checked in each, with the dialog's own `aria-label`s |
| Saving | Save disabled until dirty; `+40 700 123 456` stored and read back through the app's own axios instance; the field shows the server's value; the success toast |
| Clearing | an emptied field stores `null` |
| Validation | 31 characters is refused inline — `aria-invalid`, and the message names 30 |
| No employment record | `GET /profile/me` intercepted and rewritten to `employee: null`: the empty state is explained, **zero** inputs are offered, the account card still renders, and both theme pickers still work |
| Responsive | no horizontal scroll at 1440, 834 and 390 px |

The last group is the one worth keeping. No seeded account lacks an
employment record — every seed row creates both halves — so the case the
backend refuses with `AUTH_NO_EMPLOYEE_RECORD` is unreachable by signing
in as anybody. Rewriting the response through CDP's `Fetch` domain
exercises it against the real component tree rather than against an
argument that it would probably work.

The harness restores the seeded account's original phone in a `finally`,
so the development database ends the run as it started.

Two defects were found and fixed by running it, neither visible to `tsc`
or to ESLint: the account card stretching to the employment card's height
(now `items-start`), and — in the harness itself — a menu that had not
opened, because Base UI opens on `pointerdown` and `element.click()` does
not produce one. F05 wrote that lesson down; it was still cheaper to
re-learn than to remember.

---

## Notes

### Why this feature is mostly deletion of a placeholder

The interesting work — deciding that the server's copy of the theme is
the only copy, scoping the query to the account, awaiting the profile
before the shell mounts — was done by F05's amendment. What was left was
a screen, and a screen that reuses everything is a short feature. The
temptation in that position is to add something to justify the number.
The things not added are listed above: no password UI, no `createdAt`
formatted in the wrong zone, no second entry point in the header, no
username field for an endpoint that would answer `400`.

### The dialog and the card cannot disagree

Worth restating because it is the one claim in this feature that a future
change could quietly break: they render the same component. Adding a
third preference means editing `ThemePreferenceFields`, and both surfaces
get it. Adding it to one of them would mean deliberately not using the
shared component, which is a visible thing to do in review.

---

## Future Improvements

1. **Show `createdAt`** once something reads `GET /api/v1/work-schedule`
   and can supply the company timezone. The row is written and commented
   out of existence by its absence, not by preference.
2. **The change-password screen**, and then a link to it from the account
   card. `POST /auth/change-password` exists; the flow does not.
3. **Editing the username.** It is `string \| null` on the account, the
   header falls back to the address without one, and nothing lets a person
   set it — but widening `UpdateProfileDto` is a backend decision about
   what somebody may change about themselves, not a frontend one.
4. **Keep the browser checks.** Four features, four throwaway harnesses,
   and each has found a real defect that the type checker and the linter
   could not. F05 asked for a Playwright suite; this is the second time of
   asking.
5. **A shared `EnumLabel` helper.** Three enum label maps arrived here at
   once (`accountStatus`, `employeeStatus`, `seniority`) and every future
   list screen will render the same ones. `t(\`seniority.${value}\`)` is
   fine twice and a pattern worth naming by the fifth.
