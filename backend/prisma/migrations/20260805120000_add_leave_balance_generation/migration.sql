-- Feature 024 — leave balance generation.
--
-- Purely additive: three columns, all with defaults, no data rewritten and no
-- column dropped. An existing database keeps every balance it holds, and every
-- row answers the same way it did before this ran (see the `expired_days` note).

-- ---------------------------------------------------------------------------
-- The carry-over policy, on the leave type rather than on the balance.
--
-- It belongs here because it is a property of the KIND of leave, not of one
-- person's year: annual leave carries over and medical leave does not, and that
-- is true of every employee at once. Feature 022 deliberately left this
-- unspecified — "carrying days over is a policy decision with a cap and an
-- expiry that nobody has specified yet" — and this is the feature that specifies
-- it.
--
-- `allows_carry_over` defaults to FALSE, which is the conservative direction:
-- after this migration NO type carries anything over until somebody sets the
-- flag. The opposite default would have silently granted a policy nobody chose
-- to every type already in the table.
--
-- `max_carry_over_days` is nullable rather than defaulted, because "carries
-- over, without a ceiling" is a real policy and `0` states the opposite of it.
-- It is read only when `allows_carry_over` is TRUE; on a type that carries
-- nothing over, a cap would bound something that never happens.
-- ---------------------------------------------------------------------------
ALTER TABLE "leave_types" ADD COLUMN "allows_carry_over" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "leave_types" ADD COLUMN "max_carry_over_days" INTEGER;

-- ---------------------------------------------------------------------------
-- Days written off at a year-end, on the balance they were written off from.
--
-- This column exists because of how consumption already works. Balances are
-- drawn oldest year first, and the availability query reads every year up to the
-- one being requested (`year <= upToYear`), so a remainder sitting in a closed
-- year is ALREADY spendable in the next one — uncapped, and forever. Carrying
-- days forward is therefore the system's natural behaviour rather than something
-- a year-end job has to perform.
--
-- What a carry-over CAP needs is the opposite operation: removing the surplus
-- that policy does not let survive. `expired_days` is that removal, recorded
-- where the days were, so the row still shows what was granted, what was taken
-- and what was lost.
--
-- The alternative — copying the survivors into the next year's
-- `carried_over_days` — was rejected because it double-counts: the old row would
-- still report those days as remaining while the new row claimed them too, and
-- the employee would hold each of them twice.
--
-- It is kept apart from `used_days` because the two are different facts. Days
-- taken and days forfeited look identical once summed, and a year-end job
-- writing `used_days` would appear to have approved absences nobody requested.
--
-- DEFAULT 0 means every existing balance is unaffected: `remaining_days`, which
-- the API computes as `allocated + carried_over - used - expired`, returns
-- exactly what it returned before this migration for every row already stored.
-- ---------------------------------------------------------------------------
ALTER TABLE "employee_leave_balances" ADD COLUMN "expired_days" INTEGER NOT NULL DEFAULT 0;
