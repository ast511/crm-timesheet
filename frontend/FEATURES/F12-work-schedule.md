# Work Schedule — the first screen that is not a list

## Goal

Give an administrator the company's working week, its hour rules and the
addresses a completed timesheet is sent to, on one screen, matching the
mock's three-card design.

Every settings feature before this one — F07 leave types, F08 departments,
F09 public holidays, F11 projects — renders a *collection*: a `DataTable`,
a create button, a row menu, a dialog per record. **This one renders one
record that always exists at one address.** There is no table, no
pagination, no create and no delete. It is a form, read with `GET` and
replaced whole with `PUT`.

That shape follows from the resource rather than from a preference, and
the backend's controller says why: the URL is singular and carries no id
because "a collection would imply a client may choose between
configurations, and there is nothing to choose from".

It is also the first screen the rest of the application will *depend* on.
`GET /api/v1/work-schedule` is, in the backend's words, "the endpoint
every client needs before it renders a single timestamp" — the company
timezone lives on it, and `lib/datetime.ts` requires a zone in every
signature precisely so nothing silently uses the browser's. The query
introduced here is where that value will come from.

## Requirements

- The mock's three cards, in order and in its visual design: the working
  week with presets and a count badge, the hours and limits as a
  two-column grid, the approval addresses as chips.
- One `PUT` carrying the complete configuration, because that is the only
  write the resource has.
- `timezone` editable by no control on this screen and **lost by none
  either**. *(Superseded — see the amendment at the end: it is now an
  editable field, and still lost by none.)*
- The approval addresses mirroring F10, against this module's endpoints.
- `WORK_SCHEDULE.EDIT` for the schedule, `WORK_SCHEDULE.CONFIGURE` for the
  addresses — the backend's own split, not one smoothed over.
- The `404` before a first save treated as a state to act on, not an error
  to retry.
- `ro`/`en`, responsive, accessible, toasts, page metadata.
- Type-check, lint and build clean, **and browser-verified**.

---

## The five decisions worth arguing

### 1. Two cards, one `<form>`

The mock's working-days selector writes each toggle straight into a store.
That is right for a store and wrong for this API. `PUT /work-schedule`
replaces the configuration: every field on the DTO is required, the
service writes every column from the body, and a partial body is a `400`.
So a toggle that saved on click would have to send every hour rule along
with it — including any the person was halfway through editing in the card
below.

So the days are a field like any other: `Controller`-bound, dirtying the
form, saved by the one Save button underneath. **The mock's layout
survives intact** — the days are still their own card with their own
heading, the hours are still theirs, and the button is still at the bottom
of the second. What changed is only that pressing it saves both, which is
the only thing the API can do.

The emails card is a separate `<form>` outside that one, which it has to
be: forms cannot nest, and it is a different resource on a different
permission.

### 2. `timezone` is round-tripped, not omitted

> **Superseded on 2026-08-22** — see *Amendment — the timezone is a
> field, not a hidden value* at the end of this document. The reasoning
> below about *why the value must not be lost* still holds and is what
> the amendment builds on; the conclusion that it should not be
> **settable** does not. Kept as written, because the amendment is a
> correction of it.

The DTO documents an omitted `timezone` as "leave unchanged", so doing
nothing would have worked. The form sends it back anyway, read from the
loaded configuration.

Two reasons. It keeps the request a genuine whole-object replace, which is
what the verb means. And it means the screen cannot lose the value even if
that DTO exception is ever withdrawn — the exception exists for a
migration reason the backend itself calls out as temporary, and this form
should not be the thing that breaks when it goes.

What matters more is what round-tripping is *for*. Changing the zone
re-interprets which calendar day every stored instant falls on. The
backend refuses to let that happen as a side effect, and so does this: the
value is deliberately kept **out of the form's state**, so
`reset(defaults)` cannot touch it either. Restoring "the defaults" must
not quietly move a company from `America/New_York` to Bucharest.

Verified in the browser against a stored `America/New_York` — see below.

### 3. "Ore standard pe săptămână", where the mock said "maxime"

The mock's store had a `maxHoursPerWeek`. **This backend has no such
field.** The only weekly figure on `WorkSchedule` is
`standardHoursPerWeek` — "what a full week is expected to add up to", a
target rather than a ceiling.

Keeping the mock's label would have put the word *maximum* on a value
nothing enforces as one. The layout, the grid position and the visual
treatment are the mock's; only the noun is not, and the helper text says
what the value actually does. The daily figures keep their meanings
exactly: `maxHoursPerDay` really is a ceiling, `standardHoursPerDay`
really is a target.

`weekStartsOn` goes the other way — the mock has no control for it, and
this screen adds one. The column exists, the `PUT` writes it, and it is
the one thing on this screen that says where one week ends and the next
begins, which is what the weekly figure beside it is measured against. It
sits in the working-week card, and it is deliberately *not* restricted to
the days ticked above, matching `@IsWeekStartsOn()`: a company working
Monday to Friday whose payroll week begins on Sunday is an ordinary
arrangement.

### 4. Blocking errors and non-blocking notes are different things

`CLAUDE.md` forbids a browser rule stricter than the server's — it would
refuse a body the API would have stored, which a person cannot argue with.
But two of the numbers on this form can contradict each other in ways
worth mentioning.

So the screen says both, differently:

| Rule | Treatment | Why |
| --- | --- | --- |
| `maxHoursPerEntry > minHoursPerEntry` | **Field error**, blocks the submit | `assertEntryRangeIsOrdered` is a real `400`. Answering it here means it is answered before a request rather than by one. |
| `standardHoursPerDay ≤ maxHoursPerDay` | **Advisory note**, Save stays live | Nothing on the backend enforces it. It is almost certainly a typo, and it is not this form's place to refuse it. |
| `maxHoursPerEntry ≤ maxHoursPerDay` | **Advisory note**, Save stays live | Same: contradictory, and accepted. |

The notes live in `work-schedule-advisories.ts`, in a neutral tone, in a
polite live region, and explicitly not styled as errors — dressing a
suggestion as a refusal is how a form stops being believed. If the backend
ever adopts either rule, it moves into the schema and out of that file.

One rule the mock's schema had is **deliberately not carried over**: that
the end of the day must be after its start. The backend's own decorator
explains why not — "a shift that runs 22:00 to 06:00 crosses midnight and
is a real schedule". Refusing it would make this screen unable to describe
a company that works nights.

### 5. The `404` gets a form, not an error state

`GET /work-schedule` answers `404` until a first `PUT`, and the backend
documents that as "a legitimate state on a fresh deployment". It is caught
in the query function and turned into a `null` schedule, so:

- the form renders pre-filled with the documented defaults;
- an explanatory alert says nothing is stored yet, in two versions —
  somebody with `EDIT` is told to check the values and save, somebody
  without is told who can;
- the emails card says the addresses come later and **issues no request**,
  because `assertConfigured` would answer `404` for that too.

`QueryErrorState` with a retry button would have been a control that could
never help. Catching it in the query function rather than in the component
is what keeps `null` a *cached* answer — otherwise the boundary would
catch a throw, TanStack Query would retry it, and the screen would flicker
through an error state on its way to a form it was always going to render.

---

## UI / Components

```
WorkSchedulePage                              <h1>, page metadata
└── QueryBoundary → WorkScheduleSettings      suspends once, for both halves
    ├── WorkScheduleForm                      ONE <form>, one PUT
    │   ├── WorkScheduleNotConfiguredAlert    only when nothing is stored
    │   ├── WorkingDaysSection                Card 1 — Controller-bound
    │   │   ├── presets + count Badge
    │   │   ├── WeekdayToggle × 7             aria-pressed, in a role="group"
    │   │   └── FormSelectField               weekStartsOn
    │   └── WorkScheduleHoursSection          Card 2 — the grid and the buttons
    │       ├── HoursField × 6                shared number field
    │       ├── advisories (polite live region)
    │       ├── FormAlert                     the translated errorCode
    │       └── Save + Reset                  gated on WORK_SCHEDULE.EDIT
    └── TimesheetApprovalEmailsSection        Card 3 — its own resource
        ├── QueryBoundary → TimesheetApprovalEmailsList
        │   └── TimesheetApprovalEmailChip
        │       └── DeleteTimesheetApprovalEmailDialog
        └── TimesheetApprovalEmailAddForm     gated on WORK_SCHEDULE.CONFIGURE
```

**The weekday toggles are real toggle buttons.** `<button aria-pressed>`
rather than the mock's unlabelled styled `<div>`-alike: the control has two
states and toggling takes effect on the spot, which is what `aria-pressed`
describes. Enter *and* Space activate natively, and the focus ring, the
disabled state and the tab order come free. The accessible name is the
**full** day name and does not change with the viewport — the long label is
hidden below `sm` to fit seven controls on a phone, so `aria-label` is what
stops a screen reader announcing "Lu" there and "Luni Lu" above it. The
visible text is `aria-hidden`, being a second rendering of the same name.

Selection is not signalled by colour alone (`CLAUDE.md` forbids it): a
selected day is filled *and* ringed *and* raised.

**The chips' `×` opens a confirmation**, where the mock removes on the
first click. The click is against an irreversible `DELETE`, on a control a
few millimetres wide in a row of near-identical ones, and what it silently
stops is a mailbox receiving timesheets for approval. The failure mode of a
mis-click is an approval queue nobody is watching, discovered at the end of
a month.

**The add control is disclosed, where F10's is always open.** Not an
inconsistency: F10's form *is* how that section explains itself, because
its list has no other affordance. Here the card already carries a title and
a sentence saying what the addresses do, so a permanently open field would
add a third of the card's height for something used twice a year. The mock
makes the same call. `autoFocus` on disclosure keeps it honest for the
keyboard — the field did not exist a moment ago, and it exists because the
person pressed the button that reveals it.

## State & Data (TanStack Query)

| | Schedule | Addresses |
| --- | --- | --- |
| Key | `['work-schedule','detail']` | `['work-schedule','emails']` |
| Read | `useSuspenseQuery` | `useSuspenseQuery` |
| Stale | **5 min** | 30 s |
| Paging | — (singleton) | — (endpoint is unpaginated) |
| After a write | `setQueryData(response)`, then invalidate the prefix | invalidate the prefix |

Five minutes for the schedule, longer than the thirty seconds the leave
configuration uses, because the working week is the most static
configuration in the application and is about to become the value every
screen reads before rendering a timestamp. A short window would make the
same unchanged row a request on every navigation.

The save writes the **response** into the cache before invalidating.
The response *is* the new state, and it can differ from what was
submitted in a way worth seeing: `workingDays` is sorted into week order
before it is stored, so somebody who ticks Saturday before Wednesday gets
the week back in order rather than in click order.

**The form is not re-keyed when the query refetches.** `useForm` reads
`defaultValues` once, so a refetch returning different values leaves the
inputs as loaded. Forcing a remount would keep them in step at the cost of
discarding whatever the person had typed, on a schedule the stale window
makes unpredictable, and would pull focus out of the field being edited.
The case that matters is covered by the save's own `reset(response)`.

## API Integration

| Call | Endpoint | Notes |
| --- | --- | --- |
| read | `GET /api/v1/work-schedule` | ungated on the backend; `404` → `null` |
| save | `PUT /api/v1/work-schedule` | whole object, `timezone` included |
| list | `GET /api/v1/work-schedule/emails` | unpaginated |
| add | `POST /api/v1/work-schedule/emails` | `{ email }` only; `409` on a duplicate |
| remove | `DELETE /api/v1/work-schedule/emails/{id}` | `200` with `data: null` |

### One generated type is wrong, and it is worked around rather than replaced

`components['schemas']['UpdateWorkScheduleDto']` declares `workingDays` as
**`Weekday[][]`** — an array of arrays. That is a defect in the published
document, not the contract: the backend's DTO property is `readonly
workingDays!: Weekday[]`, the entity that comes back is `Weekday[]`, and
the service stores a flat array. The nesting comes from `@IsWorkingDays()`
decorating the property with a bare
`ApiProperty({ minItems, uniqueItems })`, which overrides the Nest CLI
plugin's inferred array type and leaves Swagger wrapping the inferred one a
second time.

Nothing is hand-written in response. `UpdateWorkSchedule` is the generated
body with `workingDays` re-taken from `WorkScheduleEntity` — the half of
the same contract that is right — so a field added to either arrives here
on the next `npm run gen:api`. The cost is **one cast**, confined to
`saveWorkSchedule`, with the reasoning above it. The fix belongs on the
backend's decorator; see *Future Improvements*.

Verified on the wire: the `PUT` body carries a flat
`["MONDAY",…,"FRIDAY"]`.

### `WEEKDAYS` is a value the contract cannot supply

A type is not a value, so the week has to be written out. It is *checked*
against the contract instead: `AllWeekdaysAreListed` fails to compile if
the enum ever gains a day the array omits — which is the failure worth
catching, a day the company could work and this screen could not offer.

## Forms & Validation

Every bound borrowed from `work-schedule-field.decorators.ts`:

| Field | Rule | Backend source |
| --- | --- | --- |
| `workingDays` | at least one, real weekdays, no duplicates | `@ArrayNotEmpty()`, `@ArrayUnique()`, `@IsEnum(Weekday,{each:true})` |
| `weekStartsOn` | a weekday, need not be a working one | `@IsWeekStartsOn()` |
| `workStartTime` / `workEndTime` | `HH:mm`, 24-hour, zero-padded | `WORK_TIME_PATTERN` |
| five per-day hour fields | `> 0`, `≤ 24`, ≤ 2 decimals | `@IsHours()` |
| `standardHoursPerWeek` | the same, `≤ 168` | `@IsWeeklyHours()` |
| `lunchBreakHours` | `≥ 0` — zero is valid | `@IsLunchBreakHours()` |
| `maxHoursPerEntry > minHoursPerEntry` | strictly | `assertEntryRangeIsOrdered` |
| `email` | required, ≤ 254, valid, trimmed, lower-cased | `@IsEmailAddress()` |

**The hour fields are strings in the form and numbers on the wire**, the
arrangement `estimatedHoursField` uses in `project-schemas.ts` and for the
same reason: `valueAsNumber` turns an empty input into `NaN`, which reads
back as "expected number, received nan" rather than "enter a number".
Holding the string means each mistake produces exactly one message — an
empty field says it is required and not also that it is not a number.

`min`/`max`/`step` on the inputs are hints for the spinner and for
assistive technology, not the validation: the form carries `noValidate`, so
the browser's own constraint checking never refuses a submit. Two
mechanisms would otherwise disagree in two languages.

Server-rejected fields go through the shared **`useServerFieldErrors`**
hook, which attaches a translated message and therefore a real
`aria-invalid` — the message-less `setError` bug F03's amendment fixed is
not reintroduced. Verified against a real `VALIDATION_ERROR` envelope,
below.

The `409` on a duplicate address goes **on the field**, as F10 established
for the same shape of form: one editable value, nothing to disambiguate, so
the sentence belongs where the value to change is. The form-level alert is
suppressed for that one case, so one refusal is reported once.

## Permissions — matching the backend cell for cell

| Affordance | Key | Backend |
| --- | --- | --- |
| Open the screen | `WORK_SCHEDULE.PAGE_ACCESS` | the route's guard, unchanged |
| Read the configuration | — | `GET` is ungated, deliberately |
| Save the schedule | `WORK_SCHEDULE.EDIT` | `@RequirePermission` on the `PUT` |
| Add / remove an address | `WORK_SCHEDULE.CONFIGURE` | `@RequirePermission` on `POST` and `DELETE` |

**`WORK_SCHEDULE` is the one resource in the catalog whose `EDIT` and
`CONFIGURE` name two genuinely different jobs** rather than two sizes of
the same one. The catalog's own words: `EDIT` is "change the working days,
hours and entry limits"; `CONFIGURE` is "maintain the addresses notified
when a timesheet needs approval". `Admin - Standard` holds the first and
not the second — one of nine cells the seed withholds from that tier — so
an ordinary administrator may change the working week and may **not**
reroute the approval mail to themselves.

So one screen asks for two permissions, on purpose. This is the same
`CONFIGURE`-versus-`EDIT` distinction F10's amendment settled for the leave
addresses, and it is got right here the first time.

Somebody without `EDIT` sees every control disabled and no Save or Reset;
somebody without `CONFIGURE` sees the chips with no `×` and no add button.
In both cases the values stay **readable**, because knowing the company's
hours and where timesheets go is worth having for anybody entitled to the
page. Both were exercised in the browser.

`GET` staying ungated is a property to preserve rather than an oversight:
the company timezone lives on this resource, so guarding the endpoint would
break the formatting of every date in the application.

## Theming / i18n

A `workSchedule` bundle in both `ro` and `en`, complete in each — the
`satisfies` in `i18n/config.ts` makes a key added to one and forgotten in
the other a compile error. It nests an `emails` sub-bundle rather than
adding a second top-level key, because the addresses are part of this
screen rather than a feature that happens to sit on it.

Weekday names come from the bundles, not from `Intl`. A locale-derived name
would be a fourth source of Romanian in an application whose other strings
all live in `locales/`, `Intl`'s Romanian abbreviations are three letters
(`lun.`) where this design needs two, and it would make the labels follow
the browser's locale data rather than the language chosen in the switcher.

The count badge uses i18next plurals with Romanian's three categories
(`_one`, `_few`, `_other`), so `1 zi lucrătoare` and `5 zile lucrătoare`
are both right. `en` carries the same three keys for the `satisfies` check;
only two are ever selected there.

No new colours and no theme changes. Page metadata is
`TimeSheet | Program de lucru`, from the existing
`pages.settingsWorkSchedule` keys the placeholder already used.

## Routing

`settingsWorkScheduleRoute` swaps `WorkspacePlaceholderPage` for
`WorkSchedulePage`. **The guard is unchanged** at
`WORK_SCHEDULE.PAGE_ACCESS`, matching how `TEAM_NAVIGATION` gates the
sidebar entry — the two have to agree, or a visible menu item leads to a
refusal.

No correction was needed of the kind F09 made for public holidays, where
`PAGE_ACCESS` turned out to be held further along the roles than the people
who should be changing a shared configuration. Here the screen is worth
*reading* for everybody who holds the key, and what may be *changed* is
decided inside the page on two narrower ones.

## Files Created

| File | Purpose |
| --- | --- |
| `src/features/work-schedule/work-schedule-api.ts` | Generated types, the five calls, `WEEKDAYS`, the bounds, the defaults. |
| `src/features/work-schedule/work-schedule-query.ts` | Both query options; the `404` → `null` conversion. |
| `src/features/work-schedule/useWorkSchedule.ts` | The suspense read and the save. |
| `src/features/work-schedule/useTimesheetApprovalEmails.ts` | The addresses: one read, two writes. |
| `src/features/work-schedule/work-schedule-schemas.ts` | The Zod schema, the field list, `toWorkScheduleFormInput`. |
| `src/features/work-schedule/timesheet-approval-email-schemas.ts` | The one-field address schema. |
| `src/features/work-schedule/useWorkScheduleSchemas.ts` | Both schemas, in the current language. |
| `src/features/work-schedule/work-schedule-advisories.ts` | The non-blocking coherence notes, and why they are not rules. |
| `src/features/work-schedule/work-schedule-errors.ts` | The uncoded `404` and `409`, and what each may be read as. |
| `src/features/work-schedule/useWeekdayOptions.ts` | The seven named weekdays, in week order. |
| `src/features/work-schedule/components/WorkScheduleSettings.tsx` | The three cards, once the configuration is known. |
| `src/features/work-schedule/components/WorkScheduleForm.tsx` | The one `<form>`: submit, reset, gating. |
| `src/features/work-schedule/components/WorkingDaysSection.tsx` | Card 1. |
| `src/features/work-schedule/components/WeekdayToggle.tsx` | One accessible toggle button. |
| `src/features/work-schedule/components/WorkScheduleHoursSection.tsx` | Card 2, and the page's Save. |
| `src/features/work-schedule/components/HoursField.tsx` | The shared hour input. |
| `src/features/work-schedule/components/WorkScheduleNotConfiguredAlert.tsx` | The fresh-deployment state, said out loud. |
| `src/features/work-schedule/components/WorkScheduleSkeleton.tsx` | The suspense fallback, shaped like all three cards. |
| `src/features/work-schedule/components/TimesheetApprovalEmailsSection.tsx` | Card 3. |
| `src/features/work-schedule/components/TimesheetApprovalEmailsList.tsx` | The chips, animated. |
| `src/features/work-schedule/components/TimesheetApprovalEmailChip.tsx` | One address and its `×`. |
| `src/features/work-schedule/components/TimesheetApprovalEmailAddForm.tsx` | The disclosed add form. |
| `src/features/work-schedule/components/DeleteTimesheetApprovalEmailDialog.tsx` | The confirmation. |
| `src/features/work-schedule/components/TimesheetApprovalEmailsSkeleton.tsx` | The chips' fallback. |
| `src/app/pages/WorkSchedulePage.tsx` | The route's component. |
| `FEATURES/F12-work-schedule.md` | This document. |

## Files Modified

| File | Change |
| --- | --- |
| `src/routes/team.routes.tsx` | `WorkspacePlaceholderPage` → `WorkSchedulePage`; the guard is unchanged, and the doc comment records the two-key split. |
| `src/components/form/FormField.tsx` | **A `description` prop**, mirroring the one `FormSelectField` already had — rendered under the input and tied to it by `aria-describedby`, composed with the error id exactly as that component composes its two. Additive and optional, so no existing caller changes. |
| `src/locales/{ro,en}/common.json` | The `workSchedule` bundle. |

No new dependency, no new UI primitive. `card`, `badge`, `alert-dialog`,
`select`, `FormField`, `FormSelectField`, `FormAlert`, `SubmitButton`,
`QueryBoundary`, `Can` and `useServerFieldErrors` were all already there.

---

## Verification

`npm run typecheck`, `npm run lint`, `npm run build` — all clean.

### Browser (Playwright MCP, against the running API)

Exercised on `/app/team/settings/work-schedule` at 1440 px and 390 px, as
a super-admin, then as an `EDIT`-without-`CONFIGURE` account, then as a
read-only one.

| Checked | Result |
| --- | --- |
| The three cards render with the seeded configuration | Working week, hours grid, chips — matching the mock's layout |
| Page title | `TimeSheet \| Program de lucru` |
| Toggling a weekday | `aria-pressed` flips, badge → `6 zile lucrătoare` (Romanian *few* plural) |
| **Keyboard** on a toggle | Focus, `Space` → pressed, badge → `7 zile lucrătoare`, focus retained |
| Presets | `Toată săptămâna` becomes visibly active at 7 days; `Luni - Vineri` restores five |
| `maxHoursPerEntry` = `minHoursPerEntry` | Zod refuses, `aria-invalid=true`, message tied by `aria-describedby`, **no request sent** |
| Advisory (`standardHoursPerDay` 10 > `maxHoursPerDay` 8) | Note shown, **Save still succeeded** — proving it does not block |
| The `PUT` body | Flat `workingDays`, all eleven fields, `timezone` included, `200` |
| Save | Toast `Programul de lucru a fost salvat.`; values persist across a reload |
| **Timezone round-trip** | Stored `America/New_York` via the API, saved an unrelated field from the form, re-read: **still `America/New_York`** |
| Reset | Fields and working days back to the documented defaults; **zero requests** — form-only, as designed |
| Server field rejection (intercepted `VALIDATION_ERROR` naming two fields) | Both marked `aria-invalid` **with a translated message**; an untouched field stayed valid; the alert carried the translated `errorCode` |
| Add an address, mixed case (`F12.Verify@Company.COM`) | Stored lower-cased, chip sorts into place, field clears, form stays open, toast quotes the **stored** value |
| Add a duplicate, upper-cased (`HR@EXAMPLE.COM`) | `409` → sentence **on the field**, `aria-invalid`, form-level alert suppressed — reported once |
| Remove an address | `AlertDialog` names the address; confirm → chip gone, toast, dialog closed |
| `autoFocus` on disclosure | Pressing "Adaugă adresa de email" puts the caret in the revealed field |
| **`EDIT` without `CONFIGURE`** | Schedule editable and saved successfully (toast); **no add button, no `×` on any chip**; addresses still readable |
| **Read-only** (`PAGE_ACCESS` + `VIEW` only) | Every input and toggle `disabled`, no Save/Reset, no email controls; configuration and addresses still readable |
| **Not configured** (intercepted `404`) | Alert + defaults in the form + no error state; the emails card said addresses come later and **issued no request** |
| Responsive at 390 px | Hours grid → one column; weekday row still seven columns at 38 px with short labels only; chips wrap; **no horizontal scroll** (`scrollWidth === clientWidth`) |
| Console | Only the pre-login `401`s on `/auth/me`, and the `409`/`400`/`404` this run deliberately caused |

Three notes on the run itself:

- **Toasts needed a real measurement, not a look** — the same lesson F10
  recorded. Sonner's default duration is shorter than a round trip through
  the MCP, so a snapshot taken after a click finds an empty toaster and
  looks exactly like a broken toast. Each one was found by polling the DOM
  from inside the page, within 100 ms, with the right text.
- **The `EDIT`-without-`CONFIGURE` account had to be made.** No seeded
  account holds that combination: in this development database the `ADMIN`
  user carries all fifty-five permissions, and the `HR` user holds only
  `PAGE_ACCESS` and `VIEW`. `WORK_SCHEDULE.CONFIGURE` was revoked from the
  admin through `PUT /users/{id}/permissions`, the screen was checked, and
  the permission was restored. Worth knowing for the next feature that has
  to verify a tier boundary.
- **The development database was restored to the state it was found in**:
  the schedule back to `Europe/Bucharest` / nine-to-six / Monday-to-Friday
  with a one-hour lunch, the four approval addresses unchanged, and the
  admin's permissions back to fifty-five.

---

## Notes

### What was deliberately not built

- **No timezone control**, matching the mock. The value is round-tripped
  instead. It is not an oversight but a deferral with a reason: changing
  the zone re-interprets days that have already happened, which the backend
  calls "a rare administrative setting rather than a routine toggle", and
  it deserves its own affordance with its own warning rather than a select
  between two hour fields.
  **— Reversed on 2026-08-22.** The deferral was wrong: the app is
  deployed in more than one country, and a company that cannot set its
  zone has every calculation done against somebody else's. See the
  amendment at the end.
- **No edit for an address.** The sub-resource has no `PATCH` — unlike
  F10's, which does — so a typo is fixed by removing and adding. Nothing
  here renders an edit control that would have nowhere to go.
- **No pager, search or sort on the addresses.** The endpoint is
  explicitly unpaginated because the list is bounded by a configured
  maximum. There is nothing to page.
- **No optimistic writes**, for the reason F07 gives: a row that appears
  and vanishes is worse than one that appears a moment late.

### Two seams worth watching

- **`<input type="time">` renders in the browser's locale**, so a machine
  set to US English shows `09:00 AM` under a hint that says 24-hour format.
  The stored value is unaffected — it is `09:00` either way, and the app's
  `<html lang="ro">` does not override it, because Chrome takes this format
  from the browser's own locale rather than the document's. Fixing it means
  a custom time control, which is a bigger thing than this screen needed.
- **`WORK_SCHEDULE_DEFAULTS` is a copy of the seed.** There is no defaults
  endpoint, so the values in `work-schedule-api.ts` restate what
  `prisma/seeds/work-schedule.seed.ts` seeds and what backend Feature 016
  documents. They are only ever *offered*, never stored without a Save, so
  drift is visible rather than silent — but they are a second copy and this
  is where it lives.

---

## Future Improvements

1. **Fix `@IsWorkingDays()`'s `ApiProperty`** so the contract stops
   publishing `Weekday[][]`. Adding `type: String, isArray: true, enum:
   Weekday` to the existing `ApiProperty` would do it, and the cast in
   `saveWorkSchedule` — with its long note — deletes itself on the next
   `npm run gen:api`. This is the single highest-value follow-up here,
   because right now the contract and the API disagree in a way only a
   comment records.
2. **An `errorCode` for this module's `409`.** The backend emits none, which
   is the entire reason `work-schedule-errors.ts` exists — the same item
   F10 raised for its own duplicate. One code would let the sentence live
   in `errors.json` beside every other one.
3. **A `useCompanyTimezone` hook over this query.** `lib/datetime.ts`
   requires a zone in every signature and nothing supplies one yet; F06,
   F07 and F10 have each deferred showing a `createdAt` for exactly this
   reason. The query now exists — the hook is a five-line wrapper, and it
   unblocks four deferred columns at once. **This is the piece the
   Timesheets module will need first.**
4. ~~**A timezone control**, with the warning the change deserves. See
   above.~~ **Done, 2026-08-22** — see the amendment. The warning is
   carried forward as item 7.
5. **A shared `SettingsForm` shell.** The `<h1>`, the description, the
   boundary and the skeleton are what any singleton-config screen will
   assemble, and notification configuration is the next placeholder in the
   settings list that looks like one. This is the first; correct to write
   out twice, worth naming by the second — the same note F07 and F10 left
   about a `ListPage` shell.
6. **Seed an `Admin - Standard` account that stays on the preset**, so a
   tier boundary can be checked without editing permissions mid-run. See
   the verification note above.

---

# Amendment — the timezone is a field, not a hidden value

**2026-08-22.** Item 4 of *Future Improvements* above, brought forward,
and the reasoning in *"What was deliberately not built"* corrected.

## What was wrong

F12 left the timezone out because the mock drew no control for it. That
was the wrong thing to read the mock as saying. **The mock is a visual
reference, and this field is not visual.**

`timezone` is the single IANA name the backend interprets *every*
calendar day and *every* day/week boundary in — which day an entry falls
on, where one week ends and the next begins, what a report totals. This
application is deployed in more than one country. A company outside
Romania that cannot state its zone has every hour, day and week computed
against Bucharest's midnight: silently, plausibly, and wrongly, with no
control on any screen to correct it.

Round-tripping the value protected it from *this form*. It did not make
the value settable, which is the thing the deployment actually needs. So
the deferral is withdrawn: the field is exposed.

## What was added

A **searchable combobox** at the top of the "Program și limite de ore"
card, labelled *Fus orar*, described as *"Fusul orar în care aplicația
interpretează zilele și calculează pontajele."*

### The options come from the same expression the backend validates with

`work-schedule.constants.ts` builds its accepted set as:

```ts
const SUPPORTED_TIMEZONES: ReadonlySet<string> = new Set([
  ...Intl.supportedValuesOf('timeZone'),
  'UTC',
]);
```

`work-schedule-timezones.ts` is that expression again, in the browser.
**The options a person can pick and the values the API accepts are the
same list by construction**, not by two lists agreeing. `UTC` is added
explicitly for the reason the backend states: ECMA-402 canonicalises it
separately, so it is absent from the enumeration while being the one
identifier every runtime understands — and the obvious answer for a
company that wants no local zone at all. It is de-duplicated rather than
appended blindly, in case a runtime does enumerate it. 419 options in
Chrome today.

Two alternatives were rejected. A **hand-picked list of familiar zones**
would be shorter to read and would make a company in a zone nobody
thought of unconfigurable — the exact failure this amendment exists to
fix. A **list checked into the repository** would go stale the first time
a zone is added or renamed, and would refuse a name the same runtime
resolves perfectly well.

The one way the two sides can still differ is two tz databases of
different ages — an old browser against a freshly updated server. That is
not guarded: the backend stays the source of truth, and a name it refuses
comes back as a `VALIDATION_ERROR` naming `timezone`, which the form puts
on the field. What the shared construction removes is the *systematic*
mismatch, where the UI never offered a whole class of valid zones.

### Why a combobox and not the `Select` the rest of the screen uses

Seven weekdays are a `<Select>`. Four hundred and nineteen zone names are
not: nobody scrolls to `Pacific/Kiritimati`. Typing `Bucharest` finds
`Europe/Bucharest` without knowing it is filed under Europe.

Built on **Base UI's `Combobox`** — the primitive the project's shadcn
style (`base-vega`) is built on, the same one `select.tsx` wraps — as a
new `components/ui/combobox.tsx`, with `components/form/FormComboboxField.tsx`
as its labelled, described, error-carrying wrapper beside `FormField` and
`FormSelectField`. No new dependency: `@base-ui/react` was already there
and already ships this component.

The label points at the **trigger**, which is a `<button>` and therefore a
labelable element; the search box inside the popup takes its own
`aria-label`, because it is a second control that appears only when the
popup opens and would otherwise be announced as an unnamed text field.
The `Combobox.Empty` region stays mounted whether or not the list is
empty — it is a polite live region, and one that is removed announces
nothing — with its padding collapsed by `empty:p-0` instead.

### Placement: first in the card, across both columns

First because everything under it is read *in* this zone — the two times
below are wall-clock times, and which calendar day an entry lands on is
decided by this value. A control that decides how its neighbours are
interpreted belongs above them, not filed between two hour fields.

Across both columns because IANA names are long
(`America/Argentina/Buenos_Aires`) and so is the sentence saying what the
value does.

### Validation

| Rule | Message | Source |
| --- | --- | --- |
| non-empty | `timezoneRequired` | the DTO's own `@IsNotEmpty()` shape |
| a name the runtime's tz database holds | `timezoneUnsupported` | `isSupportedTimezone`, from the same `Intl` call as the backend's |

This is **not** a browser rule stricter than the server's, which
`CLAUDE.md` forbids — it is the *same* rule evaluated a runtime earlier.
The match is **exact**, as the backend's is: `europe/bucharest` is
refused rather than folded, because IANA names have one canonical
spelling and a silently re-cased value is a configuration that no longer
matches what was chosen. For the same reason the value is not trimmed on
the way out — the control offers canonical names and nothing else.

The empty case is excused from the second rule so it produces exactly one
message, the way `workTimeField` excuses its pattern.

`timezone` also joins **`WORK_SCHEDULE_FIELDS`**, so a server rejection is
marked on the field through the shared `useServerFieldErrors` hook. It had
to be left off before: a rejection would have named a value nothing on the
page could change.

## This also settles the round-trip note

Decision 2 above argued for round-tripping `timezone` so the form could
not lose it. That guarantee is now stronger and simpler: the value is in
`values`, so **every** `PUT` carries it, and there is no longer a field
travelling beside the form that a later edit to the submit path could
forget to attach. `WORK_SCHEDULE_DEFAULTS` gains `timezone:
DEFAULT_TIMEZONE` — `Europe/Bucharest`, the same literal the column
defaults to — so a fresh deployment is offered what it would have been
given anyway.

**Reset is the one place the zone is treated differently, and it has to
be.** Every other field goes back to `WORK_SCHEDULE_DEFAULTS`; the zone
goes back to the one *this company* has stored. Restoring "the defaults"
must not re-interpret which calendar day every recorded instant falls on,
which is exactly what handing a New York company Bucharest would do. F12
got that property for free by keeping the value out of the form; now that
it is in, it is stated in `onReset`.

The offered default is deliberately **not** the browser's zone.
`Intl.DateTimeFormat().resolvedOptions()` would offer whatever laptop
happens to be open — the machine's zone rather than the company's, the
precise confusion `lib/datetime.ts` requires an explicit zone in every
signature to prevent.

## Files

| File | Change |
| --- | --- |
| `src/components/ui/combobox.tsx` | **New.** Base UI `Combobox` in the project's shadcn style, matching `select.tsx`'s conventions. |
| `src/components/form/FormComboboxField.tsx` | **New.** The labelled, searchable field: label→trigger, `aria-describedby`, `aria-invalid`, a named search box, an empty message. |
| `src/features/work-schedule/work-schedule-timezones.ts` | **New.** `SUPPORTED_TIMEZONES`, `isSupportedTimezone`, `DEFAULT_TIMEZONE` — the backend's expression, in the browser. |
| `src/features/work-schedule/work-schedule-schemas.ts` | `timezone` in the schema, in `toWorkScheduleFormInput`, and in `WORK_SCHEDULE_FIELDS`; the new `WorkScheduleFormSource` type requires it. |
| `src/features/work-schedule/work-schedule-api.ts` | `WORK_SCHEDULE_DEFAULTS` gains `timezone`; `satisfies UpdateWorkSchedule` in full. |
| `src/features/work-schedule/useWorkScheduleSchemas.ts` | The two new messages. |
| `src/features/work-schedule/components/WorkScheduleHoursSection.tsx` | The combobox, `Controller`-bound; takes `control`. |
| `src/features/work-schedule/components/WorkScheduleForm.tsx` | `save.mutate(values)` — nothing spliced in; `onReset` preserves the stored zone. |
| `src/features/work-schedule/components/WorkScheduleSkeleton.tsx` | A full-width placeholder above the eight half-width ones. |
| `src/locales/{ro,en}/common.json` | `fields.timezone*` and `validation.timezone*`. |

## Verification

`npm run typecheck`, `npm run lint`, `npm run build` — all clean.

### Browser (Playwright MCP, against the running API)

| Checked | Result |
| --- | --- |
| The field renders in the hours card, above the times | Label *Fus orar*, current value `Europe/Bucharest` selected on load |
| Accessible wiring | `<label for>` names the trigger; `aria-describedby` carries the hint; `aria-invalid=false` |
| Opening the popup | 419 options, `Europe/Bucharest` marked `data-selected`, focus lands in the search box (`aria-label` *Caută un fus orar*) |
| Filtering `New_York` | Exactly `America/New_York` |
| Filtering `zzzz` | List empty; the `role="status"` region reads *Niciun fus orar nu corespunde căutării.* |
| `Escape` | Popup closes, value unchanged, **focus returns to the trigger** |
| **Keyboard only** | `Enter` opens → type `Lisbon` → `ArrowDown` → `Enter` selects `Europe/Lisbon`, popup closes, focus back on the trigger |
| The `PUT` body | `…,"timezone":"Europe/Lisbon"` — the complete object, `200` |
| Persistence | Reload shows `Europe/Lisbon` |
| **Reset** | Lunch break set to `2.5` → Reset → back to `1`, and the zone **stays `Europe/Lisbon`** rather than reverting to Bucharest |
| Server rejection (real `400`: the outgoing body rewritten to `Mars/Olympus_Mons`) | `VALIDATION_ERROR` → field `aria-invalid=true` **with a translated message** tied by `aria-describedby`; the form-level alert carried the translated `errorCode`; an untouched field stayed valid |
| Save with a valid zone | Toast *Programul de lucru a fost salvat.* (polled from inside the page, within 100 ms) |
| Zod rules, exercised directly against the built schema | `''` → one message (`timezoneRequired`); `Mars/Olympus_Mons` and `europe/bucharest` → `timezoneUnsupported`; `UTC` → valid; `SUPPORTED_TIMEZONES` holds 419 entries with `UTC` exactly once |
| **Read-only** (`elena.dumitrescu@example.com`, `PAGE_ACCESS` + `VIEW`) | Trigger `disabled`, value still readable, no Save/Reset |
| `en` | *Time zone* / *The zone the application reads calendar days in and calculates timesheets against.* |
| Responsive at 390 px | Field and popup span the column, popup within the viewport, **no horizontal scroll** (`scrollWidth === clientWidth`) |
| Console | Only the pre-login `401`s on `/auth/me` and the `400` this run deliberately caused |

The development database was restored to the state it was found in:
`Europe/Bucharest`, nine-to-six, Monday-to-Friday, a one-hour lunch, four
approval addresses.

## What this leaves

Item 4 of *Future Improvements* is done. The note in *"What was
deliberately not built"* saying the zone "deserves its own affordance with
its own warning" is **half** kept: it has its own affordance. It does not
yet have a warning, because there is nothing to warn about until there are
timesheets to re-interpret — the Timesheets module is what makes changing
the zone consequential, and the confirmation belongs with the data it
would move. Noted as a new follow-up:

7. **A confirmation on changing the zone once timesheets exist.** Changing
   it re-groups which calendar day every recorded instant falls on. Today
   the database holds no entries, so a plain field is honest; the day it
   does, this save deserves a dialog that says how many days would be
   re-read.
