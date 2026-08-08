-- Feature 031 (Reporting) — `LeaveType.reportMarker`.
--
-- The column is NOT NULL and UNIQUE, and `leave_types` may already hold rows,
-- so it cannot be added in one statement: there is no default that could
-- satisfy a unique index across several existing rows. The migration therefore
-- adds the column nullable, derives a marker for every row already there, and
-- only then tightens the column.
--
-- The derivation is stated here rather than in application code because it runs
-- exactly once, against rows that exist at this moment. Afterwards the marker is
-- an ordinary editable field that `LeaveTypesService` validates like `code`.
--
-- The rule: take the alphanumerics of `code`, upper-cased, and use its first
-- character. If that is already taken, widen to two characters, then to three.
-- If all three are taken, suffix a number, keeping the whole marker within the
-- three characters the column allows. Rows are processed in `code` order so the
-- outcome is deterministic rather than dependent on physical row order.

-- AlterTable
ALTER TABLE "leave_types" ADD COLUMN "report_marker" VARCHAR(3);

-- Backfill
DO $$
DECLARE
  leave_type RECORD;
  base       TEXT;
  candidate  TEXT;
  width      INT;
  suffix     INT;
BEGIN
  FOR leave_type IN SELECT "id", "code" FROM "leave_types" ORDER BY "code" LOOP
    base := regexp_replace(upper(leave_type."code"), '[^A-Z0-9]', '', 'g');

    -- A code made entirely of separators cannot happen through the API, whose
    -- pattern requires an alphanumeric at both ends. Handled anyway, because a
    -- migration that divides by zero on one unexpected row blocks the deploy.
    IF base = '' THEN
      base := 'X';
    END IF;

    candidate := NULL;

    FOR width IN 1..3 LOOP
      IF length(base) >= width
         AND NOT EXISTS (
           SELECT 1 FROM "leave_types" WHERE "report_marker" = left(base, width)
         )
      THEN
        candidate := left(base, width);
        EXIT;
      END IF;
    END LOOP;

    IF candidate IS NULL THEN
      FOR suffix IN 1..99 LOOP
        candidate := left(
          left(base, greatest(1, 3 - length(suffix::text))) || suffix::text,
          3
        );

        EXIT WHEN NOT EXISTS (
          SELECT 1 FROM "leave_types" WHERE "report_marker" = candidate
        );

        candidate := NULL;
      END LOOP;
    END IF;

    IF candidate IS NULL THEN
      RAISE EXCEPTION
        'Could not derive a unique report_marker for leave type %', leave_type."code";
    END IF;

    UPDATE "leave_types" SET "report_marker" = candidate WHERE "id" = leave_type."id";
  END LOOP;
END $$;

-- AlterTable
ALTER TABLE "leave_types" ALTER COLUMN "report_marker" SET NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "leave_types_report_marker_key" ON "leave_types"("report_marker");
