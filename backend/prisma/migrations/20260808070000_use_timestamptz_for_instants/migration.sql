-- Feature 031 amendment — instants become `timestamptz`, calendar dates do not.
--
-- WHAT THIS CHANGES: nothing about the data. Every value in these columns is
-- already UTC, and `timestamptz` stores UTC internally, so each row keeps the
-- exact instant it held. What changes is that PostgreSQL now *knows* the column
-- is an instant, renders it in whatever zone is asked for, and no longer depends
-- on a session setting to write one correctly.
--
-- WHY IT IS NEEDED: `DEFAULT CURRENT_TIMESTAMP` written into a plain `timestamp`
-- column is cast using the SESSION time zone. That produces UTC today only
-- because the session happens to be UTC. The day somebody sets the container's
-- or the connection's zone to Europe/Bucharest, new `created_at` values would
-- silently be written as local time beside older rows in UTC — mixed, with
-- nothing distinguishing them, and unrecoverable. This removes the question.
--
-- WHAT IS DELIBERATELY LEFT ALONE — nine columns:
--
--   employees.hire_date, employees.termination_date,
--   projects.start_date, projects.end_date,
--   public_holidays.start_date, public_holidays.end_date,
--   leave_requests.start_date, leave_requests.end_date,
--   timesheet_entries.date
--
-- Those hold a CALENDAR DATE at UTC midnight, not an instant: a client posted
-- `2026-09-07` and the time of day is padding. Converting them would be actively
-- wrong — read in a zone behind Greenwich, `2026-09-07T00:00Z` is the 6th, so
-- every leave day, public holiday and logged day would move one day earlier at
-- once. See the convention block at the top of `schema.prisma`.
--
-- `SET LOCAL timezone = 'UTC'` is the one thing added to the generated SQL, and
-- it is what makes this migration safe to run from any machine. Without an
-- explicit zone, `SET DATA TYPE TIMESTAMPTZ` interprets each existing value as
-- being in the session's zone — so running it from a connection set to
-- Europe/Bucharest would shift all 53 columns three hours into the past. It is
-- `SET LOCAL`, so it lasts only for this migration's transaction.

SET LOCAL timezone = 'UTC';

-- AlterTable
ALTER TABLE "departments" ALTER COLUMN "created_at" SET DATA TYPE TIMESTAMPTZ(3),
ALTER COLUMN "updated_at" SET DATA TYPE TIMESTAMPTZ(3);

-- AlterTable
ALTER TABLE "employee_leave_balances" ALTER COLUMN "created_at" SET DATA TYPE TIMESTAMPTZ(3),
ALTER COLUMN "updated_at" SET DATA TYPE TIMESTAMPTZ(3);

-- AlterTable
ALTER TABLE "employees" ALTER COLUMN "created_at" SET DATA TYPE TIMESTAMPTZ(3),
ALTER COLUMN "updated_at" SET DATA TYPE TIMESTAMPTZ(3);

-- AlterTable
ALTER TABLE "leave_notification_emails" ALTER COLUMN "created_at" SET DATA TYPE TIMESTAMPTZ(3),
ALTER COLUMN "updated_at" SET DATA TYPE TIMESTAMPTZ(3);

-- AlterTable
ALTER TABLE "leave_request_replacements" ALTER COLUMN "created_at" SET DATA TYPE TIMESTAMPTZ(3);

-- AlterTable
ALTER TABLE "leave_requests" ALTER COLUMN "processed_at" SET DATA TYPE TIMESTAMPTZ(3),
ALTER COLUMN "created_at" SET DATA TYPE TIMESTAMPTZ(3),
ALTER COLUMN "updated_at" SET DATA TYPE TIMESTAMPTZ(3);

-- AlterTable
ALTER TABLE "leave_types" ALTER COLUMN "created_at" SET DATA TYPE TIMESTAMPTZ(3),
ALTER COLUMN "updated_at" SET DATA TYPE TIMESTAMPTZ(3);

-- AlterTable
ALTER TABLE "notification_campaigns" ALTER COLUMN "scheduled_at" SET DATA TYPE TIMESTAMPTZ(3),
ALTER COLUMN "expires_at" SET DATA TYPE TIMESTAMPTZ(3),
ALTER COLUMN "sent_at" SET DATA TYPE TIMESTAMPTZ(3),
ALTER COLUMN "created_at" SET DATA TYPE TIMESTAMPTZ(3),
ALTER COLUMN "updated_at" SET DATA TYPE TIMESTAMPTZ(3);

-- AlterTable
ALTER TABLE "notification_recipients" ALTER COLUMN "created_at" SET DATA TYPE TIMESTAMPTZ(3);

-- AlterTable
ALTER TABLE "notifications" ALTER COLUMN "read_at" SET DATA TYPE TIMESTAMPTZ(3),
ALTER COLUMN "created_at" SET DATA TYPE TIMESTAMPTZ(3),
ALTER COLUMN "updated_at" SET DATA TYPE TIMESTAMPTZ(3);

-- AlterTable
ALTER TABLE "permission_audit_logs" ALTER COLUMN "created_at" SET DATA TYPE TIMESTAMPTZ(3);

-- AlterTable
ALTER TABLE "permission_preset_items" ALTER COLUMN "created_at" SET DATA TYPE TIMESTAMPTZ(3);

-- AlterTable
ALTER TABLE "permission_presets" ALTER COLUMN "created_at" SET DATA TYPE TIMESTAMPTZ(3),
ALTER COLUMN "updated_at" SET DATA TYPE TIMESTAMPTZ(3);

-- AlterTable
ALTER TABLE "permissions" ALTER COLUMN "created_at" SET DATA TYPE TIMESTAMPTZ(3),
ALTER COLUMN "updated_at" SET DATA TYPE TIMESTAMPTZ(3);

-- AlterTable
ALTER TABLE "positions" ALTER COLUMN "created_at" SET DATA TYPE TIMESTAMPTZ(3),
ALTER COLUMN "updated_at" SET DATA TYPE TIMESTAMPTZ(3);

-- AlterTable
ALTER TABLE "project_members" ALTER COLUMN "joined_at" SET DATA TYPE TIMESTAMPTZ(3),
ALTER COLUMN "left_at" SET DATA TYPE TIMESTAMPTZ(3);

-- AlterTable
ALTER TABLE "projects" ALTER COLUMN "created_at" SET DATA TYPE TIMESTAMPTZ(3),
ALTER COLUMN "updated_at" SET DATA TYPE TIMESTAMPTZ(3);

-- AlterTable
ALTER TABLE "public_holidays" ALTER COLUMN "created_at" SET DATA TYPE TIMESTAMPTZ(3),
ALTER COLUMN "updated_at" SET DATA TYPE TIMESTAMPTZ(3);

-- AlterTable
ALTER TABLE "reminders" ALTER COLUMN "created_at" SET DATA TYPE TIMESTAMPTZ(3),
ALTER COLUMN "updated_at" SET DATA TYPE TIMESTAMPTZ(3);

-- AlterTable
ALTER TABLE "role_permissions" ALTER COLUMN "created_at" SET DATA TYPE TIMESTAMPTZ(3);

-- AlterTable
ALTER TABLE "timesheet_approval_emails" ALTER COLUMN "created_at" SET DATA TYPE TIMESTAMPTZ(3);

-- AlterTable
ALTER TABLE "timesheet_entries" ALTER COLUMN "created_at" SET DATA TYPE TIMESTAMPTZ(3),
ALTER COLUMN "updated_at" SET DATA TYPE TIMESTAMPTZ(3);

-- AlterTable
ALTER TABLE "timesheets" ALTER COLUMN "submitted_at" SET DATA TYPE TIMESTAMPTZ(3),
ALTER COLUMN "reviewed_at" SET DATA TYPE TIMESTAMPTZ(3),
ALTER COLUMN "created_at" SET DATA TYPE TIMESTAMPTZ(3),
ALTER COLUMN "updated_at" SET DATA TYPE TIMESTAMPTZ(3);

-- AlterTable
ALTER TABLE "user_permission_overrides" ALTER COLUMN "created_at" SET DATA TYPE TIMESTAMPTZ(3),
ALTER COLUMN "updated_at" SET DATA TYPE TIMESTAMPTZ(3);

-- AlterTable
ALTER TABLE "users" ALTER COLUMN "created_at" SET DATA TYPE TIMESTAMPTZ(3),
ALTER COLUMN "updated_at" SET DATA TYPE TIMESTAMPTZ(3);

-- AlterTable
ALTER TABLE "work_schedules" ALTER COLUMN "created_at" SET DATA TYPE TIMESTAMPTZ(3),
ALTER COLUMN "updated_at" SET DATA TYPE TIMESTAMPTZ(3);

