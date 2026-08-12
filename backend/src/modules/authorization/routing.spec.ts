import {
  Controller,
  Get,
  INestApplication,
  ValidationPipe,
  VersioningType,
} from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';

import {
  ADMIN_STANDARD,
  HR_STANDARD,
  USER_BASELINE,
} from '../../../prisma/seeds/permission-sets';
import { ALL_PERMISSION_KEYS } from '../../../prisma/seeds/permissions.seed';
import { ERROR_CODES } from '../../common/constants/error-codes.constants';
import { AllExceptionsFilter } from '../../common/filters/all-exceptions.filter';
import { ResponseInterceptor } from '../../common/interceptors/response.interceptor';
import {
  API_DEFAULT_VERSION,
  API_PREFIX,
  API_VERSION_PREFIX,
} from '../../config/api.constants';
import {
  PermissionEffect,
  TimesheetStatus,
  UserRole,
} from '../../generated/prisma/enums';
import { PrismaService } from '../../prisma/prisma.service';
import { TestAuthentication } from '../auth/testing/authentication.testing';
import { PermissionController } from '../permission-management/permission.controller';
import { PermissionService } from '../permission-management/permission.service';
import { UserPermissionController } from '../permission-management/user-permission.controller';
import { UserPermissionService } from '../permission-management/user-permission.service';
import { ReportingController } from '../reporting/reporting.controller';
import { ReportingService } from '../reporting/reporting.service';
import {
  assertAdministrative,
  assertStatusIs,
} from '../timesheet-management/timesheet-management.rules';
import { TimesheetController } from '../timesheet-management/timesheet.controller';
import { TimesheetService } from '../timesheet-management/timesheet.service';
import {
  RequireAnyPermission,
  RequirePermission,
} from './decorators/require-permission.decorator';
import { PermissionsGuard } from './permissions.guard';

const BASE = `/${API_PREFIX}/${API_VERSION_PREFIX}${API_DEFAULT_VERSION}`;

/**
 * Feature 035 end to end: real routes, the real guard, the real resolver, and
 * the **real seeded baselines**.
 *
 * The last of those is what makes this file worth reading. The role sets below
 * are imported from `prisma/seeds/permission-sets.ts` rather than invented, so
 * "an ADMIN may run a report and an HR user may not" is asserted against the
 * list this product actually ships — and the assertion would fail if somebody
 * moved `REPORTS.VIEW` back into the HR column without meaning to. Only the
 * database is substituted; `PermissionService.resolveEffective` runs for real,
 * catalog, baselines, overrides and the super-admin branch included.
 *
 * The controllers are the real ones with stubbed services, because what is under
 * test is the decorator each route carries and what the guard makes of it. The
 * one exception is the timesheet stub, which deliberately calls the *real*
 * domain rules — that is how the layering claim is demonstrated rather than
 * asserted.
 */

/** Every catalog row, derived from the same list the seed writes. */
const CATALOG = ALL_PERMISSION_KEYS.map((key) => {
  const [resource, action] = key.split('.');

  return {
    // The key doubles as the id. Nothing under test reads an id except to join
    // a baseline or an override to a catalog row, and both are built here.
    id: key,
    key,
    resource,
    action,
    label: action,
    description: null,
    createdAt: new Date('2026-08-01T00:00:00.000Z'),
    updatedAt: new Date('2026-08-01T00:00:00.000Z'),
  };
});

/** The three seeded baselines. `SUPERADMIN` has none, and must not. */
const BASELINES: Partial<Record<UserRole, readonly string[]>> = {
  [UserRole.USER]: USER_BASELINE,
  [UserRole.HR]: HR_STANDARD,
  [UserRole.ADMIN]: ADMIN_STANDARD,
};

/** Per-user exceptions, keyed by user id, as the overrides table would hold. */
const overrides = new Map<
  string,
  { permissionId: string; effect: PermissionEffect }[]
>();

/**
 * The three queries `resolveEffective` makes, and nothing else.
 *
 * A hand-written stub rather than a mocked module: it is small enough to read,
 * and it keeps the resolution itself — the union, the difference, the
 * super-admin branch — running for real. Substituting `PermissionService` would
 * have tested the guard against a stub of the very method this feature exists to
 * reuse.
 */
const prisma = {
  // `findAll` runs its page and its count in one transaction, the pattern every
  // list in this API uses. It is not what this file is about, but the catalog
  // route is gated and therefore has to answer.
  $transaction: (operations: Promise<unknown>[]) => Promise.all(operations),
  permission: {
    findMany: () => Promise.resolve(CATALOG),
    count: () => Promise.resolve(CATALOG.length),
  },
  rolePermission: {
    findMany: ({ where }: { where: { role: UserRole } }) =>
      Promise.resolve(
        (BASELINES[where.role] ?? []).map((key) => ({ permissionId: key })),
      ),
  },
  userPermissionOverride: {
    findMany: ({ where }: { where: { userId: string } }) =>
      Promise.resolve(overrides.get(where.userId) ?? []),
  },
};

/**
 * Two ungated routes and the two multi-key shapes, on a controller of their own.
 *
 * The ungated one stands in for the thirty modules this feature did not touch:
 * it declares nothing, so it must answer `200` to an ordinary employee holding
 * sixteen of fifty-five permissions. That is the regression criterion for the
 * whole rollout, and it belongs in this file rather than in each of those
 * modules.
 */
@Controller('probe')
class ProbeController {
  @Get('ungated')
  ungated(): { ok: true } {
    return { ok: true };
  }

  @Get('both')
  @RequirePermission('PERMISSIONS.VIEW', 'PERMISSIONS.EDIT')
  both(): { ok: true } {
    return { ok: true };
  }

  @Get('either')
  @RequireAnyPermission('PERMISSIONS.VIEW', 'PERMISSIONS.EDIT')
  either(): { ok: true } {
    return { ok: true };
  }
}

describe('authorization enforcement', () => {
  let app: INestApplication;

  const auth = new TestAuthentication();

  /** The state the timesheet stub pretends the addressed month is in. */
  let timesheetStatus: TimesheetStatus = TimesheetStatus.SUBMITTED;

  const reporting = {
    listReports: jest.fn().mockReturnValue([]),
    preview: jest.fn().mockResolvedValue({}),
    export: jest.fn(),
  };

  const permissionWrites = {
    findMatrix: jest.fn().mockResolvedValue({}),
    replace: jest.fn().mockResolvedValue({}),
    applyPreset: jest.fn().mockResolvedValue({}),
    resetToRole: jest.fn().mockResolvedValue({}),
    findHistory: jest.fn().mockResolvedValue({ items: [], meta: {} }),
  };

  /**
   * The timesheet stub, which runs the **real** rules.
   *
   * `assertAdministrative` and `assertStatusIs` are imported from
   * `timesheet-management.rules.ts` unchanged, so a request that clears the
   * permission gate still meets exactly the refusals the running application
   * would give it. That is the only way to show that the gate is a layer in
   * front of the domain rules rather than a replacement for them.
   */
  const timesheets = {
    approve: jest.fn((user: Parameters<typeof assertAdministrative>[0], id) => {
      assertAdministrative(user);
      assertStatusIs(
        id as string,
        timesheetStatus,
        [TimesheetStatus.SUBMITTED],
        'approved',
      );

      return Promise.resolve({ id });
    }),
    reject: jest.fn().mockResolvedValue({ id: 'tsh-1' }),
    findAll: jest.fn().mockResolvedValue({ items: [], meta: {} }),
    findOwn: jest.fn().mockResolvedValue({ id: 'tsh-1' }),
  };

  beforeAll(async () => {
    const moduleRef: TestingModule = await Test.createTestingModule({
      controllers: [
        ProbeController,
        ReportingController,
        PermissionController,
        UserPermissionController,
        TimesheetController,
      ],
      providers: [
        { provide: PrismaService, useValue: prisma },
        // The real resolver, over the substituted database.
        PermissionService,
        { provide: ReportingService, useValue: reporting },
        { provide: UserPermissionService, useValue: permissionWrites },
        { provide: TimesheetService, useValue: timesheets },
        // The two global guards in the order `app.module.ts` declares them:
        // authenticate, then authorise.
        ...auth.providers,
        { provide: APP_GUARD, useClass: PermissionsGuard },
      ],
    }).compile();

    app = moduleRef.createNestApplication();
    app.setGlobalPrefix(API_PREFIX);
    app.enableVersioning({
      type: VersioningType.URI,
      prefix: API_VERSION_PREFIX,
      defaultVersion: API_DEFAULT_VERSION,
    });
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    app.useGlobalInterceptors(new ResponseInterceptor());
    app.useGlobalFilters(new AllExceptionsFilter());

    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    overrides.clear();
    timesheetStatus = TimesheetStatus.SUBMITTED;
    jest.clearAllMocks();
  });

  /** A caller of the given role, with an id the overrides map can be keyed on. */
  const as = (role: UserRole, userId = `usr-${role}`) =>
    auth.as({ userId, role });

  const grant = (userId: string, key: string) =>
    overrides.set(userId, [
      { permissionId: key, effect: PermissionEffect.GRANT },
    ]);

  const revoke = (userId: string, key: string) =>
    overrides.set(userId, [
      { permissionId: key, effect: PermissionEffect.REVOKE },
    ]);

  describe('the gating model', () => {
    /**
     * The regression criterion for the whole feature: registering the guard
     * globally changed nothing about a route that declares no requirement.
     */
    it('allows an undeclared route for any authenticated caller', async () => {
      for (const role of Object.values(UserRole)) {
        await request(app.getHttpServer())
          .get(`${BASE}/probe/ungated`)
          .set(as(role))
          .expect(200);
      }
    });

    /**
     * Guard order, asserted from the outside. No token means `401` from
     * `JwtAuthGuard` — the authorization guard never runs, and the client is
     * told to sign in rather than to ask an administrator.
     */
    it('answers 401 for a gated route with no token, not 403', async () => {
      const response = await request(app.getHttpServer())
        .get(`${BASE}/probe/both`)
        .expect(401);

      expect(response.body).toMatchObject({
        statusCode: 401,
        errorCode: ERROR_CODES.AUTH_UNAUTHENTICATED,
      });
    });

    /** And the other side of the distinction: a good token, the wrong account. */
    it('answers 403 for an authenticated caller who lacks the permission', async () => {
      const response = await request(app.getHttpServer())
        .get(`${BASE}/probe/both`)
        .set(as(UserRole.USER))
        .expect(403);

      expect(response.body).toEqual({
        success: false,
        statusCode: 403,
        message:
          'This action requires all of the following permissions: PERMISSIONS.VIEW, PERMISSIONS.EDIT',
        errorCode: ERROR_CODES.AUTHORIZATION_PERMISSION_DENIED,
        params: {
          requiredPermissions: 'PERMISSIONS.VIEW, PERMISSIONS.EDIT',
          mode: 'ALL',
        },
        path: `${BASE}/probe/both`,
        timestamp: expect.any(String) as unknown as string,
      });
    });
  });

  describe('ALL and ANY, against the seeded baselines', () => {
    /**
     * `ADMIN` holds `PERMISSIONS.VIEW` and not `PERMISSIONS.EDIT` — the seed
     * withholds the two permission-writing keys from every baseline on purpose.
     * So an administrator is the natural case of "holds one of two".
     */
    it('refuses an ADMIN, who holds only one of the two required keys', async () => {
      await request(app.getHttpServer())
        .get(`${BASE}/probe/both`)
        .set(as(UserRole.ADMIN))
        .expect(403);
    });

    it('admits the same ADMIN when ANY of the two will do', async () => {
      await request(app.getHttpServer())
        .get(`${BASE}/probe/either`)
        .set(as(UserRole.ADMIN))
        .expect(200);
    });

    it('admits an ADMIN granted the missing key by an override', async () => {
      grant('usr-both', 'PERMISSIONS.EDIT');

      await request(app.getHttpServer())
        .get(`${BASE}/probe/both`)
        .set(as(UserRole.ADMIN, 'usr-both'))
        .expect(200);
    });

    it('refuses an ordinary employee even under ANY', async () => {
      await request(app.getHttpServer())
        .get(`${BASE}/probe/either`)
        .set(as(UserRole.USER))
        .expect(403);
    });

    /**
     * The super-admin, through the resolver's branch and no guard special case.
     * It holds `PERMISSIONS.EDIT`, which **no baseline grants and no override
     * gives it**, which is precisely what makes this the branch being exercised.
     */
    it('admits a SUPERADMIN with no baseline and no override', async () => {
      await request(app.getHttpServer())
        .get(`${BASE}/probe/both`)
        .set(as(UserRole.SUPERADMIN))
        .expect(200);
    });
  });

  /**
   * The routes that decide what everybody else may do — the most important set
   * in the application to lock, because a caller who reaches the writes can
   * grant themselves the rest.
   */
  describe('permission management', () => {
    it('lets an ADMIN read the catalog and a matrix', async () => {
      await request(app.getHttpServer())
        .get(`${BASE}/permissions`)
        .set(as(UserRole.ADMIN))
        .expect(200);

      await request(app.getHttpServer())
        .get(`${BASE}/users/usr-9/permissions`)
        .set(as(UserRole.ADMIN))
        .expect(200);
    });

    it('refuses an ordinary employee the catalog', async () => {
      const response = await request(app.getHttpServer())
        .get(`${BASE}/permissions`)
        .set(as(UserRole.USER))
        .expect(403);

      expect(response.body).toMatchObject({
        errorCode: ERROR_CODES.AUTHORIZATION_PERMISSION_DENIED,
        params: { requiredPermissions: 'PERMISSIONS.VIEW' },
      });
    });

    /**
     * The one that matters most: an administrator can *read* the screen and
     * cannot *write* it, because `PERMISSIONS.EDIT` and `PERMISSIONS.CONFIGURE`
     * are in no baseline. Managing what other people may do is an explicit
     * grant, one account at a time — a rule Feature 029 wrote into the seed and
     * that nothing enforced until now.
     */
    it('refuses an ADMIN the three writes, which no baseline grants', async () => {
      const admin = as(UserRole.ADMIN);

      await request(app.getHttpServer())
        .put(`${BASE}/users/usr-9/permissions`)
        .set(admin)
        .send({ permissionKeys: [] })
        .expect(403);

      await request(app.getHttpServer())
        .post(`${BASE}/users/usr-9/permissions/apply-preset`)
        .set(admin)
        .send({ presetKey: 'HR_STANDARD' })
        .expect(403);

      await request(app.getHttpServer())
        .delete(`${BASE}/users/usr-9/permissions`)
        .set(admin)
        .expect(403);

      expect(permissionWrites.replace).not.toHaveBeenCalled();
      expect(permissionWrites.applyPreset).not.toHaveBeenCalled();
      expect(permissionWrites.resetToRole).not.toHaveBeenCalled();
    });

    it('distinguishes EDIT from CONFIGURE', async () => {
      grant('usr-editor', 'PERMISSIONS.EDIT');
      const editor = as(UserRole.ADMIN, 'usr-editor');

      await request(app.getHttpServer())
        .put(`${BASE}/users/usr-9/permissions`)
        .set(editor)
        .send({ permissionKeys: [] })
        .expect(200);

      // The same caller may not replace a whole matrix: that is CONFIGURE.
      await request(app.getHttpServer())
        .delete(`${BASE}/users/usr-9/permissions`)
        .set(editor)
        .expect(403);
    });

    it('lets a SUPERADMIN write, so nobody can lock the system out', async () => {
      await request(app.getHttpServer())
        .delete(`${BASE}/users/usr-9/permissions`)
        .set(as(UserRole.SUPERADMIN))
        .expect(200);
    });

    /**
     * Reading your own effective set is not a privileged act, and gating it
     * would have made the frontend's soft gating impossible for exactly the
     * people who need it most.
     */
    it('lets an ordinary employee read their own effective set', async () => {
      const response = await request(app.getHttpServer())
        .get(`${BASE}/permissions/me/effective`)
        .set(as(UserRole.USER))
        .expect(200);

      // Sorted on both sides: the endpoint answers in catalog order and the
      // baseline is written in the order somebody reads it, and neither of those
      // is what this assertion is about.
      expect([...(response.body.data.permissions as string[])].sort()).toEqual(
        [...USER_BASELINE].sort(),
      );
      expect(response.body.data.permissions).not.toContain('REPORTS.VIEW');
    });
  });

  /**
   * Reporting, where a role check became a permission — and the case the whole
   * design choice was made for.
   */
  describe('reporting', () => {
    it.each([UserRole.ADMIN, UserRole.SUPERADMIN])(
      'admits %s, who holds REPORTS.VIEW by baseline or by resolution',
      async (role) => {
        await request(app.getHttpServer())
          .get(`${BASE}/reports`)
          .set(as(role))
          .expect(200);
      },
    );

    /**
     * The behaviour change this feature makes deliberately. The
     * `isAdministrativeRole` check it replaced admitted HR; `REPORTS.VIEW` is
     * not in the HR baseline, so the default is now no.
     */
    it('refuses an HR user, whose baseline no longer holds REPORTS.VIEW', async () => {
      expect(HR_STANDARD).not.toContain('REPORTS.VIEW');

      const response = await request(app.getHttpServer())
        .get(`${BASE}/reports`)
        .set(as(UserRole.HR))
        .expect(403);

      expect(response.body).toMatchObject({
        errorCode: ERROR_CODES.AUTHORIZATION_PERMISSION_DENIED,
        params: { requiredPermissions: 'REPORTS.VIEW' },
      });
    });

    /**
     * **Why it is a permission and not a role.** The same HR account, given
     * `REPORTS.VIEW` through the permissions screen, is admitted — with no code
     * change, no deployment and no edit to a role baseline. A rigid role check
     * could not express this at all.
     */
    it('admits an HR user granted REPORTS.VIEW by a per-user override', async () => {
      grant('usr-hr-reports', 'REPORTS.VIEW');

      await request(app.getHttpServer())
        .post(`${BASE}/reports/timesheet-status/preview`)
        .set(as(UserRole.HR, 'usr-hr-reports'))
        .send({ month: 9, year: 2026 })
        .expect(200);

      expect(reporting.preview).toHaveBeenCalledTimes(1);
    });

    /** And the reverse: one administrator can be taken off the reports. */
    it('refuses an ADMIN whose REPORTS.VIEW was revoked', async () => {
      revoke('usr-no-reports', 'REPORTS.VIEW');

      await request(app.getHttpServer())
        .get(`${BASE}/reports`)
        .set(as(UserRole.ADMIN, 'usr-no-reports'))
        .expect(403);
    });

    it('refuses an ordinary employee, as it always did', async () => {
      await request(app.getHttpServer())
        .get(`${BASE}/reports`)
        .set(as(UserRole.USER))
        .expect(403);
    });

    it('gates the export as well as the preview and the menu', async () => {
      await request(app.getHttpServer())
        .post(`${BASE}/reports/timesheet-status/export?format=pdf`)
        .set(as(UserRole.HR))
        .send({ month: 9, year: 2026 })
        .expect(403);

      expect(reporting.export).not.toHaveBeenCalled();
    });
  });

  /**
   * The timesheet review, where the gate sits **in front of** rules that stayed
   * exactly where they were.
   */
  describe('timesheet approval', () => {
    it('admits an ADMIN, who holds TIMESHEET.APPROVE by baseline', async () => {
      await request(app.getHttpServer())
        .post(`${BASE}/timesheets/tsh-1/approve`)
        .set(as(UserRole.ADMIN))
        .expect(201);
    });

    it('refuses an HR user, whose baseline withholds it', async () => {
      expect(HR_STANDARD).not.toContain('TIMESHEET.APPROVE');

      await request(app.getHttpServer())
        .post(`${BASE}/timesheets/tsh-1/approve`)
        .set(as(UserRole.HR))
        .expect(403);

      expect(timesheets.approve).not.toHaveBeenCalled();
    });

    /**
     * **Both layers, on one request.** The caller clears the gate, reaches the
     * service, and is refused by the state rule — with a `409` about the
     * timesheet rather than a `403` about them. Neither layer can stand in for
     * the other.
     */
    it('still enforces the state rule for a caller who holds the permission', async () => {
      timesheetStatus = TimesheetStatus.APPROVED;

      const response = await request(app.getHttpServer())
        .post(`${BASE}/timesheets/tsh-1/approve`)
        .set(as(UserRole.ADMIN))
        .expect(409);

      expect(timesheets.approve).toHaveBeenCalled();
      expect(response.body.message).toMatch(/APPROVED/);
    });

    /**
     * The gate narrows within the administrative roles; it does not widen below
     * them. A plain employee granted `TIMESHEET.APPROVE` passes the guard and is
     * then refused by `assertAdministrative`, which this feature deliberately
     * kept — see `TimesheetController`.
     */
    it('does not let an override promote a plain employee past the domain rule', async () => {
      grant('usr-sneaky', 'TIMESHEET.APPROVE');

      const response = await request(app.getHttpServer())
        .post(`${BASE}/timesheets/tsh-1/approve`)
        .set(as(UserRole.USER, 'usr-sneaky'))
        .expect(403);

      expect(response.body.message).toMatch(/Only an administrator/);
      expect(response.body.errorCode).toBeUndefined();
    });

    /** And the ungated routes of the same controller are untouched. */
    it('leaves the review queue and the owner routes ungated', async () => {
      await request(app.getHttpServer())
        .get(`${BASE}/timesheets`)
        .set(as(UserRole.HR))
        .expect(200);

      await request(app.getHttpServer())
        .get(`${BASE}/timesheets/me?month=9&year=2026`)
        .set(as(UserRole.USER))
        .expect(200);
    });
  });
});
