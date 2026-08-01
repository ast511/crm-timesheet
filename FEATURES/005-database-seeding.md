# Feature 005 — Database Seeding

**Status:** Completed and verified
**Date:** 2026-08-01

## Goal

A reusable, idempotent seeding system that fills a development database with
realistic sample data for every model in `schema.prisma`, and that stays
maintainable as models are added.

Secondary, but unavoidable: the seed has to store passwords, and the project
had no password hashing strategy yet. This feature establishes one and puts it
where the `auth` module will find it.

## Requirements

- One file per seeded entity; `prisma/seed.ts` orchestrates and nothing else.
- Data generated from `schema.prisma` as the single source of truth — every
  required field, every enum, every relation, no invented fields.
- Entities created in dependency order; never a child before its parent.
- Idempotent: `npx prisma db seed` twice produces the same rows, not duplicates.
- At least one SUPERADMIN, one ADMIN, one HR and several USER accounts.
- Romanian employee names.
- Employees on multiple projects; every project with a project manager.
- No plain-text passwords; one documented development password.
- Strongly typed, no duplicated logic, easy to extend.

## Schema

**`schema.prisma` was not modified.** Every model could be seeded as written —
no missing relation, no required field without a sensible value — so no
migration is introduced by this feature.

Two constraints from the schema shaped the data rather than the code:

- `Employee.seniority` and `Employee.status` are required enums **with no
  default**, so every seeded employee states both explicitly.
- `Position.name` and `Department.name` are `@unique` alongside `code`. The
  seed upserts on `code` and updates `name`, which means renaming a department
  in the seed data is applied on the next run; introducing a *duplicate* name
  would fail with a unique-constraint error rather than silently pick a winner.

## Seed architecture

```text
backend/prisma/
├── seed.ts                        # orchestration only
└── seeds/
    ├── seed-context.ts            # shared types + the upsert/lookup helpers
    ├── departments.seed.ts
    ├── positions.seed.ts
    ├── projects.seed.ts
    ├── users.seed.ts              # User + Employee
    └── project-members.seed.ts
```

### Execution order

Dictated by the foreign keys, not by preference:

```text
departments ─┐
positions  ──┴─> users + employees ─┐
projects ──────────────────────────┴─> project members
```

`departments`, `positions` and `projects` have no dependencies and could run in
any order. Everything after them cannot.

### How the seeds pass data to each other

Each seed returns a `ReadonlyMap` from the entity's **natural key** (its stable
`code`) to the persisted record, so later seeds can resolve a
database-generated `id` from a key they can actually write down:

```ts
export type SeededDepartments = SeededRecords<DepartmentCode, Department>;
```

`DepartmentCode` is not `string`. It is derived from the data itself:

```ts
const DEPARTMENTS = [{ code: 'MGMT', ... }, ...] as const satisfies readonly DepartmentSeed[];

export type DepartmentCode = (typeof DEPARTMENTS)[number]['code'];
//   => 'MGMT' | 'DEV' | 'MAINT' | 'TECH' | 'HR' | 'BA'
```

The consequence is the point of the whole design: an employee referring to
`departmentCode: 'MGMNT'` is a **compile error**, not a run-time crash halfway
through seeding. The same holds for position codes, project codes and employee
codes. Adding a department extends the union automatically — there is no second
list to keep in step.

`as const satisfies readonly DepartmentSeed[]` rather than
`: readonly DepartmentSeed[]` is what makes this work: the annotation form
would widen `code` to `string` and lose the literals, while `satisfies` checks
the shape *and* keeps them.

### Shared helpers (`seed-context.ts`)

Three small functions, each removing a duplication that would otherwise appear
in all five seed files:

| Helper | Purpose |
| --- | --- |
| `upsertAll(items, keyOf, upsert)` | Runs the upserts in order and builds the result map. The one place the "loop and index" pattern is written. |
| `requireSeeded(map, key, entity)` | `Map.get` returns `T \| undefined`; under `strict` every call site would otherwise narrow by hand. A miss can only mean a dependency-order mistake, so the error message says so. |
| `utcDate(isoDate)` | Parses `'2026-01-12'` at UTC midnight. `new Date('2026-01-12')` is already UTC, but `new Date(2026, 0, 12)` is not — this makes the intent explicit and the seeded timestamps identical on every machine regardless of local time zone. |

`seed-context.ts` is also the only file that names the generated client's
location, so moving `src/generated/prisma` is a one-line change.

`upsertAll` is deliberately sequential rather than `Promise.all`: the output
order stays stable and the seed never opens more connections than the pool
expects.

### Why `User` and `Employee` share one file

The requested structure lists `users.seed.ts` and no `employees.seed.ts`, and
the schema agrees with it: `Employee.userId` is required *and* `@unique`, so an
employee cannot exist without a user, and a seeded user with no employee would
be an account this application has no use for. Seeding the pair together makes
the dependency order impossible to get wrong. The exported function is named
`seedUsersAndEmployees` so the file's scope is not a surprise.

## Idempotency

Every write is an `upsert` keyed on a unique column:

| Entity | Upsert key |
| --- | --- |
| Department | `code` |
| Position | `code` |
| Project | `code` |
| User | `email` |
| Employee | `employeeCode` |
| ProjectMember | `projectId_employeeId` (composite primary key) |

Running the seed a second time therefore updates the rows the first run
created. No `deleteMany` first, no `skipDuplicates`, no reliance on the table
being empty — the seed is safe against a database that is already populated.

**One field is deliberately excluded from `update`: `User.passwordHash`.**
bcrypt generates a fresh salt on every call, so including it would rewrite
all twelve user rows on every run for no benefit, and would silently reset a
password changed while testing. Passwords are set once, at creation.
`npm run prisma:reset` restores the defaults from scratch.

## Passwords

### The strategy

`backend/src/common/password/password.hasher.ts` — two functions,
`hashPassword` and `verifyPassword`, and the cost factor. It is placed under
`src/` rather than beside the seed because the `auth` module is its real
long-term consumer; the seed is simply the first caller.

Plain functions rather than an `@Injectable()` service: the module has no
dependencies to inject, and the seed is a standalone `ts-node` script with no
Nest container. Wrapping it in a provider later, if `auth` wants to inject it,
is additive.

### Algorithm

**bcrypt via `bcryptjs`**, cost factor **12**.

`bcryptjs` is the pure-JavaScript implementation. It was chosen over the native
`bcrypt` binding so that `npm install` needs no C++ toolchain on any developer
machine or CI runner — a recurring source of friction on Windows. It produces
and accepts the same `$2a$` / `$2b$` hashes, so moving to the native binding
later would not invalidate a single stored hash. The cost is speed: roughly two
to three times slower per hash, and it runs on the main thread rather than the
libuv thread pool.

Cost 12 is the current OWASP baseline. bcrypt stores the cost inside the hash,
so raising it later is safe — existing hashes keep verifying with the factor
they were created with.

### The 72-byte limit

bcrypt hashes at most 72 bytes and **silently ignores the rest**. Left
unchecked, two long passwords sharing their first 72 bytes would be
interchangeable. `hashPassword` therefore throws on over-long input, and
`verifyPassword` returns `false` rather than comparing a truncated prefix —
no password that long can ever have been hashed, and an authentication check
should answer "no" rather than fail loudly on attacker-controlled input.

The check is on **byte** length, not character length: a Romanian `ș` costs two
bytes, an emoji four.

### Hashing per account, not once

All twelve accounts share the same plain-text password, so a single hash could
have been computed once and reused. It is not, because reusing one hash means
reusing one salt, and this file is the reference the `auth` module will be
copied from. The cost is a few seconds during the seed, in development only.

## Default credentials

| Role | E-mail | Username |
| --- | --- | --- |
| SUPERADMIN | `andrei.popescu@example.com` | `andrei.popescu` |
| ADMIN | `maria.ionescu@example.com` | `maria.ionescu` |
| HR | `elena.dumitrescu@example.com` | `elena.dumitrescu` |
| USER | `cristian.stan@example.com` | `cristian.stan` |
| USER | `ioana.marin@example.com` | `ioana.marin` |
| USER | `vlad.georgescu@example.com` | `vlad.georgescu` |
| USER | `alexandru.radu@example.com` | `alexandru.radu` |
| USER | `gabriela.munteanu@example.com` | `gabriela.munteanu` |
| USER | `stefan.constantin@example.com` | `stefan.constantin` |
| USER | `diana.nistor@example.com` | `diana.nistor` |
| USER | `mihai.barbu@example.com` | `mihai.barbu` |
| USER | `andreea.voicu@example.com` | `andreea.voicu` |

**Default password for every account: `Development123!`**

Override it with the optional `SEED_PASSWORD` environment variable, documented
in `.env.example`. Set it whenever the database is reachable by anyone other
than you — a shared development server, a demo box, a teammate's machine —
because the default above is published in this repository.

Three safeguards keep it from becoming a real credential:

1. `prisma/seed.ts` **refuses to run when `NODE_ENV=production`**, with an
   explicit error.
2. The seed never prints the password. It prints the accounts and points at
   this document — logging a credential is what the project's logging rules
   forbid, and the value may have been overridden.
3. `@example.com` is reserved by RFC 2606 for documentation and can never be
   delivered to a real inbox, so no seeded address can be mistaken for a
   person's.

`isActive: false` on three accounts (`stefan.constantin`, `mihai.barbu`,
`andreea.voicu`) mirrors their non-working employee status. Once `auth` exists
they should not be able to sign in.

## Seeded data

### Departments (6)

`MGMT` Management · `DEV` Development · `MAINT` Maintenance · `TECH` Technical ·
`HR` Human Resources · `BA` Business Analysis

### Positions (8)

`MGR` Manager · `TL` Team Leader · `BA` Business Analyst ·
`HR-SPEC` HR Specialist · `DEV` Developer · `SUP-ENG` Support Engineer ·
`TECHN` Technician · `INTERN` Intern

No position encodes seniority — that axis lives on `Employee.seniority`, so a
"Developer" can be JUNIOR or LEAD without multiplying rows here. `Intern` is
kept because it was requested and because it is a distinct contract type; the
matching `SeniorityLevel.INTERN` is still recorded on the employee.

`BA` and `DEV` appear as both a department code and a position code. The
constraint is per table, so this is legal and reads naturally.

### Projects (5)

| Code | Name | Start | End | Active | Archived |
| --- | --- | --- | --- | --- | --- |
| `CRM-TS` | CRM TimeSheet | 2026-01-12 | — | yes | no |
| `PORTAL` | Internal Portal | 2025-03-03 | — | yes | no |
| `ERP-INT` | ERP Integration | 2025-09-01 | 2026-06-30 | no | no |
| `WEBSITE` | Company Website | 2024-05-06 | 2024-11-29 | no | yes |
| `SUPPORT` | Support Platform | 2026-04-01 | — | yes | no |

Three states on purpose: running, finished but still consulted, and archived.

### Users and employees (12)

Every `UserRole`, every `EmployeeStatus` and every `SeniorityLevel` appears at
least once, so the frontend can be built against the states it will actually
have to render rather than only the happy path.

| Code | Name | Role | Department / Position | Seniority | Status |
| --- | --- | --- | --- | --- | --- |
| EMP-0001 | Andrei Popescu | SUPERADMIN | Management / Manager | LEAD | ACTIVE |
| EMP-0002 | Maria Ionescu | ADMIN | Development / Team Leader | SENIOR | ACTIVE |
| EMP-0003 | Elena Dumitrescu | HR | Human Resources / HR Specialist | SENIOR | ACTIVE |
| EMP-0004 | Cristian Stan | USER | Development / Developer | SENIOR | ACTIVE |
| EMP-0005 | Ioana Marin | USER | Development / Developer | MID | ACTIVE |
| EMP-0006 | Vlad Georgescu | USER | Development / Developer | JUNIOR | ACTIVE |
| EMP-0007 | Alexandru Radu | USER | Business Analysis / Business Analyst | MID | ON_LEAVE |
| EMP-0008 | Gabriela Munteanu | USER | Maintenance / Support Engineer | MID | ACTIVE |
| EMP-0009 | Ștefan Constantin | USER | Technical / Technician | JUNIOR | INACTIVE |
| EMP-0010 | Diana Nistor | USER | Development / Intern | INTERN | ACTIVE |
| EMP-0011 | Mihai Barbu | USER | Technical / Technician | JUNIOR | SUSPENDED |
| EMP-0012 | Andreea Voicu | USER | Business Analysis / Business Analyst | SENIOR | TERMINATED |

`phone` is `null` for two employees, because the column is optional and the
frontend has to handle its absence. `maxVacationDays` varies (18 for the
intern, 25 for the manager) so the default is not the only value ever seen.
`canReplaceOthers` is true for the five people who lead or cover for others.

### Project memberships (18)

| Project | Manager | Other members |
| --- | --- | --- |
| CRM-TS | Maria Ionescu | Cristian Stan, Ioana Marin, Vlad Georgescu, Alexandru Radu, Diana Nistor |
| PORTAL | Cristian Stan | Ioana Marin, Gabriela Munteanu |
| ERP-INT | Andrei Popescu | Alexandru Radu, Cristian Stan |
| WEBSITE | Maria Ionescu | Andreea Voicu, Ștefan Constantin |
| SUPPORT | Gabriela Munteanu | Mihai Barbu, Ștefan Constantin |

Six employees belong to more than one project; Cristian Stan belongs to three.
Members of the two finished projects carry a `leftAt`, so the "currently
assigned" filter has something to exclude.

`seedProjectMembers` asserts, **before its first write**, that every seeded
project has at least one manager. The database cannot express that invariant
and no type can either, so it is checked at run time: adding a project without
a manager fails the seed with a named message instead of quietly producing an
unmanaged project.

## Backend

`backend/src/common/password/` is the only addition under `src/`. Nothing in
the running application imports it yet — its first consumer is the seed, its
intended consumer is `auth`.

No module, controller, service or DTO changed. The application behaves exactly
as Feature 004 left it.

## Frontend

No changes.

## API

No changes. No endpoint is added, and none reads the seeded data yet.

## Configuration

### `prisma.config.ts`

```diff
 migrations: {
   path: 'prisma/migrations',
+  seed: 'ts-node prisma/seed.ts',
 },
```

Prisma 7 reads the seed command from `prisma.config.ts`, not from a
`prisma.seed` key in `package.json` as v6 did. This registration is what makes
`npx prisma db seed` work, and it is also what causes `prisma migrate reset` to
re-seed automatically once it has recreated the schema.

### `tsconfig.build.json` — required, not cosmetic

```diff
-"exclude": ["node_modules", "test", "dist", "**/*spec.ts", "prisma.config.ts"]
+"exclude": ["node_modules", "test", "dist", "**/*spec.ts", "prisma.config.ts", "prisma"]
```

Feature 003 excluded `prisma.config.ts` to keep every build input under `src/`,
because tsc infers its root directory from the input set: add a `.ts` file
outside `src/` and the output silently moves from `dist/main.js` to
`dist/src/main.js`, breaking `npm run start:prod`.

`prisma/seed.ts` is exactly such a file, so `prisma` is now excluded for the
same reason. `npm run typecheck` still checks the seed, because `tsconfig.json`
carries no such exclusion — the seed is type-checked but not compiled into the
application bundle, which is correct: it is CLI tooling run through `ts-node`.

### npm scripts

| Script | Command | Purpose |
| --- | --- | --- |
| `prisma:seed` | `prisma db seed` | Run the seed against the current database. |
| `prisma:reset` | `prisma migrate reset` | **Drops the database**, replays every migration, re-seeds. |
| `format` | now also globs `prisma/**/*.ts` | The seed files were outside the previous `src/` + `test/` globs. |

### Jest

`"maxWorkers": 2` added to the Jest configuration in `package.json`. This is a
consequence of regenerating the Prisma Client, not of the seed itself — see
Notes for the measurements behind the number.

### Environment

One optional variable added, `SEED_PASSWORD`, documented in `.env.example`.

It is deliberately **not** added to `src/config/env.validation.ts`: that class
is the contract of the *running application*, which never reads this variable.
`validateEnvironment` ignores unknown keys, so setting it in `.env` does not
affect startup.

## Files Created

- `backend/prisma/seed.ts`
- `backend/prisma/seeds/seed-context.ts`
- `backend/prisma/seeds/departments.seed.ts`
- `backend/prisma/seeds/positions.seed.ts`
- `backend/prisma/seeds/projects.seed.ts`
- `backend/prisma/seeds/users.seed.ts`
- `backend/prisma/seeds/project-members.seed.ts`
- `backend/src/common/password/password.hasher.ts`
- `backend/src/common/password/password.hasher.spec.ts`
- `FEATURES/005-database-seeding.md`

## Files Modified

- `backend/package.json` — `bcryptjs` dependency; `prisma:seed` and
  `prisma:reset` scripts; `format` glob extended to `prisma/**/*.ts`;
  Jest `maxWorkers`.
- `backend/prisma.config.ts` — `migrations.seed`.
- `backend/tsconfig.build.json` — exclude `prisma`.
- `.env.example` — `SEED_PASSWORD`.
- `README.md` — folder structure, two rows in the Prisma workflow table, a
  "how it is wired" bullet, and the seed step in the local run instructions.
- `FEATURES/003-prisma-orm-setup.md` — corrected the closing note that the
  `init` migration was still pending; `migrate status` reports it applied.
- `FEATURES/HISTORY.md`, `FEATURES/README.md` — index entries.

## Verification

### Automated

All checks run against PostgreSQL 16 up and healthy.

| Check | Command | Result |
| --- | --- | --- |
| Install | `npm install` | **Pass** — 1 package added (`bcryptjs` 3.0.2), **0 vulnerabilities** |
| Generate | `postinstall` → `prisma generate` | **Pass** — Client 7.9.1 in 141 ms, now covering all six models |
| Migration state | `npx prisma migrate status` | **Already applied** — "Database schema is up to date" |
| Type errors | `npm run typecheck` | **Pass** — no errors |
| Build | `npm run build` | **Pass** — output at `dist/main.js`; `dist/prisma/` holds only `PrismaService`, so the seed stayed out of the bundle |
| Unit tests | `npm test` | **Pass** — 31/31 across 6 suites |
| E2E tests | `npm run test:e2e` | **Pass** — 5/5 |
| Seed | `npm run prisma:seed` | **Pass** — 6 / 8 / 5 / 12 / 18 |
| Seed again | `npm run prisma:seed` | **Pass** — identical counts, no duplicates |

The `init` migration turned out to be **already applied**, contradicting
Feature 003's closing note that it was still pending. That document has been
corrected rather than left to mislead the next reader.

### Verified against the database

Run through `docker compose exec -T postgres psql -U crm_user -d crm_timesheet`.

**1. Row counts, identical before and after the second run** — the idempotency
check the brief asks for.

```sql
SELECT
  (SELECT count(*) FROM departments)     AS departments,
  (SELECT count(*) FROM positions)       AS positions,
  (SELECT count(*) FROM projects)        AS projects,
  (SELECT count(*) FROM users)           AS users,
  (SELECT count(*) FROM employees)       AS employees,
  (SELECT count(*) FROM project_members) AS project_members;
```

```text
 departments | positions | projects | users | employees | project_members
-------------+-----------+----------+-------+-----------+-----------------
           6 |         8 |        5 |    12 |        12 |              18
```

**2. No plain-text password reached the database.** Every `password_hash`
begins `$2b$12$` — the bcrypt marker followed by the cost factor:

```sql
SELECT email, left(password_hash, 7) FROM users ORDER BY email;
```

**3. Every project has exactly one manager.**

```sql
SELECT p.code, count(*) AS members,
       count(*) FILTER (WHERE m.is_project_manager) AS managers
FROM projects p JOIN project_members m ON m."projectId" = p.id
GROUP BY p.code ORDER BY p.code;
```

```text
  code   | members | managers
---------+---------+----------
 CRM-TS  |       6 |        1
 ERP-INT |       3 |        1
 PORTAL  |       3 |        1
 SUPPORT |       3 |        1
 WEBSITE |       3 |        1
```

**4. Full enum coverage**, confirmed with `SELECT DISTINCT`:

| Enum | Values present |
| --- | --- |
| `EmployeeStatus` | `active, inactive, on_leave, suspended, terminated` (all 5) |
| `SeniorityLevel` | `intern, junior, mid, senior, lead` (all 5) |
| `UserRole` | `superadmin, admin, hr, user` (all 4) |

**5. Six employees on more than one project**, Cristian Stan on three. Romanian
diacritics survived the round trip — `Ștefan Constantin` reads back intact,
confirming the UTF-8 encoding chosen in Feature 002.

**6. Browse it.** `npm run prisma:studio` — every model is populated and the
relations are navigable.

## Notes

**Row types carry a `Model` suffix.** The `prisma-client` generator emits
`DepartmentModel`, not `Department`: `models.ts` re-exports `./models/Department`,
whose row type is `export type DepartmentModel = ...`. The bare model name does
not exist as an exported type. Written up because the v6 `prisma-client-js`
generator exported `Department`, so every pre-v7 example — and the first draft
of these seeds — gets it wrong, and the error message
(`has no exported member 'Department'`) does not suggest the fix.

**Regenerating the client broke `npm test`, and the fix is unrelated to
seeding.** Jest workers began crashing with `Jest worker ran out of memory` on
two suites. The cause: `tsconfig.json` declares no `include`, so ts-jest builds
a TypeScript program spanning the entire `backend/` directory, and each worker
holds its own copy. That program went from a one-model generated client to a
six-model one, and Jest's default worker count on this machine is 11
(`CPUs - 1`).

Measured rather than guessed:

| `maxWorkers` | Result | Wall time |
| --- | --- | --- |
| 11 (default) | 2 suites crashed | 21.1 s |
| 6 (`50%`) | 1 suite crashed | 12.5 s |
| 4 | Pass | 9.5 s |
| 3 | Pass | 8.2 s |
| **2** | **Pass** | **7.0 s** |

The constraint is memory, not CPU, so fewer workers is *both* safer and
faster — `maxWorkers: 2` is now set in the Jest configuration. The alternative,
ts-jest transpile-only (`isolatedModules`), would keep the parallelism but
stop type-checking during the test run; it was rejected because the project
deliberately compiles everything under full `strict`, and `npm run typecheck`
covering it separately is a weaker guarantee than the test run failing.

Note this will need revisiting: the per-worker program grows with every model
added to the schema, so a future feature may find that even two workers is too
many. At that point transpile-only becomes the right trade.

**`bcryptjs` was chosen over native `bcrypt` at the user's request**, for the
reasons under Passwords → Algorithm. The hash format is identical, so the
decision is reversible without touching stored data.

**The seed prints no password.** It prints the seeded addresses grouped by role
and points at this document. `printSignInSummary` derives that list from the
seed data itself rather than repeating it, so the console output cannot drift
from the accounts actually created.

**`console.log` in the seed is intentional.** `CLAUDE.md` forbids leaving
debugging logs in production code; this is a CLI script whose output is its
user interface, and it is excluded from the application build.

**Dates are parsed at UTC midnight.** Written as `'2026-01-12'` and converted
by `utcDate`, so the same seed produces byte-identical timestamps regardless of
the machine's time zone. A naive `new Date(2026, 0, 12)` would not.

**Seniority is not encoded in `Position`.** Requested explicitly, and the
schema already supports it properly with `Employee.seniority`. Worth recording
because "Senior Developer" as a position row is the obvious wrong turn here.

## Future Improvements

- **A test for the seed.** The invariants asserted manually above (row counts
  stable across two runs, one manager per project, no plain-text password)
  belong in an integration test against a disposable PostgreSQL, which is
  already listed as a Future Improvement in Feature 003.
- **Volume data.** The current set is hand-written and small, which is right
  for developing against. Pagination, sorting and performance work will want a
  generated set of hundreds of employees and thousands of memberships — best
  added as a separate, opt-in `seeds/volume/` rather than by inflating these
  files.
- **A minimal production seed.** Distinct from this one: a single bootstrap
  SUPERADMIN whose password comes only from the environment, with no sample
  data and no default. The `NODE_ENV=production` guard here exists precisely
  because that is a different job.
- **`PasswordService` for Nest.** If `auth` prefers injection over importing
  the functions, wrap this module in an `@Injectable()` provider. Additive; not
  needed until there is a consumer.
- **Timesheet data.** There is no time-entry model yet. When one arrives it
  gets a `seeds/time-entries.seed.ts` and one call in `seed.ts` — the point of
  the structure.
