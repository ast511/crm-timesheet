import { Reflector } from '@nestjs/core';

import { ADMIN_FULL_ACCESS } from '../../../prisma/seeds/permission-sets';
import { ALL_PERMISSION_KEYS } from '../../../prisma/seeds/permissions.seed';
import { DepartmentController } from '../departments/department.controller';
import { EmailController } from '../email/email.controller';
import { EmployeeLeaveBalancesController } from '../employee-leave-balances/employee-leave-balances.controller';
import { EmployeeController } from '../employees/employee.controller';
import { LeaveNotificationEmailsController } from '../leave-configuration/leave-notification-emails.controller';
import { LeaveTypesController } from '../leave-configuration/leave-types.controller';
import { LeaveRequestsController } from '../leave-requests/leave-requests.controller';
import { MyLeaveRequestsController } from '../leave-requests/my-leave-requests.controller';
import { NotificationDeliveryController } from '../notification-delivery/notification-delivery.controller';
import { NotificationCampaignController } from '../notification-management/notification-campaign.controller';
import { ReminderController } from '../notification-management/reminder.controller';
import { NotificationController } from '../notifications/notification.controller';
import { PermissionController } from '../permission-management/permission.controller';
import { UserPermissionController } from '../permission-management/user-permission.controller';
import { PositionController } from '../positions/position.controller';
import { ProjectMembersController } from '../project-members/project-members.controller';
import { ProjectController } from '../projects/project.controller';
import { PublicHolidayController } from '../public-holidays/public-holiday.controller';
import { ReportingController } from '../reporting/reporting.controller';
import { TimesheetController } from '../timesheet-management/timesheet.controller';
import { WorkScheduleController } from '../work-schedule/work-schedule.controller';
import {
  PermissionRequirement,
  REQUIRED_PERMISSIONS_KEY,
} from './decorators/require-permission.decorator';

/**
 * Every permission key any route in this application names, checked against the
 * catalog that actually exists.
 *
 * **This is the compile-time check the decorator cannot make.** The fifty-five
 * keys exist as a union of literals — `PermissionKey` in
 * `prisma/seeds/permissions.seed.ts` — but the seeds are CLI-only tooling that
 * `tsconfig.build.json` excludes from the build, so `src/` cannot import that
 * type without shipping the seed inside `dist/`, and copying the fifty-five
 * literals into `src/` would be the catalog written twice. A spec can import
 * across that line where the application cannot, so the guarantee is bought here
 * instead: `@RequirePermission('REPORTS.VEIW')` is a failing test rather than a
 * gate that no grant in the system can ever satisfy and that therefore refuses
 * everybody but a super-admin — the worst possible failure mode, because it
 * looks like a working access rule.
 *
 * The controller list is maintained by hand. That is deliberate: a route gaining
 * a requirement is a decision somebody made, and adding its controller here is
 * one line of the same change. Discovering them through `DiscoveryService`
 * instead would need the whole application booted — a database, a mail
 * transport, four signing secrets — to assert a property of some string
 * literals.
 */

/**
 * Every controller in the application that gates at least one route.
 *
 * Four when Feature 035 wrote this file; nineteen since Feature 041 swept the
 * write verbs. The list is still maintained by hand for the reason above — a
 * route gaining a requirement is a decision somebody made, and adding its
 * controller here is one line of the same change.
 */
const GATED_CONTROLLERS = [
  // Feature 035: the routes that decide what everybody else may do, the
  // reports, and the two timesheet review actions.
  PermissionController,
  UserPermissionController,
  ReportingController,
  TimesheetController,
  // Feature 041: the write verbs of the twenty-odd modules that had none.
  ProjectController,
  ProjectMembersController,
  PublicHolidayController,
  EmployeeController,
  PositionController,
  DepartmentController,
  LeaveTypesController,
  LeaveNotificationEmailsController,
  EmployeeLeaveBalancesController,
  WorkScheduleController,
  LeaveRequestsController,
  MyLeaveRequestsController,
  ReminderController,
  NotificationCampaignController,
  NotificationController,
  NotificationDeliveryController,
  EmailController,
];

const reflector = new Reflector();

/** `Controller.method` → the requirement it declares, for every gated route. */
function declaredRequirements(): [string, PermissionRequirement][] {
  const declared: [string, PermissionRequirement][] = [];

  for (const controller of GATED_CONTROLLERS) {
    const { prototype } = controller;

    for (const method of Object.getOwnPropertyNames(prototype)) {
      const handler = (prototype as unknown as Record<string, unknown>)[method];

      if (typeof handler !== 'function' || method === 'constructor') {
        continue;
      }

      const requirement = reflector.get<PermissionRequirement | undefined>(
        REQUIRED_PERMISSIONS_KEY,
        handler as () => unknown,
      );

      if (requirement !== undefined) {
        declared.push([`${controller.name}.${method}`, requirement]);
      }
    }
  }

  return declared;
}

describe('the permission keys the routes declare', () => {
  const declared = declaredRequirements();

  /** A guard against this whole file quietly testing an empty list. */
  it('finds the routes Features 035 and 041 gated', () => {
    expect(declared).toHaveLength(56);
  });

  it.each(declared)('%s names only catalog keys', (_route, requirement) => {
    for (const key of requirement.keys) {
      expect(ALL_PERMISSION_KEYS).toContain(key);
    }
  });

  /**
   * The keys in use, listed so the set is visible in one place — this is what a
   * frontend aligns its soft gating against, and what an administrator has to be
   * able to grant.
   *
   * Five after Feature 035; thirty after Feature 041 spent the catalog's write
   * cells. What is still absent is worth reading: **no `PAGE_ACCESS` key appears
   * here at all**, because those govern screens rather than routes and are the
   * frontend's to enforce, and **only one `VIEW` does** — `REPORTS.VIEW`, on the
   * one resource whose whole content is a company-wide document. Every other
   * read in this API is open to any authenticated caller, which is the deliberate
   * asymmetry of the sweep: it closed the writes and touched no read.
   */
  it('uses thirty distinct keys, all of them grantable', () => {
    const used = new Set(declared.flatMap(([, { keys }]) => keys));

    expect([...used].sort()).toEqual([
      'DEPARTMENTS.CREATE',
      'DEPARTMENTS.DELETE',
      'DEPARTMENTS.EDIT',
      'EMPLOYEES.CREATE',
      'EMPLOYEES.DELETE',
      'EMPLOYEES.EDIT',
      'LEAVES.CONFIGURE',
      'LEAVES.CREATE',
      'LEAVES.DELETE',
      'LEAVES.EDIT',
      'LEAVE_REQUESTS.APPROVE',
      'LEAVE_REQUESTS.CREATE',
      'LEAVE_REQUESTS.DELETE',
      'LEAVE_REQUESTS.EDIT',
      'NOTIFICATION_CONFIG.CREATE',
      'NOTIFICATION_CONFIG.DELETE',
      'NOTIFICATION_CONFIG.EDIT',
      'PERMISSIONS.CONFIGURE',
      'PERMISSIONS.EDIT',
      'PERMISSIONS.VIEW',
      'PROJECTS.CREATE',
      'PROJECTS.DELETE',
      'PROJECTS.EDIT',
      'PUBLIC_HOLIDAYS.CREATE',
      'PUBLIC_HOLIDAYS.DELETE',
      'PUBLIC_HOLIDAYS.EDIT',
      'REPORTS.VIEW',
      'TIMESHEET.APPROVE',
      'WORK_SCHEDULE.CONFIGURE',
      'WORK_SCHEDULE.EDIT',
    ]);
  });

  /**
   * **No gated route names a key that no configured account can hold.**
   *
   * The catalog check above proves a key was *seeded*; this proves it can
   * actually be *granted*, which is the property a gate depends on. They come
   * apart in exactly one direction that matters: a key seeded into the catalog
   * but present in no preset would produce a route only a super-admin could ever
   * reach — indistinguishable, from the outside, from a typo.
   *
   * `Admin - Full Access` is the whole catalog by construction, so this is
   * trivially true today. It is asserted anyway because the day somebody defines
   * a narrower ceiling, this is the test that says which routes went out of reach
   * with it.
   */
  it('names only keys the widest preset can grant', () => {
    const used = new Set(declared.flatMap(([, { keys }]) => keys));

    for (const key of used) {
      expect(ADMIN_FULL_ACCESS).toContain(key);
    }
  });
});
