# Authentication

## Goal

Turn the seams F01 left into a session: sign in, stay signed in across a
reload, renew silently when the access token expires, sign out, and keep
everything behind `/app` unreachable without one.

The backend's Feature 040 moved the refresh token into an `HttpOnly` cookie a
week before this was written, which decides the shape of almost everything
below. **The frontend now holds one credential and cannot read the other.** The
access token lives in a module variable for fifteen minutes; the refresh token
lives in the browser's cookie jar for seven days, and no line of code in this
repository can see it, copy it, or send it deliberately. Staying signed in is
therefore not something this application does — it is something it *asks for*,
by making a request the browser attaches a credential to on its own.

Everything that follows is a consequence of that one sentence.

## Requirements

- `withCredentials` on the axios instance, before anything else.
- The access token in memory, the user beside it, neither persisted.
- The `401` seam filled: one refresh, shared by every request that needs it,
  one retry each, no loop.
- A session hydrated on load from `GET /auth/me`, with the silent refresh behind
  it.
- Login, forgot-password, reset-password and activate-account screens, all four
  from one card, all four `react-hook-form` + Zod, all errors translated by
  `errorCode`.
- One route guard, on one route.
- Type-check, lint and build clean.

---

## `withCredentials`, and the bug it prevents

```ts
export const http = axios.create({ baseURL: API_BASE_URL, withCredentials: true });
```

Without it, **nothing appears to be wrong for fifteen minutes.** The browser
refuses to *store* the cookie `POST /auth/login` sets, so login succeeds, the
access token works, every screen loads — and then the first silent refresh is
sent with no cookie and answers `401 AUTH_REFRESH_TOKEN_INVALID`, which is
indistinguishable from a session that legitimately ended. There is no error at
the moment of the mistake and nothing in the failing request points at the flag.

It is on the instance rather than on the four `/auth` calls that need it. A
per-call flag is a per-call thing to forget, and it costs nothing elsewhere: the
cookie is scoped `Path=/api/v1/auth`, so the browser never attaches it to a
timesheet request no matter what this says.

The deployment half is the backend's `CORS_ORIGINS` — credentials cannot be sent
to a wildcard origin. In development this does not arise, because Vite proxies
`/api` and every request is same-origin; it is the first thing to check when a
deployed frontend cannot refresh.

---

## The session

### It is a store, not a context

`features/auth/auth-store.ts` holds `{ status, user, isAuthenticated }` in
module scope, and React reads it through `useSyncExternalStore`.

That is not a preference. **The session has two writers and only one of them is
a component.** The axios response interceptor renews it after a silent refresh
and ends it when a refresh is refused — and an interceptor is a module. It
cannot call a setter that lives inside a provider. A context whose value is
written from outside React through a ref would be a store with extra steps and
one more place for the two copies to disagree, so the state lives where both
writers can reach it and `useAuth()` is the read side.

A component therefore needs no provider above it, which is what lets the route
guard and the header read the same snapshot as the login form.

| Transition | Called by | What it does |
| --- | --- | --- |
| `startSession` | login | token + user, **and clears the query cache** |
| `renewSession` | the refresh seam | token + user, cache untouched |
| `adoptUser` | boot hydration | the user behind a token that already exists |
| `endSession` | logout, refused refresh | clears both, idempotent |

**Only login clears the cache**, and it is the only transition that should. It
is the one moment a different person can begin using the same tab, and it is the
one moment nothing but a login form is mounted — so no screen watches its data
vanish underneath it. Clearing on *refresh* would throw away every list every
fifteen minutes and turn an invisible mechanism into a visible stutter; clearing
on *sign-out* would trigger refetches from components that are still mounted,
each answering `401` on the way out.

`status` has three values and the third is the one that matters: `loading` means
the boot request has not answered, which is different from `anonymous` and must
not be treated as it.

### Nothing is persisted, including the user

The access token is a module variable for the reasons `api/auth-session.ts`
already argued at length, and Feature 040 adds the sharper version: an injected
script on this origin can *use* the session while the tab is open, but cannot
copy a credential out to a machine the victim cannot reach. That is the whole
and honest size of the win.

The user object is not stored either, and that is a separate decision. It would
be a copy of an account whose role may have changed since it was written, and a
reload has a better answer available for the cost of one request.

---

## The refresh, and why the lock is not an optimisation

```
5 queries → 5× 401 → interceptor → refreshSession() ×5
                                    └── one POST /auth/refresh, shared
```

`features/auth/session-refresh.ts` keeps the in-flight promise in a module
variable. The latecomers await the same call and each retries its own request
once — the retry cap being the interceptor's `retriedAfterRefresh`, from F01.

**Without the lock the application signs people out.** The refresh token is
single-use: the first call rotates it and the cookie becomes the successor, so
the second call presents a spent token, which the backend treats as theft. Every
session of the account is revoked and the answer is
`AUTH_REFRESH_TOKEN_REUSED` — including for the legitimate client that was
mid-refresh. This was verified against the running backend rather than taken on
trust; the replay of a spent cookie is in *Verification* below.

The handler never rejects. Its contract is a boolean — `true` means a new token
is in the holder and the original request is worth retrying, `false` means the
session is over — and a rejection would surface as an error about refreshing on
a request somebody made about something else.

**It is registered at module scope**, not in an effect. It has to be in place
before the *first* request of the page, and that request is the boot-time
`GET /auth/me` whose `401` is precisely what triggers the refresh that signs a
returning person back in. An effect runs after that request has already been
made and refused, so the seam would be empty at the one moment it matters most.
`session-bootstrap.ts` imports the module for that ordering and says so.

---

## Hydration: the whole feature is one request

```
GET /auth/me                    (no token — memory did not survive the reload)
  ← 401 AUTH_UNAUTHENTICATED
    → interceptor → refreshSession → POST /auth/refresh   (no body)
                                     ↑ browser attaches the cookie unasked
      ← 200 { accessToken, user }
  → retry GET /auth/me → 200
```

`session-bootstrap.ts` contains none of that. It asks a question and handles two
answers; the interceptor and the cookie do the work. If the cookie is gone or
spent, the refresh fails, the seam has already called `endSession`, and the
promise rejects — which is the anonymous case, not an error to report. A person
arriving at a login screen has not experienced a failure.

The promise is memoised, so StrictMode's double-invoked effect makes one
request.

### Nothing renders until it answers

`AuthGate` shows a full-page `Spinner` while `status === 'loading'`.

The router mounts underneath it, and that ordering is load-bearing rather than
cosmetic. `beforeLoad` runs once per navigation and is not re-evaluated when a
promise settles, so a router mounted during `loading` decides with the wrong
information: a returning person with a perfectly good refresh cookie is bounced
to `/login`, and a fraction of a second later the session arrives and nothing
re-asks. Waiting removes the race instead of compensating for it.

The cost is one round trip before the first paint. It buys the absence of a
flash of the login screen, which is the failure people actually notice.

---

## UI / Components

### Shared, and reusable beyond this feature

| Component | Where | What it is |
| --- | --- | --- |
| `FormField` | `components/form/` | Label, input, message — with the `id`, `aria-invalid` and `aria-describedby` derived from one generated id so they cannot drift. Takes the input's props, so `{...register('email')}` lands on the input, `ref` included. |
| `FormAlert` | `components/form/` | The form-level message: a translated `errorCode`, or a deliberately generic confirmation. `AnimatePresence` for enter *and exit*, inside a permanent `aria-live` region. |
| `SubmitButton` | `components/form/` | `pending` disables it and spins. On a strictly rate-limited endpoint, a disabled button is not cosmetic. |
| `FadeIn` | `components/motion/` | The application's entrance animation, once. Reduced motion removes the movement, not the element. |

### This feature's

| Component | What it is |
| --- | --- |
| `AuthCard` | The shell for all four screens. **One card, two shapes**: with an `illustration` it is the wide split card, without one a narrow column. A page says whether it has a picture, not how to lay one out. |
| `AuthIllustration` | The photograph, as a CSS background rather than an `<img>` — see below. |
| `LoginForm`, `ForgotPasswordForm` | The two forms that are only themselves. |
| `SetPasswordForm` | "Choose a password", twice, with the confirmation. |
| `SetPasswordScreen` | Reset and activation, as one screen. |
| `SignOutButton` | The action, deliberately not an account menu. |

### The illustration is a background image on purpose

The design hides it below `md`, and `display: none` is how that is done — but a
browser inside a `display: none` subtree still fetches an `<img>` element's
`src`, and would fetch 273 kB of photograph for a phone that will never show it.
A CSS background in the same subtree is not fetched at all. That is the entire
reason it is a component instead of two lines inside `AuthCard`.

It is decorative, so it has no text alternative: a screen reader announcing it
would be reading out the wallpaper.

### Reset and activation are one screen

They are the same three states in the same order — no token, the form, done —
and the differences are all copy. Writing them twice would be writing the third
state twice.

The state that is easy to leave out is the first. `?token=` can arrive empty
because a mail client wrapped a long URL, and that is not a failure to report:
there is no form to show, because a password that cannot be submitted is a dead
end with a button on it. `validateSearch` defaults the field to `''` rather than
throwing, so the screen can say "open the whole link from the email" instead of
the router rendering an error boundary at somebody whose only mistake was
clicking.

`ACCOUNT_TOKEN_INVALID` is the one code these screens branch on rather than
merely translating, because a dead link needs an *action* and the action
differs: somebody resetting a password can request another link themselves,
somebody activating an account has to ask whoever invited them. There is no
"resend my invitation" endpoint, and its absence is correct — deciding that an
account should exist is not something the person being invited can do.

---

## Forms & Validation (react-hook-form + Zod)

The three packages F01 deliberately did not install arrive here, with their
first consumer, exactly as it said they would.

### The bounds are the backend's, borrowed

| Rule | Value | Source |
| --- | --- | --- |
| email length | 254 | RFC 5321, via `@IsEmailAddress()` |
| password floor | 8 | `PASSWORD_MIN_LENGTH`, NIST SP 800-63B |
| password ceiling | 72 | `MAX_PASSWORD_BYTES`, bcrypt's truncation point |

Two asymmetries follow the backend's own reasoning rather than tidiness:

- **The login form does not enforce the floor**, and neither does `LoginDto`. A
  password *policy* belongs where a password is chosen. Refusing to send a
  seven-character password would lock out an account whose password predates the
  policy, and would tell an anonymous visitor what the policy is.
- **The ceiling is characters here and bytes there.** bcrypt truncates on bytes,
  so seventy-two emoji are 288 of them. A browser counting characters is the
  friendlier approximation and is never *stricter* than the server, which is the
  direction a UX check should err in.

### The messages are injected

`createLoginSchema(messages)` rather than Romanian strings inside the schema. A
schema with sentences baked in would be a second translation system living
outside `locales/`, and would print Romanian at somebody reading the application
in English. `useAuthSchemas` supplies them from the bundles and memoises on `t`,
so the rules live in one file and the words in another, and both lengths are
interpolated so the number cannot disagree with the rule.

`confirmPassword` exists only in the browser, and one schema serves both
token screens: `newPassword` and `password` is a difference between two
endpoints, handled in `auth-api.ts` where wire details belong.

### Server-side validation errors

`lib/form-errors.ts` recovers the rejected field names from the envelope's
`details` — every line from the `ValidationPipe` begins with the property name —
and the form marks those inputs invalid. **It does not use the text.** Those
lines are English written for a log, exactly like `message`, and the form-level
alert says what happened, translated by `errorCode`.

In practice this fires rarely, because the Zod schema mirrors the backend's
rules. That is the case worth handling: a request the browser was not asked to
check.

---

## API Integration

`features/auth/auth-api.ts` holds every call, with two things set once rather
than remembered at each site:

| Route | Body | Notes |
| --- | --- | --- |
| `POST /auth/login` | `{ email, password }` | `skipAuthRefresh` |
| `POST /auth/refresh` | **none** | `skipAuthRefresh`; the cookie is the request |
| `POST /auth/logout` | **none** | `skipAuthRefresh`; Bearer + cookie |
| `GET /auth/me` | — | **no** `skipAuthRefresh` — the deliberate exception |
| `POST /auth/forgot-password` | `{ email }` | fixed message, whatever the outcome |
| `POST /auth/reset-password` | `{ token, newPassword }` | resolves to nothing |
| `POST /auth/activate` | `{ token, password }` | resolves to nothing |

`skipAuthRefresh` is on all of them but `/auth/me` because a `401` from those
routes *is* the answer, not a symptom of an expired access token. Login
answering `401` means the password was wrong. Refresh answering `401` means the
session is over — and letting the interceptor react to that by attempting a
refresh would attempt a refresh in response to a failed refresh, forever.
`GET /auth/me` is the exception because its `401` is exactly the case a silent
refresh exists for.

The three endpoints that answer `data: null` resolve to `void`. The contract
types that field `unknown` — "always null" is not a shape OpenAPI can name — and
handing a caller a value with no meaning is worse than handing them nothing.

### The generated types were regenerated, and had to be

The committed `openapi.d.ts` predated backend Feature 040. It still described
`refreshToken` on `AuthSessionEntity`, a `RefreshDto` request body on
`POST /auth/refresh`, and `refreshToken` on `ChangePasswordDto`. Written against
it, this feature would have compiled and been wrong in exactly the way F01
warned about. `npm run gen:api` against the running backend removed 69 lines and
added 14; the diff is the whole of Feature 040 as the frontend sees it.

**This is the drift F01's second Future Improvement exists to catch**, and it
went unnoticed for one backend feature. It remains the strongest argument for
regenerating in CI and failing on a diff.

---

## Routing

```
rootRoute              "/"                 RootLayout
├── landingRoute       "/"                 public
├── loginRoute         "/login"            public, ?redirect=
├── forgotPasswordRoute"/forgot-password"  public
├── resetPasswordRoute "/reset-password"   public, ?token=
├── activateAccountRoute "/activate-account" public, ?token=
└── workspaceRoute     "/app"              ← the guard, and only here
    └── workspaceIndexRoute
```

Five of six routes are public, which is not laxity: four exist precisely for
somebody who *cannot* sign in. Everything requiring a session hangs off
`workspaceRoute`.

### The two email paths are not ours to choose

`/reset-password` and `/activate-account` match `RESET_PATH` and
`ACTIVATION_PATH` in the backend's `account-email.service.ts` exactly. Renaming
either breaks links already sitting in people's inboxes, which cannot be
reissued.

### The guard, and the half that is easy to miss

```ts
beforeLoad: ({ context, location }) => {
  if (!context.auth.isAuthenticated) {
    throw redirect({ to: '/login', search: { redirect: location.href } });
  }
}
```

One `beforeLoad`, on the layout route, covering every child present and future —
which is what stops a screen added next year from being public because somebody
forgot. It runs before the component and before any loader, so a protected
screen never renders for a frame with nobody signed in, and never issues the
request that would answer `401`.

`<RouterProvider context={{ auth }}>` keeps the value current. **It does not
make a guard run again**, because `beforeLoad` is evaluated on navigation and a
session ending is not a navigation — so without a second mechanism, a refresh
the backend refused would leave somebody sitting on a protected screen holding
no credentials until they clicked something. `AppRouter` supplies it:
`router.invalidate()` on a change of snapshot re-evaluates the matched routes,
the guard throws, and they land on `/login` with `?redirect=` pointing back at
where they were. A ref keeps it from firing on the first render, when the router
has only just mounted and there is nothing to re-evaluate.

### `?redirect=` is sanitised, not parsed

`lib/redirect.ts` keeps only paths inside this application. The parameter
arrives from a URL anybody can edit and ends in a `navigate` call, which is the
open-redirect shape: `/login?redirect=https://evil.example/login` would produce
a convincing copy of this form on somebody else's domain, arrived at from a real
link on this one. A scheme, a protocol-relative `//host`, a `/\host` and an
unrooted path are each rejected to `undefined`, and the caller falls back to
`/app` — the cost of being wrong is one extra click.

It is sanitised in `validateSearch`, so the value is already safe everywhere the
router hands it out.

---

## Theming / i18n

Every surface uses theme variables — `bg-card`, `text-muted-foreground`,
`ring-foreground/10`, and `bg-foreground/20` for the illustration's overlay — so
the palette somebody chose and their light/dark setting apply to the login
screen exactly as to the application behind it. The overlay in particular is a
variable rather than a fixed black, so it deepens in dark mode with everything
else instead of becoming the one light panel on the screen.

Five error codes joined the catalogue, each with the feature that can now
produce it:

| Code | Note |
| --- | --- |
| `AUTH_INVALID_CREDENTIALS` | "Email sau parolă greșite." — names neither, deliberately |
| `AUTH_REFRESH_TOKEN_INVALID` | reads as an expired session, which is what it is |
| `AUTH_REFRESH_TOKEN_REUSED` | says every session was closed, because it was |
| `ACCOUNT_TOKEN_INVALID` | the generic version; the two screens override it |
| `ACCOUNT_CURRENT_PASSWORD_INCORRECT` | seeded for the profile feature |

**`AUTH_INVALID_CREDENTIALS` is one message for three situations** — wrong
password, unknown address, deactivated account — because the backend answers one
code with equalised timing for all three. In a company's internal system, "no
such account" also answers "does this person work here". The frontend's job is
not to improve on that, and the login form has no branch that could.

`AUTH_INACTIVE_USER` never reaches the login screen for the same reason; it
appears on `/auth/me` and `/auth/refresh`, where it ends the session and sends
the person here.

---

## Files Created

| File | What it is |
| --- | --- |
| `src/features/auth/auth-api.ts` | Every call, typed from the contract. |
| `src/features/auth/auth-store.ts` | The in-memory session, as an external store. |
| `src/features/auth/useAuth.ts` | `useSyncExternalStore` over it. |
| `src/features/auth/session-refresh.ts` | The single-flight refresh; registers the F01 seam. |
| `src/features/auth/session-bootstrap.ts` | The once-per-load `GET /auth/me`. |
| `src/features/auth/auth-mutations.ts` | Login, logout, forgot, reset, activate. |
| `src/features/auth/auth-schemas.ts` | The Zod schemas, as factories over their messages. |
| `src/features/auth/useAuthSchemas.ts` | Those factories, translated and memoised. |
| `src/features/auth/AuthGate.tsx` | Holds the app back until the session is known. |
| `src/features/auth/components/*` | `AuthCard`, `AuthIllustration`, `LoginForm`, `ForgotPasswordForm`, `SetPasswordForm`, `SetPasswordScreen`, `SignOutButton`. |
| `src/components/form/FormField.tsx` | Label + input + message, wired. |
| `src/components/form/FormAlert.tsx` | The form-level message, with exit animation. |
| `src/components/form/SubmitButton.tsx` | Submit with the in-flight state built in. |
| `src/components/motion/FadeIn.tsx` | The shared entrance animation. |
| `src/lib/redirect.ts` | `toInternalPath` and the open-redirect argument. |
| `src/lib/form-errors.ts` | `rejectedFields` — the field names, never the text. |
| `src/app/AppRouter.tsx` | Context injection and `router.invalidate()`. |
| `src/app/pages/LoginPage.tsx` | The split card. |
| `src/app/pages/ForgotPasswordPage.tsx` | One field and a way back. |
| `src/app/pages/ResetPasswordPage.tsx` | `?token=`, with a self-service recovery link. |
| `src/app/pages/ActivateAccountPage.tsx` | `?token=`, with none, and why. |
| `src/routes/login.route.tsx` | The route, the search sanitiser, the reverse guard. |
| `src/routes/account-link.routes.tsx` | The three public account routes and their `?token=`. |
| `src/routes/public.route.tsx` | *(amendment)* The pathless route that is the public area. |
| `src/app/layout/PublicLayout.tsx` | *(amendment)* Its shell: header + `device` colour-mode scope. |
| `src/components/layout/PublicHeader.tsx` | *(amendment)* Logo and language. No theme control. |
| `src/components/layout/AppLogo.tsx` | *(amendment)* `<picture>` switching on `prefers-color-scheme`. |
| `src/theme/ColorModeScope.tsx` | *(amendment)* How a layout declares whose preference applies. |
| `FEATURES/F03-authentication.md` | This document. |

## Files Modified

| File | Change |
| --- | --- |
| `src/api/http.ts` | **`withCredentials: true`**, and the note on the failure it prevents. The `401` seam's `TODO` now points at its implementation. |
| `src/api/api-error.ts` | `hasErrorCode`, for the one code a screen branches on. |
| `src/api/generated/openapi.d.ts` | Regenerated — Feature 040 had not been picked up. |
| `src/app/router.ts` | `auth` on the router context, defaulted from the store. |
| `src/main.tsx` | `AuthGate` between the providers and `AppRouter`. |
| `src/routes/root.route.tsx` | `RouterContext.auth`; the auth SEAM note is now a description. |
| `src/routes/workspace.route.tsx` | The guard, replacing its own SEAM comment. |
| `src/routes/routeTree.ts` | Four public routes added. |
| `src/components/layout/AppHeader.tsx` | The address and the way out. *(amendment)* Now the **authenticated** header only. |
| `src/locales/{ro,en}/common.json` | The `auth` namespace. |
| `src/locales/{ro,en}/errors.json` | Five codes. |
| `package.json` | Four dependencies. |
| `src/features/auth/session-refresh.ts` | *(amendment)* `isSessionOver` — only a `401` ends the session. |
| `src/app/layout/RootLayout.tsx` | *(amendment)* No longer renders a header; each area brings its own. |
| `src/app/layout/WorkspaceLayout.tsx` | *(amendment)* Renders `AppHeader` and declares the `account` scope. |
| `src/theme/theme.ts` | *(amendment)* `ColorModeScope`, `isAccountThemePath`, the storage-key warning. |
| `src/theme/theme-context.ts`, `ThemeProvider.tsx` | *(amendment)* The scope, and `device` resolving to the system setting. |
| `index.html` | *(amendment)* The pre-paint script checks `/app`, its storage key now matches `theme.ts`, and the viewport meta sets `interactive-widget=resizes-visual`. |
| `src/features/auth/components/AuthCard.tsx` | *(amendment)* Top-aligned below `sm` — see the keyboard note. |
| `src/routes/routeTree.ts` | *(amendment)* Two branches: the public group and the workspace. |
| `src/app/pages/{Login,ResetPassword,ActivateAccount}Page.tsx` | *(amendment)* Search values arrive as props. |

## Dependencies

| Package | Why |
| --- | --- |
| `react-hook-form` | Mandated by `CLAUDE.md`; F01 deferred it to its first consumer. |
| `zod` | Same. v4 — `z.email()` is a top-level format, and `refine` takes `error`. |
| `@hookform/resolvers` | The bridge between them. |
| `framer-motion` | Mandated for non-trivial motion. Earned here by `AnimatePresence` — the alert's *exit* is what CSS alone cannot do. |

---

## Verification

`npm run typecheck`, `npm run lint`, `npm run build` — all clean (2 776
modules, 810 kB / 263 kB gzipped).

The contract was verified against the **running backend**, not assumed. Every
call shape in `auth-api.ts` and every error code translated in `errors.json` was
exercised:

| Check | Result |
| --- | --- |
| `POST /auth/login` | `200`; body keys exactly `accessToken, tokenType, expiresIn, user` — **no `refreshToken`** |
| its `Set-Cookie` | `refresh_token=…; Max-Age=604799; Path=/api/v1/auth; HttpOnly; SameSite=Lax` |
| CORS on login | `Access-Control-Allow-Credentials: true` for `http://localhost:5173` |
| `GET /auth/me` with Bearer | `200`, the account |
| `GET /auth/me` with nothing | `401 AUTH_UNAUTHENTICATED` — the boot request's expected first answer |
| `POST /auth/refresh`, no body, cookie only | `200`, new body, **rotated** `Set-Cookie` |
| replaying the **spent** cookie | `401 AUTH_REFRESH_TOKEN_REUSED` — the failure the single-flight lock prevents, observed |
| `POST /auth/logout`, no body | `200` |
| refresh after logout | `401 AUTH_REFRESH_TOKEN_INVALID` |
| refresh with no cookie at all | `401 AUTH_REFRESH_TOKEN_INVALID` |
| wrong password | `401 AUTH_INVALID_CREDENTIALS` |
| `forgot-password`, address that does not exist | `200` and the fixed message |
| the whole cookie flow **through the Vite dev proxy** | login → cookie stored `HttpOnly` for `/api/v1/auth` → cookie-only refresh → rotation |
| `withCredentials` in the production bundle | present |

### Verified in a real browser (added with the amendment)

Headless Chrome driven over the DevTools Protocol — no new dependency, since
Node 24 ships a WebSocket client and Chrome is installed. The harness lives in
the session scratchpad; it is not committed, and turning it into a test suite is
listed under *Future Improvements*.

| Check | Result |
| --- | --- |
| Guard, signed out, `/app` | → `/login` |
| Sign in through the actual form | → `/app`, header shows the address |
| The refresh cookie after login | `refresh_token`, `Path=/api/v1/auth`, `HttpOnly`, `SameSite=Lax`, persistent |
| **Full page load of `/app` while signed in** | `401 /auth/me` → `200 /auth/refresh` → `200 /auth/me`, then `/app` — the silent-refresh chain, observed request by request |
| Signed in, visiting `/login` | → `/app` |
| Sign out | → `/login`; the guard then answers `/app` with `/login?redirect=%2Fapp` |
| Authenticated header | language, light/dark, the address, sign-out — and no logo |
| Public header, all four screens, both OS schemes | logo only, one control (language), no theme control |
| Logo | `logo_light.png` under `prefers-color-scheme: light`, `logo_dark.png` under dark |
| Stored `dark` + system `light` on `/login` | stays light — the stored preference does not leak into the public area |
| Same session on `/app` | dark — the stored preference applies again |
| Opening either menu, 320/360/390/412 px wide | content moves **0.00 px**; the popup is portaled outside `#root` |
| **Focus a field, then tap the language button** (the reported bug) | before the fix: the card jumped **133 px**. After: **0 px** at 360 and 390 wide |
| Desktop after the fix | still centred — card 896 px wide at top 219 in a 1100×760 viewport, split illustration intact |

---

## Amendment — 2026-08-15: the header split, and one bug a browser found

Everything above stands. Three things changed after the feature was first
written, and the third was a genuine defect.

### 1. Two headers, because "equally relevant" was half right

The original `AppHeader` was shared by the public and authenticated areas, on
the argument that language and light/dark were "equally relevant on a login
screen and on a timesheet". The first half held; the second did not.

**A stored light/dark choice belongs to somebody, and on a login form there is
nobody yet.** Showing a visitor dark because the last person to use that browser
chose dark is a stranger's setting presented as their own. So:

| | Public — `PublicHeader` | Authenticated — `AppHeader` |
| --- | --- | --- |
| identity | the **logo** (`AppLogo`) | the app-name text link |
| language | yes | yes |
| light/dark | **none at all** | `ColorModeToggle` |
| account | — | address + `SignOutButton` |
| theme follows | the operating system | the person's `ColorMode` |

Language stays on the public header because it is not a theme: somebody who
cannot read the login form cannot sign in to change the setting that would let
them read it, which makes it the one control that has to exist before
authentication.

### 2. The split is expressed in the route tree, not in a conditional

The header could have branched on `isAuthenticated`. It does not, because the
distinction is not "is somebody signed in" but "which area is this" — and the
router already knows. A new **pathless layout route** (`publicRoute`,
`id: 'public'`, no `path`) holds the landing page and the four auth screens;
`workspaceRoute` holds the rest.

```
rootRoute                     RootLayout — the page column, no header
├── publicRoute (pathless)    PublicLayout    — PublicHeader + scope="device"
│   ├── landingRoute  "/"
│   ├── loginRoute    "/login"
│   ├── forgotPasswordRoute, resetPasswordRoute, activateAccountRoute
└── workspaceRoute   "/app"   WorkspaceLayout — AppHeader + scope="account", the guard
```

Two rules now follow from one fact. Whether a screen is guarded, and whose
light/dark preference it honours, are both decided by which branch it hangs
off — so putting a new screen in the right place gets both right, and there is
no third place to put one. URLs are unchanged: a pathless route contributes no
segment.

**One consequence worth knowing.** A pathless parent changes the route *ids* —
`/login` is still the URL, but the id is `/public/login`. `useSearch({ from })`
takes an id, so the pages would have had to name `/public/login`, which reads
as a bug in a file that renders a form. Instead the **routes read their own
search parameters and pass them down as props**: `LoginPage` takes `redirectTo`,
the two token pages take `token`. The pages no longer import the router's search
API at all, which is where that coupling belonged anyway.

### 3. Public screens follow the device — scoped in two places, by one rule

`ThemeProvider` gained a `ColorModeScope`:

| Scope | Declared by | Effect |
| --- | --- | --- |
| `device` | `PublicLayout` | the OS setting, whatever is stored |
| `account` | `WorkspaceLayout` | the person's `ColorMode` (which may itself be `system`) |

The `device` scope **does not reset, override or write** the stored choice — it
leaves it unread. A public screen is a gap in the preference's application, not
an edit to it, and it comes back the moment an authenticated screen declares
`account`.

`<ColorModeScope>` is a component rendered by each layout rather than a prop on
the provider, because the provider sits above the router (it has to — it themes
the boot spinner) and cannot read the current route. It has no cleanup on
purpose: exactly one layout is mounted at a time and each declares its own
scope, and React runs the outgoing tree's cleanups before the incoming tree's
setups, so the last declaration always describes what is visible.

**The pre-paint script in `index.html` needed the same rule**, or the login
screen would flash the previous user's dark mode before React corrected it —
the exact flash that script exists to prevent. It now checks `/app` before
reading storage. That is a second constant duplicated into the script, and it is
documented in `theme.ts` beside the first.

While doing this: **the script and `theme.ts` disagreed about the storage key**
(`timesheet.color-mode` versus `crm-timesheet.color-mode`), so the pre-paint
step had been reading a key nothing writes. It fails silently in the direction
that hides it — falling back to `system` looks correct to anybody whose device
is already set the way they chose, and is wrong only for the person the script
exists for. Now aligned, with a note saying they must match.

### The logo switches without JavaScript

`AppLogo` is a `<picture>` with `<source media="(prefers-color-scheme: dark)">`.
The browser's preload scanner resolves it, so **only the matching file is
fetched** — these are 400 kB and 500 kB — and the swap on an OS theme change is
native: no re-render, no flash, and correct before React has run. Two `<img>`s
toggled by a `dark:` class would download both; a `src` chosen in React would
show the wrong one until hydration.

It keys on the media query rather than the `dark` class deliberately. In the
`device` scope the two agree by construction; the media query says *why* they
agree and stays correct anywhere.

### 4. A rate-limited refresh must not sign anybody out

Driving a real browser turned up a defect in the original implementation.

`performRefresh` caught every error and called `endSession()`. That is right for
a `401` — the token is gone, revoked, or the account is deactivated, and the
backend has already cleared the cookie — and **wrong for everything else**. A
`429` from the strict tier, a `500` during a deployment, or a Wi-Fi handover
would destroy a session whose refresh token was still perfectly valid and still
sitting in the cookie jar. Backend Feature 040 makes exactly this distinction
for its own cookie-clearing and gives the reason: "signing somebody out because
their refresh landed during an incident turns a blip into a support ticket."

It now ends the session only on a `401`. Anything else fails the one request
that triggered it and leaves the session standing for the next one to retry.

This was not hypothetical. It reproduced on the first attempt, because the
strict tier is ten attempts per five minutes and ordinary testing had spent
them — see *The boot probe* below, which is the same budget being consumed by
every anonymous page load.

---

## Notes

### The boot probe costs two requests when nobody is signed in — and it bites

An anonymous page load is `GET /auth/me` → `401` → `POST /auth/refresh` → `401`.
The second is on the backend's strict tier (10 attempts per 5 minutes), so ten
page loads inside five minutes exhaust that bucket.

**This stopped being theoretical during browser testing.** A signed-in reload
answered `429` on its refresh and the session was lost — which is how the
`isSessionOver` bug above was found, and the bug is now fixed. But the waste
that produced the `429` is still there, and it is the strongest argument for the
cheaper hydration shape listed below: `POST /auth/refresh` already returns the
user, so one request could do the work of two, and something as ordinary as
reloading a page while developing should not spend a security budget.

Login has its own bucket, so signing in always works regardless.

The brief specified `GET /auth/me` as the hydration call and this follows it.
The cheaper shape is noted rather than substituted.

### "The menu pushes the form down" — it was the keyboard, and the menu was innocent

**The dropdown was never the cause.** It is properly portaled, and it was
measured not moving anything across 30+ combinations — widths 320–768, both
menus, synthetic clicks *and* real touch taps, scrolling and non-scrolling
viewports, opening and selecting. Zero pixels every time.

The measurements were right and the conclusion drawn from them was wrong,
because the instrumentation clicked the button **without ever focusing a field**
— and the field is the whole mechanism.

The card was vertically centred: `justify-center` inside a `flex-1` main, in a
`min-h-dvh` column. That places it at `(available height − card height) / 2`,
which makes **its position a function of the viewport height** — and on a phone
that height is not a constant. The on-screen keyboard takes a third of it away
when a field is focused and gives it back when the field is blurred.

So the sequence somebody actually performs:

1. Tap the email field → keyboard opens → usable height drops ~225px → the card
   **rises** by half of that.
2. Tap the language button in the header → the field blurs → keyboard closes →
   the height returns → the card **drops back**, and the menu is now open.

The card visibly falls at the moment the menu appears, which is exactly what was
reported. Reproduced by driving the viewport height alone, no menu involved: at
390px wide, a 700px height puts the card top at **205** and a 420px height puts
it at **72** — the same ~133px jump.

**The fix is to stop making the position depend on the height.** Below `sm`,
`AuthCard` aligns to the top instead of centring, which also puts the fields
where a keyboard is less likely to cover them; from `sm` up, where no soft
keyboard eats the viewport, the centred design is kept. Measured after: the
whole sequence — focus, keyboard, tap the menu, keyboard dismisses — moves the
card **0px** at 360 and 390 wide, while desktop stays centred and the split card
is untouched.

`index.html` also gained `interactive-widget=resizes-visual` on the viewport
meta, which is the standardised way to tell a browser that the keyboard should
overlay the page rather than resize the layout viewport. That fixes the root
cause everywhere it is honoured — including the authenticated screens, which
have the same centring problem waiting for them — and the top alignment holds
the line where it is not.

**The lesson worth keeping**: an instrument that reproduces none of the user's
steps proves nothing about the user's bug. Nothing was wrong with the dropdown,
and three rounds of measuring it more carefully would never have found this.

### `useEffect` for hydration, and why it is not the rule being broken

`CLAUDE.md` routes server data through TanStack Query rather than effects, and
`AuthGate` uses an effect. The session is not screen data: it is written by an
axios interceptor, read by a router guard, and needed before any component that
could own a query exists. No query hook can be all three of those things. The
memoised promise makes it a single request regardless of how many times the
effect runs.

### `to` and `href` are different overloads

Navigating to a sanitised `?redirect=` string uses `navigate({ href })`, because
`to` is typed against the route tree and an arbitrary path is not a member of
it. A single call with a conditional argument does not type-check — the router
infers a destination from the union that fits neither branch — so `LoginPage`
has two calls and a comment saying why.

---

## Future Improvements

1. **Keep the browser checks.** Done once, by hand, over the DevTools Protocol —
   and it found a real bug the day it was written. The harness was a scratch
   file; as a committed Playwright suite it would be the regression net for the
   whole of this feature. The one case still unverified is an access token
   expiring naturally mid-session and producing exactly one refresh, which needs
   either a fifteen-minute wait or a shortened `JWT_ACCESS_TTL`.
2. **Regenerate the API types in CI and fail on a diff.** F01 listed this
   second; this feature is the evidence. The contract drifted for a whole
   backend feature and nothing noticed until somebody wrote against it.
3. **Skip the boot probe when there is nothing to probe.** `POST /auth/refresh`
   returns the user, so hydration could be *one* request instead of two — or
   could be skipped entirely, given a non-credential hint that a session was
   ever established. Both are cheaper than the current shape; neither is
   necessary.
4. **A request timeout.** The axios instance has none, so a hung boot request
   leaves `AuthGate` on its spinner indefinitely. A timeout would turn that into
   the anonymous case, which is at least a screen with a form on it.
5. **A CSRF token, if a deployment ever sets `SameSite=None`.** Backend Feature
   040 records the reasoning in full and names this as the single case that
   changes the answer. It is inherited here because a split-domain frontend is
   this side's decision to make.
6. **Proactive refresh.** `expiresIn` is on every session response and nothing
   reads it. Refreshing shortly before expiry rather than in response to a `401`
   would remove the failed request that currently precedes every renewal.
   `refreshSession` is already the one place that would schedule it.
7. **An account menu.** `SignOutButton` is the action without the container; the
   avatar, the profile link and the preferences belong with the layout feature
   (F04) and the profile feature that owns them.
8. **Show a password's strength while it is being chosen.** The backend
   deliberately has no composition rules, following NIST; a strength meter is
   the guidance that replaces them, and it belongs on `SetPasswordForm` where
   both flows would get it at once.
