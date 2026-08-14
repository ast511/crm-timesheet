# Feature History

Append new features to the end of this table.

| ID  | Feature | Status | Date |
| --- | ------- | ------ | ---- |
| 001 | [Backend Initialization](001-backend-initialization.md) | Completed | 2026-08-01 |
| 002 | [Docker & PostgreSQL Setup](002-docker-postgresql-setup.md) | Completed | 2026-08-01 |
| 003 | [Prisma ORM Setup](003-prisma-orm-setup.md) | Completed | 2026-08-01 |
| 004 | [API Foundation & Global Application Configuration](004-api-foundation-global-configuration.md) | Completed | 2026-08-01 |
| 005 | [Database Seeding](005-database-seeding.md) | Completed | 2026-08-01 |
| 006 | [Shared Backend Infrastructure](006-shared-backend-infrastructure.md) | Completed | 2026-08-01 |
| 007 | [Departments Module](007-departments-module.md) | Completed | 2026-08-03 |
| 008 | [Positions Module](008-positions-module.md) | Completed | 2026-08-03 |
| 009 | [Users Module](009-users-module.md) | Completed | 2026-08-03 |
| 010 | [Employees Module](010-employees-module.md) | Completed | 2026-08-03 |
| 011 | [Projects Module](011-projects-module.md) | Completed | 2026-08-03 |
| 012 | [Project Status Consolidation](012-project-status-consolidation.md) | Completed | 2026-08-03 |
| 013 | [Project Members Module](013-project-members-module.md) | Completed | 2026-08-03 |
| 014 | [Project Roster Endpoint](014-project-roster-endpoint.md) | Completed | 2026-08-03 |
| 015 | [Scoped Membership Endpoints](015-scoped-membership-endpoints.md) | Completed | 2026-08-03 |
| 016 | [Work Schedule Configuration](016-work-schedule-configuration.md) | Completed | 2026-08-04 |
| 017 | [Public Holidays Module](017-public-holidays-module.md) | Completed | 2026-08-04 |
| 018 | [Public Holiday Calendar Endpoints](018-public-holiday-calendar-endpoints.md) | Completed | 2026-08-04 |
| 019 | [Public Holiday Validity Years](019-public-holiday-validity-years.md) | Completed | 2026-08-04 |
| 020 | [Termination Closes Project Memberships](020-termination-closes-memberships.md) | Completed | 2026-08-04 |
| 021 | [Leave Configuration](021-leave-configuration.md) | Completed | 2026-08-04 |
| 022 | [Employee Leave Balances](022-employee-leave-balances.md) | Completed | 2026-08-04 |
| 023 | [Leave Requests](023-leave-requests.md) | Completed | 2026-08-04 |
| 024 | [Leave Balance Generation](024-leave-balance-generation.md) | Completed | 2026-08-05 |
| 025 | [Email Infrastructure](025-email-infrastructure.md) | Completed | 2026-08-05 |
| 026 | [Notification Center](026-notification-center.md) | Completed | 2026-08-05 |
| 027 | [Notification Management](027-notification-management.md) | Completed | 2026-08-05 |
| 028 | [Notification Delivery Engine](028-notification-delivery-engine.md) | Completed | 2026-08-05 |
| 029 | [Permission Management](029-permission-management.md) | Completed | 2026-08-06 |
| 030 | [Timesheet Management](030-timesheet-management.md) | Completed | 2026-08-06 |
| 031 | [Reporting](031-reporting.md) | Completed | 2026-08-07 |
| 032 | [Authentication](032-authentication.md) | Completed | 2026-08-08 |
| 033 | [Error Code Standardization](033-error-code-standardization.md) | Completed | 2026-08-09 |
| 034 | [Rate Limiting](034-rate-limiting.md) | Completed | 2026-08-09 |
| 035 | [Authorization Enforcement](035-authorization-enforcement.md) | Completed | 2026-08-09 |
| 036 | [Account Lifecycle](036-account-lifecycle.md) | Completed | 2026-08-09 |
| 037 | [Security Headers](037-security-headers.md) | Completed | 2026-08-12 |
| 038 | [API Documentation](038-api-documentation.md) | Completed | 2026-08-13 |
| 039 | [User UI Preferences](039-user-ui-preferences.md) | Completed | 2026-08-13 |
| 040 | [Refresh Token via HttpOnly Cookie](040-refresh-cookie.md) | Completed | 2026-08-14 |

**The authentication series (032–036) is complete.** Identity is proved rather
than claimed (032), every failure carries a stable code (033), every route is
rate limited (034), declared routes are authorised (035), and an account now has
a life of its own — created by an administrator, activated by its owner through
an emailed link, recovered, changed, enabled and disabled (036). No password is
ever emailed, and nobody but an account's owner ever knows one.

Feature 035 closes the deferral recorded across the whole project. Nearly every
module from 023 onwards carries a version of the same sentence — "no permission
is checked", "there is no guard here", "`PermissionResource.REPORTS` is seeded
and waiting", "this computes but does not enforce" — because enforcement needed a
real identity first. Feature 029 built the engine, Feature 032 supplied the
identity, and 035 connects them. Gating the *remaining* routes stays a gradual,
per-module effort; the mechanism is no longer missing.

Feature 037 turns from who is calling to how the answer travels. Every response
now carries the standard security headers — the API used to set none, and used
to name its own framework on the way out. The Content Security Policy it
configures is honestly a scaffold while this backend answers with JSON; it
starts protecting something the day HTML and JavaScript are served, and 037
records exactly which directives have to change when Swagger UI and the React
frontend arrive.

Feature 038 is the first whose output is not for this backend at all. Thirty-two
features built 124 endpoints whose only description was the source code; this
one generates the description — from the controllers, the DTOs and the entity
classes — and serves it at `/api/docs`, with the raw OpenAPI document beside it
at `/api/docs-json` as the contract the frontend will read and generate a typed
client from. Nothing is hand-written, so nothing can drift.

It also settles the note 037 left for it, and settles it more narrowly than that
note proposed: Swagger UI needs `'unsafe-inline'` for styles, so it is granted on
`/api/docs` alone rather than on every response in the deployment.
`SECURITY_CSP_MODE` stays `strict`, and inline *script* stays blocked even on the
documentation page.

Feature 039 is the smallest thing here in a long while, and deliberately so: two
enums, two columns on `users`, two fields on a payload that already existed. It
is the first feature whose subject is what the application *looks like* rather
than what it knows — a person's palette and corner radius, stored server-side so
they follow them to the next machine instead of living in one browser's local
storage. It adds no module, no table and no endpoint, because `PATCH /profile/me`
was already the route by which somebody changes things about themselves, and
`UpdateProfileDto` had recorded — back in 036 — where a preference would go and
on what day it would join the whitelist. Light and dark are the one thing it
declines to store: that is the device's answer, not the account's.

Feature 040 reopens the authentication series to change exactly one thing: which
part of an HTTP message carries the refresh token. It is now an `HttpOnly`
cookie rather than a field in a JSON body, which means a script injected into the
frontend can no longer read it — and the refresh token is the half of a session
worth stealing, because it lasts a week and renews itself indefinitely while an
access token lasts fifteen minutes and cannot.

It is careful about what that is worth. A script on the page can still *use* the
session while the tab is open — the browser will attach the cookie for it — it
simply cannot copy the credential out to a machine its owner cannot reach. The
feature document says so rather than claiming XSS immunity.

Nothing else moved, and the shape of the change is the point: `AuthService` was
not edited except for its return type, because it takes a refresh token as a
string and hands one back as a string and never knew what carried it. Rotation,
reuse detection, family revocation, expiry and the strict rate-limit tier are
byte-for-byte Feature 032's. `schema.prisma` is untouched. What did change is a
contract — `AuthSessionEntity` has no `refreshToken` field any more, `refresh`
and `logout` take no body at all, and `change-password` reads the session to
spare from the cookie instead of from a field a client can no longer fill.

The one thing it declines to add is a CSRF token, and it argues the case rather
than deferring it: `SameSite=Lax` blocks the cross-site `POST`, two of the three
cookie routes also require a Bearer token no attacker can attach, and forging the
third achieves nothing an attacker can read. It also names the deployment that
invalidates all of that — a frontend on a different site, which needs
`SameSite=None` — and leaves that note where whoever configures it will find it.

## Amendments

A change that extends an existing feature rather than adding one keeps that
feature's number and is appended to that feature's document. It is listed here
so the history still reads in order, and so an amendment is not mistaken for a
feature that was never written.

| Amends | Change | Status | Date |
| --- | --- | --- | ---- |
| 016 | [Work Schedule — company timezone](016-work-schedule-configuration.md) | Completed | 2026-08-07 |
| 021 | [Leave Types — `reportMarker`](021-leave-configuration.md) | Completed | 2026-08-07 |
| 003 | [Prisma — `timestamptz` for instants](003-prisma-orm-setup.md) | Completed | 2026-08-08 |
| 038 | [API Documentation — a per-status error example](038-api-documentation.md) | Completed | 2026-08-13 |
| 038 | [API Documentation — error statuses corrected against their throw sites](038-api-documentation.md) | Completed | 2026-08-13 |
