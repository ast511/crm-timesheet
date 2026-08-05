# Feature 027 — Notification Management

**Status:** Completed
**Date:** 2026-08-05

## Goal

Let administrators **configure** notifications: the standing reminder rules the
company wants, and the one-off announcements it composes by hand.

Who "administrators" means is not the same for the two sections — reminders are
for `SUPERADMIN` and `ADMIN`, campaigns also for `HR` — but **no endpoint here
enforces it**, because authorization is a later feature. See
[Future Improvements](#future-improvements) for the intended rule.

Two independent sections, one module:

1. **Reminder configuration** — "remind everybody 7 days before the timesheet
   deadline", created, edited, enabled, disabled and deleted.
2. **Manual notification campaigns** — planned maintenance, a company meeting, a
   holiday announcement, an office closure, an emergency notice.

**This feature stores configuration and nothing else.** It sends no email,
creates no `Notification`, broadcasts no WebSocket event, runs no reminder and
executes no campaign. Execution is the Notification Delivery Engine, the feature
that follows. Section [Why nothing is sent here](#why-nothing-is-sent-here)
explains why the line is drawn there.

Also not included, and deliberately: SMTP, Nodemailer, Socket.IO, background
jobs, cron, timesheet integration, leave integration, and RBAC.

> **A note on numbering.** The task described this as Feature 027 in its goal and
> as Feature 026 in its documentation step. 026 is [Notification
> Center](026-notification-center.md), already shipped, and this document must
> not overwrite it — so this is **027**, the next free number. Where the task
> says "Feature 027 will reuse these models", it means the delivery engine, which
> will be **028**. The reuse is described in [What the delivery engine will
> do](#what-the-delivery-engine-will-do-with-these-three-tables).

## Requirements

- Two resources — `/reminders` and `/notification-campaigns` — each with full
  CRUD, pagination, search, filtering and sorting reusing
  [Feature 006](006-shared-backend-infrastructure.md).
- A reminder is a rule with an offset in days, a message and two delivery
  switches; names unique; `daysBeforeDeadline` never negative.
- A campaign carries an audience, a lifecycle, an optional schedule and an
  optional expiry; `SENT` campaigns are neither editable nor deletable.
- Three recipient shapes — one employee, several employees, everybody — with
  **everybody stored as a single row**.
- At least one recipient and at least one delivery method on every campaign.
- The caller taken from the placeholder introduced in
  [Feature 026](026-notification-center.md); no user hardcoded anywhere.
- Controllers thin, rules in the services, Prisma nowhere else.

## Decisions taken before implementation

Four points where the specification met an existing project rule. The first two
were put to the user and settled before any code was written; the other two are
recorded because a reader will otherwise wonder.

| Question | Decision | Why |
| --- | --- | --- |
| One controller/service/repository, as specified? | **Two controllers, two services, no repository** | The module holds two resources that share no query, no predicate and no rule, and they cannot share a `@Controller()` prefix. [Feature 021](021-leave-configuration.md) already does exactly this for leave types and notification addresses. The repository is absent for the reason [Feature 026](026-notification-center.md) gave for *having* one: it exists there because seven operations share one visibility predicate, and every inline copy would leak somebody's mail. Here there is nothing to share, so it would be a file that forwards arguments. |
| How do `DRAFT` / `SCHEDULED` / `CANCELLED` get set? | **Derived from `scheduledAt`, plus an explicit cancel** | A campaign carrying a schedule is `SCHEDULED`; one without is a `DRAFT`. Accepting `status` as an independent field would let a body claim `SCHEDULED` with nothing to fire at — two fields stating one fact, and the engine would have to decide which it believed. `CANCELLED` is the one value a client writes; `SENT` is the engine's. |
| A new `NotificationSeverity` enum? | **Reuse `NotificationType`** | The four values are `INFO`/`SUCCESS`/`WARNING`/`ERROR` in both places, and the engine copies this value straight into `notifications.type`. A second vocabulary would mean translating at every hand-off, forever — the argument Feature 026 made for typing `recipientRole` as `UserRole`. The field is named `severity` for what it is to a reminder; the type is named for where it ends up. |
| A new recipient-type enum, when `NotificationRecipientType` exists? | **Yes — `CampaignRecipientType`** | The opposite call to the one above, and for a reason that shows why the first is not simply "always reuse": that enum addresses a `users` account or a `UserRole`, this one addresses an `employees` row. Sharing them would make `USER` mean an account in one table and a person in another. Vocabularies are shared when they name the same thing, not when they look alike. |

## Database

Two enums, three tables, and a note about a fourth thing that does not exist.

### The `Reminder` model

Table `reminders`. Configuration, like [Feature 016](016-work-schedule-configuration.md)'s
schedule and [Feature 021](021-leave-configuration.md)'s leave types: it
describes what the company wants, not that anything happened.

| Column | Type | Notes |
| --- | --- | --- |
| `id` | `String` cuid | |
| `name` | `String` **unique** | Bounded at 100 by the API. |
| `description` | `String?` | Bounded at 500. |
| `enabled` | `Boolean` | Default `true`. |
| `days_before_deadline` | `Int` | `0`–`366`. Not defaulted. |
| `subject` | `String` | Bounded at 200. |
| `message` | `String` | Bounded at 5000. |
| `severity` | `NotificationType` | Default `INFO`. |
| `priority` | `NotificationPriority` | Default `MEDIUM`. |
| `send_email` | `Boolean` | Default `false`. |
| `send_notification` | `Boolean` | Default `true`. |
| `created_at` / `updated_at` | `DateTime` | |

Four things about it are worth recording.

**`daysBeforeDeadline` is an offset, not a date, and `0` is legal.** "Your
timesheet is due **today**" is the reminder people actually act on, so zero is a
deliberate value rather than a degenerate one. Negatives are refused: a reminder
that fired after the thing it warns about is a data-entry mistake, not a late
reminder. The upper bound is a year — and it is not cosmetic, because the column
is a PostgreSQL `integer` and a value past 2³¹−1 would surface as a `500` from
the driver instead of a `400` naming the field.

**Which deadline is not named**, and that is deliberate. The only deadline this
application has is the timesheet's, and the Timesheets module does not exist yet;
a `deadlineType` column would be a vocabulary of one value, invented before the
thing it describes. The engine applies these rules to the timesheet deadline, and
the day a second kind of deadline exists this table gains a column rather than a
meaning.

**The message is stored as text, not as a template.** A placeholder vocabulary
(`{{employee}}`, `{{deadline}}`) is a small language, and fixing its syntax before
a single reminder has been sent would settle a question nothing has yet asked.
Templating belongs with the engine that renders it.

**`enabled` is a column, not a delete.** A rule paused for a quarter keeps its
wording, its offset and its name instead of having to be retyped — the call
`LeaveType.isActive` already makes.

### The `NotificationCampaign` model

Table `notification_campaigns`.

| Column | Type | Notes |
| --- | --- | --- |
| `id` | `String` cuid | |
| `subject` | `String` | Bounded at 200. |
| `message` | `String` | Bounded at 5000. |
| `severity` | `NotificationType` | Default `INFO`. |
| `priority` | `NotificationPriority` | Default `MEDIUM`. |
| `send_email` / `send_notification` | `Boolean` | `false` / `true`. |
| `status` | `NotificationCampaignStatus` | Default `DRAFT`. Derived — see below. |
| `scheduled_at` | `DateTime?` | Null on a draft. |
| `expires_at` | `DateTime?` | Null when it never goes stale. |
| `sent_at` | `DateTime?` | **Always null in this feature.** |
| `created_by_employee_id` | `String` → `employees.id` | `RESTRICT`. |
| `created_at` / `updated_at` | `DateTime` | |

**`status` is derived from `scheduled_at`**, which is the decision the whole
lifecycle rests on. One fact, one column, and no row that can claim to be
scheduled with nothing to fire at.

**`sent_at` exists and is written by nothing.** It is created now so the delivery
engine records the fact without a migration. It is a separate column from
`updated_at` for the reason `leave_requests` keeps `processed_at` beside
`status`: `updated_at` moves whenever any column does, so it cannot say when a
campaign was sent.

**`created_by_employee_id` is `RESTRICT`**, unlike `notifications.recipient_user_id`,
which cascades. The distinction is the one this schema draws everywhere: a
notification records something somebody was *told*, which says nothing once their
account is gone; a campaign records something somebody *did*, and the act outlives
the author's employment record.

**It is an employee, not a user**, so the author renders as a name beside the
campaign without a second join through `users` — the call
`leave_requests.processed_by_id` already makes.

### The `NotificationRecipient` model

Table `notification_recipients`.

| Column | Type | Notes |
| --- | --- | --- |
| `id` | `String` cuid | |
| `campaign_id` | `String` → `notification_campaigns.id` | **`CASCADE`**. |
| `recipient_type` | `CampaignRecipientType` | `EMPLOYEE` / `ALL_EMPLOYEES`. |
| `employee_id` | `String?` → `employees.id` | `RESTRICT`. Null for `ALL_EMPLOYEES`. |
| `created_at` | `DateTime` | |

**It has a surrogate `id`**, unlike `LeaveRequestReplacement` whose identity is
its pair of foreign keys. It has to: `employee_id` is nullable here, so the pair
cannot be a primary key and the `ALL_EMPLOYEES` row would have no identity at all.

**There is no `updated_at`.** Nothing about an audience entry is editable —
changing who a campaign is for means replacing the set, which is what `PATCH`
does — so a modification timestamp would only ever repeat `created_at`.

**`@@unique([campaignId, employeeId])`** states "one entry per person per
campaign". It deliberately does *not* constrain the `ALL_EMPLOYEES` row, because
PostgreSQL treats nulls as distinct in a unique index; that rule is the service's,
and it has to be — "one such row, and no `EMPLOYEE` rows beside it" is a statement
about the whole set rather than about a pair of columns.

### Indexes

| Index | Serves |
| --- | --- |
| `reminders(name)` UNIQUE | the duplicate rule, and the race the service's check cannot close |
| `notification_campaigns(status, scheduled_at)` | the delivery engine's tick: `WHERE status='scheduled' AND scheduled_at <= now()` |
| `notification_campaigns(created_by_employee_id)` | PostgreSQL does not index a foreign key on its own, and this one is read backwards when `RESTRICT` refuses an employee delete |
| `notification_recipients(campaign_id, employee_id)` UNIQUE | one entry per person per campaign |
| `notification_recipients(employee_id)` | the unique index leads with `campaign_id`, so "which campaigns name this person" cannot use it |

`reminders` gets nothing else. It holds a handful of rows — a company configures
four or five reminders, not four thousand — and PostgreSQL scans that faster than
it would descend an index, the same call Features 016–021 make. `notifications`
is indexed heavily because it grows without bound; these do not, except campaigns,
which grow one row per announcement.

### Migration

`backend/prisma/migrations/20260805160000_add_notification_management/migration.sql`.

Purely additive: two enums and three tables are created; no existing column is
dropped, narrowed or back-filled, and nothing already recorded changes meaning.
Applying it to a populated database costs three empty tables. `Employee` gains two
back-relations, which are Prisma-side declarations and produce no SQL of their own.

**The command, which has not been run:**

```bash
cd backend && npm run prisma:migrate
```

`prisma generate` *was* run, because the new models have to exist as types before
anything compiles. It writes only to the gitignored `src/generated/prisma` and
touches no database.

## Reminder configuration

An administrator maintains a small set of rules:

| Name | `daysBeforeDeadline` | `enabled` |
| --- | --- | --- |
| Timesheet due in a week | 7 | true |
| Timesheet due in 3 days | 3 | true |
| Timesheet due tomorrow | 1 | true |
| Timesheet due today | 0 | true |

Each carries its own `subject`, `message`, `severity`, `priority` and delivery
switches, so the tone escalates as the deadline approaches — a `LOW`/`INFO`
notification a week out, a `HIGH`/`WARNING` one with `sendEmail: true` on the day.

**Names are unique, case-insensitively.** `Timesheet due` and `timesheet due` are
the same rule to a person, while PostgreSQL's index sees two rows, so the service
folds case before the check and the index closes the exact-case race between the
read and the write. Closing the case-variant race too would need a `citext` column
or a functional index — a schema change, and out of scope here; the same position
[Feature 021](021-leave-configuration.md) records for `LeaveType.label`.

**Disabling is `PATCH { "enabled": false }`**, not a sub-resource. `enabled` is a
property of the rule rather than an event in its life, so `POST /reminders/:id/disable`
would be a second way to write one column — the rule
[Feature 015](015-scoped-membership-endpoints.md) recorded. The notification
centre's `PATCH /:id/read` is the contrasting case: marking read also writes a
timestamp from the server's clock, which the caller cannot state.

**Deleting is unguarded**, and it can afford to be: nothing points at a reminder.
It produces no rows, owns no history and is referenced by no foreign key — unlike
a leave type, which is `409`-guarded because balances and requests record what it
meant. Notifications the engine has already produced carry their own text, so
deleting the rule they came from does not unsay them.

## Campaign lifecycle

```text
                 POST (no scheduledAt)
                        │
                        ▼
   PATCH scheduledAt ┌──────┐  PATCH { status: CANCELLED }
        ┌────────────│ DRAFT│──────────────────────────┐
        │            └──────┘                          │
        ▼                ▲                             ▼
   ┌──────────┐          │  PATCH scheduledAt: null ┌──────────┐
   │SCHEDULED │──────────┘                          │CANCELLED │
   └──────────┘                                     └──────────┘
        │  PATCH { status: CANCELLED } ─────────────────▲
        │
        │  the delivery engine, and nothing else
        ▼
    ┌──────┐
    │ SENT │   terminal: not editable, not deletable
    └──────┘
```

| Transition | Written by | How |
| --- | --- | --- |
| → `DRAFT` | client | `POST` without `scheduledAt`, or `PATCH { "scheduledAt": null }` |
| → `SCHEDULED` | client | `POST` with `scheduledAt`, or `PATCH { "scheduledAt": … }` |
| → `CANCELLED` | client | `PATCH { "status": "CANCELLED" }` |
| → `SENT` | **delivery engine only** | not reachable through this API |

**`SENT` and `CANCELLED` are terminal for editing.** `PATCH` answers `409` on
both: a sent campaign's notifications are already in people's inboxes, so editing
the stored announcement would leave it disagreeing with what was delivered, and
cancelling is a decision rather than a pause — reviving a cancelled campaign by
patching it would erase the record that somebody called it off. Composing it again
is a new campaign, which is the honest record of what happened.

**Only `SENT` is terminal for deleting.** A cancelled campaign never went out, so
there is nothing left to explain; a sent one is the only explanation for
notifications still sitting in inboxes.

These are `409`s rather than `403`s throughout. They are statements about the
state of the resource, not about who is asking — the call
[Feature 023](023-leave-requests.md) makes for a request that has been decided.

## Recipient types and the `ALL_EMPLOYEES` optimisation

Three cases in the specification, **two** stored shapes:

| Case | `recipientType` | Rows written |
| --- | --- | --- |
| One employee | `EMPLOYEE` | 1, with that `employee_id` |
| Multiple employees | `EMPLOYEE` | one per id |
| All employees | `ALL_EMPLOYEES` | **exactly 1**, `employee_id` null |

"One employee" and "multiple employees" are the same shape at different sizes,
which is why there is no third recipient type: a list of one is a list.

### Why `ALL_EMPLOYEES` is one row

Three reasons, and the third is the one that matters most.

**It is one insert instead of N.** A company of a thousand people would otherwise
pay a thousand inserts, and a thousand rows of storage, to say one thing.

**The audience is resolved when the campaign is sent.** Somebody hired between
composing and sending is included; somebody who left is not. Expanded at
composition time, the list would freeze the directory as it was on the afternoon
somebody typed the message — and a campaign scheduled three weeks out would go to
the wrong set of people, silently.

**The stored rows say what the author meant.** "Everybody" is the intent; the list
of names is an accident of who happened to be employed that day. It is what lets
the campaign screen show *All employees* rather than a list nobody chose, and what
lets `GET /notification-campaigns/:id` answer with one entry instead of a thousand.

### The exclusivity rule

A campaign holds **either** one `ALL_EMPLOYEES` entry **or** N `EMPLOYEE`
entries, never a mixture — a campaign addressed to everybody *and* to three people
in particular is the first list twice. `NotificationCampaignService` enforces it
on every write, and it is why `recipientType` can be read off the first stored row
for the list payload.

The refusals matter as much as the requirements. `ALL_EMPLOYEES` carrying
`employeeIds` is a `400`, not a silent drop: stored, the ids would make the row
mean two things; dropped, the caller would believe they had narrowed an
announcement that in fact went to the whole company.

## `scheduledAt` and `expiresAt`

Both optional, both nullable, and they answer different questions.

**`scheduledAt` — when the engine should send it.** Absent means a draft nobody
has scheduled. Required to be in the future, judged against the *server's* clock
rather than the client's, for the reason every decided-at value in this project is:
a client's clock is not a fact about when something will happen here.

**A stored schedule is never re-judged.** A campaign scheduled for last Tuesday
that the engine has not yet reached is *late*, not invalid. Re-validating it on
every `PATCH` would refuse a typo fix because time had passed — punishing the
caller for something they did not do. So the future check applies only to a value
the body supplies.

**`expiresAt` — when the announcement stops being worth showing.** Absent means it
never goes stale. Two comparisons, on the **merged** pair rather than on whichever
field the body carried, because moving either end can break the order:

| Situation | Rule |
| --- | --- |
| Both set | `expiresAt` **>** `scheduledAt` — equal is refused too: a campaign over before it begins |
| Only `expiresAt` set | `expiresAt` > now — a draft that has already expired can never be sent usefully |

Nothing in this feature acts on `expiresAt`. What an expiry means for a
notification already delivered is the engine's decision.

Both problems are reported at once, as an array — the shape the global
`ValidationPipe` produces — so a form marks both inputs.

## Why nothing is sent here

The single most consequential decision in this feature, so it is worth stating in
full. The chain now has three links:

```text
  notification-management   what we intend to say        ← this feature
  delivery engine           deciding it is time, and sending
  notifications             what people were told         ← Feature 026
```

**They change for different reasons.** This module answers "what does the company
want to say, and to whom". The engine answers "is it time, and how does the
message reach them". Moving a reminder from 09:00 to 08:00, changing an email
template, swapping the socket library, adding a retry — every one of those is an
engine change and none is a reason to touch a table of stored intentions.
Conversely, editing an announcement's wording should not involve a scheduler.

**Configuration is testable without any of the engine's machinery.** Everything
here is exercised by 178 unit tests with no SMTP server, no socket, no scheduler
and no clock to fake. Had sending been part of it, "can an administrator schedule
a maintenance notice" would have required a mail transport and a fake clock to
answer.

**A campaign has to exist before it is sent.** That is the whole point of `DRAFT`:
composed on Monday, reviewed on Tuesday, scheduled on Wednesday. A feature where
`POST` sent immediately could not offer that, and an announcement to the entire
company is exactly the kind of thing somebody should be able to re-read before it
goes out.

**The dependency runs one way, and this is the direction that keeps it acyclic.**
The engine will import this module and the notification centre; neither imports
the engine. Had this module sent its own notifications it would have needed
`EmailModule`, a socket gateway, a scheduler and `NotificationModule` — four
dependencies for a feature whose job is to store two forms.

**The rules end up enforced once.** Because the engine will read campaigns through
`NotificationCampaignService`, it cannot invent a campaign shape this module would
refuse.

## What the delivery engine will do with these three tables

Written down now so the seam is a plan rather than a hope. Nothing below is
implemented.

**`Reminder`** — on each tick the engine reads the enabled rules
(`GET`-equivalent: `enabled: true`), computes `deadline − daysBeforeDeadline`, and
for the rules that match today produces, per employee who has not yet submitted:
a `Notification` when `sendNotification`, and an email through
[Feature 025](025-email-infrastructure.md)'s `EmailService` when `sendEmail`.
`subject` and `message` become the notification's `title` and `message`;
`severity` becomes `type` — the same enum, no translation — and `priority` carries
across unchanged. `NotificationCategory.REMINDER` is the category that already
exists for it.

**`NotificationCampaign`** — the engine's due query is
`status = SCHEDULED AND scheduled_at <= now()`, which the
`(status, scheduled_at)` index serves. It then writes the notifications, sets
`status = SENT` and `sent_at = now()`, and those two writes are what make `SENT`
mean "this actually happened" rather than "somebody claimed it would".

**`NotificationRecipient`** — resolved at that moment, and this is where the
optimisation pays:

```text
ALL_EMPLOYEES  → every current employee's user account, or one
                 PERSONAL + ALL_USERS notification (one row, one flag)
EMPLOYEE       → the named employees' user accounts, one
                 PERSONAL + USER notification each
```

Both land in the notification centre's `PERSONAL` workspace, through
`NotificationService.create` rather than by writing the table — which is what keeps
Feature 026's four-combination addressing rule enforced in one place.

**One seam is already visible and is recorded rather than papered over:** a
campaign `subject` may be 200 characters and `notifications.title` is bounded at
150. The engine will have to truncate, or `NOTIFICATION_TITLE_MAX_LENGTH` will
have to be widened. Both are decisions for the feature that hits the problem;
silently changing a shipped contract for a feature not yet written would be worse.
`message` is 5000 on both sides, and that agreement is load-bearing rather than
coincidental. See [Future Improvements](#future-improvements).

## API

Base path `/api/v1`, from `configureApp`. Every response uses
[Feature 006](006-shared-backend-infrastructure.md)'s envelope.

| Method | Path | Returns |
| --- | --- | --- |
| `GET` | `/reminders` | paginated reminders |
| `GET` | `/reminders/:id` | one reminder |
| `POST` | `/reminders` | the created reminder (201) |
| `PATCH` | `/reminders/:id` | the updated reminder — including `enabled` |
| `DELETE` | `/reminders/:id` | `null` |
| `GET` | `/notification-campaigns` | paginated campaign summaries |
| `GET` | `/notification-campaigns/:id` | one campaign, recipients resolved |
| `POST` | `/notification-campaigns` | the created campaign (201) |
| `PATCH` | `/notification-campaigns/:id` | the updated campaign |
| `DELETE` | `/notification-campaigns/:id` | `null` |

The spelling is `notification-campaigns` rather than `campaigns`: a bare
"campaign" in a business application is as likely to mean a marketing one, and a
URL is the one place the ambiguity cannot be resolved by context.

There is no `/me` variant and no `?createdByEmployeeId=`. Every administrator
maintains the same list; scoping announcements to whoever typed them would make a
colleague's scheduled campaign invisible to the person covering for them.

**There is no `POST /notification-campaigns/:id/send`, and no
`POST /reminders/:id/disable`.** The first because nothing in this feature sends
anything; the second because `enabled` is a column a `PATCH` writes. The routing
spec asserts both are `404`.

### Status codes

| Situation | Code |
| --- | --- |
| A reminder or campaign that does not exist | `404` |
| A reminder name already taken | `409` |
| `PATCH` on a `SENT` or `CANCELLED` campaign | `409` |
| `DELETE` on a `SENT` campaign | `409` |
| No delivery method; an audience that contradicts its type; a date in the past or out of order; a recipient who does not exist; a rejected field | `400` |

### Pagination, search, filters, sorting

Straight from [Feature 006](006-shared-backend-infrastructure.md), with nothing
added: both query DTOs extend `SortQueryDto extends PaginationQueryDto`, so
`?page=` and `?limit=` carry the shared defaults (1 and 20), the shared minimum
and the hard cap of 100 that **rejects** rather than clamps. `toSkipTake()` does
the offset arithmetic and `buildPaginatedResult()` assembles the envelope. Rows
and total are read in one `$transaction`, so both see the same snapshot.

| | Reminders | Campaigns |
| --- | --- | --- |
| `?search=` | `name`, `subject` | `subject`, `message` |
| filters | `enabled`, `severity`, `priority` | `status`, `severity`, `priority`, `sendEmail`, `sendNotification` |
| `?sortBy=` | `createdAt` (default), `priority`, `subject` | `createdAt` (default), `priority`, `subject`, `scheduledAt` |
| `?sortOrder=` | `asc` (default) / `desc` | same |

**The two searches differ deliberately.** A reminder's body is boilerplate that
would match half the table on any common word, so only the name and the subject
are searched; every campaign says something different, so its body is searched
too — the notification centre's call, for the same reason.

**Both default to ascending**, keeping the project-wide default rather than the
notification centre's `desc`. That override exists because an inbox is a feed
whose newest row is the one that matters; these are administrative registers, and
a second endpoint departing from the shared default would make "which way does
this one sort" a question a client has to ask per endpoint.

`?sortBy=scheduledAt` shows PostgreSQL's null ordering through: a `DRAFT` campaign
has no schedule and sorts last ascending, first descending. Stated rather than
overridden, because both ends are defensible and imposing one would be this API
inventing an opinion the database does not have.

`?recipientType=` is not offered — it would be a filter over another table's rows
dressed as a property of this one.

### The two campaign payloads

`GET /notification-campaigns` returns a **summary**: everything about the
announcement, plus `recipientType` and `recipientCount`, both derived from the
stored rows. `GET /:id`, `POST` and `PATCH` return the summary **plus**
`recipients`, each resolved to `{ id, employeeCode, firstName, lastName }`.

The split is not decoration. Resolving every recipient on a list would join
`employees` up to 200 times per row, so a full page of 100 campaigns would carry
twenty thousand nested objects to render a column that says "3 recipients".

`recipientCount` is **`1` for `ALL_EMPLOYEES`** — it is the stored row count, not
the size of the audience, and nothing here knows how many people will be employed
when the campaign goes out. A client shows a number for `EMPLOYEE` and the words
"All employees" for the other.

## Backend

### Structure added

```text
backend/src/modules/notification-management/
├── notification-management.module.ts
├── notification-management.constants.ts
├── notification-management.rules.ts
├── reminder.controller.ts
├── reminder.service.ts            (+ .spec.ts)
├── notification-campaign.controller.ts
├── notification-campaign.service.ts  (+ .spec.ts)
├── routing.spec.ts
├── dto/
│   ├── notification-management-field.decorators.ts
│   ├── create-reminder.dto.ts        (+ .spec.ts)
│   ├── update-reminder.dto.ts
│   ├── reminder-query.dto.ts         (+ .spec.ts)
│   ├── create-notification-campaign.dto.ts   (+ .spec.ts)
│   ├── update-notification-campaign.dto.ts
│   └── notification-campaign-query.dto.ts    (+ .spec.ts)
└── entities/
    ├── reminder.entity.ts
    └── notification-campaign.entity.ts
```

### Why two controllers and two services

The two resources are together in one module because they configure one thing —
what this system tells people, and when — and apart from each other because they
answer different questions: a standing rule tied to a deadline, and a single
announcement about a single occasion. They share no table, no query, no predicate
and no lifecycle.

Two services keep each small and single purpose. Two *modules* would have split a
feature an administrator experiences as one screen with two tabs. It is the shape
`LeaveConfigurationModule` already uses.

One rule is genuinely shared — "at least one delivery method" — and it lives in
`notification-management.rules.ts`, called by both. It is a file with one function
in it on purpose: what is common is exactly that, and a `shared/` drawer would have
attracted things that are not.

### Where each rule lives

| Layer | Judges |
| --- | --- |
| DTO | one field at a time: types, lengths, closed vocabularies, array shape |
| Service | anything about several fields at once, or about the database |

The split is the one every module here keeps, and this feature has four rules that
could only be in the service:

1. **At least one delivery method** — on a `PATCH` the rule applies to the merged
   pair, and neither field is wrong on its own. `{ "sendEmail": false }` is a good
   body on one campaign and a fatal one on another.
2. **`employeeIds` against `recipientType`** — required for one, refused for the
   other, judged on a resolved body.
3. **`expiresAt` against `scheduledAt`** — two fields, compared as they will
   stand after the write rather than as they arrived.
4. **The lifecycle gates** — a rule about the stored row, which no body can state.

### The authentication placeholder

`@CurrentUser()` from [Feature 026](026-notification-center.md), reused unchanged:
`x-user-id` and `x-user-role` required, `x-employee-id` optional, and
`administrativeAccess` derived from the role rather than sent.

It is read on **`POST /notification-campaigns` alone**, because that is the one
route that records who did something. The reads, the edits and every reminder
route do not care who is asking, and adding a check there would be half an access
check — which reads as protection while providing none.

`CurrentUser.employeeId` is nullable and `created_by_employee_id` is not, so a
campaign composed by an account with no employment record is a `400` naming the
header rather than a nullable column. A campaign is something a person wrote, and
an announcement the company sent with nobody accountable for its wording is worse
than an administrator being asked to identify themselves.

Nothing is hardcoded, nothing is defaulted, and no user is assumed anywhere.

### Module dependencies

`NotificationManagementModule` imports **`EmployeeModule` and nothing else**. A
campaign names people — its author, and the employees it is addressed to — so
`employees` is the one other table this module has business touching, and it
touches it through `EmployeeService` rather than by querying the table. Reminders
need nothing at all.

Note what is **not** imported. `EmailModule` is absent, because `sendEmail` is a
stored preference rather than an action. `NotificationModule` is absent too,
although `severity` is typed with the enum that module stores: sharing a
vocabulary is not a dependency, and nothing here creates a notification.

Both services are exported, because the point of a configuration is that something
else reads it. No method is written for that caller in advance.

### One change to an existing module

`EmployeeService.findExistingIds(ids)` is new — the only edit to code outside this
feature. A campaign may name up to 200 people, and one `findStatus` per name would
be 200 round trips to answer one question. It is separate from `findStatus` rather
than folded into it because the questions differ: one asks about a person and
answers with a fact about them, the other asks about a set and answers which of it
is real. It returns the ids that were **found**, because only the caller knows
what a missing person means in its own request.

It deliberately does not filter on status. "Does this person exist" and "are they
still with the company" are different questions, and folding the second in would
make a caller that asked only the first treat a suspended employee as a typo.

## Frontend

No change — the frontend directory is still empty. When it is built:

- the two sections are two tabs of one screen, which is why they are one module;
- a reminder list reads best ordered by `daysBeforeDeadline`, which is **not**
  currently sortable — see [Future Improvements](#future-improvements);
- `recipientCount` is a number for `EMPLOYEE` and the words "All employees" for
  `ALL_EMPLOYEES`; it is a row count, not an audience size;
- the campaign form should derive its own status display from `scheduledAt` the
  way the API does, rather than offering a status dropdown the API would refuse;
- `sentAt` is always null today, and a UI that shows a "Sent" column should expect
  it to stay null until the delivery engine ships.

## Testing

| Spec | Covers |
| --- | --- |
| `reminder.service.spec.ts` | the page and its metadata, one transaction, search over name and subject only, filters `AND`ed, the count matching the page, the id tie-break, create/update/disable/re-enable/delete, `0` days accepted, the case-insensitive name conflict on both create and update, self-exclusion on update, no conflict query when the name is untouched, and the delivery rule judged against the merged pair |
| `notification-campaign.service.spec.ts` | one/many/all recipients, the single `ALL_EMPLOYEES` row, ids refused alongside it, an `EMPLOYEE` campaign with none, every missing recipient named at once, the derived status both ways, `sentAt` never written, all four date rules including equality and the both-at-once report, delivery refused before any query, the author recorded, an account with no employee record, the lifecycle `409`s on `SENT` and `CANCELLED`, a stored schedule not re-judged, the merged date comparison, wholesale audience replacement, `employeeIds` without a type, and deletion allowed on cancelled but refused on sent |
| `create-reminder.dto.spec.ts` | required fields, unknown fields, both length bounds at and past the limit, `0` accepted and negatives/fractions/over-a-year refused, trimming, the description collapsing to null, the closed vocabularies, the five defaults, and that the delivery rule is **not** judged here |
| `create-notification-campaign.dto.spec.ts` | required fields, the four fields a client may not write, the length bounds, one/many/none recipients, duplicates, the cap, the ISO-8601 rule and the `01/13/2020` refusal, the value staying a string, and that neither the recipient rule nor the date ordering is judged here |
| `reminder-query.dto.spec.ts` | the ascending default pinned against the centre's `desc`, inherited pagination and the cap, every sort field, `scheduledAt` refused, boolean conversion and its refusal of `yes`, search trimming and bound, unknown parameters |
| `notification-campaign-query.dto.spec.ts` | the defaults, every sort field, `sentAt` refused, every status filterable including `SENT`, both delivery filters, and `?recipientType=` / `?createdByEmployeeId=` rejected |
| `routing.spec.ts` | both collections registered and not colliding, `PATCH` used for disabling, the absent `disable` and `send` routes, the caller reaching the service, a `POST` without headers, a null `employeeId` carried through, `status: SENT` and `status: SCHEDULED` refused at the route, and body/query validation on the real routes |

Results: `npm run typecheck` clean, `npm test` **1717 passed** (90 suites, up
from 1539 in 83), `npm run test:e2e` 44 passed, `npm run build` clean,
`prettier --check` clean.

Every scenario the task named is covered: create/update/disable/delete a
reminder; a campaign for one, several and all employees; a scheduled campaign; an
invalid `expiresAt`; a campaign without recipients; and a campaign without a
delivery method.

## Files Created

| File | Purpose |
| --- | --- |
| `backend/prisma/migrations/20260805160000_add_notification_management/migration.sql` | Two enums, three tables, five indexes, three foreign keys |
| `backend/src/modules/notification-management/notification-management.module.ts` | Wires two controllers and two services |
| `backend/src/modules/notification-management/notification-management.constants.ts` | Bounds, sort fields, and the three status lists |
| `backend/src/modules/notification-management/notification-management.rules.ts` | `assertDeliveryMethodChosen` — the one rule both resources share |
| `backend/src/modules/notification-management/reminder.controller.ts` | `/reminders` |
| `backend/src/modules/notification-management/reminder.service.ts` | Every reminder rule: uniqueness, delivery, ordering |
| `backend/src/modules/notification-management/reminder.service.spec.ts` | Unit tests |
| `backend/src/modules/notification-management/notification-campaign.controller.ts` | `/notification-campaigns` |
| `backend/src/modules/notification-management/notification-campaign.service.ts` | Every campaign rule: recipients, schedule, lifecycle, authorship |
| `backend/src/modules/notification-management/notification-campaign.service.spec.ts` | Unit tests |
| `backend/src/modules/notification-management/routing.spec.ts` | Route tests through a real application |
| `backend/src/modules/notification-management/dto/notification-management-field.decorators.ts` | Shared per-field rules for both resources |
| `backend/src/modules/notification-management/dto/create-reminder.dto.ts` (+ `.spec.ts`) | Body of `POST /reminders` |
| `backend/src/modules/notification-management/dto/update-reminder.dto.ts` | Body of `PATCH /reminders/:id` |
| `backend/src/modules/notification-management/dto/reminder-query.dto.ts` (+ `.spec.ts`) | Query string of the reminder list |
| `backend/src/modules/notification-management/dto/create-notification-campaign.dto.ts` (+ `.spec.ts`) | Body of `POST /notification-campaigns` |
| `backend/src/modules/notification-management/dto/update-notification-campaign.dto.ts` | Body of `PATCH /notification-campaigns/:id` |
| `backend/src/modules/notification-management/dto/notification-campaign-query.dto.ts` (+ `.spec.ts`) | Query string of the campaign list |
| `backend/src/modules/notification-management/entities/reminder.entity.ts` | Response shape, `select`, row type, mapper |
| `backend/src/modules/notification-management/entities/notification-campaign.entity.ts` | Both response shapes, both `select`s, row types, mappers |
| `FEATURES/027-notification-management.md` | This document |

## Files Modified

| File | Change |
| --- | --- |
| `backend/prisma/schema.prisma` | `NotificationCampaignStatus` and `CampaignRecipientType`; the `Reminder`, `NotificationCampaign` and `NotificationRecipient` models; two `Employee` back-relations |
| `backend/src/modules/employees/employee.service.ts` | `findExistingIds()` — bulk existence check for campaign recipients |
| `backend/src/app.module.ts` | Registers `NotificationManagementModule` |
| `FEATURES/HISTORY.md` | Feature 027 row |
| `FEATURES/README.md` | Feature 027 row |

## Notes

- **Nothing here sends anything.** No email, no socket, no job, no `Notification`
  row. `sendEmail`, `sendNotification`, `scheduledAt` and `expiresAt` are stored
  preferences that the delivery engine will read; `sentAt` is a column nothing
  writes.
- **`severity` is typed `NotificationType`.** The field name describes what it is
  to a reminder or a campaign; the type name describes where the value ends up.
  Two enums of the same four words would have meant translating at every
  hand-off.
- **The `Reminder` model does not say which deadline it is about.** With one
  deadline in the system and the Timesheets module unwritten, a `deadlineType`
  column would be a vocabulary of one value.
- **A campaign's `subject` may be longer than a notification's `title`** (200 vs
  150). Recorded, not resolved — see [Future Improvements](#future-improvements).
- **Reminder deletion is unguarded**, because nothing references a reminder.
  Disabling is still the better answer for a rule somebody may want back, and the
  API says so in the controller.
- **`updatedAt` moves on a campaign when it is cancelled or scheduled**, since
  `status` is a column. `createdAt` is the field to sort and display.
- **`prisma generate` was run; `prisma migrate` was not.** The migration SQL is
  written and reviewed but has not touched any database — see
  [Migration](#migration) for the command.

## Future Improvements

- **Reconcile the 200-character `subject` with the 150-character notification
  `title`.** The most concrete follow-up, and the delivery engine is where it
  becomes real: either it truncates, or `NOTIFICATION_TITLE_MAX_LENGTH` widens to
  200. `message` already agrees at 5000, and the two must move together.
- **Make `daysBeforeDeadline` and `name` sortable on the reminder list.** Both
  were left out to stay inside the specified sort vocabulary, and both are what an
  administrator would actually order by — the offset especially, since it is the
  order the reminders fire in.
- **A `deadlineType` column on `Reminder`**, when the Timesheets module gives the
  system a second kind of deadline. Additive: one column, one filter, one
  validation rule.
- **Message templating** — `{{employeeName}}`, `{{deadlineDate}}` — designed with
  the delivery engine, where the substitutions can be chosen against real
  renderings rather than guessed.
- **A per-campaign delivery report** once the engine exists: how many
  notifications it produced, how many emails were accepted, what failed. It
  belongs beside `sentAt`, on the campaign.
- **A `?dateFrom=` / `?dateTo=` filter over `scheduledAt`**, once enough campaigns
  exist for anybody to want it.
- **Case-insensitive uniqueness in the database** for `reminders.name`, via a
  `citext` column or a functional index, closing the case-variant race the service
  check cannot. The same improvement `LeaveType.label` is waiting on, and worth
  doing for both at once.
- **Replace `@CurrentUser()` with the authenticated user** when the auth feature
  lands. One function body changes; nothing in this module does.
- **RBAC, and the two resources do not get the same rule.** Every endpoint here is
  open to everybody today, which this document states rather than
  half-implements. When the authentication and authorization feature lands:

  | Resource | Who may manage it |
  | --- | --- |
  | `/reminders` | **`SUPERADMIN` and `ADMIN` only — not `HR`** |
  | `/notification-campaigns` | `SUPERADMIN`, `ADMIN` and `HR` |

  The task specified "Super Admin, Admin and HR" for the module as a whole; the
  narrower rule on reminders was confirmed afterwards and is recorded here so the
  auth feature implements what is actually wanted rather than what this feature
  was originally told.

  The distinction is defensible on its own terms: a reminder is a **standing
  rule** that fires against every employee on a schedule nobody re-approves, so a
  bad one goes out repeatedly and silently. A campaign is a single announcement
  somebody composes, reads back and sends once — HR sending a holiday notice is
  ordinary HR work, HR changing when the whole company is chased for timesheets
  is not.

  Nothing in the current code has to move for this: both controllers are already
  free of role logic, so it is a guard and a decorator per route rather than a
  rewrite. Whether the read endpoints (`GET`) are narrowed with the writes is
  worth deciding then — "HR may see the reminder rules but not change them" is a
  reasonable position, and this feature takes no view on it.
