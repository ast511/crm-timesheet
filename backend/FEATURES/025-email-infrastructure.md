# Feature 025 — Email Infrastructure

**Status:** Completed
**Date:** 2026-08-05

## Goal

Give the application the ability to send email, and give it exactly once.

The deliverable is a reusable `EmailService` that talks to an SMTP server, plus
the two endpoints an operator needs to confirm a deployment is configured. From
here on, a module that has something to tell somebody injects that service and
hands it a subject and a body; nothing else in the project imports Nodemailer,
reads an `SMTP_*` variable or opens a connection.

What this feature deliberately does **not** implement, each belonging to a
feature of its own: a notification centre, notification templates, broadcast
notifications, template rendering, variable substitution, an event bus, a
scheduler, WebSockets, an email queue, retries, leave notifications, timesheet
notifications, authentication and authorization.

The distinction that decides all of them: this module knows how to *deliver* a
message, not how to *compose* one and not *when* to send it.

## Requirements

- One `EmailService`, injectable, with `send()` and `sendMany()`.
- One SMTP transporter, created once and reused for the life of the process.
- SMTP settings read from the environment, never from the database.
- No Prisma model, no migration, no schema change.
- No provider exception ever reaches a caller — everything is wrapped in
  `EmailException`.
- `GET /api/v1/email/health` reports whether mail is configured and whether the
  server answers.
- `POST /api/v1/email/test` sends a real, fixed message to one address.
- The module depends on no business module, and nothing depends on it yet.

## Backend

### Structure added

```text
backend/src/modules/email/
├── dto/
│   ├── email-health-response.dto.ts   # the health contract + EmailConnectionStatus
│   ├── test-email.dto.ts              # the one-field request body
│   └── test-email.dto.spec.ts
├── interfaces/
│   ├── send-email-options.interface.ts       # SendEmailOptions, EmailAttachment
│   └── send-bulk-email-options.interface.ts  # SendBulkEmailOptions
├── email.config.ts                    # the environment → SmtpConfig loader
├── email.config.spec.ts
├── email.controller.ts
├── email.controller.spec.ts
├── email.exception.ts
├── email.module.ts
├── email.service.ts
└── email.service.spec.ts
```

Two files beyond the requested layout, each because something needed a home:

| File | Why it exists |
| --- | --- |
| `email.config.ts` | Reading eleven variables, treating a blank one as absent, deriving `secure` from the port and naming what is missing is a page of logic. Inside the service it would have buried the four public methods; as a function it is directly unit-testable against a stub `ConfigService`, which is how the table in *Testing* below was written. It is the module's counterpart of `cors.config.ts`. |
| `dto/email-health-response.dto.ts` | A response needs a declared shape. It follows `src/health/dto/health-response.dto.ts` exactly — an interface rather than a class, because nothing is validated on the way out. |

Nothing else was added: no `entities/` (this module owns no row), no
`email.constants.ts` (the four message constants live at the bottom of the
service, beside their only caller, the way `work-schedule.service.ts` keeps
`NOT_CONFIGURED_MESSAGE`).

### The interfaces

**`SendEmailOptions`** — `to`, `subject`, `html`, and the optional `text`, `cc`,
`bcc`, `attachments`. It is the contract every future caller writes against, and
it is deliberately written in the vocabulary of *email* rather than of the
library that delivers it: no Nodemailer type appears in it. That is what lets the
transport be replaced — by a provider API, by a queue, by a fake in a test —
without touching a caller.

Two absences are the design:

- **No `from`, no `replyTo`.** They identify the sender, they are identical for
  every message this application produces, and they come from the environment. A
  caller able to set them could send mail as somebody else.
- **`html` is required.** Every message this application sends is HTML; `text` is
  the fallback for clients that will not render it. A body is not optional, and
  making it so would only produce empty emails.

**`EmailAttachment`** — `filename`, `content` (`string | Buffer`),
`contentType?`. Its own type rather than the library's, for the same reason: an
attachment is a name plus bytes plus a media type in any provider's API, and
stating that keeps Nodemailer's richer options (streams, URLs, pre-encoded
content) out of the contract until something actually needs them.

**`SendBulkEmailOptions`** — declared as `Omit<SendEmailOptions, 'to'>` plus
`recipients: string[]`. Written that way rather than as a second, independent
interface so the body, subject and attachments are described in exactly one
place; a copy is what eventually forgets a field the other one has gained.

`recipients` rather than `to: string[]`, because the two are not the same
message. A `to` holding several addresses is one email whose recipients can all
read each other's addresses; this sends each person their own copy. Notifications
go to colleagues, so the per-recipient form is the one worth having.

### EmailService

Four public methods, and the class doc records the four decisions behind them.

**`send(options): Promise<void>`**

Resolving means the SMTP server *accepted the message for delivery*, not that it
arrived — mail is store-and-forward, and a mailbox that bounces an hour later is
invisible from here. A caller writing "the employee has been notified" into a
record is recording exactly this much.

The order of its two guards is deliberate: the `SMTP_ENABLED` switch is checked
*before* the configuration, so an environment that has turned email off does not
also have to carry credentials it will never use. Then one `sendMail`, wrapped
in a `try` that logs the provider's error and rethrows `EmailException`.

**`sendMany(options): Promise<void>`**

A loop that calls `send()` once per recipient. Sequential, no batching, no
parallelism, no queue, no retry — a failure on the third address stops the loop
and propagates, so the first two are sent and the rest are not. That is honest
for the handful of addresses this application maintains by hand, and it is the
behaviour the email-queue feature will replace when it takes delivery out of the
request.

An empty list is a no-op, including when SMTP is not configured: sending to
nobody cannot fail, and "there are no notification addresses configured" is a
normal state rather than an error.

**`checkHealth(): Promise<EmailHealthResponseDto>`** and
**`sendTestEmail(email): Promise<void>`** — described under *API* below.

### How Nodemailer is configured, and how the transporter is initialised

`createTransport` is called in exactly one place, `createSmtpTransport()` in
[email.service.ts](../src/modules/email/email.service.ts), from the
service constructor:

```ts
createTransport({
  host: config.host,
  port: config.port,
  secure: config.secure,
  auth: { user: config.user, pass: config.password },
  connectionTimeout: config.connectionTimeout,
  socketTimeout: config.socketTimeout,
});
```

The result is held in a `private readonly` field. "Built once and reused" is
therefore a property of the class rather than a rule somebody has to remember —
there is no code path that could build a second one, and a unit test pins that
two sends and a health check produce exactly one `createTransport` call.

The constructor is a safe place for it because `createTransport` opens nothing:
it assembles an options object and returns a transporter, and the first TCP
connection happens on the first `sendMail` or `verify`. Nodemailer then keeps
that connection available rather than repeating the TCP connect, the TLS
handshake and the SMTP authentication per message — which is the whole reason
the instance is shared.

The transporter and the configuration that produced it are stored together in
one nullable field:

```ts
private readonly smtp: { config: SmtpConfig; transporter: Transporter } | null;
```

Two fields could disagree; one cannot. `requireSmtp()` narrows it or throws, and
every send goes through it, so "email is not configured" is stated once.

**The two timeouts are not decoration.** Nodemailer defaults to two minutes for
a connection and ten for a socket. Sending happens inside an HTTP request, so an
unreachable host would hold that request open for two minutes — long after the
client gave up. The defaults here are 10s and 30s, overridable per deployment.
They apply to `verify()` as well, which is what keeps the health endpoint fast
when the mail server is down.

### How the SMTP configuration is loaded from `.env`

[email.config.ts](../src/modules/email/email.config.ts) exports
`SMTP_KEYS` (the variable names, so no literal is repeated), the `SmtpConfig`
shape, and `loadSmtpConfig(configService)`, which answers:

```ts
{ config: SmtpConfig | null, enabled: boolean, missing: string[] }
```

- **`config` is `null` rather than an exception** when something is missing. A
  deployment with no mail server is legitimate — a developer machine, a CI run, a
  demo — and the application must still start. Refusing to boot would make the
  whole API hostage to a feature most requests never touch.
- **Required to send**: `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD`,
  `SMTP_FROM_EMAIL`. Without any one of them there is no connection to make or
  no envelope to address. Half a configuration is not a configuration.
- **`missing` names them** so startup can log which. Names only, never values —
  the same rule `formatErrors` follows in `env.validation.ts`, where printing a
  rejected value would put the database password in the log.
- **`enabled` is separate from `config`** because the two answer different
  questions: how to reach a mail server, and whether to use it. See
  *`SMTP_ENABLED`* below.
- **A blank variable counts as absent.** `SMTP_HOST=` is how a placeholder is
  cleared, not how a host is named.
- **`SMTP_SECURE` is derived from the port when unset**: `true` for 465 (TLS
  from the first byte), `false` for everything else (STARTTLS). That single
  derivation is the difference between a working configuration and a connection
  that hangs, and it is the mistake nobody makes twice.

The variables are also declared in
[env.validation.ts](../src/config/env.validation.ts), all optional. The
optionality is the deliberate part: the application boots without any of them.
What the contract adds is that a variable which *is* set has to make sense — a
port that is not a number, a sending address that is not an address, a timeout
below a second — so a typo is found at startup rather than at the first
notification nobody receives. `@ToBoolean()` and `@Type(() => Number)` also mean
`ConfigService` hands the loader a real `boolean` and a real `number`.

Which variables are *required to send* is stated in `loadSmtpConfig`, not in the
environment contract: it is the module's rule, and it belongs where the module
can change it.

`IsEmailOrBlank()` is a three-line local decorator in the same file, so a blank
address is skipped rather than rejected. Without it the two halves would
disagree — a blank host would leave the application running and reporting itself
unconfigured, while a blank sending address would stop it from booting.

### `SMTP_ENABLED`

The master switch, defaulting to `true`. `false` makes `send()` and `sendMany()`
resolve without sending.

Dropping rather than failing is the point: the switch exists for an environment
that holds real employee addresses and must not mail them — a staging copy of
production — and it would be worthless if it turned every notification into a
500. The leave request that triggered the email must still be approved.

`sendTestEmail()` is the one caller that refuses instead, because of what the
call means: a notification is a side effect of some other action and must not
fail it, while a test *is* the action — an operator asking whether mail works.
Answering "yes" without having sent anything would be a lie discovered by waiting
for an email that never comes.

### EmailException

[email.exception.ts](../src/modules/email/email.exception.ts) — the only
failure the service ever throws, raised for a missing configuration, a disabled
test send, and every delivery failure.

Nodemailer's own errors are useful and completely unsuitable for a caller: they
carry a provider-specific `code` (`EAUTH`, `ECONNECTION`, `EENVELOPE`), the SMTP
server's verbatim response, and — depending on the server — the account the
connection authenticated with. Letting one escape would put the provider's
vocabulary into every module that sends a notification, and its text into the
API's error envelope.

So `send()` catches everything, logs the original, and rethrows this. Two
consequences are the class:

1. **Callers depend on the abstraction.** `error instanceof EmailException`
   keeps working the day SMTP is replaced by a provider API or by a queue.
2. **The client is told what happened, not how.** The message is written in the
   service; the reason is in the log. A unit test asserts that a
   `535 5.7.8 Bad credentials for apikey` does not appear in what a caller sees
   — the same test Feature 006 wrote for the global filter, for the same reason.

It extends `InternalServerErrorException` rather than `Error`, so the global
filter from Feature 006 renders it as the ordinary error envelope with a 500 —
"the server could not do what it promised", which is what a failed send is. The
original error stays attached as `cause` for anything that wants to inspect it
programmatically; `HttpException` serialises only its message, so it is never
rendered.

### Logging

`Logger` from `@nestjs/common`, the project's existing strategy, with one rule
applied throughout: **no recipient, no subject, no value of any variable.** Both
a recipient and a subject are personal data once notifications exist — "Leave
request from Ana Pop" is a sentence about an employee — and neither helps
diagnose an SMTP failure, where the provider's error code is what matters.

| When | Level | What is said |
| --- | --- | --- |
| Startup, nothing configured | `warn` | which variables are missing, by name |
| Startup, configured but `SMTP_ENABLED=false` | `warn` | that messages will be dropped |
| A message dropped because disabled | `debug` | that one was dropped |
| A send failed | `error` | the provider's stack |
| A health check failed | `error` | the provider's stack |

## Frontend

No change — the frontend directory is still empty. When it exists, the health
endpoint is the natural content of an administration "Email" panel: three fields
that answer "is this deployment able to send mail?", with the test endpoint
behind a button next to them.

## Database

**No change.** No Prisma model, no migration, no seed change, and none is
required.

SMTP settings are configuration of the *deployment*, not data about the company.
Three reasons they stay in `.env`:

1. **They differ per environment and the database does not follow.** Staging and
   production talk to different mail servers with different credentials. A
   restored production dump would carry production's mail configuration into
   staging, and the first notification would go to a real employee.
2. **`SMTP_PASSWORD` is a secret.** A table the application reads is the wrong
   place for one: it is in every backup, every dump and every `SELECT` an
   administrator runs, and encrypting it there would require a key that lives in
   the environment anyway.
3. **The application must be able to boot and be diagnosed without them.** A
   configuration the database owns cannot be read before the database is
   reachable, and "email is misconfigured" would become a second failure mode of
   "the database is down".

Which addresses receive which notification is a different question and already
lives in the database, correctly — `timesheet_approval_emails` (Feature 016) and
`leave_notification_emails` (Feature 021). Those are decisions about the
company; this is a property of the machine.

## API

Two endpoints, neither of which is a resource: nothing is stored, nothing is
listed, nothing is addressed by an id.

### `GET /api/v1/email/health`

Runs `transporter.verify()`, which opens a connection and authenticates without
sending anything, so it catches the two failures that are otherwise discovered
only by a message that never arrives: a host nobody can reach, and credentials
the server rejects.

```json
{ "success": true, "data": { "configured": true, "enabled": true, "connection": "OK" } }
```

| `configured` | `enabled` | `connection` | Means |
| --- | --- | --- | --- |
| `true` | `true` | `OK` | Mail works. |
| `true` | `true` | `FAILED` | Configured, and the server refused or could not be reached. |
| `true` | `false` | `OK` / `FAILED` | Configured, sending switched off with `SMTP_ENABLED`. |
| `false` | `false` | `NOT_CONFIGURED` | No mail server in the environment. Nothing was contacted. |

A `FAILED` answer carries a fourth field naming which failure it was:

```json
{ "configured": true, "enabled": true, "connection": "FAILED", "reason": "AUTHENTICATION_FAILED" }
```

| `reason` | Points at |
| --- | --- |
| `AUTHENTICATION_FAILED` | `SMTP_USER` / `SMTP_PASSWORD` — the server rejected the credentials |
| `CONNECTION_FAILED` | `SMTP_HOST` / `SMTP_PORT` — the server could not be reached |
| `TIMED_OUT` | An unreachable or overloaded host; the connection timeout expired |
| `TLS_ERROR` | Almost always `SMTP_SECURE` disagreeing with the port |
| `UNKNOWN` | Something else. The log has the provider's own account of it |

`reason` is present only when `connection` is `FAILED`, so its absence is not a
fourth state to interpret.

**Why a code rather than the server's message.** `FAILED` on its own leaves an
operator guessing between a wrong password, a wrong host and a wrong port, which
is exactly the question they are trying to answer while editing `.env` — so the
endpoint has to say more. What it must not say is the mail server's own
sentence, because this endpoint has no authentication in front of it and those
sentences read like `535 5.7.8 Username and Password not accepted for user
apikey@company.com` or `connect ECONNREFUSED 10.0.3.14:587`: a username, an
internal address, an internal hostname. The codes carry the actionable
distinction and none of the detail, and a unit test asserts none of that text
survives into the response.

The values are ours rather than Nodemailer's `EAUTH` / `ECONNECTION`, for the
same reason `EmailException` exists: a client should not learn which library
delivers the mail. `PROVIDER_FAILURE_REASONS` in the service is the one table
that knows both vocabularies; an unmapped code becomes `UNKNOWN` rather than a
guess, and the log is where the next one is discovered.

Only the health endpoint reports a reason. A failed `send()` stays a plain 500
with `The email could not be sent`: that response goes to whoever triggered some
unrelated business action, not to somebody diagnosing mail.

Three further points about the contract:

- **Always 200**, including on `FAILED`. The check succeeded in finding out that
  mail is broken, and the body says so. A 503 would leave a monitoring probe
  unable to distinguish "email is down" from "this endpoint is down". It is also
  the one path in the module that raises no `EmailException` — the failure *is*
  the answer.
- **`configured` and `enabled` are two questions, not one restated.** They come
  apart exactly where `SMTP_ENABLED` exists to make them.
- **The connection is checked even when disabled**, so "the credentials are
  sound and sending is off" stays distinguishable from "nothing was ever set
  up".

### `POST /api/v1/email/test`

```json
{ "email": "john@example.com" }
```

Sends a real message through the same `send()` every other caller uses — the
same transporter, the same headers, the same error handling — so what it
exercises is the real path and not a second one that could work while the first
does not.

- **Subject**: `HR Management System - Test Email`
- **Body**: "This is a test email." / "If you received this email, the SMTP
  configuration is working correctly.", as both text and HTML.

Answers **200** with `{ "success": true, "data": null }`. `@HttpCode(HttpStatus.OK)`
overrides the 201 Nest gives a `@Post`, because nothing was created — there is no
resource to point at and no `Location` to return. The confirmation the caller is
really after arrives in their inbox.

Validation is one rule: `email` is required and must be a valid address, through
the shared `@IsEmailAddress()` decorator that trims, lower-cases and applies the
RFC 5321 length limit — the same rule every other address in this API goes
through.

**The message is fixed, and that is a security property, not a simplification.**
There is no authentication in front of this endpoint yet (Feature 006's rule:
half an access check is worse than none). An endpoint accepting a caller-supplied
subject and body would be an open relay wearing the company's `From` address.
`forbidNonWhitelisted` on the global pipe turns any attempt to add one into a
400, and both the DTO spec and the e2e suite assert it.

There is deliberately **no** endpoint for sending an arbitrary message. Sending
is reached by injecting the service, never over HTTP.

### Failures

| Situation | Status | Message |
| --- | --- | --- |
| Malformed or missing address | 400 | the `ValidationPipe`'s per-field array |
| Extra field in the body | 400 | as above |
| SMTP not configured | 500 | `Email is not configured on this server` |
| `SMTP_ENABLED=false` | 500 | `Email sending is disabled on this server` |
| Delivery failed | 500 | `The email could not be sent` |

All five are rendered by the global exception filter as the standard error
envelope. The 500s name a condition rather than a cause: the SMTP error behind
the last one is in the log, not in the response.

## How future modules reuse this

```ts
@Module({ imports: [EmailModule], ... })
export class LeaveNotificationsModule {}
```

```ts
constructor(private readonly emailService: EmailService) {}

await this.emailService.send({
  to: employee.email,
  subject: 'Your leave request was approved',
  html: renderedBody,          // produced by the templates feature
});
```

`EmailModule` imports nothing and depends on no business module, so anything may
import it without creating a cycle. It is registered in `app.module.ts` beside
`HealthModule` rather than among the business modules, because it owns no
resource.

No method was written in advance for any future caller. A `sendLeaveApproval()`
here would put a leave rule inside the transport; the rule belongs to the leave
feature, and what it needs from this one is `send`.

Three things a future feature must keep true:

1. A business module never imports `nodemailer`, never reads an `SMTP_*`
   variable, and never builds a transporter.
2. A caller that must not fail when mail fails catches `EmailException` itself.
   `send()` throwing inside a request handler will otherwise turn a successful
   business action into a 500 — the case for the event bus, and the reason it is
   named in *Future Improvements*.
3. Composition — templates, variables, wording — happens before the call. This
   module receives strings.

## Testing

Unit and e2e only; nothing here contacts a real mail server.

| Spec | Covers |
| --- | --- |
| `email.config.spec.ts` | a complete configuration; the two optional headers absent; the timeout defaults; `secure` derived from 465 / 587 / 25; `SMTP_SECURE` overriding the derivation; the string spellings the environment produces; `SMTP_ENABLED` defaulting to true and reported even with nothing configured; each required variable absent in turn; every missing name reported at once; blank and whitespace-only values; trimming; a non-integer port and a non-integer timeout |
| `email.service.spec.ts` | one transporter across two sends and a health check; the exact options passed to `createTransport`; no transporter at all when unconfigured; the startup warning naming variables but never values; the full message handed to the transport; the bare-address `From`; a refusal when unconfigured; a provider error wrapped, its text absent from the message, the original kept as `cause` and logged; one message per recipient; an empty list; the stop at the first failure; the three health answers; the five failure reasons and the three ways of arriving at `UNKNOWN`; the server's message absent from a `FAILED` body; no reason on `OK`; the four behaviours when `SMTP_ENABLED=false`; the fixed test message |
| `email.controller.spec.ts` | each route reaching its service method with the argument it was given, and a failure propagating untouched |
| `dto/test-email.dto.spec.ts` | a valid address; trimming and lower-casing; five malformed addresses; a missing one; the length cap; three attempts to add a field to the body |
| `config/env.validation.spec.ts` | an environment with no mail server at all; the port and both switches coerced out of their string form; four bad ports; three bad booleans; malformed `SMTP_FROM_EMAIL` and `SMTP_REPLY_TO`; a blank address accepted; a timeout below the floor |
| `test/app.e2e-spec.ts` | an `email` block: a malformed address, a missing one, two attempts to steer the message, and the absence of any send endpoint |

`GET /email/health` is deliberately **not** requested in the e2e suite. It is the
one route whose handler would reach outside the process — on a machine with SMTP
configured it opens a real connection — which would make the run depend on the
developer's `.env` and on a network. Its three answers are pinned in the service
spec against a mocked transport instead.

Nodemailer is mocked at the module boundary (`jest.mock('nodemailer')`), which is
what lets the transporter's own contract — built once, given these options,
`sendMail` called with this payload — be asserted directly.

Results: `npm run typecheck` clean, `npm test` 1389 passed (77 suites),
`npm run test:e2e` 44 passed, `npm run build` clean, `prettier --check` clean.

## Files Created

| File | Purpose |
| --- | --- |
| `backend/src/modules/email/email.module.ts` | Declares the module; exports `EmailService`; imports nothing |
| `backend/src/modules/email/email.service.ts` | The only component that sends email: `send`, `sendMany`, `checkHealth`, `sendTestEmail` |
| `backend/src/modules/email/email.service.spec.ts` | Unit tests against a mocked Nodemailer |
| `backend/src/modules/email/email.controller.ts` | `GET /email/health` and `POST /email/test` |
| `backend/src/modules/email/email.controller.spec.ts` | Unit tests for the two delegations |
| `backend/src/modules/email/email.exception.ts` | `EmailException` — the only failure the service throws |
| `backend/src/modules/email/email.config.ts` | `SMTP_KEYS`, `SmtpConfig`, `loadSmtpConfig` — the environment reader |
| `backend/src/modules/email/email.config.spec.ts` | Unit tests for the loader |
| `backend/src/modules/email/dto/test-email.dto.ts` | The one-field body of the test endpoint |
| `backend/src/modules/email/dto/test-email.dto.spec.ts` | Unit tests through a real `ValidationPipe` |
| `backend/src/modules/email/dto/email-health-response.dto.ts` | `EmailHealthResponseDto`, `EmailConnectionStatus`, `EmailFailureReason` |
| `backend/src/modules/email/interfaces/send-email-options.interface.ts` | `SendEmailOptions` and `EmailAttachment` |
| `backend/src/modules/email/interfaces/send-bulk-email-options.interface.ts` | `SendBulkEmailOptions` |
| `FEATURES/025-email-infrastructure.md` | This document |

## Files Modified

| File | Change |
| --- | --- |
| `backend/package.json` | Adds `nodemailer` and `@types/nodemailer` |
| `backend/src/app.module.ts` | Registers `EmailModule` beside `HealthModule` |
| `backend/src/config/env.validation.ts` | Eleven optional `SMTP_*` variables, validated when present; local `IsEmailOrBlank()`; `MIN_TIMEOUT_MS` |
| `backend/src/config/env.validation.spec.ts` | An `SMTP` block |
| `backend/test/app.e2e-spec.ts` | An `email` block |
| `.env.example` | The documented `SMTP_*` section |
| `FEATURES/HISTORY.md` | Feature 025 row |
| `FEATURES/README.md` | Features 024 and 025 rows |

## Notes

- **`.env.example` ships every `SMTP_*` line commented out.** An uncommented
  blank would be indistinguishable from a cleared value, and the module treats
  both as absent — so the file states the intended default state, which is "this
  machine has no mail server", rather than an empty configuration.
- **`enabled` was going to be a later feature.** The health contract was written
  with the field separate from `configured` on the assumption that a kill switch
  would eventually be needed; `SMTP_ENABLED` arrived in the same feature instead,
  and the field means what it was reserved for.
- **`EmailModule` has no consumer yet**, on purpose. Delivering the capability
  and the first notification in one feature would have meant designing the
  transport around one caller's needs.
- **Nothing is queued, so a send happens inside the request that triggered it.**
  For the test endpoint that is exactly right. For a future notification it is
  the thing to fix, and the two timeouts are the interim guard: they bound the
  damage an unreachable mail server can do to an unrelated request.
- **`sendMany` is O(n) round trips.** With a pooled transporter that is cheaper
  than it looks, but it is still one conversation per recipient and it blocks.
  The volume this application has — a handful of hand-maintained addresses —
  makes it the right amount of machinery today.

## Future Improvements

- **An event bus, so a notification is not sent inside the request that caused
  it.** The single most valuable follow-up: it removes the failure mode where a
  mail server outage turns a successful leave approval into a 500, and it is the
  natural place for the queue and the retries to attach.
- **An email queue with retries and per-recipient outcomes**, replacing the
  sequential loop in `sendMany`. It needs a persisted job, which means the first
  Prisma model this module has ever had.
- **Templates and rendering**, so callers hand over a template name and values
  instead of an HTML string. `SendEmailOptions` does not change — the renderer
  produces the `html` it already takes.
- **Authentication and authorization on both endpoints.** `POST /email/test`
  sends real mail from the company's server and is currently open, held safe
  only by the message being fixed. It should be administrator-only the moment
  guards exist.
- **A reason on a failed send, once there is authentication.** `checkHealth`
  reports one and `send` does not, because only the first is a diagnostic
  surface. When the endpoints are administrator-only, an administrator-triggered
  test send could carry the same code — `EmailException` would need a field for
  it, and the filter a way to render it.
- **A `Message-ID` in the log.** `sendMail` returns one; recording it — with no
  recipient and no subject — would let a failure be traced to a specific message
  in the mail server's own logs, which is the one piece of context the current
  logging deliberately omits and cannot reconstruct.
- **Support for a relay that needs no authentication.** `SMTP_USER` and
  `SMTP_PASSWORD` are required today, which rules out a local Mailpit/MailHog on
  port 1025 without dummy credentials. Making the pair optional-but-together is a
  small change to `loadSmtpConfig`, worth making when somebody actually wants
  that setup.
- **A `pool: true` transporter** if volume ever justifies it. Nodemailer's
  pooling is off by default and the current traffic does not need it.
