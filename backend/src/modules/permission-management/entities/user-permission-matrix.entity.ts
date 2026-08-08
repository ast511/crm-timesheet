import { PermissionEffect } from '../../../generated/prisma/enums';
import type {
  PermissionAction,
  PermissionResource,
  UserRole,
} from '../../../generated/prisma/enums';
import type { PermissionEntity, PermissionRow } from './permission.entity';
import { toPermissionEntity } from './permission.entity';

/**
 * Why a cell of the matrix reads the way it does.
 *
 * The screen renders a checkbox per cell, and a checkbox alone cannot say
 * whether somebody was given a permission or merely has it because of their
 * role — which is exactly what an administrator opening this screen needs to
 * know before changing anything. Five values, and each answers a different
 * question about the same tick:
 *
 * - `SUPERADMIN` — granted because the account is a super-admin. Nothing is
 *   stored and nothing can be changed; the matrix is read-only.
 * - `ROLE` — granted by the role baseline, with no exception recorded. Ticking
 *   the box off will create a `REVOKE` override.
 * - `OVERRIDE_GRANT` — granted although the role does not grant it. Somebody
 *   made this exception; the history says who.
 * - `OVERRIDE_REVOKE` — **not** granted although the role does grant it. The
 *   most important of the five: without it, a permission the role gives and this
 *   person lacks would be indistinguishable from one nobody ever had.
 * - `NONE` — not granted, and no exception. The role does not give it either.
 *
 * A string union rather than a Prisma enum, because none of this is stored: it
 * is *derived* on every read from the baseline and the overrides. Storing it
 * would be a second copy of a fact the two tables already state, and the copy is
 * the one that would go stale the day a role baseline changed.
 */
export const PERMISSION_SOURCES = [
  'SUPERADMIN',
  'ROLE',
  'OVERRIDE_GRANT',
  'OVERRIDE_REVOKE',
  'NONE',
] as const;

export type PermissionSource = (typeof PERMISSION_SOURCES)[number];

/** One catalog permission, resolved for one user. */
export interface PermissionMatrixCell extends PermissionEntity {
  /** Whether the user effectively holds it. */
  granted: boolean;
  /** Why — see {@link PERMISSION_SOURCES}. */
  source: PermissionSource;
}

/**
 * The output of the one resolution method, and the shape every endpoint that
 * answers "what may this person do" is built from.
 *
 * It carries **every catalog permission**, granted or not, rather than only the
 * granted ones. The matrix screen has to draw the empty boxes as well as the
 * ticked ones, and `/permissions/me/effective` reduces this to the granted keys
 * with a `filter` — deriving the long list from the short one is impossible,
 * while the reverse is one line. One method, one shape, two readers.
 */
export interface EffectiveResolution {
  userId: string;
  role: UserRole;
  /**
   * Whether the matrix may be written at all.
   *
   * `true` only for a super-admin, whose set is neither stored nor editable. It
   * is published so the screen can render the crown state without re-deriving
   * the rule from `role` — and so that the rule lives in the resolution method
   * rather than in a client's copy of it.
   */
  readOnly: boolean;
  permissions: PermissionMatrixCell[];
}

/**
 * The per-user matrix as `GET /users/:id/permissions` returns it.
 *
 * Grouped by resource for the same reason the catalog is: the screen draws
 * resources down the page and actions across it, and a flat list would make
 * every client write the same `reduce`. Unlike the catalog this one is never
 * paginated — a matrix is meaningless in pieces, and it is fifty-five rows.
 */
export interface UserPermissionMatrixEntity {
  userId: string;
  role: UserRole;
  /** `true` for a super-admin target: the screen renders it but cannot write it. */
  readOnly: boolean;
  /** How many of the catalog's permissions this person effectively holds. */
  grantedCount: number;
  /** How many permissions the catalog holds, so a client can render "10 of 55". */
  totalCount: number;
  resources: PermissionMatrixResourceEntity[];
}

export interface PermissionMatrixResourceEntity {
  resource: PermissionResource;
  permissions: PermissionMatrixCell[];
}

/**
 * The effective set as `GET /permissions/me/effective` returns it: keys, and
 * nothing else.
 *
 * **The endpoint the frontend gates its UI on**, which is why it is deliberately
 * the smallest possible payload — a flat array of strings a client turns into a
 * `Set` once and asks `has('TIMESHEET.CREATE')` of thereafter. Sending the whole
 * matrix here would send fifty-five objects to answer a question about which
 * buttons to draw, and would tempt a client into branching on `source`, which is
 * an administrator's concern rather than a renderer's.
 *
 * It is **soft gating and nothing more**, and it stays that way once real
 * enforcement arrives. Hiding a button is a courtesy to the person using the
 * screen; a client that skipped this call and drew every button would simply
 * meet a `403` on the request. The reason no permission is enforced *today* is
 * that the authorization enforcement feature has not landed — Feature 032
 * supplied the identity it needs. See the module documentation.
 */
export interface EffectivePermissionsEntity {
  userId: string;
  role: UserRole;
  /** `true` for a super-admin — every key, and none of them stored. */
  readOnly: boolean;
  /** The granted keys, in catalog order. */
  permissions: string[];
  /** How many, so a client renders a count without measuring the array. */
  total: number;
}

/**
 * Resolves one catalog row against a user's baseline and overrides.
 *
 * The per-cell half of the resolution rule, kept beside the source vocabulary it
 * produces so the five values and the five branches cannot drift apart. The
 * set-level half — `(baseline ∪ granted) − revoked` — is
 * `PermissionService.resolveEffective`, and this is what it applies row by row.
 *
 * The super-admin branch is first because it answers before either set is
 * consulted: a super-admin's permissions are not stored, so `baseline` and the
 * overrides are both empty for one and reading them would resolve every cell to
 * `NONE`.
 */
export function toMatrixCell(
  permission: PermissionRow,
  {
    superadmin,
    inBaseline,
    override,
  }: {
    superadmin: boolean;
    inBaseline: boolean;
    override: PermissionEffect | undefined;
  },
): PermissionMatrixCell {
  const entity = toPermissionEntity(permission);

  if (superadmin) {
    return { ...entity, granted: true, source: 'SUPERADMIN' };
  }

  if (override === PermissionEffect.GRANT) {
    // An override that agrees with the baseline is never stored, so reaching
    // here means the role does not grant it — this really is an exception.
    return { ...entity, granted: true, source: 'OVERRIDE_GRANT' };
  }

  if (override === PermissionEffect.REVOKE) {
    return { ...entity, granted: false, source: 'OVERRIDE_REVOKE' };
  }

  return inBaseline
    ? { ...entity, granted: true, source: 'ROLE' }
    : { ...entity, granted: false, source: 'NONE' };
}

/** Maps a resolution onto the payload `GET /users/:id/permissions` returns. */
export function toUserPermissionMatrixEntity(
  resolution: EffectiveResolution,
): UserPermissionMatrixEntity {
  const resources = new Map<PermissionResource, PermissionMatrixCell[]>();

  for (const cell of resolution.permissions) {
    const group = resources.get(cell.resource) ?? [];
    group.push(cell);
    resources.set(cell.resource, group);
  }

  return {
    userId: resolution.userId,
    role: resolution.role,
    readOnly: resolution.readOnly,
    grantedCount: resolution.permissions.filter((cell) => cell.granted).length,
    totalCount: resolution.permissions.length,
    resources: [...resources].map(([resource, permissions]) => ({
      resource,
      permissions,
    })),
  };
}

/** Maps a resolution onto the payload `GET /permissions/me/effective` returns. */
export function toEffectivePermissionsEntity(
  resolution: EffectiveResolution,
): EffectivePermissionsEntity {
  const permissions = resolution.permissions
    .filter((cell) => cell.granted)
    .map((cell) => cell.key);

  return {
    userId: resolution.userId,
    role: resolution.role,
    readOnly: resolution.readOnly,
    permissions,
    total: permissions.length,
  };
}

/**
 * The `(resource, action)` pair a cell renders at, as one string.
 *
 * Not used by the mappers above — it is here because a client that has flattened
 * the matrix still has to address a cell, and the answer must be `key` rather
 * than a pair reassembled at each call site. Exported so the tests assert
 * against the same construction the seed uses.
 */
export function permissionKey(
  resource: PermissionResource,
  action: PermissionAction,
): string {
  return `${resource}.${action}`;
}
