-- Feature 016 — the company's working schedule, and the addresses notified when
-- a timesheet needs approval.
--
-- Purely additive: one enum type and two tables, nothing existing is touched, so
-- the migration is safe to apply to a populated database and no data is lost.
--
-- Nothing is back-filled either. `work_schedules` starts empty on purpose — a
-- configuration nobody entered would be a guess about how this company works,
-- and `GET /api/v1/work-schedule` answering 404 is the honest report of "not
-- configured yet". `npm run prisma:seed` writes the documented development
-- default; production states its own through `PUT /api/v1/work-schedule`.

-- Weekday values are stored lower-case, matching every other enum in this
-- schema (`ProjectStatus`, `EmployeeStatus`); the TypeScript vocabulary stays
-- upper-case and Prisma maps between them.
CREATE TYPE "Weekday" AS ENUM ('monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday');

-- Only one row may ever exist here.
--
-- `id` carries a constant default rather than a generated one, and that is what
-- enforces it: an INSERT that does not name an id resolves to 'work_schedule',
-- collides with the row already holding that primary key and is rejected as a
-- duplicate. The application never supplies an id of its own — it upserts on
-- this exact value — so the second configuration cannot be created by accident,
-- only by someone deliberately naming a different key by hand.
--
-- `working_days` is an array of the enum, so PostgreSQL itself rejects a value
-- that is not a day of the week. Duplicates it cannot judge; the DTO does.
--
-- The hour columns are DECIMAL(5,2) rather than DOUBLE PRECISION because these
-- are numbers the Timesheets module will compare and sum, and binary floating
-- point cannot represent 0.1 exactly. Two decimals cover the quarter-hour
-- granularity people book in, and five digits leave room for the 168 hours in a
-- week.
CREATE TABLE "work_schedules" (
    "id" TEXT NOT NULL DEFAULT 'work_schedule',
    "working_days" "Weekday"[],
    "work_start_time" VARCHAR(5) NOT NULL,
    "work_end_time" VARCHAR(5) NOT NULL,
    "min_hours_per_entry" DECIMAL(5,2) NOT NULL,
    "max_hours_per_entry" DECIMAL(5,2) NOT NULL,
    "max_hours_per_day" DECIMAL(5,2) NOT NULL,
    "standard_hours_per_day" DECIMAL(5,2) NOT NULL,
    "standard_hours_per_week" DECIMAL(5,2) NOT NULL,
    "lunch_break_hours" DECIMAL(5,2) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "work_schedules_pkey" PRIMARY KEY ("id")
);

-- One row per approval address, so each is addressable by id and each can be
-- removed on its own. An array column on `work_schedules` would have been
-- smaller and could carry neither of those, nor the unique index below.
CREATE TABLE "timesheet_approval_emails" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "work_schedule_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "timesheet_approval_emails_pkey" PRIMARY KEY ("id")
);

-- Backs the duplicate check in `WorkScheduleService`, which reports the
-- conflict as a 409 before it gets here. This index is what makes the rule hold
-- even when two requests race, and it is why addresses are lower-cased at the
-- edge: PostgreSQL would otherwise see `HR@company.com` and `hr@company.com` as
-- two different rows.
CREATE UNIQUE INDEX "timesheet_approval_emails_email_key" ON "timesheet_approval_emails"("email");

-- ON DELETE RESTRICT, the default everywhere else in this schema: removing the
-- configuration while addresses still hang off it would silently discard who
-- was being notified. The addresses have to go first, one endpoint call each.
ALTER TABLE "timesheet_approval_emails" ADD CONSTRAINT "timesheet_approval_emails_work_schedule_id_fkey" FOREIGN KEY ("work_schedule_id") REFERENCES "work_schedules"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
