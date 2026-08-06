import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import {
  CURRENT_USER_HEADER,
  CurrentUser,
} from '../../common/decorators/current-user.decorator';
import { SortOrder } from '../../common/enums/sort-order.enum';
import { PaginatedResult } from '../../common/interfaces/pagination.interface';
import {
  buildPaginatedResult,
  toSkipTake,
} from '../../common/utils/pagination.util';
import type { Prisma } from '../../generated/prisma/client';
import {
  PermissionAuditAction,
  PermissionEffect,
  UserRole,
} from '../../generated/prisma/enums';
import { PrismaService } from '../../prisma/prisma.service';
import { UserService } from '../users/user.service';
import { ApplyPresetDto } from './dto/apply-preset.dto';
import { PermissionHistoryQueryDto } from './dto/permission-history-query.dto';
import { SetUserPermissionsDto } from './dto/set-user-permissions.dto';
import {
  AUDIT_LOG_SELECT,
  PermissionAuditLogEntity,
  toPermissionAuditLogEntity,
} from './entities/permission-audit-log.entity';
import {
  UserPermissionMatrixEntity,
  toUserPermissionMatrixEntity,
} from './entities/user-permission-matrix.entity';
import {
  assertKnownPermissionKeys,
  assertNotSuperadmin,
} from './permission-management.rules';
import { PermissionService } from './permission.service';

/** The account a write is about: who they are, and which role they hold. */
interface TargetUser {
  readonly id: string;
  readonly role: UserRole;
}

/**
 * The summary row a bulk operation writes beside its per-permission rows, or
 * `null` for `PUT`, which is not one.
 */
interface AuditSummary {
  readonly action: PermissionAuditAction;
  readonly presetId: string | null;
}

/** One override the diff decided to write, update or drop. */
interface OverrideChange {
  readonly permissionId: string;
  readonly previousEffect: PermissionEffect | null;
  readonly newEffect: PermissionEffect | null;
}

/** A change that leaves a row behind — an override created or flipped. */
type WrittenOverride = OverrideChange & {
  readonly newEffect: PermissionEffect;
};

/**
 * Everything that changes a user's permissions, and the audit trail that records
 * it.
 *
 * The other half of `PermissionService`: that one answers questions, this one
 * changes things. Four decisions shape the whole file.
 *
 * 1. **Only the deviation from the role baseline is stored.** Every write ends
 *    in {@link applyIntendedSet}, which is handed the set the caller *intends*
 *    the user to hold and works out where that departs from what the role gives.
 *    A `GRANT` of something the role already grants is dropped rather than
 *    written: it states a fact the baseline already states, and the two copies
 *    would disagree the moment the baseline changed. This is what makes "reset to
 *    role" equal to "delete this user's overrides".
 * 2. **The audit rows share the transaction with the overrides they describe.**
 *    Never written afterwards, never in a second call: a history written
 *    separately is a second statement about one event, and the run where the
 *    second statement failed would leave a permission granted with nothing
 *    recording who granted it — the one question an audit trail exists to answer.
 * 3. **A write that changes nothing writes nothing.** The diff is computed
 *    before the transaction is opened, and an empty diff with no summary skips it
 *    entirely. That is what makes `PUT` idempotent in the way the verb promises:
 *    the same body twice leaves the same overrides *and* the same history.
 * 4. **A super-admin target is refused, on all three write endpoints.** Their
 *    permissions are resolved rather than stored, so a write would persist an
 *    exception that silently did nothing — and would let the screen show the last
 *    administrator being locked out. See `assertNotSuperadmin`.
 *
 * **Nothing here enforces a permission.** It stores who may do what; whether a
 * request is allowed to proceed is Permission Enforcement, a later feature that
 * needs authentication first. `changedByUserId` comes from `@CurrentUser()` on
 * every path and is never hardcoded — it is a claimed identity today, and a
 * verified one the day the header becomes a token, with nothing in this file
 * changing.
 */
@Injectable()
export class UserPermissionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly permissions: PermissionService,
    private readonly users: UserService,
  ) {}

  /**
   * One user's matrix: every catalog permission, resolved, with the reason for
   * each.
   *
   * A super-admin target comes back with every permission granted, sourced
   * `SUPERADMIN` and marked `readOnly` — the crown state the screen renders, and
   * the same answer the three write endpoints refuse to change.
   */
  async findMatrix(userId: string): Promise<UserPermissionMatrixEntity> {
    const target = await this.findTargetOrThrow(userId);

    return this.buildMatrix(target);
  }

  /**
   * Replaces the user's overrides so their effective set equals the submitted
   * one.
   *
   * The body states the **intended matrix** rather than the deviations, which is
   * what lets the server — the only party that owns the role baseline — do the
   * normalisation. Every key is checked against the catalog first, so a body with
   * three unknown keys is told about all three at once rather than one per round
   * trip.
   *
   * Returns the resulting matrix, so a screen renders what it actually achieved
   * rather than what it asked for. The two differ whenever a submitted key
   * duplicated the baseline — which is precisely the case a client cannot work
   * out for itself.
   */
  async replace(
    userId: string,
    caller: CurrentUser,
    dto: SetUserPermissionsDto,
  ): Promise<UserPermissionMatrixEntity> {
    const target = await this.findTargetOrThrow(userId);
    assertNotSuperadmin(target.id, target.role);
    await this.assertCallerExists(caller);

    const catalog = await this.permissions.findCatalogRows();
    const idsByKey = new Map(catalog.map(({ key, id }) => [key, id]));

    assertKnownPermissionKeys(dto.permissionKeys, new Set(idsByKey.keys()));

    // Every key has just been confirmed to be in the map, so nothing is dropped
    // here. The narrowing filter is written rather than a non-null assertion
    // because an assertion would turn the one case this cannot happen in into
    // an `undefined` inside the intended set — and a bad id there would be a
    // permission silently missing rather than a request refused.
    const intended = new Set(
      dto.permissionKeys
        .map((key) => idsByKey.get(key))
        .filter((id): id is string => id !== undefined),
    );

    await this.applyIntendedSet(target, caller.userId, intended, null);

    return this.buildMatrix(target);
  }

  /**
   * Applies a preset: the user's overrides are replaced so their effective set
   * equals the preset's.
   *
   * A **replace, not a merge**. Applying "HR - View Only" to somebody who had
   * been given three extra permissions removes those three, because otherwise
   * "what does this preset give somebody" would have as many answers as there are
   * people it is applied to.
   *
   * `targetRole` is not checked against the user's role. It groups the cards on
   * the screen; applying an HR preset to a `USER` account is a real thing an
   * administrator does — it is how somebody gets HR access without an HR role —
   * and refusing it would send them to toggle thirty-five cells by hand.
   *
   * Two kinds of audit row come out of this, in one transaction: a
   * `PRESET_APPLIED` summary naming the preset, and the per-permission
   * transitions underneath it. The summary is written **even when the diff is
   * empty**, unlike `PUT`: applying a preset is an act somebody performed, and a
   * history that omitted it would leave an administrator wondering whether the
   * click had registered. `PUT` is a declaration of state, so a `PUT` that
   * changes nothing is nothing.
   */
  async applyPreset(
    userId: string,
    caller: CurrentUser,
    dto: ApplyPresetDto,
  ): Promise<UserPermissionMatrixEntity> {
    const target = await this.findTargetOrThrow(userId);
    assertNotSuperadmin(target.id, target.role);
    await this.assertCallerExists(caller);

    const preset = await this.findPresetOrThrow(dto.presetKey);
    const intended = new Set(
      preset.items.map(({ permissionId }) => permissionId),
    );

    await this.applyIntendedSet(target, caller.userId, intended, {
      action: PermissionAuditAction.PRESET_APPLIED,
      presetId: preset.id,
    });

    return this.buildMatrix(target);
  }

  /**
   * Clears every exception, so the user holds exactly what their role gives.
   *
   * Expressed as "intend the baseline" rather than as a bare
   * `deleteMany({ where: { userId } })`, and the indirection earns two things:
   * the deletion goes through the same normalisation as every other write — an
   * override matching the baseline is never kept — and the per-permission
   * `OVERRIDE_CLEARED` rows come out of the same diff that produces them
   * everywhere else, so the history reads identically however the exceptions went
   * away.
   *
   * The `RESET_TO_ROLE` summary is written even for a user who had no exceptions,
   * for the reason `PRESET_APPLIED` is: it records an act, not a change.
   */
  async resetToRole(
    userId: string,
    caller: CurrentUser,
  ): Promise<UserPermissionMatrixEntity> {
    const target = await this.findTargetOrThrow(userId);
    assertNotSuperadmin(target.id, target.role);
    await this.assertCallerExists(caller);

    const baseline = await this.permissions.findBaselinePermissionIds(
      target.role,
    );

    await this.applyIntendedSet(target, caller.userId, baseline, {
      action: PermissionAuditAction.RESET_TO_ROLE,
      presetId: null,
    });

    return this.buildMatrix(target);
  }

  /**
   * One page of the user's history, newest first.
   *
   * The rows and the total are read in a single `$transaction` so both see the
   * same snapshot — the pattern every list in this API uses. The `WHERE
   * target_user_id = … ORDER BY created_at DESC` is exactly the composite index
   * created for it, so the filter and the sort are one scan.
   *
   * A user who does not exist is a `404` rather than an empty page: an empty
   * history is a real state — most accounts have one — so returning it for a
   * mistyped id would report "nobody has ever changed this person's permissions"
   * about a person who is not there.
   */
  async findHistory(
    userId: string,
    query: PermissionHistoryQueryDto,
  ): Promise<PaginatedResult<PermissionAuditLogEntity>> {
    await this.findTargetOrThrow(userId);

    const where: Prisma.PermissionAuditLogWhereInput = {
      targetUserId: userId,
      ...(query.action === undefined ? {} : { action: query.action }),
    };

    const [entries, total] = await this.prisma.$transaction([
      this.prisma.permissionAuditLog.findMany({
        where,
        orderBy: [{ [query.sortBy]: query.sortOrder }, { id: SortOrder.ASC }],
        select: AUDIT_LOG_SELECT,
        ...toSkipTake(query),
      }),
      this.prisma.permissionAuditLog.count({ where }),
    ]);

    return buildPaginatedResult(
      entries.map(toPermissionAuditLogEntity),
      total,
      query,
    );
  }

  /**
   * **The one write path.** Normalises an intended permission set against the
   * role baseline, persists only the genuine deviations, and records what moved
   * — all in one transaction.
   *
   * The normalisation is four lines of set arithmetic and is the whole feature:
   *
   * ```text
   *   p ∈ baseline, p ∉ intended  →  REVOKE
   *   p ∉ baseline, p ∈ intended  →  GRANT
   *   otherwise                   →  no override at all
   * ```
   *
   * Only permissions in `baseline ∪ intended ∪ stored` can be affected: a
   * permission in none of the three has no override now and should have none
   * after, so iterating the whole catalog would compute "no change" fifty-five
   * times to find the two that moved.
   *
   * The diff is turned into three statements — one `deleteMany`, one
   * `createMany`, and one `update` per flipped effect — rather than into
   * "delete everything for this user, then insert the new set". The wholesale
   * rewrite is what `NotificationCampaignService` does for a campaign's
   * recipients and would be simpler, but it is wrong here for a reason that is
   * not about efficiency: an override carries `createdAt` and `updatedAt`, so
   * rewriting an unchanged exception would restate its age as today and quietly
   * erase "this person has had this access since March".
   *
   * Nothing is written when the diff is empty and there is no summary row. That
   * is what makes `PUT` idempotent all the way down to the history.
   */
  private async applyIntendedSet(
    target: TargetUser,
    changedByUserId: string,
    intended: ReadonlySet<string>,
    summary: AuditSummary | null,
  ): Promise<void> {
    const [baseline, stored] = await Promise.all([
      this.permissions.findBaselinePermissionIds(target.role),
      this.permissions.findOverrideEffects(target.id),
    ]);

    const changes = diffOverrides(baseline, intended, stored);

    if (changes.length === 0 && summary === null) {
      return;
    }

    const removed = changes
      .filter((change) => change.newEffect === null)
      .map((change) => change.permissionId);
    // Narrowed rather than merely filtered, so `newEffect` is a
    // `PermissionEffect` below and neither write needs a fallback value that
    // could quietly grant something.
    const written = changes.filter(
      (change): change is WrittenOverride => change.newEffect !== null,
    );
    const created = written.filter((change) => change.previousEffect === null);
    const flipped = written.filter((change) => change.previousEffect !== null);

    await this.prisma.$transaction(async (tx) => {
      if (removed.length > 0) {
        await tx.userPermissionOverride.deleteMany({
          where: { userId: target.id, permissionId: { in: removed } },
        });
      }

      if (created.length > 0) {
        await tx.userPermissionOverride.createMany({
          data: created.map((change) => ({
            userId: target.id,
            permissionId: change.permissionId,
            effect: change.newEffect,
          })),
        });
      }

      for (const change of flipped) {
        await tx.userPermissionOverride.update({
          where: {
            userId_permissionId: {
              userId: target.id,
              permissionId: change.permissionId,
            },
          },
          data: { effect: change.newEffect },
        });
      }

      await tx.permissionAuditLog.createMany({
        data: [
          ...(summary === null
            ? []
            : [
                {
                  targetUserId: target.id,
                  changedByUserId,
                  permissionId: null,
                  action: summary.action,
                  previousEffect: null,
                  newEffect: null,
                  presetId: summary.presetId,
                },
              ]),
          ...changes.map((change) => ({
            targetUserId: target.id,
            changedByUserId,
            permissionId: change.permissionId,
            action: describeChange(change.newEffect),
            previousEffect: change.previousEffect,
            newEffect: change.newEffect,
            presetId: null,
          })),
        ],
      });
    });
  }

  /** The matrix as it now stands, without re-reading a role already in hand. */
  private async buildMatrix(
    target: TargetUser,
  ): Promise<UserPermissionMatrixEntity> {
    return toUserPermissionMatrixEntity(
      await this.permissions.resolveEffective(target.id, target.role),
    );
  }

  /**
   * The account being configured, or a `404`.
   *
   * The role is read through `UserService` rather than by querying `users` here,
   * which is the rule every module in this project follows: the module that owns
   * a table is the only one that reads it. An id matching no row yields the same
   * `404` as one that never existed — the same call every module here makes.
   */
  private async findTargetOrThrow(userId: string): Promise<TargetUser> {
    const role = await this.users.findRole(userId);

    if (role === null) {
      throw new NotFoundException(`User ${userId} was not found`);
    }

    return { id: userId, role };
  }

  /**
   * Confirms the account credited with the change is real.
   *
   * A `400` naming the header rather than a `404`, and the difference matters on
   * these routes: a `404` on `PUT /users/:id/permissions` would be
   * indistinguishable from "no such user", sending the caller to look at the
   * wrong id entirely. The same call
   * `NotificationCampaignService.assertAuthorExists` makes.
   *
   * Without it, `permission_audit_logs.changed_by_user_id` — a `RESTRICT`ed
   * foreign key — would refuse the insert as a driver error surfacing as a
   * `500`, at the end of a transaction that had already computed the diff.
   */
  private async assertCallerExists(caller: CurrentUser): Promise<void> {
    if ((await this.users.findRole(caller.userId)) === null) {
      throw new BadRequestException([
        `${CURRENT_USER_HEADER} names user ${caller.userId}, who does not exist`,
      ]);
    }
  }

  /**
   * The preset and its items, or a `404` naming the key.
   *
   * A `404` rather than a `400`, unlike an unknown permission key in a `PUT`
   * body, and the two are genuinely different mistakes: a `PUT` names permissions
   * *inside* a matrix it is submitting, so an unknown one is a malformed body,
   * while `apply-preset` addresses one preset as the object of the request — and
   * an object that is not there is an absent resource.
   */
  private async findPresetOrThrow(presetKey: string) {
    const preset = await this.prisma.permissionPreset.findUnique({
      where: { key: presetKey },
      select: { id: true, items: { select: { permissionId: true } } },
    });

    if (preset === null) {
      throw new NotFoundException(
        `Permission preset "${presetKey}" was not found`,
      );
    }

    return preset;
  }
}

/**
 * Works out which override rows an intended permission set implies, and how each
 * differs from what is stored.
 *
 * Returns only what actually **changes**: a permission whose intended override
 * equals its stored one produces nothing, which is what keeps a repeated `PUT`
 * from writing a second batch of history.
 *
 * The candidate set is `baseline ∪ intended ∪ stored`. The first two produce the
 * intended overrides; the third is there so an exception that is no longer
 * implied by either gets cleared rather than left behind — the case that turns
 * "revoke, then grant again" into two rows in the history and none in the table.
 */
function diffOverrides(
  baseline: ReadonlySet<string>,
  intended: ReadonlySet<string>,
  stored: ReadonlyMap<string, PermissionEffect>,
): OverrideChange[] {
  const candidates = new Set([...baseline, ...intended, ...stored.keys()]);
  const changes: OverrideChange[] = [];

  for (const permissionId of candidates) {
    const newEffect = intendedEffect(
      baseline.has(permissionId),
      intended.has(permissionId),
    );
    const previousEffect = stored.get(permissionId) ?? null;

    if (previousEffect !== newEffect) {
      changes.push({ permissionId, previousEffect, newEffect });
    }
  }

  return changes;
}

/**
 * The override one permission needs, or `null` when it needs none.
 *
 * **The rule the whole storage decision rests on**, in three lines. An override
 * is written only where the intention and the baseline disagree; where they
 * agree there is nothing to record, because the baseline already records it. A
 * `GRANT` stored beside a baseline that already grants would be a second copy of
 * one fact, and the copy is what would keep granting after the baseline stopped.
 */
function intendedEffect(
  inBaseline: boolean,
  isIntended: boolean,
): PermissionEffect | null {
  if (inBaseline && !isIntended) {
    return PermissionEffect.REVOKE;
  }

  if (!inBaseline && isIntended) {
    return PermissionEffect.GRANT;
  }

  return null;
}

/**
 * Which audit action a transition is named by, read off where it ends.
 *
 * The end state rather than the pair, because that is what a person reading the
 * history is looking for: "granted", "revoked", or "back to whatever the role
 * says". The pair is published beside it as `previousEffect` and `newEffect` for
 * anybody who needs the arrow.
 */
function describeChange(
  newEffect: PermissionEffect | null,
): PermissionAuditAction {
  if (newEffect === PermissionEffect.GRANT) {
    return PermissionAuditAction.PERMISSION_GRANTED;
  }

  return newEffect === PermissionEffect.REVOKE
    ? PermissionAuditAction.PERMISSION_REVOKED
    : PermissionAuditAction.OVERRIDE_CLEARED;
}
