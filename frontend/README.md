# Frontend — CRM Timesheet

React + Vite single-page app for the NestJS API in [`../backend`](../backend).

**Conventions live in [`CLAUDE.md`](CLAUDE.md)** — stack, TypeScript rules, component
style, forms, loading states, responsive design, theming, i18n, dates and API
access. This file only covers how to run things. What each feature added is in
[`FEATURES/`](FEATURES/README.md); the foundation is
[F01](FEATURES/F01-project-foundation.md).

---

## Requirements

- Node.js 20+
- The backend running on `http://localhost:3000` (see the repository root
  `README.md` — PostgreSQL in Docker, then `npm run start:dev` in `backend/`)

---

## Setup

```bash
npm install
cp .env.example .env   # optional — every variable has a working default
npm run dev
```

The dev server prints its URL (`http://localhost:5173` unless the port is taken).

---

## Scripts

| Script                | What it does                                                       |
| --------------------- | ------------------------------------------------------------------ |
| `npm run dev`         | Vite dev server, with `/api` proxied to the backend.                |
| `npm run gen:api`     | Regenerates the typed API layer from the backend's OpenAPI document. |
| `npm run typecheck`   | `tsc -b` across both TypeScript projects.                            |
| `npm run lint`        | ESLint.                                                              |
| `npm run build`       | Type-check, then production build into `dist/`.                      |
| `npm run preview`     | Serves the built `dist/` locally.                                    |

---

## The API types are generated — regenerate them

Request and response types are **never hand-written**. They come from the
backend's OpenAPI document (`/api/docs-json`, backend Feature 038) into
`src/api/generated/openapi.d.ts`.

```bash
# the backend must be running
npm run gen:api
```

Run it after **any** backend contract change. A renamed field then becomes a
compile error in the screens that use it, which is the entire point — see
[F01](FEATURES/F01-project-foundation.md) for how the generated types and the
app's axios instance fit together.

The generated file is committed, so a fresh clone type-checks without the backend
running. Do not edit it.

---

## Environment

Copy `.env.example` to `.env`. All three variables are optional and documented in
that file:

| Variable                 | Default                              | Used by            |
| ------------------------ | ------------------------------------ | ------------------ |
| `VITE_API_BASE_URL`      | *(empty — same origin)*              | the browser        |
| `VITE_API_PROXY_TARGET`  | `http://localhost:3000`              | `vite.config.ts`   |
| `VITE_OPENAPI_URL`       | `http://localhost:3000/api/docs-json` | `npm run gen:api`  |

Vite inlines every `VITE_`-prefixed variable into the shipped bundle, so nothing
secret belongs in this file. This is the one service in the repository with its
own `.env`, for that reason.

### The dev proxy

`vite.config.ts` forwards `/api` to `VITE_API_PROXY_TARGET`, so the browser only
ever talks to the Vite origin and there is no CORS to configure. `/api` rather
than `/api/v1`, so `/api/docs` and `/api/docs-json` are reachable through the dev
server too.
