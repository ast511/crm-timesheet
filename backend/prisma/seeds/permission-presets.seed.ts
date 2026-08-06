import { UserRole } from '../../src/generated/prisma/enums';

import {
  ADMIN_FULL_ACCESS,
  ADMIN_LIMITED,
  ADMIN_STANDARD,
  HR_FULL_ACCESS,
  HR_STANDARD,
  HR_VIEW_ONLY,
} from './permission-sets';
import type { PermissionKey, SeededPermissions } from './permissions.seed';
import { requireSeeded, type SeedClient } from './seed-context';

/**
 * The six quick-apply cards on the permissions screen, and the permissions each
 * hands out.
 *
 * Seeded like the catalog and for the same reason: a preset is a recommendation
 * this product makes, not data a customer maintains. There is no
 * `POST /permissions/presets`; editing them is a later feature.
 *
 * ```text
 *   HR - View Only      26 of 55    see the HR side, change nothing
 *   HR - Standard       35          + the day-to-day HR work        = HR baseline
 *   HR - Full Access    41          + deletes, leave policy, timesheet approval
 *   Admin - Limited     40          HR - Standard + approvals + admin reads
 *   Admin - Standard    46          + the admin writes              = ADMIN baseline
 *   Admin - Full Access 55          the entire catalog
 * ```
 *
 * **Two of the six are exactly a role baseline**, and that is the property that
 * makes the whole model coherent: applying "HR - Standard" to a fresh `HR`
 * account leaves it with *no overrides at all*, because the intended set and the
 * baseline agree everywhere and an override is only ever stored where they
 * differ. The sets are imported from `permission-sets.ts` — the same constants
 * `role-permissions.seed.ts` uses — so the two can never drift into disagreeing
 * about what "standard" means.
 *
 * `targetRole` groups the cards on the screen and constrains nothing. A preset
 * may be applied to any account that is not a super-admin, because "give this
 * particular `USER` what an HR person gets" is a real thing an administrator
 * does, and refusing it would send them to toggle thirty-five cells by hand.
 * `SUPERADMIN` is not a target of any card: that role already holds everything,
 * so a preset for it would be a button that does nothing.
 *
 * Applying a card stores no link back to it — the fact is recorded in
 * `permission_audit_logs` instead. A column claiming "this user is on HR -
 * Standard" would stop being true the moment somebody toggled one cell, and
 * would then be a label disagreeing with the matrix underneath it.
 */

interface PresetSeed {
  /** Natural key of the preset, and of this seed's output map. */
  readonly key: string;
  readonly name: string;
  readonly description: string;
  readonly targetRole: UserRole;
  readonly permissionKeys: readonly PermissionKey[];
}

const PERMISSION_PRESETS = [
  {
    key: 'HR_VIEW_ONLY',
    name: 'HR - View Only',
    description:
      'See the whole HR side of the application and change none of it. The card for an auditor, a new joiner, or somebody covering a colleague.',
    targetRole: UserRole.HR,
    permissionKeys: HR_VIEW_ONLY,
  },
  {
    key: 'HR_STANDARD',
    name: 'HR - Standard',
    description:
      'The day-to-day HR work: adding and correcting people, approving leave, maintaining leave types, holidays and rosters. No deletes. Identical to what the HR role grants by default, so applying it to an HR account clears every exception.',
    targetRole: UserRole.HR,
    permissionKeys: HR_STANDARD,
  },
  {
    key: 'HR_FULL_ACCESS',
    name: 'HR - Full Access',
    description:
      'Everything in the HR half of the application, deletes and leave policy included. It stops short of the administration screens — projects, the working schedule, notifications and permissions.',
    targetRole: UserRole.HR,
    permissionKeys: HR_FULL_ACCESS,
  },
  {
    key: 'ADMIN_LIMITED',
    name: 'Admin - Limited',
    description:
      'An administrator who watches rather than configures: everything HR - Standard grants, both approvals, and read access to the notification and permission screens.',
    targetRole: UserRole.ADMIN,
    permissionKeys: ADMIN_LIMITED,
  },
  {
    key: 'ADMIN_STANDARD',
    name: 'Admin - Standard',
    description:
      'The writes an administrator actually performs, on top of Admin - Limited: projects, the working schedule, notification configuration and leave policy. Withholds deletes on the directory and configuration resources, approval routing, and the writing of permissions. Identical to what the Admin role grants by default.',
    targetRole: UserRole.ADMIN,
    permissionKeys: ADMIN_STANDARD,
  },
  {
    key: 'ADMIN_FULL_ACCESS',
    name: 'Admin - Full Access',
    description:
      'Every permission in the catalog — as much as a configured account can hold, and the only card that grants the writing of other people’s permissions. The same effective set a super-admin has, reached by stored rows instead of by a bypass, so an account on it can be brought back down.',
    targetRole: UserRole.ADMIN,
    permissionKeys: ADMIN_FULL_ACCESS,
  },
] as const satisfies readonly PresetSeed[];

/**
 * Seeds the presets and their items. Depends on the permission catalog.
 *
 * Presets are upserted on the unique `key` and items on the unique
 * `(preset_id, permission_id)` pair, so re-running refreshes the wording and
 * adds any newly listed permission rather than duplicating anything.
 *
 * An item **removed** from a set is not deleted by a re-run, the same call
 * `role-permissions.seed.ts` makes and for the same reason: narrowing a preset
 * changes what a button does to real accounts, and that belongs in a migration
 * somebody wrote on purpose rather than in a seed anybody may run.
 *
 * Returns the number of `(preset, permission)` rows the run touched, which is
 * the honest count of what this seed writes: six presets are visible on the
 * screen, but two hundred and forty-three items are what makes them mean
 * anything.
 */
export async function seedPermissionPresets(
  prisma: SeedClient,
  permissions: SeededPermissions,
): Promise<number> {
  let items = 0;

  for (const preset of PERMISSION_PRESETS) {
    const fields = {
      name: preset.name,
      description: preset.description,
      targetRole: preset.targetRole,
    };

    const { id: presetId } = await prisma.permissionPreset.upsert({
      where: { key: preset.key },
      update: fields,
      create: { key: preset.key, ...fields },
      select: { id: true },
    });

    for (const key of preset.permissionKeys) {
      const permissionId = requireSeeded(permissions, key, 'permission').id;

      await prisma.permissionPresetItem.upsert({
        where: { presetId_permissionId: { presetId, permissionId } },
        // Nothing to update: the row *is* the pair, and both halves are in the
        // key. The empty object is what makes this an idempotent insert.
        update: {},
        create: { presetId, permissionId },
      });

      items += 1;
    }
  }

  return items;
}
