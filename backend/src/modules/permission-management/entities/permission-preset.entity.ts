import { toIsoTimestamp } from '../../../common/utils/date.util';
import type { Prisma } from '../../../generated/prisma/client';
import type { UserRole } from '../../../generated/prisma/enums';
import type { PermissionPresetModel } from '../../../generated/prisma/models';

/**
 * A preset as `GET /permissions/presets` returns it — everything one quick-apply
 * card renders.
 *
 * `permissionCount` rather than the permissions themselves. The card says "HR -
 * Full Access · 41 permissions", and resolving all six presets' items would put
 * two hundred and thirty-odd nested objects on a response that draws six tiles.
 * The set a preset represents is not hidden — applying it returns the resulting
 * matrix, which is where a client can see exactly what changed, and that is the
 * screen where the question is actually asked. The call
 * `NotificationCampaignSummaryEntity` makes with `recipientCount`.
 *
 * `targetRole` is grouping, not a constraint: a preset may be applied to any
 * account that is not a super-admin. A client renders the cards under the role
 * heading and does not gate the button on it.
 */
export interface PermissionPresetEntity {
  id: string;
  /** `HR_FULL_ACCESS` — what `apply-preset` quotes. */
  key: string;
  name: string;
  description: string | null;
  /** Which role the preset was written for, and which heading it renders under. */
  targetRole: UserRole;
  /** How many permissions the preset hands out. */
  permissionCount: number;
  createdAt: string;
  updatedAt: string;
}

/**
 * What the preset list reads: the preset's own columns, and a count of its
 * items.
 *
 * `_count` rather than selecting the items, because only the number is needed —
 * the opposite of the call `CAMPAIGN_LIST_SELECT` makes, and for the reason that
 * makes the two different: a campaign needs one *fact* about its recipients as
 * well as their number (whether they are named people or everybody), while a
 * preset's items are homogeneous and there is nothing to learn from them but how
 * many there are.
 */
export const PRESET_LIST_SELECT = {
  id: true,
  key: true,
  name: true,
  description: true,
  targetRole: true,
  createdAt: true,
  updatedAt: true,
  _count: { select: { items: true } },
} as const satisfies Prisma.PermissionPresetSelect;

/** A row read through {@link PRESET_LIST_SELECT}. */
export type PermissionPresetRow = Pick<
  PermissionPresetModel,
  | 'id'
  | 'key'
  | 'name'
  | 'description'
  | 'targetRole'
  | 'createdAt'
  | 'updatedAt'
> & {
  _count: { items: number };
};

/** Maps a row onto the resource the preset list returns. */
export function toPermissionPresetEntity(
  preset: PermissionPresetRow,
): PermissionPresetEntity {
  return {
    id: preset.id,
    key: preset.key,
    name: preset.name,
    description: preset.description,
    targetRole: preset.targetRole,
    permissionCount: preset._count.items,
    createdAt: toIsoTimestamp(preset.createdAt),
    updatedAt: toIsoTimestamp(preset.updatedAt),
  };
}
