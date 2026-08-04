-- Feature 019 — a public holiday is versioned by the years it applies to.
--
-- Replaces the `is_active` flag with a validity range. The flag carried no
-- date, so switching a holiday off also removed it from every past year's
-- calendar — a year the office really was closed. A range records *when* the
-- holiday stopped applying, which is what lets a calendar for 2026 stay correct
-- after a change made in 2029.

-- Both nullable, both meaning "open ended": no `valid_from_year` is "as far
-- back as this system knows", no `valid_to_year` is "still in force". That is
-- also why the columns need no back-fill — every existing row becomes
-- always-in-force, which is exactly what `is_active = true` meant.
ALTER TABLE "public_holidays" ADD COLUMN "valid_from_year" INTEGER;
ALTER TABLE "public_holidays" ADD COLUMN "valid_to_year" INTEGER;

-- DROPPED, AND THIS DISCARDS DATA. Read before applying to a populated
-- database: a row with `is_active = false` becomes always-in-force, because a
-- boolean cannot say which year the holiday stopped applying — recovering that
-- is precisely what the range exists for and precisely what the flag never
-- recorded.
--
-- Set the range on those rows first, then apply this migration:
--
--   UPDATE "public_holidays" SET "valid_to_year" = <last year it applied>
--   WHERE "is_active" = false;
--
-- In practice there is nothing to migrate: the table was introduced by Feature
-- 017 and this repository is applying both migrations in the same deployment,
-- so the column is dropped before any row has ever used it.
ALTER TABLE "public_holidays" DROP COLUMN "is_active";

-- No index. The calendar reads the whole table and filters on these columns,
-- but the table holds a national calendar plus one row per variable holiday per
-- year — tens of rows, which PostgreSQL sequential-scans faster than it would
-- descend an index. The note stays here so the reasoning is next to the
-- decision if that ever changes.
