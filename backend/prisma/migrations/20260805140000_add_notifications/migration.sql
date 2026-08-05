-- Feature 026 — notification centre.
--
-- Purely additive. Five enums and one table are created; no existing column is
-- dropped, narrowed or back-filled, and nothing already recorded changes
-- meaning. Applying it to a populated database costs one empty table.
--
-- What it does NOT create is a `notification_reads` table. `is_read` is one
-- column on the notification row, which is exactly right for a notification
-- addressed to one person and a deliberate limitation for a broadcast: an
-- `all_users` announcement is a single row read by everybody, so the first
-- reader marks it read for all of them. The feature document states the
-- trade-off and the migration path; correcting it later is additive too.

-- ---------------------------------------------------------------------------
-- The vocabularies, all stored lower-case like every other enum in this schema.
--
-- `NotificationPriority` is declared low-to-high, and the order is not
-- cosmetic: PostgreSQL sorts an enum by its declaration order, so
-- `?sortBy=priority&sortOrder=desc` puts `high` first because of this list. It
-- matches `ProjectPriority`, so the two cannot drift into sorting opposite ways.
--
-- There is no new enum for the administrative roles. `recipient_role` reuses
-- `UserRole`, which already spells them `superadmin`, `admin` and `hr`; a
-- second vocabulary saying `super_admin` would mean every query joining a
-- notification to the person reading it had to translate between the two,
-- forever. The type therefore also admits `user`, which is not a legal value
-- here — `NotificationService` refuses it.
-- ---------------------------------------------------------------------------
CREATE TYPE "NotificationWorkspace" AS ENUM ('personal', 'administrative');

CREATE TYPE "NotificationRecipientType" AS ENUM ('user', 'role', 'all_users', 'administrative_users');

CREATE TYPE "NotificationCategory" AS ENUM ('general', 'system', 'timesheet', 'leave', 'reminder', 'maintenance');

CREATE TYPE "NotificationType" AS ENUM ('info', 'success', 'warning', 'error');

CREATE TYPE "NotificationPriority" AS ENUM ('low', 'medium', 'high');

-- ---------------------------------------------------------------------------
-- The notifications themselves.
--
-- Addressing lives in three columns and only two shapes ever fill them:
-- `recipient_type = 'user'` sets `recipient_user_id` and leaves
-- `recipient_role` null, `'role'` does the reverse, and the two broadcasts
-- leave both null. Only four of the eight workspace/recipient pairings are
-- legal.
--
-- Neither rule is a CHECK constraint. They are one rule — which pairing is
-- legal decides which column must be set — so stating half of it here would
-- leave the readable half in the application anyway, and a CHECK would have to
-- be dropped and rewritten the day a fifth recipient type exists. The service
-- enforces both and reports which pairing was wrong.
--
-- `title` and `message` are TEXT with the bounds applied by the API (150 and
-- 5000). That is the call every other free-text column here makes: a bound is a
-- rule about what fits on a screen, unlike `VARCHAR(7)` for a colour, where the
-- width IS the format.
--
-- `is_read` and `read_at` are two columns rather than one, for the reason
-- `leave_requests` keeps `processed_at` beside `status`: `updated_at` moves
-- whenever any column does, so it cannot say when the notification was read.
-- ---------------------------------------------------------------------------
CREATE TABLE "notifications" (
    "id" TEXT NOT NULL,
    "workspace" "NotificationWorkspace" NOT NULL,
    "recipient_type" "NotificationRecipientType" NOT NULL,
    "recipient_user_id" TEXT,
    "recipient_role" "UserRole",
    "title" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "category" "NotificationCategory" NOT NULL DEFAULT 'general',
    "type" "NotificationType" NOT NULL DEFAULT 'info',
    "priority" "NotificationPriority" NOT NULL DEFAULT 'medium',
    "is_read" BOOLEAN NOT NULL DEFAULT false,
    "read_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

-- ---------------------------------------------------------------------------
-- Indexes.
--
-- The configuration tables of Features 016–021 were deliberately left
-- unindexed: they hold tens of rows and PostgreSQL scans them faster than it
-- would descend an index. This one is the opposite case — it gains a row for
-- every event the delivery engine will ever announce, to every person it
-- announces to, and never shrinks.
--
-- Both list queries have the same shape:
--
--   WHERE workspace = … AND (addressed to me OR broadcast)
--   ORDER BY created_at DESC
--
-- so each index carries `created_at` last. PostgreSQL can then satisfy the
-- filter and the ordering from one scan rather than sorting the matches
-- afterwards, which is what keeps the first page cheap once the table is large.
--
--   * `(recipient_user_id, created_at)` — the personal list's directly
--     addressed half.
--   * `(recipient_role, created_at)` — the administrative list's.
--   * `(workspace, recipient_type, created_at)` — both broadcasts, and the
--     workspace scope every query starts from.
-- ---------------------------------------------------------------------------
CREATE INDEX "notifications_recipient_user_id_created_at_idx" ON "notifications"("recipient_user_id", "created_at");

CREATE INDEX "notifications_recipient_role_created_at_idx" ON "notifications"("recipient_role", "created_at");

CREATE INDEX "notifications_workspace_recipient_type_created_at_idx" ON "notifications"("workspace", "recipient_type", "created_at");

-- ---------------------------------------------------------------------------
-- Foreign key.
--
-- ON DELETE CASCADE, and the second cascade in this schema after
-- `leave_request_replacements`. The argument is the same: a notification
-- addressed to one person says nothing once that account is gone — nobody can
-- read it and no list will ever return it — so RESTRICT would only make an
-- account undeletable for the sake of messages nobody can see. Every reference
-- to a person elsewhere is RESTRICT, because those record something that
-- happened; this records something somebody was told.
--
-- `recipient_role` has no foreign key because it names a role rather than a
-- row: the enum is the whole set of legal values, and PostgreSQL already
-- rejects anything outside it.
-- ---------------------------------------------------------------------------
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_recipient_user_id_fkey" FOREIGN KEY ("recipient_user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
