-- Feature 023 — leave requests.
--
-- Purely additive. One enum and two tables are created; no existing column is
-- dropped, narrowed or back-filled, and nothing already recorded changes
-- meaning. Applying it to a populated database costs two empty tables.
--
-- What it does NOT create is a `requested_working_days` column. That number is
-- computed on every read from the work schedule, the public holidays and the
-- span — see `WorkingDaysService`. Storing it would freeze an answer that
-- depends on three tables the company keeps editing: correcting a holiday
-- entered on the wrong date would leave every request that spanned it holding a
-- day count nothing in the database agrees with, and no reader could tell which
-- of the two was right. It is the same call Feature 022 made for
-- `remaining_days`, applied to a value with three inputs rather than three
-- columns.

-- ---------------------------------------------------------------------------
-- The lifecycle vocabulary.
--
-- Stored lower-case like every other enum in this schema. Four states, and the
-- application allows exactly one kind of transition: PENDING may become any of
-- the other three, and none of those three becomes anything. That is what makes
-- "a decision never moves balances back" a rule the state machine keeps rather
-- than a promise the service has to remember.
-- ---------------------------------------------------------------------------
CREATE TYPE "LeaveRequestStatus" AS ENUM ('pending', 'approved', 'rejected', 'cancelled');

-- ---------------------------------------------------------------------------
-- The requests themselves.
--
-- `start_date` and `end_date` are both inclusive, matching `public_holidays`: a
-- one-day absence stores the same date twice rather than leaving an end null, so
-- "which days is this person away" never has a special case. They are calendar
-- dates held as UTC midnight; every comparison the application makes is in UTC,
-- so the answer cannot depend on where the server runs.
--
-- `reason` is nullable because "no reason given" is a real answer: leave of a
-- type that requires no approval is notified rather than requested.
--
-- `processed_by_id` and `processed_at` are two nullable columns rather than one,
-- because they can be absent for different reasons. A request approved
-- automatically — `leave_types.requires_approval = false` — carries a
-- `processed_at`, since the decision happened at a moment, but no
-- `processed_by_id`, since no person made it. Neither can be derived from what
-- is already here: `updated_at` moves whenever any column does, so it cannot say
-- when the decision was taken, and `status` alone cannot tell an automatic
-- approval from a human one.
--
-- `decision_reason` is nullable in the column and conditionally required by the
-- API — mandatory for REJECTED and CANCELLED, refused for APPROVED. The
-- condition is not a CHECK constraint because it is a rule about a transition
-- rather than about a row: an APPROVED request may perfectly well carry the
-- reason a later feature attaches to it, and the constraint would have to be
-- dropped the day that happens.
-- ---------------------------------------------------------------------------
CREATE TABLE "leave_requests" (
    "id" TEXT NOT NULL,
    "employee_id" TEXT NOT NULL,
    "leave_type_id" TEXT NOT NULL,
    "start_date" TIMESTAMP(3) NOT NULL,
    "end_date" TIMESTAMP(3) NOT NULL,
    "reason" TEXT,
    "status" "LeaveRequestStatus" NOT NULL DEFAULT 'pending',
    "processed_by_id" TEXT,
    "processed_at" TIMESTAMP(3),
    "decision_reason" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "leave_requests_pkey" PRIMARY KEY ("id")
);

-- ---------------------------------------------------------------------------
-- Who covers the work while somebody is away.
--
-- A table rather than an array column on `leave_requests`, and the reason is
-- stronger than it was for `timesheet_approval_emails`: each entry is a FOREIGN
-- KEY. An array of ids would be a relation PostgreSQL could not enforce, so a
-- replacement could name an employee who had since been deleted and nothing
-- would notice.
--
-- The primary key is the pair, which states the rule directly: a person may
-- cover a request once. Listing somebody twice is not a stronger nomination, and
-- without the constraint it would silently double every count taken over this
-- table.
--
-- There is no `id` and no `updated_at`. Nothing about a nomination is editable —
-- changing who covers a request is deleting one row and inserting another, which
-- is what PATCH on a PENDING request does — so the pair is the whole identity.
-- ---------------------------------------------------------------------------
CREATE TABLE "leave_request_replacements" (
    "leave_request_id" TEXT NOT NULL,
    "employee_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "leave_request_replacements_pkey" PRIMARY KEY ("leave_request_id", "employee_id")
);

-- ---------------------------------------------------------------------------
-- Indexes.
--
-- The configuration tables of Features 016–021 were deliberately left unindexed:
-- they hold tens of rows and PostgreSQL scans them faster than it would descend
-- an index. These two are the opposite case — they gain rows for every absence
-- every employee takes, forever, and never shrink.
--
-- `(employee_id, status)` serves the two hottest reads at once: listing one
-- person's requests, and the overlap check that asks whether this person already
-- has an APPROVED request touching a span. The composite leads with the
-- selective column.
--
-- `start_date` backs the HR list, which defaults to the current year and orders
-- by date — both range scans over this column.
--
-- On the replacements table, the primary key already indexes
-- `(leave_request_id, …)`, so only the other direction needs one: "which
-- requests is this person covering", asked on every write that validates a
-- replacement's availability.
-- ---------------------------------------------------------------------------
CREATE INDEX "leave_requests_employee_id_status_idx" ON "leave_requests"("employee_id", "status");

CREATE INDEX "leave_requests_leave_type_id_idx" ON "leave_requests"("leave_type_id");

CREATE INDEX "leave_requests_start_date_idx" ON "leave_requests"("start_date");

CREATE INDEX "leave_request_replacements_employee_id_idx" ON "leave_request_replacements"("employee_id");

-- ---------------------------------------------------------------------------
-- Foreign keys.
--
-- ON DELETE RESTRICT on four of the five, matching every other foreign key in
-- this schema: a request is a statement about a person and a kind of leave, and
-- deleting either out from under it would leave an absence belonging to nobody.
-- The employees and leave-types modules already refuse to delete a row something
-- points at, and these constraints make that refusal a guarantee rather than a
-- check the application happens to run.
--
-- Two are deliberately different:
--
--   * `processed_by_id` is SET NULL. The fact that a decision was made survives
--     the person who made it leaving the company, and `processed_at` keeps
--     saying when it happened. RESTRICT here would make an HR manager
--     undeletable for as long as any request they ever touched exists.
--   * `leave_request_id` is CASCADE — the only cascade in this schema. A
--     nomination is part of the request rather than a fact of its own: it says
--     nothing once the request it belongs to is gone, so deleting a PENDING
--     request takes its replacements with it.
-- ---------------------------------------------------------------------------
ALTER TABLE "leave_requests" ADD CONSTRAINT "leave_requests_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "leave_requests" ADD CONSTRAINT "leave_requests_leave_type_id_fkey" FOREIGN KEY ("leave_type_id") REFERENCES "leave_types"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "leave_requests" ADD CONSTRAINT "leave_requests_processed_by_id_fkey" FOREIGN KEY ("processed_by_id") REFERENCES "employees"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "leave_request_replacements" ADD CONSTRAINT "leave_request_replacements_leave_request_id_fkey" FOREIGN KEY ("leave_request_id") REFERENCES "leave_requests"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "leave_request_replacements" ADD CONSTRAINT "leave_request_replacements_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
