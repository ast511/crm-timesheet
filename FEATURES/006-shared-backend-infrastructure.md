# Feature 006 — Shared Backend Infrastructure

**Status:** Completed
**Date:** 2026-08-01

## Goal

Build the reusable backend infrastructure every future module (Employees,
Departments, Projects, …) will depend on, before the first of them exists:

- one response envelope for success, one for failure, applied globally
- one pagination contract — query DTO, limits, helpers, result shape
- a home under `src/common` for code that belongs to no single module

No business functionality, no endpoint, no database change. This feature
delivers the two items [Feature 004](004-api-foundation-global-configuration.md)
listed under *Future Improvements* — the global exception filter and the
response interceptor — plus the pagination layer the API rules ask for.

Explicitly **not** included, and deliberately left to their own features:
authentication, authorization, JWT, guards, roles, permissions, Swagger,
caching, a logging framework, and any business module.

## Requirements

- Consistent JSON for every response, success or failure, produced in one place
  rather than by each controller.
- Unexpected errors return a 500 without leaking their internal message.
- Reusable `page` / `limit` query DTO with defaults, a minimum and a hard cap.
- Pagination arithmetic written once, not once per list endpoint.
- Only files with immediate value — no empty folders, no speculative
  abstractions, no base classes.
- No new environment variable, no Prisma change, no Docker change.

## Backend

### Structure added

```text
backend/src/common/
├── constants/
│   └── pagination.constants.ts       # page limits
├── dto/
│   ├── pagination-query.dto.ts       # ?page= & ?limit=
│   └── pagination-query.dto.spec.ts
├── filters/
│   ├── all-exceptions.filter.ts      # error envelope
│   └── all-exceptions.filter.spec.ts
├── interceptors/
│   ├── response.interceptor.ts       # success envelope
│   └── response.interceptor.spec.ts
├── interfaces/
│   ├── api-response.interface.ts     # the two envelopes
│   └── pagination.interface.ts       # params, meta, result
├── utils/
│   ├── pagination.util.ts            # skip/take + result assembly
│   ├── pagination.util.spec.ts
│   ├── date.util.ts                  # ISO-8601 timestamps
│   └── date.util.spec.ts
└── password/                         # (existing, Feature 005)
```

`src/common` was not new: [Feature 005](005-database-seeding.md) already placed
`password/` there. This feature extends that directory rather than introducing a
second shared location.

### Folders deliberately not created

`decorators/`, `pipes/`, `exceptions/` and `types/` were part of the requested
layout but have no file that is useful today, and CLAUDE.md forbids empty
scaffolding:

| Folder | Why it is absent |
| --- | --- |
| `decorators/` | The natural first entries (`@CurrentUser`, `@Roles`) belong to authentication, which this feature must not implement. |
| `pipes/` | The global `ValidationPipe` covers every current need; Nest's built-in `ParseUUIDPipe` / `ParseIntPipe` cover route params. A custom pipe would have no caller. |
| `exceptions/` | Domain exceptions (`EmployeeNotFoundException`) belong to the module that raises them. Nest's `NotFoundException`, `ConflictException` and friends already cover the generic cases, and the filter renders any of them. |
| `types/` | The only shared types so far are the response and pagination contracts, and those live in `interfaces/` — splitting them across two folders would only raise the question of which one to look in. |

Each becomes a one-line addition the day it holds something real.

### Global exception filter

[all-exceptions.filter.ts](../backend/src/common/filters/all-exceptions.filter.ts)
is a single `@Catch()` filter — no arguments, so it catches everything — and
renders the same envelope for both cases:

```json
{
  "success": false,
  "statusCode": 404,
  "message": "Employee not found",
  "path": "/api/v1/employees/42",
  "timestamp": "2026-08-01T10:15:30.000Z"
}
```

One filter rather than the common `HttpExceptionFilter` + `AllExceptionsFilter`
pair: the two would differ only in how they compute the status code and the
message, and the envelope — the part that must not drift — would be written
twice.

Three decisions worth recording:

1. **Unexpected errors never reach the client.** Anything that is not an
   `HttpException` becomes `500` with the fixed message `Internal server
   error`. An unhandled error's text is written by whatever threw it and may
   contain a query, a file path or a connection string; a unit test asserts a
   thrown `connect ECONNREFUSED 127.0.0.1:5432` does not appear in the body.
   The stack still goes to the log, where it is useful and not public.
2. **Only server errors are logged.** A 404 or a rejected payload is the
   client's mistake; logging those would bury real incidents under routine
   noise. The threshold is `statusCode >= 500`.
3. **`message` keeps its array form.** The global `ValidationPipe` produces one
   message per rejected field. They are passed through as an array instead of
   being joined, so a form can map each message back to its input. The type is
   `string | string[]` and `extractMessage` normalises the three payload shapes
   an `HttpException` can carry (plain string, Nest's `{ statusCode, message,
   error }`, and the pipe's array). `error` is dropped — it only restates the
   status code in words.

The filter is stateless and has no constructor dependency, which is what lets it
be instantiated directly instead of registered as an `APP_FILTER` provider.

### Global response interceptor

[response.interceptor.ts](../backend/src/common/interceptors/response.interceptor.ts)
wraps every successful body:

```json
{ "success": true, "data": { "id": "clx…", "firstName": "Ana" } }
```

- objects and arrays are placed under `data` untouched — an array is never
  spread into the envelope;
- a handler that returns nothing (a `void` delete) yields `"data": null`, an
  explicit key rather than an absent one, so clients read one field regardless
  of the endpoint;
- `data ?? null` replaces only `undefined` and `null`; `0`, `''` and `false` are
  legitimate payloads and pass through unchanged.

Errors bypass it entirely: a thrown exception travels the error channel of the
RxJS stream, never reaches `map`, and is rendered by the filter. A unit test
pins that, because it is the property that keeps the two envelopes from ever
being applied to the same response.

`success` is a literal `true` / `false` rather than a boolean, so TypeScript
treats `ApiSuccessResponse | ApiErrorResponse` as a discriminated union — the
frontend narrows the type by checking one field.

### Registration

Both are registered in the existing `configureApp()` from
[Feature 004](004-api-foundation-global-configuration.md), next to the
`ValidationPipe` whose errors the filter formats:

```ts
app.useGlobalInterceptors(new ResponseInterceptor());
app.useGlobalFilters(new AllExceptionsFilter());
```

`useGlobal*` rather than `APP_INTERCEPTOR` / `APP_FILTER` providers because
neither class injects anything — the provider form buys dependency injection at
the cost of splitting the global wiring across two files. The moment one of them
needs a service (a request-scoped correlation ID, for instance), moving it to
`app.module.ts` is a two-line change.

Registering them inside `configureApp` also means the e2e suite exercises the
envelopes, since it boots through the same function.

### Pagination

Four small pieces, each with one job:

| File | Contents |
| --- | --- |
| `constants/pagination.constants.ts` | `FIRST_PAGE = 1`, `DEFAULT_PAGE_SIZE = 20`, `MIN_PAGE_SIZE = 1`, `MAX_PAGE_SIZE = 100` |
| `dto/pagination-query.dto.ts` | `PaginationQueryDto` — the validated `?page=&limit=` input |
| `interfaces/pagination.interface.ts` | `PaginationParams`, `PaginationMeta`, `PaginatedResult<T>` |
| `utils/pagination.util.ts` | `toSkipTake()`, `buildPaginatedResult()` |

`PaginationQueryDto` uses `class-validator` and `class-transformer`, already
present since Feature 004:

```ts
@IsOptional() @Type(() => Number) @IsInt() @Min(FIRST_PAGE)
readonly page: number = FIRST_PAGE;
```

- `@Type(() => Number)` is mandatory, not decoration: query strings are text, so
  without it `@IsInt()` would reject every request. It takes effect through the
  `transform: true` option already set on the global pipe.
- Defaults are property initialisers, so an absent parameter leaves the value
  untouched and a handler always receives concrete numbers — the same technique
  the environment contract uses, and for the same reason: no call site repeats a
  fallback.
- The cap **rejects** rather than clamps. `?limit=5000` returns 400 instead of
  quietly returning 100 records, so the client learns its query was not
  honoured.
- A list endpoint that also needs filtering or sorting extends this class
  instead of redeclaring `page` and `limit`.

`toSkipTake()` isolates the `(page - 1) * limit` arithmetic — the one line a
paginated service can get subtly wrong, where an off-by-one silently skips or
repeats a record. `buildPaginatedResult(items, total, params)` assembles:

```json
{
  "success": true,
  "data": {
    "items": [],
    "meta": {
      "page": 2, "limit": 20, "total": 50, "totalPages": 3,
      "hasPreviousPage": true, "hasNextPage": true
    }
  }
}
```

`meta` sits inside `data`, not beside it, so the envelope has exactly two keys
whatever the endpoint returns. `totalPages` is `0` when nothing matched — an
empty result has no pages rather than one empty one — and both booleans are
derived, so no frontend has to recompute them.

### Configuration

`src/config` is unchanged apart from the two registrations in `app.setup.ts`.
Feature 004 already moved every existing configuration concern there
(`api.constants.ts`, `app.setup.ts`, `cors.config.ts`, `env.validation.ts`), so
there was nothing left to extract and nothing worth moving for its own sake.

No environment variable was added. The pagination limits are part of the API
contract rather than per-environment settings: a deployment that could change
`MAX_PAGE_SIZE` would only make the frontend and backend disagree about what a
valid request is.

### Date helper

[date.util.ts](../backend/src/common/utils/date.util.ts) holds one function,
`toIsoTimestamp(date = new Date())`. It is deliberately small: its value is that
"a timestamp in an API payload is ISO-8601 UTC" becomes a decision recorded in
one file instead of a `toISOString()` call repeated at every producer. Its only
caller today is the error envelope; response DTOs exposing `createdAt` /
`updatedAt` are the next. Nothing else was added — no `startOfDay`, no
`addDays`, no duration maths — until a module actually needs it.

## Database

No change. `schema.prisma`, the migrations and the seed are untouched, and no
migration is required.

## API

No endpoint was added or removed. The **shape** of every response changed, which
is the point of the feature and the reason to do it now, while only two
endpoints exist. This supersedes the bodies documented in
[Feature 001](001-backend-initialization.md); those documents are left as the
record of what was true at the time:

| Endpoint | Before | After |
| --- | --- | --- |
| `GET /api/v1` | `{ "message": "…" }` | `{ "success": true, "data": { "message": "…" } }` |
| `GET /api/v1/health` | `{ "status": "ok", "service": "backend" }` | `{ "success": true, "data": { "status": "ok", "service": "backend" } }` |
| any failure | Nest's default `{ statusCode, message, error }` | the error envelope |

Consequence to keep in mind: a container healthcheck or uptime probe that
inspects the health **body** must now read `data.status`. Probes that only check
the HTTP status code are unaffected. No such probe exists yet — the Compose file
health-checks PostgreSQL only, not the backend — so nothing had to be changed
alongside this.

Controllers and services are unaffected: `HealthController` still returns
`HealthResponseDto` and knows nothing about the envelope. That separation is
what makes the envelope free for every future module.

## Frontend

No change — the frontend directory is still empty. When it is created, its API
client should unwrap `data` once, in one place, and use `success` to discriminate
between the two envelopes. The `PaginationMeta` fields map directly onto a
pagination component.

## Testing

Unit tests, all new:

| Spec | Covers |
| --- | --- |
| `all-exceptions.filter.spec.ts` | status and message of an `HttpException`, the validation array, the fallback message, the 500 path and its redaction, a thrown non-`Error`, the "no logging for 4xx" rule, the timestamp format |
| `response.interceptor.spec.ts` | objects, arrays, empty responses, falsy-but-present payloads, and errors passing through untouched |
| `pagination-query.dto.spec.ts` | run through a `ValidationPipe` configured exactly like the global one: defaults, string→number coercion, `page=0`, `limit` above the cap, the cap itself, a non-numeric value, a fractional value |
| `pagination.util.spec.ts` | first/middle page offsets, a partially filled last page, the empty result |
| `date.util.spec.ts` | explicit date, and the current-time default |

`test/app.e2e-spec.ts` was updated for the new envelopes and gained a case
asserting that an unmatched route under `/api/v1` renders the error envelope
with the right `path`. No endpoint was invented for testing: the infrastructure
is exercised through the routes that already exist, and the real coverage will
come from the first business module.

Results: `npm run typecheck` clean, `npm test` 58 passed (11 suites),
`npm run test:e2e` 6 passed, `npm run build` clean, `prettier --check` clean.

## Files Created

| File | Purpose |
| --- | --- |
| `backend/src/common/interfaces/api-response.interface.ts` | `ApiSuccessResponse<T>` and `ApiErrorResponse` — the two envelopes, discriminated by `success` |
| `backend/src/common/interfaces/pagination.interface.ts` | `PaginationParams`, `PaginationMeta`, `PaginatedResult<T>` — the shared pagination vocabulary |
| `backend/src/common/constants/pagination.constants.ts` | `FIRST_PAGE`, `DEFAULT_PAGE_SIZE`, `MIN_PAGE_SIZE`, `MAX_PAGE_SIZE` |
| `backend/src/common/dto/pagination-query.dto.ts` | `PaginationQueryDto` — validated `?page=&limit=`, with defaults and the cap |
| `backend/src/common/dto/pagination-query.dto.spec.ts` | Unit tests, run through a real `ValidationPipe` |
| `backend/src/common/filters/all-exceptions.filter.ts` | Global filter rendering every failure as the error envelope |
| `backend/src/common/filters/all-exceptions.filter.spec.ts` | Unit tests, including the redaction of internal errors |
| `backend/src/common/interceptors/response.interceptor.ts` | Global interceptor wrapping every successful body |
| `backend/src/common/interceptors/response.interceptor.spec.ts` | Unit tests for objects, arrays, empty and falsy payloads |
| `backend/src/common/utils/pagination.util.ts` | `toSkipTake()` and `buildPaginatedResult()` |
| `backend/src/common/utils/pagination.util.spec.ts` | Unit tests for the offset arithmetic and the metadata |
| `backend/src/common/utils/date.util.ts` | `toIsoTimestamp()` — the API's timestamp format, defined once |
| `backend/src/common/utils/date.util.spec.ts` | Unit tests |
| `FEATURES/006-shared-backend-infrastructure.md` | This document |

## Files Modified

| File | Change |
| --- | --- |
| `backend/src/config/app.setup.ts` | Registers `ResponseInterceptor` and `AllExceptionsFilter` globally |
| `backend/test/app.e2e-spec.ts` | Expects the success envelope; new case for the error envelope on an unmatched route |
| `FEATURES/HISTORY.md` | Feature 006 row |
| `FEATURES/README.md` | Feature 006 row |

## Notes

- Nothing here is a base class. A `BaseService<T>` or `BaseController<T>` would
  have to guess what the modules need before one exists, and the parts that are
  genuinely common — the envelopes and the pagination arithmetic — are already
  shared as functions, which no module has to inherit from to use.
- The envelope is applied globally rather than per-controller precisely so it
  cannot be forgotten. The cost is that any endpoint needing a raw body (a file
  download, a webhook reply with a third-party's required shape) must opt out;
  the way to do that is a `@NoEnvelope()` decorator read by the interceptor via
  `Reflector` — not written now, because no such endpoint exists.
- `path` in the error envelope is `request.url`, which includes the query
  string. Worth revisiting if a future endpoint accepts a sensitive value as a
  query parameter, since the value would then also appear in the error log.

## Future Improvements

- Add `@NoEnvelope()` when the first endpoint legitimately needs a raw body.
- Add sorting and filtering DTOs alongside `PaginationQueryDto` once the first
  list endpoint shows which fields are actually sorted and filtered on.
- Map Prisma's known errors (`P2002` unique violation, `P2025` record not found)
  onto the right HTTP status inside a dedicated `PrismaExceptionFilter`, so
  services throw domain errors instead of translating driver codes. This belongs
  to the first module that writes to the database, where the mapping can be
  verified against real constraints.
- Once Swagger arrives, the envelopes need `@ApiExtraModels` wrappers or the
  generated schema will describe the handler's return type rather than what the
  client receives.
