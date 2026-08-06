import { toIsoTimestamp } from '../../../common/utils/date.util';
import type { Prisma } from '../../../generated/prisma/client';
import type {
  PermissionAction,
  PermissionAuditAction,
  PermissionEffect,
  PermissionResource,
} from '../../../generated/prisma/enums';
import type { PermissionAuditLogModel } from '../../../generated/prisma/models';

/**
 * The permission a history line is about, as the line renders it.
 *
 * A summary rather than the full {@link PermissionEntity}: the History tab shows
 * "Granted **Create timesheet entries** (`TIMESHEET.CREATE`)", so it needs the
 * key to be precise and the label to be readable, and nothing else. Publishing
 * the description and the timestamps of a catalog row on every one of a hundred
 * history lines would repeat the catalog inside the log.
 *
 * Null on the two summary actions — see {@link PermissionAuditLogEntity.action}.
 */
export interface AuditPermissionSummary {
  id: string;
  key: string;
  resource: PermissionResource;
  action: PermissionAction;
  label: string;
}

/** The preset a `PRESET_APPLIED` line names. Null on every other action. */
export interface AuditPresetSummary {
  id: string;
  key: string;
  name: string;
}

/**
 * Who made a change, as the history renders them.
 *
 * An account rather than an employee, unlike `NotificationCampaignEntity.createdBy`,
 * and the difference is not a preference: permissions are held by *accounts* —
 * `user_permission_overrides.user_id` — and not every account has an employment
 * record. Resolving the actor through `employees` would leave a super-admin
 * created to administer the system rendering as null on the very screen that
 * records what they did.
 *
 * `email` and `username` are what a person recognises; nothing else is
 * published, and in particular nothing that would let this payload become a
 * second, unaudited way to read the users table.
 */
export interface AuditUserSummary {
  id: string;
  email: string;
  username: string | null;
}

/**
 * One line of the History tab: what changed, for whom, by whom, and when.
 *
 * Each row is a **transition**, and `previousEffect`/`newEffect` are what makes
 * it one: `null → GRANT` is a permission added on top of the role, `REVOKE →
 * null` is an exception withdrawn so the role applies again. A client renders
 * the arrow directly from the pair rather than inferring it from `action`, which
 * is why both are published even though `action` correlates with `newEffect`.
 *
 * `permission` is null on exactly two actions — `PRESET_APPLIED` and
 * `RESET_TO_ROLE` — which are summaries of a whole operation written beside the
 * per-permission rows that make it up. A client renders those as a heading and
 * the rest as the lines under it; they share a `createdAt` to the millisecond,
 * because they are written in one transaction.
 */
export interface PermissionAuditLogEntity {
  id: string;
  /**
   * What happened. The three per-permission transitions carry a `permission`;
   * the two summaries carry none, and `PRESET_APPLIED` carries a `preset`.
   */
  action: PermissionAuditAction;
  permission: AuditPermissionSummary | null;
  preset: AuditPresetSummary | null;
  /** The override state before the change, or null when there was none. */
  previousEffect: PermissionEffect | null;
  /** The override state after it, or null when the exception was removed. */
  newEffect: PermissionEffect | null;
  /** The account that made the change — from `@CurrentUser()`, never hardcoded. */
  changedBy: AuditUserSummary;
  createdAt: string;
}

const AUDIT_PERMISSION_SELECT = {
  id: true,
  key: true,
  resource: true,
  action: true,
  label: true,
} as const satisfies Prisma.PermissionSelect;

const AUDIT_PRESET_SELECT = {
  id: true,
  key: true,
  name: true,
} as const satisfies Prisma.PermissionPresetSelect;

/**
 * The actor, resolved to something a person recognises.
 *
 * A `select` rather than an `include`, and here that choice does real work: this
 * row joins to `users`, whose `passwordHash` an `include` would put one careless
 * nesting away from an administration screen — and would keep publishing every
 * column added to that table later. The same call `CAMPAIGN_BASE_SELECT` makes.
 */
const AUDIT_USER_SELECT = {
  id: true,
  email: true,
  username: true,
} as const satisfies Prisma.UserSelect;

/**
 * What the history read selects.
 *
 * `targetUserId` is absent, deliberately: the route is
 * `/users/:id/permissions/history`, so every row on the page is about that user
 * and echoing the id back on each of them would be the scope repeated a hundred
 * times. The same call every scoped endpoint in this project makes.
 */
export const AUDIT_LOG_SELECT = {
  id: true,
  action: true,
  previousEffect: true,
  newEffect: true,
  permission: { select: AUDIT_PERMISSION_SELECT },
  preset: { select: AUDIT_PRESET_SELECT },
  changedBy: { select: AUDIT_USER_SELECT },
  createdAt: true,
} as const satisfies Prisma.PermissionAuditLogSelect;

/** A row read through {@link AUDIT_LOG_SELECT}. */
export type PermissionAuditLogRow = Pick<
  PermissionAuditLogModel,
  'id' | 'action' | 'previousEffect' | 'newEffect' | 'createdAt'
> & {
  permission: AuditPermissionSummary | null;
  preset: AuditPresetSummary | null;
  changedBy: AuditUserSummary;
};

/** Maps a row onto one line of the History tab. */
export function toPermissionAuditLogEntity(
  entry: PermissionAuditLogRow,
): PermissionAuditLogEntity {
  return {
    id: entry.id,
    action: entry.action,
    permission:
      entry.permission === null
        ? null
        : {
            id: entry.permission.id,
            key: entry.permission.key,
            resource: entry.permission.resource,
            action: entry.permission.action,
            label: entry.permission.label,
          },
    preset:
      entry.preset === null
        ? null
        : {
            id: entry.preset.id,
            key: entry.preset.key,
            name: entry.preset.name,
          },
    previousEffect: entry.previousEffect,
    newEffect: entry.newEffect,
    changedBy: {
      id: entry.changedBy.id,
      email: entry.changedBy.email,
      username: entry.changedBy.username,
    },
    createdAt: toIsoTimestamp(entry.createdAt),
  };
}
