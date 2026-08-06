import { permissionKey } from '../../src/modules/permission-management/entities/user-permission-matrix.entity';
import {
  PermissionAction,
  PermissionResource,
} from '../../src/generated/prisma/enums';
import type { PermissionModel } from '../../src/generated/prisma/models';

import { type SeedClient, type SeededRecords, upsertAll } from './seed-context';

/**
 * The permission catalog — the vocabulary every other permission table is built
 * from.
 *
 * **Seeded rather than managed through an API, deliberately.** A permission row
 * is meaningless unless something in the application actually checks it, so a
 * `POST /permissions` would produce a cell on the matrix screen that nothing
 * anywhere reads. New permissions arrive with the feature that enforces them, as
 * an entry in the list below and a migration — the same call Feature 003 recorded
 * for how roles and permissions would be added.
 *
 * ## The matrix
 *
 * Twelve resources and seven actions would multiply out to eighty-four rows, and
 * most of them would be nonsense: `DASHBOARD.DELETE` names nothing, and
 * `WORK_SCHEDULE.CREATE` names a second copy of a table that holds exactly one
 * row. **Fifty-five pairs are seeded**, and the matrix screen renders an empty
 * cell wherever a pair does not exist — which is the honest drawing of "this
 * cannot be granted because it cannot be done".
 *
 * ```text
 *                        PAGE  VIEW  CREATE  EDIT  DELETE  APPROVE  CONFIGURE
 *   DASHBOARD              x     x
 *   TIMESHEET              x     x     x      x      x        x
 *   EMPLOYEES              x     x     x      x      x
 *   LEAVE_REQUESTS         x     x     x      x      x        x
 *   REPORTS                x     x
 *   PROJECTS               x     x     x      x      x
 *   LEAVES                 x     x     x      x      x                 x
 *   WORK_SCHEDULE          x     x            x                        x
 *   PUBLIC_HOLIDAYS        x     x     x      x      x
 *   DEPARTMENTS            x     x     x      x      x
 *   NOTIFICATION_CONFIG    x     x     x      x      x
 *   PERMISSIONS            x     x            x                        x
 * ```
 *
 * Three shapes of row are worth explaining:
 *
 * - **`WORK_SCHEDULE` has no `CREATE` and no `DELETE`.** It is one row for the
 *   whole company — see `WorkSchedule` in `schema.prisma` — so there is nothing
 *   to create a second of and nothing to remove.
 * - **`DASHBOARD` and `REPORTS` are read-only.** Both render other tables;
 *   nothing is stored by either, so the only questions are whether somebody may
 *   open the screen and whether they may see the figures on it.
 * - **`PERMISSIONS` has no `CREATE` and no `DELETE`.** This catalog is seeded and
 *   the presets are seeded, so the only writes the permissions screen performs
 *   are to a person's matrix (`EDIT`) and the two bulk operations
 *   (`CONFIGURE`) — which is exactly the API Feature 029 ships.
 *
 * `DEPARTMENTS` is the organisational units of Feature 007 and is deliberately
 * not called `TEAMS`: there is no team in this system, and naming a permission
 * after a screen that does not exist would leave an administrator granting
 * something they could not find. Project rosters are not a resource of their own
 * either — a membership is part of the project it is on, so it lives under
 * `PROJECTS`.
 *
 * Two resources name screens this backend has not built yet — `TIMESHEET` and
 * `REPORTS`. They are in the catalog anyway, because a permission matrix is the
 * vocabulary an administrator configures *before* a feature ships, and adding the
 * value later would leave every already-configured user silently lacking it.
 *
 * ## Keys
 *
 * `key` is `RESOURCE.ACTION`, built by `permissionKey` — the same function the
 * API uses — rather than by a template literal repeated here. The format has to
 * be one definition: it is what an API body quotes, what the audit trail
 * displays, and what a future `@RequirePermission('TIMESHEET.CREATE')` will
 * name, and a seed spelling it its own way is how the two would drift.
 *
 * It is also the natural key of this seed's output map, so
 * `role-permissions.seed.ts` and `permission-presets.seed.ts` resolve ids by
 * name — and {@link PermissionKey} is a union of exactly the fifty-five literals
 * below, so naming a permission that was never seeded is a compile error rather
 * than a row silently missing from a role.
 */

interface PermissionSeed {
  readonly resource: PermissionResource;
  readonly action: PermissionAction;
  /** What the cell says on the matrix. */
  readonly label: string;
  /**
   * What granting it actually permits, or `null` where the label already says.
   *
   * Written wherever the label alone would leave an administrator guessing —
   * every `APPROVE` and `CONFIGURE`, and every resource whose name is ambiguous
   * on its own (`LEAVES` beside `LEAVE_REQUESTS`, `NOTIFICATION_CONFIG` beside
   * the notification centre nobody is denied). Left `null` on the plain CRUD
   * rows, because a description invented for each of fifty-five cells would be
   * noise that trains people to stop reading the ones that matter.
   */
  readonly description: string | null;
}

const PERMISSION_CATALOG = [
  // --- Dashboard: renders other tables, stores nothing. ---------------------
  {
    resource: PermissionResource.DASHBOARD,
    action: PermissionAction.PAGE_ACCESS,
    label: 'Page access',
    description: 'Open the dashboard.',
  },
  {
    resource: PermissionResource.DASHBOARD,
    action: PermissionAction.VIEW,
    label: 'View',
    description: 'Read the figures and charts on the dashboard.',
  },

  // --- Timesheet ------------------------------------------------------------
  {
    resource: PermissionResource.TIMESHEET,
    action: PermissionAction.PAGE_ACCESS,
    label: 'Page access',
    description: null,
  },
  {
    resource: PermissionResource.TIMESHEET,
    action: PermissionAction.VIEW,
    label: 'View',
    description: null,
  },
  {
    resource: PermissionResource.TIMESHEET,
    action: PermissionAction.CREATE,
    label: 'Create',
    description: null,
  },
  {
    resource: PermissionResource.TIMESHEET,
    action: PermissionAction.EDIT,
    label: 'Edit',
    description: null,
  },
  {
    resource: PermissionResource.TIMESHEET,
    action: PermissionAction.DELETE,
    label: 'Delete',
    description: null,
  },
  {
    resource: PermissionResource.TIMESHEET,
    action: PermissionAction.APPROVE,
    label: 'Approve',
    description: "Sign off other people's submitted timesheets.",
  },

  // --- Employee directory ---------------------------------------------------
  {
    resource: PermissionResource.EMPLOYEES,
    action: PermissionAction.PAGE_ACCESS,
    label: 'Page access',
    description: null,
  },
  {
    resource: PermissionResource.EMPLOYEES,
    action: PermissionAction.VIEW,
    label: 'View',
    description: null,
  },
  {
    resource: PermissionResource.EMPLOYEES,
    action: PermissionAction.CREATE,
    label: 'Create',
    description: null,
  },
  {
    resource: PermissionResource.EMPLOYEES,
    action: PermissionAction.EDIT,
    label: 'Edit',
    description: null,
  },
  {
    resource: PermissionResource.EMPLOYEES,
    action: PermissionAction.DELETE,
    label: 'Delete',
    description: null,
  },

  // --- Leave requests: what people ask for. ---------------------------------
  {
    resource: PermissionResource.LEAVE_REQUESTS,
    action: PermissionAction.PAGE_ACCESS,
    label: 'Page access',
    description: 'Open the leave requests screen.',
  },
  {
    resource: PermissionResource.LEAVE_REQUESTS,
    action: PermissionAction.VIEW,
    label: 'View',
    description: 'Read leave requests.',
  },
  {
    resource: PermissionResource.LEAVE_REQUESTS,
    action: PermissionAction.CREATE,
    label: 'Create',
    description: 'File a leave request.',
  },
  {
    resource: PermissionResource.LEAVE_REQUESTS,
    action: PermissionAction.EDIT,
    label: 'Edit',
    description: 'Change a request that is still pending.',
  },
  {
    resource: PermissionResource.LEAVE_REQUESTS,
    action: PermissionAction.DELETE,
    label: 'Delete',
    description: 'Withdraw a request that is still pending.',
  },
  {
    resource: PermissionResource.LEAVE_REQUESTS,
    action: PermissionAction.APPROVE,
    label: 'Approve',
    description:
      'Approve or reject leave, which is what moves an employee balance.',
  },

  // --- Reports: renders other tables, stores nothing. ------------------------
  {
    resource: PermissionResource.REPORTS,
    action: PermissionAction.PAGE_ACCESS,
    label: 'Page access',
    description: 'Open the reports screen.',
  },
  {
    resource: PermissionResource.REPORTS,
    action: PermissionAction.VIEW,
    label: 'View',
    description: 'Run and read reports across the whole company.',
  },

  // --- Projects -------------------------------------------------------------
  {
    resource: PermissionResource.PROJECTS,
    action: PermissionAction.PAGE_ACCESS,
    label: 'Page access',
    description: null,
  },
  {
    resource: PermissionResource.PROJECTS,
    action: PermissionAction.VIEW,
    label: 'View',
    description: null,
  },
  {
    resource: PermissionResource.PROJECTS,
    action: PermissionAction.CREATE,
    label: 'Create',
    description: null,
  },
  {
    resource: PermissionResource.PROJECTS,
    action: PermissionAction.EDIT,
    label: 'Edit',
    description:
      'Change a project, including its roster — who is on it and who manages it.',
  },
  {
    resource: PermissionResource.PROJECTS,
    action: PermissionAction.DELETE,
    label: 'Delete',
    description: null,
  },

  // --- Leave configuration and balances: what the company grants. -----------
  {
    resource: PermissionResource.LEAVES,
    action: PermissionAction.PAGE_ACCESS,
    label: 'Page access',
    description: 'Open the leave administration screen.',
  },
  {
    resource: PermissionResource.LEAVES,
    action: PermissionAction.VIEW,
    label: 'View',
    description: 'Read leave types and employee leave balances.',
  },
  {
    resource: PermissionResource.LEAVES,
    action: PermissionAction.CREATE,
    label: 'Create',
    description: 'Add a leave type, or allocate somebody a balance.',
  },
  {
    resource: PermissionResource.LEAVES,
    action: PermissionAction.EDIT,
    label: 'Edit',
    description: 'Change a leave type, or correct an allocated balance.',
  },
  {
    resource: PermissionResource.LEAVES,
    action: PermissionAction.DELETE,
    label: 'Delete',
    description: 'Remove a leave type or a balance.',
  },
  {
    resource: PermissionResource.LEAVES,
    action: PermissionAction.CONFIGURE,
    label: 'Configure leave policies',
    description:
      'Change the rules balances are judged by — carry-over, approval requirements, notification addresses — and run the year-end generation.',
  },

  // --- Work schedule: one row for the whole company. -------------------------
  {
    resource: PermissionResource.WORK_SCHEDULE,
    action: PermissionAction.PAGE_ACCESS,
    label: 'Page access',
    description: 'Open the working-schedule screen.',
  },
  {
    resource: PermissionResource.WORK_SCHEDULE,
    action: PermissionAction.VIEW,
    label: 'View',
    description: "Read the company's working days and hours.",
  },
  {
    resource: PermissionResource.WORK_SCHEDULE,
    action: PermissionAction.EDIT,
    label: 'Edit',
    description: 'Change the working days, hours and entry limits.',
  },
  {
    resource: PermissionResource.WORK_SCHEDULE,
    action: PermissionAction.CONFIGURE,
    label: 'Configure approval routing',
    description:
      'Maintain the addresses notified when a timesheet needs approval.',
  },

  // --- Public holidays ------------------------------------------------------
  {
    resource: PermissionResource.PUBLIC_HOLIDAYS,
    action: PermissionAction.PAGE_ACCESS,
    label: 'Page access',
    description: null,
  },
  {
    resource: PermissionResource.PUBLIC_HOLIDAYS,
    action: PermissionAction.VIEW,
    label: 'View',
    description: null,
  },
  {
    resource: PermissionResource.PUBLIC_HOLIDAYS,
    action: PermissionAction.CREATE,
    label: 'Create',
    description: null,
  },
  {
    resource: PermissionResource.PUBLIC_HOLIDAYS,
    action: PermissionAction.EDIT,
    label: 'Edit',
    description: null,
  },
  {
    resource: PermissionResource.PUBLIC_HOLIDAYS,
    action: PermissionAction.DELETE,
    label: 'Delete',
    description: null,
  },

  // --- Departments: the organisational units employees belong to. -----------
  {
    resource: PermissionResource.DEPARTMENTS,
    action: PermissionAction.PAGE_ACCESS,
    label: 'Page access',
    description: 'Open the departments screen.',
  },
  {
    resource: PermissionResource.DEPARTMENTS,
    action: PermissionAction.VIEW,
    label: 'View',
    description: 'Read the departments and who belongs to each.',
  },
  {
    resource: PermissionResource.DEPARTMENTS,
    action: PermissionAction.CREATE,
    label: 'Create',
    description: null,
  },
  {
    resource: PermissionResource.DEPARTMENTS,
    action: PermissionAction.EDIT,
    label: 'Edit',
    description: null,
  },
  {
    resource: PermissionResource.DEPARTMENTS,
    action: PermissionAction.DELETE,
    label: 'Delete',
    description:
      'Remove a department. Refused while employees are still assigned to it.',
  },

  // --- Notification configuration: reminders and campaigns. ------------------
  {
    resource: PermissionResource.NOTIFICATION_CONFIG,
    action: PermissionAction.PAGE_ACCESS,
    label: 'Page access',
    description: 'Open the notification configuration screen.',
  },
  {
    resource: PermissionResource.NOTIFICATION_CONFIG,
    action: PermissionAction.VIEW,
    label: 'View',
    description:
      'Read reminder rules and announcement campaigns. Reading your own inbox is not governed by this and is denied to nobody.',
  },
  {
    resource: PermissionResource.NOTIFICATION_CONFIG,
    action: PermissionAction.CREATE,
    label: 'Create',
    description: 'Add a reminder rule, or compose an announcement.',
  },
  {
    resource: PermissionResource.NOTIFICATION_CONFIG,
    action: PermissionAction.EDIT,
    label: 'Edit',
    description:
      'Change or cancel a reminder rule or an announcement that has not been sent.',
  },
  {
    resource: PermissionResource.NOTIFICATION_CONFIG,
    action: PermissionAction.DELETE,
    label: 'Delete',
    description: 'Remove a reminder rule or an unsent announcement.',
  },

  // --- Permissions: this feature's own screen. ------------------------------
  {
    resource: PermissionResource.PERMISSIONS,
    action: PermissionAction.PAGE_ACCESS,
    label: 'Page access',
    description: 'Open the permissions screen.',
  },
  {
    resource: PermissionResource.PERMISSIONS,
    action: PermissionAction.VIEW,
    label: 'View',
    description: "Read the catalog, the presets and other people's matrices.",
  },
  {
    resource: PermissionResource.PERMISSIONS,
    action: PermissionAction.EDIT,
    label: 'Edit',
    description: "Change an individual permission on somebody's matrix.",
  },
  {
    resource: PermissionResource.PERMISSIONS,
    action: PermissionAction.CONFIGURE,
    label: 'Apply presets and reset',
    description:
      "Put somebody on a preset, or reset them to their role's baseline — the two operations that replace a whole matrix at once.",
  },
] as const satisfies readonly PermissionSeed[];

/** `RESOURCE.ACTION` for one catalog entry, at the type level. */
type KeyOf<Entry> = Entry extends {
  resource: infer Resource extends string;
  action: infer Action extends string;
}
  ? `${Resource}.${Action}`
  : never;

/**
 * Every permission key that exists, as a union of literals.
 *
 * Derived from the list above rather than written out again, and derived
 * *pairwise*: {@link KeyOf} is a distributive conditional type, so it is applied
 * to each entry of the tuple separately and yields exactly the fifty-five pairs
 * that were seeded. Building it from the two enums instead would produce the
 * eighty-four-member cartesian product, including the pairs this catalog
 * deliberately does not contain.
 *
 * That is what makes a typo in `role-permissions.seed.ts` — or a set naming
 * `DASHBOARD.DELETE` — a compile error instead of a role quietly missing a
 * grant. It is also why `PERMISSION_CATALOG` is `as const`.
 */
export type PermissionKey = KeyOf<(typeof PERMISSION_CATALOG)[number]>;

export type SeededPermissions = SeededRecords<PermissionKey, PermissionModel>;

/**
 * Every key in the catalog, in matrix order.
 *
 * Derived from the list rather than written out a second time, which is what
 * lets "Admin - Full Access" and the super-admin's documented set *be* the whole
 * catalog instead of a copy of it that would go stale the first time a
 * permission was added.
 */
export const ALL_PERMISSION_KEYS: readonly PermissionKey[] =
  PERMISSION_CATALOG.map(
    (permission) =>
      permissionKey(permission.resource, permission.action) as PermissionKey,
  );

/**
 * Seeds the catalog. Depends on nothing.
 *
 * Upserted on the unique `key`, so re-running updates the labels and
 * descriptions of the rows it created rather than duplicating them — and a
 * permission whose wording is improved keeps its id, which every role binding,
 * preset item, override and audit row points at.
 */
export async function seedPermissions(
  prisma: SeedClient,
): Promise<SeededPermissions> {
  return upsertAll(
    PERMISSION_CATALOG,
    (permission) =>
      permissionKey(permission.resource, permission.action) as PermissionKey,
    (permission) => {
      const key = permissionKey(permission.resource, permission.action);
      const fields = {
        resource: permission.resource,
        action: permission.action,
        label: permission.label,
        description: permission.description,
      };

      return prisma.permission.upsert({
        where: { key },
        update: fields,
        create: { key, ...fields },
      });
    },
  );
}
