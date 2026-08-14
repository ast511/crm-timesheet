# User UI Preferences

## Goal

Make the way somebody has set up their screen **follow the person rather than
the machine**.

Two settings, and only two: which of the application's eight palettes they see
it in, and how rounded the corners are. Both are already the kind of thing a
frontend can keep in `localStorage`, and that is precisely the arrangement this
feature replaces. A preference kept in a browser is correct until its owner signs
in from somewhere else — the office laptop, a second browser, a machine whose
storage was cleared — and then it silently is not. What a person chose is a fact
about their *account*, so it is stored beside the account and read back on every
sign-in, anywhere.

The feature is deliberately small, and the size is the design. It adds no module,
no table, no endpoint and no configuration screen. It adds two enums, two
columns, two fields on a payload that already existed, and two entries in a
whitelist that already existed — because `PATCH /profile/me` is already the route
by which a person changes things about themselves, and a theme is exactly that.

`UpdateProfileDto` had been waiting for it. Feature 036 wrote this into that
class, under the heading **No account preferences**:

> There is no `language` and no `theme` here, because there are no such columns.
> Inventing them for a profile screen would be adding schema for a feature nobody
> has asked for, and this project's rule is that a column arrives with the thing
> that reads it. When a preference is genuinely needed it belongs on `users` — it
> is a property of the account rather than of the employment record — and it
> belongs in this whitelist on the same day.

Both halves of that held. The columns are on `users`, and they joined the
whitelist on the same day.

## Requirements

- Two preferences, persisted server-side per account: **colour scheme** (one of
  eight fixed palettes) and **corner radius** (one of five fixed roundnesses).
- Validated at the database level, not only in the API — the values come from
  small fixed sets, and this schema asks PostgreSQL to enforce that everywhere
  else.
- **Self-service only.** A person changes their own; nobody changes anybody
  else's, and there is no administrative route that could.
- Existing accounts keep working and get sensible values with no back-fill
  script.
- Read from one documented place, so a frontend knows exactly where to look.
- **No light/dark field.** That one stays on the client, and the reason is
  argued below rather than assumed.
- No new module, no new table, no configuration mechanism.
- Existing profile behaviour and the safe projection — no password hash, no
  token, ever — unchanged.

---

## Database

### The two enums

Both follow the house style exactly: an uppercase member carrying an
`@map("snake_case")` for what is actually stored, the same shape as
`AccountStatus`, `UserRole` and every other enum in the schema.

```prisma
enum UiColorScheme {
  DEFAULT @map("default")
  RED     @map("red")
  ROSE    @map("rose")
  ORANGE  @map("orange")
  GREEN   @map("green")
  BLUE    @map("blue")
  YELLOW  @map("yellow")
  VIOLET  @map("violet")
}

enum UiCornerRadius {
  NONE   @map("none")
  SMALL  @map("small")
  MEDIUM @map("medium")
  LARGE  @map("large")
  FULL   @map("full")
}
```

`DEFAULT` is a **real member rather than the absence of a choice**. "I want the
standard theme" and "I have never said" are the same answer, so there is no null
for a client to interpret and no branch anywhere that has to translate one.

### The corner radius is symbolic, and the numbers live in one place

This is the one part of the model that needs a translation table, and the reason
is mechanical: a Prisma enum member — and a PostgreSQL enum label as Prisma maps
it — is an *identifier*, and an identifier may not begin with a digit. `0.3` is
not spellable as one. So the members are symbols, and the numbers they stand for
are documented:

| Member | Stored as | CSS radius | |
| --- | --- | --- | --- |
| `NONE` | `none` | `0rem` | square corners |
| `SMALL` | `small` | `0.3rem` | |
| `MEDIUM` | `medium` | `0.5rem` | **the default** |
| `LARGE` | `large` | `0.75rem` | |
| `FULL` | `full` | `1rem` | |

**The frontend owns that translation.** It is the only side that knows the unit
is `rem` and that the value lands in a `--radius` custom property; the API names
*which* of the five was chosen and never sends a number. The mapping is written
down in three places that a reader will actually reach — the `UiCornerRadius`
doc comment in `schema.prisma`, the `@ApiProperty` description that Feature 038
lifts into the OpenAPI document, and this table — and nowhere in executable code,
because nothing on this side computes with it.

Storing the number instead was considered and rejected on two grounds:

1. **A `decimal(3,2)` column accepts `0.42`**, which is not one of the five
   options anybody can pick. The check would move out of the database and into
   whichever code path last wrote the row — exactly the validation this schema
   keeps asking PostgreSQL for. A `CHECK` constraint listing five literals would
   get most of the way back, at which point it is an enum spelled awkwardly.
2. **It would freeze a CSS decision in the database.** A redesign that moved
   `SMALL` from `0.3rem` to `0.25rem` would have to migrate every row, rather
   than change one line of CSS.

### The two columns

```prisma
colorScheme  UiColorScheme  @default(DEFAULT) @map("color_scheme")
cornerRadius UiCornerRadius @default(MEDIUM)  @map("corner_radius")
```

They are on `User`, not on `Employee`. A preference belongs to the **account**: a
super-admin created to administer the system has no employment record and still
has a screen to look at. That placement is also what makes them the first thing
`PATCH /profile/me` can change for such an account — see *The refusal that
narrowed*, below.

### Why explicit enum columns, and not the two usual alternatives

Both alternatives are the ones a reviewer would reach for, so both are answered.

**A separate `user_preferences` table** would model a 1-to-1 relation as two rows
in two places. Every profile read would join for two values; every account would
need its preference row created beside it, or a null read as "the defaults" —
which is the schema describing an optional thing that is never actually optional.
The join buys nothing: there is no cardinality here it could express, and no
query that wants the account without them.

**A JSON column** would trade away exactly what this schema keeps buying.
`{"colorScheme": "purpel"}` is a valid JSON document, so the typo would be
accepted, stored, returned, and rendered as no theme at all — and neither
PostgreSQL nor the generated Prisma client would have a word to say about it.
Every reader would have to re-validate on the way out, or trust that every writer
validated on the way in.

Two values from two small fixed sets are two enum columns. The value is then
checked in three layers, which is what every other enum in this application gets:

| Layer | What it catches |
| --- | --- |
| `@IsEnum` in `UpdateProfileDto` | a bad value from a client, as a `400` naming the property |
| The generated Prisma client | a bad value from *our* code, at compile time |
| The PostgreSQL enum type | a bad value from anywhere else — a script, a console, a future import |

### Migration

`prisma/migrations/20260813140000_add_user_ui_preferences/migration.sql`

```sql
CREATE TYPE "UiColorScheme" AS ENUM ('default', 'red', 'rose', 'orange', 'green', 'blue', 'yellow', 'violet');
CREATE TYPE "UiCornerRadius" AS ENUM ('none', 'small', 'medium', 'large', 'full');

ALTER TABLE "users" ADD COLUMN "color_scheme" "UiColorScheme" NOT NULL DEFAULT 'default';
ALTER TABLE "users" ADD COLUMN "corner_radius" "UiCornerRadius" NOT NULL DEFAULT 'medium';
```

**The back-fill is the default clause**, and there is deliberately no second
statement. Both columns are `NOT NULL` with a default, so every account that
existed before this migration is given `DEFAULT` and `MEDIUM` by the `ADD COLUMN`
itself — there is no moment in which a row has no preference, and no `UPDATE` to
get wrong. PostgreSQL stores the default in the catalog rather than rewriting the
table, so this is a metadata-only change whatever the row count.

It is a **strictly additive** migration: nothing is dropped, nothing is renamed,
no existing column changes type or nullability. Rolling it back is dropping two
columns and two types.

### New accounts, and why there is no defaults mechanism

A new account gets `DEFAULT` and `MEDIUM` from the same column defaults — the
create path in `UserService` names neither column, so PostgreSQL supplies both.
That is the whole of the defaulting mechanism, and building a configurable
global-defaults system for two values would be several times the size of the
feature it configures.

It is asserted rather than assumed. `user.service.spec.ts` checks that
`prisma.user.create` is called with neither preference named, which is also the
test that would fail the day somebody tried to let an administrator choose a
colleague's theme at creation time.

---

## API

No new route. Both preferences are read and written through the profile module,
which was already scoped to exactly one person.

### `GET /api/v1/profile/me`

The two values join the **account half** of the existing payload:

```jsonc
{
  "success": true,
  "data": {
    "account": {
      "id": "clx…",
      "email": "ana.pop@example.com",
      "username": "APO",
      "role": "USER",
      "status": "ACTIVE",
      "colorScheme": "VIOLET",     // new
      "cornerRadius": "LARGE",     // new
      "createdAt": "2026-01-05T09:00:00.000Z"
    },
    "employee": { /* unchanged */ }
  }
}
```

They are on the account half rather than the employee half because that is where
the columns are, and the entity's whole point is that a reader can tell which of
the two halves of a person a field belongs to.

### `PATCH /api/v1/profile/me`

Both join the whitelist. The endpoint's editable set goes from one field to
three:

```jsonc
{ "phone": "+40 721 000 001", "colorScheme": "BLUE", "cornerRadius": "SMALL" }
```

Every field is optional and absent means "leave it alone". A value outside the
enum is a `400` carrying `VALIDATION_ERROR` and naming the property — the Feature
033 envelope, from the global pipe, like every other bad field:

```jsonc
{
  "success": false,
  "statusCode": 400,
  "errorCode": "VALIDATION_ERROR",
  "message": ["colorScheme must be one of the following values: DEFAULT, RED, …"]
}
```

**A dedicated `PATCH /profile/me/preferences` was considered and rejected.** The
module's shape is that `UpdateProfileDto` *is* the list of what a person may
change about themselves — the class docblock is a table of what is editable and
where everything else is changed instead — and a second route would split that
list across two places, giving the question "what may a user change about
themselves" two answers to keep in step. It would also mean a settings screen
that edits a phone number and a theme has to issue two requests and reconcile two
responses. The wire cost of the choice is nil: `forbidNonWhitelisted` still
rejects anything not on the list, whichever route it arrives on.

### Swagger, and the one enum the plugin got wrong

Feature 038 generates the OpenAPI document from the controllers, the DTOs and the
entity classes, so both preferences appear in `/api/docs-json` without anything
being written by hand: `ProfileAccount` and `UpdateProfileDto` each carry the two
properties, their eight and five allowed values, and the JSDoc above them as the
description. The two `@ApiOperation` descriptions on the profile routes were
updated to state where a client reads the preferences and what the radius symbols
mean.

**Generating the document and reading it is what caught the one defect in this
feature**, and it is worth recording because the assumption that failed is
written into the 038 test suite as *"Enums come from the TypeScript type; the
plugin resolves them itself"*. It does — and for `UiCornerRadius` it resolved
them out of order:

```
ProfileAccount.cornerRadius   NONE, MEDIUM, SMALL, LARGE, FULL   ← inferred
UpdateProfileDto.cornerRadius NONE, SMALL, MEDIUM, LARGE, FULL   ← explicit
```

The DTO was right because `@ApiPropertyOptional({ enum: UiCornerRadius })` hands
the plugin the **runtime enum object**; the entity was wrong because it had only
a type-only reference, so the order came from TypeScript's resolution of the
union rather than from the schema. A scale with its middle two rungs swapped is
not a cosmetic problem: a settings screen generated from this document would have
offered *None, Medium, Small, Large, Full*.

Every other enum across all 125 schemas — `NotificationPriority`,
`ProjectPriority`, `SeniorityLevel`, `Weekday` — was checked and is in
declaration order. This was the only one. The fix is an explicit
`@ApiProperty({ enum })` on both entity fields, and
`test/openapi.e2e-spec.ts` gained a seven-case assertion pinning the order of
every enum in the document that is a *scale*, so the next one fails a test rather
than reaching a frontend.

### `null` is not an accepted value, and that took the right decorator

Both fields use **`@ValidateIfPresent()`**, not `@IsOptional()`. This is not a
stylistic preference — `@IsOptional()` skips validation for `null` as well as
`undefined`, so `{"colorScheme": null}` would sail past `@IsEnum`, reach Prisma
as a write of `null` to a `NOT NULL` column, and surface to the client as a
`500`. `@ValidateIfPresent()` validates anything that was actually sent, so the
null is a `400` like any other bad value.

The decorator already existed — `common/decorators/validate-if-present.decorator.ts`,
introduced for the day counts on `UpdateEmployeeLeaveBalanceDto`, which documents
the same trap. Nothing new was written for it.

`phone` keeps `@IsOptional()`, and the difference is correct rather than an
inconsistency: `employees.phone` is nullable and an explicit `null` is a real
request to erase the number. Neither preference column has a null to write.

---

## Backend

### One body, two tables

`phone` is a column of `employees`; the two preferences are columns of `users`.
That is invisible from the wire and deliberately so — a person editing their own
settings is not thinking about which of the two halves of themselves a field
belongs to — but it is what shapes `ProfileService.updateOwn`, which now splits
the DTO and writes at most two rows.

### The refusal that narrowed

Before this feature, `PATCH /profile/me` refused an account with **no employment
record** outright, with `403 AUTH_NO_EMPLOYEE_RECORD`. That was correct at the
time and is not any more: the only editable field lived on `employees`, so there
was genuinely nothing to write; now such an account has columns of its own, and
refusing to let a super-admin choose a theme would be refusing a write to a row
that plainly exists.

So the refusal is now **conditional on the request actually naming `phone`**:

| Body | Account has an employee | Account has none |
| --- | --- | --- |
| `{ colorScheme }` | 200 | **200** — changed by this feature |
| `{ phone }` | 200 | 403 `AUTH_NO_EMPLOYEE_RECORD` |
| `{ phone, colorScheme }` | 200 | 403, **and nothing is written** |

The error code is unchanged. Feature 033 created
`AUTH_NO_EMPLOYEE_RECORD` for exactly this shape of route — "the route is about
their own employment record and their account has none" — and inventing a second
way to say it would have been the duplication that feature exists to prevent.

### Both halves, or neither

The refusal is raised **before anything is written**, and the two updates are a
single `$transaction`. A body carrying both a phone and a theme therefore changes
neither when the phone is refused, and a partial failure cannot leave the theme
stored while the client is told the request failed. One request is one intention,
and the answer a client receives describes the whole of it.

A `PATCH` naming nothing at all now writes nothing at all — not even the empty
`UPDATE` whose only effect would have been to bump `employees.updated_at`.

### Self-service, still by construction rather than by check

Nothing here weakens the property the profile module was built around. There is
no id parameter on either route, so there is nothing to get wrong: the account
update is keyed on `userId` from the verified token and the employee update on
`employeeId` from the same place. A body naming somebody else's id is rejected by
`forbidNonWhitelisted` before it reaches the service, and would be ignored by the
`where` even if it were not.

**There is no administrative route that sets another person's theme**, and that
is a deliberate omission rather than an oversight. `UserEntity` does not carry
the preferences either — they are not secret, they are simply not that resource's
business, and shipping them on `/users` would invite exactly the `PATCH
/users/:id` this feature declines to build.

---

## Where the frontend reads them

**`GET /api/v1/profile/me`, on load. That is the whole contract**, and it is the
one place the API sends these values.

They were deliberately **not** added to `GET /auth/me` or the login response,
although those are the other candidates for session hydration. The query behind
them, `AUTHENTICATED_USER_SELECT`, is not an ordinary read: `JwtAuthGuard`
resolves the caller from the database on **every authenticated request**, so a
column added there is a column read on every call in the application. Its own doc
comment says what shapes it — "five values, all from one indexed primary-key
lookup" — and these two decide nothing. No guard branches on a colour. That seam
carries what the application needs to make decisions, which is the same sentence
`AuthService` already uses to explain why `email` is not in `CurrentUser`.

The cost of the choice is nil in practice: `GET /profile/me` is a call a
profile-aware client makes anyway, because it is where the person's name,
department and position come from. The preferences ride along on a request that
was already going to happen.

`profile/routing.spec.ts` asserts both halves of this — that the profile read
serves them, and that `AUTHENTICATED_USER_SELECT` does **not** name them — so the
hot path cannot quietly grow the two columns later.

### Applying them

```ts
const { account } = (await api.get('/api/v1/profile/me')).data;

const RADIUS: Record<string, string> = {
  NONE: '0rem', SMALL: '0.3rem', MEDIUM: '0.5rem', LARGE: '0.75rem', FULL: '1rem',
};

document.documentElement.dataset.theme = account.colorScheme.toLowerCase();
document.documentElement.style.setProperty('--radius', RADIUS[account.cornerRadius]);
```

Writing one back is the same route:

```ts
await api.patch('/api/v1/profile/me', { colorScheme: 'VIOLET' });
```

The response is the whole profile, so a settings screen re-renders from it
without a second read.

---

## Light and dark are client-only, on purpose

There is no `theme` or `mode` column, and there is not going to be one.

Light versus dark is a property of **where somebody is sitting**, not of who they
are. The same colleague wants dark at night and light at noon, on the same
laptop, without having told the server anything. The browser already knows —
`prefers-color-scheme` is the operating system's answer, updated when the
operating system's answer changes — so a stored value would mean a server round
trip whose purpose is to *contradict* the machine, and a laptop that follows its
owner into a dark room while the account insists otherwise.

The colour scheme is genuinely different, and the contrast is what makes the
split coherent: nothing on the device has an opinion about whether somebody
prefers violet to green, so there is nothing to defer to and the only place that
fact can live is the account.

So the frontend keeps light/dark locally, following the system default with a
local toggle. It is stated in `schema.prisma`, in `UpdateProfileDto` and here, in
each case as a decision with a reason rather than as a gap.

---

## What was deliberately not built

| Not built | Why |
| --- | --- |
| A `light`/`dark` column | above — it belongs to the device |
| `density`, `language`, `dateFormat`, notification preferences | nothing reads them. A column arrives with the thing that reads it |
| A `user_preferences` table | a 1-to-1 relation modelled as a join |
| A JSON preferences blob | trades away database-level validation for nothing |
| A configurable global-defaults system | two column defaults are the right level of effort for two values |
| An admin route to set somebody's theme | self-service only; there is no such thing as needing to change a colleague's palette |
| Any frontend | backend only. The contract and the radius mapping are documented above |

---

## Files Created

| File | What it is |
| --- | --- |
| `backend/prisma/migrations/20260813140000_add_user_ui_preferences/migration.sql` | Two enum types and two defaulted, back-filling columns on `users`. |
| `FEATURES/039-user-ui-preferences.md` | This document. |

## Files Modified

| File | Change |
| --- | --- |
| `backend/prisma/schema.prisma` | `UiColorScheme` and `UiCornerRadius` enums; `colorScheme` and `cornerRadius` on `User`, with the WHY-first comments arguing enum-columns over JSON and over a separate table, and recording the symbol→number radius mapping. |
| `backend/src/modules/profile/entities/profile.entity.ts` | Both fields on `ProfileAccount`, `PROFILE_SELECT`, `ProfileRow` and `toProfileEntity`. The `select` still never names `passwordHash`. |
| `backend/src/modules/profile/dto/update-profile.dto.ts` | Both fields added to the whitelist with `@ValidateIfPresent()` + `@IsEnum` and Swagger descriptions carrying the radius mapping; the "No account preferences" section rewritten now that its condition has been met. |
| `backend/src/modules/profile/profile.service.ts` | `updateOwn` splits the body into its account and employment halves, refuses only the half with nowhere to go, and writes what remains in one transaction. |
| `backend/src/modules/profile/profile.controller.ts` | Documents the exposure decision — why the preferences are here and not on `/auth/me` — and the updated operation descriptions Feature 038 lifts into the OpenAPI document. |
| `backend/src/modules/profile/profile.module.ts` | The module docblock's "writes exactly one column" is now three, with the same argument. |
| `backend/src/modules/users/entities/user.entity.ts` | `PublicUserRow` derived from `USER_PUBLIC_SELECT` instead of `Omit<UserModel, 'passwordHash'>` (see below); documents why this resource does not carry the preferences. |
| `backend/src/modules/profile/routing.spec.ts` | 21 new assertions — see *Testing*. |
| `backend/src/modules/users/user.service.spec.ts` | The create path names neither preference, so the column defaults apply. |
| `backend/test/openapi.e2e-spec.ts` | Pins the published order of every enum in the document that is a scale — the guard for the plugin defect described above. |

### One incidental fix

`PublicUserRow` was `Omit<UserModel, 'passwordHash'>`, which was the same type as
`USER_PUBLIC_SELECT` only for as long as that select happened to name every
column except the hash. Adding two columns the users resource deliberately does
not return broke that, and the honest repair was to derive the type from the
select it claims to describe:

```ts
export type PublicUserRow = Pick<UserModel, keyof typeof USER_PUBLIC_SELECT>;
```

The subtraction would have needed a second exclusion, then a third the next time
somebody added a column for a different screen. A `Pick` over the select's own
keys cannot drift from it, because it is the same list read once.

---

## Testing

Full suite green: **2 897 unit tests across 135 suites**, **179 e2e**, `tsc
--noEmit` clean, `nest build` clean.

`profile/routing.spec.ts` grew from 25 to 46 tests, driving real requests through
the **real service** over a substituted database:

| Assertion | |
| --- | --- |
| `GET /profile/me` returns both preferences on the account half | the frontend's read contract |
| A `PATCH` sets both on the caller's own `users` row | |
| One sent alone leaves the other `undefined` | absent means "leave it alone" |
| Preferences alone touch no employee row | |
| A change survives a re-fetch | written against a stored row the update mutates and the read returns — the round trip, not a mock call |
| Seven bad values are `400` + `VALIDATION_ERROR`, and write nothing | including `violet` (the *stored* spelling, not the API's), `0.5` (the number the symbol stands for), `""` and `null` |
| The write is keyed on the token's account, never the body's | self-service |
| A body naming a `userId`, an `id` or an email is rejected | the whitelist, restated for the new fields |
| An account with no employment record **may** set preferences | the narrowed refusal |
| …and a phone in the same body refuses **both** halves | atomicity of the rejection |
| A phone and a preference go in one `$transaction` | |
| An empty body writes nothing at all | |
| `AUTHENTICATED_USER_SELECT` names neither column | the exposure decision, asserted so the hot path cannot grow them |

Regressions specifically re-checked: the safe projection still selects and
returns no `passwordHash`, no `accountTokens` and no `refreshTokens`; the
twelve-case whitelist table (`role`, `email`, `status`, `employeeCode`,
`positionId`, `departmentId`, `seniority`, `hireDate`, a password, a first name,
another user's id) still answers `400`; `employee: null` still renders for an
account with no employment record; both routes still require an access token; and
there is still no `/profile/:id`.

---

## Notes

- **The whole feature is 2 enums, 2 columns, 2 payload fields and 2 whitelist
  entries.** No module, no table, no endpoint, no configuration. The most
  interesting code change is not any of them — it is that a refusal became
  conditional, because an account with no employment record now has something on
  this route it can legitimately write.
- The `@IsOptional()` / `null` trap was caught by writing the test for it before
  believing the decorator. It would have been a `500` on a value a client can
  send by accident, and the fix was a decorator the project already had.
- **Both defects in this feature were found by checking generated output rather
  than by reading code.** One came from running the validator against a `null`,
  the other from generating the OpenAPI document and reading the enum it
  published. Neither is visible in a diff, and both would have reached the
  frontend.
- Nothing about how this API renders dates changed, and nothing here is a
  timestamp. The two columns are enums; `createdAt` beside them is unchanged.

## Future Improvements

1. **Per-account light/dark, if and only if somebody asks.** The argument above
   is that the device knows better, and it is a strong argument, not an absolute
   one — a person using one shared machine might reasonably want their own
   answer. It would be a third column and a third whitelist entry, and the reason
   to wait is that nobody has asked.
2. **Serve the radius mapping from the API.** It is documented in three prose
   places and executed in exactly one — the frontend's lookup table. If a second
   consumer ever appears (a PDF export that wants to match the screen, a native
   app), the mapping becomes a fact worth returning rather than repeating, most
   likely from a small `GET /profile/ui-options` alongside the palette list.
3. **A palette list endpoint.** The eight names are in the OpenAPI enum, which a
   generated client already turns into a union type, so a settings screen can
   render the options without a request. A `label` and a swatch colour per
   palette would be the thing an endpoint could add — and both are frontend facts
   today, correctly.
4. **Preferences on the WebSocket handshake.** Not needed, noted only because the
   notification gateway resolves the same `CurrentUser` and somebody will
   eventually ask. The answer is the same as for `/auth/me`: it decides nothing.
