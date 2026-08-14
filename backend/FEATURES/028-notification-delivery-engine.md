# Feature 028 — Notification Delivery Engine

**Status:** Completed
**Date:** 2026-08-05

## Goal

Execute what the previous two features stored. This is the module that turns an
intention into a message somebody actually receives, through three channels:

- **in-app notifications**, written into [Feature 026](026-notification-center.md)'s inbox;
- **email**, sent through [Feature 025](025-email-infrastructure.md)'s `EmailService`;
- **WebSocket events**, so a notification appears without a page refresh.

It is the last link in a chain three features long:

```text
  notification-management   what we intend to say              (Feature 027)
  notification-delivery     deciding it is time, and sending   ← this feature
  notifications             what people were told              (Feature 026)
```

**This module owns no table and adds no migration.** Every read and write goes
through the module that owns the data, which is what
[Feature 027](027-notification-management.md) predicted and what keeps the
dependency graph acyclic: this feature imports four modules and none of them
imports it.

Deliberately **not** included: authentication, authorization, RBAC, password
reset, verify-email, welcome and invite emails, push notifications, Firebase and
SMS.

## Requirements

- One `NotificationDispatcher` — the only entry point for delivery, and the only
  component that may create notifications, send notification emails, emit
  WebSocket events or move a campaign to `SENT`.
- A Socket.IO gateway with one connection per user, two workspaces, three room
  shapes and five server events.
- `switchWorkspace` without reconnecting.
- Recipient resolution for `EMPLOYEE` and `ALL_EMPLOYEES`, reusing Feature 026's
  `NotificationRecipient` rows.
- `POST /api/v1/notification-delivery/execute/:campaignId` for manual execution.
- A scheduler that finds due reminders and due campaigns and does nothing but
  invoke the dispatcher.
- Never a duplicate email, a duplicate notification or a duplicate event.
- Testable end to end without a frontend.

## Decisions taken before implementation

Six points where the specification met a shipped decision or an existing project
rule. Each is recorded because a reader will otherwise wonder.

| Question | Decision | Why |
| --- | --- | --- |
| The reminder scheduler is told to "create an internal `NotificationCampaign`". Persist it? | **No — the internal campaign is a value, not a row** | `notification_campaigns.created_by_employee_id` is `NOT NULL` because Feature 027 decided a campaign is *something a person wrote* — "an announcement the company sent with nobody accountable for its wording is worse". A scheduler is not a person. Persisting would need a nullable author or an invented one, contradicting a shipped decision to gain a record the notifications themselves already carry. See [The internal campaign](#the-internal-campaign). |
| Does the engine query `notification_campaigns` and `reminders` directly? | **No — through Feature 027's services** | That feature stated the engine would read through them and "no method is written for that caller in advance". Three methods were added there by the caller that needed them. The alternative — a Prisma-holding repository here — would have been the first violation in this codebase of "the module that owns a table is the only one that touches it". |
| A campaign to everybody: one `ALL_USERS` broadcast, or a row per person? | **A row per person** | Feature 026 records a known limitation: a broadcast has one `isRead` flag, so the first reader marks it read for everybody and one deletion removes it for all. Fanning out avoids it entirely and is what makes `notification.unreadCount` a number about one person. Cost stated in [Why a fan-out](#why-a-fan-out-rather-than-a-broadcast). |
| A campaign `subject` is 200 characters; a notification `title` is 150. | **Truncate, with an ellipsis** | The seam Feature 027 named and left open. The 150 is a statement about what fits on one line of an inbox and is still true; widening a shipped contract for a feature written afterwards is the wrong direction for the change to travel. The email carries the full heading. |
| What does `expiresAt` mean to the engine? | **An expired campaign is refused, not sent** | Feature 027 left this open explicitly. Delivering past the author's own expiry would put a stale announcement in a thousand inboxes. |
| Does the notification centre emit its own socket events? | **No — it announces through a port the engine implements** | The centre must not learn what a socket is, and "the engine imports the centre, never the reverse" is a promise both 026 and 027 made. See [How the centre announces without knowing about sockets](#how-the-centre-announces-without-knowing-about-sockets). |

## Dependencies added

```bash
cd backend && npm install @nestjs/websockets @nestjs/platform-socket.io socket.io @nestjs/schedule
```

**This command was run, with approval**, because nothing in the feature compiles
without the types.

| Package | Used by |
| --- | --- |
| `@nestjs/websockets` | `@WebSocketGateway`, `@SubscribeMessage`, the gateway lifecycle interfaces |
| `@nestjs/platform-socket.io` | `IoAdapter` — the official adapter, subclassed for CORS |
| `socket.io` | `Namespace` and `Socket` types; the transport itself |
| `@nestjs/schedule` | `ScheduleModule.forRoot()` and `@Cron` |

No other dependency was added. In particular nothing was added for cron parsing,
HTML templating or escaping: `@nestjs/schedule` parses the two expressions and
the email body is a heading and a paragraph.

## Database

**No change.** No model, no column, no index, no migration, and none is required.

That is worth stating rather than passing over, because a delivery engine is
exactly the kind of feature that grows a table. Three candidates were considered
and each declined:

- **A delivery log** — how many notifications a run produced, how many emails
  were accepted, what failed. Genuinely useful, and it belongs beside `sentAt` on
  the campaign rather than in a table of its own. Deferred to
  [Future Improvements](#future-improvements); the shape it would have is already
  returned by the manual endpoint.
- **A "reminder fired" table**, so a rule cannot fire twice. Not needed: a rule
  is due on a *date* and the scheduler asks once a day, so the cron expression is
  the guarantee. A table would be a migration bought to solve a problem the
  schedule does not have.
- **A socket/presence table.** Presence describes TCP connections held by *this*
  process and is a lie the moment it restarts.

`notification_campaigns.sent_at` — the column Feature 027 created and described as
"written by nothing" — is written for the first time by this feature.

## The delivery flow

One path, whatever triggered it:

```text
  POST /notification-delivery/execute/:id        the campaign tick        the reminder tick
                  │                                     │                        │
                  └──────────────┬──────────────────────┘                        │
                                 ▼                                               ▼
                    NotificationCampaignService.findForDelivery      ReminderService.findEnabled
                                 │                                               │
                                 ▼                                               │
                        status + expiry checked                                  │
                                 │                                               │
                                 ▼                                               ▼
                 ┌────────────────────────────────────────────────────────────────┐
                 │  NotificationDeliveryRepository → one DeliveryPlan             │
                 │  (audience resolved *now*, deduplicated, title bounded)        │
                 └────────────────────────────────────────────────────────────────┘
                                 │
                                 ▼
                    markSent(id, now)  ← campaigns only, conditional UPDATE
                                 │  false → 409, nothing is sent
                                 ▼
                 ┌────────────────────────────────────────────────────────────────┐
                 │  NotificationDispatcher.deliver                                │
                 │   1. sendNotification → NotificationService.createMany         │
                 │        └── the centre announces → notification.created         │
                 │                                → notification.unreadCount      │
                 │   2. sendEmail       → EmailService.sendMany                   │
                 └────────────────────────────────────────────────────────────────┘
                                 │
                                 ▼
                        DeliveryResultEntity
```

### The order, and why it is that order

**The audience is resolved before the campaign is claimed.** Resolving is a read
with no side effect; claiming is the write that makes the campaign unrepeatable.
If the directory cannot be read, the campaign stays `SCHEDULED` and the next tick
tries again. Claiming first would burn a campaign on a transient failure.

**The campaign is claimed before anything is delivered.** The claim is a
conditional `UPDATE … WHERE id = ? AND status IN ('draft','scheduled')`, so the
check and the write are one statement and one row lock. That is what makes "never
send duplicate notifications" a property of the database rather than a promise:
two overlapping ticks, a retried request and a second application instance all
resolve the same way — one updates a row and delivers, every other updates none
and answers `409`.

**Notifications are created before emails are sent, and an email failure does not
undo them.** A notification is in the inbox the moment it is written; an email is
a copy of the same message that a server this application does not run may or may
not accept. Rolling back a delivered notification because a mail server was down
would make the outage worse, and a retry would be refused by the claim anyway. The
result says `emailStatus: FAILED`, the log carries the provider's own account, and
the notification stands.

### Recipient resolution

Feature 027's two stored shapes, resolved at the moment of sending:

| `recipientType` | Resolves to | How |
| --- | --- | --- |
| `EMPLOYEE` | the named employees, **whatever their status** | `EmployeeService.findDeliveryTargets(ids)` |
| `ALL_EMPLOYEES` | every employee except `TERMINATED` | `EmployeeService.findDeliveryTargets()` |

**The asymmetry is deliberate.** A company announcement is for the people who
work here, so somebody who left in July should not receive Monday's maintenance
notice. But somebody *named by hand* was chosen by a person, and silently dropping
them would leave the author believing an announcement reached somebody it did not
— the campaign screen is where a leaver should not have been picked. It is the
same line [Feature 024](024-leave-balance-generation.md) draws between a
generation run and a manual allocation.

Each person resolves to three ids — the employee, the account a notification is
addressed to, and the address an email goes to — read in **one** query through the
`user` relation `EmployeeService` already selects. The result is deduplicated by
employee: the unique index on `(campaign_id, employee_id)` already prevents a
campaign naming somebody twice, but a plan is executed rather than validated, and
a duplicate here would be a second email in somebody's inbox.

**This is what Feature 027's single `ALL_EMPLOYEES` row buys.** Somebody hired
between composing and sending is included; somebody who left is not. Expanded at
composition time, a campaign scheduled three weeks out would have gone to the
wrong set of people, silently.

### Why a fan-out rather than a broadcast

Feature 027 sketched two possibilities for `ALL_EMPLOYEES`: one `PERSONAL` +
`ALL_USERS` notification, or one per employee. This feature writes **one per
employee**, and the reason is a limitation Feature 026 documented:

> `isRead` is one column on the notification row … the first person to read an
> `ALL_USERS` announcement marks it read **for everybody**, and deleting one
> removes it for everybody.

A fan-out sidesteps that entirely without the `notification_reads` table that
would fix it properly. Each employee's copy is theirs to read, dismiss and count,
and `notification.unreadCount` becomes a number about one person rather than about
a row they happen to share.

The cost is stated rather than hidden: a company of a thousand people is a
thousand rows for one announcement. They are written by **one statement**
(`createManyAndReturn`), they are what an inbox is made of, and the alternative is
a read flag that lies.

### The internal campaign

The specification says the reminder scheduler should "create an internal
`NotificationCampaign`". It creates one — as a value, not a row.

`NotificationDeliveryRepository.buildReminderPlan` produces exactly the same
`DeliveryPlan` a stored campaign produces, so there is literally one delivery path
and a reminder cannot drift into behaving differently from an announcement. What
it does not do is `INSERT` a campaign, because
`notification_campaigns.created_by_employee_id` is `NOT NULL` by a decision
Feature 027 argued for at length. Writing an authorless row would need either a
migration making the column nullable or an invented author, and both contradict a
shipped decision in order to record something the notifications already record.

Consequences, stated plainly:

- there is no campaign row to point at after a reminder run, and no `sentAt`;
- the manual endpoint cannot fire a reminder — the scheduler is the only trigger;
- what stops a rule firing twice is the *schedule*, not a claim. See
  [The scheduler](#the-scheduler).

If a per-run record is wanted later, the honest way is the delivery-report table
in [Future Improvements](#future-improvements) — not a campaign row pretending
somebody wrote it.

## Email delivery

`EmailService.sendMany` from [Feature 025](025-email-infrastructure.md), unchanged
and unwrapped. No `SMTP_*` variable is read in this module, Nodemailer is not
imported, and no transporter is built — the rule that feature set for every
caller.

One email per recipient rather than a shared `To`, so nobody learns who else was
notified. It is sequential and stops at the first failure, which is the behaviour
Feature 025 documents and the email-queue feature will replace.

**There are no existing templates to reuse** — Feature 025 lists templates and
rendering under its own future improvements — so this module composes the smallest
body that can carry an announcement: the heading, and the message as the author
typed it, as both `text` and `html`.

`renderNotificationEmail` is one function with no template language, no
placeholders and no layout, so the templates feature replaces it rather than
having to unpick it. Two properties matter:

- **A plain-text part is always produced.** A client that will not render HTML
  would otherwise show an empty message.
- **Everything a person typed is escaped.** `notifications.message` is documented
  as plain text — Feature 026 states that no markup is rendered and none is
  stripped — so an announcement containing `<script>` is a message *about* a
  script tag. Interpolating it unescaped would turn every campaign into a way to
  put markup in a colleague's mail client. `&` is escaped first, or the entities
  this function writes would themselves be escaped.

`emailsSent` is the size of the audience on success and `0` on failure, and that
is honest about what it does not know: `sendMany` stops at the first refusal
without saying which, so the run cannot claim a partial number it would be
guessing at.

## WebSocket

### Socket.IO configuration

The official NestJS adapter, subclassed once:

```ts
app.useWebSocketAdapter(new NotificationSocketIoAdapter(app));  // in configureApp
```

Nest already uses `IoAdapter` by default, so `NotificationSocketIoAdapter` exists
for exactly one reason: a `@WebSocketGateway({ cors })` option is evaluated when
the class is *decorated*, which happens at import time — before `ConfigModule` has
read `.env` and before a `ConfigService` exists. Hardcoding origins there would
break the project's rule that no URL is written into the code, and reading
`process.env` directly would read it too early.

It applies **the same `buildCorsOptions` the HTTP side uses**, not a second copy:
a browser that may call `GET /api/v1/notifications` is exactly the browser that
may open a socket for the same inbox, and two lists would eventually disagree —
with the socket the half that fails silently, since a blocked upgrade looks like a
network problem rather than a refusal. Everything else — the handshake, the
message binding, the acknowledgement handling, the shutdown — is the official
adapter's behaviour, unchanged.

Registered inside `configureApp`, so the e2e suite boots the same server the
application does.

The gateway declares `namespace: '/'` — the default one, so a client connects to
the server's origin with no path segment to remember. A named namespace becomes
worth it the day a second, unrelated real-time feature exists.

### Identity on the socket

`resolveCurrentUser` from [Feature 026](026-notification-center.md), reused
**unchanged**: the same three headers, the same trimming, the same length bounds,
the same refusal of a role the schema does not know, and `administrativeAccess`
derived rather than claimed. A second copy of those rules would be the one that
eventually accepted a role the HTTP side refuses.

One change was needed and it is a widening rather than a fork: the function's
parameter type moved from `express.Request` to a new
`HeaderBearingRequest = { headers: IncomingHttpHeaders }`. A WebSocket handshake
is not an Express request and yet identifies its caller with exactly the same
three headers; an `express.Request` still satisfies the narrower shape
structurally, so no existing caller changed.

**The identity may also arrive in `handshake.auth`.** A browser cannot set headers
on a WebSocket upgrade — the API has no way to — so
`io(url, { auth: { 'x-user-id': … } })` is how a real client will identify itself.
The *same three names* are accepted there, so the placeholder has one spelling
rather than a second vocabulary to replace twice when authentication lands.

`auth` wins **as a whole** rather than key by key: a client sending both would
otherwise be able to claim one account in its headers and another in its auth
payload, and a merge would decide which silently.

Nothing is hardcoded, nothing is defaulted, and no user is assumed anywhere. A
handshake that does not say who is calling is refused with an `exception` event
and a disconnect — a silent close would leave a client whose headers are wrong
with nothing to read.

**A connection without an employment record is refused.** Every room here is keyed
by employee, because that is the vocabulary campaigns and reminders address people
in. An account with no `employees` row — a super-admin created to administer the
system — has nothing this engine would ever send it, so refusing is honest where
inventing a room would be theatre.

### Rooms

| Room | Holds | Used for |
| --- | --- | --- |
| `user:{employeeId}` | one person's own socket | everything addressed to them by name |
| `workspace:PERSONAL` | every socket reading the personal inbox | `ALL_USERS` broadcasts |
| `workspace:ADMINISTRATIVE` | every socket reading the back office | `ADMINISTRATIVE_USERS` broadcasts and `ROLE` notifications |

A connection is in its own room and in **exactly one** workspace room. That is
what makes a broadcast one `emit` rather than a scan over every socket deciding
who should see it — and what stops an administrator reading their personal inbox
from receiving back-office announcements they are not looking at.

**The personal room is keyed by employee while notifications are addressed to
accounts**, and bridging the two is what `WebsocketUserRegistryService` is for. A
room name is something a client and a log both have to read, so it is spelled in
the vocabulary the screens use; every connection knows both ids, so the
translation is a map lookup rather than a database join at every emit.

**One socket per account.** A second connection displaces the first, which is then
disconnected. Without it, a client that reconnected on every route change would
accumulate sockets and receive each notification once per stale connection — the
duplicate-event failure arriving through the back door. The registry returns the
displaced connection rather than closing it, because closing a socket is the
gateway's business and the registry holds ids: that split is what lets the whole
rule be unit-tested without a server.

The registry is **in memory on purpose**. Presence describes TCP connections held
by this process; persisting it would produce a table whose every row is a lie
after a restart, and the notifications themselves are already durable. The
consequence is stated rather than hidden: this works for one process, and a second
instance behind a load balancer holds its own sockets. The fix is Socket.IO's
Redis adapter — a configuration change, not a redesign.

### Workspaces and `switchWorkspace`

```text
   connect ──► user:{employeeId} + workspace:PERSONAL
                        │
                        │  switchWorkspace { workspace: "ADMINISTRATIVE" }
                        ▼
              leave workspace:PERSONAL, join workspace:ADMINISTRATIVE
              (the socket, the identity and user:{employeeId} are untouched)
```

The client switches **without reconnecting**, which is the requirement this event
exists for: reconnecting would drop every event raised in the moments between the
two connections.

It is refused for a caller whose role is not administrative — the same check
Feature 026 makes on the same workspace over HTTP, and for the same reason: it is
what `ADMINISTRATIVE_USERS` *means*, not authorization arriving early. The refusal
is an **acknowledgement**, not a thrown exception: the client asked a question and
"no, and here is why" is the answer, and a refused switch leaves the connection
exactly where it was rather than in no workspace at all.

An unknown workspace, a missing payload and an unregistered socket are all
acknowledged the same way, for the same reason.

### Server events

Five, and each has exactly one producer — which is the property that keeps "never
emit duplicate websocket events" true rather than hoped for.

| Event | Payload | Emitted when | By |
| --- | --- | --- | --- |
| `notification.created` | `{ notification }` | one notification was written | `NotificationService.create` / `createMany` |
| `notification.read` | `{ notification }` | one was marked read | `NotificationService.markRead` |
| `notification.deleted` | `{ id, workspace }` | one was removed | `NotificationService.remove` |
| `notification.updated` | `{ workspace, affected }` | a whole workspace changed at once | `markAll*Read` / `removeAll*` |
| `notification.unreadCount` | `{ workspace, count }` | any of the above moved somebody's badge | the broadcaster, once per affected person |

**`notification.updated` is the bulk event**, not a second spelling of `read`. A
"mark everything read" over three hundred rows has no single notification to name,
and emitting three hundred `notification.read` events to say one thing is exactly
the duplication the business rules forbid. Its payload carries what a client needs
to decide between patching its list and refetching it.

**`notification.deleted` carries an id, not the entity.** The row is gone by the
time it is sent, and re-sending what was deleted would invite a client to render
it.

`exception` is Socket.IO's own error channel, reused for a refused handshake
rather than inventing a sixth name for the same concern.

Client events are `connection`, `disconnect` and `switchWorkspace`. The first two
are Socket.IO's lifecycle events, handled by `OnGatewayConnection` /
`OnGatewayDisconnect`, so `switchWorkspace` is the only *message* a client sends.

### The unread counter

Emitted whenever a notification is **created, read or deleted**, and after both
bulk operations.

It is a **count, not a delta**, so a client that missed an event — a reconnect, a
tab that was asleep — recovers on the next one instead of drifting. It comes from
`NotificationRepository.countUnread`, which is built on the same visibility
predicate every other operation uses: a count written in the engine would be the
copy that eventually forgot the `workspace` term and reported the back-office
backlog to every employee.

**One count per person per change, however many notifications that change
involved.** A campaign that writes eight hundred notifications produces eight
hundred `notification.created` events — each to the one person it is for — and
*one* `notification.unreadCount` per connected person. That is the difference
between a badge that updates and a client that processes the same number eight
hundred times.

Only connected people are counted, so the work is bounded by who is actually
looking at the application rather than by how many people the company employs.
Somebody offline has their notification stored and their badge correct the next
time they open a list.

The refresh is a query, and it is deliberately **fire-and-forget** with its own
catch: a badge that arrives a moment late is a badge, while a badge that fails the
write that caused it is a bug.

## How the centre announces without knowing about sockets

The single most structural decision in this feature after the dispatcher itself.

Feature 026 must keep working with no engine at all, and both 026 and 027
committed to the engine importing them rather than the reverse. But
`notification.unreadCount` has to be emitted when somebody *reads* a notification
— which happens in Feature 026's own service, through its own endpoint.

The resolution is a **port declared by the consumer**:

```text
notifications/notification-events.ts     NotificationEventPublisher   ← declared here
notification-delivery/…broadcaster       implements it, registers itself on startup
```

`NotificationService` holds a nullable publisher and calls it on create,
createMany, markRead, remove and both bulk operations. It knows *that* something
happened to a notification; it does not know that somewhere there is a socket, a
room called `user:emp-1` or a badge to refresh.

**Registration rather than dependency injection**, and that is the part worth
recording. A Nest provider token would have had to be declared in *some* module's
`providers`, and whichever module that was would have imported the other: either
the centre imports the engine — the cycle both features exist to avoid — or the
engine declares a provider the centre must already know how to inject. A method
the engine calls in `onModuleInit` has neither problem, and it makes the seam one
visible line in the engine rather than something spread across two `@Module`
decorators.

Three properties keep it safe:

1. **`null` is a working state.** A deployment or a test that boots the centre
   without the engine stores, reads and clears notifications exactly the same way.
2. **Nothing announced may break the write.** `NotificationService.publish` wraps
   every call in a `try`/`catch` that logs — the rule Feature 025 asks every email
   caller to apply, applied here once on the callers' behalf — and the broadcaster
   is defensive as well.
3. **The dispatcher does not emit `created` itself.** It creates notifications
   *through* `NotificationService`, so one notification produces one
   `notification.created` however it came to exist — including through Feature
   026's temporary `POST`.

## The scheduler

`@nestjs/schedule`, registered once as `ScheduleModule.forRoot()` in
`app.module.ts` beside the other application-wide facilities. Two jobs, in two
small classes, because they answer different questions:

| Job | Cron | Asks |
| --- | --- | --- |
| `notification-delivery.campaigns` | `* * * * *` | which announcements were scheduled for a moment that has passed |
| `notification-delivery.reminders` | `0 7 * * *` | which standing rules are due today |

Both **only invoke the dispatcher**. Neither composes a message, resolves an
audience, writes a notification or sends an email — which is the requirement, and
also what keeps a scheduled delivery identical to a manual one.

### The campaign tick

`WHERE status = 'scheduled' AND scheduled_at <= now()` — exactly the
`(status, scheduled_at)` index Feature 027 created "for the delivery engine's
tick". This is that tick, and it is what makes `SCHEDULED` mean something:
without it a scheduled campaign would sit in the table until somebody called the
manual endpoint, which is not scheduling.

Per minute, which is the resolution `scheduledAt` is worth having — an
administrator schedules an announcement for 09:00, and a minute either side is
indistinguishable from on time.

It reads **ids**, not rows, because the engine claims each campaign before reading
it: a row read here and executed a second later could have been cancelled in
between. One tick is bounded to 25 campaigns, so an instance that was down for a
day does some work now and the rest on the next tick; the remainder is still
`SCHEDULED` and still due.

A `409` is an ordinary outcome here — cancelled, expired, or claimed by another
run between the scan and the send — and is logged at `warn`, not `error`, because
nothing is wrong.

### The reminder tick

Once a day, and the cadence *is* the duplicate protection.
`daysBeforeDeadline` is a whole number of days, so a rule is due on a **date**;
asking once per date is what makes "a reminder never fires twice" a property of
the schedule rather than a check needing a table of what had already fired.

The decision itself:

```text
today is due for a rule  ⟺  daysBetweenUtc(today, deadline) === rule.daysBeforeDeadline
```

**The deadline is the last day of the month** — this application's timesheet
deadline until the Timesheets module says otherwise. Feature 027 deliberately left
`Reminder` without a `deadlineType` column because the only deadline this system
has is the timesheet's and the module that owns it does not exist. Something has
to decide what that deadline *is*, and the engine is the right place: it is the
only component that has to know, it is the component that will read the real
answer the day there is one, and stating the rule as a function means replacing it
is one edit.

**Both this month's and next month's deadline are considered.** A rule with an
offset of 40 days can never be that many days before the *current* month's end, so
judging against one deadline would make every long-range rule silently dead. A
rule cannot match both, since two different deadlines are never the same number of
days away.

All of it is computed in **UTC**, like every other date in this project: the
columns are `timestamp` and the seed writes UTC midnight, so a local-time
calculation would fire a reminder a day early or late depending on where the
server is. Both ends are truncated to midnight, so "how many days until the 31st"
is the same answer at 09:00 and at 17:00.

The audience is everybody. When the Timesheets module exists this becomes
"everybody who has not submitted yet" — a narrower list built the same way.

### The switch, and the re-entrancy guard

`NOTIFICATION_SCHEDULER_ENABLED=false` stops the clock without stopping the
engine: the manual endpoint still sends, because that is somebody deliberately
asking.

The case it exists for is the one `SMTP_ENABLED` exists for. A staging deployment
restored from a production dump holds real employees, real addresses and real
scheduled campaigns, and it must be able to run the API without a cron announcing
a maintenance window to the whole company at 09:00. `SMTP_ENABLED=false` is not
enough on its own, because an in-app notification is delivered whether or not mail
is configured.

The job is registered either way and the guard is inside it, so its name and
schedule are the same in every deployment and "the scheduler is off here" is a
configuration fact rather than a different application.

Each job also holds a re-entrancy flag. A backlog of campaigns can take longer
than a minute; without it the next tick would start on the same batch. That could
not double-send — the claim guarantees it — but it would spend two runs
discovering the same thing.

## API

Base path `/api/v1`, from `configureApp`. Every response uses
[Feature 006](006-shared-backend-infrastructure.md)'s envelope.

| Method | Path | Returns |
| --- | --- | --- |
| `POST` | `/notification-delivery/execute/:campaignId` | the delivery report (200) |

**One route, and it is for development and Postman testing** — documented as such
in the controller, on the method and here, so it cannot quietly become permanent.
It is the same kind of seam as the notification centre's temporary
`POST /notifications`: a way to trigger by hand something that will otherwise only
happen on a schedule.

It is deliberately **not** `POST /notification-campaigns/:id/send`. Feature 027's
routing spec asserts no such route exists, because nothing in that module sends
anything; putting the trigger under this feature's prefix keeps that true and puts
the URL where the behaviour lives.

**There is no route for firing a reminder.** A reminder is a standing rule whose
whole point is the schedule, and a route that fired one by hand would be a way to
warn the entire company on a Tuesday afternoon by mistake.

### Status codes

| Situation | Code |
| --- | --- |
| Sent | `200` |
| A campaign that does not exist | `404` |
| A `SENT` or `CANCELLED` campaign | `409` naming the status |
| A campaign whose `expiresAt` has passed | `409` naming the expiry |
| Claimed by another run in between | `409` |

`200` rather than the `201` Nest gives a `@Post`, because nothing was created:
there is no resource to point at and no `Location` to return.

A `DRAFT` campaign is sent as readily as a `SCHEDULED` one — this is somebody
deliberately saying "send it now", and refusing a draft would mean scheduling an
announcement two minutes out in order to test it.

### The delivery report

```json
{
  "success": true,
  "data": {
    "source": "CAMPAIGN",
    "campaignId": "clx…",
    "reminderId": null,
    "recipientCount": 42,
    "notificationsCreated": 42,
    "emailsSent": 42,
    "emailStatus": "SENT",
    "sentAt": "2026-08-05T09:00:00.000Z"
  }
}
```

The three counts are separate because they can legitimately differ:
`notificationsCreated` is `0` when `sendNotification` is false and `emailsSent` is
`0` when `sendEmail` is false, so a campaign that reached forty people by email
and none in-app is describable rather than looking like a partial failure.

`emailStatus` has three values rather than being a boolean: `SENT`, `SKIPPED` (not
asked for, or nobody to send to) and `FAILED` (the mail server refused). A boolean
would say the same thing about the last two.

It is a **report, not a resource** — nothing is addressable by an id and nothing
is stored. See [Future Improvements](#future-improvements).

## Backend

### Structure added

```text
backend/src/modules/notification-delivery/
├── notification-delivery.module.ts
├── notification-delivery.constants.ts      (+ .spec.ts)
├── notification-delivery.controller.ts
├── notification-delivery.repository.ts     (+ .spec.ts)
├── notification-dispatcher.service.ts      (+ .spec.ts)
├── notification-broadcaster.service.ts     (+ .spec.ts)
├── notification-email.template.ts          (+ .spec.ts)
├── campaign-scheduler.service.ts           (+ .spec.ts)
├── reminder-scheduler.service.ts           (+ .spec.ts)
├── routing.spec.ts
├── entities/
│   └── delivery-result.entity.ts
└── websocket/
    ├── notification.gateway.ts             (+ .spec.ts)
    ├── notification-socket-io.adapter.ts
    ├── websocket.constants.ts
    ├── websocket-events.ts
    └── websocket-user-registry.service.ts  (+ .spec.ts)

backend/src/modules/notifications/
└── notification-events.ts                  ← the port, declared by the consumer
```

Six files beyond the requested layout, each because something needed a home:

| File | Why it exists |
| --- | --- |
| `notification-delivery.controller.ts` | The manual endpoint was specified; a route needs a controller. |
| `campaign-scheduler.service.ts` | A `SCHEDULED` campaign has to go out. Separate from the reminder scheduler because the two ask different questions at different cadences. |
| `notification-broadcaster.service.ts` | Deciding *who* an event is for is neither the gateway's job (it knows rooms) nor the centre's (it knows rows). |
| `notification-email.template.ts` | Composition, kept out of the transport — the line Feature 025 drew. |
| `websocket/notification-socket-io.adapter.ts` | The only place the CORS allowlist can reach Socket.IO; see [Socket.IO configuration](#socketio-configuration). |
| `notifications/notification-events.ts` | The port, declared by the module that depends on it rather than the one that implements it. |

### The repository, and why it holds no Prisma

`NotificationDeliveryRepository` is the seam between the dispatcher and every
source of data — and it holds no `PrismaService`, which is the design rather than
an omission.

**This feature owns no table.** Campaigns and reminders belong to Feature 027,
notifications to Feature 026, employees and accounts to their own modules, and
this project's rule throughout is that the module owning a table is the only one
that queries it. A repository here that reached for Prisma would be the first
violation of that rule in the codebase, and the one that eventually read a
campaign in a shape `NotificationCampaignService` would have refused to write.

So it is a repository in the sense that matters: the dispatcher reasons in
`DeliveryPlan` and `DeliveryTarget`, and turning a stored campaign or a reminder
rule into one of those — resolving the audience, deduplicating it, mapping a
campaign's columns onto a notification's, bounding the title — happens here and
nowhere else. That is real work rather than argument forwarding, and it is the
work that would otherwise be copied between the manual endpoint, the campaign tick
and the reminder tick.

The rules stay with their owners, which is what the arrangement buys:

| Question | Answered by |
| --- | --- |
| What is a valid campaign, and may it still be sent? | `NotificationCampaignService` |
| Which reminder rules are live? | `ReminderService` |
| Who is an employee, and how is one reached? | `EmployeeService` |
| How is a notification legally addressed? | `NotificationService` |
| How does a message reach an inbox? | `EmailService`, `NotificationGateway` |

### `DeliveryPlan` — one unit of work

A stored campaign becomes one; a reminder rule becomes one; and
`NotificationDispatcher` knows how to execute one and nothing else. Whatever is
added later — a leave decision, a timesheet rejection — becomes one too, and the
delivery logic does not grow a branch.

It carries `title` and `subject` as two different strings: the title is what a
notification holds and is bounded at 150, the subject is what the email holds and
is not. Deriving one from the other at the point of use would mean truncating in
two places.

### Module dependencies

`NotificationDeliveryModule` imports four modules and **exports nothing**:

| Import | Taken from it |
| --- | --- |
| `NotificationModule` | `createMany`, `countUnread`, `registerEventPublisher` |
| `NotificationManagementModule` | the campaigns and rules to execute, and the `SENT` transition |
| `EmailModule` | `sendMany` |
| `EmployeeModule` | who an audience resolves to, and how to reach them |

`PrismaModule` is deliberately absent, and its absence is the module's central
structural claim.

Nothing is exported because the dispatcher is reached through the manual endpoint
and the two schedulers; when the timesheet and leave features want to announce
something they will import this module then. Exporting before there is a caller
would be designing the seam around a guess.

### Changes to earlier features

Every change outside this module is additive: no signature was narrowed, no
behaviour was altered, and all 1717 tests that existed before this feature still
pass unchanged.

| Module | Added | For |
| --- | --- | --- |
| `notifications` | `NotificationService.createMany` | one statement per campaign instead of one per person, with the addressing rule applied to every entry and every recipient confirmed in one query |
| | `NotificationService.countUnread` | the badge, without a page request that fetches a row nobody displays |
| | `NotificationService.registerEventPublisher` + `notification-events.ts` | the outbound port |
| | `NotificationRepository.createMany` / `countUnread` | the two queries behind them |
| `notification-management` | `ReminderService.findEnabled` | the reminder tick |
| | `NotificationCampaignService.findForDelivery` / `findDue` / `markSent` | the campaign tick, and the one write that produces `SENT` |
| | `SENDABLE_CAMPAIGN_STATUSES` | the claim's `WHERE`, stated as data |
| `employees` | `EmployeeService.findDeliveryTargets` | an audience resolved to accounts and addresses in one query |
| `users` | `UserService.findExistingIds` | bulk recipient existence, mirroring `EmployeeService.findExistingIds` |
| `common` | `resolveCurrentUser` widened to `HeaderBearingRequest` | the socket handshake reusing the HTTP identity rules |

`SENDABLE_CAMPAIGN_STATUSES` holds the same two values as
`EDITABLE_CAMPAIGN_STATUSES` and is deliberately a separate list: one says which
campaigns an administrator may still change, the other which the engine may still
deliver. A future `PAUSED` status would belong to the first and not the second.

## Environment

One new variable, and it is a switch rather than a setting.

| Variable | Default | Meaning |
| --- | --- | --- |
| `NOTIFICATION_SCHEDULER_ENABLED` | `true` | Whether this deployment runs the engine's two scheduled jobs |

Optional in `env.validation.ts` and defaulted in the reading code, so that "unset"
and "true" are the same thing at every call site and only an explicit `false`
stops the jobs. Documented in `.env.example`.

**The WebSocket layer has no switch of its own and needs none** — a gateway with
nobody connected does nothing — and it reuses `CORS_ORIGINS` rather than keeping a
second allowlist.

## Frontend

No change — the frontend directory is still empty. When it is built:

- connect with `io(url, { auth: { 'x-user-id': …, 'x-user-role': …, 'x-employee-id': … } })`;
  headers work from Node and Postman but a browser cannot set them on an upgrade;
- subscribe to the five `notification.*` events and to `exception`;
- treat `notification.unreadCount` as authoritative and the others as list
  updates — the count is a number, not a delta, so a client that missed an event
  recovers on the next one;
- switch tabs with `socket.emit('switchWorkspace', { workspace }, ack => …)` and
  read the acknowledgement: it can be refused;
- expect one socket per account. Opening a second connection closes the first, so
  a single shared client belongs in a provider rather than in a component.

## Testing

The whole feature is exercised without a frontend, without a mail server, without
a socket and without a clock to fake.

| Spec | Covers |
| --- | --- |
| `notification-dispatcher.service.spec.ts` | the report; one personal notification per recipient addressed to their account; one email per recipient; the campaign marked sent with the moment it reports; the audience resolved *before* the claim and the claim *before* delivery; `404`; `409` on `SENT`, `CANCELLED` and expired; a `DRAFT` sent anyway; a claim lost to another run; both delivery switches; an audience of nobody; an email failure reported rather than losing the delivery; a non-email failure propagating; the reminder path |
| `notification-delivery.repository.spec.ts` | every read going through the owning service; the campaign and reminder plans; `ALL_EMPLOYEES` resolved now; the title truncated while the subject is not; deduplication; an `EMPLOYEE` campaign with no ids resolving to nobody rather than everybody; no campaign row for a reminder |
| `notification.gateway.spec.ts` | rooms joined on connect; four refused handshakes and the reason on the error channel; an account with no employee record; the `auth` payload; `auth` replacing rather than merging with headers; the displaced socket disconnected; workspace switched without reconnecting; the caller's own room kept; the administrative refusal and the connection left where it was; switching back; a no-op switch; three malformed payloads; emitting to a user by account and to a workspace; an offline account; a swallowed emit failure; no server yet |
| `websocket-user-registry.service.spec.ts` | registration and the personal default; two people kept apart; displacement on the account; a displaced socket disconnecting late; the workspace move; snapshots not mutated |
| `notification-broadcaster.service.spec.ts` | registration on startup; a directly addressed event versus a workspace broadcast; the authoritative count; one count per person for many notifications; two people counted separately; nothing when nobody is connected; the four audiences (`USER`, `ALL_USERS`, `ROLE`, `ADMINISTRATIVE_USERS`); read and deleted; the bulk event; a failed count swallowed |
| `reminder-scheduler.service.spec.ts` | month-end deadlines including December, both Februaries; calendar days rather than 24-hour periods; a rule due and two not; the zero-day rule; a 40-day rule against next month; time of day irrelevant; only the dispatcher invoked; a failing rule not stopping the others; the switch in all three states; the re-entrancy guard |
| `campaign-scheduler.service.spec.ts` | every due campaign sent, in order; a `409` not stopping the batch; one at a time; the switch; the re-entrancy guard |
| `notification-email.template.spec.ts` | the untruncated subject; both parts; paragraphs preserved; markup escaped in body and heading; no double-escaped ampersand; the plain part left alone |
| `notification-delivery.constants.spec.ts` | the category per source; the two bounds actually disagreeing; the boundary at, one past and at the maximum subject; the ellipsis; no trailing space |
| `routing.spec.ts` | the route reaching the dispatcher; `200` rather than `201`; a cuid id; `404` and `409` propagated; no reminder route, no collection, no `GET` |
| `notification.service.spec.ts` (extended) | `createMany` writing in one statement, validating every entry, writing nothing when one is malformed, one existence query, each account asked about once, every missing account named, an empty batch; `countUnread` per workspace and its `403`; every announcement, the idempotent read staying silent, a bulk change of zero staying silent, a publisher failure not breaking the write, re-registration, and the centre working with nothing listening |
| `notification.repository.spec.ts` (extended) | the batch insert and its `select`; an empty batch asking nothing; the unread count carrying the visibility predicate and fetching no rows |
| `notification-campaign.service.spec.ts` (extended) | the delivery shape and its flattened audience; `ALL_EMPLOYEES` with no ids; `null` for a missing campaign; dates as `Date`s; the due query, its `select` and its ordering; the claim as one conditional update, the lost claim, and no read before it |
| `reminder.service.spec.ts` (extended) | `findEnabled` filtering in the query, ordered the way rules fire, unpaginated |
| `employee.service.spec.ts` (extended) | delivery targets flattened; terminated excluded from "everybody" but not from a named list; the address read through the relation; stable ordering |
| `user.service.spec.ts` (extended) | `findExistingIds` answering with what was found, in one query, reading nothing but ids |
| `env.validation.spec.ts` (extended) | the scheduler switch unset, coerced, and rejected when it is not a boolean |
| `test/app.e2e-spec.ts` (extended) | the execution route registered; no reminder route; no collection and no `GET`; and Feature 027 still having no send route |

Both scenarios the task named are covered:

**Scenario 1** — a campaign is executed through
`POST /notification-delivery/execute/:campaignId`, and the notifications, the
emails and the WebSocket events are each asserted at their boundary
(`createMany`, `sendMany`, `emitToUser` / `emitToWorkspace`).

**Scenario 2** — a reminder run is triggered through the scheduler, and the
internal campaign, the notifications, the emails and the events are asserted the
same way.

Results: `npm run typecheck` clean, `npm test` **1908 passed** (100 suites, up
from 1717 in 90), `npm run test:e2e` **48 passed** (up from 44),
`npm run build` clean, `prettier --check` clean, `prisma validate` clean.

## Files Created

| File | Purpose |
| --- | --- |
| `backend/src/modules/notification-delivery/notification-delivery.module.ts` | Wires the engine, the clock and the real-time layer; imports four modules, exports nothing |
| `backend/src/modules/notification-delivery/notification-delivery.constants.ts` | `DeliverySource`, the category table, `toNotificationTitle`, the two cron expressions, the batch size, the switch's key |
| `backend/src/modules/notification-delivery/notification-delivery.constants.spec.ts` | Unit tests, including the truncation seam |
| `backend/src/modules/notification-delivery/notification-delivery.controller.ts` | `POST /notification-delivery/execute/:campaignId` |
| `backend/src/modules/notification-delivery/notification-delivery.repository.ts` | `DeliveryTarget`, `DeliveryPlan`, and the seam between the dispatcher and every owning module |
| `backend/src/modules/notification-delivery/notification-delivery.repository.spec.ts` | Unit tests |
| `backend/src/modules/notification-delivery/notification-dispatcher.service.ts` | The only entry point for delivery |
| `backend/src/modules/notification-delivery/notification-dispatcher.service.spec.ts` | Unit tests |
| `backend/src/modules/notification-delivery/notification-broadcaster.service.ts` | Decides who an event is for; implements the notification centre's port |
| `backend/src/modules/notification-delivery/notification-broadcaster.service.spec.ts` | Unit tests |
| `backend/src/modules/notification-delivery/notification-email.template.ts` | The one email this engine composes, with escaping |
| `backend/src/modules/notification-delivery/notification-email.template.spec.ts` | Unit tests |
| `backend/src/modules/notification-delivery/campaign-scheduler.service.ts` | The per-minute tick for scheduled campaigns |
| `backend/src/modules/notification-delivery/campaign-scheduler.service.spec.ts` | Unit tests |
| `backend/src/modules/notification-delivery/reminder-scheduler.service.ts` | The daily tick, and the deadline arithmetic |
| `backend/src/modules/notification-delivery/reminder-scheduler.service.spec.ts` | Unit tests |
| `backend/src/modules/notification-delivery/routing.spec.ts` | Route tests through a real application |
| `backend/src/modules/notification-delivery/entities/delivery-result.entity.ts` | `DeliveryResultEntity` and `EmailDeliveryStatus` |
| `backend/src/modules/notification-delivery/websocket/notification.gateway.ts` | The only component that touches Socket.IO |
| `backend/src/modules/notification-delivery/websocket/notification.gateway.spec.ts` | Unit tests against a fake socket |
| `backend/src/modules/notification-delivery/websocket/notification-socket-io.adapter.ts` | The official adapter, with this deployment's CORS allowlist |
| `backend/src/modules/notification-delivery/websocket/websocket.constants.ts` | The namespace, the room builders, the default workspace |
| `backend/src/modules/notification-delivery/websocket/websocket-events.ts` | The client and server event names and every payload shape |
| `backend/src/modules/notification-delivery/websocket/websocket-user-registry.service.ts` | Who is connected, on which socket, in which workspace |
| `backend/src/modules/notification-delivery/websocket/websocket-user-registry.service.spec.ts` | Unit tests |
| `backend/src/modules/notifications/notification-events.ts` | `NotificationEventPublisher` — the outbound port, declared by the consumer |
| `FEATURES/028-notification-delivery-engine.md` | This document |

## Files Modified

| File | Change |
| --- | --- |
| `backend/package.json` | Adds `@nestjs/websockets`, `@nestjs/platform-socket.io`, `socket.io`, `@nestjs/schedule` |
| `backend/src/app.module.ts` | Registers `ScheduleModule.forRoot()` and `NotificationDeliveryModule` |
| `backend/src/config/app.setup.ts` | Registers the configured Socket.IO adapter |
| `backend/src/config/env.validation.ts` | `NOTIFICATION_SCHEDULER_ENABLED`, optional and boolean |
| `backend/src/config/env.validation.spec.ts` | A scheduler block |
| `backend/src/common/decorators/current-user.decorator.ts` | `resolveCurrentUser` widened to `HeaderBearingRequest`, so a handshake reuses the HTTP identity rules |
| `backend/src/modules/notifications/notification.service.ts` | `createMany`, `countUnread`, `registerEventPublisher`, and an announcement at every mutation |
| `backend/src/modules/notifications/notification.service.spec.ts` | Bulk creation, counting, and every announcement |
| `backend/src/modules/notifications/notification.repository.ts` | `createMany` (`createManyAndReturn`) and `countUnread` |
| `backend/src/modules/notifications/notification.repository.spec.ts` | The two new queries |
| `backend/src/modules/notification-management/notification-campaign.service.ts` | `CampaignDelivery`, `findForDelivery`, `findDue`, `markSent` |
| `backend/src/modules/notification-management/notification-campaign.service.spec.ts` | The three delivery methods, including the claim |
| `backend/src/modules/notification-management/notification-management.constants.ts` | `SENDABLE_CAMPAIGN_STATUSES` |
| `backend/src/modules/notification-management/reminder.service.ts` | `findEnabled` |
| `backend/src/modules/notification-management/reminder.service.spec.ts` | `findEnabled` |
| `backend/src/modules/employees/employee.service.ts` | `EmployeeDeliveryTarget` and `findDeliveryTargets` |
| `backend/src/modules/employees/employee.service.spec.ts` | `findDeliveryTargets` |
| `backend/src/modules/users/user.service.ts` | `findExistingIds` |
| `backend/src/modules/users/user.service.spec.ts` | `findExistingIds` |
| `backend/test/app.e2e-spec.ts` | A notification-delivery block |
| `.env.example` | The `NOTIFICATION_SCHEDULER_ENABLED` section |
| `FEATURES/HISTORY.md` | Feature 028 row |
| `FEATURES/README.md` | Feature 028 row |

## Notes

- **No schema change and no migration.** The engine owns no table; `sent_at` is
  the column Feature 027 created for it, written here for the first time.
- **The reminder scheduler's "internal campaign" is a value, not a row.** See
  [The internal campaign](#the-internal-campaign) for the whole argument and its
  consequences.
- **Feature 027's 200-vs-150 seam is resolved by truncation**, with the full
  heading kept in the email subject and in the campaign row.
- **`expiresAt` now means something**: an expired campaign is refused, not sent.
- **`notification.updated` is the bulk event.** A client should not expect it for
  a single notification.
- **A broadcast created through Feature 026's temporary `POST` still has shared
  read state.** This engine avoids it by fanning out, but the limitation is the
  centre's and is unchanged.
- **The real-time layer is single-process.** Two instances behind a load balancer
  do not share sockets; the durable half — the notifications themselves — is
  unaffected.
- **Nothing is authenticated or authorised**, exactly as on the HTTP side. The one
  check that exists, the administrative workspace, is what
  `ADMINISTRATIVE_USERS` means rather than authorization arriving early.
- **The manual endpoint is temporary and open**, like Feature 025's test-email
  route and Feature 026's `POST`. It can send a company-wide announcement, and it
  should be administrator-only the moment guards exist.

## Future Improvements

- **A per-campaign delivery report**, the follow-up Feature 027 already named. Its
  shape is exactly `DeliveryResultEntity`, which this feature returns and does not
  store: a table beside `sent_at` would answer "what actually happened when this
  went out" after the request that sent it is gone. It is also where per-recipient
  email outcomes belong.
- **Socket.IO's Redis adapter**, the day this application runs more than one
  instance. Without it an event raised on one instance never reaches a client
  connected to another. A configuration change and one line in the adapter.
- **Read the timesheet deadline from the Timesheets module** instead of assuming
  month-end, and narrow a reminder's audience to people who have not submitted
  yet. Both are edits to two functions —
  `resolveTimesheetDeadlines` and `buildReminderPlan` — and nothing else in this
  feature moves.
- **An event bus, so a delivery is not sent inside the request that caused it.**
  Feature 025's most valuable follow-up, and this feature is its first real
  customer: the manual endpoint currently holds an HTTP request open for the
  length of a thousand inserts and a thousand SMTP conversations.
- **An email queue with retries**, replacing `sendMany`'s sequential loop. It is
  what would let `emailsSent` be a true per-recipient number rather than
  all-or-nothing.
- **Configurable cron expressions**, once somebody wants the reminder tick at a
  different hour or in a different timezone. Today they are documented constants;
  making them environment variables needs a cron-expression validator so a typo is
  a startup failure rather than a job that never fires.
- **Timezone-aware reminders.** The daily tick fires at 07:00 in the server's
  timezone, which is correct for a company in one place and wrong for one in
  several.
- **Retention.** Feature 026 noted that nothing removes a notification except a
  person clicking delete, and named the engine's scheduler as the right home for a
  retention job. It now exists, and adding a third `@Cron` is the smallest part of
  that work — the decision about what may be deleted is the rest.
- **Per-user read state (`notification_reads`)**, Feature 026's own headline
  improvement. This feature's fan-out avoids the limitation for campaigns and
  reminders; the temporary `POST` and any future broadcast still meet it.
- **Authentication on the socket and on the manual endpoint.** `resolveCurrentUser`
  is one function body, and the gateway reads the caller through it exactly as
  every HTTP route does — so the handshake becomes a token check in the same edit
  that changes the HTTP side. The manual endpoint should be administrator-only at
  the same moment.
- **Delivery of leave and timesheet events.** `LeaveRequestsModule` has exported
  its service since Feature 023 saying "the notifications feature will have to
  know when a request changes state". The hand-off is still not taken up, and this
  is the module that will take it: a leave decision becomes a `DeliveryPlan` like
  everything else.

---

## Amended by Feature 030 — Application events as a third delivery source

[Feature 030](030-timesheet-management.md) is the caller this feature said would
arrive: *"the dispatcher is the only entry point for delivery, and it is reached
through the manual endpoint, the two schedulers and — when the timesheet and leave
features want to announce something — by importing this module then."*

**Every addition is additive.** Campaigns and reminders take exactly the code path
they always did, produce exactly the plan they always produced, and no existing
behaviour changed.

### `DeliverySource.Event`

A third source, and the first that is **not a stored row**. A campaign is composed
and a reminder is configured; an event is a *moment* in another module — a
timesheet was rejected — and there is nothing to look up, claim or mark sent.

It is therefore absent from `DELIVERY_CATEGORIES`, which now maps only the two
stored sources. `NotificationCategory` says what a notification is *about*, and for
an event that is the event — a timesheet announcement is `TIMESHEET`, a leave
decision will be `LEAVE` — not the fact that this engine delivered it. A row in
that table would have had to be one category for every event the application will
ever raise, which is precisely the grouping the category exists to avoid.

### `NotificationDispatcher.executeEvent(event)`

The new entry point, and the only export this module now has.

```ts
interface EventDelivery {
  key: string;                 // 'timesheet_rejected' — for the log and the template
  subject: string;
  message: string;
  category: NotificationCategory;
  severity: NotificationType;
  priority: NotificationPriority;
  sendEmail: boolean;
  sendNotification: boolean;
  audience: EventAudience;
}
```

The producing module composes the wording, because only it knows *which* timesheet
and *whose*, and hands over exactly this.

**There is no claim and no `SENT`**, which is the whole difference from
`executeCampaign`. A campaign is a stored row two runs can race over, so it is
claimed by a conditional `UPDATE`. An event has no row, and what stops it being
announced twice is that the module raising it does so inside a state transition
guarded on the current status — `TimesheetService.approve` announces only when its
own `updateMany` moved exactly one row. That guarantee belongs with the
transition; duplicating it here would be a second gate that eventually disagreed
with the first.

It has no refusals of its own either. An event about something that has already
happened cannot be "too late" the way a campaign can be expired, and an audience
that resolves to nobody is a successful delivery of nothing.

### `EventAudience` — and the first non-personal delivery

```ts
type EventAudience =
  | { kind: EventAudienceKind.Employee; employeeId: string }
  | { kind: EventAudienceKind.Administrative };
```

`Employee` resolves exactly as a single-recipient campaign does and is filed
`PERSONAL` + `USER`.

`Administrative` is the new shape: **one `ADMINISTRATIVE_USERS` notification, not
a fan-out.** The argument that makes a fan-out right for a campaign is that each
employee should own their copy — read it, dismiss it, count it. Administrative
review is the opposite: "a timesheet is waiting" is one piece of work that one
administrator picks up, and three personal copies would leave the other two
chasing a month a colleague had already approved. Feature 026's shared `isRead` is
a limitation for an announcement and is exactly the semantics wanted here.

It is deliberately **not** a fan-out over every account whose role is
administrative: that would make "how many administrators are there" a question the
delivery of a timesheet depends on.

### Changes to `DeliveryPlan`

| Field | Was | Is |
| --- | --- | --- |
| `workspace`, `recipientType` | implicit `PERSONAL` + `USER`, written into `toNotificationDto` | stated on the plan |
| `emailRecipients` | derived from `targets` inside `sendEmails` | its own list |
| `eventKey` | — | which event a run announced, null on both stored sources |

The first two were implicit and are now explicit because an administrative event
is neither. `toPersonalPlan` fills them for campaigns, reminders and
employee-addressed events, so the departure is visible in one branch rather than
in three ternaries spread across the builders.

`emailRecipients` is separate because the two lists genuinely differ on one
delivery: an administrative broadcast reaches a *workspace* in-app, but an email
needs an address. For every other plan it is exactly `targets.map(t => t.email)`,
which is what it always was.

`DeliveryResultEntity` gains `eventKey` for the same reason, and its
`recipientCount` is documented as `0` on a workspace-addressed delivery —
`notificationsCreated: 1` beside it is the honest description of a broadcast.

### `WorkScheduleModule` is a fifth import

The narrowest of the five: one method, `findEmails`, for the one audience that is
not a list of employees. Feature 016 created `timesheet_approval_emails` as "an
address notified when a timesheet needs approval" and nothing had read it until an
event had to reach the people who review one.

An empty list — or a work schedule nobody has configured, which makes that service
answer `404` — is treated as "no addresses" rather than propagated. The in-app
notification is the channel administrators work from; turning "your timesheet was
submitted" into a failed submission over a missing mailing list would be the wrong
trade.

`PrismaModule` is still **absent**. This feature still owns no table, and every
read still goes through the module that owns the data.

### `NotificationDispatcher` is now exported

The one export, added by the caller that needed it rather than in advance —
exactly as this document said it would be. The repository and the two schedulers
stay private: nothing outside this module has business building a delivery plan or
deciding that a schedule has arrived.

### No new email template

`renderNotificationEmail` takes a subject and a body, which is precisely what a
timesheet event composes. The wording lives in the producing module because only
it knows which timesheet and whose — and when the templating feature this document
anticipates arrives, it replaces that function and nothing about `EventDelivery`
changes.

### What this leaves for the leave feature

The hand-off named in this document's Future Improvements — *"a leave decision
becomes a `DeliveryPlan` like everything else"* — is now a smaller job than it was:
`executeEvent` exists, `EventAudience.Employee` is the right shape for "tell the
person whose leave it is", and `NotificationCategory.LEAVE` is already seeded.
What remains is the wording and the call.
