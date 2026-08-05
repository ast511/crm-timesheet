# Feature 026 — Notification Center

**Status:** Completed
**Date:** 2026-08-05

## Goal

Build the notification centre: the place notifications are **stored, retrieved,
marked, deleted and searched**. Two workspaces — a personal inbox every employee
has, and an administrative inbox the people who run the company share — served by
one table, one service and one repository.

Explicitly **not** included, and deliberately left to the Notification Delivery
Engine that follows: WebSockets, Socket.IO, email, Nodemailer, background jobs,
cron, the reminder scheduler, notification templates, broadcasting, and any
automatic creation of a notification from an event. Also not included: RBAC.
Section [Why the centre is separated from the delivery
engine](#why-the-centre-is-separated-from-the-delivery-engine) explains why that
line is where it is.

## Requirements

- One `Notification` model, with the workspace, the addressing, the content, the
  classification and the read state.
- Four legal ways to address a notification, and four illegal ones refused.
- Two workspace-scoped list endpoints, both paginated, searchable, filterable and
  sortable, reusing [Feature 006](006-shared-backend-infrastructure.md).
- Mark one read, mark a whole workspace read, delete one, empty a whole
  workspace.
- A temporary `POST` so the centre can be exercised before anything produces
  notifications.
- A single authentication placeholder returning `userId`, `employeeId`, `role`
  and `administrativeAccess`, with no user hardcoded anywhere.
- Controllers thin, rules in the service, Prisma only in the repository.

## Decisions taken before implementation

Four points where the specification met an existing project rule. Each was put to
the user and settled before any code was written.

| Question | Decision | Why |
| --- | --- | --- |
| `recipientRole` spelling | Reuse `UserRole` (`SUPERADMIN`, `ADMIN`, `HR`) | A second enum saying `SUPER_ADMIN` would mean every query joining a notification to the person reading it translated between two vocabularies, forever. Cost: the column's type also admits `USER`, which the service refuses. |
| Per-user read state | Ship the single `isRead` column as specified | Correct for a notification addressed to one person, a stated limitation for a broadcast. See [Read and unread](#read-and-unread). |
| `?workspace=` filter | Omitted | The workspace is the scope, and the scope is the URL. [Feature 015](015-scoped-membership-endpoints.md)'s rule: a scope in the path must never also be a filter. `GET /notifications?workspace=ADMINISTRATIVE` could only ever return an empty page. |
| `update-notification.dto.ts` | Not created | No endpoint takes an update body — `PATCH /:id/read` and `read-all` carry none. CLAUDE.md forbids dead code, and [Feature 006](006-shared-backend-infrastructure.md) set the precedent of not creating files with no caller. It becomes a one-file addition the day a notification has an editable field. |

## Database

### The `Notification` model

One table, `notifications`, and five new enums. Every enum value is stored
lower-case, like every other enum in this schema.

| Column | Type | Notes |
| --- | --- | --- |
| `id` | `String` cuid | |
| `workspace` | `NotificationWorkspace` | `PERSONAL` / `ADMINISTRATIVE`. Not defaulted. |
| `recipientType` | `NotificationRecipientType` | `USER` / `ROLE` / `ALL_USERS` / `ADMINISTRATIVE_USERS`. Not defaulted. |
| `recipientUserId` | `String?` → `users.id` | Set only for `USER`. `ON DELETE CASCADE`. |
| `recipientRole` | `UserRole?` | Set only for `ROLE`. Only the three administrative values are legal. |
| `title` | `String` | Bounded at 150 by the API. |
| `message` | `String` | Bounded at 5000 by the API. Plain text. |
| `category` | `NotificationCategory` | `GENERAL` (default) / `SYSTEM` / `TIMESHEET` / `LEAVE` / `REMINDER` / `MAINTENANCE`. |
| `type` | `NotificationType` | `INFO` (default) / `SUCCESS` / `WARNING` / `ERROR`. |
| `priority` | `NotificationPriority` | `LOW` / `MEDIUM` (default) / `HIGH`. |
| `isRead` | `Boolean` | Default `false`. |
| `readAt` | `DateTime?` | Set with `isRead`, never independently. |
| `createdAt` / `updatedAt` | `DateTime` | |

Five things about it are worth recording.

**`category` and `type` are separate on purpose.** One says where the
notification came from, the other how urgent it looks. A rejected leave request
is `LEAVE` + `ERROR`; a finished import is `SYSTEM` + `SUCCESS`. Folded into one
column, "show me every leave notification" would be unanswerable.

**`workspace` is stored rather than derived** from `recipientType`, even though
the legal pairings correlate them. They answer different questions and only one
of them is a *scope*: the workspace is what a URL selects and what "mark
everything read" acts over, while the recipient type says how one row inside it
is addressed. Deriving either from the other would make every list query reason
about the mapping instead of naming the column.

**`priority` is declared low-to-high**, and the order is not cosmetic:
PostgreSQL sorts an enum by its declaration order, so
`?sortBy=priority&sortOrder=desc` puts `HIGH` first because of that list. It
matches `ProjectPriority` so the two cannot drift into sorting opposite ways.

**`recipient_user_id` cascades on delete** — the second cascade in this schema
after `leave_request_replacements`, and the argument is the same. A notification
addressed to one person says nothing once that account is gone: nobody can read
it, and no list will ever return it. `RESTRICT` would only make an account
undeletable for the sake of messages nobody can see. Every other reference to a
person in this schema is `RESTRICT`, because those record something that
*happened*; this records something somebody was *told*.

**`title` and `message` are `TEXT`** with the bounds applied by the API. That is
the call every other free-text column here makes; `VARCHAR(7)` on
`Project.color` is different, because there the width *is* the format.

### Indexes

Unlike the configuration tables of Features 016–021 — tens of rows, left
unindexed on purpose — this table gains a row for every event the delivery engine
will ever announce, to every person it announces to, and never shrinks.

Both list queries have the same shape:

```sql
WHERE workspace = … AND (addressed to me OR broadcast)
ORDER BY created_at DESC
```

so each index carries `created_at` last. PostgreSQL can then satisfy the filter
and the ordering from one scan rather than sorting the matches afterwards.

| Index | Serves |
| --- | --- |
| `(recipient_user_id, created_at)` | the personal list's directly addressed half |
| `(recipient_role, created_at)` | the administrative list's |
| `(workspace, recipient_type, created_at)` | both broadcasts, and the workspace scope every query starts from |

### No CHECK constraints

The addressing rules are not expressed in the schema. Which workspace/recipient
pairings are legal and which of the two id columns each requires are **one rule**
— the pairing decides the column — so stating half of it in SQL would leave the
readable half in the application anyway, and the constraint would have to be
dropped and rewritten the day a fifth recipient type exists. `NotificationService`
enforces both and reports which pairing was wrong.

### Migration

`backend/prisma/migrations/20260805140000_add_notifications/migration.sql`.

Purely additive: five enums and one table are created; no existing column is
dropped, narrowed or back-filled, and nothing already recorded changes meaning.
Applying it to a populated database costs one empty table. `User` gains a
`notifications` back-relation, which is a Prisma-side declaration and produces no
SQL of its own.

**The command, which has not been run:**

```bash
cd backend && npm run prisma:migrate
```

## The two workspaces

### PERSONAL

The inbox every employee has, containing what the system tells them about
themselves: leave approved, leave rejected, timesheet approved, timesheet
rejected, a reminder to complete a timesheet, a maintenance notice, a company
announcement.

Every role has one, administrators included — their leave is approved and their
timesheet is due like anybody's, so there is no access check on this workspace
beyond knowing who is calling.

A caller sees:

- notifications addressed to their account (`recipientType = USER`,
  `recipientUserId = them`), and
- every `ALL_USERS` announcement.

### ADMINISTRATIVE

The back-office inbox the people running the company share: a leave request was
submitted, a timesheet was submitted, an employee was created, updated or
deleted, approvals are waiting, an import completed, a synchronisation failed.

**It is an interface, not a role.** `SUPERADMIN`, `ADMIN` and `HR` all open the
same workspace and all see the same `ADMINISTRATIVE_USERS` announcements. What
differs between them is which `ROLE` notifications reach them, and that is
*addressing* rather than permission. Which menus each role is shown is the later
RBAC feature and is decided nowhere in this module.

A caller sees:

- notifications addressed to their role (`recipientType = ROLE`,
  `recipientRole = theirs`), and
- every `ADMINISTRATIVE_USERS` announcement.

A caller without `administrativeAccess` gets a **403**, not a 404. The workspace
is not a secret — its URL is in this document — and hiding the route would send
an administrator whose role header was wrong to look for a typo in the path.

That check is also not authorization arriving early. Without it, the
`ADMINISTRATIVE_USERS` recipient type would match anybody who asked, and every
employee would receive the back-office broadcasts. It is what that recipient type
*means*.

## Recipient types

| Type | `recipientUserId` | `recipientRole` | Reaches |
| --- | --- | --- | --- |
| `USER` | **required** | must be null | one employee |
| `ROLE` | must be null | **required** | one administrative role |
| `ALL_USERS` | must be null | must be null | every employee, in `PERSONAL` |
| `ADMINISTRATIVE_USERS` | must be null | must be null | every administrative user, in `ADMINISTRATIVE` |

### The four legal combinations

| Workspace | Recipient type |
| --- | --- |
| `PERSONAL` | `USER` |
| `PERSONAL` | `ALL_USERS` |
| `ADMINISTRATIVE` | `ROLE` |
| `ADMINISTRATIVE` | `ADMINISTRATIVE_USERS` |

Everything else is a `400`. `PERSONAL` + `ROLE` would file a message addressed to
HR in employees' personal inboxes; `ADMINISTRATIVE` + `USER` would put a message
about one person in the back-office feed. Neither is a shape the two list queries
could serve — the visibility filters are built on the assumption that this table
holds.

The table lives in `WORKSPACE_RECIPIENT_TYPES`, written once as data rather than
as four `if` statements, because a table cannot fall out of step with itself the
way a pair of branches can.

**The refusals matter as much as the requirements.** A `ROLE` notification
carrying a `recipientUserId` is not merely untidy: the field would be stored, and
a later reader could not tell whether the message was meant for a role or for a
person. Silently dropping it would be worse — the caller would believe they had
addressed somebody. Every problem is reported at once, as an array, so a form can
mark each offending field.

### Why `recipientRole` is a `UserRole`

The three administrative roles already have stored spellings — `superadmin`,
`admin`, `hr` — and a notification-specific enum saying `super_admin` would mean
every query joining a notification to the person reading it had to translate
between two vocabularies, forever. The delivery engine's role lookup is then a
direct column comparison:

```ts
where: { recipientRole: user.role }   // no map, no translation
```

The cost is stated rather than hidden: the column's type also admits `USER`,
which is not a legal value here. `@IsIn(ADMINISTRATIVE_ROLES)` on the DTO refuses
it, and `ADMINISTRATIVE_ROLES` in `src/common/constants/role.constants.ts` is the
one list of the three that qualify — reusable by RBAC when it arrives.

## Read and unread

`PATCH /notifications/:id/read` sets `isRead = true` and `readAt = now`, in one
statement. Two columns rather than one because `updatedAt` moves whenever any
column does and so cannot say when the notification was read.

The timestamp comes from the server rather than the client, for the reason every
other decided-at column in this project does: a client's clock is not a fact
about when something happened here.

**Marking is idempotent.** Reading an already-read notification succeeds, changes
nothing and does not move `readAt`. Two tabs opening one message is not a mistake
worth a `409`, and rewriting the timestamp would replace the moment somebody
*first* read it with the moment they last clicked.

**`read-all` moves only what is unread.** Without that term, the operation would
rewrite `readAt` on everything the person had already read and would report a
count answering "how many can I see" rather than "how many did this change".

Both bulk operations return `{ "affected": n }` rather than `null`, because
"nothing was unread" and "the request did nothing" are worth telling apart — and
on a destructive operation, that is exactly what a person wants confirmed.

### The broadcast limitation

**`isRead` is one column on the notification row.** For a `USER` notification
that is exactly right. For a broadcast it is a known limitation:

- the first person to read an `ALL_USERS` announcement marks it read **for
  everybody**;
- `DELETE /notifications/:id` on a broadcast removes it **for everybody**;
- `DELETE /notifications` empties the shared announcements as well as the
  caller's own.

This is the model the feature was specified with, and it was confirmed
deliberately rather than arrived at by accident. Correcting it is additive and
needs a per-user join table:

```text
notifications        the message
notification_reads   (notification_id, user_id, read_at)   ← the fix
```

With that table, the read flag comes from a `LEFT JOIN` on the reader, deleting a
broadcast writes a dismissal row instead of removing the message, and `is_read` /
`read_at` on `notifications` either go away or stay as the delivery engine's
record of the direct case. It is a migration, a repository change and a query
change; no API contract moves. See [Future Improvements](#future-improvements).

## API

Base path `/api/v1`, from `configureApp`. Every response uses [Feature
006](006-shared-backend-infrastructure.md)'s envelope.

| Method | Path | Returns |
| --- | --- | --- |
| `GET` | `/notifications` | paginated personal notifications |
| `GET` | `/administrative/notifications` | paginated administrative notifications |
| `GET` | `/notifications/:id` | one notification, from either workspace |
| `POST` | `/notifications` | the created notification (**temporary**) |
| `PATCH` | `/notifications/:id/read` | the notification, now read |
| `PATCH` | `/notifications/read-all` | `{ affected }` |
| `PATCH` | `/administrative/notifications/read-all` | `{ affected }` |
| `DELETE` | `/notifications/:id` | `null` |
| `DELETE` | `/notifications` | `{ affected }` |
| `DELETE` | `/administrative/notifications` | `{ affected }` |

### Why the by-id routes are not duplicated per workspace

An id identifies a notification, not an inbox. `GET /notifications/:id`,
`PATCH /notifications/:id/read` and `DELETE /notifications/:id` serve **both**
workspaces: the service offers the caller every audience they hold — their
personal one always, the administrative one when their role has access — and
answers `404` if none of them contains the row. A parallel set under
`/administrative/notifications/:id` would force a client holding an id to know
which workspace it came from before it could choose a URL, and would differ only
in which of the two lookups it refused to perform.

### Status codes

| Situation | Code |
| --- | --- |
| A notification the caller cannot see, or one that does not exist | `404` |
| The administrative workspace, without an administrative role | `403` |
| An illegal workspace/recipient combination, or a missing/refused id field | `400` |
| A recipient account that does not exist | `400` |
| A rejected query parameter or body field | `400` |

A notification the caller may not see answers the same `404` as one that does not
exist. Distinguishing them would make `GET /notifications/:id` a way to confirm
that a message was sent to somebody else — the same call
`LeaveRequestsService` makes for somebody else's leave request.

### Pagination

Straight from [Feature 006](006-shared-backend-infrastructure.md), with nothing
added: `NotificationQueryDto extends SortQueryDto extends PaginationQueryDto`, so
`?page=` and `?limit=` carry the shared defaults (1 and 20), the shared minimum
and the hard cap of 100 that **rejects** rather than clamps. `toSkipTake()` does
the offset arithmetic and `buildPaginatedResult()` assembles the envelope:

```json
{
  "success": true,
  "data": {
    "items": [],
    "meta": {
      "page": 1, "limit": 20, "total": 57, "totalPages": 3,
      "hasPreviousPage": false, "hasNextPage": true
    }
  }
}
```

The rows and the total are read in one `$transaction`, so both see the same
snapshot. On a feed that gains rows constantly, a `total` that does not describe
the page just returned is not a rare race.

### Search

Case-insensitive substring over **`title` and `message`**, via Prisma's
`mode: 'insensitive'`.

Both, because a title is a summary somebody wrote and the detail a person
half-remembers — a project code, a colleague's name, a date — is usually in the
body. Searching the title alone would fail on exactly the query people type.

Nothing else is searched: `category`, `type` and `priority` are closed
vocabularies with exact filters of their own, where a substring would guess.
Absent and empty are the same thing.

### Filters and sorting

| Parameter | Values |
| --- | --- |
| `?category=` | the six categories |
| `?type=` | the four types |
| `?priority=` | the three priorities |
| `?isRead=` | `true` / `false` |
| `?search=` | up to 100 characters |
| `?sortBy=` | `createdAt` (default), `priority`, `title` |
| `?sortOrder=` | `asc` / `desc` (**default `desc`**) |

The filters are independent and combine with `AND`.

`?workspace=` is **not** offered — see [Decisions](#decisions-taken-before-implementation).

`?sortBy=isRead` is deliberately absent: unread-first is what a reader wants, but
that is a *filter* (`?isRead=false`), not an ordering. Sorting by it would put the
read ones on a later page instead of leaving them out.

**`sortOrder` defaults to `desc`, the only list in this API that does.** Every
other collection here is a register read in a stable order somebody chose; an
inbox is a feed, where the row that matters is the one that arrived last.
Ascending would open every notification list on its oldest message.

The ordering tie-breaks on `id`, and the tie-break **turns with the sort** rather
than being fixed ascending as in the other modules. Those default to ascending so
the two agree there anyway; here a `createdAt desc` page whose ties resolved
ascending would interleave a simultaneous batch backwards.

## Backend

### Structure added

```text
backend/src/modules/notifications/
├── administrative-notification.controller.ts
├── notification.controller.ts
├── notification.service.ts
├── notification.service.spec.ts
├── notification.repository.ts
├── notification.repository.spec.ts
├── notification.constants.ts
├── notification.module.ts
├── routing.spec.ts
├── dto/
│   ├── create-notification.dto.ts
│   ├── create-notification.dto.spec.ts
│   ├── notification-query.dto.ts
│   └── notification-query.dto.spec.ts
└── entities/
    └── notification.entity.ts

backend/src/common/
├── constants/role.constants.ts
└── decorators/current-user.decorator.ts (+ .spec.ts)
```

### The repository pattern

**This is the first repository in the project**, and the departure is
deliberate. Every other module puts its queries straight into its service, which
was right for them: a departments service is a handful of `findMany` calls whose
`WHERE` is the query DTO, and a layer between it and Prisma would have been a
file that forwarded arguments.

This module earns one for a specific reason. **"What may this person see" is a
single predicate — a workspace, plus either an account or a role, ORed with that
workspace's broadcasts — and seven operations need it:** both lists, the single
read, marking one read, marking all read, deleting one, and deleting all. Written
inline it would be seven copies of a condition whose every clause is a way to
leak somebody else's mail, and the copy that eventually forgot the `workspace`
term would show administrative broadcasts to every employee.

```ts
// PERSONAL
{ workspace: PERSONAL,
  OR: [ { recipientType: USER, recipientUserId: me },
        { recipientType: ALL_USERS } ] }

// ADMINISTRATIVE
{ workspace: ADMINISTRATIVE,
  OR: [ { recipientType: ROLE, recipientRole: myRole },
        { recipientType: ADMINISTRATIVE_USERS } ] }
```

The `workspace` term is not redundant with the recipient types, even though the
legal pairings make it look so. It is the guarantee that survives a row written
before the rule existed or by something other than this service: a `USER`
notification somehow filed as `ADMINISTRATIVE` stays out of the personal list
rather than leaking into it because its recipient type happened to match.

The seam it creates is worth stating plainly:

| Layer | Knows about |
| --- | --- |
| Controller | HTTP, the DTOs, the caller decorator. No rules. |
| Service | audiences, ids, DTOs, entities. **Never imports `Prisma`.** |
| Repository | every `where`, `orderBy`, `select`, `$transaction`. Nothing else. |

The service reasons in `NotificationAudience` — a discriminated union rather than
one object with two optional fields, because the two workspaces are answered by
genuinely different questions and an optional-field shape would let a caller
construct an audience that says nothing. Turning that into a `WHERE` happens in
one function, in one file.

`buildFilters` returns an **array** to be `AND`ed rather than an object to be
merged. Merged, the search's own `OR` key would silently replace the audience's
and the endpoint would return every notification in the database whose title
matched. The repository spec pins that.

### The authentication placeholder

`@CurrentUser()` in `src/common/decorators/current-user.decorator.ts` assembles
the caller from headers:

| Header | Meaning |
| --- | --- |
| `x-user-id` | **required** — the account, which notifications are addressed to |
| `x-user-role` | **required** — matched against `recipientRole`, case-insensitive |
| `x-employee-id` | optional — reused from [Feature 023](023-leave-requests.md) |

It returns `{ userId, employeeId, role, administrativeAccess }`.

Four properties of how it is done:

1. **One seam, one file.** Every notification route reads the caller through this
   decorator and nothing else. When authentication arrives, the body of
   `resolveCurrentUser` becomes `request.user` and no controller, service,
   repository, DTO or test signature moves.
2. **Nothing is hardcoded and nothing is defaulted.** There is no fallback user,
   no "assume admin in development", no id baked into a service. A request that
   does not say who is calling is a `400` naming the header it left out — the
   only answer that stays correct once the header becomes a token.
3. **`administrativeAccess` is derived from the claimed role**, never sent. A
   header of its own would let a caller claim `USER` and administrative access at
   once, and would give the application two sources for one fact. A routing test
   pins that sending `x-administrative-access: true` changes nothing.
4. **It authenticates nothing and authorises nothing.** Any caller may claim any
   account and any role. That is the honest shape of an API whose auth feature has
   not been written; half an access check reads as protection while providing
   none.

`employeeId` is optional because not every account has an employment record — a
super-admin created to administer the system is the obvious case — and no
notification route reads one. It is carried because the seam should describe the
caller once.

`resolveCurrentUser` is a plain exported function with the decorator wrapping it,
so the header rules can be unit-tested directly; a param decorator's logic runs
inside Nest's pipeline, where a direct call would test nothing. The routing spec
still drives it through real requests.

### Why two controllers and one service

The controllers are two because the personal and administrative workspaces are
two **inboxes**, read by different people at different moments and never read
together. The service is one because the rules they enforce — visibility,
addressing, read state — are the same rules, and splitting it would have given
the visibility predicate two homes.

That is also why a single list with `?workspace=` would have been wrong twice
over: it would have mixed two feeds nobody reads together, and it would have
offered a second way to state something the URL already says.

### Module dependencies

`NotificationModule` imports **`UserModule` and nothing else** — the narrowest
import list of any module in this half of the project, and that is the point. A
notification is a message with an address on it, so the only other table this
module has business touching is `users`, and it touches that through
`UserService.findEmployeeLink` to confirm a recipient exists rather than by
querying the table. That is the rule every module here follows, and for `users`
it is what keeps "never return the password hash" enforceable in one place.

Note what is **not** imported. [Feature 023](023-leave-requests.md) exported
`LeaveRequestsService` saying "the notifications feature will have to know when a
request changes state". That hand-off is real and is **not** taken up here: this
module does not watch leave requests, timesheets, employees or imports, because
it does not decide when a notification is born. `EmailModule` is likewise absent.

`NotificationService` is exported, because the delivery engine will create
notifications *through it* rather than by writing the table — which is what keeps
the addressing rules enforced in one place however a notification comes to exist.
No method is written for that caller in advance.

## Why the centre is separated from the delivery engine

The single most consequential decision in this feature, so it is worth stating in
full.

**They change for different reasons.** The centre answers "what has this person
been told, and has it been read". The engine answers "when should somebody be
told, and how does the message reach them". A new leave-notification rule, a new
email template, a change of socket library, a reminder moved from 09:00 to 08:00
— every one of those is an engine change and none of them is a reason to touch a
table of stored messages.

**The centre is testable without any of the engine's machinery.** Everything in
this feature is exercised by 140 unit tests with no SMTP server, no socket, no
scheduler and no clock to fake. Had creation been event-driven from the start,
testing "can HR see a notification addressed to HR" would have required staging a
leave request, approving it, and waiting for a listener.

**The dependency runs one way, and this is the direction that keeps it acyclic.**
The engine will import `NotificationModule` and call `NotificationService.create`.
Had this module instead subscribed to leave requests, timesheets, employees and
imports, it would depend on nearly every module in the application and would gain
a reason to change every time any of them did. Wiring that now would have
inverted the graph before there was anything to wire.

**The addressing rules end up enforced once.** Because creation goes through this
service, the engine cannot write a `PERSONAL` + `ROLE` row however it is
provoked. Had the engine written the table directly, the four-combination rule
would have had two enforcement points and one of them would eventually have been
the lenient one.

**The temporary `POST` is the seam made visible.** It exists so the centre can be
exercised before the engine is written; the engine replaces it, and the DTO it
validates is the shape the engine will write.

## Frontend

No change — the frontend directory is still empty. When it is built:

- the two workspaces are two screens, not one with a toggle;
- `recipientType` on each row is what distinguishes a personal message from a
  broadcast, and a broadcast's shared read state should be visible in the UI
  rather than surprising;
- `?isRead=false` is the unread badge's query, and `meta.total` is its number;
- the unread **count** currently costs a page request with `limit=1`; see
  [Future Improvements](#future-improvements).

## Testing

| Spec | Covers |
| --- | --- |
| `current-user.decorator.spec.ts` | each header required or optional, trimming, the length bound, a header sent twice, an unknown role, case-insensitivity, `administrativeAccess` derived and not trusted, `isAdministrativeRole` |
| `create-notification.dto.spec.ts` | required fields, the two length bounds at and past the limit, trimming, whitespace-only titles, the five closed vocabularies, `recipientRole` refusing `USER`, the three defaults, and that combination rules are **not** judged here |
| `notification-query.dto.spec.ts` | the `desc` default and that it can still be overridden, inherited pagination and the cap, every sort field, `isRead` conversion and its rejection of `yes`, search trimming and bound, and that `?workspace=` and `?recipientUserId=` are rejected |
| `notification.repository.spec.ts` | both visibility predicates asserted against the `where` Prisma is handed, the `workspace` term's presence, the count matching the page, filters `AND`ed rather than merged, the search covering both columns, the id tie-break turning with the sort, and the `isRead: false` term on `markAllRead` |
| `notification.service.spec.ts` | audience construction per workspace, the `403` on all three administrative routes, both audiences offered to an administrator, `404` for invisible rows, idempotent marking, visibility checked before every write, all four legal combinations, all four illegal ones, both required-field and both refused-field messages, two problems reported at once, and the recipient lookup going through `UserService` |
| `routing.spec.ts` | the two prefixes not colliding, `read-all` not being read as an id, `DELETE` on the collection versus one row, absent routes (`PATCH /:id`, administrative `POST` and `:id`), header propagation, and query/body validation at the route |

Results: `npm run typecheck` clean, `npm test` **1539 passed** (83 suites),
`npm run test:e2e` 44 passed, `npm run build` clean, `prettier --check` clean.

## Files Created

| File | Purpose |
| --- | --- |
| `backend/prisma/migrations/20260805140000_add_notifications/migration.sql` | Five enums, the `notifications` table, three indexes, one cascading foreign key |
| `backend/src/common/constants/role.constants.ts` | `ADMINISTRATIVE_ROLES`, `AdministrativeRole`, `isAdministrativeRole` |
| `backend/src/common/decorators/current-user.decorator.ts` | `@CurrentUser()`, the `CurrentUser` shape, `resolveCurrentUser`, the header constants |
| `backend/src/common/decorators/current-user.decorator.spec.ts` | Unit tests for the header rules |
| `backend/src/modules/notifications/notification.constants.ts` | Bounds, sort fields, and `WORKSPACE_RECIPIENT_TYPES` |
| `backend/src/modules/notifications/notification.module.ts` | Wires two controllers, the service and the repository |
| `backend/src/modules/notifications/notification.controller.ts` | `/notifications` — the personal workspace and the by-id routes |
| `backend/src/modules/notifications/administrative-notification.controller.ts` | `/administrative/notifications` — the back-office workspace |
| `backend/src/modules/notifications/notification.service.ts` | Every rule: visibility, addressing, read state, workspace access |
| `backend/src/modules/notifications/notification.service.spec.ts` | Unit tests |
| `backend/src/modules/notifications/notification.repository.ts` | Every Prisma query, and the visibility predicate |
| `backend/src/modules/notifications/notification.repository.spec.ts` | Unit tests asserting the generated `where` |
| `backend/src/modules/notifications/routing.spec.ts` | Route-collision and header tests through a real application |
| `backend/src/modules/notifications/dto/create-notification.dto.ts` | Body of the temporary `POST` |
| `backend/src/modules/notifications/dto/create-notification.dto.spec.ts` | Unit tests |
| `backend/src/modules/notifications/dto/notification-query.dto.ts` | Query string of both lists |
| `backend/src/modules/notifications/dto/notification-query.dto.spec.ts` | Unit tests, run through a real `ValidationPipe` |
| `backend/src/modules/notifications/entities/notification.entity.ts` | The response shape, the `select`, the row type, the mapper |
| `FEATURES/026-notification-center.md` | This document |

## Files Modified

| File | Change |
| --- | --- |
| `backend/prisma/schema.prisma` | Five enums, the `Notification` model, `User.notifications` |
| `backend/src/app.module.ts` | Registers `NotificationModule` |
| `FEATURES/HISTORY.md` | Feature 026 row |
| `FEATURES/README.md` | Feature 026 row |

## Notes

- **Nothing in this feature creates a notification from an event.** Approving
  leave, submitting a timesheet and finishing an import all leave the table
  untouched. That is the whole separation described above, and it is why
  `LeaveRequestsModule`'s exported service is still unused.
- **The `POST` endpoint is temporary and is documented as such in three places** —
  the controller, the service and the DTO — so it cannot quietly become permanent.
- **The addressing columns are published in the response**, which is worth
  recording because the project's rule is that a response never repeats a scope
  the caller already named. They survive that rule because these lists genuinely
  *mix*: a personal page interleaves `USER` rows with `ALL_USERS` broadcasts, and
  a client has to tell them apart — that distinction is what explains the shared
  read state. `recipientUserId` stays an id rather than becoming a nested object,
  which is the opposite of what `LeaveRequestEntity` does with its foreign keys:
  on `GET /notifications` that id is always the caller's own or null, so resolving
  it would be a join per row to tell somebody who they are.
- **`GET /notifications/:id` is the only route in the project that answers from
  two scopes.** It is justified in the controller and pinned by the service spec.
- **Nothing is authorised except the workspace.** Every route is otherwise open,
  and the feature documents that out loud rather than adding half a check.
- **`updatedAt` on a notification moves when it is marked read**, since `isRead`
  is a column. A client that treats `updatedAt` as "when the message changed" will
  see it move for a reason the recipient caused. `createdAt` is the field to sort
  and display.

## Future Improvements

- **A per-user `notification_reads` table**, so a broadcast's read state and
  deletion are per person rather than shared. The single most valuable follow-up;
  the migration path is described under [Read and
  unread](#the-broadcast-limitation).
- **An unread-count endpoint** — `GET /notifications/unread-count` and its
  administrative twin. A badge currently costs a full page request with
  `?limit=1&isRead=false` and reads `meta.total`, which works but fetches a row
  nobody displays.
- **Retention.** Nothing ever removes a notification except a person clicking
  delete, and the table grows forever. A retention rule — read notifications older
  than N months — belongs with the delivery engine's scheduler rather than here,
  since it is a job.
- **`?category=` and friends accepting several values** (`?category=LEAVE,SYSTEM`).
  Deferred until a screen actually needs it; today's exact filters cover the
  documented cases.
- **A `?dateFrom=` / `?dateTo=` filter** over `createdAt`, once a list grows long
  enough for anybody to want it.
- **Replace `@CurrentUser()` with the authenticated user** when the auth feature
  lands. One function body changes; nothing else in this module does.
- **Rate-limit or bound the temporary `POST`**, if it survives longer than
  expected. It has no caller restrictions at all today.
