# Permissions

## Goal

Give the application the list of things the signed-in person may do, two ways to
ask about it, and one answer to the question F03 left open: **what happens when
that list changes while they are looking at the screen.**

The backend already enforces every permission (Feature 035). Nothing in this
feature protects anything. What it does is stop the application from *lying* —
offering a menu item that leads to a refusal, a button that fails when pressed,
or the word "Administrator" beside somebody who was demoted twenty minutes ago.

## Requirements

- The effective set from `GET /permissions/me/effective`, in TanStack Query,
  keyed to the account.
- `hasPermission` and its `ALL` / `ANY` variants, with the semantics written
  down once and implemented once.
- Route gating composed on top of F03's auth guard, declared per route.
- `<Can>`, for buttons, menu items and sections — the primitive the layout
  feature will filter the sidebar with.
- Live re-sync when a role or a permission changes mid-session: reactive on a
  `403`, proactive on returning to the tab, with the role re-read too.
- No stale set across sessions, no refetch loops.
- Type-check, lint and build clean.

---

## The one thing that decides the shape of everything else

**The permission set is not known when the router mounts, and the session is.**

F03 could push `auth` onto the router context because `AuthGate` holds the whole
application back until `GET /auth/me` has answered. Doing the same for
permissions would mean a second full-page spinner, and would still be wrong at
the one moment that matters most: at login, `startSession` clears the query
cache, and the very next thing that happens is a navigation to `/app` or to the
`?redirect=` the guard recorded. A guard reading a *pushed snapshot* at that
instant reads an empty set and refuses a page the person is entitled to.

So the set is **awaited**, in `workspaceRoute`'s `beforeLoad`, and returned as
context for its children:

```ts
beforeLoad: async ({ context, location }) => {
  if (!context.auth.isAuthenticated || context.auth.user === null) {
    throw redirect({ to: '/login', search: { redirect: location.href } });
  }

  return {
    permissions: await loadEffectivePermissions(context.queryClient, context.auth.user.id),
  };
}
```

Three consequences follow, and they are the reason this arrangement is worth the
paragraph:

- A child route's guard is **synchronous and cannot see a half-loaded set**. The
  parent has already awaited it, so `requirePermission` has no third branch and
  no "still loading" case to get wrong.
- Nothing above `/app` ever needs the set. A permission is meaningless without a
  session, and every route that needs one is under `/app` by construction — so
  `RouterContext` stays as F03 left it, with the seam it carried now replaced by
  a note saying why.
- The cost is bounded. `ensureQueryData` is a cache read once the set is loaded,
  so it is one request per session, and usually zero by the time a guard asks:
  `AppRouter` mounts an observer as soon as somebody is authenticated, which
  normally starts the request first.

---

## State & Data

### The query

| | |
| --- | --- |
| Key | `['permissions', 'me', 'effective', userId]` |
| `staleTime` | 60 s |
| `refetchOnWindowFocus` | **on**, against the application default of off |
| Cache holds | the raw `EffectivePermissionsEntity` |
| Components read | a `PermissionSet`, via `select` |

**The user id is in the key** even though `startSession` clears the whole cache
at login. With it, a set belonging to somebody else is not a stale entry to be
invalidated — it is a different query, and no amount of forgetting to clear can
serve it to the wrong person.

**`refetchOnWindowFocus` is the one place that default is overridden.**
`query-client.ts` turns it off with an argument about *lists*: a burst of
refetches every time somebody alt-tabs is a lot of traffic for data a colleague
rarely edits underneath you. This is one small request, and the thing it guards
against is the entire subject of this feature. Coming back to the tab is the
moment before a person acts, which makes it the right moment to have corrected
the menu.

The 60 s is a **ceiling on how long a change goes unnoticed by a tab nobody is
touching**, not a poll — nothing refetches until something asks, and there is no
timer. The two paths that actually correct a demotion are immediate.

### The cache holds the entity, not the set — and a browser proved why it matters

Deriving the `PermissionSet` inside the `queryFn` reads better and breaks the
mechanism this feature depends on most.

TanStack Query's **structural sharing** keeps the previous object when a refetch
returns identical JSON, and that preserved identity is the signal `AppRouter`
compares to decide whether the router needs re-evaluating. Structural sharing
cannot see through a value containing functions, so a cached `PermissionSet`
would be a brand-new object on every refetch — and every focus refetch, of which
there is one per alt-tab, would invalidate the router and re-run the loaders of
every matched route for a set that had not changed.

With the entity cached, an unchanged refetch is a no-op end to end: same data
identity → `select` not re-run → same set object → nothing invalidated. The
route guard reads the entity through `ensureQueryData` (which never applies
`select`) and derives its own set, which is one extra `Set` per navigation
against semantics that are identical because both call the same
`toPermissionSet`.

### `PermissionSet`

Plain functions closing over a `Set`, not a class and not a hook, because **the
route guard and the button gate must answer identically**. A `beforeLoad` cannot
call a hook, so semantics living in a hook would need a second copy for the
router — and two copies of "does ALL mean every key or at least one" is how a
screen ends up reachable by somebody whose menu does not show it.

`EMPTY_PERMISSION_SET` covers both "not loaded" and "nobody signed in". They
gate identically: an unloaded set grants nothing, which is the safe direction to
be wrong in while a request is in flight. Where the distinction matters it is
still available — `usePermissions` reports `isLoading` beside the set, and the
route guard never sees the empty value at all because the parent awaited the
fetch.

### Semantics, stated once

`PermissionRequirement` is one shape shared by `<Can>`, `useCan` and
`requirePermission`, so a route and the menu item that links to it cannot
disagree.

```ts
{ permission: 'REPORTS.PAGE_ACCESS', anyOf: ['REPORTS.VIEW', 'REPORTS.EXPORT'] }
```

The three fields are **ANDed with each other**; each is independently
meaningful. The empty cases are the ones that bite:

| Case | Answer | Why |
| --- | --- | --- |
| `{}` — no requirement at all | **allowed** | An item with no permission requirement is always allowed. `<Can>` with nothing to check renders its children rather than swallowing them. |
| `allOf: []` | allowed | Vacuously true, and true under any reading. |
| `anyOf: []` | **allowed** | Deliberately *not* the mathematical reading. Empty arrays come from filtering and mapping; under the strict reading a filter that matched nothing would hide a control silently and look like a permission problem. "Unconstrained" is visible, and therefore fixable. |

`hasAny([])` — the bare predicate rather than the requirement — is `false`,
which is the mathematical answer. Only `satisfies` treats an empty list as the
absence of a constraint, and only because a *requirement* is a different
question from a *predicate*.

### There is no super-admin branch, and there must not be

The backend resolves `SUPERADMIN` to every key before answering, so the array
simply contains all fifty-five — verified in the browser: `size=55`, with the
admin-only route reachable and no client-side special case anywhere. A
`role === 'SUPERADMIN' ? true` in the UI would be a second authorization rule
living on the client, and the first place the two would disagree is a permission
added to the catalog after that line was written.

---

## Typed permission keys

`EffectivePermissionsEntity.permissions` arrives as `string[]`, because the
backend's exact union (`PermissionKey`, built from the catalog it seeds) is not
something OpenAPI can express. That left two ways to get a checked key.

Copying the fifty-five keys into the frontend would be **re-declaring the
contract**, which `CLAUDE.md` forbids for the same reason it forbids hand-written
response types: the copy is right the day it is written and silently wrong
afterwards. So the key is composed from the two enums the contract *does*
publish, both read off `PermissionEntity`:

```ts
export type PermissionKey = `${PermissionResource}.${PermissionAction}`;
```

**The cost, stated plainly: the cross product is 12 × 7 = 84 and the catalog
holds 55.** `'DASHBOARD.APPROVE'` type-checks and does not exist — `has()`
answers `false` and the UI hides a control forever rather than failing loudly.

That is the right trade here, because the error this type is for is a *typo* —
`'TIMESHEETS.VIEW'`, `'REPORTS.READ'` — and it catches every one, since both
halves have to be real. A renamed resource becomes a compile error in every
screen that gates on it the day the types are regenerated. What it cannot catch
is a plausible pair that was never seeded, and the backend catches that on the
first real request. The honest way to a stricter type is for the backend to
publish the union, which would then arrive through `npm run gen:api` like
everything else — see *Future Improvements*.

---

## UI / Components

| Component | What it is |
| --- | --- |
| `<Can permission="…">` | Renders its children only for somebody who holds the requirement. Optional `fallback`. |
| `useCan(requirement)` | The same question as a boolean, for a `disabled` prop or a conditional. |
| `usePermissions()` | The set itself, plus `isLoading`. |
| `NotAuthorizedPage` | Where a refused route lands. |
| `Toaster` | Sonner, mounted once — this feature's first consumer (see below). |

`<Can>` exists as a component rather than only as `useCan` because the common
case is wrapping markup, and `{canApprove && <ApproveButton />}` repeated across
thirty screens is thirty chances to write `&&` against a number or to check the
wrong key.

**While the set is loading it renders the fallback**, with no third branch. A
control appears when it is permitted and not before; rendering optimistically
and retracting shows somebody a button and takes it away. A screen for which
that moment is visible should skeleton at the screen level, where the shape of
what is loading is known — `<Can>` around a single button has no shape to stand
in for.

---

## Routing

```
workspaceRoute  "/app"   auth guard  →  await the set  →  return { permissions }
├── workspaceIndexRoute  "/"                  no requirement
├── notAuthorizedRoute   "/not-authorized"    no requirement, ?required=
└── (future screens)     beforeLoad: requirePermission({ … })
```

```ts
export const reportsRoute = createRoute({
  getParentRoute: () => workspaceRoute,
  path: '/reports',
  beforeLoad: requirePermission({ permission: 'REPORTS.PAGE_ACCESS' }),
  component: ReportsPage,
});
```

Auth first, then permission, is not a stylistic ordering: a signed-out person
has no set to check, and asking for one would send an unauthenticated request.

`requirePermission` takes the same `PermissionRequirement` as `<Can>` and
answers it with the same `satisfies`, so gating a route and the menu item that
links to it is one requirement written twice rather than two rules written once
each. Its parameter type is declared **structurally** — any context carrying a
resolved `permissions` satisfies it — so the module does not import the routes
that import it.

### Where a refusal goes: a screen, not a silent bounce

`/app/not-authorized`, and it hangs off `workspaceRoute` so it inherits the auth
guard and the authenticated layout. It declares no requirement of its own, which
would otherwise be the one genuinely amusing bug available in this feature.

Redirecting to somewhere that works is the friendlier-looking option and is
wrong here, because both ways of arriving need explaining. A colleague sends a
link to a report: landing on the dashboard makes the *link* look broken, and the
natural next message is "it just goes to the home page for me" rather than "I
need access". An administrator changes something mid-session: being moved with
no account of why reads as the application losing your place.

The screen names the missing permission — not as a diagnostic, but because the
useful thing a person can do with a refusal is repeat it to whoever can lift it.
That is the route's own requirement, which the backend already returns in
`params.requiredPermissions` on the real `403`. What is deliberately absent is
any hint of what the person *can* reach: a refusal that enumerated the rest of
the account's access would turn every closed door into a map of the open ones.

There is no "go back", because the way back is the page they could not open.

### A search schema has to round-trip, and this one did not

The first version parsed `?required=` into a `PermissionKey[]` — the shape the
page wants, and better to read everywhere. It produced a URL of
`?required=["PROJECTS.VIEW"]`, and then a screen that named no permission at all.

**TanStack Router writes the *validated* search back into the address bar on a
client-side navigation.** So a `validateSearch` that changes the shape of a
value does not merely parse it: it re-serialises the parsed form into the URL,
and on the next parse `typeof search.required === 'string'` is false, every key
fails the filter, and the list arrives empty.

The failure is quiet in the worst way. The page still renders; it just stops
saying the one thing it exists to say — and only on the redirect that comes from
a *mid-session change*, not on a fresh page load, which is the harder of the two
to notice. It was found by a browser and not by reading.

The schema now keeps the wire string and the component splits it, so
`parse(serialise(x)) === x` holds. The sanitiser stays in `validateSearch`,
where the router runs it before anything reads the value: each entry has to look
like `RESOURCE.ACTION` and anything else is dropped. React escapes what it
renders, so this is not about injection — it is about not printing whatever a
doctored link put in the query string in the application's own voice, on a page
whose subject is what the application will and will not let you do.

---

## Live re-sync

The case: an administrator is demoted to a plain user at 14:03 with their tab
open. The backend refuses their next call immediately, so this is not a security
problem. It is a truthfulness problem.

### Reactive — a `403` is a notification

```
any request → 403 AUTHORIZATION_PERMISSION_DENIED
  → http.ts response interceptor → the 403 seam (not awaited)
    → GET /auth/me           ─┐ allSettled, both skipPermissionResync
    → refetch the effective set ─┘
      → set changed? → toast
      → AppRouter sees a new set → router.invalidate()
        → /app beforeLoad reloads → child guard throws → /app/not-authorized
```

**The seam is a new one**, beside F03's `401` seam and deliberately not inside
it. The two look alike and mean opposite things: a `401` says the *credential*
is spent and the handler's job is to get a new one and report whether the
request is worth retrying — the interceptor waits for that answer. A `403` says
the credential is fine and the **account** is not allowed: nothing can be
retried, the request has finished failing.

So the handler returns `void` and **is never awaited**. Waiting for a refetch
before rejecting would add a round trip to an error whose outcome is already
decided, and would make every refused action feel slow at the moment it fails.

**It re-reads `/auth/me` as well as the set**, because a role and a permission
set are two answers the same administrative edit changes at once, and only one
of them lives in this feature. `useAuth().user.role` is read by the header and
by anything that says "Administrator" next to somebody's name; leaving it saying
`ADMIN` for a person the backend now treats as `USER` would fix the menu and
leave the identity wrong. `adoptUser` rather than a new session — the access
token is untouched and still valid; what changed is what the account behind it
is allowed to be.

**Only `AUTHORIZATION_PERMISSION_DENIED` triggers it.**
`AUTHORIZATION_ACCOUNT_ADMIN_REQUIRED` is excluded on the backend's own
reasoning for the code: it means the route is closed to the caller's *role* and
no permission exists that would open it. There is nothing to re-sync and nothing
an administrator could grant.

**The toast fires only when something actually moved.** A `403` does not prove a
change — it also happens when a screen offers a button it never should have.
Announcing "your permissions have changed" to somebody whose permissions did not
would be the application inventing an event, and it is the kind of inaccuracy
people remember. The refused request still surfaces its own translated error
through the caller's handling; this toast is specifically the explanation for
*why the screen is about to rearrange itself*, and appears exactly when it does.
Verified both ways in the browser.

### Proactive — returning to the tab

`refetchOnWindowFocus` corrects the menu at the moment *before* a person acts,
costing no failed request at all. It is the path that handles the common case;
the reactive one handles the person who was already looking at the screen.

It only fires while something is **observing** the query — and route guards
populate the cache through `ensureQueryData`, which observes nothing. So
`AppRouter` calls `usePermissions()` once, above every screen, for the life of
the session. Without that call the proactive half would quietly not happen on
any page that did not happen to gate something.

Verified end to end: with the tab hidden, an administrator revokes a permission;
sixty seconds later the tab is shown again; one refetch is sent, the guard
re-runs, and the person is moved off the page **with zero `403`s in the network
log**.

### Guarding against loops

Three mechanisms, each with an independent reason:

| | Guards against |
| --- | --- |
| The `errorCode` check | Everything that is not a stale permission set. |
| A single-flight promise | Five simultaneous `403`s producing five `/auth/me` calls, five refetches and five identical toasts. Same argument as F03's refresh lock, minus the single-use credential. |
| `skipPermissionResync` on both re-sync calls | A `403` from the re-sync itself re-entering the handler. The lock alone would not prevent this, because it releases before the recursive call would be made. |

The third is redundant *today* — an ungated endpoint cannot answer
`AUTHORIZATION_PERMISSION_DENIED`. It is set anyway, because "this endpoint
cannot currently return that code" is a fact about the backend that a change to
the backend could quietly revoke, and the failure it would produce is an
unbounded loop rather than an error message.

Measured: after a full re-sync, three seconds of idle produced **zero** further
calls to either endpoint.

### No set leaks across sessions

The guarantee is `usePermissions` returning the empty set for an anonymous
session **without consulting the cache** — not the cache housekeeping around it.
A signed-out tab cannot render a permitted control however the cache happens to
be arranged, and it does not have to be reasoned about alongside
`queryClient.clear()`, the user-scoped key, and the order in which sign-out does
its two jobs.

Nothing is removed from the cache on sign-out, deliberately. F03 argues that
clearing at sign-out triggers refetches from components that are still mounted,
each answering `401` on the way out; removing one query has the same hazard for
the observer `AppRouter` holds. Login clears everything, and the key is
user-scoped, so the practical leak is zero. Verified: signing out of a
`SUPERADMIN` and back in as a `USER` gives `size=16`, not 55.

---

## Toasts — Sonner, installed here

`CLAUDE.md` has mandated Sonner since F01 and nothing had needed it yet; this
feature is its first consumer, the same way F03 was `react-hook-form`'s. Added
with `npx shadcn add sonner`, with two adjustments:

- **The registry entry imports `useTheme` from `next-themes`**, because the
  registry is written for Next.js. This project is Vite + TanStack Router and
  has its own `ThemeProvider`, so the import points there and `next-themes` was
  uninstalled rather than left in `package.json` as a second, unused theme
  system nothing renders.
- **It reads `resolvedColorMode`, not `colorMode`.** `colorMode` may be
  `system`, which Sonner would then resolve for itself against
  `prefers-color-scheme` — and that is precisely the question the theme layer
  answers differently: on a public screen the `device` scope ignores a stored
  preference, so the two would disagree and a toast would be the one dark panel
  on a light login page.

One `<Toaster />`, in `AppProviders`. *Inside* `ThemeProvider` because it reads
the resolved mode; *outside* the router because a toast can outlive the
navigation that caused it — the re-sync moves somebody off a page and explains
why afterwards, and the explanation must not unmount with the page.

`toast.*` is a module-level API, which is what lets an axios interceptor with no
component in scope raise one. The message is translated through `i18n.t` from
the initialised instance rather than a hook, for the same reason.

---

## API Integration

| Route | Notes |
| --- | --- |
| `GET /api/v1/permissions/me/effective` | The only call this feature makes. `skipPermissionResync`; **not** `skipAuthRefresh` — a `401` here is an expired access token and exactly what the silent refresh exists for. |
| `GET /api/v1/auth/me` | Reused from F03, now with a `config` parameter so the re-sync can pass `skipPermissionResync`. |

The endpoint is **deliberately not permission-gated** and the backend's contract
says it must never become so: gating the endpoint whose purpose is to tell
somebody what they may do would answer `403` to every ordinary employee. It
reports on the caller alone — somebody else's set is `GET /users/:id/permissions`,
which *is* gated and belongs to the permission-management screens.

The generated types were already current; `npm run gen:api` was not needed.

---

## Theming / i18n

One new `common` namespace, `permissions`, with the access-changed notice and
the four strings of the not-authorized screen, in both bundles.

No new error codes. `AUTHORIZATION_PERMISSION_DENIED` was already in
`errors.json` from F01 — with `{{requiredPermissions}}` interpolation — because
it was the example the i18n foundation was written around. It is now produced by
something.

Every surface uses theme variables, and the toast takes its background, text,
border and radius from the same ones as every other panel.

---

## Files Created

| File | What it is |
| --- | --- |
| `src/features/permissions/permission-keys.ts` | `PermissionKey` from the generated enums, and the shape check for an untrusted string. |
| `src/features/permissions/permissions-api.ts` | The one call. |
| `src/features/permissions/permission-set.ts` | `PermissionSet`, `PermissionRequirement`, and the semantics. |
| `src/features/permissions/permissions-query.ts` | The query, its freshness policy, and the guard's loader. |
| `src/features/permissions/usePermissions.ts` | `usePermissions` and `useCan`. |
| `src/features/permissions/Can.tsx` | The component gate. |
| `src/features/permissions/permission-route-guard.ts` | `requirePermission`, and where a refusal goes. |
| `src/features/permissions/permission-resync.ts` | The `403` handler: refetch, re-hydrate, toast. |
| `src/api/authorization-seam.ts` | The `403` seam, beside F03's `401` one. |
| `src/app/pages/NotAuthorizedPage.tsx` | The refusal screen. |
| `src/routes/not-authorized.route.tsx` | Its route and the search sanitiser. |
| `src/components/ui/sonner.tsx` | The themed `<Toaster />`, adapted off `next-themes`. |
| `FEATURES/F04-permissions.md` | This document. |

## Files Modified

| File | Change |
| --- | --- |
| `src/api/http.ts` | `skipPermissionResync` on the config, and the `403` seam in the response interceptor. |
| `src/api/client.ts` | `CallConfig` exported, so a feature's API module can take one and pass it through. |
| `src/features/auth/auth-api.ts` | `fetchCurrentUser(config?)` — the re-sync is its second caller. |
| `src/app/AppRouter.tsx` | Holds the query's one permanent observer, and invalidates the router when the set changes. |
| `src/app/AppProviders.tsx` | `<Toaster />`, and the side-effect import that registers the `403` handler. |
| `src/routes/workspace.route.tsx` | Awaits the set and returns it as child context. |
| `src/routes/root.route.tsx` | The permissions SEAM replaced by the reason they are not on the root context. |
| `src/routes/routeTree.ts` | `/app/not-authorized`. |
| `src/locales/{ro,en}/common.json` | The `permissions` namespace. |
| `package.json` | `sonner` added; `next-themes` removed. |

## Dependencies

| Package | Why |
| --- | --- |
| `sonner` | Mandated by `CLAUDE.md` since F01; this feature is the first thing that needed a toast. |

---

## Verification

`npm run typecheck`, `npm run lint`, `npm run build` — all clean (2 794 modules,
851 kB / 274 kB gzipped).

### Against the running backend

| Check | Result |
| --- | --- |
| `GET /permissions/me/effective` as a `USER` | `200`, 16 keys, `role: USER`, `readOnly: false` |
| The same as `SUPERADMIN` | 55 keys — the whole catalog, already expanded |
| A gated route as a `USER` | `403`, `errorCode: AUTHORIZATION_PERMISSION_DENIED`, `params: { requiredPermissions: 'PERMISSIONS.VIEW', mode: 'ALL' }` |

### In a real browser

Headless Chrome over the DevTools Protocol, the same approach F03 used and for
the same reason — no new dependency, and it finds things reading does not. Two
harnesses, 40 assertions, all passing. They live in the session scratchpad and
are not committed; turning them into a Playwright suite is still the standing
Future Improvement F03 opened.

Two temporary routes existed for the run — one gating on `PROJECTS.VIEW` (which
a `USER` holds) and one on `allOf: ['PERMISSIONS.VIEW', 'PERMISSIONS.EDIT']`
(which they do not) — and were removed afterwards. They were the first consumers
of `requirePermission`, which is how its assignability to `beforeLoad` was
checked rather than assumed.

| Check | Result |
| --- | --- |
| Effective set after login | exactly **one** request |
| Route requiring a held permission | reachable |
| Route requiring two keys the person lacks | → `/app/not-authorized?required=PERMISSIONS.VIEW%2CPERMISSIONS.EDIT`, both named on screen |
| `<Can>` on a held key / one not held / its `fallback` | renders / hidden / renders |
| **Revoke a permission mid-session, then a `403`** | one refetch of the set, one `/auth/me`, toast in Romanian, moved to `/app/not-authorized?required=PROJECTS.VIEW` |
| Idle for 3 s afterwards | **zero** further calls — no loop |
| A `403` that changed nothing | **no** "access changed" toast |
| Tab hidden → permission restored → 60 s → tab shown | one refetch; the route is reachable again with **no `403` at all** |
| Tab hidden → permission revoked → 60 s → tab shown | moved off the page, again with **zero `403`s** |
| **Demote an `ADMIN` to `USER`, then a `403`** | `useAuth().user.role` goes `ADMIN` → `USER`; the set goes 55 → 25; the admin-only route becomes unreachable |
| `SUPERADMIN` | `size=55`, admin-only route reachable, no UI special case |
| Sign out of `SUPERADMIN`, sign in as `USER` | `size=16` and `role=USER` — nothing inherited |

The `25` in the demotion row is worth keeping: it is not the `USER` baseline of
16, and it is correct. The account carries nine `OVERRIDE_GRANT`s from the seed,
and effective is role baseline ∪ GRANT − REVOKE. The number was checked against
`GET /users/:id/permissions` server-side rather than argued about — the frontend
rendered exactly what the backend computed, which is the whole contract of this
feature in one figure.

---

## Notes

### The browser harness had to stop reloading the page

The first run lost its session halfway through, and the cause is the cost F03
documented: every full page load is a boot probe, and an anonymous or returning
boot spends one `POST /auth/refresh` on the backend's strict tier — ten attempts
per five minutes. A harness doing ten `page.goto`s exhausts it, and the eleventh
navigation lands on `/login`.

Rewriting it to navigate client-side (`history.pushState` + a `popstate` event)
removed nine of the ten page loads and the problem with them. That is a note
about testing, but it is also the sharpest available demonstration of why F03's
third Future Improvement — hydrating in one request instead of two — is worth
doing.

### `visibilitychange`, not `focus`

The first attempt at the proactive test dispatched a `focus` event and measured
nothing. TanStack Query v5's `focusManager` listens for `visibilitychange` and
reads `document.visibilityState`; a `focus` event is not part of it. The harness
now redefines `document.visibilityState` and dispatches the right event, which
is what a real alt-tab does.

Worth knowing before writing any other test that depends on refocusing, and
worth knowing about the feature: it corrects itself when the **tab becomes
visible**, which includes switching back to it in the same window — not merely
when the window regains OS focus.

### Page metadata is still not implemented anywhere

`CLAUDE.md` asks every route to set `TimeSheet | <page name>` and a description
through one reusable mechanism. No mechanism exists yet — F01 and F03 did not
build one, and every existing page is silent — so `NotAuthorizedPage` is silent
too rather than being the one page that sets `document.title` its own way and
becomes the precedent nobody chose. It belongs with the layout feature, which
owns the shell these titles describe.

---

## Future Improvements

1. **Have the backend publish the permission-key union**, as an `enum` on the
   OpenAPI schema for the `permissions` array. The template-literal type here is
   84 keys against a catalog of 55, and the gap is the only class of typo it
   cannot catch. One `@ApiProperty({ enum: ALL_PERMISSION_KEYS })` on the
   backend would close it, and the union would arrive through `npm run gen:api`
   like everything else — no list maintained by hand on either side.
2. **Keep the browser checks**, again. Forty assertions across two scratch files
   found two real defects — the search round-trip and the harness's own
   rate-limit lesson — and they are thrown away at the end of this session. This
   is now the second feature to say so.
3. **A `usePermissionsSuspense` for screens that gate their own content.**
   `<Can>` renders nothing while the set loads, which is right for a button and
   wrong for a page made of gated sections — those flash empty and fill in. The
   set is always loaded under `/app` today, so this is latent rather than
   visible; it becomes real the first time something outside a route guard needs
   it.
4. **Let the not-authorized screen ask for access.** It names the permission so
   somebody can repeat it to an administrator, which is a conversation over a
   different medium. A "request access" action would need an endpoint that does
   not exist, and the permission-management feature is where deciding it should
   exist belongs.
5. **Reconsider the 60 s `staleTime` once the sidebar exists.** It is currently
   a ceiling on nothing anybody looks at — the nav that would visibly correct
   itself has not been built. When it has, the right number is a question about
   how often permissions actually change in this company, which is answerable
   then and guesswork now.
6. **Surface `readOnly` where it means something.** `EffectivePermissionsEntity`
   carries it, `PermissionSet` drops it, and no screen has a use for "this
   account's permissions cannot be edited" until the permission-management
   matrix exists. Noted so the next person does not think it was missed.
