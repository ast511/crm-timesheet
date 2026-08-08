import { Injectable } from '@nestjs/common';

import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { SortOrder } from '../../common/enums/sort-order.enum';
import { PaginatedResult } from '../../common/interfaces/pagination.interface';
import {
  buildPaginatedResult,
  toSkipTake,
} from '../../common/utils/pagination.util';
import type { Prisma } from '../../generated/prisma/client';
import { PermissionEffect, UserRole } from '../../generated/prisma/enums';
import { PrismaService } from '../../prisma/prisma.service';
import { PermissionQueryDto } from './dto/permission-query.dto';
import { PresetQueryDto } from './dto/preset-query.dto';
import {
  PermissionPresetEntity,
  PRESET_LIST_SELECT,
  toPermissionPresetEntity,
} from './entities/permission-preset.entity';
import {
  PERMISSION_PUBLIC_SELECT,
  PermissionResourceGroupEntity,
  PermissionRow,
  toPermissionResourceGroups,
} from './entities/permission.entity';
import {
  EffectivePermissionsEntity,
  EffectiveResolution,
  toEffectivePermissionsEntity,
  toMatrixCell,
} from './entities/user-permission-matrix.entity';
import {
  DEFAULT_PERMISSION_SORT_FIELD,
  PERMISSION_SECONDARY_SORT_FIELD,
  PermissionSortField,
  PRESET_ORDER_FIELDS,
} from './permission-management.constants';

/** Makes PostgreSQL fold the case of both operands, so `create` finds `CREATE`. */
const CASE_INSENSITIVE = { mode: 'insensitive' } as const;

/**
 * The read-only half of permission management: the catalog, the presets, and the
 * one method that works out what somebody may actually do.
 *
 * The split from `UserPermissionService` is deliberate and is the same one this
 * project draws everywhere: **this service answers questions, that one changes
 * things.** Nothing here writes a row — there is no `create`, no `update` and no
 * `remove`, because the catalog and the presets are *seeded vocabulary* rather
 * than data somebody maintains through an API. A permission row is meaningless
 * unless something in the application checks it, so inventing one at runtime
 * would put a cell on the matrix screen that nothing anywhere reads.
 *
 * **Nothing here enforces anything either.** {@link resolveEffective} computes a
 * permission set; it blocks no request, guards no route and is imported by no
 * interceptor. That was written when it could not be otherwise — an access check
 * over a forgeable header reads as protection while providing none — and
 * Feature 032 removed the obstacle: the caller is now an account behind a
 * validated access token rather than a claim. Enforcement is the authorization
 * enforcement feature, which calls this method from a guard.
 * `GET /permissions/me/effective` still exists
 * so a client can *hide* what it should not offer, which is a courtesy rather
 * than a control, and remains one after the guard lands.
 *
 * There is no repository, for the reason `ReminderService` has none: the queries
 * here share no predicate, so a layer between this and Prisma would be a file
 * that forwarded arguments.
 */
@Injectable()
export class PermissionService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * One page of the catalog, narrowed by `search`, `resource` and `action`, and
   * blocked by resource for rendering.
   *
   * The rows and the total are read in a single `$transaction` so both see the
   * same snapshot — the pattern every list in this API uses. The unit of both is
   * the **permission**: `page` and `limit` select permission rows and `total`
   * counts them, and the grouping is applied to the page afterwards. See
   * {@link PermissionResourceGroupEntity} for why the grouping is a view of the
   * page rather than a page of groups.
   */
  async findAll(
    query: PermissionQueryDto,
  ): Promise<PaginatedResult<PermissionResourceGroupEntity>> {
    const where = buildWhere(query);

    const [permissions, total] = await this.prisma.$transaction([
      this.prisma.permission.findMany({
        where,
        orderBy: buildCatalogOrderBy(query.sortBy, query.sortOrder),
        select: PERMISSION_PUBLIC_SELECT,
        ...toSkipTake(query),
      }),
      this.prisma.permission.count({ where }),
    ]);

    return buildPaginatedResult(
      toPermissionResourceGroups(permissions),
      total,
      query,
    );
  }

  /**
   * One page of presets, each with the number of permissions it hands out.
   *
   * Ordered by `targetRole` then `name`, and not by anything a client chooses —
   * see `PresetQueryDto` for why a fixed vocabulary of six cards is not offered a
   * sort direction.
   */
  async findPresets(
    query: PresetQueryDto,
  ): Promise<PaginatedResult<PermissionPresetEntity>> {
    const where =
      query.targetRole === undefined
        ? undefined
        : { targetRole: query.targetRole };

    const [presets, total] = await this.prisma.$transaction([
      this.prisma.permissionPreset.findMany({
        where,
        orderBy: buildPresetOrderBy(),
        select: PRESET_LIST_SELECT,
        ...toSkipTake(query),
      }),
      this.prisma.permissionPreset.count({ where }),
    ]);

    return buildPaginatedResult(
      presets.map(toPermissionPresetEntity),
      total,
      query,
    );
  }

  /**
   * What the caller may do, as a flat list of keys.
   *
   * The role comes from `@CurrentUser()` rather than from a lookup of its own,
   * and that was true before Feature 032 and is true after it — which is the
   * point. It used to be a claim in a header, because querying `users` to
   * confirm one unverified claim against another would have bought nothing; it
   * is now read from `users` by `AuthService` on this very request, so it is
   * both authoritative and already in hand. This method did not change.
   */
  async findEffectiveForCaller(
    user: CurrentUser,
  ): Promise<EffectivePermissionsEntity> {
    return toEffectivePermissionsEntity(
      await this.resolveEffective(user.userId, user.role),
    );
  }

  /**
   * **The single source of truth for what one person may do.**
   *
   * ```text
   *   SUPERADMIN → every catalog permission
   *   otherwise  → (role baseline ∪ GRANT overrides) − REVOKE overrides
   * ```
   *
   * Every endpoint that reports an effective set calls this and none computes
   * one of its own — `/permissions/me/effective`, `GET /users/:id/permissions`,
   * and the matrix returned by each of the three write endpoints all come out of
   * here. That is not tidiness: an effective set computed in two places is two
   * answers to one question, and the day they disagree the screen would show a
   * permission the enforcement layer did not grant. When Permission Enforcement
   * is written, its guard calls this method too rather than reimplementing three
   * lines it can see.
   *
   * **The super-admin branch reads nothing.** It does not consult
   * `role_permissions` or `user_permission_overrides`, because a super-admin has
   * rows in neither and never will: the set is a statement about what the role
   * *is* — the account that can always fix the system, including a matrix
   * somebody has locked themselves out of — rather than a configuration somebody
   * made. Seeding it as rows would have made it editable, and the first edit
   * would create a super-admin who could no longer administer. The branch is
   * three lines here instead.
   *
   * The result carries **every** catalog permission, granted or not, with the
   * reason for each. The matrix screen needs the empty boxes as well as the
   * ticked ones, and `/me/effective` reduces this to the granted keys with a
   * `filter`; the long list cannot be derived from the short one.
   *
   * The role is a parameter rather than something this method looks up. Two
   * callers know it already and for different reasons — the caller's own role
   * comes from `@CurrentUser()`, the target's from the users module, which owns
   * that table — so reading it here would add a query to one path and a second
   * source of truth to the other.
   */
  async resolveEffective(
    userId: string,
    role: UserRole,
  ): Promise<EffectiveResolution> {
    const catalog = await this.findCatalogRows();

    if (role === UserRole.SUPERADMIN) {
      return {
        userId,
        role,
        readOnly: true,
        permissions: catalog.map((permission) =>
          toMatrixCell(permission, {
            superadmin: true,
            inBaseline: false,
            override: undefined,
          }),
        ),
      };
    }

    const [baseline, overrides] = await Promise.all([
      this.findBaselinePermissionIds(role),
      this.findOverrideEffects(userId),
    ]);

    return {
      userId,
      role,
      readOnly: false,
      permissions: catalog.map((permission) =>
        toMatrixCell(permission, {
          superadmin: false,
          inBaseline: baseline.has(permission.id),
          override: overrides.get(permission.id),
        }),
      ),
    };
  }

  /**
   * The whole catalog, in matrix order.
   *
   * Unpaginated on purpose: it is the *vocabulary*, fifty-five seeded rows, and
   * every caller of it — the resolution above, and the diff in
   * `UserPermissionService` — needs all of it to be correct. A page of a matrix
   * would resolve the cells it happened to contain.
   *
   * Public because the write service diffs against it. It is read a second time
   * inside {@link resolveEffective} when a write renders its result, and that
   * repetition is deliberate: threading the first read through as an argument
   * would make the one method that must be the single source of truth take its
   * inputs from its caller, which is exactly how a second, subtly different
   * resolution gets written. Two reads of a fifty-five-row seeded table is the
   * price.
   */
  async findCatalogRows(): Promise<PermissionRow[]> {
    return this.prisma.permission.findMany({
      orderBy: buildCatalogOrderBy(
        DEFAULT_PERMISSION_SORT_FIELD,
        SortOrder.ASC,
      ),
      select: PERMISSION_PUBLIC_SELECT,
    });
  }

  /**
   * The permission ids a role grants by default.
   *
   * A `Set`, because every caller asks membership of it once per catalog row —
   * fifty-five lookups against an array would be fifty-five scans.
   *
   * `SUPERADMIN` never reaches here: the resolution branches before it, and this
   * would return an empty set for the role that holds everything. That is why
   * the branch is in {@link resolveEffective} and not in this method — a helper
   * returning "nothing" for "everything" is a trap for the next caller.
   */
  async findBaselinePermissionIds(role: UserRole): Promise<Set<string>> {
    const bindings = await this.prisma.rolePermission.findMany({
      where: { role },
      select: { permissionId: true },
    });

    return new Set(bindings.map(({ permissionId }) => permissionId));
  }

  /**
   * One user's exceptions, as permission id to effect.
   *
   * A `Map` for the reason the baseline is a `Set`, and it holds only the rows
   * that exist: a permission absent from it has no exception, which is what the
   * resolution reads as "whatever the role says".
   */
  async findOverrideEffects(
    userId: string,
  ): Promise<Map<string, PermissionEffect>> {
    const overrides = await this.prisma.userPermissionOverride.findMany({
      where: { userId },
      select: { permissionId: true, effect: true },
    });

    return new Map(
      overrides.map(({ permissionId, effect }) => [permissionId, effect]),
    );
  }
}

/**
 * Builds the `WHERE` for the catalog endpoint.
 *
 * The three parameters are independent and combine with `AND`. Returns
 * `undefined` — not an empty object — when nothing was requested, because
 * `undefined` is what `findMany` and `count` both read as "no filter", and the
 * two must agree or the total would not describe the page.
 */
function buildWhere({
  search,
  resource,
  action,
}: PermissionQueryDto): Prisma.PermissionWhereInput | undefined {
  const filters: Prisma.PermissionWhereInput[] = [];

  if (search !== undefined && search.length > 0) {
    filters.push({
      OR: [
        { key: { contains: search, ...CASE_INSENSITIVE } },
        { label: { contains: search, ...CASE_INSENSITIVE } },
      ],
    });
  }

  if (resource !== undefined) {
    filters.push({ resource });
  }

  if (action !== undefined) {
    filters.push({ action });
  }

  return filters.length === 0 ? undefined : { AND: filters };
}

/**
 * Orders the catalog by the requested column, then by action, then by `id`.
 *
 * Three levels rather than the usual two, because a matrix has two axes. The
 * requested column places the rows; `action` then keeps each resource's cells in
 * the order the screen draws its columns, which a single sort by `resource`
 * would leave to chance and redraw differently on each request. It is skipped
 * when it *is* the requested column, so `?sortBy=action` does not order by
 * action twice.
 *
 * The `id` tie-break is what makes pagination safe: none of the three sortable
 * values is unique — five rows are `CREATE` — so without it a record could
 * repeat on one page and vanish from the next.
 */
function buildCatalogOrderBy(
  sortBy: PermissionSortField,
  sortOrder: SortOrder,
): Prisma.PermissionOrderByWithRelationInput[] {
  const orderBy: Prisma.PermissionOrderByWithRelationInput[] = [
    { [sortBy]: sortOrder },
  ];

  if (sortBy !== PERMISSION_SECONDARY_SORT_FIELD) {
    orderBy.push({ [PERMISSION_SECONDARY_SORT_FIELD]: sortOrder });
  }

  orderBy.push({ id: SortOrder.ASC });

  return orderBy;
}

/**
 * Orders the presets by the group heading, then by name, then by `id`.
 *
 * Built from `PRESET_ORDER_FIELDS` rather than spelled out, so the one place
 * that states the order is the constant a reader goes looking for. Always
 * ascending: `targetRole` sorts by `UserRole`'s declaration order, which puts
 * `ADMIN` before `HR` — the order a person ranks them in.
 */
function buildPresetOrderBy(): Prisma.PermissionPresetOrderByWithRelationInput[] {
  return [
    ...PRESET_ORDER_FIELDS.map((field) => ({ [field]: SortOrder.ASC })),
    { id: SortOrder.ASC },
  ];
}
