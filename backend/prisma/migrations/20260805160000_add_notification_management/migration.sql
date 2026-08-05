-- Feature 027 — notification management.
--
-- Purely additive. Two enums and three tables are created; no existing column
-- is dropped, narrowed or back-filled, and nothing already recorded changes
-- meaning. Applying it to a populated database costs three empty tables.
--
-- What it does NOT create is any way to send anything. There is no queue table,
-- no job table and no delivery log: this migration stores *configuration* — the
-- reminder rules a company wants and the announcements it has composed — and
-- the Notification Delivery Engine is the feature that acts on them. That
-- separation is why `sent_at` exists here and is written by nothing.
--
-- There are also no new severity or priority enums. `reminders.severity` and
-- `notification_campaigns.severity` reuse "NotificationType", and both
-- priorities reuse "NotificationPriority" — the two vocabularies the
-- notification centre already stores. A second enum spelling the same four
-- values would mean the delivery engine translating between them every time it
-- copied a campaign into a notification, forever.

-- ---------------------------------------------------------------------------
-- The two new vocabularies, stored lower-case like every other enum here.
--
-- "NotificationCampaignStatus" is declared in lifecycle order. Only three of
-- its four values are reachable through the API: 'draft' and 'scheduled' are
-- derived from whether `scheduled_at` is set, 'cancelled' is the one value a
-- client may write, and 'sent' is written by the delivery engine alone.
--
-- "CampaignRecipientType" is deliberately not "NotificationRecipientType".
-- That enum addresses a `users` account or a role; this one addresses an
-- `employees` row. Sharing them would make 'user' mean an account in one table
-- and a person in another.
-- ---------------------------------------------------------------------------
CREATE TYPE "NotificationCampaignStatus" AS ENUM ('draft', 'scheduled', 'sent', 'cancelled');

CREATE TYPE "CampaignRecipientType" AS ENUM ('employee', 'all_employees');

-- ---------------------------------------------------------------------------
-- Reminder rules.
--
-- `days_before_deadline` is an offset rather than a date, and 0 — the deadline
-- itself — is a legal value. The column has no default because a reminder
-- exists precisely because somebody chose an offset.
--
-- Which deadline is not named. The only deadline this application has is the
-- timesheet's, and the Timesheets module does not exist yet; a `deadline_type`
-- column would be a vocabulary of one value invented before the thing it
-- describes.
--
-- `send_email` and `send_notification` default false/true, and the asymmetry is
-- deliberate: an in-app notification is expected, while email leaves the system
-- and lands in an inbox somebody has to clear. "At least one of the two" is an
-- API rule rather than a CHECK constraint, for the reason the notification
-- centre gives for its addressing rules: it is one rule with the recipients'
-- rule, judged over a resolved body, and half of it stated here would leave the
-- readable half in the application anyway.
--
-- `subject` and `message` are TEXT with the bounds applied by the API (200 and
-- 5000), the call every other free-text column in this schema makes.
-- ---------------------------------------------------------------------------
CREATE TABLE "reminders" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "days_before_deadline" INTEGER NOT NULL,
    "subject" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "severity" "NotificationType" NOT NULL DEFAULT 'info',
    "priority" "NotificationPriority" NOT NULL DEFAULT 'medium',
    "send_email" BOOLEAN NOT NULL DEFAULT false,
    "send_notification" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "reminders_pkey" PRIMARY KEY ("id")
);

-- Reminder names are unique. The service folds case first, since `Timesheet
-- due` and `timesheet due` are the same rule to a person while this index sees
-- two rows; the index is what closes the exact-case race between that check and
-- the insert.
CREATE UNIQUE INDEX "reminders_name_key" ON "reminders"("name");

-- ---------------------------------------------------------------------------
-- Manual campaigns.
--
-- `status` is derived from `scheduled_at` by the API — carrying a schedule
-- means 'scheduled', not carrying one means 'draft' — so the two can never
-- contradict each other. The column defaults to 'draft', which is what a
-- campaign is the instant it is composed.
--
-- `sent_at` is written by nothing in this feature. It is created now so the
-- delivery engine records the fact without a migration, and it is a separate
-- column from `updated_at` for the reason `leave_requests.processed_at` is:
-- `updated_at` moves whenever any column does, so it cannot say when a campaign
-- was sent.
--
-- No table stores the resolved audience of an 'all_employees' campaign, and
-- none should: the audience is resolved when the campaign is sent, so somebody
-- hired between composing and sending is included.
-- ---------------------------------------------------------------------------
CREATE TABLE "notification_campaigns" (
    "id" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "severity" "NotificationType" NOT NULL DEFAULT 'info',
    "priority" "NotificationPriority" NOT NULL DEFAULT 'medium',
    "send_email" BOOLEAN NOT NULL DEFAULT false,
    "send_notification" BOOLEAN NOT NULL DEFAULT true,
    "status" "NotificationCampaignStatus" NOT NULL DEFAULT 'draft',
    "scheduled_at" TIMESTAMP(3),
    "expires_at" TIMESTAMP(3),
    "sent_at" TIMESTAMP(3),
    "created_by_employee_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "notification_campaigns_pkey" PRIMARY KEY ("id")
);

-- ---------------------------------------------------------------------------
-- Campaign recipients.
--
-- An 'all_employees' campaign stores ONE row with a null `employee_id`, never
-- one row per employee. A company of a thousand people would otherwise pay a
-- thousand inserts to say one thing, and the expansion would freeze the
-- directory as it was on the afternoon somebody typed the message.
--
-- A surrogate `id`, unlike `leave_request_replacements` whose identity is its
-- pair of foreign keys: `employee_id` is nullable here, so the pair cannot be a
-- primary key and the 'all_employees' row would have no identity at all.
-- ---------------------------------------------------------------------------
CREATE TABLE "notification_recipients" (
    "id" TEXT NOT NULL,
    "campaign_id" TEXT NOT NULL,
    "recipient_type" "CampaignRecipientType" NOT NULL,
    "employee_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notification_recipients_pkey" PRIMARY KEY ("id")
);

-- ---------------------------------------------------------------------------
-- Indexes.
--
--   * `(status, scheduled_at)` — the query the delivery engine runs on every
--     tick: WHERE status = 'scheduled' AND scheduled_at <= now(). The selective
--     equality leads, the range follows.
--   * `(created_by_employee_id)` — PostgreSQL does not index a foreign key on
--     its own, and this one is read backwards: deleting an employee has to find
--     the campaigns they wrote before RESTRICT can refuse.
--   * `(campaign_id, employee_id)` UNIQUE — one entry per person per campaign.
--     It does not constrain the 'all_employees' row, since PostgreSQL treats
--     nulls as distinct; "one such row and no others beside it" is a statement
--     about the whole set and is enforced by the service.
--   * `(employee_id)` — the unique index above leads with `campaign_id`, so
--     "which campaigns name this person" cannot use it.
--
-- `reminders` gets nothing beyond its unique name: it holds a handful of rows,
-- like the configuration tables of Features 016–021, and PostgreSQL scans that
-- faster than it would descend an index.
-- ---------------------------------------------------------------------------
CREATE INDEX "notification_campaigns_status_scheduled_at_idx" ON "notification_campaigns"("status", "scheduled_at");

CREATE INDEX "notification_campaigns_created_by_employee_id_idx" ON "notification_campaigns"("created_by_employee_id");

CREATE UNIQUE INDEX "notification_recipients_campaign_id_employee_id_key" ON "notification_recipients"("campaign_id", "employee_id");

CREATE INDEX "notification_recipients_employee_id_idx" ON "notification_recipients"("employee_id");

-- ---------------------------------------------------------------------------
-- Foreign keys.
--
-- `created_by_employee_id` is RESTRICT, like every other reference to a person
-- that records something somebody *did*: a campaign is an act, and the act
-- outlives the author's employment record. (`notifications.recipient_user_id`
-- cascades because it records something somebody was *told*, which says nothing
-- once they are gone.)
--
-- `campaign_id` is CASCADE, the third in this schema after
-- `leave_request_replacements` and `notifications.recipient_user_id`: a
-- recipient is part of a campaign rather than a fact of its own.
--
-- `employee_id` on a recipient is RESTRICT: somebody named in an announcement
-- cannot be deleted out from under it.
-- ---------------------------------------------------------------------------
ALTER TABLE "notification_campaigns" ADD CONSTRAINT "notification_campaigns_created_by_employee_id_fkey" FOREIGN KEY ("created_by_employee_id") REFERENCES "employees"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "notification_recipients" ADD CONSTRAINT "notification_recipients_campaign_id_fkey" FOREIGN KEY ("campaign_id") REFERENCES "notification_campaigns"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "notification_recipients" ADD CONSTRAINT "notification_recipients_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
