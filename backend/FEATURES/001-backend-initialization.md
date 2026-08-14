# Feature 001 — Backend Initialization

**Status:** Completed
**Date:** 2026-08-01

## Goal

Initialize the NestJS backend inside `backend/` with a clean, minimal and
production-ready structure, exposing a root endpoint and a dedicated health
check endpoint that Docker, monitoring systems and deployment environments can
later rely on.

## Requirements

- Latest stable NestJS (v11) — verified against the npm registry at implementation time.
- TypeScript only.
- Clean structure suitable for future development.
- No authentication.
- No Prisma wiring.
- No business modules.
- No database models.
- Minimal and production-ready.

## Backend

### Structure

```text
backend/
├── src/
│   ├── main.ts                            # Bootstrap: global pipes, port, logging
│   ├── app.module.ts                      # Root module
│   ├── app.controller.ts                  # GET /
│   ├── app.controller.spec.ts
│   ├── app.service.ts
│   ├── dto/
│   │   └── greeting-response.dto.ts
│   └── health/
│       ├── health.module.ts
│       ├── health.controller.ts           # GET /health
│       ├── health.controller.spec.ts
│       ├── health.service.ts
│       └── dto/
│           └── health-response.dto.ts
├── test/
│   ├── app.e2e-spec.ts
│   └── jest-e2e.json
├── prisma/
│   └── schema.prisma                      # Pre-existing, untouched by this feature
├── nest-cli.json
├── package.json
├── package-lock.json
├── tsconfig.json
├── tsconfig.build.json
└── .prettierrc
```

### Modules

| Module | Responsibility |
| --- | --- |
| `AppModule` | Root module. Registers `ConfigModule` globally, imports `HealthModule`. |
| `HealthModule` | Self-contained health check. Isolated so it stays independently testable and can grow dependency probes without touching the root module. |

### Key implementation decisions

**The Nest CLI was not used to scaffold the project.** `backend/` already
contained `prisma/schema.prisma`, and `nest new` refuses a non-empty target
directory. Scaffolding elsewhere and merging would have risked overwriting the
Prisma folder, so the equivalent files were written directly.

**Configuration is read from environment variables.** `ConfigModule` is
registered with `isGlobal: true` and `envFilePath: ['.env', '../.env']`, so a
local `backend/.env` wins for machine-specific overrides while the shared
project-root `.env` is the default source. `main.ts` reads `PORT` and falls
back to a named `DEFAULT_PORT` constant — no hardcoded port literal.

**A global `ValidationPipe` is registered up front** with `whitelist`,
`forbidNonWhitelisted` and `transform` enabled. No DTO requires validation
yet, but registering it now means every future module is validated by default
rather than relying on each controller to opt in, which satisfies the
"validate every request" rule without per-endpoint wiring.

**Health logic lives in `HealthService`, not the controller.** The controller
only delegates. Future dependency checks (database, cache, queues) are added
inside the service, so the endpoint's public contract never has to change.

**TypeScript is stricter than the Nest default.** `strict`,
`noImplicitOverride`, `noUnusedLocals` and `noUnusedParameters` are enabled to
enforce the project's "no unused variables / production-ready" rules at compile
time.

**TypeScript stays on 5.x although 7.0.2 is published.** `ts-jest` declares
`typescript >=4.3 <7`, so installing TypeScript 7 would break the test suite.
Resolved version: 5.9.3.

**No linter.** ESLint was removed at the user's request. Code quality is
enforced by the TypeScript compiler alone — `strict` plus `noUnusedLocals` /
`noUnusedParameters` catch unused variables and unsound code at build time,
which covers a large part of what the ESLint setup was doing. Prettier is
retained for formatting (`npm run format`), independent of any linter.

**No `backend/.gitignore`.** The root `.gitignore` already matches
`node_modules/`, `dist/` and `coverage/` at any depth; a second file would
duplicate those rules.

### Verification

| Check | Command | Result |
| --- | --- | --- |
| Type errors | `npm run typecheck` | Pass — no errors |
| Build | `npm run build` | Pass |
| Unit tests | `npm test` | Pass — 2/2 |
| E2E tests | `npm run test:e2e` | Pass — 2/2, both endpoints verified over HTTP |
| Vulnerabilities | `npm install` audit | 0 found |

Resolved versions: `@nestjs/core@11.1.28`, `@nestjs/config@4.0.4`,
`typescript@5.9.3`.

## Frontend

No changes. The `frontend/` directory remains empty.

## Database

No functional changes.

Prisma was explicitly out of scope: no Prisma package is installed, no
`PrismaModule` exists, nothing imports the schema, and no migrations were
created or run.

One editor-only correction was made to `backend/prisma/schema.prisma`. The
Prisma VS Code extension bundles Prisma 7, which reports
`url` inside a `datasource` block as unsupported. The line was removed so the
placeholder schema is valid Prisma 7:

```prisma
datasource db {
  provider = "postgresql"
}
```

This changes no behaviour — nothing reads the schema yet. The full Prisma 7
setup is deferred to the feature that introduces Prisma, and requires:

- `prisma.config.ts` with `datasource: { url: env('DATABASE_URL') }` for Migrate;
- the `@prisma/adapter-pg` driver adapter passed to the `PrismaClient`
  constructor, since v7 requires an adapter for a direct database connection.

`DATABASE_URL` remains the source of the connection string in both cases, so
`.env.example` needs no change.

## API

| Method | Path | Response | Status |
| --- | --- | --- | --- |
| `GET` | `/` | `{ "message": "Hello from the backend" }` | 200 |
| `GET` | `/health` | `{ "status": "ok", "service": "backend" }` | 200 |

No global route prefix and no versioning were applied, so the paths are exactly
as specified. `GET /health` is the designated probe endpoint for Docker
healthchecks, monitoring and deployment readiness checks; its response shape
should be treated as a public contract and kept backwards compatible.

### Environment variables

No new variables were introduced. The backend consumes existing entries already
present in `.env.example`:

| Variable | Purpose | Default |
| --- | --- | --- |
| `PORT` | HTTP port the backend binds to | `3000` |
| `NODE_ENV` | Runtime environment | `development` |

## Files Created

**Application code**

- `backend/src/main.ts`
- `backend/src/app.module.ts`
- `backend/src/app.controller.ts`
- `backend/src/app.service.ts`
- `backend/src/dto/greeting-response.dto.ts`
- `backend/src/health/health.module.ts`
- `backend/src/health/health.controller.ts`
- `backend/src/health/health.service.ts`
- `backend/src/health/dto/health-response.dto.ts`

**Tests**

- `backend/src/app.controller.spec.ts`
- `backend/src/health/health.controller.spec.ts`
- `backend/test/app.e2e-spec.ts`
- `backend/test/jest-e2e.json`

**Configuration**

- `backend/package.json`
- `backend/package-lock.json`
- `backend/tsconfig.json`
- `backend/tsconfig.build.json`
- `backend/nest-cli.json`
- `backend/.prettierrc`

**Documentation**

- `FEATURES/001-backend-initialization.md`

## Files Modified

- `backend/prisma/schema.prisma` — removed the unsupported `datasource.url`
  property for Prisma 7 validity (editor-only fix, see Database).
- `FEATURES/HISTORY.md` — added the row for feature 001.
- `FEATURES/README.md` — documented the feature workflow and added the feature
  index (the file was empty).

The root `README.md` was intentionally left unchanged. Backend and frontend
implementation details belong in `FEATURES/`, not in the project-level README.

Note that the root `README.md` still documents a Prisma workflow
(`npx prisma init`, `npx prisma migrate dev`) and includes those commands in
its "Running the app locally" section. Prisma is not installed, so those
commands do not work yet. This is pre-existing forward-looking documentation
and is expected to become accurate when Prisma is introduced.

## Notes

`npm install` reported 0 vulnerabilities. It emitted deprecation warnings for
`inflight@1.0.6` and `glob@7.2.3`, both transitive dependencies of the Jest 29
toolchain rather than direct dependencies. They are not actionable from this
project's `package.json` and resolve when the toolchain moves to Jest 30.

The e2e suite boots the full `AppModule` and issues real HTTP requests, so both
endpoints are verified end to end. It does not exercise `main.ts` — the global
pipe registration, port resolution and bootstrap logging are only executed on a
real `npm run start:dev`.

## Future Improvements

Deliberately excluded to keep this feature minimal; each is a candidate for its
own feature document:

- **CORS** — required before the Vite frontend can call the API. Needs a
  configurable allowed-origin environment variable rather than a hardcoded one.
- **Swagger / OpenAPI** — `@nestjs/swagger` for generated API documentation.
- **API versioning and a global `/api` prefix** — worth adding before the first
  business module, while there are no external consumers to break.
- **Prisma integration** — a `PrismaModule` exposing a lifecycle-aware
  `PrismaService`, plus the first migration. Prisma 7 additionally requires
  `prisma.config.ts` and the `@prisma/adapter-pg` driver adapter (see Database).
  The root `README.md`'s Prisma section documents the older v6 workflow and will
  need revising at that point.
- **Structured logging** — a centralized logger (e.g. `nestjs-pino`) with
  request IDs, replacing the default Nest logger.
- **Global exception filter** — a consistent error response shape across
  all endpoints.
- **Deeper health checks** — `@nestjs/terminus` with a database probe, and a
  `HEALTHCHECK` directive in the eventual `backend/Dockerfile` pointing at
  `GET /health`.
- **Config validation** — schema validation of environment variables at
  startup so a misconfigured deployment fails fast instead of at first use.
