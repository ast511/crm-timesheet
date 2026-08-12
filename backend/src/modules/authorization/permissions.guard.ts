import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';

import { ERROR_CODES } from '../../common/constants/error-codes.constants';
import {
  AuthenticatedRequest,
  CurrentUser,
  resolveCurrentUser,
} from '../../common/decorators/current-user.decorator';
import { codedError } from '../../common/errors/coded-error';
import { toEffectivePermissionsEntity } from '../permission-management/entities/user-permission-matrix.entity';
import { PermissionService } from '../permission-management/permission.service';
import {
  isSatisfiedBy,
  PermissionRequirement,
  readPermissionRequirement,
} from './decorators/require-permission.decorator';

/**
 * Where a request's resolved permission set is parked for the rest of the
 * request.
 *
 * A `symbol` rather than a string property, so it cannot collide with anything
 * Express, a body parser or another middleware puts on the request object, and
 * so it is invisible to anything that enumerates the request's keys.
 */
const RESOLVED_PERMISSIONS = Symbol('authorization:effectivePermissions');

/** A request the guard may have already resolved a permission set on. */
interface MemoizedRequest extends AuthenticatedRequest {
  [RESOLVED_PERMISSIONS]?: ReadonlySet<string>;
}

/**
 * The guard that turns Feature 029's resolved permission set into a refusal.
 *
 * Registered as the third `APP_GUARD` in `app.module.ts`, **after**
 * `JwtAuthGuard`, and the ordering is not a detail: Nest runs global guards in
 * the order they are declared, this one reads `request.user`, and nothing puts
 * a user there until authentication has run. Reversed, every gated route would
 * answer `403` to a perfectly good token — and, far worse, the `401` and the
 * `403` would swap meanings, so a client could not tell "sign in again" from
 * "ask an administrator". The three guards run:
 *
 * ```text
 *   ApiThrottlerGuard   how often may anybody ask        (034)
 *   JwtAuthGuard        who is asking                    (032)  → 401
 *   PermissionsGuard    may they ask this                (035)  → 403
 * ```
 *
 * ## Only declared routes are gated
 *
 * A route with no `@RequirePermission()` is allowed through untouched, which is
 * the opposite of the posture `JwtAuthGuard` takes — and the difference is
 * deliberate rather than an inconsistency. Authentication has one universal
 * answer ("a caller must be known"), so its default is "protected" and
 * `@Public()` is the exemption. Authorization has no universal answer: *which*
 * permission a route requires is a decision per route, and there is no
 * conservative default to fall back on. "Deny everything undeclared" would have
 * locked thirty tested modules out of their own endpoints the moment this guard
 * was registered; "require some invented key" would have invented policy.
 *
 * So this feature ships the mechanism globally and applies it to a chosen set of
 * routes — permission management, reporting, and the two timesheet review
 * actions. Everything else keeps the domain and role checks it already has, and
 * is migrated a module at a time as each is touched, exactly the way Feature 033
 * rolled error codes out rather than sweeping thirty modules at once. What makes
 * that safe rather than lax is that no route is *less* protected than it was:
 * this guard only ever adds a refusal.
 *
 * ## Resolution is 029's, and only 029's
 *
 * The permission set comes from `PermissionService.resolveEffective`, injected.
 * Nothing here reads `role_permissions`, `user_permission_overrides` or the
 * catalog, and nothing here special-cases `SUPERADMIN` — a super-admin passes a
 * gated route because that method's own branch hands back every catalog
 * permission, not because this guard knows anything about the role. That is the
 * whole point of the seam: an effective set computed in two places is two
 * answers to one question, and the day they disagreed the screen would offer
 * what the guard refuses, or the guard would allow what the matrix says was
 * revoked.
 *
 * ## Underneath it, the domain rules stay
 *
 * The gate is coarse by construction: it answers "may this account approve
 * timesheets", never "may it approve *this* one". `POST /timesheets/:id/approve`
 * therefore has both layers — `TIMESHEET.APPROVE` here, and
 * `assertAdministrative`, `assertAdminVisible` and `assertStatusIs` in
 * `TimesheetService` — and neither replaces the other. A caller holding the
 * permission still cannot approve a `DRAFT`, and the `409` they get for trying
 * is about the timesheet rather than about them.
 */
@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly permissions: PermissionService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const requirement = readPermissionRequirement(this.reflector, context);

    // The ordinary case, and the cheap one: no declaration, no database read.
    // Every route in the application that this feature did not gate takes this
    // branch, so registering the guard globally costs an un-gated request one
    // `Reflector` lookup.
    if (requirement === undefined) {
      return true;
    }

    // A global guard is applied to WebSocket message handlers too, where there
    // is no HTTP request to read a user from — the same pass-through
    // `JwtAuthGuard` and `ApiThrottlerGuard` both make, for the same reason. It
    // is unreachable in practice rather than a hole: `@RequirePermission()` is
    // declared on controllers, and the one gateway in this application carries
    // none. A message handler that wanted one would need the socket's identity
    // resolved here, which is a different mechanism and a later decision.
    if (context.getType() !== 'http') {
      return true;
    }

    const request = context.switchToHttp().getRequest<MemoizedRequest>();
    // Throws the standard `401` when nothing authenticated this request. It is
    // the same function `@CurrentUser()` uses, so a gated route without a
    // caller fails the way an un-gated one would rather than inventing a second
    // sort of refusal — and `PublicRouteValidator` makes sure the only wiring
    // that could reach it never boots.
    const user = resolveCurrentUser(request);

    if (isSatisfiedBy(requirement, await this.resolveOnce(request, user))) {
      return true;
    }

    throw new ForbiddenException(
      codedError(
        ERROR_CODES.AUTHORIZATION_PERMISSION_DENIED,
        describeRequirement(requirement),
        {
          requiredPermissions: requirement.keys.join(REQUIREMENT_SEPARATOR),
          mode: requirement.mode,
        },
      ),
    );
  }

  /**
   * The caller's granted keys, resolved once per request.
   *
   * **Memoized on the request, and nowhere else.** `resolveEffective` reads the
   * catalog plus two tables, and a request that passes through two checks would
   * otherwise pay for both — which is not hypothetical, since a controller-level
   * `@RequirePermission()` and a stricter one on a handler are both legitimate
   * placements. The memo lives and dies with the request object, so it cannot
   * outlive the transaction that a permission change happens in.
   *
   * **There is deliberately no cross-request cache.** It is the obvious next
   * optimisation and it is the one with a security cost: a permission revoked
   * through the 029 screen would keep working until the cache expired, which
   * turns "take this access away" into "take this access away in a few minutes"
   * — precisely the situation an administrator is racing when they revoke
   * something. Feature 032 made the same call for the account lookup, resolving
   * the user from the database on every request so a deactivation takes effect
   * immediately rather than at token expiry, and this follows it. Correctness
   * now; a cache with an explicit invalidation path is recorded as a future
   * improvement.
   *
   * The granted keys are taken through `toEffectivePermissionsEntity` — the
   * same mapper `GET /permissions/me/effective` answers with — rather than by
   * filtering the cells here. The endpoint the frontend hides buttons on and the
   * guard that refuses the request therefore reduce one resolution the same way,
   * which is what makes the soft gating and the hard gating incapable of
   * disagreeing.
   */
  private async resolveOnce(
    request: MemoizedRequest,
    user: CurrentUser,
  ): Promise<ReadonlySet<string>> {
    const memoized = request[RESOLVED_PERMISSIONS];

    if (memoized !== undefined) {
      return memoized;
    }

    const { permissions } = toEffectivePermissionsEntity(
      await this.permissions.resolveEffective(user.userId, user.role),
    );
    const held = new Set(permissions);

    request[RESOLVED_PERMISSIONS] = held;

    return held;
  }
}

/** How several required keys are joined, in a message and in `params` alike. */
const REQUIREMENT_SEPARATOR = ', ';

/**
 * The English sentence beside the code.
 *
 * It names the missing requirement rather than the caller's holdings, which is
 * the line this feature draws around what a refusal may say: the requirement is
 * the route's own and is documented anyway, while the caller's effective set
 * would turn every `403` into a probe for what the account *can* still reach.
 *
 * Exported so the tests assert against the sentence the guard actually builds
 * rather than a copy of it.
 */
export function describeRequirement({
  keys,
  mode,
}: PermissionRequirement): string {
  const [only] = keys;

  if (keys.length === 1) {
    return `This action requires the ${String(only)} permission`;
  }

  return `This action requires ${mode === 'ALL' ? 'all' : 'any'} of the following permissions: ${keys.join(REQUIREMENT_SEPARATOR)}`;
}
