# CRM TimeSheet

Full-stack app: **React (Vite)** frontend, **NestJS** backend, **Prisma** ORM,
**PostgreSQL** in Docker.

During development only PostgreSQL runs in a container; the frontend and
backend run on the host with `npm run dev` / `npm run start:dev`.

---

## Folder structure

```
crm-timesheet/
│
├── frontend/            # React + Vite app  (runs on the host, e.g. :5173)
├── backend/             # NestJS app        (runs on the host, e.g. :3000)
│   ├── prisma/
│   │   ├── schema.prisma
│   │   └── migrations/  # Committed migration history
│   ├── prisma.config.ts # Prisma CLI configuration
│   └── src/
├── FEATURES/            # Per-feature change log (see FEATURES/README.md)
├── docker-compose.yml   # PostgreSQL only (for now)
├── .env                 # Real secrets — gitignored
├── .env.example         # Template committed to git
├── .gitignore
├── CLAUDE.md
└── README.md
```

---

## Prerequisites

- **Docker Desktop 4.x** (Windows/macOS) or **Docker Engine 24+ with the
  Compose v2 plugin** (Linux). Verify with:

  ```bash
  docker --version
  docker compose version
  ```

  Compose **v2** is required — the commands below use `docker compose`
  (space), not the legacy `docker-compose` (hyphen).
- On Windows, Docker Desktop must be **running** before any command below.
- Node.js 20+ and npm (for the backend/frontend, not for the database).
- A `.env` file at the repo root:

  ```powershell
  # Windows (PowerShell)
  Copy-Item .env.example .env
  ```

  ```bash
  # Linux / macOS
  cp .env.example .env
  ```

  Then edit `.env` and replace the placeholder password. `docker compose up`
  fails fast with an explicit message if a required variable is missing.

---

## PostgreSQL — Docker commands

Run all commands from the project root (where `docker-compose.yml` lives).

| Action                | Command                                              |
|-----------------------|------------------------------------------------------|
| Start (detached)      | `docker compose up -d`                               |
| Start (foreground)    | `docker compose up`                                  |
| Stop (keep containers)| `docker compose stop`                                |
| Start again after stop| `docker compose start`                               |
| Restart service       | `docker compose restart postgres`                    |
| Stop + remove containers | `docker compose down`                             |
| Stop + remove containers **and volumes** (wipes DB) | `docker compose down -v` |
| Follow logs           | `docker compose logs -f postgres`                    |
| Last 100 log lines    | `docker compose logs --tail=100 postgres`            |
| Container status + health | `docker compose ps`                              |
| Validate the config   | `docker compose config`                              |
| Pull newer image      | `docker compose pull && docker compose up -d`        |

### Checking that PostgreSQL is healthy

`docker compose ps` prints a `STATUS` column. Wait for `(healthy)` — not just
`Up` — before connecting or running migrations:

```text
NAME                     STATUS                   PORTS
crm-timesheet-postgres   Up 30 seconds (healthy)  127.0.0.1:5432->5432/tcp
```

The healthcheck runs `pg_isready` every 10s. `starting` means the first probe
has not passed yet; `unhealthy` after ~1 minute means startup failed — check
`docker compose logs postgres`.

You can also probe it directly:

```bash
docker compose exec postgres pg_isready -U crm_user -d crm_timesheet
```

### Connect to PostgreSQL

Interactive `psql` inside the container (substitute the values from your
`.env`):

```bash
docker compose exec postgres psql -U crm_user -d crm_timesheet
```

From the host (needs `psql` installed locally). The password is the one you
set in `.env`:

```bash
psql "postgresql://crm_user:<your-password>@localhost:5432/crm_timesheet"
```

> The port is published on `127.0.0.1` only, so the database is reachable
> from this machine but not from the LAN. If a local PostgreSQL install
> already owns port 5432, set `POSTGRES_PORT` in `.env` to a free port
> (e.g. `5433`) and update `DATABASE_URL` to match.

---

## Docker volumes and data persistence

### Where the data actually lives

PostgreSQL stores its data directory at `/var/lib/postgresql/data` *inside*
the container. Container filesystems are disposable — remove the container and
that data is gone with it.

`docker-compose.yml` therefore mounts a **named volume** over that path:

```yaml
volumes:
  - postgres_data:/var/lib/postgresql/data
```

A named volume is storage managed by Docker with an independent lifecycle:
it is **not** part of the container, and it is **not** a folder in this
repository. This project's volume is named `crm-timesheet-postgres-data`.

```bash
docker volume ls                                  # list volumes
docker volume inspect crm-timesheet-postgres-data # show its real location
```

Named volumes are used instead of a host bind-mount (`./pgdata:/var/lib/...`)
because bind-mounts inherit host filesystem semantics — permissions and
`fsync` behaviour differ between Windows, macOS and Linux, and on Windows they
are noticeably slower and prone to permission errors with PostgreSQL. Named
volumes behave identically on all three.

### What survives what

| Command | Container | Volume | Data |
|---------|-----------|--------|------|
| `docker compose stop`    | stopped, kept | kept | **kept** |
| `docker compose start`   | started       | kept | **kept** |
| `docker compose restart` | restarted     | kept | **kept** |
| `docker compose down`    | **removed**   | kept | **kept** |
| `docker compose up -d`   | recreated     | kept | **kept** |
| `docker compose down -v` | **removed**   | **removed** | **DESTROYED** |

### `down` vs `down -v`

- **`docker compose down`** removes the containers and the project network.
  The named volume is left untouched. The next `docker compose up -d` creates
  a fresh container, mounts the same volume, and PostgreSQL finds its existing
  data directory — every table and row is still there. This is the normal way
  to shut the stack down.

- **`docker compose down -v`** does everything `down` does *and* deletes the
  named volume. PostgreSQL then re-runs `initdb` on the next start: new empty
  database, credentials re-read from `.env`, all data permanently lost. There
  is no undo and no prompt. Use it only to deliberately reset the database
  from scratch.

> Because credentials are only applied by `initdb` on first boot, changing
> `POSTGRES_USER` / `POSTGRES_PASSWORD` / `POSTGRES_DB` in `.env` has **no
> effect** on an existing volume. Applying new credentials requires
> `docker compose down -v` — which destroys the data — or altering the role
> from inside `psql`.

### Collation

The database is initialised with `--lc-collate=C --lc-ctype=C` (byte-order
sorting, UTF-8 encoding). This is deterministic and fast, but `ORDER BY` on
text sorts accented characters by byte value rather than by language rules.
Changing this requires `down -v` (it is an `initdb`-time setting); it can also
be overridden per column with `COLLATE` in a later migration.

---

## Prisma workflow

Prisma **7**. Run everything from `backend/`, with PostgreSQL up and healthy.

| Action | Command |
|--------|---------|
| Regenerate the client after a schema edit | `npm run prisma:generate` |
| Create + apply a migration (development) | `npm run prisma:migrate -- --name <name>` |
| Apply existing migrations (CI / production) | `npm run prisma:migrate:deploy` |
| Visual DB browser at http://localhost:5555 | `npm run prisma:studio` |

`npm install` runs `prisma generate` automatically (`postinstall`), and
`prisma migrate dev` regenerates the client as part of its own run — so a
manual `prisma:generate` is only needed after editing `schema.prisma` without
migrating.

### How it is wired

- **`backend/prisma/schema.prisma`** — models and the `prisma-client`
  generator, which emits TypeScript into `backend/src/generated/prisma`. That
  directory is gitignored build output; never edit it by hand.
- **`backend/prisma.config.ts`** — CLI configuration. Prisma 7 does not read
  `.env` by itself, so this file loads `backend/.env` then the root `.env`
  (first match wins, same order as `@nestjs/config`) and passes
  `DATABASE_URL` to Migrate and Studio.
- **`backend/src/prisma/`** — `PrismaModule` / `PrismaService` for the
  application. Prisma 7 ships no built-in driver, so the service opens the
  connection through the `@prisma/adapter-pg` driver adapter, again from
  `DATABASE_URL`.

`DATABASE_URL` is the single source of the connection string for the CLI and
the application alike. See [`FEATURES/003-prisma-orm-setup.md`](FEATURES/003-prisma-orm-setup.md)
for the full rationale.

---

## Running the app locally

```bash
# Terminal 1 — database
docker compose up -d

# Terminal 2 — backend
cd backend
npm install
npm run prisma:migrate
npm run start:dev

# Terminal 3 — frontend
cd frontend
npm install
npm run dev
```

---

## Extending Compose later (backend + frontend in Docker)

The current `postgres` service does not need to change. Add two more
services and let them talk to `postgres` via the shared network:

```yaml
services:
  postgres:
    # ... unchanged ...

  backend:
    build: ./backend            # requires backend/Dockerfile
    restart: unless-stopped
    env_file: .env
    environment:
      # Same DATABASE_URL, but host becomes the service name `postgres`
      DATABASE_URL: postgresql://${POSTGRES_USER}:${POSTGRES_PASSWORD}@postgres:5432/${POSTGRES_DB}?schema=public
    depends_on:
      postgres:
        condition: service_healthy
    ports:
      - "3000:3000"
    networks:
      - crm-timesheet-net

  frontend:
    build: ./frontend           # requires frontend/Dockerfile (multi-stage: build + nginx)
    restart: unless-stopped
    depends_on:
      - backend
    ports:
      - "5173:80"
    networks:
      - crm-timesheet-net
```

Migration checklist when moving the backend into Docker:

1. Add a `backend/Dockerfile` (Node build stage → slim runtime stage).
2. Add a `frontend/Dockerfile` (Vite build → nginx serve).
3. In `.env`, change `DATABASE_URL` host from `localhost` to `postgres`
   for the containerised backend (keep a `.env.local` with `localhost` if
   you still run the backend on the host sometimes).
4. Remove the `127.0.0.1:` prefix on the postgres `ports:` mapping only
   if you want the DB reachable from other machines — internal container
   traffic does **not** need the port to be published at all.
5. `docker compose up -d --build` to build and start everything.

The named volume `crm-timesheet-postgres-data` and the network
`crm-timesheet-net` are already in place, so the database keeps its data
across the migration.
