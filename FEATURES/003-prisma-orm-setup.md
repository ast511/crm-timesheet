# Feature 003 — Prisma ORM Setup

**Status:** Completed — the initial migration has since been applied (see Notes)
**Date:** 2026-08-01

## Goal

Give the NestJS backend a working database layer: Prisma ORM installed and
configured against the PostgreSQL container from
[Feature 002](002-docker-postgresql-setup.md), a lifecycle-aware
`PrismaService` any future module can inject, and the initial migration that
creates the existing `User` model in the database.

Infrastructure only. No business module consumes Prisma yet — no authentication,
no users CRUD, no roles, no permissions.

## Requirements

- Latest stable Prisma, configured the way the current version expects.
- Connection string from an environment variable; never hardcoded.
- Prisma Client generation, regenerated automatically when the schema changes.
- `backend/src/prisma/` containing `prisma.module.ts` and `prisma.service.ts`.
- `PrismaService` extends `PrismaClient`, connects on startup, disconnects
  gracefully on shutdown, reusable across all future modules.
- The existing `User` model and `UserRole` enum preserved.
- An initial migration named `init`, created but not executed automatically.
- The backend starts successfully with Prisma wired in.

## Version

Prisma **7.9.1** — the latest stable release on the npm registry at
implementation time, for `prisma`, `@prisma/client` and `@prisma/adapter-pg`
alike (they are versioned in lockstep).

Compatibility was checked before committing to it:

| Constraint | Requirement | This project | OK |
| --- | --- | --- | --- |
| `prisma` / `@prisma/client` engines | `^20.19 \|\| ^22.12 \|\| >=24.0` | Node 24.13.0 | Yes |
| `@prisma/client` peer `typescript` | `>=5.4.0` | 5.9.3 | Yes |
| `@prisma/adapter-pg` | bundles `pg@^8.16.3` | — | No separate `pg` install |

## Prisma 7 in one paragraph

Prisma 7 is a different shape from the v6 setup most tutorials (and this
repository's own `README.md`) described. Three changes drive nearly every
decision below:

1. **There is no built-in database driver.** The Rust query engine is gone;
   the client talks to PostgreSQL through a *driver adapter*
   (`@prisma/adapter-pg`, a thin wrapper over `node-postgres`) that the
   application constructs and hands to `PrismaClient`.
2. **The generated client no longer lives in `node_modules`.** The
   `prisma-client-js` generator is deprecated in favour of `prisma-client`,
   which emits plain TypeScript into a directory you name. `output` is
   mandatory.
3. **The CLI is configured by `prisma.config.ts`, and it no longer loads
   `.env` by itself.** Connection details for Migrate and Studio come from that
   file, not from `datasource.url` in the schema.

Feature 001 already anticipated points 1 and 3 when it removed the unsupported
`datasource.url` line from the schema.

## Backend

### Structure added

```text
backend/
├── prisma.config.ts                  # Prisma CLI configuration (NEW)
├── prisma/
│   ├── schema.prisma                 # generator block updated
│   └── migrations/                   # created by `prisma migrate dev`
└── src/
    ├── generated/prisma/             # generated client — gitignored
    └── prisma/                       # (NEW)
        ├── prisma.module.ts
        ├── prisma.service.ts
        └── prisma.service.spec.ts
```

### `PrismaService`

Extends `PrismaClient` and implements `OnModuleInit` / `OnModuleDestroy`.

Extending rather than wrapping means every model delegate (`prisma.user`, and
each model added later) is available on the injected service without a
hand-written pass-through per model — the wrapper would be pure duplication and
would need editing on every schema change.

```ts
constructor(configService: ConfigService) {
  const connectionString = configService.getOrThrow<string>('DATABASE_URL');
  super({ adapter: new PrismaPg({ connectionString }) });
}
```

`getOrThrow` rather than `get`: a missing `DATABASE_URL` should abort the
bootstrap with a named error, not resolve to `undefined` and fail later inside
the driver with a less obvious message.

`$connect()` in `onModuleInit` initialises the client — but, contrary to what
the pre-v7 recipes imply, it does **not** verify that the database is
reachable. This was measured rather than assumed:

```text
$connect() RESOLVED against an unreachable database
first query THREW: PrismaClientKnownRequestError
```

With a driver adapter the underlying `pg` pool is lazy, so `$connect()`
resolves against a database that does not exist and connectivity errors surface
at the first query. The log line is therefore `Prisma Client initialised`, not
`Connected to the database`, which would have been false.

The practical consequence: **the application boots successfully with the
database down.** If a hard fail-fast is wanted instead, `onModuleInit` can run
a trivial probe:

```ts
await this.$queryRaw`SELECT 1`;
```

That is a deliberate trade — it also makes the e2e suite (which boots the whole
`AppModule`) require a live database, where today it passes without one. Left
out here because reachability belongs in the health check, which is listed
under Future Improvements.

`onModuleDestroy` calls `$disconnect()`, which does genuinely close the pool.

### Graceful shutdown

`onModuleDestroy` only runs on a signal-triggered exit if Nest is listening for
signals, which it does not do by default. `main.ts` therefore now calls:

```ts
app.enableShutdownHooks();
```

Without it, Ctrl+C during development and the `SIGTERM` a container runtime
sends on `docker stop` would both kill the process with the pool still open.

The older `this.$on('beforeExit', ...)` recipe found in pre-v5 Prisma/NestJS
guides is deliberately not used: that event is not emitted by the current
client, and Nest's own shutdown hooks are the correct mechanism.

### `PrismaModule`

Marked `@Global()` and exporting `PrismaService`.

This mirrors the precedent already set in `app.module.ts`, where `ConfigModule`
is registered with `isGlobal: true`: both are cross-cutting infrastructure with
exactly one instance and no domain meaning. The alternative — a plain module
imported by every feature module — is more explicit about the dependency graph,
and switching to it later is a one-line change (`@Global()` removed, then
`imports: [PrismaModule]` in each consumer). Flagged here rather than decided
silently.

### Tests

`prisma.service.spec.ts` covers the three things this class actually does:
reads `DATABASE_URL` from `ConfigService`, calls `$connect` on module init,
calls `$disconnect` on module destroy. `ConfigService` is stubbed and both
lifecycle methods are spied on, so the suite needs no database — the driver
adapter builds its connection pool lazily and is never asked to dial.

## Configuration

### `backend/prisma.config.ts`

```ts
loadEnv({ path: ['.env', '../.env'], quiet: true });

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: { path: 'prisma/migrations' },
  datasource: { url: env('DATABASE_URL') },
});
```

Prisma 7 stopped loading `.env` automatically, and this project deliberately
keeps one `.env` at the repository root rather than a second copy under
`backend/`. The explicit `dotenv` call resolves that: the lookup order is the
same `['.env', '../.env']` used by `ConfigModule` in `app.module.ts`, so a
machine-local `backend/.env` wins and the shared root file is the default.
dotenv does not overwrite variables that are already set, so the first file
defining a key is the one that applies.

Paths are relative to `backend/`, which is where the npm scripts that invoke
the Prisma CLI run.

`dotenv` is added as an explicit devDependency. It was already present as a
transitive dependency of `@nestjs/config`, but a file that imports it directly
should declare it.

### Where the connection string is read

`DATABASE_URL` is the single source, consumed in two independent places:

| Consumer | Path | Purpose |
| --- | --- | --- |
| Prisma CLI (`migrate`, `studio`) | `prisma.config.ts` → `datasource.url` | Schema changes, data browsing |
| Application | `ConfigService` → `PrismaPg` adapter | Runtime queries |

Nothing hardcodes it, and no new environment variable was introduced —
`.env.example` already documents `DATABASE_URL` from Feature 002, so it needed
no change.

### Client generation

The `prisma-client` generator writes TypeScript into
`backend/src/generated/prisma`. Two consequences worth stating:

**The output is inside `src/` on purpose.** The generated files are TypeScript
sources, so `tsc` compiles them into `dist/` along with everything else and no
asset-copying step is needed. Putting them outside `src/` would add a second
root to the compiler's input set, which changes tsc's inferred root directory
and would silently move the build output from `dist/main.js` to
`dist/src/main.js`, breaking `npm run start:prod`.

**It is gitignored.** The client is derived entirely from `schema.prisma`, so
it is build output, and `CLAUDE.md` forbids committing generated files.
`postinstall` runs `prisma generate`, so a fresh clone produces it during
`npm install`. `prisma migrate dev` regenerates it as part of its own run, so
the client cannot drift behind a migration. `npm run prisma:generate` covers
the remaining case: editing the schema without migrating.

Committed migrations under `backend/prisma/migrations/` are **not** ignored —
they are the schema's history and must be shared.

### Tooling adjustments the generated directory required

| File | Change | Reason |
| --- | --- | --- |
| `.gitignore` | ignore `backend/src/generated/` | Generated build output |
| `backend/.prettierignore` (new) | ignore `src/generated/` | `npm run format` globs `src/**/*.ts` and would otherwise rewrite files that the next `generate` overwrites |
| `backend/package.json` | `coveragePathIgnorePatterns: ["/generated/"]` | `collectCoverageFrom` is `**/*.(t|j)s` under `src`, which would otherwise report coverage for the client |
| `backend/tsconfig.build.json` | exclude `prisma.config.ts` | Keeps every build input under `src/`, so the output stays `dist/main.js`. `npm run typecheck` still checks the file, because `tsconfig.json` has no such exclusion. |

### npm scripts

| Script | Command |
| --- | --- |
| `postinstall` | `prisma generate` |
| `prisma:generate` | `prisma generate` |
| `prisma:migrate` | `prisma migrate dev` |
| `prisma:migrate:deploy` | `prisma migrate deploy` |
| `prisma:studio` | `prisma studio` |

`migrate deploy` is separated from `migrate dev` because only the former is
safe outside development: it applies pending migrations and nothing else, while
`migrate dev` may prompt, reset, or create a shadow database.

## Database

### Schema change

The generator block is the only change made under this feature's own
initiative. The `User` model and the `UserRole` enum were left as they were.

```diff
 generator client {
-  provider = "prisma-client-js"
+  provider     = "prisma-client"
+  output       = "../src/generated/prisma"
+  moduleFormat = "cjs"
 }
```

This is mandatory, not a preference:

- `prisma-client-js` is deprecated in v7 and does not produce a client
  compatible with the driver-adapter architecture.
- `output` is required by the `prisma-client` generator; generation fails
  without it.
- `moduleFormat = "cjs"` is stated explicitly rather than inferred, because the
  backend compiles with `"module": "commonjs"`. Leaving it to inference makes
  the generated module format depend on how the CLI reads the surrounding
  environment.

The `datasource` block stays as Feature 001 left it — provider only, no `url`,
which is correct for v7. Its comment was corrected: it still claimed
"Neither exists yet — Prisma is not installed", which stopped being true.

### Model changes applied separately

Two of the observations raised below were adopted directly in
`schema.prisma` while this feature was in progress, and are kept:

```diff
 model User {
   id           String  @id @default(cuid())
-  code_emp     String  @unique
+  employeeCode String  @unique @map("code_emp")
   ...
+  @@map("users")
 }
```

Both are pure naming changes with no behavioural effect, and neither has been
applied to a database yet — the initial migration has not run, so they simply
change the SQL it will emit. `employeeCode` brings the field in line with the
camelCase used everywhere else while `@map` preserves the intended column name,
and `@@map("users")` avoids a quoted, case-sensitive `"User"` table.

### Tables created by the migration

`prisma migrate dev --name init` produces
`backend/prisma/migrations/<timestamp>_init/migration.sql`, which creates:

| Object | Kind | Detail |
| --- | --- | --- |
| `UserRole` | enum type | values `superadmin`, `admin`, `hr`, `user` (the `@map` values, not the Prisma-side identifiers) |
| `users` | table | `id`, `code_emp`, `email`, `name`, `username`, `role`, `createdAt`, `updatedAt` |
| `users_pkey` | primary key | on `id` |
| `users_code_emp_key` | unique index | from `@unique` on `employeeCode` |
| `users_email_key` | unique index | from `@unique` |
| `users_username_key` | unique index | from `@unique`; nullable, and PostgreSQL treats each `NULL` as distinct, so multiple users may have no username |
| `_prisma_migrations` | table | Prisma's own bookkeeping — which migrations ran, when, and their checksums |

Table and index names follow `@@map("users")`; the column stays `code_emp`
because of the field's `@map`. Exact index names should be confirmed against
the generated `migration.sql` once the migration runs.

Column notes: `id` is `TEXT` (a `cuid()` generated by the client, not by the
database); `role` defaults to `'user'`; `createdAt` defaults to
`CURRENT_TIMESTAMP`; `updatedAt` is maintained by Prisma Client on write, not
by a database trigger — a row updated by raw SQL or by DBeaver will not have it
refreshed.

### Why a migration is required

Feature 002 created an empty database. The `User` model exists only in
`schema.prisma`, so nothing is queryable until DDL is applied. Migrations
rather than `db push` because `CLAUDE.md` requires it, and because the
resulting SQL files are reviewable, replayable and version-controlled — the
same history can be applied to CI and production with `migrate deploy`.

`migrate dev` briefly creates a shadow database on the same server to detect
drift. The `POSTGRES_USER` superuser from Feature 002 is permitted to do this,
so no extra grant is needed.

### Observations

Raised while reviewing the model. The first two were adopted (see Model changes
applied separately); the rest are **not** applied and are left for a future
feature:

- ~~`code_emp` breaks the camelCase naming convention.~~ Adopted as
  `employeeCode` with `@map("code_emp")`.
- ~~No `@@map`, so the table would be a quoted, case-sensitive `"User"`.~~
  Adopted as `@@map("users")`.
- **No index on `role`.** Worth adding once permission filtering exists and the
  table is large enough for it to matter; premature today.
- **`username` is optional and unique.** Intentional-looking, but worth
  confirming that "no username" is a valid user state before authentication is
  built on it.

## Frontend

No changes.

## API

No changes. No endpoint reads or writes the database yet; `GET /` and
`GET /health` behave exactly as documented in Feature 001.

`GET /health` deliberately does **not** gain a database probe in this feature —
that would make `HealthModule` a Prisma consumer, and the scope is
infrastructure only. It is listed under Future Improvements.

## How this supports the modules that come next

| Module | What it gets from this feature |
| --- | --- |
| `auth` | Injects `PrismaService` to look up a user by `email` / `username`; the unique indexes created here are what make that lookup a single index scan. |
| `users` | CRUD on `prisma.user` with no extra wiring — the delegate already exists on the injected service. |
| `roles` | `UserRole` is already persisted as a PostgreSQL enum and generated as a TypeScript union, so role checks are type-checked at compile time. |
| `permissions` | New models are added to `schema.prisma` and reach the database through the same `migrate dev` → `generate` cycle; no application code changes to support them. |

Every one of those modules injects the same `PrismaService` and therefore
shares one connection pool. Nothing about them requires editing
`PrismaModule`.

## Files Created

- `backend/prisma.config.ts`
- `backend/src/prisma/prisma.module.ts`
- `backend/src/prisma/prisma.service.ts`
- `backend/src/prisma/prisma.service.spec.ts`
- `backend/.prettierignore`
- `FEATURES/003-prisma-orm-setup.md`

Created by the approved commands, not written by hand:

- `backend/prisma/migrations/<timestamp>_init/migration.sql`
- `backend/prisma/migrations/migration_lock.toml`
- `backend/src/generated/prisma/**` (gitignored)

## Files Modified

- `backend/prisma/schema.prisma` — generator block, plus a corrected
  `datasource` comment. The `User` model's `employeeCode` / `@@map("users")`
  changes were applied separately (see Database).
- `backend/package.json` — `@prisma/client` and `@prisma/adapter-pg`
  dependencies; `prisma` and `dotenv` devDependencies; five Prisma scripts;
  Jest `coveragePathIgnorePatterns`.
- `backend/tsconfig.build.json` — exclude `prisma.config.ts`.
- `backend/tsconfig.json` — explicit `"types": ["jest", "node"]` (see Notes).
- `backend/src/app.module.ts` — import `PrismaModule`.
- `backend/src/main.ts` — `app.enableShutdownHooks()`.
- `.gitignore` — ignore `backend/src/generated/`.
- `README.md` — replaced the stale Prisma v6 workflow section (which described
  `npx prisma init` and a `datasource.url` that v7 rejects) with the v7 script
  table and a short "how it is wired" summary; updated the folder structure and
  the local run instructions.
- `FEATURES/HISTORY.md`, `FEATURES/README.md` — index entries.

## Environment variables

None added. `DATABASE_URL`, `POSTGRES_*`, `NODE_ENV` and `PORT` are unchanged
from Feature 002, so `.env.example` required no edit.

## Verification

### Automated

Run after `npm install` (which triggered `postinstall` → `prisma generate`,
emitting Prisma Client 7.9.1 into `src/generated/prisma`):

| Check | Command | Result |
| --- | --- | --- |
| Install | `npm install` | 134 packages added, 75 removed, **0 vulnerabilities** |
| Generate | `postinstall` → `prisma generate` | Client 7.9.1 generated in 52 ms |
| Type errors | `npm run typecheck` | **Pass** — no errors |
| Build | `npm run build` | **Pass** — output at `dist/main.js`, confirming the `tsconfig.build.json` exclusion works |
| Unit tests | `npm test` | **Pass** — 5/5 across 3 suites |
| E2E tests | `npm run test:e2e` | **Pass** — 2/2 |

The generated client compiles cleanly under this project's `strict` +
`noUnusedLocals` + `noUnusedParameters` settings, so the scoped allowance that
was held in reserve proved unnecessary.

The e2e suite passed with **Docker stopped**, which is what exposed the
`$connect()` behaviour documented above: booting `AppModule` no longer implies
a working database.

Still outstanding: the `init` migration has not been run — Docker Desktop was
not running, and `CLAUDE.md` requires explicit approval for it regardless. No
table exists in the database yet.

### Manual

Prerequisite: PostgreSQL up and **healthy** (`docker compose ps` shows
`(healthy)`, not merely `Up`), and a root `.env` with a valid `DATABASE_URL`.

1. ~~**Install and generate.**~~ Done — see Automated above.
   `backend/src/generated/prisma/` exists.
2. **Run the initial migration.** `npm run prisma:migrate -- --name init`.
   Expect `Your database is now in sync with your schema`, a new
   `backend/prisma/migrations/<timestamp>_init/` folder, and the client
   regenerated automatically.
3. **Start the backend.** `npm run start:dev`. Expect
   `Prisma Client initialised` from the `PrismaService` logger before
   `Backend is listening on http://localhost:3000`. Then press Ctrl+C and
   expect `Prisma Client disconnected` — that line is the proof that
   `enableShutdownHooks` works. Note that the first message appears whether or
   not the database is reachable; it is not a connectivity check.
4. **Open Prisma Studio.** `npm run prisma:studio`, then
   http://localhost:5555. The `User` model should be listed and open to an
   empty table. Adding a row here is a quick end-to-end check that the client,
   the adapter and the migration all agree — and, unlike step 3, it does
   involve a real query.
5. **Verify with DBeaver.** New PostgreSQL connection to `localhost:5432`,
   database `crm_timesheet`, with the user and password from `.env`.
6. **Verify the `users` table.** Under `crm_timesheet → Schemas → public →
   Tables`. Check the three unique indexes on `code_emp`, `email` and
   `username`, and that `role` is of type `UserRole` with default `'user'`.
   `SELECT * FROM users;` — thanks to `@@map("users")` the name is lowercase
   and needs no quoting.
7. **Verify `_prisma_migrations`.** In the same schema.
   `SELECT migration_name, finished_at, applied_steps_count FROM _prisma_migrations;`
   should return one row for `<timestamp>_init` with a non-null `finished_at`.

A `psql` equivalent, if DBeaver is not to hand — run from the project root:

```bash
docker compose exec postgres psql -U crm_user -d crm_timesheet -c '\dt'
docker compose exec postgres psql -U crm_user -d crm_timesheet -c '\d users'
```

## Notes

**~~The migration is still pending.~~ Superseded.** This was true when the
document was written — Docker Desktop was not running, and `CLAUDE.md` requires
approval regardless. The migration has since been applied:
`npx prisma migrate status` reports "Database schema is up to date", and
[Feature 005](005-database-seeding.md) seeded the resulting tables. The
migration also covers more than the `User` model described below; the schema
had grown to six models by the time it ran.

**`$connect()` is not a connectivity check** — the single most surprising
finding here, and it invalidates a claim carried over from pre-v7 Prisma
recipes. See Backend → `PrismaService`. The practical effect is that a green
build and a clean startup log say nothing about whether PostgreSQL is up.

**The generated client passes this project's strict settings.** `tsconfig.json`
enables `strict`, `noImplicitOverride`, `noUnusedLocals` and
`noUnusedParameters`, and `exclude` does not protect imported files, so the
generated sources are checked by the same rules as hand-written code. They
compile with zero errors, so the scoped allowance held in reserve for
`src/generated/` was not needed.

**`postinstall` assumes `DATABASE_URL` is resolvable.** `prisma generate` does
not connect to the database, but it does load `prisma.config.ts`. On a machine
or CI runner with no `.env` at all, `npm install` may therefore fail at the
`postinstall` step. Locally this is not an issue — the root `.env` exists.

**Ambient globals are now listed explicitly.** `tsconfig.json` gained
`"types": ["jest", "node"]`. Previously the global type set was implicit —
every package under `node_modules/@types` was loaded, so a transitive
dependency could inject globals and the set changed with the dependency tree.
The trigger was an editor reporting `Cannot find name 'describe'` in
`prisma.service.spec.ts`, which `tsc` never reproduced: `@types/jest@29.5.14`
was installed, present in the program per `tsc --listFiles`, and the suite ran.
The declaration is therefore hardening rather than a fix for a compiler
problem. Only Jest and Node contribute globals here; `@types/express` and
`@types/supertest` are reached through imports and are unaffected — confirmed
by typecheck, build, unit and e2e all passing afterwards.

**`npm install` removed 75 packages** alongside the 134 it added. These are
leftovers from the ESLint toolchain that Feature 001 removed from
`package.json` but never pruned from `node_modules`; nothing in the project
referenced them.

**Version drift with `@prisma/adapter-pg`.** The adapter, the CLI and the
client are released as one version and are not guaranteed to interoperate
across versions. Upgrade all three together.

## Future Improvements

- **Database health probe** — `HealthService` runs `SELECT 1` through
  `PrismaService` so `GET /health` reflects database reachability, ideally via
  `@nestjs/terminus`. Deliberately excluded here to keep the feature to
  infrastructure.
- **Seed script** — `migrations.seed` in `prisma.config.ts` plus
  `prisma/seed.ts`, for a first superadmin and local fixtures.
- **Model conventions** — `@@map`, the `code_emp` naming question and an index
  on `role` (see Observations). Best resolved in one migration before the table
  holds data.
- **Connection pool tuning** — `PrismaPg` accepts the full `node-postgres` pool
  configuration (`max`, `idleTimeoutMillis`, ...). The defaults changed in v7;
  worth setting explicitly once concurrency is known.
- **Integration tests against a real database** — a disposable PostgreSQL
  (Testcontainers, or a second Compose service) so repository-level tests run
  against real SQL rather than mocks.
- **Migrations in Docker / CI** — `migrate deploy` as a startup step of a
  containerised backend, gated on the existing
  `depends_on: { condition: service_healthy }`.
- **Query logging** — Prisma's `log` option routed into the project's logger,
  with no parameter values in production so credentials are never written to
  logs.
