-- CreateEnum: the two vocabularies Feature 011 adds.
CREATE TYPE "ProjectStatus" AS ENUM ('active', 'completed', 'on_hold', 'cancelled');

-- CreateEnum
CREATE TYPE "ProjectPriority" AS ENUM ('low', 'medium', 'high');

-- AlterTable: the five columns Feature 011 adds to `projects`.

-- `client_name` is NOT NULL and has no default in the schema, so a plain
-- `ADD COLUMN ... NOT NULL` would fail on the rows the seed already wrote. The
-- column is added with a temporary default to backfill them, then the default
-- is dropped — from here on every insert has to state a client, which is the
-- rule the model expresses.
ALTER TABLE "projects" ADD COLUMN "client_name" TEXT NOT NULL DEFAULT 'Internal';
ALTER TABLE "projects" ALTER COLUMN "client_name" DROP DEFAULT;

-- `estimated_hours` keeps its default, so existing projects read as
-- "not estimated yet" rather than as an estimate somebody made.
ALTER TABLE "projects" ADD COLUMN "estimated_hours" INTEGER NOT NULL DEFAULT 0;

-- `color` is nullable: a project without an accent is the normal case.
ALTER TABLE "projects" ADD COLUMN "color" VARCHAR(7);

-- Both enum columns keep their defaults, which is also what backfills the
-- existing rows: an unclassified project reads as active and normal-priority
-- rather than as an empty cell every consumer has to defend against.
ALTER TABLE "projects" ADD COLUMN "project_status" "ProjectStatus" NOT NULL DEFAULT 'active';
ALTER TABLE "projects" ADD COLUMN "project_priority" "ProjectPriority" NOT NULL DEFAULT 'medium';
