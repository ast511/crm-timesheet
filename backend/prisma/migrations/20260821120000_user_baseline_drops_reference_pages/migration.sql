-- The `USER` baseline drops the two standalone reference pages.
--
-- No schema change: not a column, not an index, not a constraint. This migration
-- exists to WITHDRAW four `role_permissions` rows, and it is a migration rather
-- than an edit to a seed for the reason `role-permissions.seed.ts` states in
-- prose — that seed adds and never removes, because taking a permission away
-- changes what people can do and belongs in an act somebody performed on
-- purpose, not in a script that runs whenever anybody types `npm run
-- prisma:seed`.
--
-- ---------------------------------------------------------------------------
-- What changes for whom
--
-- An employee's personal workspace is now exactly the three things that are
-- theirs: the dashboard, their timesheet, their leave requests. The standalone
-- *Proiecte* and *Sărbători legale* screens leave both the sidebar and the
-- routes, in one stroke, because the menu item and the route guard name the same
-- `PAGE_ACCESS` key — so an employee who types the URL is refused rather than
-- shown a page the menu was hiding.
--
-- `PROJECTS.VIEW` and `PUBLIC_HOLIDAYS.VIEW` go with the two `PAGE_ACCESS` keys
-- deliberately. Leaving them behind would have left the `USER` baseline holding
-- permission to read two resources it has no screen for — a grant that grants
-- nothing, and the kind of residue that makes a permission matrix impossible to
-- reason about a year later.
--
-- ---------------------------------------------------------------------------
-- What does NOT change, and why the timesheet is safe
--
-- The employee still picks from EVERY project when filling in a timesheet.
-- `GET /api/v1/projects` carries no `@RequirePermission`, and `PermissionsGuard`
-- admits any authenticated caller to a route that declares no requirement — so
-- the project picker never consulted `PROJECTS.VIEW` and does not begin to now.
--
-- Public holidays still land in the timesheet. They are pre-populated
-- server-side by `TimesheetFillService`, which injects `PublicHolidayService`
-- directly; the caller's permission set is not read on that path and cannot be.
--
-- What the employee loses is the two PAGES. The project selection underneath the
-- timesheet and the holidays applied to it are untouched, and that independence
-- is the whole reason this change is a four-row delete rather than a feature.
--
-- ---------------------------------------------------------------------------
-- HR and administrators keep both screens
--
-- The four keys moved from `OWN_WORK` into `PERSONAL_REFERENCE` in
-- `permission-sets.ts`, and `HR_VIEW_ONLY` spreads both — so `HR` and `ADMIN`
-- hold exactly what they held before, and the six preset cards hand out exactly
-- what they handed out before. The `WHERE "role" = 'USER'` below is therefore
-- load-bearing rather than defensive: without it this would silently make a
-- second, larger decision nobody asked for.
--
-- ---------------------------------------------------------------------------
-- Per-user overrides are left alone, on purpose
--
-- An individual employee who was GRANTED one of these keys through the
-- permissions screen keeps it, and keeps the screen: that grant is an exception
-- somebody made deliberately about one account, which is precisely the thing a
-- baseline change must not quietly overrule. A stale REVOKE of a key the role no
-- longer grants resolves to the same absence either way and is harmless.
--
-- ---------------------------------------------------------------------------
-- `'user'`, lower case
--
-- `UserRole` is declared `USER @map("user")` in `schema.prisma`, so the label
-- stored in the Postgres enum is the mapped one. `'USER'` is the name the
-- TypeScript enum uses and is not a value this type has — Postgres rejects it
-- outright with `22P02` rather than matching nothing, which is the good failure
-- mode: a typo here cannot quietly delete zero rows and report success.

DELETE FROM "role_permissions"
WHERE "role" = 'user'
  AND "permission_id" IN (
    SELECT "id"
    FROM "permissions"
    WHERE "key" IN (
      'PROJECTS.PAGE_ACCESS',
      'PROJECTS.VIEW',
      'PUBLIC_HOLIDAYS.PAGE_ACCESS',
      'PUBLIC_HOLIDAYS.VIEW'
    )
  );
