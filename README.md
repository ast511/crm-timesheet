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
│   │   └── schema.prisma
│   └── src/
├── docker-compose.yml   # PostgreSQL only (for now)
├── .env                 # Real secrets — gitignored
├── .env.example         # Template committed to git
└── README.md
```

---

## Prerequisites

- Docker Desktop (Windows) / Docker Engine + Compose plugin (Ubuntu)
- Node.js 20+ and npm
- The `.env` file at the repo root (copy from `.env.example`)

---

## PostgreSQL — Docker commands

Run all commands from the project root (where `docker-compose.yml` lives).

| Action                | Command                                              |
|-----------------------|------------------------------------------------------|
| Start (detached)      | `docker compose up -d`                               |
| Start (foreground)    | `docker compose up`                                  |
| Stop (keep data)      | `docker compose stop`                                |
| Stop + remove containers | `docker compose down`                             |
| Stop + remove containers **and volumes** (wipes DB) | `docker compose down -v` |
| Follow logs           | `docker compose logs -f postgres`                    |
| Container status      | `docker compose ps`                                  |
| Restart service       | `docker compose restart postgres`                    |
| Pull newer image      | `docker compose pull && docker compose up -d`        |

### Connect to PostgreSQL

Interactive `psql` inside the container:

```bash
docker compose exec postgres psql -U crm_user -d crm_timesheet
```

From the host (needs `psql` installed locally):

```bash
psql "postgresql://crm_user:change_me_strong_password@localhost:5432/crm_timesheet"
```

---

## Prisma workflow

Run from `backend/` after `npm install` and after PostgreSQL is up.

```bash
# 1. Scaffold prisma/ and add DATABASE_URL placeholder (only the first time)
npx prisma init

# 2. Create + apply a migration and regenerate the client
npx prisma migrate dev --name init

# 3. Regenerate the Prisma client (auto-run by `migrate dev`, useful after schema edits)
npx prisma generate

# 4. Open the visual DB browser at http://localhost:5555
npx prisma studio
```

### Prisma datasource (`backend/prisma/schema.prisma`)

```prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

// Example model — replace with your domain.
model User {
  id        String   @id @default(cuid())
  email     String   @unique
  name      String?
  createdAt DateTime @default(now())
}
```

Prisma reads `DATABASE_URL` from `backend/.env` by default. Either:

- symlink/copy the root `.env` into `backend/`, **or**
- point `@nestjs/config` and Prisma at the root file via `dotenv -e ../.env ...`.

---

## Running the app locally

```bash
# Terminal 1 — database
docker compose up -d

# Terminal 2 — backend
cd backend
npm install
npx prisma migrate dev
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
