# Feature 004 — API Foundation & Global Application Configuration

**Status:** Completed
**Date:** 2026-08-01

## Goal

Fix the public shape of the REST API *before* authentication and the business
modules exist, so no endpoint ever has to be moved afterwards:

- every route served under `/api/v1`
- CORS enabled globally and configured entirely from the environment
- the environment itself validated at startup, so a missing or malformed
  variable stops the process instead of degrading silently
- the global `ValidationPipe` and graceful shutdown from
  [Feature 001](001-backend-initialization.md) and
  [Feature 003](003-prisma-orm-setup.md) preserved

Infrastructure only. No new endpoint, no database change, no business logic.

## Requirements

- Global API prefix `/api/v1`, applied automatically to every future endpoint.
- CORS enabled globally, allowed origins read from environment variables, with
  no code change required to configure production.
- `ValidationPipe` kept global with `whitelist`, `forbidNonWhitelisted` and
  `transform`.
- `app.enableShutdownHooks()` kept, so `PrismaService` still disconnects.
- `main.ts` kept small, with no duplicated configuration.
- New environment variables documented in `.env.example`.
- Environment variables validated at boot, with defaults declared once.

## Backend

### Structure added

```text
backend/src/
└── config/                     # (NEW)
    ├── api.constants.ts        # prefix, version prefix, default version, base path
    ├── app.setup.ts            # configureApp(): every global concern
    ├── cors.config.ts          # buildCorsOptions(): CORS from the environment
    ├── cors.config.spec.ts     # unit tests
    ├── env.validation.ts       # environment contract, validated at boot
    └── env.validation.spec.ts  # unit tests
```

### `configureApp(app)`

All global wiring moved out of `main.ts` into a single
`configureApp(app: INestApplication)` in [app.setup.ts](../backend/src/config/app.setup.ts).
It applies, in order: global prefix → URI versioning → `ValidationPipe` →
CORS → shutdown hooks.

The reason it is a function and not four calls inside `bootstrap()` is the
test suite. `main.ts` is never imported by Jest, so anything configured there
is invisible to the e2e tests — they used to exercise an application with no
prefix, no versioning and no pipes, which is exactly the configuration that
will never run in production. The e2e suite now calls the same function, so
prefix, versioning, validation and CORS cannot drift between the two.

`main.ts` keeps only what is genuinely bootstrap-specific: creating the app,
reading `PORT`, listening, and the startup log line.

### Environment validation

[env.validation.ts](../backend/src/config/env.validation.ts) declares the
backend's environment contract as a class and wires `validateEnvironment` into
`ConfigModule.forRoot({ validate })`. It uses `class-validator` and
`class-transformer`, both already present for the DTO layer — no new
dependency, and one validation vocabulary across the project.

| Variable | Rule | Default |
| --- | --- | --- |
| `NODE_ENV` | one of `development`, `test`, `production` | `development` |
| `PORT` | integer, 1–65535 | `3000` |
| `DATABASE_URL` | required, non-empty, `postgres://` or `postgresql://` | — (mandatory) |
| `CORS_ORIGINS` | optional; every entry an origin or `*` | empty → no origin allowed |

Three consequences worth recording:

1. **Failures are loud.** `main.ts` previously read
   `Number(configService.get('PORT')) || DEFAULT_PORT`, which swallowed a
   malformed value: `PORT=abc` started the server on 3000 while the operator
   believed otherwise. Startup now aborts with exit code 1 and the message
   `Invalid environment configuration: - PORT must be an integer number`.
2. **Defaults are declared once.** They are the class property initialisers, so
   `DEFAULT_PORT` moved out of `main.ts` and no call site repeats a fallback.
   `main.ts` reads `getOrThrow<number>('PORT')` — the value is guaranteed to
   exist and is already a `number`, because `@nestjs/config` consults the
   object returned by `validate` before falling back to `process.env`.
3. **Error messages never contain values.** `formatErrors` renders only the
   constraint messages; `ValidationError.toString()` would embed the rejected
   value, which for `DATABASE_URL` means printing the database password into
   the startup logs. A unit test asserts the password does not appear.

The origin format check reuses `parseOrigins` from `cors.config.ts` rather than
re-implementing the split, so validation accepts exactly the entries the CORS
layer will later allow.

Note that this is a *different* concern from the global `ValidationPipe`: that
one validates incoming HTTP requests at runtime, this one validates the
process's own configuration, once, before the first request exists.

### Preserved behaviour

- The `ValidationPipe` options are unchanged (`whitelist`,
  `forbidNonWhitelisted`, `transform`), only relocated.
- `app.enableShutdownHooks()` is unchanged and still the last step, so
  `PrismaService.onModuleDestroy()` continues to close the connection pool on
  `SIGINT`/`SIGTERM`. See [Feature 003](003-prisma-orm-setup.md).

## API

### Prefix and versioning strategy

| Concern | Choice |
| --- | --- |
| Prefix | `app.setGlobalPrefix('api')` |
| Versioning | `VersioningType.URI`, `prefix: 'v'`, `defaultVersion: '1'` |
| Result | `/api/v1/...` |

The prefix and the version are configured **separately** rather than as one
`setGlobalPrefix('api/v1')` string. A single hardcoded string would make the
version part of the prefix, and every controller would have to be rewritten
the day a second version appears. With Nest's native URI versioning:

- a controller that declares nothing is served on the default version, `v1`;
- a controller that needs to change its contract declares
  `@Controller({ version: '2' })` and is served on `/api/v2/...` while
  everything else keeps answering on `/api/v1/...`;
- both versions can be served side by side from the same process.

Version is carried in the URI (rather than a header or media type) because it
stays visible in logs, browser address bars and `curl` commands, and it is what
the frontend can hardcode in a single base-URL constant.

The segments live in [api.constants.ts](../backend/src/config/api.constants.ts)
(`API_PREFIX`, `API_VERSION_PREFIX`, `API_DEFAULT_VERSION`, and the derived
`API_BASE_PATH = '/api/v1'`). Bootstrap's log line and the e2e tests build
their paths from those constants, so the base path is defined once.

### Endpoints after this feature

| Before | After |
| --- | --- |
| `GET /` | `GET /api/v1` |
| `GET /health` | `GET /api/v1/health` |

Both responses are unchanged. Unprefixed paths now return `404`.

### CORS

Implemented in [cors.config.ts](../backend/src/config/cors.config.ts) as
`buildCorsOptions(configService)`, called from `configureApp`.

**Approach.** The allowlist comes from a single environment variable,
`CORS_ORIGINS`, holding a comma-separated list of origins. Nothing about any
environment is compiled into the application: local development, staging and
production differ only in the value of that variable, so adding a production
domain is a deployment change, not a release.

The value is parsed into an array (entries trimmed, empty entries dropped) and
handed to Nest as `origin`, which matches each request's `Origin` header
against the list exactly.

| `CORS_ORIGINS` | `origin` | `credentials` | Effect |
| --- | --- | --- | --- |
| `http://localhost:5173` | `['http://localhost:5173']` | `true` | Only that origin is allowed |
| `http://a.com,https://b.com` | both, exact match | `true` | Either origin is allowed |
| `*` | `true` (reflects the caller) | `false` | Any origin is allowed |
| unset / empty | `[]` | `true` | No browser origin is allowed; a warning is logged at startup |

Two decisions worth recording:

1. **Missing configuration fails closed.** An unset variable allows no browser
   origin instead of falling back to "allow everything". A forgotten variable
   in production then shows up as a blocked frontend — visible, fixable in
   configuration — rather than as an API silently readable from any website.
   A warning is logged at startup so the cause is obvious. Non-browser clients
   (`curl`, Postman, server-to-server calls) send no `Origin` header, so they
   are never affected by any of this.
2. **`*` and credentials are mutually exclusive.** Browsers reject a
   credentialed response whose `Access-Control-Allow-Origin` is `*`, so
   `credentials` is enabled only for an explicit allowlist. This matters for
   the authentication feature: cookie- or `Authorization`-based calls from the
   frontend require the origin to be listed explicitly.

Methods and headers are left at Nest's defaults; there is nothing yet that
would justify narrowing them.

## Database

No change. `schema.prisma` is untouched and no migration is required.

## Frontend

No change. The frontend directory is still empty; when it is created its API
base URL must point at `http://localhost:3000/api/v1`, and its origin
(`http://localhost:5173` for the Vite dev server) must be listed in
`CORS_ORIGINS`.

## Environment

One new variable, added to `.env.example`:

| Variable | Required | Default | Purpose |
| --- | --- | --- | --- |
| `CORS_ORIGINS` | No | empty → no origin allowed | Comma-separated list of browser origins allowed to call the API. `*` allows any origin and disables credentials. |

Format rules: scheme + host + port, matched exactly — `http://localhost:5173`,
not `localhost:5173`, and no trailing slash or path. The value is validated at
startup, so a typo is reported instead of silently blocking the frontend.

Both `.env.example` and the local `.env` were set to
`CORS_ORIGINS=http://localhost:5173` (the Vite dev server default), the `.env`
edit with explicit approval.

No variable was added for the API prefix or version. They are part of the
application's public contract, identical in every environment, and a
deployment that could change them would only make the frontend and backend
disagree about where the API lives.

## Testing

`backend/src/config/cors.config.spec.ts` (unit) covers the allowlist, whitespace
trimming, the `*` case and the fail-closed default.

`backend/src/config/env.validation.spec.ts` (unit) covers `PORT` coercion and
range, the applied defaults, the `NODE_ENV` enum, the `DATABASE_URL` rules,
accepted and rejected `CORS_ORIGINS` values, and the absence of secrets in
error messages.

`backend/test/app.e2e-spec.ts` was updated to call `configureApp` and now
asserts:

- `GET /api/v1` returns the greeting
- `GET /api/v1/health` returns `{ status: 'ok', service: 'backend' }`
- `GET /health` (unprefixed) returns `404`
- an allowed origin receives `Access-Control-Allow-Origin` and
  `Access-Control-Allow-Credentials`
- an origin outside the allowlist receives no `Access-Control-Allow-Origin`

Results: `npm run typecheck` clean, `npm test` 24 passed, `npm run test:e2e`
5 passed, `npm run build` clean. The fail-fast path was also checked against
the built application: `PORT=abc node dist/main.js` exits with code 1 and
prints the constraint violations without starting the server.

## Files Created

| File | Purpose |
| --- | --- |
| `backend/src/config/api.constants.ts` | Prefix, version prefix, default version, derived base path |
| `backend/src/config/app.setup.ts` | `configureApp()` — all global application configuration |
| `backend/src/config/cors.config.ts` | `buildCorsOptions()` — CORS options from the environment |
| `backend/src/config/cors.config.spec.ts` | Unit tests for the CORS configuration |
| `backend/src/config/env.validation.ts` | Environment contract, defaults and boot-time validation |
| `backend/src/config/env.validation.spec.ts` | Unit tests for the environment validation |
| `FEATURES/004-api-foundation-global-configuration.md` | This document |

## Files Modified

| File | Change |
| --- | --- |
| `backend/src/main.ts` | Global configuration extracted to `configureApp()`; `PORT` read via `getOrThrow`, `DEFAULT_PORT` moved to the environment contract; startup log now prints the API base path |
| `backend/src/app.module.ts` | `ConfigModule.forRoot({ validate: validateEnvironment })` |
| `backend/test/app.e2e-spec.ts` | Uses `configureApp()`, prefixed paths and CORS assertions |
| `.env.example` | Documents `CORS_ORIGINS` |
| `.env` | `CORS_ORIGINS` set to the Vite dev server origin (approved) |
| `FEATURES/HISTORY.md` | Feature 004 row |
| `FEATURES/README.md` | Feature 004 row |

## Notes

- Health checks are deliberately versioned like everything else
  (`/api/v1/health`) instead of being excluded from the prefix. Container
  orchestrators and uptime probes are configured with a URL, so there is no
  benefit to a second routing rule, and an unversioned route would be the one
  route that cannot evolve.
- Nothing about this feature touches Prisma, so the pending migration state
  described in [Feature 003](003-prisma-orm-setup.md) is unchanged.

## Future Improvements

- Every future environment variable must be added to `EnvironmentVariables`,
  not only to `.env.example`, or it escapes validation.
- Add a global exception filter and a response interceptor for the consistent
  error/response envelope the API rules ask for; both belong next to
  `configureApp` when they arrive.
- Add OpenAPI/Swagger under `/api/docs` once endpoints with DTOs exist.
- Consider `@nestjs/throttler` rate limiting before exposing authentication.
