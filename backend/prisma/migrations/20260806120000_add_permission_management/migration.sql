-- Feature 029 — permission management.
--
-- Purely additive. Four enums and six tables are created; no existing column is
-- dropped, narrowed or back-filled, and nothing already recorded changes
-- meaning. Applying it to a populated database costs six empty tables — the
-- seed then fills three of them (the catalog, the role baselines and the
-- presets) and leaves the other three for runtime.
--
-- What it does NOT create is any way to enforce anything. There is no guard
-- table, no policy table and no denial log: this migration stores the
-- *configuration* of permissions and the resolution inputs, and Permission
-- Enforcement is a later feature that can only be written once authentication
-- exists. Until it does, any caller may claim any `x-user-id` and `x-user-role`,
-- so a guard built on top of these tables would be checking a forgeable
-- identity. See FEATURES/029-permission-management.md.
--
-- There is also no new role vocabulary. `role_permissions.role` and
-- `permission_presets.target_role` both reuse "UserRole" — the enum
-- `users.role` already stores — because a second spelling of 'admin' would mean
-- every query joining a person to their permissions translating between the two
-- forever. The call Feature 026 made when it typed `recipient_role` as
-- "UserRole".

-- ---------------------------------------------------------------------------
-- The four new vocabularies, stored lower_snake like every other enum here.
--
-- "PermissionResource" and "PermissionAction" are the two halves of a
-- permission's identity: `permissions.key` is RESOURCE.ACTION. They are enums
-- rather than text because a resource somebody typed would produce a key
-- nothing could resolve, and because the catalog is filtered and grouped by
-- both.
--
-- "PermissionEffect" has two values and no third. An override that agrees with
-- the role baseline is not a third kind of override — it is the absence of one,
-- and the API refuses to store it.
--
-- "PermissionAuditAction" is declared with the three per-permission transitions
-- first and the two whole-operation summaries last, which is also the only
-- distinction that matters when reading the table: exactly those two may carry
-- a null `permission_id`.
-- ---------------------------------------------------------------------------
CREATE TYPE "PermissionResource" AS ENUM ('dashboard', 'timesheet', 'employees', 'leave_requests', 'reports', 'projects', 'leaves', 'work_schedule', 'public_holidays', 'departments', 'notification_config', 'permissions');

CREATE TYPE "PermissionAction" AS ENUM ('page_access', 'view', 'create', 'edit', 'delete', 'approve', 'configure');

CREATE TYPE "PermissionEffect" AS ENUM ('grant', 'revoke');

CREATE TYPE "PermissionAuditAction" AS ENUM ('permission_granted', 'permission_revoked', 'override_cleared', 'preset_applied', 'reset_to_role');

-- ---------------------------------------------------------------------------
-- The catalog.
--
-- Seeded vocabulary, not runtime data: there is no POST and no DELETE for this
-- table. A permission row is meaningless unless something in the application
-- checks it, so inventing one through an API would produce a cell on the matrix
-- screen that nothing anywhere reads. New permissions arrive with the feature
-- that enforces them, as a seed entry and a migration.
--
-- Only the meaningful (resource, action) pairs exist. Twelve resources times
-- seven actions would be eighty-four rows and most would be nonsense —
-- 'dashboard'/'delete' names nothing, 'work_schedule'/'create' names a second
-- copy of a table that holds exactly one row. The seed writes fifty-five.
--
-- `label` is stored rather than title-cased from `action` on the way out, so a
-- screen can call 'leaves'/'configure' "Configure leave policies" where a
-- generic "Configure" would leave an administrator guessing which policies.
-- ---------------------------------------------------------------------------
CREATE TABLE "permissions" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "resource" "PermissionResource" NOT NULL,
    "action" "PermissionAction" NOT NULL,
    "label" TEXT NOT NULL,
    "description" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "permissions_pkey" PRIMARY KEY ("id")
);

-- ---------------------------------------------------------------------------
-- The role baseline.
--
-- 'superadmin' is deliberately NOT seeded into this table and must never be.
-- A super-admin holds every permission, which is a statement about what the
-- role is rather than a set somebody configured: the account that can always
-- fix the system, including a permission matrix somebody has locked themselves
-- out of. Stored as rows it would be a set that could be edited, and the first
-- edit would create a super-admin who could no longer administer. It is one
-- branch in PermissionService.resolveEffective and nothing else.
--
-- No `updated_at`: a binding is not editable — a role either grants a
-- permission or does not — so the column would only ever repeat `created_at`.
-- The call `notification_recipients` already makes.
-- ---------------------------------------------------------------------------
CREATE TABLE "role_permissions" (
    "id" TEXT NOT NULL,
    "role" "UserRole" NOT NULL,
    "permission_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "role_permissions_pkey" PRIMARY KEY ("id")
);

-- ---------------------------------------------------------------------------
-- Presets: the quick-apply cards.
--
-- Their own tables rather than more "UserRole" values. A role is who somebody
-- is, stored on their account and read by four other features; a preset is a
-- set of permissions somebody named, applied once and then irrelevant. Spelling
-- "HR - View Only" as a role would make a person's role change every time their
-- permissions were adjusted.
--
-- `target_role` drives grouping on the screen and constrains nothing: a preset
-- may be applied to any account that is not a super-admin, because "give this
-- particular USER what an HR person gets" is a real thing an administrator
-- does. 'superadmin' is not a legal value — that role holds everything already
-- — which is a rule the seed keeps rather than one this column can express.
--
-- Applying a preset stores no link back to it. The user's overrides are
-- recomputed so their effective set equals the preset, and the fact that a
-- preset was the reason is recorded in `permission_audit_logs`; a column
-- claiming "this user is on HR - Standard" would be a label that stopped being
-- true the moment somebody toggled one cell.
-- ---------------------------------------------------------------------------
CREATE TABLE "permission_presets" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "target_role" "UserRole" NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "permission_presets_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "permission_preset_items" (
    "id" TEXT NOT NULL,
    "preset_id" TEXT NOT NULL,
    "permission_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "permission_preset_items_pkey" PRIMARY KEY ("id")
);

-- ---------------------------------------------------------------------------
-- The per-user override — the feature's central storage decision.
--
-- ONLY the deviation is stored, never a copy of the matrix. A user whose
-- permissions are exactly their role's has zero rows here; a user given one
-- extra permission has exactly one. Three things follow:
--
--   * the table stays proportional to the exceptions an organisation actually
--     makes rather than to (users x fifty-five permissions);
--   * "reset this person to their role" is a single DELETE ... WHERE user_id,
--     an operation that cannot half-succeed;
--   * a change to a role baseline reaches everybody it should. With the full
--     matrix copied per user, the day 'hr' gained a permission every existing
--     HR user would keep the frozen copy taken when their account was set up.
--
-- An override that agrees with the baseline is never written. The service
-- normalises every submitted matrix against the role before persisting, so a
-- 'grant' of something the role already gives is dropped rather than stored.
--
-- There are no rows here for a super-admin, and the API refuses to write any.
-- ---------------------------------------------------------------------------
CREATE TABLE "user_permission_overrides" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "permission_id" TEXT NOT NULL,
    "effect" "PermissionEffect" NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "user_permission_overrides_pkey" PRIMARY KEY ("id")
);

-- ---------------------------------------------------------------------------
-- The audit trail.
--
-- Every row here is written in the SAME transaction as the override rows it
-- describes. A history written separately would be a second statement about one
-- event, and the run where the second statement failed would leave a permission
-- granted with nothing recording who granted it — the one question an audit
-- trail exists to answer.
--
-- Each row is a transition rather than a snapshot: `previous_effect` and
-- `new_effect` are the override state before and after, and either may be null
-- because "no override" is a legitimate end of a transition in both directions.
--
-- `permission_id` is nullable, and exactly two of the five actions leave it
-- null: 'preset_applied' and 'reset_to_role' are summaries of a whole
-- operation, written once beside the per-permission rows that make it up. A
-- separate summary table would mean the history tab reading two tables and
-- interleaving them by timestamp to render one list.
--
-- `changed_by_user_id` comes from the @CurrentUser() placeholder — the
-- `x-user-id` header today, a token claim once authentication exists — and is
-- never hardcoded.
-- ---------------------------------------------------------------------------
CREATE TABLE "permission_audit_logs" (
    "id" TEXT NOT NULL,
    "target_user_id" TEXT NOT NULL,
    "changed_by_user_id" TEXT NOT NULL,
    "permission_id" TEXT,
    "action" "PermissionAuditAction" NOT NULL,
    "previous_effect" "PermissionEffect",
    "new_effect" "PermissionEffect",
    "preset_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "permission_audit_logs_pkey" PRIMARY KEY ("id")
);

-- ---------------------------------------------------------------------------
-- Indexes.
--
--   * `permissions(key)` UNIQUE — the addressable name every other layer quotes.
--   * `permissions(resource, action)` — the catalog is filtered by resource, by
--     action or by both, and ordered by the pair. Fifty-five rows, so this
--     states the access pattern rather than rescuing a scan.
--   * `role_permissions(role, permission_id)` UNIQUE — one binding per role per
--     permission; listing it twice is not a stronger grant.
--   * `permission_presets(key)` UNIQUE, `(target_role)` — the list filter.
--   * `permission_preset_items(preset_id, permission_id)` UNIQUE — listing a
--     permission twice in a preset would double the count the cards render.
--   * `user_permission_overrides(user_id, permission_id)` UNIQUE — what makes
--     "the exception" a singular noun: two rows for one cell would be a user
--     simultaneously granted and denied. It leads with `user_id`, so it also
--     serves the read this table exists for — every override of one user, run
--     by every effective resolution — and a separate index on `user_id` alone
--     would duplicate that leading column.
--   * `permission_audit_logs(target_user_id, created_at)` — the history read,
--     WHERE target_user_id = ... ORDER BY created_at DESC. `created_at` comes
--     second so the filter and the sort are one scan.
--   * the remaining single-column indexes back foreign keys the composite ones
--     do not lead with. PostgreSQL does not index a foreign key on its own, and
--     each of these is read backwards: RESTRICT has to find the referencing
--     rows before it can refuse.
-- ---------------------------------------------------------------------------
CREATE UNIQUE INDEX "permissions_key_key" ON "permissions"("key");

CREATE INDEX "permissions_resource_action_idx" ON "permissions"("resource", "action");

CREATE UNIQUE INDEX "role_permissions_role_permission_id_key" ON "role_permissions"("role", "permission_id");

CREATE INDEX "role_permissions_permission_id_idx" ON "role_permissions"("permission_id");

CREATE UNIQUE INDEX "permission_presets_key_key" ON "permission_presets"("key");

CREATE INDEX "permission_presets_target_role_idx" ON "permission_presets"("target_role");

CREATE UNIQUE INDEX "permission_preset_items_preset_id_permission_id_key" ON "permission_preset_items"("preset_id", "permission_id");

CREATE INDEX "permission_preset_items_permission_id_idx" ON "permission_preset_items"("permission_id");

CREATE UNIQUE INDEX "user_permission_overrides_user_id_permission_id_key" ON "user_permission_overrides"("user_id", "permission_id");

CREATE INDEX "user_permission_overrides_permission_id_idx" ON "user_permission_overrides"("permission_id");

CREATE INDEX "permission_audit_logs_target_user_id_created_at_idx" ON "permission_audit_logs"("target_user_id", "created_at");

CREATE INDEX "permission_audit_logs_changed_by_user_id_idx" ON "permission_audit_logs"("changed_by_user_id");

CREATE INDEX "permission_audit_logs_permission_id_idx" ON "permission_audit_logs"("permission_id");

CREATE INDEX "permission_audit_logs_preset_id_idx" ON "permission_audit_logs"("preset_id");

-- ---------------------------------------------------------------------------
-- Foreign keys.
--
-- Every reference to `permissions` is RESTRICT: the catalog outlives its
-- bindings, its presets, the exceptions taken against it and the history that
-- names it. A permission still bound to a role is one the application checks
-- somewhere, and deleting it would leave every user of that role silently
-- missing a grant nobody removed.
--
-- `permission_preset_items.preset_id` is CASCADE — an item is part of its
-- preset rather than a fact of its own — the fourth cascade in this schema
-- after `leave_request_replacements`, `notifications.recipient_user_id` and
-- `notification_recipients.campaign_id`.
--
-- `user_permission_overrides.user_id` is CASCADE. An override says nothing once
-- the account it qualifies is gone: nobody can hold it, no resolution will ever
-- read it, and keeping it would only make an account undeletable for the sake
-- of exceptions to a role nobody has any more.
--
-- The two user references on `permission_audit_logs` are deliberately
-- ASYMMETRIC, and this is the decision worth reading twice:
--
--   * `target_user_id` is CASCADE. The history is only ever read through
--     GET /users/:id/permissions/history, a route scoped to an account: once
--     the account is deleted the rows are unaddressable, the overrides they
--     describe have cascaded away, and keeping them would preserve a history of
--     a state that no longer exists while making the account undeletable. It
--     would also silently change what DELETE /users/:id means — Feature 009
--     refuses that call only when an employee is linked.
--   * `changed_by_user_id` is RESTRICT, the schema's standing rule for every
--     reference to a person that records something somebody *did*
--     (`notification_campaigns.created_by_employee_id`,
--     `leave_request_replacements.employee_id`). Granting somebody a permission
--     is an act, and the act outlives the actor's account: an administrator
--     cannot be deleted out from under the record of what they authorised,
--     which is the difference between an audit trail and a list.
--
-- `preset_id` is RESTRICT for the reason the catalog is: a history line saying
-- "a preset was applied" without being able to say which one has lost the fact
-- it was written to record.
-- ---------------------------------------------------------------------------
ALTER TABLE "role_permissions" ADD CONSTRAINT "role_permissions_permission_id_fkey" FOREIGN KEY ("permission_id") REFERENCES "permissions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "permission_preset_items" ADD CONSTRAINT "permission_preset_items_preset_id_fkey" FOREIGN KEY ("preset_id") REFERENCES "permission_presets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "permission_preset_items" ADD CONSTRAINT "permission_preset_items_permission_id_fkey" FOREIGN KEY ("permission_id") REFERENCES "permissions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "user_permission_overrides" ADD CONSTRAINT "user_permission_overrides_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "user_permission_overrides" ADD CONSTRAINT "user_permission_overrides_permission_id_fkey" FOREIGN KEY ("permission_id") REFERENCES "permissions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "permission_audit_logs" ADD CONSTRAINT "permission_audit_logs_target_user_id_fkey" FOREIGN KEY ("target_user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "permission_audit_logs" ADD CONSTRAINT "permission_audit_logs_changed_by_user_id_fkey" FOREIGN KEY ("changed_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "permission_audit_logs" ADD CONSTRAINT "permission_audit_logs_permission_id_fkey" FOREIGN KEY ("permission_id") REFERENCES "permissions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "permission_audit_logs" ADD CONSTRAINT "permission_audit_logs_preset_id_fkey" FOREIGN KEY ("preset_id") REFERENCES "permission_presets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
