-- Rebuild `projects`: drop `is_active`, and put the columns in model order.
--
-- Two changes that one rebuild covers at once, which is why there is no
-- separate `DROP COLUMN` migration — dropping a column the next statement would
-- discard along with the whole table is work nobody needs to replay.
--
-- `is_active` goes because Feature 011's `project_status` already answers what
-- it answered: every seeded row satisfied
-- `is_active = (project_status IN ('active', 'on_hold'))`. Keeping both gave one
-- fact two places to disagree, with nothing preventing the pair
-- `is_active = true, project_status = 'cancelled'` and no rule saying which of
-- the two a reader should believe. `is_archived` stays — visibility and
-- lifecycle are genuinely two different axes.
--
-- The column order is cosmetic. Feature 011 appended five columns to a table the
-- init migration created, and PostgreSQL keeps columns in the order they were
-- added, so `SELECT *` and `\d projects` listed them in migration order rather
-- than the order `schema.prisma` declares them. Prisma always names columns
-- explicitly, so nothing in the application reads a column by position — but the
-- table is inspected by hand often enough during development for the mismatch to
-- be worth one rebuild while the data is still disposable.
--
-- DESTRUCTIVE. Every row in `projects` is dropped, and `project_members` is
-- emptied along with it: the rebuilt projects get fresh cuids, so the existing
-- membership rows would point at ids that no longer exist and the foreign key
-- could not be restored. Re-run `npm run prisma:seed` afterwards to repopulate
-- both from `prisma/seeds/`.

-- 1. Empty the dependent table first. Its rows reference project ids that are
--    about to disappear, and leaving them would make step 6 fail.
DELETE FROM "project_members";

-- 2. Drop the foreign key explicitly rather than relying on `DROP TABLE
--    ... CASCADE`, so exactly one constraint is removed and nothing else is
--    taken down as collateral.
ALTER TABLE "project_members" DROP CONSTRAINT "project_members_projectId_fkey";

-- 3. Drop the table. The `ProjectStatus` and `ProjectPriority` types survive —
--    enum types are independent objects, so step 4 can still reference them.
DROP TABLE "projects";

-- 4. Recreate it, columns in the order the `Project` model declares them.
CREATE TABLE "projects" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "client_name" TEXT NOT NULL,
    "description" TEXT,
    "estimated_hours" INTEGER NOT NULL DEFAULT 0,
    "color" VARCHAR(7),
    "project_status" "ProjectStatus" NOT NULL DEFAULT 'active',
    "project_priority" "ProjectPriority" NOT NULL DEFAULT 'medium',
    "is_archived" BOOLEAN NOT NULL DEFAULT false,
    "start_date" TIMESTAMP(3),
    "end_date" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "projects_pkey" PRIMARY KEY ("id")
);

-- 5. Restore the unique index backing the `code` duplicate check.
CREATE UNIQUE INDEX "projects_code_key" ON "projects"("code");

-- 6. Restore the foreign key, with the same RESTRICT that stops a project from
--    being deleted while memberships reference it.
ALTER TABLE "project_members" ADD CONSTRAINT "project_members_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
