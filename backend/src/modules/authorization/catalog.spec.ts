import { Reflector } from '@nestjs/core';

import { ALL_PERMISSION_KEYS } from '../../../prisma/seeds/permissions.seed';
import { PermissionController } from '../permission-management/permission.controller';
import { UserPermissionController } from '../permission-management/user-permission.controller';
import { ReportingController } from '../reporting/reporting.controller';
import { TimesheetController } from '../timesheet-management/timesheet.controller';
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

/** Every controller in the application that gates at least one route. */
const GATED_CONTROLLERS = [
  PermissionController,
  UserPermissionController,
  ReportingController,
  TimesheetController,
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
  it('finds the routes Feature 035 gated', () => {
    expect(declared).toHaveLength(12);
  });

  it.each(declared)('%s names only catalog keys', (_route, requirement) => {
    for (const key of requirement.keys) {
      expect(ALL_PERMISSION_KEYS).toContain(key);
    }
  });

  /**
   * The five keys in use, listed so the set is visible in one place — this is
   * what a frontend aligns its soft gating against, and what an administrator
   * has to be able to grant.
   */
  it('uses five distinct keys, all of them grantable', () => {
    const used = new Set(declared.flatMap(([, { keys }]) => keys));

    expect([...used].sort()).toEqual([
      'PERMISSIONS.CONFIGURE',
      'PERMISSIONS.EDIT',
      'PERMISSIONS.VIEW',
      'REPORTS.VIEW',
      'TIMESHEET.APPROVE',
    ]);
  });
});
