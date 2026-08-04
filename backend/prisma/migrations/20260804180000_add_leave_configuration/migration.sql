-- Feature 021 — the leave system's configuration.
--
-- Purely additive: two tables, no enum, and nothing existing is touched, so
-- the migration is safe to apply to a populated database and no data is lost.
--
-- Nothing is back-filled, and in particular no leave is allocated to anybody.
-- These tables describe what leave *is*; who has how many days of it is a
-- future feature with a table of its own.

-- The kinds of leave the company recognises.
--
-- Two unique indexes rather than one. `code` is the natural key an export or an
-- integration quotes; `label` is what a person reads on a form, and two rows
-- sharing one would be indistinguishable on every screen that lists them. Both
-- are created by the UNIQUE constraints below; PostgreSQL's uniqueness is
-- case-sensitive, so `LeaveTypesService` folds case before the insert and these
-- indexes close the exact-case race behind it.
--
-- `default_allocated_days` is nullable on purpose: "no suggestion" is a real
-- answer for a leave type granted against a certificate rather than out of a
-- pot, and `0` would claim an allocation of zero days instead. It is a
-- suggestion for a form, never an entitlement — no employee row is derived from
-- it, now or by this migration.
--
-- `icon` is TEXT and holds the name of an icon (`umbrella-beach`), not a
-- picture. There is no CHECK and no pattern: icon sets disagree on how they
-- spell their keys, so the vocabulary belongs to the frontend and can change
-- without a migration. The API bounds the length at 50 and requires it to be
-- non-empty.
--
-- `color` is VARCHAR(7) — exactly `#RRGGBB` — the same call `projects.color`
-- makes, so the format is a property of the column and not only of the API.
CREATE TABLE "leave_types" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "icon" TEXT NOT NULL,
    "color" VARCHAR(7),
    "description" TEXT,
    "default_allocated_days" INTEGER,
    "requires_approval" BOOLEAN NOT NULL DEFAULT true,
    "is_paid" BOOLEAN NOT NULL DEFAULT true,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "leave_types_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "leave_types_code_key" ON "leave_types"("code");

CREATE UNIQUE INDEX "leave_types_label_key" ON "leave_types"("label");

-- The addresses notified about leave activity.
--
-- No foreign key, unlike `timesheet_approval_emails` and its schedule: there is
-- no configuration row for this list to belong to — the list *is* the
-- configuration. `updated_at` is here — and is not on
-- `timesheet_approval_emails` — because this collection supports PATCH:
-- correcting a typo in an address is an edit, not a delete followed by an
-- insert.
CREATE TABLE "leave_notification_emails" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "leave_notification_emails_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "leave_notification_emails_email_key" ON "leave_notification_emails"("email");

-- There is deliberately no `leave_policies` table.
--
-- An earlier draft of this feature had one: a singleton row carrying a
-- `carry_over_enabled` flag for the whole company. It was dropped before this
-- migration was ever applied, because leave is granted per employee and per
-- year — HR sets each person's days at the start of the year, against their
-- contract and their seniority — so a single company-wide switch could not
-- decide anything the per-employee grant does not already decide. A flag nobody
-- reads is a flag that eventually contradicts the data.
--
-- Whatever carry-over rules turn out to be needed belong to the Leave Balances
-- feature, next to the balances they would apply to.
