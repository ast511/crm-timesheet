-- Feature 022 — employee leave balances.
--
-- NOT purely additive. This migration DROPS `employees.max_vacation_days` AND
-- ITS DATA. Read the next block before applying it to a database whose numbers
-- somebody typed.

-- ---------------------------------------------------------------------------
-- DESTRUCTIVE: `employees.max_vacation_days` is dropped.
--
-- The column held one integer per employee — a vacation entitlement with no
-- year on it and no leave type attached. It is replaced by
-- `employee_leave_balances`, which carries both. There is no automatic
-- back-fill, and that is a decision rather than an omission:
--
--   * The old number does not say WHICH leave type it was. `21` was implicitly
--     annual leave, but nothing recorded that, and this migration would have to
--     guess a `leave_type_id` — picking one by code or by "the first row" would
--     write a fact nobody stated.
--   * It does not say WHICH YEAR it applied to. Copying it into 2026 would claim
--     HR granted those days for 2026, when what the column actually meant was
--     "this person's entitlement, in general".
--   * Feature 022 requires that leave is allocated by hand. A back-fill would be
--     the application assigning balances on its own, which is the one thing the
--     feature says it must not do.
--
-- TO KEEP THE OLD NUMBERS, snapshot them BEFORE applying this migration:
--
--   SELECT employee_code, first_name, last_name, max_vacation_days
--   FROM employees ORDER BY employee_code;
--
-- then re-enter them through POST /api/v1/employee-leave-balances once the
-- leave types exist, choosing the type and the year deliberately. In this
-- repository the seed sets the column (18–25 per person) and reseeding after
-- this migration simply stops setting it — no employee record is otherwise
-- affected.
-- ---------------------------------------------------------------------------
ALTER TABLE "employees" DROP COLUMN "max_vacation_days";

-- The grants themselves: one row per employee, per leave type, per year.
--
-- `allocated_days` is NOT NULL with no default, unlike the other two: a balance
-- exists because somebody decided a number, so the number has to be stated.
-- `carried_over_days` and `used_days` default to 0, which is the right answer
-- for a first year and for a balance nobody has drawn on yet.
--
-- There is no `remaining_days` column, and its absence is the point. It equals
-- `allocated_days + carried_over_days - used_days`, and the API computes it on
-- every read. A stored copy would be a second home for a fact the three columns
-- already hold — and the first UPDATE that touched one without the other would
-- leave the row disagreeing with itself. A generated column would be safe from
-- that, but it would also make the arithmetic a schema change instead of a line
-- of TypeScript, which is the wrong place for a rule the business may revise.
--
-- `notes` is nullable free text; nothing reads it.
CREATE TABLE "employee_leave_balances" (
    "id" TEXT NOT NULL,
    "employee_id" TEXT NOT NULL,
    "leave_type_id" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "allocated_days" INTEGER NOT NULL,
    "carried_over_days" INTEGER NOT NULL DEFAULT 0,
    "used_days" INTEGER NOT NULL DEFAULT 0,
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "employee_leave_balances_pkey" PRIMARY KEY ("id")
);

-- The business rule, stated where it cannot be bypassed: Ion Popescu can hold
-- exactly one Annual Leave balance for 2026. The service checks it first so the
-- answer is a 409 naming the employee, the type and the year rather than a
-- driver error — this index is what closes the race between that check and the
-- insert.
CREATE UNIQUE INDEX "employee_leave_balances_employee_id_leave_type_id_year_key" ON "employee_leave_balances"("employee_id", "leave_type_id", "year");

-- Two ordinary indexes, which the configuration tables of Features 016–021
-- deliberately went without. The difference is growth: those hold tens of rows
-- and PostgreSQL scans them faster than it would descend an index, while this
-- table gains a row for every employee × every leave type × every year and never
-- shrinks. `?leaveTypeId=` and `?year=` are exactly the two filters the unique
-- index cannot serve, because it leads with `employee_id`.
CREATE INDEX "employee_leave_balances_leave_type_id_idx" ON "employee_leave_balances"("leave_type_id");

CREATE INDEX "employee_leave_balances_year_idx" ON "employee_leave_balances"("year");

-- ON DELETE RESTRICT on both, matching every other foreign key in this schema.
-- A balance is a statement about a person and a kind of leave; deleting either
-- out from under it would leave a number belonging to nobody. The employees and
-- leave-types modules already refuse to delete a row something points at, and
-- these constraints are what make that refusal a guarantee rather than a check
-- the application happens to run.
ALTER TABLE "employee_leave_balances" ADD CONSTRAINT "employee_leave_balances_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "employee_leave_balances" ADD CONSTRAINT "employee_leave_balances_leave_type_id_fkey" FOREIGN KEY ("leave_type_id") REFERENCES "leave_types"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
