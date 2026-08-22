# Authorization Enforcement

## Goal

Turn the permission system Feature 029 **stores and resolves** into one that is
**enforced**.

Feature 029 built the engine — a fifty-five permission catalog, role baselines,
per-user overrides, and one method that reduces all three to "what may this
person actually do". It deliberately enforced none of it, and said so in its own
source:

> `resolveEffective` computes a permission set; it blocks no request, guards no
> route and is imported by no interceptor.

The reason was stated just as plainly: enforcement against a *claimed* identity
is a check that reads as protection while providing none. `@CurrentUser()` was
reading `x-user-id` from a header any caller could set, so a guard on top of it
would have resolved the permissions of whoever the request *said* it was.
Feature 032 removed that obstacle. This feature is the half that was deferred:

```text
  029  who may do what          — stored and resolved
  032  who the caller is        — proved, not claimed
  035  refusing the request     — this feature
```

After it, the frontend's soft gating via `GET /permissions/me/effective` is
backed by real server-side enforcement. A caller who bypasses the UI and calls a
gated endpoint directly is refused.

## Requirements

- A `@RequirePermission()` decorator declaring which catalog key(s) a route
  needs, and a global guard that enforces it.
- The guard must run **after** authentication and must reuse
  `PermissionService.resolveEffective` — never reimplement resolution, never
  special-case `SUPERADMIN`.
- A route that declares nothing is allowed: this is a controlled rollout, not a
  big-bang lockdown of thirty tested modules.
- A denial is a `403` through the standard error envelope, with a stable error
  code, clearly distinct from the `401` that means "not authenticated".
- Existing domain ownership and state rules stay where they are and layer
  underneath the gate.
- No Prisma schema change, no migration, no new runtime dependency.

## Backend

### The decorator

`src/modules/authorization/decorators/require-permission.decorator.ts`

```ts
@Post(':id/approve')
@RequirePermission('TIMESHEET.APPROVE')
approve(...) { ... }
```

It writes one metadata key, `authorization:requiredPermissions`, carrying
`{ keys, mode }`.

**`ALL` is the default.** Several keys mean the caller must hold every one of
them. The two readings differ only when a caller holds *some* of the listed
keys, and in that case `ALL` refuses while `ANY` admits — so the ambiguous
reading is made the safe one, and the permissive reading has to be asked for by
name:

```ts
@RequirePermission('PERMISSIONS.VIEW', 'PERMISSIONS.EDIT')     // needs both
@RequireAnyPermission('PERMISSIONS.VIEW', 'PERMISSIONS.EDIT')  // needs either
```

`RequireAnyPermission` is written and tested but applied to no route in this
feature. It exists because "what do several keys mean" is a question the first
two-key route would otherwise answer by accident, and because a documented `ANY`
is what keeps somebody from reaching for an expression engine later. There is
deliberately **no** `@RequirePermission({ all: [...], any: [...] })` and no
boolean syntax: a route whose access rule needs structure has a rule that
belongs in its service, where it can be named and tested.

Placement follows `getAllAndOverride`, the same rule `@Public()` and
`@StrictRateLimit()` use: on a method it covers that route, on a class it covers
every route in it, and a method-level declaration **replaces** the class's rather
than adding to it. Both decorators write one key, so carrying both on one handler
is not a combination — the second applied wins. A route should carry exactly one.

At least one key is required by the signature (`[string, ...string[]]`), because
a requirement of nothing is not a weaker gate — it is an open route that looks
gated, and `every()` over an empty list admits everybody.

### The guard

`src/modules/authorization/permissions.guard.ts`

Registered as the third `APP_GUARD` in `app.module.ts`:

```text
  ApiThrottlerGuard   how often may anybody ask     (034)
  JwtAuthGuard        who is asking                 (032)  → 401
  PermissionsGuard    may they ask this             (035)  → 403
```

**The order is load-bearing and is documented on both the guard and the
provider.** Nest runs global guards in declaration order; this one reads
`request.user`, and nothing puts a user there until authentication has run.
Reversed, every gated route would answer `403` to a perfectly valid token — and
the two status codes would swap meanings, so a client could no longer tell "your
session expired" from "your account may not do this".

What it does, in order:

1. Read the route's requirement. **No requirement → allow**, with no user read
   and no query. Every ungated route in the application takes this branch, so
   registering the guard globally costs them one `Reflector` lookup.
2. Non-HTTP context → allow. The same pass-through `JwtAuthGuard` and
   `ApiThrottlerGuard` make: a WebSocket message handler has no HTTP request to
   read a caller from. Unreachable in practice — the one gateway carries no
   `@RequirePermission()`.
3. Resolve the caller with `resolveCurrentUser(request)` — the same function
   `@CurrentUser()` uses, so a gated route reached without authentication throws
   the standard `401` rather than a second kind of refusal.
4. Resolve the effective set through
   `PermissionService.resolveEffective(user.userId, user.role)`, reduce it to
   granted keys with `toEffectivePermissionsEntity`, memoize it on the request.
5. Apply `ALL`/`ANY`. Satisfied → allow. Otherwise throw `403`.

### Resolution is reused, never reimplemented

The guard reads **nothing** from `permissions`, `role_permissions`,
`user_permission_overrides` or `permission_presets`. It injects
`PermissionService` — which `PermissionManagementModule` already exported for
exactly this caller, before this caller existed — and calls the one method.

**There is no `role === SUPERADMIN` anywhere in the guard.** A super-admin passes
a gated route because `resolveEffective`'s own branch hands back every catalog
permission. That is the point of the seam: an effective set computed in two
places is two answers to one question, and the day they disagreed the permissions
screen would offer what the guard refuses, or the guard would allow what the
matrix says was revoked. Feature 029 wrote:

> When Permission Enforcement is written, its guard calls this method too rather
> than reimplementing three lines it can see.

It does.

The reduction to granted keys goes through `toEffectivePermissionsEntity` — the
same mapper `GET /permissions/me/effective` answers with — rather than a filter
written in the guard. The endpoint the frontend hides buttons on and the guard
that refuses the request therefore reduce one resolution the same way.

### Per-request memoization, and no cache beyond it

`resolveEffective` reads the catalog plus two tables. A request that runs two
checks — a controller-level requirement and a stricter one on the handler is a
legitimate shape — would otherwise pay twice, so the resolved `Set` is parked on
the request object under a `Symbol` and reused. It lives and dies with the
request.

**There is deliberately no cross-request cache.** It is the obvious next
optimisation and the one with a security cost: a permission revoked through the
029 screen would keep working until the cache expired, turning "take this access
away" into "take this access away in a few minutes" — precisely the situation an
administrator is racing when they revoke something. Feature 032 made the same
call for the account lookup, resolving the user from the database on every
request so a deactivation takes effect immediately rather than at token expiry.
Recorded under Future Improvements with the invalidation path it would need.

### `@Public()` + `@RequirePermission()` is refused at startup

The two contradict outright: `@Public()` says the route has no caller,
`@RequirePermission()` asks what the caller may do. There is no sensible
resolution, so the combination is not given a meaning — it is rejected.

`PublicRouteValidator` walks every controller in the application through
`DiscoveryService` and `MetadataScanner` on `onModuleInit`, and throws with the
name of each offending `Controller.method`. Left to the guard, such a route would
answer the `401` that `resolveCurrentUser` produces for a request with no
identity: a safe failure and a useless diagnosis, because a public endpoint that
tells everybody they are not authenticated looks like a broken client. Failing
the boot puts the mistake in front of the person who made it. The same instinct
as `TokenService` reading its signing keys in the constructor.

### 401 versus 403

| Status | Means | Emitted by | Code | What a client should do |
| --- | --- | --- | --- | --- |
| `401` | not authenticated — no, malformed, expired or forged token | `JwtAuthGuard` (032) | `AUTH_UNAUTHENTICATED` | refresh, then send the user to the login screen |
| `403` | authenticated, not permitted | `PermissionsGuard` (035) | `AUTHORIZATION_PERMISSION_DENIED` | show "you do not have access — ask an administrator". **Do not refresh; do not log out** |

The distinction is the practical payoff of the guard ordering. Refreshing a token
does nothing for a `403`, and signing in again produces exactly the same refusal
— so a client that treated the two alike would put a user into a login loop they
could not escape.

`403` is also still produced by domain rules that predate this feature
(`assertOwner`, `assertAdministrative`), and those carry **no** `errorCode`.
That is how a client tells "you lack a permission" (has the code, actionable by
an administrator) from "this is not your timesheet" (no code, nothing to grant).

### Files created

| File | What it is |
| --- | --- |
| `backend/src/modules/authorization/decorators/require-permission.decorator.ts` | `@RequirePermission()`, `@RequireAnyPermission()`, the metadata key, and the two pure helpers the guard and the validator both read it through |
| `backend/src/modules/authorization/permissions.guard.ts` | The guard; per-request memoization; the denial message builder |
| `backend/src/modules/authorization/public-route.validator.ts` | The startup check that refuses `@Public()` + `@RequirePermission()` |
| `backend/src/modules/authorization/authorization.module.ts` | Imports `PermissionManagementModule` and `DiscoveryModule`; provides and exports the guard |
| `backend/src/modules/authorization/permissions.guard.spec.ts` | Guard decisions in isolation: undeclared routes, ALL/ANY, memoization, the resolver reuse, 401-not-403 |
| `backend/src/modules/authorization/routing.spec.ts` | End to end: real routes, real guard, real resolver, **real seeded baselines** |
| `backend/src/modules/authorization/public-route.validator.spec.ts` | That the contradiction fails the boot and names the routes |
| `backend/src/modules/authorization/catalog.spec.ts` | Every declared key exists in the seeded catalog |
| `backend/src/modules/authorization/authorization.module.spec.ts` | The real dependency graph compiles — chiefly, that 029 still exports its resolver |
| `FEATURES/035-authorization-enforcement.md` | This document |

### Files modified

| File | Change |
| --- | --- |
| `backend/src/common/constants/error-codes.constants.ts` | Added `AUTHORIZATION_PERMISSION_DENIED`, with its `params` contract |
| `backend/src/app.module.ts` | Imported `AuthorizationModule`; registered `PermissionsGuard` as the third `APP_GUARD`, after `JwtAuthGuard`; refreshed the module comments that promised this feature |
| `backend/src/modules/permission-management/permission.controller.ts` | `PERMISSIONS.VIEW` on the catalog and the presets; documented why `me/effective` is **not** gated |
| `backend/src/modules/permission-management/user-permission.controller.ts` | `PERMISSIONS.VIEW` / `EDIT` / `CONFIGURE` across the five routes |
| `backend/src/modules/reporting/reporting.controller.ts` | `REPORTS.VIEW` on all three routes; `@CurrentUser()` removed; the replace-versus-layer reasoning |
| `backend/src/modules/reporting/reporting.service.ts` | **Deleted `assertReportingAccess`**; the three methods no longer take a caller |
| `backend/src/modules/reporting/reporting.module.ts` | Documentation |
| `backend/src/modules/timesheet-management/timesheet.controller.ts` | `TIMESHEET.APPROVE` on `approve` and `reject`; the layering and why `assertAdministrative` stayed |
| `backend/src/modules/timesheet-management/timesheet-management.rules.ts` | Documentation on `assertAdministrative` |
| `backend/src/modules/timesheet-management/timesheet-management.module.ts` | Documentation |
| `backend/prisma/seeds/permission-sets.ts` | Moved `REPORTS.PAGE_ACCESS` / `REPORTS.VIEW` from `HR_VIEW_ONLY` to `ADMIN_LIMITED` |
| `backend/prisma/seeds/role-permissions.seed.ts` | Documentation of the resulting baseline counts |
| `backend/src/modules/reporting/routing.spec.ts` | Dropped the `assertReportingAccess` unit tests; asserts the declarations instead |
| `backend/src/modules/permission-management/routing.spec.ts` | Asserts the declared keys, including that `me/effective` declares none |
| `backend/src/modules/timesheet-management/routing.spec.ts` | Asserts which two routes are gated and that the other seven are not |

## Frontend

**No frontend work.** This is backend only, but it changes what the frontend must
expect, in three ways.

### 1. The soft gating is now real, and unchanged

`GET /permissions/me/effective` is exactly what it was: a flat array of granted
keys a client turns into a `Set` once and asks `has('TIMESHEET.CREATE')` of. What
changed is what happens when a client ignores it. Before, drawing every button
worked; now the gated endpoints answer `403`. Hiding a button remains a courtesy
to the person using the screen, and the server no longer relies on it.

**`me/effective` is deliberately not permission-gated**, and must not become so.
Gating it would mean an ordinary employee could not discover their own
permissions — a `403` from the very call whose job is to say which buttons to
draw — and a client would have to read that `403` as "you have nothing", which is
exactly wrong. Reading your own effective set returns keys the caller already
holds and reveals nothing about anybody else. Somebody else's set is
`GET /users/:id/permissions`, and that one *is* gated.

### 2. The routes to align against

| Route | Required key |
| --- | --- |
| `GET /api/v1/permissions` | `PERMISSIONS.VIEW` |
| `GET /api/v1/permissions/presets` | `PERMISSIONS.VIEW` |
| `GET /api/v1/permissions/me/effective` | *(none — deliberately)* |
| `GET /api/v1/users/:id/permissions` | `PERMISSIONS.VIEW` |
| `GET /api/v1/users/:id/permissions/history` | `PERMISSIONS.VIEW` |
| `PUT /api/v1/users/:id/permissions` | `PERMISSIONS.EDIT` |
| `POST /api/v1/users/:id/permissions/apply-preset` | `PERMISSIONS.CONFIGURE` |
| `DELETE /api/v1/users/:id/permissions` | `PERMISSIONS.CONFIGURE` |
| `GET /api/v1/reports` | `REPORTS.VIEW` |
| `POST /api/v1/reports/:reportType/preview` | `REPORTS.VIEW` |
| `POST /api/v1/reports/:reportType/export` | `REPORTS.VIEW` |
| `POST /api/v1/timesheets/:id/approve` | `TIMESHEET.APPROVE` |
| `POST /api/v1/timesheets/:id/reject` | `TIMESHEET.APPROVE` |

Every other route in the application is ungated and behaves exactly as before.

### 3. Handling the new code

`AUTHORIZATION_PERMISSION_DENIED` needs a translation, and it must **not** be
routed through the session-expiry handling that `AUTH_UNAUTHENTICATED` uses. The
`params` are `requiredPermissions` (one key, or several joined by `", "`) and
`mode` (`ALL` or `ANY`), so a message can name what is missing:

```json
{
  "success": false,
  "statusCode": 403,
  "message": "This action requires the REPORTS.VIEW permission",
  "errorCode": "AUTHORIZATION_PERMISSION_DENIED",
  "params": { "requiredPermissions": "REPORTS.VIEW", "mode": "ALL" },
  "path": "/api/v1/reports",
  "timestamp": "2026-08-09T10:15:00.000Z"
}
```

The caller's own permission set is **never** in the response. Returning it would
turn every refusal into a map of what the account can still reach.

## Database

**No schema change, no migration.** `schema.prisma` is untouched and
`npx prisma validate` passes. Every table this feature reads was created by
Feature 029's migration, and it reads all of them through `PermissionService`.

### One seed adjustment, made deliberately

`REPORTS.PAGE_ACCESS` and `REPORTS.VIEW` were in `HR_VIEW_ONLY`, which put them
in the **HR baseline** and — because the sets nest — in every admin tier above
it. They moved down to `ADMIN_LIMITED`:

```text
                     before   after
  USER baseline        16       16
  HR - View Only       26       24
  HR - Standard        35       33   ← HR baseline
  HR - Full Access     41       39
  Admin - Limited      40       40
  Admin - Standard     46       46   ← ADMIN baseline
  Admin - Full         55       55
```

The admin tiers are unchanged — they inherit the two keys from one step lower
now. The three HR cards each lose exactly two.

**Why it had to be decided rather than inherited.** Until this feature,
`REPORTS.VIEW` was configuration nothing read, and reporting's access was a
hardcoded `isAdministrativeRole` check that admitted HR. Making the permission
the *enforced* control meant the seeded baseline became the live policy, so
"should HR read company-wide hour matrices" — the attendance sheet lists
everybody's absences, and the hour matrices state what each colleague earned
their month on — stopped being a question nobody had to answer. The default is
now no.

**It is reversible without touching the seed**, which is the whole point of
gating on a permission rather than a role: an administrator who decides one HR
lead does need the reports grants `REPORTS.PAGE_ACCESS` and `REPORTS.VIEW` to
that account through the permissions screen, and the audit trail records who did
it. Putting them back in `HR_VIEW_ONLY` would be the different, larger decision
that *every* HR account should have them.

> **On an existing database this seed will not withdraw them.** Seeds here add
> and never remove — `role-permissions.seed.ts` says so and explains why — so an
> HR baseline that already holds the two rows keeps them until either
> `prisma migrate reset` rebuilds it or somebody revokes them deliberately. That
> is correct rather than an oversight: withdrawing a permission changes what
> people can do and belongs in an act somebody performed on purpose, not in a
> script that runs whenever anybody types `npm run prisma:seed`. **A deployment
> that wants the new policy on existing data must apply it, and no command in
> this feature does it automatically.**

## API

No new endpoint, no changed request shape, no changed success response.

What changed is that thirteen existing routes can now answer `403` with
`AUTHORIZATION_PERMISSION_DENIED` — see the table under Frontend — and that
`/api/v1/reports` no longer admits HR by default.

## Notes

### The gating model: declared routes only

A route with no `@RequirePermission()` is allowed through. That is the opposite
posture from `JwtAuthGuard`, which protects by default and takes `@Public()` as
the exemption, and the difference is deliberate:

- Authentication has one universal answer — "a caller must be known" — so its
  default can be closed and a route added next year is protected because nobody
  did anything.
- Authorization has none. *Which* permission a route requires is a decision per
  route, and there is no conservative default to fall back on. "Deny everything
  undeclared" would have locked thirty tested modules out of their own endpoints
  the moment the guard was registered; "require some invented key" would have
  invented policy.

What makes that safe rather than lax is that the guard only ever **adds** a
refusal. No route is less protected than it was, every existing domain and role
check still runs, and the un-gated routes are covered by exactly what covered
them yesterday.

Migrating the rest is a gradual, per-module effort — a route is gated when its
key exists and the team decides — exactly the way Feature 033 rolled error codes
out over thirty modules rather than in one sweep.

### The layering: gate in front, domain rules underneath

The gate is coarse by construction. It answers "may this account approve
timesheets", never "may it approve *this* one". `POST /timesheets/:id/approve`
therefore has both layers, and neither replaces the other:

```text
  PermissionsGuard      TIMESHEET.APPROVE          → 403 + errorCode
  TimesheetService      assertAdministrative       → 403, no code
                        assertAdminVisible         → 404 (a draft is private)
                        assertStatusIs(SUBMITTED)  → 409 (about the timesheet)
```

A caller holding the permission still cannot approve a `DRAFT`, and the `409`
they get is about the timesheet rather than about them. The seed made the same
point about the `USER` baseline before any of this existed:

> `TIMESHEET.EDIT` says somebody may edit a timesheet, not whose. […] this set
> says *what*, the route says *whose*.

### Replaced or layered, per route

| Existing check | Met by | Outcome | Why |
| --- | --- | --- | --- |
| `assertReportingAccess` (`isAdministrativeRole`) | `REPORTS.VIEW` | **Replaced** | The role check no longer said what the company means. `isAdministrativeRole` is about who administers the *system* — the same list that decides who sees the administrative notification workspace — and was reused here for want of anything better. Whether HR should read company-wide reports is a different question, now answered by a permission that can be changed per account. **Layering would have been the worst of both**: the role check would have kept admitting HR, so the permission could never narrow anything, and it would have silently vetoed any grant an administrator made — a permissions screen that says "granted" over an endpoint that still refuses. |
| `assertAdministrative` (timesheets) | `TIMESHEET.APPROVE` | **Layered** | Its purpose is not to name a tier of staff: it is what stops an employee approving their own month, the one thing this lifecycle must never permit by accident. It also guards `findAll`, `findOne` and `remove`, which this feature did not gate — dropping it from two of five would leave the review queue protected by a rule approval no longer used. The gate is therefore additive, and what it buys is the ability to **narrow**: `TIMESHEET.APPROVE` can be revoked from one particular administrator, and that now works. It cannot **widen** below the administrative roles — a plain `USER` granted the key still meets `assertAdministrative` — and extending approval to non-administrative staff should be a deliberate decision, not a checkbox. |
| The super-admin `409` on writing a super-admin's matrix | `PERMISSIONS.EDIT` / `CONFIGURE` | **Layered** | It is a rule about the *resource*, not the caller. |

### The permission keys are strings, and what checks them

The catalog's fifty-five keys exist as a union of literals — `PermissionKey` in
`prisma/seeds/permissions.seed.ts` — but the seeds are CLI-only tooling that
`tsconfig.build.json` excludes, so `src/` cannot import that type without
shipping the seed inside `dist/`. Copying the literals into `src/` would be the
catalog written twice, which is the one thing this project will not do for a
permission list.

`catalog.spec.ts` buys the guarantee instead: a spec can import across that line
where the application cannot, so it reads the requirement off every gated route
and asserts each key is one the seed actually creates.
`@RequirePermission('REPORTS.VEIW')` is therefore a failing test rather than a
gate no grant in the system can ever satisfy — which would refuse everybody but
a super-admin while looking like a working access rule.

### What was deliberately not built

- **No cross-request permission cache** (see above).
- **No boolean expression engine.** `ALL` and `ANY`, and nothing more.
- **No re-implementation of resolution**, including the super-admin branch.
- **No sweep across the remaining routes.**
- **No removal of any domain ownership or state rule.**
- **No schema change, no migration, no new package.** `DiscoveryModule` is part
  of `@nestjs/core`, already a dependency.

## Testing

`npm test` — **128 suites, 2604 tests, all passing.** `npx tsc --noEmit` is
clean, `nest build` succeeds, `npx prisma validate` passes.

### Guard mechanics — `permissions.guard.spec.ts`

- An undeclared route is allowed **and resolves nothing** (no query).
- A gated route allows a caller who holds the key.
- A caller who lacks it gets `403` + `AUTHORIZATION_PERMISSION_DENIED`.
- The refusal names the requirement and never the caller's own permissions.
- `SUPERADMIN` passes through the resolver's branch — the stub returns what that
  branch returns, and there is no role check in the guard to find.
- `ALL`: two required keys, one held → refused, and every missing key is named.
- `ANY`: either key admits; neither refuses, with `mode: 'ANY'` in `params`.
- **A per-user `REVOKE` on a permission the role grants refuses through the
  guard** — the case a separate code path would most plausibly get wrong.
- Memoization: two checks on one request → one `resolveEffective`; two requests →
  two.
- No authenticated caller → `401`, not `403`, and no resolution attempted.
- A non-HTTP context passes through.
- The helpers: empty key list is treated as no requirement; the `ALL`/`ANY`
  truth table; the message wording.

### End to end — `routing.spec.ts`

Real controllers, the real guard, the real `PermissionService`, and the **real
seeded baselines** imported from `prisma/seeds/permission-sets.ts` — so
"an ADMIN may run a report and an HR user may not" is asserted against the list
this product ships, and would fail if somebody moved `REPORTS.VIEW` back into the
HR column. Only the database is substituted.

- **Regression:** an undeclared route answers `200` to every role including
  `USER`.
- Guard order from the outside: no token → `401` + `AUTH_UNAUTHENTICATED`; good
  token, wrong account → `403` + the full envelope asserted field by field.
- `ALL`/`ANY` against the real baselines, including an override supplying the
  missing key, and a `SUPERADMIN` with no baseline and no override.
- **Permission management:** an ADMIN reads the catalog and a matrix; an ordinary
  employee is refused; **an ADMIN is refused all three writes**, because no
  baseline holds `PERMISSIONS.EDIT` or `CONFIGURE`; a caller granted `EDIT` may
  `PUT` but may not `DELETE` (that is `CONFIGURE`); a `SUPERADMIN` may write, so
  nobody can lock the system out; an ordinary employee reads their own effective
  set and gets exactly the `USER` baseline.
- **Reporting:** ADMIN and SUPERADMIN admitted; **HR refused**; **the same HR
  account admitted once granted `REPORTS.VIEW` by a per-user override** — the
  proof that the granular gate makes later extension possible with no code
  change; an ADMIN whose key was revoked is refused; `USER` refused; the export
  gated as well as the preview and the menu.
- **Timesheets:** ADMIN admitted; HR refused (its baseline withholds the key);
  **an ADMIN who clears the gate is still refused a `409` by the state rule** —
  both layers on one request; **a `USER` granted `TIMESHEET.APPROVE` clears the
  gate and is then refused by `assertAdministrative`**, with no `errorCode`,
  proving the gate narrows but does not widen; the ungated routes of the same
  controller still answer.

### Startup — `public-route.validator.spec.ts`

Public-only and gated-only routes boot; the combination throws on `init()`,
naming every offending `Controller.method` rather than the first.

### Declarations — `catalog.spec.ts` and the three module specs

Every declared key exists in the seeded catalog; exactly twelve routes are gated
across four controllers, using five distinct keys. Each module's own routing spec
asserts its declarations, including the absences — that `me/effective` declares
nothing, and that the seven ungated timesheet routes declare nothing — because a
decorator drifting onto `submitOwn` would stop every employee handing in a month
and no other test would notice.

### Wiring — `authorization.module.spec.ts`

The real graph compiles. This matters more here than almost anywhere: if
`PermissionManagementModule` ever stopped exporting `PermissionService`, the
guard would fail to construct at boot while every unit test kept passing, because
they all hand it a stub.

## Future Improvements

- **A cross-request permission cache.** Deliberately not built (see Notes). It
  needs an explicit invalidation path — `UserPermissionService` is the only
  writer, so it is the natural place to evict — plus eviction on a role change in
  the users module. Worth doing when a profiler says the two extra queries per
  gated request matter; not before.
- ~~**Migrate the remaining routes**, per module, as each is touched. Employees,
  projects, leave configuration, notification configuration and the work schedule
  all have keys in the catalog and role checks in their services today.~~
  **Addressed by [Feature 041](041-authorization-write-sweep.md)**, and done as
  one sweep rather than per module — because the gap turned out to be a security
  hole rather than a migration backlog: every write verb in those modules was
  reachable by any authenticated employee. Forty-four verbs across seventeen
  controllers now declare a key, taking the application from twelve gated routes
  to fifty-six and from five keys in use to thirty. **Reads are still open**, and
  041's own list records which of them deserve a decision.
- **`PAGE_ACCESS` keys are enforced nowhere**, by design: they gate *screens*, so
  the frontend reads them from `me/effective`. If a route is ever added that is
  genuinely "open this page", it should say so.
- **Row-level scoping is still out of scope.** `TIMESHEET.EDIT` says what, not
  whose. If per-department or per-project scoping is ever wanted, it is a
  different mechanism — the matrix of (resource × action) cannot express it — and
  should not be smuggled into this decorator.
- **A withdrawal path for a permission removed from a baseline.** The seeds add
  and never remove, so the `REPORTS` move in this feature does not take effect on
  an existing database. A reviewed one-off script, or an explicit
  "reconcile baselines" command, would make such policy changes deployable rather
  than manual.
- **Machine-readable route documentation.** The gated-route table in this
  document is maintained by hand. Once Swagger lands, the requirement metadata is
  already on the handlers and could annotate each operation automatically.
