# Features

This directory is the change log of the project. Every feature gets its own
document, numbered incrementally and never overwritten.

## Files

| File | Purpose |
| --- | --- |
| `HISTORY.md` | Index of every feature, in implementation order. |
| `TEMPLATE.md` | Skeleton to copy when documenting a new feature. |
| `NNN-feature-name.md` | One document per feature. |

## Workflow

Before implementing a feature:

1. Read `HISTORY.md`.
2. Read `TEMPLATE.md`.
3. Review related feature documents if necessary.

After implementing a feature:

1. Create `NNN-feature-name.md` from `TEMPLATE.md`, using the next available number.
2. Document all backend, frontend, database and API changes.
3. Append a row to `HISTORY.md`.
4. Update any other documentation the change affects.

Never overwrite a previous feature document. If a later feature changes earlier
behaviour, record that in the new document and link back to the old one.

## Features

| ID | Feature |
| --- | --- |
| 001 | [Backend Initialization](001-backend-initialization.md) |
| 002 | [Docker & PostgreSQL Setup](002-docker-postgresql-setup.md) |
| 003 | [Prisma ORM Setup](003-prisma-orm-setup.md) |
| 004 | [API Foundation & Global Application Configuration](004-api-foundation-global-configuration.md) |
| 005 | [Database Seeding](005-database-seeding.md) |
| 006 | [Shared Backend Infrastructure](006-shared-backend-infrastructure.md) |
| 007 | [Departments Module](007-departments-module.md) |
| 008 | [Positions Module](008-positions-module.md) |
| 009 | [Users Module](009-users-module.md) |
| 010 | [Employees Module](010-employees-module.md) |
| 011 | [Projects Module](011-projects-module.md) |
| 012 | [Project Status Consolidation](012-project-status-consolidation.md) |
| 013 | [Project Members Module](013-project-members-module.md) |
| 014 | [Project Roster Endpoint](014-project-roster-endpoint.md) |
| 015 | [Scoped Membership Endpoints](015-scoped-membership-endpoints.md) |
| 016 | [Work Schedule Configuration](016-work-schedule-configuration.md) |
| 017 | [Public Holidays Module](017-public-holidays-module.md) |
| 018 | [Public Holiday Calendar Endpoints](018-public-holiday-calendar-endpoints.md) |
| 019 | [Public Holiday Validity Years](019-public-holiday-validity-years.md) |
| 020 | [Termination Closes Project Memberships](020-termination-closes-memberships.md) |
| 021 | [Leave Configuration](021-leave-configuration.md) |
| 022 | [Employee Leave Balances](022-employee-leave-balances.md) |
| 023 | [Leave Requests](023-leave-requests.md) |
| 024 | [Leave Balance Generation](024-leave-balance-generation.md) |
| 025 | [Email Infrastructure](025-email-infrastructure.md) |
| 026 | [Notification Center](026-notification-center.md) |
| 027 | [Notification Management](027-notification-management.md) |
| 028 | [Notification Delivery Engine](028-notification-delivery-engine.md) |
| 029 | [Permission Management](029-permission-management.md) |
| 030 | [Timesheet Management](030-timesheet-management.md) |
| 031 | [Reporting](031-reporting.md) |
| 032 | [Authentication](032-authentication.md) |
| 033 | [Error Code Standardization](033-error-code-standardization.md) |
| 034 | [Rate Limiting](034-rate-limiting.md) |
