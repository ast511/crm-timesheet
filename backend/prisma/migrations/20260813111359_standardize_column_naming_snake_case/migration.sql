-- Standardize physical column names to snake_case (schema maintenance).
--
-- These are RENAMEs, not drop/recreate: the data in every column below is
-- preserved. Prisma Migrate cannot detect a rename, so it diffed these `@map`
-- additions as DROP COLUMN + ADD COLUMN — which would have reset both
-- `isActive` columns to their default and emptied the project roster. The
-- generated body was therefore replaced by hand; this file is deliberately not
-- what `migrate dev` produced.
--
-- No Prisma/TypeScript field name changed; only the physical column names did.

-- AlterTable
ALTER TABLE "departments" RENAME COLUMN "isActive" TO "is_active";

-- AlterTable
ALTER TABLE "positions" RENAME COLUMN "isActive" TO "is_active";

-- AlterTable
ALTER TABLE "project_members" RENAME COLUMN "projectId" TO "project_id";
ALTER TABLE "project_members" RENAME COLUMN "employeeId" TO "employee_id";

-- The composite primary key and both foreign keys follow their columns
-- automatically; only the constraint *names* still quote the old spelling, so
-- they are renamed to match what a fresh `migrate dev` would emit. Without
-- this, `migrate diff` reports drift on the constraint names alone.
-- ("project_members_pkey" names no column and is already correct.)
ALTER TABLE "project_members" RENAME CONSTRAINT "project_members_projectId_fkey" TO "project_members_project_id_fkey";
ALTER TABLE "project_members" RENAME CONSTRAINT "project_members_employeeId_fkey" TO "project_members_employee_id_fkey";
