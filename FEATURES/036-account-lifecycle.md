# Account Lifecycle

## Goal

How a login account comes into existence, is activated by its owner, recovers a
forgotten password, changes a known one, is enabled and disabled by
administrators, and how a person edits their own profile.

It is the last feature of the authentication series, and it closes the loop the
series opened:

```text
  032  who the caller is        — proved, not claimed
  033  how a failure is named   — a stable code per failure
  034  how often anybody may ask
  035  what an identified caller may do
  036  where the account came from, and how its password is set  ← this feature
```

**The central claim: no password ever travels by email, and nobody but an
account's owner ever knows one.** Before this feature an administrator typed a
password into the create-user form and told the person what it was — which meant
it existed in a chat message, in that administrator's memory, and usually
unchanged a year later. It is now impossible to express: `POST /users` takes no
password at all.

## Requirements

- Accounts are created by administrators and activated by their owners through a
  single-use, time-limited emailed link. No plaintext password is ever emailed,
  logged, or known to anybody but its owner.
- "Created but never activated" must be a real, queryable state, distinct from
  "an administrator disabled this".
- Neither of those states may authenticate.
- Password reset by email for a forgotten password; password change for a known
  one, with the current password verified first.
- Activation and reset share **one** mechanism with two purposes.
- No user enumeration on `forgot-password`.
- Account and role administration is `ADMIN` + `SUPERADMIN` only — never HR.
- Self-service profile editing, scoped to the caller and to a deliberately narrow
  set of fields.

## Backend

### The account state model

`User.isActive` (boolean) was **replaced** by `User.status` (`AccountStatus`).

```text
  PENDING_ACTIVATION   created; password_hash is null; never signed in
  ACTIVE               usable — the only state that authenticates
  DISABLED             an administrator turned a working account off
```

The two facts a boolean conflated are genuinely different, reached by different
routes and shown differently on a screen. Before this feature an account created
by an administrator was stored as `is_active = true` and was indistinguishable
from a colleague who had been working here for a year — so a boolean had nowhere
to put the third state, and login would have accepted such an account the moment
anybody guessed a password that did not exist.

**Keeping `isActive` beside `status` was considered and rejected.** `DISABLED`
and `isActive = false` would be one fact in two columns, every write would have
had to set both, and the first path that forgot one would leave an account the
login screen and the user list disagreed about — the failure this schema argues
against wherever a total could be stored beside the rows that state it.

| Transition | By | Endpoint |
| --- | --- | --- |
| → `PENDING_ACTIVATION` | an administrator creating the account | `POST /users`, `POST /employees` |
| `PENDING_ACTIVATION` → `ACTIVE` | **the owner**, following their link | `POST /auth/activate` |
| `ACTIVE` → `DISABLED` | an administrator | `POST /users/:id/deactivate` |
| `DISABLED` → `ACTIVE` | an administrator | `POST /users/:id/activate` |

`PENDING_ACTIVATION → ACTIVE` is the one transition an administrator **cannot**
perform: there would be no password to activate the account *with*, so the result
would be an `ACTIVE` account whose owner meets "invalid email or password"
forever. `POST /users/:id/activate` refuses it with a `409` naming the state and
pointing at resend-activation instead.

### The shared token mechanism

`AccountToken` — one table, one service, **two purposes**.

Activating a new account and resetting a forgotten password are the same problem
wearing two hats: prove that whoever is asking controls the mailbox, then let
them choose a password. Everything about how that is done is identical, so it is
one mechanism with a `type` column rather than two parallel systems. Two
implementations would have been two expiry rules, two invalidation rules, two
consume-once implementations and two chances to store a raw token.

What differs lives outside the mechanism: the account state each applies to, the
lifetime, and the wording of the email.

| Property | How it is held |
| --- | --- |
| **Hash only** | SHA-256 hex, exactly as `RefreshToken` — the raw value is stored nowhere |
| **Single active per purpose** | `@@unique([userId, type])` + upsert: issuing *overwrites*, so the previous link dies the moment a new one is written |
| **Single use** | `usedAt`, set with `where: { usedAt: null }` — a condition, not a check, so two clicks of one link race safely |
| **Time-limited** | `expiresAt`, from a validated environment value, different per purpose |
| **Unguessable** | 32 bytes from `randomBytes`, base64url (43 URL-safe characters) |

**SHA-256 rather than bcrypt**, deliberately and consistently with Feature 032's
refresh tokens: the input is 32 bytes from a CSPRNG rather than something a person
typed, so there is nothing for a slow hash to defend against, while a
deterministic digest makes the lookup one indexed read instead of a bcrypt
comparison against every outstanding link.

**Not a JWT**, although `TokenService` is right there. A signed token is
*stateless*, which is exactly wrong here: this credential must die the instant a
newer one is issued and the instant it is used, and neither is expressible in a
signature. A row has to exist to record `usedAt` anyway, so signing would add a
second, weaker source of truth beside it.

### The four ways a password is set — and there is no fifth

```text
  activate         no password yet, holds an invitation   PENDING → ACTIVE
  forgotPassword   cannot sign in, controls the mailbox   issues a link
  resetPassword    holds a reset link                     replaces the password
  changePassword   signed in, knows the current one       replaces the password
```

An administrator cannot set anybody's password. `POST /users` takes none and
`PATCH /users/:id` no longer accepts one, so the only account whose password
anybody knows is their own.

**Session revocation, decided per flow:**

| Flow | Sessions | Why |
| --- | --- | --- |
| activate | none to revoke | the account has never been signed in to |
| reset | **all revoked** | the reason for a reset may be that somebody else has the account |
| change | **all but the current one** | the person is at the keyboard and should not be signed out of it |
| deactivate | **all revoked** | otherwise "we disabled their account" means "next Tuesday" |

The reset row is the one that matters: leaving a thief's refresh token live would
make the reset ceremonial — the attacker keeps refreshing while the owner believes
they have locked them out. Revoking costs the legitimate user one sign-in on their
other devices, which is the correct price.

A change keeps the caller's own session (named by an optional `refreshToken` in
the body), because signing somebody out of the page on which they just changed
their password reads as a failure and teaches people to avoid the feature. Every
*other* session goes, which is the half that actually matters.

**The residual window is one access token's lifetime.** Access tokens are
stateless and cannot be revoked — the trade-off `RefreshToken` argues in
`schema.prisma` — so revocation kills the *refresh*, and a revoked session
survives at most `JWT_ACCESS_TTL` (15 minutes by default). `AuthService.authenticate`
re-reads `status` on every request, so a disabled account stops working within
that window rather than at its refresh token's expiry a week later.

### No user enumeration on forgot-password

`POST /auth/forgot-password` answers the same status and the same fixed sentence
whether the address names an active account, a pending one, a disabled one, or
nobody at all. The service returns `void` so there is nothing for a caller to
branch on, and every early return is silent. In an internal system "is there an
account" is also "does this person work here".

> **Known residual: the timing is not equalised**, unlike login's. A hit writes a
> token row and hands a message to SMTP; a miss does neither. Equalising would
> mean either doing that work for addresses that name nobody — sending mail to
> strangers — or padding to a fixed delay a slow mail server would blow through
> anyway. What closes it in practice is Feature 034: the route carries
> `@StrictRateLimit()`, so the sample size an attacker needs is not available.

### Access: a role check, deliberately not a permission gate

Account and role administration is `ADMIN` + `SUPERADMIN`, enforced by
`assertAccountAdministrator` in `users/user.rules.ts`.

**Why a role check and not Feature 035's `@RequirePermission()`.** 035 made
reports granular on the argument that whether HR should read them is a question
the company might reasonably answer either way, so a permission keeps that door
open. This is the opposite kind of question: **a configurable permission to
administer accounts is a permission to grant oneself every other permission.**
Whoever can set a role can set their own to `ADMIN` and reach the rest of the
catalog. A checkbox that hands that out is not a granular control, it is an
escalation path through the UI — so this boundary is a fixed property of two
roles, held in code, with no cell on the matrix screen that could ever turn it on.
Feature 035 recorded exactly this exception: "for something only ever meant for
admins regardless of fine-grained perms, a role check may remain."

**`ACCOUNT_ADMIN_ROLES`, never `isAdministrativeRole`.** The distinction is the
most consequential one in this feature:

```text
  ADMINISTRATIVE_ROLES   SUPERADMIN, ADMIN, HR   "administers the company"
  ACCOUNT_ADMIN_ROLES    SUPERADMIN, ADMIN       "administers who can log in"
```

HR manages *people*; HR does not manage *access*. Reaching for
`isAdministrativeRole` — the helper this project already had, and the obvious
mistake — would let any HR account create logins and set roles, and therefore let
any HR account make itself an administrator. The two live side by side in
`common/constants/role.constants.ts` so a reader cannot pick one without seeing
the other.

The check is also what guards the account opt-in on `POST /employees`, which
**could not have been a route-level gate**: whether that request administers an
account depends on its *body*.

| Concern | Who |
| --- | --- |
| accounts, roles, enable/disable | `ADMIN`, `SUPERADMIN` |
| employees (HR data) | `HR`, `ADMIN`, `SUPERADMIN` — unchanged |
| own password, own profile | any authenticated caller, own account only |
| activate / forgot / reset | `@Public()` + `@StrictRateLimit()` |

### Two creation paths

Both end in an activation email, and both create the account
`PENDING_ACTIVATION`.

**Path 1 — account + employee together** (`POST /employees`, the common case).
The body carries a nested `account` object instead of `userId`. `User` and
`Employee` are created in **one transaction**, so a duplicate employee code
cannot leave behind an account that was invited to a job nobody created.

Exactly one of `userId` / `account` must be given, enforced in the service
because it is a rule about two fields at once. A boolean `createLoginAccount`
beside conditionally-required fields was rejected: that shape produces "true but
no email".

> `Employee.userId` remains **required and unique** — an employee always has
> exactly one account. This feature changed *which* account (an existing one, or
> one created in the same breath), not whether there is one. An employee with no
> account would need `userId` nullable, which is outside this feature's schema
> changes.

**Path 2 — account only** (`POST /users`), for an account with no employment
record: a system super-admin.

### Self-service profile

`GET /profile/me` returns the account and, if present, the employment record,
nested rather than flattened — which is also what makes `employee: null`
expressible for an account with no employment record.

`PATCH /profile/me` edits **one field: `phone`.** The shortness is the design.
The question is "which facts about somebody are *theirs* rather than the
company's", and in this application the answer is almost nothing:

| Field | Why not | Changed by |
| --- | --- | --- |
| `email` | account identity, and now where every activation and reset link goes | nobody yet — verification is a follow-up |
| `password` | the current one must be proven first | `POST /auth/change-password` |
| `role` | self-service role editing is self-service privilege escalation | `PATCH /users/:id` |
| `status` | whether an account may sign in is not its owner's decision | `POST /users/:id/(de)activate` |
| `employeeCode` | HR's identifier; reports and exports key on it | `PATCH /employees/:id` |
| `position`, `department`, `seniority` | organisational facts — and a department decides whose leave routes to which approver | `PATCH /employees/:id` |
| `hireDate`, `terminationDate` | bound which days a timesheet may claim hours for | `PATCH /employees/:id` |
| `canReplaceOthers` | a statement about somebody made by HR | `PATCH /employees/:id` |

**The whitelist is the DTO class**, not a filter in the service. The global pipe
runs `forbidNonWhitelisted`, so a `role` or `positionId` in the payload is a `400`
naming it rather than a value silently dropped — and widening what a person may
change about themselves takes an edit to that class, which a reviewer sees.

There is no `language` or `theme` because there are no such columns; inventing
them would be adding schema for a feature nobody asked for.

**No `/profile/:id`.** Both routes are `/me`, and that is stronger than tidiness:
there is no id parameter to get wrong. A `GET /profile/:id` guarded by
`if (id !== user.userId) throw` is the design in which somebody adds a second
route next year and forgets the guard, and in which the `403` itself confirms
which ids are real. A route that cannot name another person needs no ownership
check.

## Files Created

| File | What it is |
| --- | --- |
| `backend/prisma/migrations/20260809140000_add_account_lifecycle/migration.sql` | The migration — **not yet applied** |
| `backend/src/common/password/password.policy.ts` | `PASSWORD_MIN_LENGTH`, `@IsPassword()` — one policy, four endpoints |
| `backend/src/common/password/password.policy.spec.ts` | The policy asserted across all three password bodies at once |
| `backend/src/modules/auth/account-lifecycle.config.ts` | `APP_WEB_URL` and the two link lifetimes |
| `backend/src/modules/auth/account-token.service.ts` | The shared link mechanism: issue, resolve, consume, discard |
| `backend/src/modules/auth/account-token.service.spec.ts` | Hash-only storage, one-active, single-use, indistinguishable refusals |
| `backend/src/modules/auth/account-email.service.ts` | Composes the two emails and builds the links; delivers through Feature 025 |
| `backend/src/modules/auth/account-password.service.ts` | The four password flows and the session-revocation decisions |
| `backend/src/modules/auth/account-password.service.spec.ts` | Each flow, including the no-enumeration returns |
| `backend/src/modules/auth/account-lifecycle.routing.spec.ts` | End to end: real token mechanism, real bcrypt, fake mailer |
| `backend/src/modules/auth/dto/account-token.dto.ts` | `@IsAccountToken()`, shared by activate and reset |
| `backend/src/modules/auth/dto/activate-account.dto.ts` | |
| `backend/src/modules/auth/dto/forgot-password.dto.ts` | |
| `backend/src/modules/auth/dto/reset-password.dto.ts` | |
| `backend/src/modules/auth/dto/change-password.dto.ts` | |
| `backend/src/modules/users/user.rules.ts` | `assertAccountAdministrator` and why it is a role check |
| `backend/src/modules/profile/profile.module.ts` | |
| `backend/src/modules/profile/profile.controller.ts` | |
| `backend/src/modules/profile/profile.service.ts` | |
| `backend/src/modules/profile/dto/update-profile.dto.ts` | The editable whitelist, and the table of what is excluded |
| `backend/src/modules/profile/entities/profile.entity.ts` | The two-entity payload and the `select` that omits the hash |
| `backend/src/modules/profile/routing.spec.ts` | |
| `FEATURES/036-account-lifecycle.md` | This document |

## Files Modified

| File | Change |
| --- | --- |
| `backend/prisma/schema.prisma` | `AccountStatus`, `AccountTokenType`, `AccountToken`; `User.passwordHash` nullable; `User.status` replaces `isActive` |
| `backend/prisma/seeds/users.seed.ts` | `accountStatus` replaces `isActive` — named so it cannot collide with the *employee's* status |
| `backend/src/common/constants/role.constants.ts` | `ACCOUNT_ADMIN_ROLES` / `isAccountAdminRole` beside `isAdministrativeRole` |
| `backend/src/common/constants/error-codes.constants.ts` | Four codes (see below) |
| `backend/src/config/env.validation.ts` | `APP_WEB_URL` (required), `ACCOUNT_ACTIVATION_TTL`, `ACCOUNT_PASSWORD_RESET_TTL` |
| `backend/src/modules/auth/auth.module.ts` | Imports `EmailModule`; provides and exports the three new services |
| `backend/src/modules/auth/auth.controller.ts` | Four new routes |
| `backend/src/modules/auth/auth.service.ts` | `status === ACTIVE` replaces `isActive`; `revokeFamily` became public `revokeSessions(userId, { tx, exceptToken })` |
| `backend/src/modules/auth/auth.constants.ts` | `ACCOUNT_TOKEN_BYTES`, and the two fixed messages |
| `backend/src/modules/auth/entities/authenticated-user.entity.ts` | `status`; `passwordHash` nullable |
| `backend/src/modules/auth/testing/authentication.testing.ts` | A `stub` getter, for a spec needing its own `AuthService` |
| `backend/src/modules/users/user.service.ts` | No hashing at all; `create` issues an invitation; `resendActivation`, `activate`, `deactivate` |
| `backend/src/modules/users/user.controller.ts` | Three new routes; `assertAccountAdministrator` on all seven |
| `backend/src/modules/users/user.module.ts` | Imports `AuthModule` (users → auth, never back) |
| `backend/src/modules/users/dto/create-user.dto.ts` | `password` and `isActive` removed |
| `backend/src/modules/users/dto/update-user.dto.ts` | `password` removed |
| `backend/src/modules/users/dto/user-query.dto.ts` | `?status=` replaces `?isActive=` |
| `backend/src/modules/users/dto/user-field.decorators.ts` | `IsUserPassword` removed — moved to the shared policy |
| `backend/src/modules/users/user.constants.ts` | `USER_PASSWORD_MIN_LENGTH` moved out |
| `backend/src/modules/users/entities/user.entity.ts` | `status` replaces `isActive` |
| `backend/src/modules/employees/dto/create-employee.dto.ts` | `userId` optional; nested `account` opt-in |
| `backend/src/modules/employees/employee.service.ts` | The pair rule, the opt-in role check, transactional creation |
| `backend/src/modules/employees/employee.controller.ts` | `create` takes `@CurrentUser()` |
| `backend/src/modules/employees/entities/employee.entity.ts` | The nested account carries `status` |
| `backend/src/app.module.ts` | Registers `ProfileModule` |
| `.env.example` | The three new variables, documented |
| *(11 spec files)* | Fixtures and expectations updated for `status`, the new DTO shapes, and the new collaborators |

## Database

### Schema changes

1. **`User.passwordHash` is nullable.** An account created by an administrator
   has no password until its owner chooses one. Null and
   `status = PENDING_ACTIVATION` are the same fact seen from two sides; the
   status is what anything queries.
2. **`AccountStatus` enum + `User.status`, replacing `User.isActive`.** Default
   `PENDING_ACTIVATION` rather than `ACTIVE`, for the same reason `@Public()` is
   an allowlist: a row inserted by a path that forgot to think about this is
   unusable until somebody activates it, instead of being a working login nobody
   created on purpose.
3. **`AccountTokenType` enum + `AccountToken` model**, with `onDelete: Cascade`,
   `tokenHash` unique, and `@@unique([userId, type])`.

No other column was added. `Employee.phone` already existed and is what the
profile edit writes.

### The migration

`20260809140000_add_account_lifecycle` — **written but not applied.** It is one
transaction: create the two enums, widen `password_hash`, add `status`, back-fill
it, drop `is_active`, create `account_tokens`.

The back-fill is `is_active ? ACTIVE : DISABLED`. Every account that exists before
this migration was created through the old `POST /users`, which required a
password, so none of them is genuinely pending.

```bash
# From backend/. Explained in the summary; run only when you are ready.
npx prisma migrate dev --name add_account_lifecycle
```

## API

### Onboarding

```http
POST /api/v1/users                       # ADMIN | SUPERADMIN
{ "email": "ana.pop@company.com", "username": "APO", "role": "USER" }
→ 201 { "success": true, "data": { "id": "...", "status": "PENDING_ACTIVATION", ... } }
# and an activation email is sent. No password is accepted or returned.
```

```http
POST /api/v1/employees                   # HR+ ; the `account` opt-in is ADMIN | SUPERADMIN
{ "employeeCode": "EMP-0042", ..., "account": { "email": "...", "role": "USER" } }
# or, against an existing account:
{ "employeeCode": "EMP-0042", ..., "userId": "usr-1" }
→ 201  # exactly one of `userId` / `account`; both or neither is a 400
```

```http
POST /api/v1/users/:id/resend-activation # ADMIN | SUPERADMIN
→ 200 { "success": true, "data": null }
→ 409 ACCOUNT_NOT_PENDING_ACTIVATION  { "params": { "status": "ACTIVE" } }
```

### Activation and recovery (all `@Public()`, all strict-rate-limited)

```http
POST /api/v1/auth/activate
{ "token": "<43 chars from the link>", "password": "the one they choose" }
→ 200 { "success": true, "data": null }        # no session: they now log in
→ 401 ACCOUNT_TOKEN_INVALID                    # unknown | expired | used | wrong purpose

POST /api/v1/auth/forgot-password
{ "email": "ana.pop@company.com" }
→ 200 { "success": true, "data": { "message": "If an account exists for that email address, …" } }
# identical for every address, known or not

POST /api/v1/auth/reset-password
{ "token": "<43 chars>", "newPassword": "…" }
→ 200 { "success": true, "data": null }        # every session revoked
```

### Password change (authenticated)

```http
POST /api/v1/auth/change-password
{ "currentPassword": "…", "newPassword": "…", "refreshToken": "…" }   # refreshToken optional
→ 200 { "success": true, "data": null }        # other sessions revoked; this one kept
→ 401 ACCOUNT_CURRENT_PASSWORD_INCORRECT
```

### Account management

```http
GET    /api/v1/users?status=PENDING_ACTIVATION   # ?isActive= is gone
PATCH  /api/v1/users/:id     { "username": "…", "role": "HR" }   # no password, no status
POST   /api/v1/users/:id/activate     → 200 (DISABLED → ACTIVE; 409 for PENDING)
POST   /api/v1/users/:id/deactivate   → 200 (+ every session revoked)
DELETE /api/v1/users/:id              # unchanged: still 409 while an employee is linked
```

All eight refuse HR and `USER` with `403 AUTHORIZATION_ACCOUNT_ADMIN_REQUIRED`.

### Profile

```http
GET /api/v1/profile/me
→ { "account": { "id", "email", "username", "role", "status", "createdAt" },
    "employee": { "id", "employeeCode", "firstName", "lastName", "phone",
                  "hireDate", "terminationDate", "seniority", "status",
                  "department": {...}, "position": {...} } | null }

PATCH /api/v1/profile/me
{ "phone": "+40 722 000 000" }   # or null to clear. Anything else → 400
→ the whole profile
→ 403 AUTH_NO_EMPLOYEE_RECORD    # an account with no employment record
```

### New error codes (Feature 033 catalog)

| Code | Status | Means |
| --- | --- | --- |
| `AUTHORIZATION_ACCOUNT_ADMIN_REQUIRED` | 403 | not ADMIN/SUPERADMIN. **Distinct from `AUTHORIZATION_PERMISSION_DENIED`: there is nothing to grant**, so a frontend must not offer a "request access" link |
| `ACCOUNT_TOKEN_INVALID` | 401 | a dead link — unknown, expired, used, or wrong purpose. `params.purpose` says which kind |
| `ACCOUNT_NOT_PENDING_ACTIVATION` | 409 | resend/activate on an account in the wrong state. `params.status` |
| `ACCOUNT_CURRENT_PASSWORD_INCORRECT` | 401 | wrong `currentPassword`. Distinct from `AUTH_INVALID_CREDENTIALS` because the caller is already authenticated, so there is no enumeration to protect |

### Environment

| Variable | Required | Default |
| --- | --- | --- |
| `APP_WEB_URL` | **yes** | none — a guessed origin emails links nobody can open |
| `ACCOUNT_ACTIVATION_TTL` | no | 259200 (72h) |
| `ACCOUNT_PASSWORD_RESET_TTL` | no | 3600 (1h) |

The two lifetimes differ by design: an activation link opens an *empty* account
and may sit over a weekend; a reset link opens a *real* one and its requester is
at their keyboard now.

## Frontend

Backend only. Three contracts the React application needs:

**1. Two new screens, matching the emailed paths.** `/activate-account?token=…`
and `/reset-password?token=…`. Each reads the token from its own URL and `POST`s
it in a **body** — never a query string, which is written into access logs,
`Referer` headers and browser history.

**2. `status` replaces `isActive`.** A client that read `isActive` reads
`status !== 'DISABLED'`; one that filtered `?isActive=true` filters
`?status=ACTIVE`. The accounts screen gains a genuinely new filter,
`?status=PENDING_ACTIVATION` — "who has not accepted their invitation yet" —
which the boolean could not express.

**3. Error handling.** `ACCOUNT_TOKEN_INVALID` → "this link no longer works" plus
a way to get a new one (per `params.purpose`: ask an administrator, or request a
reset). `AUTHORIZATION_ACCOUNT_ADMIN_REQUIRED` → **do not** offer a "request
access" action.

The create-account form loses its password field; the create-employee form gains
the account opt-in, shown only to `ADMIN`/`SUPERADMIN`.

## Notes

### User vs Employee

`User` is a **login** — email, password, role, account state. `Employee` is an
**HR record** — code, position, department, phone, hire date. They are a 1—0..1
relation: an account may exist with no employee (a system super-admin), and this
feature keeps them apart everywhere. Account concerns live on `/users` and
`/auth`; HR data lives on `/employees`. `/profile/me` is the only place they are
deliberately shown together, and even there they are nested rather than
flattened, so a reader can always tell which half a field belongs to.

### Module seam: users → auth, never back

This module owns the *account*; the auth module owns the *credential mechanism*.
Onboarding starts in users (an administrator creates or resends) and finishes in
auth (the person follows the link). `UserModule` imports `AuthModule` for three
things — `AccountTokenService`, `AccountEmailService`, `AuthService.revokeSessions`
— and `AuthModule` imports nothing back: where it needs an account it reads the
`users` table directly, as login already did. That keeps the graph acyclic and
preserves the property `AuthModule` asks for: everything will eventually depend on
authentication, so authentication depends on none of it.

### Behaviour changes worth flagging

- **`POST /users` no longer accepts `password`;** `PATCH /users/:id` no longer
  accepts one either. Both are rejected with a `400` naming the property rather
  than silently ignored, so a client written against the old contract is told.
- **`isActive` is gone** from the user entity, the query string, and both DTOs.
- **HR can no longer reach any `/users` route.** It never should have been able
  to; there was no check at all before Feature 036.
- **An administrator can no longer set a locked-out colleague's password.** The
  replacement is `POST /auth/forgot-password`, which the person uses themselves.

## Future Improvements

- **Email change with verification.** The one field a person most reasonably
  expects to edit and cannot. It needs the new address proven reachable before the
  old one stops working — otherwise a typo locks somebody out of an account whose
  recovery links now go to the wrong mailbox.
- **Equalise `forgot-password` timing**, or accept the rate limiter as the
  mitigation. Documented above as a known residual.
- **A sweep for expired `account_tokens`.** Not needed for correctness — the
  unique pair bounds the table at two rows per account — but a spent row from
  2026 is untidy.
- **"Sign out everywhere"** as a self-service action. `revokeSessions` is now
  public and does exactly this; it needs a route and a screen.
- **Account-level preferences** (language, theme). No columns exist; when one is
  genuinely needed it belongs on `users` and in the profile whitelist the same
  day.
- **An audit trail for account administration**, as `permission_audit_logs` does
  for permissions. Who disabled an account and when is currently only in the
  application log.
