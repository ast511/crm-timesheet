# CLAUDE.md — Frontend

This file governs the **frontend** of the CRM Timesheet monorepo. The backend has
its own `backend/CLAUDE.md` and `backend/FEATURES/`. When working in `frontend/`,
follow THIS file.

---

## Architecture

```
React (Vite) UI
  ↓ typed API client (generated from OpenAPI) over axios (+ interceptors)
NestJS REST API  (../backend, served under /api/v1)
```

The frontend is a single-page app. It talks to the backend only through the
generated, typed API layer. It never assumes a response shape it did not get from
the OpenAPI contract.

---

## Stack (use exactly these — do not substitute)

- **Vite + React 19 + TypeScript** (strict)
- **Axios** for HTTP, wrapped in one app instance with interceptors (token attach,
  401 refresh hook, error normalization)
- **Typed API generated from the backend OpenAPI** (`/api/docs-json`). Response and
  request types come from the contract — never hand-write them. Regenerate when the
  backend contract changes.
- **TanStack Query** (React Query) — all server state (fetch, cache, refetch,
  loading/error). No manual `useEffect` data fetching.
- **TanStack Router** — typed routing.
- **shadcn/ui + Tailwind CSS v4** — components and styling.
- **react-hook-form + Zod** (`@hookform/resolvers`) — all forms and their validation.
- **react-i18next + i18next** — internationalization (default `ro`, fallback `en`).
- **framer-motion** — all non-trivial UI animation and transitions (see Animations).

Justify any additional dependency in the feature doc; keep the set lean.

---

## General Rules

- Always use TypeScript. Never use JavaScript.
- Follow SOLID, DRY, KISS.
- Keep components small, focused, single-responsibility.
- Break the UI into small, reusable components — no monolithic components.
- Extract reusable logic into **custom hooks** (`useX`), not inline in components.
- Prefer composition over inheritance.
- Prefer readability over clever implementations.
- Generate clean, maintainable, production-ready code.
- Never duplicate code.

---

## TypeScript

- **Strict mode** enabled.
- **No `any`.** Use proper typing or `unknown` (then narrow).
- Define interfaces/types for all component props, API responses, and data models.
  (API response types come from the generated OpenAPI layer — prefer those over
  re-declaring shapes.)
- Use type inference where obvious; explicit types where they aid clarity.

---

## React

- **Components are arrow functions**: `const ItemCard = (props: ItemCardProps) => {…}`.
  Do not use `function` declarations for components.
- One component per file; the file name matches the component.
- Props typed with an explicit interface/type (`ItemCardProps`), no `prefix`.
- Side-effectful/server data goes through TanStack Query hooks, not `useEffect`.
- Reusable behavior → custom hooks under `src/hooks/` or the feature's `hooks/`.

---

## Forms & validation

- **All forms use react-hook-form with a Zod schema via `zodResolver`.**
- The Zod schema is the single source of truth for a form's shape and rules.
- Frontend Zod validation is for **UX** (immediate, friendly feedback). The backend
  remains the source of truth for security validation — the two are layers, not a
  replacement. Do not assume frontend validation protects anything; it only improves
  the experience.
- Surface backend validation errors (VALIDATION_ERROR envelope) in the form too,
  mapping field errors where possible.

---

## Loading states

Two distinct loading patterns — use the right one:

- **Skeletons (for content loading).** When a component loads data that fills a known
  structure, wrap it in a `<Suspense>` boundary whose fallback is a **shadcn Skeleton
  that mirrors the shape of the real component** — same layout (a title bar, N rows, a
  card grid), so nothing shifts when data arrives (no layout shift). Do NOT use a
  generic spinner for content loading.
  - Use TanStack Query's `useSuspenseQuery` so the query suspends into the boundary
    instead of returning an `isLoading` flag to branch on.
  - Each feature provides its own skeleton that matches its rendered output.

- **Spinner (for punctual / app-level loading).** Use the shared `<Spinner>` component
  for brief, non-structural waits: a submitting button, the initial app boot, an
  action in progress. Not for content that has a known shape (use a skeleton there).

### Spinner component

- A single shared `<Spinner>` in `src/components/ui/` (or `src/components/`).
- Prop `size` with semantic variants: **`sm` | `md` | `lg` | `xl`** (not raw pixels),
  mapped to consistent dimensions via CSS variables / Tailwind classes.
- Accessible: an accessible label (e.g. `aria-label`/role status) so screen readers
  announce the loading state.

---

## Animations

- **Use framer-motion** for all non-trivial animation and transitions: entrance/exit
  of dialogs, popovers, sheets and menus (e.g. the collapsed-sidebar popover submenu),
  list item add/remove, page/route transitions, and any motion that needs
  orchestration, spring physics, or enter/exit (`AnimatePresence`). Do not hand-roll
  these with ad-hoc CSS keyframes or setTimeout-driven state.
- Simple, static state changes (a hover color, a basic fade that Tailwind's
  `transition-*` utilities already cover) may stay plain CSS — do not reach for
  framer-motion where a Tailwind transition is clearly enough. Reserve it for motion
  that has enter/exit, sequencing, or interactivity.
- Keep motion **subtle, fast, and purposeful** — it should aid understanding (where did
  this come from, what changed), never distract. Prefer short durations and gentle
  easing/spring.
- **Respect reduced motion:** honor `prefers-reduced-motion` (framer-motion's
  `useReducedMotion` / reduced variants) so users who ask for less motion get minimal
  or no animation. This is an accessibility requirement, not optional.
- Wrap repeated motion patterns in small reusable components/variants (e.g. a shared
  fade/slide variant set) rather than re-specifying transitions inline everywhere,
  consistent with the "small reusable pieces" rule.

---

## Responsive design (REQUIRED — every component)

**Mobile-first. Every component must look good on mobile, tablet, and desktop.** Use
Tailwind's breakpoints (`sm` `md` `lg` `xl`) deliberately; never ship a component that
only works at one width.

- Design for small screens first, then enhance upward.
- Layouts, spacing, navigation, dialogs, and forms all adapt to the viewport.
- Test each component at mobile, tablet, and desktop widths.

### Tables → cards on small screens (REQUIRED)

Tabular data must NOT force horizontal scrolling on small screens.

- **Desktop (`lg` and up):** render a normal table.
- **Mobile + tablet (below `lg`):** render the SAME data as a **list of cards** — each
  table row becomes a card with labelled key/value pairs (label + value stacked),
  readable without horizontal scroll.
- One data source, two presentations chosen by breakpoint. Build a reusable
  responsive-table pattern/component so this is consistent across every table
  (reports, employees, timesheets, etc.) rather than re-solved per page.
- The card view must expose the same actions (view/edit/etc.) the table row would.

### DataTable (TanStack Table + shadcn)

All data tables use **TanStack Table** rendered with **shadcn** table primitives,
through ONE reusable **`DataTable`** component — do not hand-roll a table per page.

The `DataTable` supports:

- **Global search** (debounced ~300ms before hitting the server, so typing does not
  spam requests)
- **Column filters**
- **Sorting** (per sortable column)
- **Column visibility** (show/hide columns)
- **Pagination — page-based, NOT infinite scroll** (page + page size controls)

**Server-side is the default.** Search, filtering, sorting, and pagination are done
**on the server**, using the backend's shared pagination (backend Feature 006): the
`DataTable` sends `page`, `pageSize`, `sortBy`, `sortDir`, search and filter params to
the list endpoint, and renders the returned page. This scales to large tables
(employees, reports, timesheets) instead of loading every row into the browser.

- Wire state (page/sort/filter/search) into the query key so TanStack Query refetches
  the right page and caches per-page.
- Column definitions are typed from the generated OpenAPI row types where possible.

**Responsive behaviour (ties into the tables→cards rule):** on desktop (`lg`+) the
`DataTable` renders the full table with all controls; below `lg` it renders the card
list, KEEPING search / filters / sort / pagination above the cards, but DROPPING the
column-visibility control (there are no columns in card view). Same data, same
server-side query, two presentations.

If a table is genuinely tiny and fixed (e.g. a short config list), a client-side mode
may be used — but server-side + Feature 006 is the default and the expectation for any
list that can grow.

---

## Tailwind CSS v4 (CRITICAL)

We use **Tailwind CSS v4**, which is CSS-based, not JS-config based.

- **DO NOT** create `tailwind.config.ts` / `tailwind.config.js` (those are v3).
- All theme configuration is done in CSS via the `@theme` directive in the global
  stylesheet (e.g. `src/index.css` / `src/app/globals.css`).
- Use CSS custom properties for colors, spacing, radius, etc.
- No JavaScript-based Tailwind config.

Example v4 configuration:

```css
@import "tailwindcss";

@theme {
  --color-primary: oklch(50% 0.2 250);
  --radius: 0.5rem;
}
```

The theme (color scheme + corner radius) is driven by the user's stored preferences
(see "Theming" below).

---

## Theming (driven by stored user preferences)

Theme is variable-driven so it can be set from the user's server-stored preferences
(backend Feature 039):

- **colorScheme** ∈ {Default, Red, Rose, Orange, Green, Blue, Yellow, Violet} → swaps
  the palette CSS variables.
- **cornerRadius** symbolic → rem, mapped exactly as the backend documents:
  `NONE = 0`, `SMALL = 0.3rem`, `MEDIUM = 0.5rem`, `LARGE = 0.75rem`, `FULL = 1.0rem`
  → sets `--radius`.
- **Light/dark** is **client-only** (system default + local toggle), NEVER sent to
  the backend.

A `ThemeProvider` applies these; the profile feature wires it to the real user
preferences.

---

## Dates and times (moved from the backend CLAUDE.md — this is the frontend's job)

- The backend sends ISO strings and never formats a date. **Formatting is the
  frontend's job.**
- Render every timestamp in the **company timezone**, read once from
  `GET /api/v1/work-schedule` (`timezone`), never in the browser's zone.
- Format with the `ro-RO` locale, matching the exported reports.
- **Never** call `toLocaleString()` / `toLocaleDateString()` without an explicit
  `timeZone`. Without it they silently use the machine's zone: correct on a laptop in
  Bucharest, wrong for a colleague abroad, and invisible in review.
- Put both rules in **one** helper and format through it everywhere.

```ts
new Intl.DateTimeFormat("ro-RO", {
  timeZone: companyTimezone, // from GET /api/v1/work-schedule
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
}).format(new Date(isoString));
```

Full reasoning — instants versus calendar dates, and why the exports are fixed to
the company zone — is in the backend's `FEATURES/031-reporting.md`.

---

## Errors & i18n

- The backend returns a standard error envelope:
  `{ success:false, statusCode, message, errorCode?, params?, path, timestamp }`.
- **Translate by `errorCode`, never show the raw `message`.** Error codes are i18n
  keys (namespace `errors.<CODE>`); `params` are the interpolation values.
- Default language `ro`, fallback `en`.

---

## API access

- Every request goes through the app's **axios instance** (so interceptors apply).
  Never use bare `fetch` that bypasses it.
- Types come from the **generated OpenAPI client**; regenerate after backend contract
  changes (`npm run gen:api` or the project's script).
- The **access token lives in memory** (auth store/context), never in `localStorage`
  or a URL. This limits XSS blast radius.

---

## File Organization

Adapted to **Vite + TanStack Router** (NOTE: this project is NOT Next.js — there is
no `app/[route]/page.tsx` App Router and no Server Actions; ignore those Next.js
conventions):

```
src/
  api/            generated OpenAPI types + the axios client + query setup
  app/            router, providers, root layout shell
  routes/         TanStack Router route definitions (typed)
  components/
    ui/           shadcn/ui primitives
    [feature]/    feature-specific components: components/[feature]/ComponentName.tsx
  features/       one folder per domain feature (its components, hooks, api calls)
  hooks/          shared custom hooks
  lib/            utilities (cn(), constants, formatters e.g. the date helper)
  locales/        i18n resources: ro, en
  theme/          theme definitions, ThemeProvider, color/radius mapping
  types/          shared types not covered by the generated API (types/[feature].ts)
```

- Components: `src/components/[feature]/ComponentName.tsx`
- Shared utilities: `src/lib/[utility].ts`
- Feature-scoped types: `src/types/[feature].ts` (API types come from the generated
  client — do not re-declare those)
- Data fetching for a feature lives in that feature's folder as TanStack Query hooks.

(If a rule here ever conflicts with Next.js-style guidance you have seen elsewhere,
this Vite + TanStack Router layout wins — we do not use Next.js.)

---

## Naming

- **Components**: PascalCase (`ItemCard.tsx`)
- **Files**: match the component name, or kebab-case for non-components
- **Functions / hooks**: camelCase (`useAuthUser`, `formatDate`)
- **Constants**: SCREAMING_SNAKE_CASE
- **Types / Interfaces**: PascalCase, no prefix (no `IProps`)

---

## Feature Workflow

Before implementing a frontend feature:

1. Read `FEATURES/HISTORY.md`.
2. Read `FEATURES/TEMPLATE.md`.
3. Review related feature documents if relevant.
4. Avoid breaking existing functionality.

After implementing a frontend feature:

1. Create a new feature document using `FEATURES/TEMPLATE.md`.
2. Assign the next available incremental frontend number (F01, F02, …).
3. Update `FEATURES/HISTORY.md`.
4. Document all UI, state, API-integration, and theming changes.
5. Never overwrite previous feature documents.

---

## Command Execution Policy

- Explain any command that installs dependencies, runs a build, or changes project
  config, and wait for explicit approval before running it.
- Never run destructive commands without approval.
- Prefer type-check (`tsc --noEmit`) for verification unless a full build is needed.
