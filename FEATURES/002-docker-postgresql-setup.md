# Feature 002 — Docker & PostgreSQL Setup

**Status:** Completed
**Date:** 2026-08-01

## Goal

Provide PostgreSQL for local development through Docker Compose, with durable
storage that survives container restarts and recreation, a dedicated network
that future services can join, and a healthcheck other services can gate on.

Scope is the database infrastructure only. Prisma, models, migrations and seed
scripts are explicitly out of scope, and the backend application was not
modified.

## Requirements

- PostgreSQL on a stable, supported version.
- Descriptive service name, container name and network.
- Named Docker volume for persistent storage (no anonymous volumes).
- Environment variables loaded from `.env`.
- Healthcheck.
- Restart policy.
- Port mapping for local development.
- Data survives `stop` / `start` / `restart` / `down` / `up -d`, and is removed
  only by `down -v`.
- `.env.example` documents every required variable, with no real credentials.
- `.gitignore` covers `.env`, database data and temporary files.
- `README.md` documents the operational workflow, volumes, persistence and the
  `down` vs `down -v` distinction.

## Starting point

`docker-compose.yml`, `.env.example`, `.gitignore` and the Docker section of
`README.md` were already present in the repository before Feature 001, and the
existing Compose file already satisfied most of the functional requirements —
correct image, named volume, dedicated network, healthcheck, restart policy and
loopback-bound port mapping.

`CLAUDE.md` forbids recreating `docker-compose.yml` and requires keeping changes
as small as possible, so this feature **extended** the existing definition with
targeted edits rather than rewriting it. What follows documents only the deltas.

## Backend

No changes. No package was installed and no application file was touched.

## Frontend

No changes.

## Database

### Service definition

| Setting | Value | Rationale |
| --- | --- | --- |
| Image | `postgres:16-alpine` | Major version pinned, so minor/patch upgrades arrive via `docker compose pull` but a major upgrade is never implicit. PostgreSQL 16 is supported until Nov 2028. Alpine base keeps the image small. |
| Service name | `postgres` | Becomes the DNS hostname on the project network. |
| Container name | `crm-timesheet-postgres` | Predictable target for `docker exec` / `docker logs`. |
| Network | `crm-timesheet-net` (bridge) | Project-scoped, so a future backend service resolves `postgres:5432` directly. |
| Volume | `crm-timesheet-postgres-data` | Named, so its lifecycle is independent of the container. |
| Restart policy | `unless-stopped` | Survives host reboots and daemon restarts, but respects a deliberate `docker compose stop`. `always` would fight the operator by restarting a manually stopped container. |
| Port | `127.0.0.1:${POSTGRES_PORT:-5432}:5432` | Published for the host-run backend and GUI tools, bound to loopback so the database is never exposed on the LAN by accident. |

### Changes made in this feature

**Required variables now fail fast.** `POSTGRES_USER`, `POSTGRES_PASSWORD` and
`POSTGRES_DB` use the `${VAR:?message}` form. Previously a missing `.env` was
interpolated to an empty string, and the failure surfaced as an opaque initdb
crash-loop. Compose now aborts before starting anything, naming the missing
variable and pointing at `.env.example`.

**The host port is configurable.** `${POSTGRES_PORT:-5432}` lets a developer
with a local PostgreSQL install already owning 5432 move the published port
without editing a tracked file. The default preserves existing behaviour, so no
change to an existing `.env` is required.

**The healthcheck no longer restates credentials.** It was
`pg_isready -U ${POSTGRES_USER} -d ${POSTGRES_DB}`, interpolated by Compose at
parse time. It is now `pg_isready -U "$$POSTGRES_USER" -d "$$POSTGRES_DB"`; the
`$$` escape defers expansion to the shell inside the container, which reads the
values from the service's own `environment` block. One source of truth (DRY),
and the probe cannot drift out of sync with the container's actual credentials.

**`shm_size: 256mb`.** PostgreSQL allocates parallel-query and hash-join
workspace in `/dev/shm`. Docker's 64 MB default boots fine but surfaces later,
under real query load, as `could not resize shared memory segment`. Raising it
now avoids a confusing failure once the schema and data exist.

**`stop_grace_period: 30s`.** The official image sets `STOPSIGNAL SIGINT`, which
triggers a PostgreSQL *fast* shutdown, so this window is normally unused. It
exists so a checkpoint under load is never truncated by `SIGKILL` at Docker's
10-second default.

**Log rotation.** The `json-file` driver is uncapped by default and will grow
until it fills the Docker disk. Capped at 3 × 10 MB.

### Data persistence model

The container's data directory `/var/lib/postgresql/data` is covered by the
named volume `crm-timesheet-postgres-data`. A named volume is storage managed by
Docker with a lifecycle independent of any container, so:

| Command | Container | Volume | Data |
| --- | --- | --- | --- |
| `docker compose stop` | stopped, kept | kept | kept |
| `docker compose start` | started | kept | kept |
| `docker compose restart` | restarted | kept | kept |
| `docker compose down` | removed | kept | kept |
| `docker compose up -d` | recreated | kept | kept |
| `docker compose down -v` | removed | removed | **destroyed** |

`down` removes containers and the network only; the next `up -d` builds a fresh
container, mounts the same volume, and PostgreSQL finds its existing data
directory. `down -v` additionally deletes the volume, so the next start re-runs
`initdb` against empty storage — irreversible and unprompted.

A named volume is used rather than a host bind-mount (`./pgdata:/var/lib/...`)
because bind-mounts inherit host filesystem semantics: permissions and `fsync`
behaviour differ across Windows, macOS and Linux, and on Windows they are both
slower and prone to permission failures with PostgreSQL. Named volumes behave
identically on all three hosts, which matters for a project developed on
Windows and deployed to Linux.

### Networking

`crm-timesheet-net` is an explicit user-defined bridge network. Docker's
embedded DNS resolves service names on user-defined networks, so any service
attached to it reaches the database at `postgres:5432` — container to container,
without traversing the host or depending on the published port.

Two consequences for the future:

- The published `127.0.0.1:5432` mapping exists **only** for processes on the
  host (the backend during development, `psql`, DBeaver, Prisma Studio). Once
  the backend runs as a Compose service, it will not need it.
- `DATABASE_URL` differs by where the backend runs: host `localhost:5432`
  versus container `postgres:5432`. Only the host portion changes.

### First-boot semantics

`POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_DB` and `POSTGRES_INITDB_ARGS`
are read by the entrypoint **only** when it initialises an empty data
directory. Once the volume holds a cluster, editing them in `.env` has no
effect. Applying new credentials means either `down -v` (destroying the data) or
`ALTER ROLE` from inside `psql`. This is documented in both `.env.example` and
`README.md` because it is a common and confusing surprise.

### Collation

`POSTGRES_INITDB_ARGS` is `--encoding=UTF-8 --lc-collate=C --lc-ctype=C`,
inherited unchanged from the pre-existing file. `C` collation sorts text by byte
value: deterministic and fast, but `ORDER BY` on names with diacritics does not
follow language rules. This was left as-is rather than changed silently, because
it is an `initdb`-time setting and altering it would require destroying any
existing volume. It can be overridden per column with `COLLATE` in a later
migration. Flagged here as a decision to revisit before production data exists.

### Suitability for Prisma

Nothing in this feature presumes an ORM, and Prisma needs nothing beyond what is
now in place:

- `DATABASE_URL` already exists in `.env.example` and resolves to the published
  loopback port, which is what `prisma migrate dev` and `prisma studio` connect
  to from the host.
- The healthcheck gives a reliable readiness signal, so a future containerised
  backend can gate migrations behind
  `depends_on: { postgres: { condition: service_healthy } }` instead of
  retry-looping on connection refused.
- The named volume means migration history in `_prisma_migrations` survives
  container recreation. Without it, every `down` would silently reset migration
  state and desynchronise it from `prisma/migrations/`.
- The image is a stock PostgreSQL 16 with no extensions or tuning that Prisma's
  introspection or shadow database would have to work around. `migrate dev`
  creates its shadow database on the same server, which the superuser created by
  `POSTGRES_USER` is permitted to do.

As recorded in Feature 001, Prisma 7 will additionally require `prisma.config.ts`
and the `@prisma/adapter-pg` driver adapter. Neither affects this Compose setup.

## API

No changes.

## Files Created

- `FEATURES/002-docker-postgresql-setup.md`

## Files Modified

- `docker-compose.yml` — fail-fast required variables, configurable host port,
  self-referencing healthcheck, `shm_size`, `stop_grace_period`, log rotation.
- `.env.example` — per-variable documentation, added optional `POSTGRES_PORT`,
  documented first-boot-only semantics and the `localhost` → `postgres` host
  change for `DATABASE_URL`. Placeholder credentials only.
- `.gitignore` — `.env.*` with a `!.env.example` negation so future `.env`
  variants are ignored by default; added Docker dump/bind-mount and temporary
  file patterns.
- `README.md` — expanded prerequisites with version requirements and the
  Compose v2 distinction; added `docker compose start` and `config` to the
  command table; added health-verification, volumes, persistence and
  `down` vs `down -v` sections; replaced hardcoded credentials in the connection
  examples with references to `.env`; added `FEATURES/` to the folder structure;
  marked the Prisma section as not yet wired up.
- `FEATURES/HISTORY.md` — added the row for feature 002.
- `FEATURES/README.md` — added feature 002 to the index.

## Environment variables

| Variable | Required | Purpose | Default |
| --- | --- | --- | --- |
| `POSTGRES_USER` | Yes | Superuser created on first boot | — |
| `POSTGRES_PASSWORD` | Yes | Password for `POSTGRES_USER` | — |
| `POSTGRES_DB` | Yes | Database created on first boot | — |
| `POSTGRES_PORT` | No | Host port published on `127.0.0.1` | `5432` |
| `DATABASE_URL` | Yes (backend) | Connection string | — |
| `NODE_ENV` | No | Backend runtime environment | `development` |
| `PORT` | No | Backend HTTP port | `3000` |

`POSTGRES_PORT` is the only new variable. It is optional and defaults to the
previous hardcoded value, so existing `.env` files keep working unchanged.

## Verification

`docker compose config` was run to validate and render the merged
configuration. It parsed without error, resolved `POSTGRES_PORT` to the `5432`
default from an `.env` that does not define it, and emitted the expected
`shm_size: "268435456"`, `stop_grace_period: 30s`, log-rotation options and
`$$`-escaped healthcheck.

No containers were started, no volume was created and no image was pulled —
`config` is read-only, and `CLAUDE.md` requires approval before any command that
modifies the environment. Runtime verification (health status, connection,
volume creation, persistence across restart, destruction under `down -v`) is
left to the operator; the procedure is in the Notes below.

## Notes

`.env` currently sets the password placeholder to `change_me_strong_password`
while `.env.example` ships `replace_with_strong_password`. `.env` is gitignored
and machine-local, so it was deliberately not modified. Since the value is a
placeholder rather than a real secret, it should be replaced with a strong
password — and doing so on an already-initialised volume requires `ALTER ROLE`,
not merely editing `.env` (see First-boot semantics).

The Compose file omits the top-level `version:` key. It is obsolete in the
Compose Specification and emits a deprecation warning when present.

Manual verification procedure, once the operator approves running the commands:

1. `docker compose up -d` — pulls `postgres:16-alpine` on first run, creates the
   network, the volume and the container.
2. `docker compose ps` — wait for `Up ... (healthy)`, not merely `Up`.
3. `docker volume ls` — confirm `crm-timesheet-postgres-data` exists.
4. `docker compose exec postgres psql -U <user> -d <db>` — connect, then
   `CREATE TABLE persistence_check (id serial primary key, note text);`
   and `INSERT INTO persistence_check (note) VALUES ('survived');`
5. `docker compose down` then `docker compose up -d` — reconnect and
   `SELECT * FROM persistence_check;` still returns the row.
6. `docker compose down -v` then `docker compose up -d` — the same query now
   fails with `relation "persistence_check" does not exist`, confirming the
   volume is what carried the data.

## Future Improvements

- **Backup / restore workflow** — a documented `pg_dump` / `pg_restore` pair, so
  `down -v` is recoverable rather than terminal.
- **Performance tuning** — `shared_buffers`, `work_mem`, `max_connections` via a
  mounted `postgresql.conf` or `command:` flags, once real query patterns exist.
- **Docker secrets** — `POSTGRES_PASSWORD_FILE` instead of an environment
  variable, so the password is not visible in `docker inspect` or `ps -e`. Worth
  doing when this setup moves beyond local development.
- **pgAdmin service** — an optional Compose profile
  (`docker compose --profile tools up`) for a browser-based database UI.
- **Extensions** — `uuid-ossp`, `pg_trgm` or `citext` enabled through an
  `/docker-entrypoint-initdb.d/` script, if the domain model needs them.
- **Non-C collation** — revisit before production data exists, if text sorting
  needs to follow language rules (see Collation).
- **Backend and frontend services** — the migration checklist is already in
  `README.md`; requires `backend/Dockerfile` and `frontend/Dockerfile`.
