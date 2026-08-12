import { ALL_PERMISSION_KEYS, type PermissionKey } from './permissions.seed';

/**
 * The named permission sets this product ships with — the role baselines and the
 * six quick-apply presets, defined once.
 *
 * **Shared rather than declared per seed, and that sharing is load-bearing.**
 * `HR - Standard` is not merely *similar* to what an HR account gets by default:
 * it is the same set, because the card is what a fresh HR user already holds and
 * applying it to one must therefore leave them with no exceptions at all. Two
 * copies of that list would be two lists, and the day somebody edited one the
 * preset would quietly start creating overrides on accounts that already had the
 * permissions.
 *
 * ```text
 *   USER baseline    = OWN_WORK                                       16
 *   HR - View Only   = OWN_WORK + read of the HR resources            24
 *   HR - Standard    = HR - View Only + the day-to-day HR work        33   ← HR baseline
 *   HR - Full Access = HR - Standard + deletes and leave policy       39
 *   Admin - Limited  = HR - Standard + approvals and admin reads      40
 *   Admin - Standard = Admin - Limited + the admin writes             46   ← ADMIN baseline
 *   Admin - Full     = the whole catalog                              55
 * ```
 *
 * The sets **nest**, deliberately: each is a superset of the one above it in its
 * column, so moving somebody up a tier only ever adds. That is what makes the
 * cards comprehensible on a screen — "Limited" genuinely is less than "Standard"
 * — and it is a property worth keeping when a permission is added: put it in the
 * narrowest tier that should have it, and the wider ones inherit it.
 *
 * `SUPERADMIN` appears nowhere here. It holds every permission by resolution
 * rather than by configuration, so it has no baseline to seed and no preset to
 * apply — see `PermissionService.resolveEffective`.
 *
 * ## Amended by Feature 035: `REPORTS` moved out of the HR column
 *
 * `REPORTS.PAGE_ACCESS` and `REPORTS.VIEW` were in {@link HR_VIEW_ONLY}, which
 * put them in the HR baseline and — because the sets nest — in every admin tier
 * above it. Feature 035 made `REPORTS.VIEW` the *enforced* control on
 * `/api/v1/reports`, replacing the role check that module used to run, and that
 * turned an untested assumption into a decision somebody had to make: a report
 * is a company-wide document, the attendance sheet lists everybody's absences
 * and the hour matrices state what each colleague earned their month on. The two
 * keys therefore moved down to {@link ADMIN_LIMITED}. **The admin tiers are
 * unchanged at 40, 46 and 55** — they inherit the keys from a step lower now
 * instead of two — and the three HR cards each lose exactly two, which is the
 * whole of the change.
 *
 * It is reversible without touching this file, and that is the point of gating
 * on a permission rather than on a role: an administrator who decides one HR
 * lead does need the reports grants `REPORTS.PAGE_ACCESS` and `REPORTS.VIEW` to
 * that account through the permissions screen, and the audit trail records who
 * did it. Moving them back here would be the different, larger decision that
 * every HR account should have them.
 *
 * **On an existing database this seed will not withdraw them.** Seeds here add
 * and never remove — see `role-permissions.seed.ts`, which says so and explains
 * why — so an HR baseline that already holds the two rows keeps them until
 * either `prisma migrate reset` rebuilds it or somebody revokes them
 * deliberately. That is the correct behaviour rather than an oversight:
 * withdrawing a permission changes what people can do and belongs in an act
 * somebody performed on purpose, not in a script that runs whenever anybody
 * types `npm run prisma:seed`.
 */

/**
 * What everybody who works here can do with their own record — the `USER`
 * baseline, and the floor every other set is built on.
 *
 * "Their own" is the operative word and is **not** expressed in these
 * permissions: `TIMESHEET.EDIT` says somebody may edit a timesheet, not whose.
 * Scoping a permission to the holder's own records is a rule about *rows* rather
 * than about capabilities, and a matrix of (resource × action) cannot state it —
 * a `TIMESHEET.EDIT_OWN` beside `TIMESHEET.EDIT` would double the catalog to
 * express one idea. The modules already scope their own endpoints (`/me/...`),
 * and Permission Enforcement will combine the two: this set says *what*, the
 * route says *whose*.
 *
 * `PROJECTS` and `PUBLIC_HOLIDAYS` are read-only here and are in the set at all
 * because an employee filling in a timesheet has to pick a project, and one
 * booking leave has to see which days the office is closed. `WORK_SCHEDULE` is
 * deliberately absent: the hours that constrain an entry are shown by the
 * timesheet screen itself, and a plain user has no schedule page to open.
 */
const OWN_WORK: readonly PermissionKey[] = [
  'DASHBOARD.PAGE_ACCESS',
  'DASHBOARD.VIEW',
  'TIMESHEET.PAGE_ACCESS',
  'TIMESHEET.VIEW',
  'TIMESHEET.CREATE',
  'TIMESHEET.EDIT',
  'TIMESHEET.DELETE',
  'LEAVE_REQUESTS.PAGE_ACCESS',
  'LEAVE_REQUESTS.VIEW',
  'LEAVE_REQUESTS.CREATE',
  'LEAVE_REQUESTS.EDIT',
  'LEAVE_REQUESTS.DELETE',
  'PROJECTS.PAGE_ACCESS',
  'PROJECTS.VIEW',
  'PUBLIC_HOLIDAYS.PAGE_ACCESS',
  'PUBLIC_HOLIDAYS.VIEW',
];

/** The `USER` role's baseline: an employee, and nothing administrative. */
export const USER_BASELINE = OWN_WORK;

/**
 * `HR - View Only` — somebody who needs to *see* the HR side without touching
 * it.
 *
 * The card an auditor, a new joiner in the HR team, or a manager covering a
 * holiday is put on. It adds `PAGE_ACCESS` and `VIEW` on the four resources HR
 * works in and not one write, which is what makes it safe to hand out.
 *
 * `REPORTS` was a fifth until Feature 035; see the note at the top of this file.
 */
export const HR_VIEW_ONLY: readonly PermissionKey[] = [
  ...OWN_WORK,
  'EMPLOYEES.PAGE_ACCESS',
  'EMPLOYEES.VIEW',
  'LEAVES.PAGE_ACCESS',
  'LEAVES.VIEW',
  'DEPARTMENTS.PAGE_ACCESS',
  'DEPARTMENTS.VIEW',
  'WORK_SCHEDULE.PAGE_ACCESS',
  'WORK_SCHEDULE.VIEW',
];

/**
 * `HR - Standard` — **and the `HR` role's baseline**. The two are the same list
 * on purpose; see the note at the top of this file.
 *
 * The day-to-day work: adding and correcting people, approving leave, and
 * maintaining leave types, the holiday calendar and the departments people
 * belong to. It holds no `DELETE` at all, which is the line this tier draws — an
 * HR administrator corrects records, and removing an employee, a leave type, a
 * holiday or a department is an act with consequences elsewhere in the system
 * that "Full Access" exists to authorise deliberately.
 *
 * `LEAVE_REQUESTS.APPROVE` is here and `TIMESHEET.APPROVE` is not, and the
 * asymmetry is the point: approving leave is HR's job, while signing off a
 * timesheet belongs to whoever manages the work.
 */
export const HR_STANDARD: readonly PermissionKey[] = [
  ...HR_VIEW_ONLY,
  'EMPLOYEES.CREATE',
  'EMPLOYEES.EDIT',
  'LEAVE_REQUESTS.APPROVE',
  'LEAVES.CREATE',
  'LEAVES.EDIT',
  'PUBLIC_HOLIDAYS.CREATE',
  'PUBLIC_HOLIDAYS.EDIT',
  'DEPARTMENTS.CREATE',
  'DEPARTMENTS.EDIT',
];

/**
 * `HR - Full Access` — everything in the HR half of the application.
 *
 * The deletes, the leave policy, and timesheet approval. It stops at the
 * administration half: no `PROJECTS` writes, no `WORK_SCHEDULE` writes, no
 * notification configuration and no permission management. An HR lead who also
 * administers the system is given an `Admin` preset instead — the two are
 * different jobs, and a card that quietly conflated them would be the reason
 * nobody could say what "HR access" meant.
 */
export const HR_FULL_ACCESS: readonly PermissionKey[] = [
  ...HR_STANDARD,
  'TIMESHEET.APPROVE',
  'EMPLOYEES.DELETE',
  'LEAVES.DELETE',
  'LEAVES.CONFIGURE',
  'PUBLIC_HOLIDAYS.DELETE',
  'DEPARTMENTS.DELETE',
];

/**
 * `Admin - Limited` — an administrator who watches rather than configures.
 *
 * Everything `HR - Standard` grants, plus both approvals, the company-wide
 * reports, and read access to the two administration screens. It is the card for
 * somebody being brought into the role: they can see the whole system, sign
 * things off, and change nothing that governs how it behaves.
 *
 * **This is the tier the reports enter the ladder at**, as of Feature 035, and
 * it is therefore the lowest set that satisfies the `REPORTS.VIEW` gate on
 * `/api/v1/reports`. It was `HR - View Only` before; see the note at the top of
 * this file for why it moved and how a single HR account can still be given it.
 */
export const ADMIN_LIMITED: readonly PermissionKey[] = [
  ...HR_STANDARD,
  'TIMESHEET.APPROVE',
  'REPORTS.PAGE_ACCESS',
  'REPORTS.VIEW',
  'NOTIFICATION_CONFIG.PAGE_ACCESS',
  'NOTIFICATION_CONFIG.VIEW',
  'PERMISSIONS.PAGE_ACCESS',
  'PERMISSIONS.VIEW',
];

/**
 * `Admin - Standard` — **and the `ADMIN` role's baseline**, the same list for
 * the same reason `HR - Standard` is HR's.
 *
 * `Admin - Limited` plus the writes an administrator actually performs: projects,
 * the working schedule, notification configuration, and the leave policy.
 *
 * What it withholds is statable in one sentence, which is why the tier is worth
 * having: **no deletes on the directory and configuration resources, no
 * `WORK_SCHEDULE.CONFIGURE`, and no writing of permissions.** Nine of the
 * fifty-five cells, and each is an act whose consequences outlive the click —
 * removing an employee other tables point at, rerouting the approval mail, or
 * changing what somebody else may do. `Admin - Full Access` is how those are
 * granted, deliberately and one account at a time.
 */
export const ADMIN_STANDARD: readonly PermissionKey[] = [
  ...ADMIN_LIMITED,
  'PROJECTS.CREATE',
  'PROJECTS.EDIT',
  'LEAVES.CONFIGURE',
  'WORK_SCHEDULE.EDIT',
  'NOTIFICATION_CONFIG.CREATE',
  'NOTIFICATION_CONFIG.EDIT',
];

/**
 * `Admin - Full Access` — the entire catalog.
 *
 * Derived from the catalog rather than listed, so it stays complete the day a
 * permission is added. It is as much as a *configured* account can hold: it is
 * the same effective set a super-admin has, reached by fifty-five stored rows
 * instead of by a branch — and unlike a super-admin, an account on this preset
 * can be brought back down.
 */
export const ADMIN_FULL_ACCESS: readonly PermissionKey[] = ALL_PERMISSION_KEYS;
