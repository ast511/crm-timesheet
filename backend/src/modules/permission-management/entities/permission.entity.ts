import { toIsoTimestamp } from '../../../common/utils/date.util';
import type { Prisma } from '../../../generated/prisma/client';
import type {
  PermissionAction,
  PermissionResource,
} from '../../../generated/prisma/enums';
import type { PermissionModel } from '../../../generated/prisma/models';

/**
 * One catalog permission as every endpoint exposes it.
 *
 * Every column is published. There is nothing internal on this table: it is
 * seeded vocabulary, and the screen that renders the matrix needs the key to
 * address a cell, the two enums to place it, and the label and description to
 * draw it. The only difference from the row is that the dates are ISO-8601
 * strings, which is what the client actually receives once the body is
 * serialised.
 *
 * The timestamps are published although nothing renders them, because they are
 * the honest answer to "when did this permission enter the catalog" — and with a
 * seeded vocabulary that grows one migration at a time, that is a question an
 * administrator wondering why a cell is new will actually ask.
 */
export class PermissionEntity {
  id!: string;
  /** `RESOURCE.ACTION` — the name a body, an audit line and a future guard quote. */
  key!: string;
  resource!: PermissionResource;
  action!: PermissionAction;
  /** What the cell says on the matrix. Seeded per pair, never derived. */
  label!: string;
  description!: string | null;
  createdAt!: string;
  updatedAt!: string;
}

/**
 * The catalog as `GET /permissions` returns it: one entry per resource, each
 * carrying the actions that resource offers.
 *
 * **Grouping is a view of the page, not a page of groups**, and the distinction
 * is worth stating because the pagination metadata beside it describes
 * *permissions*. `page` and `limit` select permission rows — that is the unit the
 * `$transaction([findMany, count])` counts, and the only unit for which `total`
 * can be honest — and this shape then blocks the page by resource so the matrix
 * renders without a client-side reduce.
 *
 * The consequence, stated rather than hidden: a resource whose actions straddle
 * a page boundary appears on both pages, each time carrying the actions that
 * page holds. In practice no client meets it — the catalog is fifty-five rows and
 * `MAX_PAGE_SIZE` is 100, so `?limit=100` returns the whole matrix in one
 * request, which is what the screen asks for. The alternative, paginating over
 * resources, would have made `total` count twelve while `limit` counted
 * permissions, and no client could then have told how much of the catalog it had.
 */
export class PermissionResourceGroupEntity {
  resource!: PermissionResource;
  /** The permissions of this resource **on the current page**, in page order. */
  permissions!: PermissionEntity[];
}

/**
 * The columns every read of this table selects.
 *
 * A `select` rather than an `include`, so a column added to `permissions` later
 * is published deliberately rather than by default. `satisfies
 * Prisma.PermissionSelect` checks the keys against the model without widening
 * the constant, so a column renamed in `schema.prisma` breaks the build here
 * instead of at runtime.
 */
export const PERMISSION_PUBLIC_SELECT = {
  id: true,
  key: true,
  resource: true,
  action: true,
  label: true,
  description: true,
  createdAt: true,
  updatedAt: true,
} as const satisfies Prisma.PermissionSelect;

/**
 * A row read through {@link PERMISSION_PUBLIC_SELECT}.
 *
 * Spelled as a `Pick` of the model rather than as a free-standing interface, so
 * a `select` left off a query produces a row the mapper will not accept — the
 * same compile-time trip-wire every module here uses.
 */
export type PermissionRow = Pick<
  PermissionModel,
  keyof typeof PERMISSION_PUBLIC_SELECT
>;

/** Maps a row onto the resource every endpoint returns. */
export function toPermissionEntity(
  permission: PermissionRow,
): PermissionEntity {
  return {
    id: permission.id,
    key: permission.key,
    resource: permission.resource,
    action: permission.action,
    label: permission.label,
    description: permission.description,
    createdAt: toIsoTimestamp(permission.createdAt),
    updatedAt: toIsoTimestamp(permission.updatedAt),
  };
}

/**
 * Blocks an ordered page of permissions by resource, preserving the page order.
 *
 * Encounter order rather than the enum's declaration order, and that is the point
 * of doing it here instead of sorting groups afterwards: the caller has already
 * ordered the rows by whatever `?sortBy=` asked for, and re-imposing a resource
 * order on the groups would silently discard half of `?sortBy=key&sortOrder=desc`.
 * A `Map` keeps insertion order, so the first resource to appear in the page is
 * the first group out.
 */
export function toPermissionResourceGroups(
  permissions: readonly PermissionRow[],
): PermissionResourceGroupEntity[] {
  const groups = new Map<PermissionResource, PermissionEntity[]>();

  for (const permission of permissions) {
    const group = groups.get(permission.resource) ?? [];
    group.push(toPermissionEntity(permission));
    groups.set(permission.resource, group);
  }

  return [...groups].map(([resource, group]) => ({
    resource,
    permissions: group,
  }));
}
