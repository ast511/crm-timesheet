import { UserRole } from '../../src/generated/prisma/enums';

import { ADMIN_STANDARD, HR_STANDARD, USER_BASELINE } from './permission-sets';
import type { PermissionKey, SeededPermissions } from './permissions.seed';
import { requireSeeded, type SeedClient } from './seed-context';

/**
 * What each role grants by default — the baseline every user of that role starts
 * from, and the thing a per-user override is an exception *to*.
 *
 * **Three roles are seeded, not four.** `SUPERADMIN` is deliberately absent and
 * must stay absent. A super-admin holds every permission by *resolution* rather
 * than by configuration — see `PermissionService.resolveEffective` — and the
 * distinction is not academic:
 *
 *  - the set is a statement about what the role *is* (the account that can
 *    always fix the system, including a matrix somebody has locked themselves
 *    out of) rather than a set somebody chose;
 *  - seeded as rows it would become editable, and the first edit would create a
 *    super-admin who could no longer administer;
 *  - and it would tie the super-admin to whatever `ADMIN` happens to hold today.
 *    The moment `ADMIN` is restricted — which is the whole point of having tiers
 *    — a copied baseline would silently restrict the super-admin with it. The
 *    bypass holds every permission in the catalog *independently*, so a
 *    permission added by a future migration is held the day it exists, with no
 *    seed to remember to update.
 *
 * The three sets are imported from `permission-sets.ts` rather than written
 * here, and that is not merely tidiness: `HR_STANDARD` is simultaneously the HR
 * baseline and the "HR - Standard" preset, so applying that card to a fresh HR
 * account must leave them with **no overrides at all**. Two copies of the list
 * would be two lists, and the first edit to one would make the preset start
 * writing exceptions on accounts that already held the permissions.
 *
 * ```text
 *   USER    16 of 55   their own work
 *   HR      35         + the people side, read and write, no deletes
 *   ADMIN   46         + the administration screens; no deletes on the
 *                        directory and configuration resources, no
 *                        WORK_SCHEDULE.CONFIGURE, no permission writing
 * ```
 *
 * `PERMISSIONS.EDIT` and `PERMISSIONS.CONFIGURE` are held by no baseline, which
 * is deliberate: managing what other people may do is an explicit grant, made
 * one account at a time through the "Admin - Full Access" preset or a per-user
 * override. A super-admin holds both regardless, by the bypass above, so the
 * system is never left with nobody able to administer it.
 *
 * Unlike most seeds here this one returns a **count** rather than a lookup map.
 * Nothing downstream resolves a role binding by name — a binding is addressed by
 * the pair it is made of, never individually — so a map would be built for
 * nobody. `project-members.seed.ts` made the same call.
 */

/** One role and the keys it grants. */
interface RoleBaseline {
  readonly role: UserRole;
  readonly permissionKeys: readonly PermissionKey[];
}

const ROLE_BASELINES: readonly RoleBaseline[] = [
  { role: UserRole.USER, permissionKeys: USER_BASELINE },
  { role: UserRole.HR, permissionKeys: HR_STANDARD },
  { role: UserRole.ADMIN, permissionKeys: ADMIN_STANDARD },
];

/**
 * Seeds the role baselines. Depends on the permission catalog.
 *
 * Upserted on the unique `(role, permission_id)` pair, so a second run is a
 * no-op on the bindings it created rather than a duplicate.
 *
 * A binding **removed** from a set above is not deleted by a re-run: this seed
 * adds and never withdraws. Withdrawing a permission from a role changes what
 * people can do and belongs in a migration somebody wrote on purpose, not in a
 * development convenience that runs whenever anybody types `npm run
 * prisma:seed`. `prisma migrate reset` is how a baseline is rebuilt from
 * scratch.
 *
 * Ids are resolved by key through `requireSeeded`, so a key that was never
 * seeded fails loudly and names itself instead of writing a binding to nothing.
 */
export async function seedRolePermissions(
  prisma: SeedClient,
  permissions: SeededPermissions,
): Promise<number> {
  let count = 0;

  for (const { role, permissionKeys } of ROLE_BASELINES) {
    for (const key of permissionKeys) {
      const permissionId = requireSeeded(permissions, key, 'permission').id;

      await prisma.rolePermission.upsert({
        where: { role_permissionId: { role, permissionId } },
        // Nothing to update: the row *is* the pair, and both halves are in the
        // key. The empty object is what makes this an idempotent insert.
        update: {},
        create: { role, permissionId },
      });

      count += 1;
    }
  }

  return count;
}
