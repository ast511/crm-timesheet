import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';

import { ERROR_CODES } from '../../common/constants/error-codes.constants';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { UserRole } from '../../generated/prisma/enums';
import { PermissionMatrixCell } from '../permission-management/entities/user-permission-matrix.entity';
import { PermissionService } from '../permission-management/permission.service';
import {
  isSatisfiedBy,
  PermissionRequirement,
  readPermissionRequirement,
  RequireAnyPermission,
  RequirePermission,
  REQUIRED_PERMISSIONS_KEY,
} from './decorators/require-permission.decorator';
import { describeRequirement, PermissionsGuard } from './permissions.guard';

/**
 * The guard's decisions, without an application around them.
 *
 * The end-to-end story — real routes, real controllers, real status codes — is
 * `routing.spec.ts`. This file is about the three things that are easier to
 * state than to demonstrate through a request: what the guard does with metadata
 * it did not expect, that it reads the permission set through 029's resolver
 * rather than any path of its own, and that it reads it exactly once per
 * request.
 */

const CALLER: CurrentUser = {
  userId: 'usr-1',
  employeeId: 'emp-1',
  role: UserRole.HR,
  administrativeAccess: true,
};

/**
 * A stand-in for the resolution `PermissionService.resolveEffective` returns.
 *
 * It is built the way the real one is — **every** catalog permission, granted or
 * not, each with the reason — rather than as a list of the granted keys. That
 * matters here: the guard reduces it through `toEffectivePermissionsEntity`, the
 * same mapper `/permissions/me/effective` answers with, and a stub that handed
 * back the short list would exercise a shape the resolver never produces.
 */
const resolution = (granted: readonly string[], notGranted: string[] = []) => ({
  userId: CALLER.userId,
  role: CALLER.role,
  readOnly: false,
  permissions: [
    ...granted.map((key) => ({ key, granted: true }) as PermissionMatrixCell),
    ...notGranted.map(
      (key) => ({ key, granted: false }) as PermissionMatrixCell,
    ),
  ],
});

/** An execution context over a request the guard can read and memoize on. */
function contextFor(
  handler: () => unknown,
  request: object = { user: CALLER },
): ExecutionContext {
  return {
    getType: () => 'http',
    getHandler: () => handler,
    getClass: () => class Controller {},
    switchToHttp: () => ({ getRequest: () => request }),
  } as unknown as ExecutionContext;
}

/** A handler carrying whatever the decorator under test wrote on it. */
function gated(...decorate: MethodDecorator[]): () => unknown {
  class Probe {
    handle(): void {
      // The body is irrelevant: only the metadata the decorators write is read.
    }
  }

  for (const decorator of decorate) {
    decorator(
      Probe.prototype,
      'handle',
      Object.getOwnPropertyDescriptor(Probe.prototype, 'handle')!,
    );
  }

  return Probe.prototype.handle;
}

describe('PermissionsGuard', () => {
  const resolveEffective = jest.fn();
  const permissions = { resolveEffective } as unknown as PermissionService;
  const guard = new PermissionsGuard(new Reflector(), permissions);

  beforeEach(() => {
    jest.clearAllMocks();
  });

  /**
   * The branch nearly every request in this application takes.
   *
   * "Undeclared means allowed" is the gating model, and the cheapness is part of
   * it: no user is read and no query is made, so registering the guard globally
   * costs an ungated route one `Reflector` lookup.
   */
  it('allows a route that declares no permission, without resolving anything', async () => {
    await expect(guard.canActivate(contextFor(gated()))).resolves.toBe(true);

    expect(resolveEffective).not.toHaveBeenCalled();
  });

  it('allows a caller who holds the required permission', async () => {
    resolveEffective.mockResolvedValue(resolution(['REPORTS.VIEW']));

    await expect(
      guard.canActivate(contextFor(gated(RequirePermission('REPORTS.VIEW')))),
    ).resolves.toBe(true);
  });

  it('refuses a caller who does not, with the standard code', async () => {
    resolveEffective.mockResolvedValue(
      resolution(['TIMESHEET.VIEW'], ['REPORTS.VIEW']),
    );

    const context = contextFor(gated(RequirePermission('REPORTS.VIEW')));

    await expect(guard.canActivate(context)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    await expect(guard.canActivate(context)).rejects.toMatchObject({
      response: {
        errorCode: ERROR_CODES.AUTHORIZATION_PERMISSION_DENIED,
        params: { requiredPermissions: 'REPORTS.VIEW', mode: 'ALL' },
      },
    });
  });

  /**
   * A `403` names what was required and never what the caller holds. The
   * requirement is the route's own and is documented anyway; the caller's set
   * would turn every refusal into a map of what the account can still reach.
   */
  it('does not disclose the caller’s permissions in the refusal', async () => {
    resolveEffective.mockResolvedValue(
      resolution(['LEAVES.VIEW', 'EMPLOYEES.VIEW'], ['REPORTS.VIEW']),
    );

    await expect(
      guard.canActivate(contextFor(gated(RequirePermission('REPORTS.VIEW')))),
    ).rejects.toMatchObject({
      response: expect.not.objectContaining({ permissions: expect.anything() }),
    });

    await guard
      .canActivate(contextFor(gated(RequirePermission('REPORTS.VIEW'))))
      .catch((error: ForbiddenException) => {
        expect(JSON.stringify(error.getResponse())).not.toContain(
          'EMPLOYEES.VIEW',
        );
      });
  });

  /**
   * The super-admin case, and the assertion is about *where* the answer comes
   * from as much as what it is: the stub returns what `resolveEffective`'s
   * super-admin branch returns — every catalog permission — and the guard admits
   * on that alone. There is no `role === SUPERADMIN` anywhere in the guard, so a
   * change to that branch cannot leave the guard disagreeing with the matrix
   * screen.
   */
  it('admits a super-admin through the resolver’s own branch', async () => {
    resolveEffective.mockResolvedValue({
      userId: 'usr-root',
      role: UserRole.SUPERADMIN,
      readOnly: true,
      permissions: [
        { key: 'PERMISSIONS.CONFIGURE', granted: true },
        { key: 'REPORTS.VIEW', granted: true },
      ] as PermissionMatrixCell[],
    });

    await expect(
      guard.canActivate(
        contextFor(gated(RequirePermission('PERMISSIONS.CONFIGURE')), {
          user: { ...CALLER, role: UserRole.SUPERADMIN },
        }),
      ),
    ).resolves.toBe(true);
  });

  describe('ALL and ANY', () => {
    const both = RequirePermission('PERMISSIONS.VIEW', 'PERMISSIONS.EDIT');
    const either = RequireAnyPermission('PERMISSIONS.VIEW', 'PERMISSIONS.EDIT');

    it('refuses a caller holding only one of two required permissions', async () => {
      resolveEffective.mockResolvedValue(resolution(['PERMISSIONS.VIEW']));

      await expect(
        guard.canActivate(contextFor(gated(both))),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('names every required key when several are missing', async () => {
      resolveEffective.mockResolvedValue(resolution([]));

      await expect(
        guard.canActivate(contextFor(gated(both))),
      ).rejects.toMatchObject({
        response: {
          params: {
            requiredPermissions: 'PERMISSIONS.VIEW, PERMISSIONS.EDIT',
            mode: 'ALL',
          },
        },
      });
    });

    it('admits a caller holding either one when ANY is declared', async () => {
      resolveEffective.mockResolvedValue(resolution(['PERMISSIONS.EDIT']));

      await expect(guard.canActivate(contextFor(gated(either)))).resolves.toBe(
        true,
      );
    });

    it('refuses a caller holding neither, even under ANY', async () => {
      resolveEffective.mockResolvedValue(resolution(['TIMESHEET.VIEW']));

      await expect(
        guard.canActivate(contextFor(gated(either))),
      ).rejects.toMatchObject({ response: { params: { mode: 'ANY' } } });
    });
  });

  /**
   * Whether an override is honoured *through the guard*.
   *
   * This is the assertion that the guard is not a second code path. A `REVOKE`
   * on a permission the role grants is the one case a reimplementation would
   * most plausibly get wrong — it is the difference between "the role says yes"
   * and "this person effectively holds it" — and here the guard refuses, because
   * the only thing it reads is the resolver's own verdict.
   */
  it('honours a per-user REVOKE that the role baseline would have granted', async () => {
    resolveEffective.mockResolvedValue({
      userId: CALLER.userId,
      role: CALLER.role,
      readOnly: false,
      permissions: [
        { key: 'REPORTS.VIEW', granted: false, source: 'OVERRIDE_REVOKE' },
      ] as PermissionMatrixCell[],
    });

    await expect(
      guard.canActivate(contextFor(gated(RequirePermission('REPORTS.VIEW')))),
    ).rejects.toBeInstanceOf(ForbiddenException);

    expect(resolveEffective).toHaveBeenCalledWith(CALLER.userId, CALLER.role);
  });

  /**
   * The per-request memoization.
   *
   * Two checks in one request — a controller-level requirement and a stricter
   * one on the handler is the legitimate shape — must cost one resolution. The
   * two contexts below share a request object, which is exactly what the memo is
   * keyed on.
   */
  it('resolves once when two checks run against the same request', async () => {
    resolveEffective.mockResolvedValue(
      resolution(['PERMISSIONS.VIEW', 'PERMISSIONS.EDIT']),
    );

    const request = { user: CALLER };

    await guard.canActivate(
      contextFor(gated(RequirePermission('PERMISSIONS.VIEW')), request),
    );
    await guard.canActivate(
      contextFor(gated(RequirePermission('PERMISSIONS.EDIT')), request),
    );

    expect(resolveEffective).toHaveBeenCalledTimes(1);
  });

  /** The other half of the same claim: nothing is shared *between* requests. */
  it('resolves again for the next request', async () => {
    resolveEffective.mockResolvedValue(resolution(['PERMISSIONS.VIEW']));

    await guard.canActivate(
      contextFor(gated(RequirePermission('PERMISSIONS.VIEW')), {
        user: CALLER,
      }),
    );
    await guard.canActivate(
      contextFor(gated(RequirePermission('PERMISSIONS.VIEW')), {
        user: CALLER,
      }),
    );

    expect(resolveEffective).toHaveBeenCalledTimes(2);
  });

  /**
   * A gated route reached with no authenticated caller answers `401`, not
   * `403` — the same refusal `@CurrentUser()` produces, because it is the same
   * function. It is unreachable in a booted application, where
   * `PublicRouteValidator` refuses the only wiring that could produce it.
   */
  it('answers 401 rather than 403 when nothing authenticated the request', async () => {
    resolveEffective.mockResolvedValue(resolution([]));

    await expect(
      guard.canActivate(
        contextFor(gated(RequirePermission('REPORTS.VIEW')), {}),
      ),
    ).rejects.toMatchObject({ status: 401 });

    expect(resolveEffective).not.toHaveBeenCalled();
  });

  /** A WebSocket message handler has no HTTP request to read a caller from. */
  it('lets a non-HTTP context through', async () => {
    const context = {
      ...contextFor(gated(RequirePermission('REPORTS.VIEW'))),
      getType: () => 'ws',
    } as unknown as ExecutionContext;

    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(resolveEffective).not.toHaveBeenCalled();
  });
});

/**
 * The semantics on their own, as pure functions.
 *
 * They are exercised through the guard above, and stated here as well because
 * they are the part of this feature another developer will read before writing a
 * two-key route.
 */
describe('the requirement helpers', () => {
  const reflector = new Reflector();

  const requirementOn = (handler: () => unknown) =>
    readPermissionRequirement(reflector, contextFor(handler));

  it('reads nothing off an undecorated handler', () => {
    expect(requirementOn(gated())).toBeUndefined();
  });

  it('defaults to ALL', () => {
    expect(requirementOn(gated(RequirePermission('A', 'B')))).toEqual({
      keys: ['A', 'B'],
      mode: 'ALL',
    });
  });

  it('records ANY when asked for it by name', () => {
    expect(requirementOn(gated(RequireAnyPermission('A', 'B')))).toEqual({
      keys: ['A', 'B'],
      mode: 'ANY',
    });
  });

  /**
   * A requirement of nothing is not a weaker gate, it is an open route that
   * looks gated. Neither decorator can write one — their signatures demand a
   * key — so this is about metadata set by hand, which must not satisfy
   * `every()` vacuously for everybody.
   */
  it('treats an empty key list as no requirement rather than as a gate', () => {
    class Probe {
      handle(): void {}
    }

    Reflect.defineMetadata(
      REQUIRED_PERMISSIONS_KEY,
      { keys: [], mode: 'ALL' },
      Probe.prototype.handle,
    );

    expect(requirementOn(Probe.prototype.handle)).toBeUndefined();
  });

  it.each<[PermissionRequirement, string[], boolean]>([
    [{ keys: ['A'], mode: 'ALL' }, ['A'], true],
    [{ keys: ['A'], mode: 'ALL' }, [], false],
    [{ keys: ['A', 'B'], mode: 'ALL' }, ['A'], false],
    [{ keys: ['A', 'B'], mode: 'ALL' }, ['A', 'B', 'C'], true],
    [{ keys: ['A', 'B'], mode: 'ANY' }, ['B'], true],
    [{ keys: ['A', 'B'], mode: 'ANY' }, ['C'], false],
  ])('%j against %j is %s', (requirement, held, expected) => {
    expect(isSatisfiedBy(requirement, new Set(held))).toBe(expected);
  });

  it('names one permission in the singular and several with the mode', () => {
    expect(describeRequirement({ keys: ['REPORTS.VIEW'], mode: 'ALL' })).toBe(
      'This action requires the REPORTS.VIEW permission',
    );
    expect(describeRequirement({ keys: ['A', 'B'], mode: 'ANY' })).toContain(
      'any of the following permissions: A, B',
    );
  });
});
