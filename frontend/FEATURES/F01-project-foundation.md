# Project Foundation

## Goal

Build the parts of this frontend that **every later feature will depend on and
none of them should have to decide**.

Thirty-nine backend features produced 124 endpoints, one success envelope, one
error envelope, an error-code catalogue, a shared pagination contract and a
generated OpenAPI document. None of that is worth anything until something on
this side can talk to it the same way twice. The failure this feature exists to
prevent is the ordinary one: the first screen hand-writes a response type, the
second copies it, the third fetches with `fetch` because it needed a header, and
by the fifth there are three ways to show an error and no way to tell which
screens break when a field is renamed.

So this feature ships no screen. It ships the transport, the types, the loading
and failure patterns, the table, the theme and the translations — each one so
that the next thirty features have exactly one way to do the thing.

Nothing here is authentication, permissions, or any domain page. Where those
plug in is marked, in code, as a **SEAM**.

## Requirements

- Extend the existing Vite + React 19 + TypeScript + Tailwind v4 + shadcn
  scaffold; do not re-scaffold it.
- One axios instance with interceptors, and a token that lives in memory.
- Request and response types **generated** from `/api/docs-json`, never written.
- TanStack Query for all server state, with defaults that suit this API's two
  envelopes.
- TanStack Router with a root shell and a documented place for route guards.
- `ro` by default, `en` as fallback, and error codes as translation keys.
- A theme drivable by the two preferences the backend stores, plus a client-only
  light/dark.
- The shared primitives `CLAUDE.md` requires — `Spinner`, a skeleton approach, a
  server-side `DataTable`, and the table→cards responsive pattern — as reusable
  components, even with no feature page consuming them yet.
- Type-check, lint and build clean.

---

## The two decisions that shaped everything else

### 1. Generated types, our transport — and why not `orval`

The brief allowed either `openapi-typescript` (types only, consumed through our
axios instance) or `orval` (a generated axios-based client plus TanStack Query
hooks). **`openapi-typescript` won, and the deciding argument is the envelope.**

Every successful response from this API is `{ success: true, data: … }`, and the
OpenAPI document describes it that way — correctly, because that is what the wire
carries. A generated client therefore hands back the envelope, and a hundred call
sites write `response.data.data`. Unwrapping it centrally is the obvious fix and
the backend explicitly recommends it ("unwrap once, in the HTTP client, not at
each call site") — but the moment the transport unwraps, **generated hooks are
typed as the envelope and return its contents**. The types would be a lie, and a
confident one.

With `openapi-typescript` the unwrapping happens in one function and in one
conditional type, side by side, so they cannot disagree:

```ts
// runtime
const unwrapEnvelope = (body) => isSuccessEnvelope(body) ? body.data : body;

// types
type UnwrapEnvelope<T> = T extends { success: true; data: infer Data } ? Data : T;
```

Both fall through unchanged for anything that is not an envelope, which is how
the report exports keep working — a spreadsheet is a file, and backend Feature
038 makes it the one documented exception.

The secondary reason is volume. `orval` would emit a client and hooks for 124
operations, most of which will never be called; `openapi-typescript` emits one
`.d.ts` of types that cost nothing at runtime, and `src/api/client.ts` derives
the rest — 200 lines of conditional types that cover the whole API and grow by
zero lines when it does.

What that buys, concretely:

```ts
await apiGet('/api/v1/health');                       // options argument optional
await apiGet('/api/v1/departments/{id}');             // ✗ compile error: needs { path }
await apiGet('/api/v1/departments');                  // ✗ compile error: needs { query }
await apiPost('/api/v1/auth/login', { body: { … } }); // body typed from the DTO
```

Required-ness is taken from the contract, so a path parameter cannot be
forgotten and an endpoint whose filters are all optional does not force an empty
`query: {}`.

### 2. `VITE_API_BASE_URL` is an origin, not `/api/v1`

This is the one place the implementation departs from the brief, deliberately.

The brief suggested defaulting the axios `baseURL` to `/api/v1`. Every path in
the OpenAPI document already begins with `/api/v1`, so a `baseURL` carrying it
too would produce `/api/v1/api/v1/…`. The alternative — stripping the prefix
from the generated path keys — was rejected for a stronger reason than
convenience: **the version belongs to the path, not to the deployment.** The
document describes every version this API serves, and the day a `/api/v2` route
appears it has to be reachable through the same client. A `baseURL` of `/api/v1`
would make that a configuration change on every environment.

So `VITE_API_BASE_URL` is the API **origin**, empty by default (same origin), and
the dev proxy forwards `/api` to the backend. The name is kept; the semantics are
documented in `src/lib/env.ts` and `.env.example`.

---

## UI / Components

Nothing domain-specific. Everything below is a primitive later features consume.

| Component | Where | What it is |
| --- | --- | --- |
| `Spinner` | `components/ui/spinner.tsx` | `sm` / `md` / `lg` / `xl`, `role="status"` with an off-screen label. For **punctual** waits only. |
| `DataTable` | `components/data-table/` | The one table. Server-side, responsive, described below. |
| `DataTableSkeleton` | `components/data-table/` | The `<Suspense>` fallback shaped like a `DataTable`. |
| `QueryBoundary` | `components/QueryBoundary.tsx` | `Suspense` + error boundary + query-cache reset, in one wrapper. |
| `ErrorBoundary` | `components/ErrorBoundary.tsx` | The **one class component** in this application — `componentDidCatch` has no hook equivalent, and `react-error-boundary` would be a dependency for forty lines. |
| `QueryErrorState` | `components/QueryErrorState.tsx` | The default failure state; translates by `errorCode`. |
| `ColorModeToggle` | `components/ColorModeToggle.tsx` | Light / dark / system. |
| `LanguageSwitcher` | `components/LanguageSwitcher.tsx` | `ro` / `en`. |
| `AppHeader`, `AppSidebar` | `components/layout/` | Shell regions. The sidebar is deliberately empty — real navigation is a list of screens somebody is allowed to open, and both halves of that are later features. |

shadcn primitives added: `skeleton`, `table`, `input`, `select`, `dropdown-menu`,
`card`.

### The two loading patterns are not interchangeable

`CLAUDE.md` requires skeletons for content and spinners for punctual waits, and
this feature ships a worked example of each so the distinction is visible rather
than merely written down: `HealthStatusCardSkeleton` mirrors the card it becomes,
and the `Spinner` appears inside the `DataTable` search box during a background
refetch. A skeleton that is not shaped like its component is a spinner with extra
steps — it still moves the page when the data lands.

### The `DataTable`

TanStack Table registered with **one** feature: column visibility.

That is the whole design consequence of server-side. Search, filtering, sorting
and pagination are query parameters, so client-side row models would be a second,
disagreeing implementation of what the API already does — able to sort only the
twenty rows currently on screen, which looks like sorting and is not.

- **One instance, two presentations.** From `lg` up it renders a table; below
  `lg` the same rows become cards. Same `table` instance, same cell templates
  through `FlexRender`, same server query — so a column formatted one way on
  desktop is formatted that way on a phone, by construction rather than by
  discipline.
- **The toolbar is shared, with one exception.** Search, filters, sort and
  pagination sit above both. Column visibility is desktop-only, because a card
  list has no columns to hide; sorting moves into a menu (`DataTableSortMenu`)
  instead of disappearing, so a phone can still order a list.
- **Search is debounced 300 ms** inside the toolbar: the input stays immediate
  while the server sees one request per pause.
- **`meta.sortKey` is what makes a column sortable**, and its absence is the
  correct default — the backend accepts a fixed set of sort columns, and offering
  one it will reject with a `400` is worse than offering none.
- **Filters are a slot**, not a configuration object. Every list endpoint accepts
  a different set; the screen renders its own controls and writes through
  `actions.setFilter`, which keeps the *values* in `state.filters` and therefore
  in the query key, without `DataTable` knowing what any of them mean.
- **Every change except the page resets to page 1.** Filtering while standing on
  page 7 otherwise lands on a page that no longer exists — and the backend
  answers that with an empty page rather than an error, which looks exactly like
  "no results".

---

## State & Data (TanStack Query)

`src/api/query-client.ts` sets the defaults once:

| Default | Value | Why |
| --- | --- | --- |
| `staleTime` | 30 s | A screen only overrides what is genuinely different about its data. |
| `retry` | ≤ 2, **never on 4xx** | See below. |
| `refetchOnWindowFocus` | `false` | An internal app people leave open beside their other work; a burst of refetches on every focus is noise, and stale-after-a-colleague's-edit is handled by invalidation. |
| mutations `retry` | `false` | A retried `POST` can create a second record, and the client cannot tell a failed request from a failed response. |

**The retry policy is where this API's specifics show.** Every `4xx` is final,
including the three a naive policy retries: `401` has already had its one
refresh-and-retry in the interceptor by the time the error arrives; `403` is a
permission that asking three times does not grant; and `429` is the rate
limiter, which the backend documents as *extending* the block when retried. What
is left — a network failure, a `5xx` — is transient, and those are retried.

Screen-level state for a list lives in `useDataTableState`, as one object rather
than five `useState` calls, so it can go into the query key whole. Forgetting one
of five is what shows a cached page 1 while the controls say page 3.

---

## API Integration

### The layer, file by file

| File | What it is |
| --- | --- |
| `api/generated/openapi.d.ts` | **Generated.** 17 400 lines, 75 paths, every schema. Do not edit. |
| `api/http.ts` | The one axios instance and both interceptors. |
| `api/auth-session.ts` | The in-memory token holder and the `401` seam. |
| `api/api-error.ts` | `ApiError` — everything that leaves the client, normalised. |
| `api/client.ts` | The typed request layer: `apiGet` / `apiPost` / `apiPut` / `apiPatch` / `apiDelete`. |
| `api/query-client.ts` | TanStack Query defaults. |

### Codegen

```bash
npm run gen:api          # backend must be running; SWAGGER_ENABLED must not be "false"
```

`scripts/gen-api.mjs` reads `VITE_OPENAPI_URL` (default
`http://localhost:3000/api/docs-json`) through Vite's own `loadEnv`, so the
script and the app resolve environment variables identically. It writes a
"generated — do not edit" banner naming the source URL. **It is the only
JavaScript file in the project**, because it is build tooling Node runs directly
before any compilation step exists; it says so at the top.

The output is committed, so a fresh clone type-checks with no backend running.
Re-run it after any backend contract change — that is the whole value of the
arrangement, and skipping it is how a frontend silently drifts from an API that
is still correct.

### The interceptors, and what is deliberately not in them

**Request** — attaches `Authorization: Bearer <token>` when `getAccessToken()`
returns one, reading it per request rather than capturing it, so a refreshed
token is used by the next call. An `Authorization` header already on the config
is left alone.

**Response** — on `401`, calls the registered unauthorized handler at most once
per request and retries if it reports success; then normalises everything to
`ApiError`. Nothing downstream ever handles an `AxiosError`.

The refresh **logic** is not here and must not be. What is here is the place it
goes, plus the two guards that make it safe: `skipAuthRefresh` (which
`POST /auth/refresh` must set on itself, or a refused refresh triggers a refresh
forever) and `retriedAfterRefresh` (one retry per request).

The seam's contract carries the one thing an implementer can get wrong, written
down where they will read it: **the handler must de-duplicate concurrent
refreshes.** Five queries failing at once must produce one call to
`/auth/refresh`, because the refresh token is single-use and presenting a spent
one is treated as theft — `AUTH_REFRESH_TOKEN_REUSED` revokes every session. That
is why the seam is one shared async function rather than a per-request callback:
there is exactly one place to keep the in-flight promise.

### The token is in a module variable

Not `localStorage`, not `sessionStorage`, not a URL. Anything a script can read,
an injected script can read: one XSS on any page would otherwise yield a token
usable from the attacker's own machine, surviving the tab being closed. A module
variable dies with the page.

The cost is a lost session on hard refresh, and the refresh token is what pays it
back — which is the auth feature's problem, and the reason the seam exists.

### `ApiError`, and the message that is never shown

```ts
class ApiError extends Error {
  status; errorCode; params; details; path; isNetworkError;
  get isClientError()
}
```

Three failure kinds stay distinct because a client responds to them differently:
an enveloped failure has a code to translate, an un-enveloped HTTP failure (a
`502` from a proxy, which is HTML) has only a status, and a network failure has
neither.

`message` is kept for the console and **never rendered**. The backend is explicit
that it is English written for a log and free to be reworded; `errorCode` is the
contract half.

### The smoke test

`features/health/` — a query hook, a card, and a skeleton, wired into `/app`.
`GET /api/v1/health` is public, so it proves the transport before authentication
exists. One call exercises all four layers: generated types, the axios instance
and its interceptors, TanStack Query's cache, and `signal` wiring React Query's
cancellation through to axios. It doubles as the reference implementation of the
feature-folder convention.

---

## Forms & Validation

**None, and no dependency for them.**

`react-hook-form`, `zod` and `@hookform/resolvers` are the mandated stack in
`CLAUDE.md` and are *not* installed here, because nothing in this feature has a
form. Installing three packages against a future need is exactly the speculative
dependency the "keep the set lean" rule warns about, and the first form feature
adds them in the same commit as the form. The convention is unchanged and
unambiguous — the packages simply arrive with their first consumer.

---

## Theming / i18n

### Theming: three inputs, three mechanisms

> **Superseded in part by [F02](F02-theme-palette-stylesheet.md).** The palettes
> below were a placeholder. The real stylesheet selects them by a `theme-<name>`
> **class** rather than `data-theme`, and `theme/palettes.css` no longer exists —
> the palettes live at the bottom of `index.css`, which is where the cascade
> requires them. The types, both maps, the radius mapping, the client-only
> light/dark argument and the `setPreferences` seam are all unchanged.

| Input | Source | Applied as |
| --- | --- | --- |
| `colorScheme` (8 palettes) | the account, `GET /profile/me` | `data-theme="<token>"` on `<html>` |
| `cornerRadius` (5 symbols) | the account, `GET /profile/me` | `--radius`, one custom property |
| light / dark | **the device** | the `dark` class + `color-scheme` |

`ColorScheme` and `CornerRadius` are **read out of the generated contract**, not
declared here, so a palette added or removed on the server is a compile error in
`theme/theme.ts` rather than a value the UI cannot render. Both maps are
`Record`s keyed by those unions, which is what keeps the lists complete.

**The symbol → rem mapping, matching `backend/FEATURES/039` exactly:**

| Symbol | `--radius` |
| --- | --- |
| `NONE` | `0rem` |
| `SMALL` | `0.3rem` |
| `MEDIUM` | `0.5rem` — the default |
| `LARGE` | `0.75rem` |
| `FULL` | `1rem` |

The frontend owns this mapping by the backend's own decision: the API names which
of the five was chosen and never sends a number, because a number in the database
would freeze a CSS decision there. Every other radius in the application is a
multiple of `--radius`, so one property changes every card, input and button.

`theme/palettes.css` declares **two** colours per palette per mode — `--brand`
and `--brand-foreground` — and one shared rule maps them onto the six shadcn
accent variables. One pair of values per palette instead of six declarations
repeated fourteen times. `default` is absent on purpose: it *is* the neutral base
already in `index.css`, and restating it would be a second copy. Chart colours
are left neutral — a series colour is a data-visualisation decision that belongs
with the reporting feature that will draw one.

**Light/dark is client-only**, following the backend's argument: it is a property
of where somebody is sitting, the operating system already knows through
`prefers-color-scheme`, and a stored value would exist to contradict the machine.
It is read with `useSyncExternalStore` rather than mirrored into state by an
effect — `prefers-color-scheme` genuinely is external state that changes on its
own, and copying it would render twice on every change.

The stored mode is applied by **an inline script in `index.html`**, before any
module loads. Any module runs after the browser has painted, so doing this in
React means a white flash on every load for anybody in dark mode. That script
holds the one duplicated copy of the storage key, and `theme/theme.ts` says so.

`ThemeProvider` holds state and writes CSS variables. It does not read the
profile and does not write it back — `setPreferences()` is the seam the profile
feature calls after `GET /profile/me`, and the `PATCH` belongs to the settings
screen that owns it. Keeping the write out is what stops the theme layer from
acquiring an opinion about authentication.

### i18n: error codes are translation keys

Two namespaces. `common` is everything this application writes; `errors` is one
key per backend error code, spelled exactly as the API sends it.

```jsonc
// the envelope                          // locales/ro/errors.json
{ "errorCode": "AUTHORIZATION_PERMISSION_DENIED",
  "params": { "requiredPermissions": "employees.read" } }

{ "AUTHORIZATION_PERMISSION_DENIED":
    "Nu ai permisiunea necesară pentru această acțiune ({{requiredPermissions}})." }
```

`useApiErrorMessage` is the only thing that performs the lookup, and its fallback
chain is a requirement rather than defensive padding:

1. `errors:<ERROR_CODE>`, interpolated with `params`.
2. `errors:fallback.network` when the request never reached the API.
3. `errors:fallback.status.<code>` — **modules written before the backend's
   error-code catalogue answer with no code at all**, and the backend documents
   that absence as part of the contract.
4. `errors:fallback.unknown`.

What it never does is render `error.message`.

The catalogue is **deliberately incomplete**: six codes, seeded as examples. A
code arrives here with the feature that can produce it.

`t()` is typed against the `ro` bundles via `CustomTypeOptions`, so a mistyped key
is a compile error, and `en` is checked against `ro` with `satisfies` so a
forgotten translation is one too. The single exception is `useApiErrorMessage`,
where the key comes from the backend at runtime — the cast is confined to that
one function, with `i18n.exists()` doing at runtime what the compiler does
everywhere else. Reserved lowercase keys (`fallback.*`) cannot collide with a
code, because every backend code is SCREAMING_SNAKE_CASE.

The language choice is kept in `localStorage` and **not** sent to the backend:
there is no `language` column, and Feature 039 argues against inventing one
before something reads it.

---

## Routing

Code-based, in `src/routes/`:

```
rootRoute            "/"       RootLayout (header + outlet)
├── landingRoute     "/"       LandingPage        — public
└── workspaceRoute   "/app"    WorkspaceLayout    — the guard goes here
    └── workspaceIndexRoute    WorkspaceHomePage  — the smoke test
```

**Code-based rather than file-based**, deliberately: file-based routing needs the
router's Vite plugin and a committed `routeTree.gen.ts`, and this project already
generates one large file from the OpenAPI contract. A second generator earning
only a naming convention is not worth the build step — adding a route is a file
plus a line, and `<Link to="/app">` is typed against the tree either way.

`createRootRouteWithContext<RouterContext>()` carries `queryClient` today so a
route can prefetch into the same cache the components read.

**SEAM (auth).** The guard goes on `workspaceRoute` and nowhere else: one
`beforeLoad` covers every child, which is what stops a screen added next year
from being public because somebody forgot to protect it. `beforeLoad` runs before
the component and the loader, so a protected screen never renders for a moment
with nobody signed in. The shape is written out in the file.

**SEAM (permissions).** Effective permissions belong on the same router context,
so a route can require one and a component can soft-gate a button on the same
source. Route checks are for navigation; neither replaces the backend's
enforcement — both are about not offering somebody a door that will be shut in
their face.

---

## Folder structure

```
src/
  api/            the axios instance, the typed client, query defaults
    generated/    ← openapi.d.ts, produced by `npm run gen:api`. Do not edit.
  app/            providers, the router, the layout shells, placeholder pages
  components/
    ui/           shadcn primitives (vendored) + Spinner
    data-table/   the shared DataTable and its parts
    layout/       header and sidebar
  features/       one folder per domain feature: its hooks, components, skeleton
  hooks/          shared hooks
  i18n/           i18next setup, typed keys, the error-message hook
  lib/            cn(), env, the date formatters
  locales/        ro/ and en/ — common.json and errors.json
  routes/         route definitions and the assembled tree
  theme/          the palettes, the provider, the mapping
```

A feature owns its data hooks, its components and its skeleton, in one folder —
`features/health/` is the worked example. Shared types not covered by the
generated client go in `src/types/[feature].ts`; API shapes never do.

---

## Files Created

| File | What it is |
| --- | --- |
| `.env.example` | The three variables, all optional, with the "this ships to the browser" warning. |
| `scripts/gen-api.mjs` | The codegen. The only `.js` in the project, and it explains why. |
| `src/api/generated/openapi.d.ts` | Generated types for the whole API. |
| `src/api/client.ts` | The typed request layer. |
| `src/api/http.ts` | The axios instance and both interceptors. |
| `src/api/api-error.ts` | `ApiError` and `toApiError`. |
| `src/api/auth-session.ts` | The in-memory token holder and the `401` seam. |
| `src/api/query-client.ts` | TanStack Query defaults and the retry argument. |
| `src/app/AppProviders.tsx` | Query client, theme, dev-only devtools. |
| `src/app/router.ts` | `createRouter`, context, and the `Register` augmentation. |
| `src/app/layout/RootLayout.tsx`, `WorkspaceLayout.tsx` | The two shells. |
| `src/app/pages/LandingPage.tsx`, `WorkspaceHomePage.tsx` | Placeholders. |
| `src/components/ErrorBoundary.tsx` | The one class component. |
| `src/components/QueryBoundary.tsx` | Suspense + boundary + cache reset. |
| `src/components/QueryErrorState.tsx` | The translated failure state. |
| `src/components/ColorModeToggle.tsx` | Light / dark / system. |
| `src/components/LanguageSwitcher.tsx` | `ro` / `en`. |
| `src/components/layout/AppHeader.tsx`, `AppSidebar.tsx` | Shell regions. |
| `src/components/ui/spinner.tsx` | `sm` / `md` / `lg` / `xl`, accessible. |
| `src/components/ui/{skeleton,table,input,select,dropdown-menu,card}.tsx` | shadcn primitives. |
| `src/components/data-table/*` | `DataTable`, its toolbar, sort menu, column-visibility menu, pagination, card view, skeleton, types and state hook. |
| `src/features/health/*` | The smoke test and the feature-folder example. |
| `src/hooks/useDebouncedValue.ts` | Used by the table search. |
| `src/i18n/config.ts`, `i18next.d.ts`, `useApiErrorMessage.ts` | i18n setup, typed keys, the error lookup. |
| `src/locales/{ro,en}/{common,errors}.json` | The bundles. |
| `src/lib/env.ts` | `API_BASE_URL`, and the argument for it being an origin. |
| `src/lib/datetime.ts` | `ro-RO` formatters that *require* a time zone. |
| `src/routes/*` | The four routes and the assembled tree. |
| `src/theme/*` | Types from the contract, the maps, the provider, the palettes. |
| `src/vite-env.d.ts` | Typed `import.meta.env`. |
| `FEATURES/F01-project-foundation.md` | This document. |

## Files Modified

| File | Change |
| --- | --- |
| `package.json` | Six runtime and two dev dependencies; `gen:api` and `typecheck` scripts. |
| `vite.config.ts` | The `@/` alias and the `/api` dev proxy from `VITE_API_PROXY_TARGET`. |
| `tsconfig.app.json` | `strict`, `resolveJsonModule`, and the `@/*` paths. `baseUrl` omitted — deprecated in TypeScript 6. |
| `tsconfig.node.json` | `strict`. |
| `tsconfig.json` | `baseUrl` removed, same reason. |
| `eslint.config.js` | `react-refresh/only-export-components` off for `src/components/ui/**` — see *Notes*. |
| `index.html` | `lang="ro"`, the real title, and the pre-paint colour-mode script. |
| `src/index.css` | Imports `theme/palettes.css`. |
| `src/main.tsx` | Providers, the router, the i18n side-effect import. |
| `README.md` | Replaced the Vite template text with run/setup steps pointing at `CLAUDE.md`. |
| `.gitignore` | `.env` ignored, `.env.example` kept. |

### Files Deleted

| File | Why |
| --- | --- |
| `src/App.tsx` | The Vite template placeholder. `main.tsx` renders the router; leaving it would be dead code. |

---

## Dependencies

| Package | Why |
| --- | --- |
| `axios` | The transport, per `CLAUDE.md`. |
| `@tanstack/react-query` | Server state. |
| `@tanstack/react-router` | Typed routing. |
| `@tanstack/react-table` | The `DataTable`. **v9** — the current major; its plugin model is why only `columnVisibilityFeature` is registered. |
| `i18next`, `react-i18next` | Translations. |
| `openapi-typescript` (dev) | The codegen. See the argument above. |
| `@tanstack/react-query-devtools` (dev) | Inspecting the cache across thirty features of list screens. Lazily imported behind `import.meta.env.DEV`, so it is absent from the production bundle — a plain conditional import would still be bundled, since the condition is runtime and the import is build time. |

Not installed: `react-hook-form`, `zod`, `@hookform/resolvers` — see *Forms*.

---

## Verification

| Check | Result |
| --- | --- |
| `npm run typecheck` | clean |
| `npm run lint` | clean |
| `npm run build` | clean — 2 232 modules, 571 kB / 188 kB gzipped |
| `npm run gen:api` | 17 451 lines written from the live document |
| `npm run dev` | serves; `/api/v1/health` through the proxy answers `{"success":true,"data":{"status":"ok","service":"backend"}}`; `/api/docs-json` answers `200` |
| Typed client | probed positively (no-arg, query, path param, body, enum) **and negatively** — a missing path parameter, a missing required query and an unknown path are each compile errors |

---

## Notes

### One ESLint rule is relaxed, in one folder

`react-refresh/only-export-components` is off for `src/components/ui/**`. Those
files are vendored by the shadcn CLI and re-fetched on the next `shadcn add`;
they export a component together with its `cva` variants, which the rule flags.
Fixing them would be undone by the generator. The rule stays on everywhere else,
which is where it protects our code — and it is why `useTheme` lives in its own
file rather than beside `ThemeProvider`.

### The stack was already partly there

`frontend/` already had Vite, React 19, TypeScript, Tailwind v4 and shadcn
(`base-vega` style, Base UI primitives). None of it was replaced. What was
missing and added: `strict` mode (it was genuinely off), the `@/` path alias in
the compiled project rather than only in the unused solution file, and the dev
proxy.

### Tailwind v4 has no config file, and that is load-bearing here

There is no `tailwind.config.*` and there must not be. The theme is CSS custom
properties, which is precisely what lets `ThemeProvider` swap a palette by
setting one attribute and the radius by setting one property — a JS config would
have to be rebuilt to change either.

---

## Future Improvements

1. **A `--radius` seam for the palette pickers.** The provider and the mapping
   exist; the settings UI does not, on purpose — it belongs with the profile
   screen that can `PATCH /profile/me`. `COLOR_SCHEMES` and `CORNER_RADII` are
   exported ready for it.
2. **Regenerate the API types in CI and fail on a diff.** Backend Feature 038
   lists this as its own first improvement, and it is the step that turns "the
   docs cannot drift from the backend" into "the frontend cannot drift from the
   docs".
3. **A global error surface.** `queryClient` has a marked place for a
   `QueryCache.onError`, left empty because a handler with nowhere to render is
   worse than none. It wants a toast component first.
4. **The company time zone through a hook.** `lib/datetime.ts` requires the zone
   as an argument so it cannot be forgotten; the value comes from
   `GET /api/v1/work-schedule`, and a `useCompanyTimezone()` reading it once
   belongs with the first screen that renders a timestamp.
5. **Route-level prefetching.** `defaultPreload: 'intent'` is on, but no route
   has a loader yet. Once list screens exist, moving their query into a route
   loader would start the request on hover rather than on mount.
6. **Chart colours per palette.** `palettes.css` leaves `--chart-1..5` neutral.
   They should be decided with the reporting feature, against real series.
7. **Bundle splitting.** One 571 kB chunk is fine for an internal application on
   a LAN and will not stay fine. Route-level `lazy()` is the obvious first cut,
   and it is worth doing when there are routes worth splitting.

---

# Amendment: the column-visibility menu crashed on its first open

Reported against F07, the `DataTable`'s first real consumer: the list
rendered, sorting and paging worked, and clicking **Coloane** replaced the
page with *A apărut o eroare neașteptată*.

The hypothesis in the report was that the menu iterates the columns and
trips over one that lacks something — the actions column has no data, the
code column renders a swatch, and menus like this often break on
non-data columns. It was a reasonable guess and it was not the cause.
`DataTableColumnVisibility` already filtered on `column.getCanHide()` and
already fell back to `column.id` when `meta.label` was absent, so no
column could reach it unlabelled.

## The actual cause

`DropdownMenuLabel` is Base UI's `Menu.GroupLabel`, and it calls
`useMenuGroupRootContext()`, which **throws** rather than returning
`undefined`:

```
Base UI: MenuGroupContext is missing.
Menu group parts must be used within <Menu.Group> or <Menu.RadioGroup>.
```

Both `DataTable` menus rendered that label as a direct child of the popup,
with no group around it.

Three things conspired to hide it until F07:

1. **The popup is portalled in on open.** Nothing in the menu body
   evaluates until somebody clicks, so the bug survives type-checking,
   linting, a build, and every render of a page that merely *contains* the
   button.
2. **Nothing had used the `DataTable`.** It was built here in F01 and F07
   is the first screen to mount one.
3. **Radix allowed a bare label.** The mock this kit was ported from is
   Radix-based, so the shape is what shadcn's own documentation shows.
   `WorkspaceSwitcher` hit the same wall in F05 and left a comment saying
   so; the two `DataTable` menus were written before that lesson and never
   opened afterwards.

The error surfaced as the generic sentence because a render throw inside
`QueryBoundary` is caught by its `ErrorBoundary` and described by
`useApiErrorMessage`, which has no code and no status for something that
is not an `ApiError` — so it falls to `errors:fallback.unknown`. That is
the fallback working as designed, and it is also why the message named
nothing useful.

## Proof, not inference

Rendering the label three ways under `react-dom/server`, which evaluates
the component body without a browser:

| Arrangement | Result |
| --- | --- |
| `<Menu.GroupLabel>` bare | **throws** `MenuGroupContext is missing` |
| inside `<Menu.Group>` | renders |
| inside `<Menu.RadioGroup>` | renders |

## The fix

- `DataTableColumnVisibility` wraps its label, separator and checkbox
  items in `DropdownMenuGroup`.
- `DataTableSortMenu` had the identical latent crash — its label was
  outside the radio group too — and was only invisible because the menu is
  `lg:hidden` and no desktop had ever opened it. The label moves *inside*
  `DropdownMenuRadioGroup`, which supplies the same context.
- `DropdownMenuLabel` in `components/ui/dropdown-menu.tsx` now carries a
  doc comment saying it must be inside a group and why, so the next menu
  copied from the shadcn docs fails in review rather than on click.

Putting the label inside the group it labels is also the correct markup
rather than a workaround: that is how `GroupLabel` becomes the group's
`aria-labelledby`, which is the whole point of the part.

## What was hardened while in there

The report asked that non-hideable columns be skipped and that the label
have a safe fallback. Both were already true, and the reason they read as
missing is that nothing in the codebase had ever *set*
`enableHiding: false` — so `getCanHide()` had never once answered `false`
and the filter looked decorative.

It is not decorative now: F07's row-actions column declares
`enableHiding: false`, which is what keeps the visibility menu from
offering to hide the only way to edit or delete a row. That is the
convention for every later list — **a display column that is not data
opts out of hiding.**

## Files Modified

| File | Change |
| --- | --- |
| `src/components/data-table/DataTableColumnVisibility.tsx` | Label, separator and items inside `DropdownMenuGroup`; the two robustness rules documented. |
| `src/components/data-table/DataTableSortMenu.tsx` | Label moved inside `DropdownMenuRadioGroup`. |
| `src/components/ui/dropdown-menu.tsx` | A doc comment on `DropdownMenuLabel`. Comment only — no behaviour change. |

## Verification

`npm run typecheck`, `npm run lint`, `npm run build` — clean. The throw
and both fixes are demonstrated by the table above, run against the
installed `@base-ui/react`.

**Still not run in a browser.** What a browser has to confirm is that the
menu opens, lists the eight data columns by their Romanian labels and not
the actions column, and that unchecking one removes its column from the
table and its key/value pair from the card view.
