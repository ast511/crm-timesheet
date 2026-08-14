-- CreateEnum
CREATE TYPE "UiColorScheme" AS ENUM ('default', 'red', 'rose', 'orange', 'green', 'blue', 'yellow', 'violet');

-- CreateEnum
-- Symbolic names, because a PostgreSQL enum label is fine but the Prisma member
-- it maps to is an identifier, and `0.3` is not one. The numbers these stand for
-- are on `UiCornerRadius` in `schema.prisma`: none = 0, small = 0.3,
-- medium = 0.5, large = 0.75, full = 1.0 (rem).
CREATE TYPE "UiCornerRadius" AS ENUM ('none', 'small', 'medium', 'large', 'full');

-- AlterTable
-- Both columns are NOT NULL with a default, so every existing row is back-filled
-- by the ADD COLUMN itself — there is no second UPDATE statement and no moment
-- in which an account has no preference. PostgreSQL stores the default in the
-- catalog rather than rewriting the table, so this is a metadata-only change
-- whatever the row count.
ALTER TABLE "users" ADD COLUMN "color_scheme" "UiColorScheme" NOT NULL DEFAULT 'default';
ALTER TABLE "users" ADD COLUMN "corner_radius" "UiCornerRadius" NOT NULL DEFAULT 'medium';
