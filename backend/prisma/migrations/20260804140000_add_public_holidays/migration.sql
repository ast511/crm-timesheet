-- Feature 017 — the public holidays calendar.
--
-- Purely additive: one enum type and one table, nothing existing is touched, so
-- the migration is safe to apply to a populated database and no data is lost.
--
-- Nothing is back-filled. The calendar is entered through
-- `POST /api/v1/public-holidays`, because which days a country closes on is a
-- fact about that country and not something this schema should assume.

-- Values are stored lower-case, matching every other enum in this schema
-- (`ProjectStatus`, `EmployeeStatus`, `Weekday`); the TypeScript vocabulary
-- stays upper-case and Prisma maps between them.
CREATE TYPE "HolidayType" AS ENUM ('fixed', 'variable');

-- `start_date` / `end_date` are both NOT NULL and both inclusive: a one-day
-- holiday stores the same date twice rather than leaving the end open, so
-- "which days are closed" has one shape for every row.
--
-- For a 'fixed' row the year inside `start_date` carries no meaning — the
-- recurrence is by month and day — which is why there is no `year` column: it
-- would be a value that is authoritative for half the table and misleading for
-- the other half.
--
-- No unique index. The rule for 'variable' rows is (name, start_date), which
-- *could* be one, but the rule for 'fixed' rows is one holiday per month and
-- day — a function of a column rather than a column — and a partial unique
-- index over EXTRACT(...) would state one of the two rules in the database and
-- leave the other in the service. Both live in `PublicHolidayService` instead,
-- so there is one place to read them.
--
-- No index on `type` or `start_date` either: this table holds a national
-- calendar, on the order of tens of rows, and PostgreSQL will sequential-scan
-- it faster than it would descend an index.
CREATE TABLE "public_holidays" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "type" "HolidayType" NOT NULL,
    "is_national" BOOLEAN NOT NULL DEFAULT true,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "start_date" TIMESTAMP(3) NOT NULL,
    "end_date" TIMESTAMP(3) NOT NULL,
    "is_recurring" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "public_holidays_pkey" PRIMARY KEY ("id")
);
