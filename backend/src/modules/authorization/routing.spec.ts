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
import { DepartmentController } from '../departments/department.controller';
import { DepartmentService } from '../departments/department.service';
import { EmailController } from '../email/email.controller';
import { EmailService } from '../email/email.service';
import { EmployeeLeaveBalancesController } from '../employee-leave-balances/employee-leave-balances.controller';
import { EmployeeLeaveBalancesService } from '../employee-leave-balances/employee-leave-balances.service';
import { EmployeeController } from '../employees/employee.controller';
import { EmployeeService } from '../employees/employee.service';
import { LeaveNotificationEmailsController } from '../leave-configuration/leave-notification-emails.controller';
import { LeaveNotificationEmailsService } from '../leave-configuration/leave-notification-emails.service';
import { LeaveTypesController } from '../leave-configuration/leave-types.controller';
import { LeaveTypesService } from '../leave-configuration/leave-types.service';
import { LeaveRequestsController } from '../leave-requests/leave-requests.controller';
import { LeaveRequestsService } from '../leave-requests/leave-requests.service';
import { MyLeaveRequestsController } from '../leave-requests/my-leave-requests.controller';
import { NotificationDeliveryController } from '../notification-delivery/notification-delivery.controller';
import { NotificationDispatcher } from '../notification-delivery/notification-dispatcher.service';
import { NotificationCampaignController } from '../notification-management/notification-campaign.controller';
import { NotificationCampaignService } from '../notification-management/notification-campaign.service';
import { ReminderController } from '../notification-management/reminder.controller';
import { ReminderService } from '../notification-management/reminder.service';
import { AdministrativeNotificationController } from '../notifications/administrative-notification.controller';
import { NotificationController } from '../notifications/notification.controller';
import { NotificationService } from '../notifications/notification.service';
import { PermissionController } from '../permission-management/permission.controller';
import { PermissionService } from '../permission-management/permission.service';
import { UserPermissionController } from '../permission-management/user-permission.controller';
import { UserPermissionService } from '../permission-management/user-permission.service';
import { PositionController } from '../positions/position.controller';
import { PositionService } from '../positions/position.service';
import { ProfileController } from '../profile/profile.controller';
import { ProfileService } from '../profile/profile.service';
import { ProjectMembersController } from '../project-members/project-members.controller';
import { ProjectMemberService } from '../project-members/project-member.service';
import { ProjectController } from '../projects/project.controller';
import { ProjectService } from '../projects/project.service';
import { PublicHolidayController } from '../public-holidays/public-holiday.controller';
import { PublicHolidayService } from '../public-holidays/public-holiday.service';
import { ReportingController } from '../reporting/reporting.controller';
import { ReportingService } from '../reporting/reporting.service';
import {
  assertAdministrative,
  assertStatusIs,
} from '../timesheet-management/timesheet-management.rules';
import { TimesheetController } from '../timesheet-management/timesheet.controller';
import { TimesheetService } from '../timesheet-management/timesheet.service';
import { WorkScheduleController } from '../work-schedule/work-schedule.controller';
import { WorkScheduleService } from '../work-schedule/work-schedule.service';
import {
  RequireAnyPermission,
  RequirePermission,
} from './decorators/require-permission.decorator';
import { PermissionsGuard } from './permissions.guard';

const BASE = `/${API_PREFIX}/${API_VERSION_PREFIX}${API_DEFAULT_VERSION}`;

/**
 * Features 035 and 041 end to end: real routes, the real guard, the real
 * resolver, and the **real seeded baselines**.
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
 *
 * **Feature 041 added two blocks at the end**, and they are two halves of one
 * claim rather than a list and an afterthought. `the write sweep` is the table of
 * forty-four gated write verbs and the assertion that each refuses a caller
 * without its key; `no self-service regression` is the assertion that the same
 * sweep left an ordinary employee able to edit their profile, file their own
 * leave, clear their own inbox and pick a project for their timesheet. A
 * security pass like this fails in both directions, and only one of them shows
 * up in production as an error somebody reports.
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
 * twelve of fifty-five permissions. That is the regression criterion for the
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

  /**
   * The two lists an employee's timesheet stands on, stubbed at the service.
   *
   * They are here because of what their controllers **do not** declare: neither
   * carries a `@RequirePermission`, and that is the contract the timesheet
   * depends on. When the `USER` baseline stopped granting `PROJECTS.VIEW` and
   * `PUBLIC_HOLIDAYS.VIEW`, the question "can an employee still fill in a
   * timesheet" became a question about these two routes, and it deserves an
   * assertion rather than a reading of the decorators.
   */
  const projects = {
    findAll: jest.fn().mockResolvedValue({ items: [], meta: {} }),
    findOne: jest.fn().mockResolvedValue({}),
    create: jest.fn().mockResolvedValue({}),
    update: jest.fn().mockResolvedValue({}),
    remove: jest.fn().mockResolvedValue(undefined),
  };

  const publicHolidays = {
    findAll: jest.fn().mockResolvedValue({ items: [], meta: {} }),
    findOne: jest.fn().mockResolvedValue({}),
    create: jest.fn().mockResolvedValue({}),
    update: jest.fn().mockResolvedValue({}),
    remove: jest.fn().mockResolvedValue(undefined),
  };

  const permissionWrites = {
    findMatrix: jest.fn().mockResolvedValue({}),
    replace: jest.fn().mockResolvedValue({}),
    applyPreset: jest.fn().mockResolvedValue({}),
    resetToRole: jest.fn().mockResolvedValue({}),
    findHistory: jest.fn().mockResolvedValue({ items: [], meta: {} }),
  };

  /**
   * Every service behind a route Feature 041 gated, stubbed to resolve.
   *
   * They resolve rather than throw so that a request which clears the gate
   * reaches the handler and answers a success — which is what makes
   * "the stub was not called" a meaningful assertion about a refusal. What each
   * service actually does is its own module's business and is tested there; this
   * file is only ever asking whether the request got that far.
   *
   * Grouped in one object per controller, in the order the sweep touched them.
   */
  const writes = {
    projectMembers: {
      findRoster: jest.fn().mockResolvedValue({}),
      findOne: jest.fn().mockResolvedValue({}),
      create: jest.fn().mockResolvedValue({}),
      update: jest.fn().mockResolvedValue({}),
      remove: jest.fn().mockResolvedValue(undefined),
    },
    employees: {
      create: jest.fn().mockResolvedValue({}),
      update: jest.fn().mockResolvedValue({}),
      remove: jest.fn().mockResolvedValue(undefined),
    },
    positions: {
      create: jest.fn().mockResolvedValue({}),
      update: jest.fn().mockResolvedValue({}),
      remove: jest.fn().mockResolvedValue(undefined),
    },
    departments: {
      // The two reads are stubbed here and nowhere else in this object: the
      // "reference lists stay readable" test calls them, and that claim is half
      // of what the sweep promised.
      findAll: jest.fn().mockResolvedValue({ items: [], meta: {} }),
      findOne: jest.fn().mockResolvedValue({}),
      create: jest.fn().mockResolvedValue({}),
      update: jest.fn().mockResolvedValue({}),
      remove: jest.fn().mockResolvedValue(undefined),
    },
    leaveTypes: {
      findAll: jest.fn().mockResolvedValue({ items: [], meta: {} }),
      findOne: jest.fn().mockResolvedValue({}),
      create: jest.fn().mockResolvedValue({}),
      update: jest.fn().mockResolvedValue({}),
      remove: jest.fn().mockResolvedValue(undefined),
    },
    leaveEmails: {
      create: jest.fn().mockResolvedValue({}),
      update: jest.fn().mockResolvedValue({}),
      remove: jest.fn().mockResolvedValue(undefined),
    },
    balances: {
      create: jest.fn().mockResolvedValue({}),
      generate: jest.fn().mockResolvedValue({}),
      update: jest.fn().mockResolvedValue({}),
      remove: jest.fn().mockResolvedValue(undefined),
    },
    workSchedule: {
      find: jest.fn().mockResolvedValue({}),
      save: jest.fn().mockResolvedValue({}),
      findEmails: jest.fn().mockResolvedValue([]),
      addEmail: jest.fn().mockResolvedValue({}),
      removeEmail: jest.fn().mockResolvedValue(undefined),
    },
    leaveRequests: {
      findAll: jest.fn().mockResolvedValue({ items: [], meta: {} }),
      findOne: jest.fn().mockResolvedValue({}),
      decide: jest.fn().mockResolvedValue({}),
      findOwn: jest.fn().mockResolvedValue({ items: [], meta: {} }),
      findOwnOne: jest.fn().mockResolvedValue({}),
      createOwn: jest.fn().mockResolvedValue({}),
      updateOwn: jest.fn().mockResolvedValue({}),
      removeOwn: jest.fn().mockResolvedValue(undefined),
    },
    reminders: {
      create: jest.fn().mockResolvedValue({}),
      update: jest.fn().mockResolvedValue({}),
      remove: jest.fn().mockResolvedValue(undefined),
    },
    campaigns: {
      create: jest.fn().mockResolvedValue({}),
      update: jest.fn().mockResolvedValue({}),
      remove: jest.fn().mockResolvedValue(undefined),
    },
    notifications: {
      create: jest.fn().mockResolvedValue({}),
      markRead: jest.fn().mockResolvedValue({}),
      markAllPersonalRead: jest.fn().mockResolvedValue({ count: 0 }),
      markAllAdministrativeRead: jest.fn().mockResolvedValue({ count: 0 }),
      removeAllPersonal: jest.fn().mockResolvedValue({ count: 0 }),
      removeAllAdministrative: jest.fn().mockResolvedValue({ count: 0 }),
      remove: jest.fn().mockResolvedValue(undefined),
    },
    dispatcher: { executeCampaign: jest.fn().mockResolvedValue({}) },
    email: {
      checkHealth: jest.fn().mockResolvedValue({}),
      sendTestEmail: jest.fn().mockResolvedValue(undefined),
    },
    profile: {
      findOwn: jest.fn().mockResolvedValue({}),
      updateOwn: jest.fn().mockResolvedValue({}),
    },
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
        ProjectController,
        PublicHolidayController,
        // Feature 041: every controller whose write verbs the sweep gated, plus
        // the two whose writes it deliberately left open (`ProfileController`
        // and `AdministrativeNotificationController`), because "left open" is a
        // claim that deserves an assertion rather than a comment.
        ProjectMembersController,
        EmployeeController,
        PositionController,
        DepartmentController,
        LeaveTypesController,
        LeaveNotificationEmailsController,
        EmployeeLeaveBalancesController,
        WorkScheduleController,
        LeaveRequestsController,
        MyLeaveRequestsController,
        ReminderController,
        NotificationCampaignController,
        NotificationController,
        AdministrativeNotificationController,
        NotificationDeliveryController,
        EmailController,
        ProfileController,
      ],
      providers: [
        { provide: PrismaService, useValue: prisma },
        // The real resolver, over the substituted database.
        PermissionService,
        { provide: ReportingService, useValue: reporting },
        { provide: ProjectService, useValue: projects },
        { provide: PublicHolidayService, useValue: publicHolidays },
        { provide: UserPermissionService, useValue: permissionWrites },
        { provide: TimesheetService, useValue: timesheets },
        { provide: ProjectMemberService, useValue: writes.projectMembers },
        { provide: EmployeeService, useValue: writes.employees },
        { provide: PositionService, useValue: writes.positions },
        { provide: DepartmentService, useValue: writes.departments },
        { provide: LeaveTypesService, useValue: writes.leaveTypes },
        {
          provide: LeaveNotificationEmailsService,
          useValue: writes.leaveEmails,
        },
        {
          provide: EmployeeLeaveBalancesService,
          useValue: writes.balances,
        },
        { provide: WorkScheduleService, useValue: writes.workSchedule },
        { provide: LeaveRequestsService, useValue: writes.leaveRequests },
        { provide: ReminderService, useValue: writes.reminders },
        { provide: NotificationCampaignService, useValue: writes.campaigns },
        { provide: NotificationService, useValue: writes.notifications },
        { provide: NotificationDispatcher, useValue: writes.dispatcher },
        { provide: EmailService, useValue: writes.email },
        { provide: ProfileService, useValue: writes.profile },
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
   * The employee's personal workspace, after the `USER` baseline dropped the two
   * standalone reference pages — see the amendment note in `permission-sets.ts`.
   *
   * The pair of claims below is the whole of that change, and they pull in
   * opposite directions, which is why both are asserted here rather than either
   * being taken on trust: the employee loses the two **pages**, and keeps
   * everything the timesheet needs from the two **resources**. A change that
   * only did the first would be a regression nobody noticed until somebody could
   * not book their hours.
   */
  describe('the personal workspace', () => {
    const REFERENCE_PAGES = [
      'PROJECTS.PAGE_ACCESS',
      'PROJECTS.VIEW',
      'PUBLIC_HOLIDAYS.PAGE_ACCESS',
      'PUBLIC_HOLIDAYS.VIEW',
    ];

    /**
     * Asserted against the shipped baseline rather than against a list written
     * here, so putting any of the four back would fail this test — which is the
     * point. The frontend needs no list of its own: the personal menu item and
     * the personal route guard both name the `PAGE_ACCESS` key, so an absent key
     * removes the sidebar entry and shuts the URL in one stroke.
     */
    it('withholds the two reference pages from the USER baseline', () => {
      for (const key of REFERENCE_PAGES) {
        expect(USER_BASELINE).not.toContain(key);
      }

      expect(USER_BASELINE).toHaveLength(12);
    });

    it('leaves an employee the three screens that are their own', async () => {
      const response = await request(app.getHttpServer())
        .get(`${BASE}/permissions/me/effective`)
        .set(as(UserRole.USER))
        .expect(200);

      const held = response.body.data.permissions as string[];

      expect(held.filter((key) => key.endsWith('.PAGE_ACCESS')).sort()).toEqual(
        [
          'DASHBOARD.PAGE_ACCESS',
          'LEAVE_REQUESTS.PAGE_ACCESS',
          'TIMESHEET.PAGE_ACCESS',
        ],
      );
    });

    /**
     * **The regression this change had to avoid.** An employee filling in a
     * timesheet picks from every project in the company, and the list comes from
     * this route — which declares no requirement and therefore admits any
     * authenticated caller. Losing `PROJECTS.VIEW` closed the page and left the
     * picker exactly where it was.
     *
     * The holiday list is asserted beside it for the same contract, though the
     * timesheet does not even go through it: holidays are pre-populated
     * server-side by `TimesheetFillService`, which injects `PublicHolidayService`
     * and never reads the caller's permissions.
     */
    it('still serves the project and holiday lists to that employee', async () => {
      const employee = as(UserRole.USER);

      await request(app.getHttpServer())
        .get(`${BASE}/projects`)
        .set(employee)
        .expect(200);

      await request(app.getHttpServer())
        .get(`${BASE}/public-holidays`)
        .set(employee)
        .expect(200);

      expect(projects.findAll).toHaveBeenCalledTimes(1);
      expect(publicHolidays.findAll).toHaveBeenCalledTimes(1);
    });

    /**
     * And the half of the split that is easy to break by accident: `OWN_WORK` is
     * spread into `HR_VIEW_ONLY` and thence into every tier above it, so deleting
     * the four keys outright — rather than moving them to `PERSONAL_REFERENCE` —
     * would have taken the two screens from HR and administrators as well.
     */
    it('leaves HR and ADMIN holding both pages', () => {
      for (const key of REFERENCE_PAGES) {
        expect(HR_STANDARD).toContain(key);
        expect(ADMIN_STANDARD).toContain(key);
      }
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

  /**
   * Feature 041 — the write sweep.
   *
   * Feature 035 shipped the mechanism and applied it to eleven routes; every
   * other write in the application stayed open, which meant the *only* thing
   * stopping an ordinary employee creating a project, deleting a department or
   * emptying somebody's leave balance was that the screen did not offer them a
   * button. Frontend gating is presentation. This is the assertion that the
   * backend now refuses.
   *
   * **The table is the feature.** Forty-four rows, one per gated write verb, each
   * naming the key its route declares — so this file states the whole policy in
   * one place, and a route that loses its decorator fails here rather than in
   * production. `catalog.spec.ts` checks the same declarations against the seed;
   * the two together are "every write names a key, and every key exists".
   */
  describe('the write sweep', () => {
    /**
     * A body this table supplies, or the marker for one it deliberately does
     * not.
     *
     * `'dto'` means the route's payload is a domain object with rules of its own
     * — a project's code, a holiday's two dates, a reminder's schedule — which
     * belongs to that module's DTO spec rather than here. Those rows still make
     * the *whole* claim about refusal, because guards run before pipes: a caller
     * who lacks the key is refused with `403` whatever they send, and never
     * reaches validation. What they cannot make is the second half of the claim
     * about admission, so for them "the guard let this through" is asserted as
     * "not a `403`" rather than as a call reaching the service.
     */
    type Payload = Record<string, unknown> | 'dto';

    interface GatedWrite {
      /** The catalog key the route declares. */
      readonly key: string;
      readonly method: 'post' | 'put' | 'patch' | 'delete';
      readonly path: string;
      /** Absent where the route takes no body at all. */
      readonly body?: Payload;
      /** What the route delegates to; asserted un-called on a refusal. */
      readonly stub: jest.Mock;
    }

    const GATED_WRITES: readonly GatedWrite[] = [
      // --- Projects, and the roster that is part of one. --------------------
      {
        key: 'PROJECTS.CREATE',
        method: 'post',
        path: '/projects',
        body: 'dto',
        stub: projects.create,
      },
      {
        key: 'PROJECTS.EDIT',
        method: 'patch',
        path: '/projects/prj-1',
        body: {},
        stub: projects.update,
      },
      {
        key: 'PROJECTS.DELETE',
        method: 'delete',
        path: '/projects/prj-1',
        stub: projects.remove,
      },
      {
        key: 'PROJECTS.EDIT',
        method: 'post',
        path: '/projects/prj-1/members',
        body: 'dto',
        stub: writes.projectMembers.create,
      },
      {
        key: 'PROJECTS.EDIT',
        method: 'patch',
        path: '/projects/prj-1/members/emp-1',
        body: {},
        stub: writes.projectMembers.update,
      },
      {
        key: 'PROJECTS.EDIT',
        method: 'delete',
        path: '/projects/prj-1/members/emp-1',
        stub: writes.projectMembers.remove,
      },

      // --- Public holidays --------------------------------------------------
      {
        key: 'PUBLIC_HOLIDAYS.CREATE',
        method: 'post',
        path: '/public-holidays',
        body: 'dto',
        stub: publicHolidays.create,
      },
      {
        key: 'PUBLIC_HOLIDAYS.EDIT',
        method: 'patch',
        path: '/public-holidays/ph-1',
        body: {},
        stub: publicHolidays.update,
      },
      {
        key: 'PUBLIC_HOLIDAYS.DELETE',
        method: 'delete',
        path: '/public-holidays/ph-1',
        stub: publicHolidays.remove,
      },

      // --- The employee directory, and the job titles that are part of it. ---
      {
        key: 'EMPLOYEES.CREATE',
        method: 'post',
        path: '/employees',
        body: 'dto',
        stub: writes.employees.create,
      },
      {
        key: 'EMPLOYEES.EDIT',
        method: 'patch',
        path: '/employees/emp-1',
        body: {},
        stub: writes.employees.update,
      },
      {
        key: 'EMPLOYEES.DELETE',
        method: 'delete',
        path: '/employees/emp-1',
        stub: writes.employees.remove,
      },
      {
        key: 'EMPLOYEES.CREATE',
        method: 'post',
        path: '/positions',
        body: 'dto',
        stub: writes.positions.create,
      },
      {
        key: 'EMPLOYEES.EDIT',
        method: 'patch',
        path: '/positions/pos-1',
        body: {},
        stub: writes.positions.update,
      },
      {
        key: 'EMPLOYEES.DELETE',
        method: 'delete',
        path: '/positions/pos-1',
        stub: writes.positions.remove,
      },

      // --- Departments ------------------------------------------------------
      {
        key: 'DEPARTMENTS.CREATE',
        method: 'post',
        path: '/departments',
        body: 'dto',
        stub: writes.departments.create,
      },
      {
        key: 'DEPARTMENTS.EDIT',
        method: 'patch',
        path: '/departments/dep-1',
        body: {},
        stub: writes.departments.update,
      },
      {
        key: 'DEPARTMENTS.DELETE',
        method: 'delete',
        path: '/departments/dep-1',
        stub: writes.departments.remove,
      },

      // --- Leave configuration and balances ---------------------------------
      {
        key: 'LEAVES.CREATE',
        method: 'post',
        path: '/leave-types',
        body: 'dto',
        stub: writes.leaveTypes.create,
      },
      {
        key: 'LEAVES.EDIT',
        method: 'patch',
        path: '/leave-types/lt-1',
        body: {},
        stub: writes.leaveTypes.update,
      },
      {
        key: 'LEAVES.DELETE',
        method: 'delete',
        path: '/leave-types/lt-1',
        stub: writes.leaveTypes.remove,
      },
      {
        key: 'LEAVES.CONFIGURE',
        method: 'post',
        path: '/leave-notification-emails',
        body: 'dto',
        stub: writes.leaveEmails.create,
      },
      {
        key: 'LEAVES.CONFIGURE',
        method: 'patch',
        path: '/leave-notification-emails/lne-1',
        body: {},
        stub: writes.leaveEmails.update,
      },
      {
        key: 'LEAVES.CONFIGURE',
        method: 'delete',
        path: '/leave-notification-emails/lne-1',
        stub: writes.leaveEmails.remove,
      },
      {
        key: 'LEAVES.CREATE',
        method: 'post',
        path: '/employee-leave-balances',
        body: 'dto',
        stub: writes.balances.create,
      },
      {
        key: 'LEAVES.CONFIGURE',
        method: 'post',
        path: '/employee-leave-balances/generate',
        body: 'dto',
        stub: writes.balances.generate,
      },
      {
        key: 'LEAVES.EDIT',
        method: 'patch',
        path: '/employee-leave-balances/elb-1',
        body: {},
        stub: writes.balances.update,
      },
      {
        key: 'LEAVES.DELETE',
        method: 'delete',
        path: '/employee-leave-balances/elb-1',
        stub: writes.balances.remove,
      },

      // --- The working schedule, and the approval addresses. -----------------
      {
        key: 'WORK_SCHEDULE.EDIT',
        method: 'put',
        path: '/work-schedule',
        body: 'dto',
        stub: writes.workSchedule.save,
      },
      {
        key: 'WORK_SCHEDULE.CONFIGURE',
        method: 'post',
        path: '/work-schedule/emails',
        body: 'dto',
        stub: writes.workSchedule.addEmail,
      },
      {
        key: 'WORK_SCHEDULE.CONFIGURE',
        method: 'delete',
        path: '/work-schedule/emails/tae-1',
        stub: writes.workSchedule.removeEmail,
      },

      // --- Leave requests: the approver, then the person taking the leave. ---
      {
        key: 'LEAVE_REQUESTS.APPROVE',
        method: 'patch',
        path: '/leave-requests/lr-1/status',
        body: 'dto',
        stub: writes.leaveRequests.decide,
      },
      {
        key: 'LEAVE_REQUESTS.CREATE',
        method: 'post',
        path: '/me/leave-requests',
        body: 'dto',
        stub: writes.leaveRequests.createOwn,
      },
      {
        key: 'LEAVE_REQUESTS.EDIT',
        method: 'patch',
        path: '/me/leave-requests/lr-1',
        body: {},
        stub: writes.leaveRequests.updateOwn,
      },
      {
        key: 'LEAVE_REQUESTS.DELETE',
        method: 'delete',
        path: '/me/leave-requests/lr-1',
        stub: writes.leaveRequests.removeOwn,
      },

      // --- Notification configuration, and the two things that send. ---------
      {
        key: 'NOTIFICATION_CONFIG.CREATE',
        method: 'post',
        path: '/reminders',
        body: 'dto',
        stub: writes.reminders.create,
      },
      {
        key: 'NOTIFICATION_CONFIG.EDIT',
        method: 'patch',
        path: '/reminders/rem-1',
        body: {},
        stub: writes.reminders.update,
      },
      {
        key: 'NOTIFICATION_CONFIG.DELETE',
        method: 'delete',
        path: '/reminders/rem-1',
        stub: writes.reminders.remove,
      },
      {
        key: 'NOTIFICATION_CONFIG.CREATE',
        method: 'post',
        path: '/notification-campaigns',
        body: 'dto',
        stub: writes.campaigns.create,
      },
      {
        key: 'NOTIFICATION_CONFIG.EDIT',
        method: 'patch',
        path: '/notification-campaigns/cmp-1',
        body: {},
        stub: writes.campaigns.update,
      },
      {
        key: 'NOTIFICATION_CONFIG.DELETE',
        method: 'delete',
        path: '/notification-campaigns/cmp-1',
        stub: writes.campaigns.remove,
      },
      {
        key: 'NOTIFICATION_CONFIG.CREATE',
        method: 'post',
        path: '/notifications',
        body: 'dto',
        stub: writes.notifications.create,
      },
      {
        key: 'NOTIFICATION_CONFIG.EDIT',
        method: 'post',
        path: '/notification-delivery/execute/cmp-1',
        stub: writes.dispatcher.executeCampaign,
      },
      {
        key: 'NOTIFICATION_CONFIG.EDIT',
        method: 'post',
        path: '/email/test',
        body: 'dto',
        stub: writes.email.sendTestEmail,
      },
    ];

    /** One row's request, with the body it does or does not carry. */
    const send = ({ method, path, body }: GatedWrite, headers: object) => {
      const call = request(app.getHttpServer())
        [method](`${BASE}${path}`)
        .set(headers as Record<string, string>);

      return body === undefined ? call : call.send(body === 'dto' ? {} : body);
    };

    /**
     * A caller who does not hold the key, whichever way round that has to be
     * arranged.
     *
     * For most keys a plain employee is one already. For the three
     * `LEAVE_REQUESTS` keys in `OWN_WORK` they are not — the `USER` baseline
     * grants them, which is the whole point of those rows — so the key is
     * revoked by a per-user exception instead. That is not a contrivance to make
     * a test pass: it is the actual mechanism by which one employee is taken off
     * filing leave, and it proves the gate is live on a route the baseline
     * otherwise opens to everybody.
     */
    const withoutKey = (key: string) => {
      const userId = `usr-denied-${key}`;

      if ((USER_BASELINE as readonly string[]).includes(key)) {
        revoke(userId, key);
      }

      return as(UserRole.USER, userId);
    };

    /** The same ordinary employee, given exactly the one key under test. */
    const withKey = (key: string) => {
      const userId = `usr-holder-${key}`;

      grant(userId, key);

      return as(UserRole.USER, userId);
    };

    /** A guard against this table quietly shrinking. */
    it('covers forty-four write verbs', () => {
      expect(GATED_WRITES).toHaveLength(44);
    });

    it.each(
      GATED_WRITES.map(
        (write) =>
          [`${write.method.toUpperCase()} ${write.path}`, write] as const,
      ),
    )('%s is refused without its key', async (_label, write) => {
      const response = await send(write, withoutKey(write.key)).expect(403);

      expect(response.body).toMatchObject({
        errorCode: ERROR_CODES.AUTHORIZATION_PERMISSION_DENIED,
        params: { requiredPermissions: write.key, mode: 'ALL' },
      });
      // The refusal happened in front of the service, not inside it.
      expect(write.stub).not.toHaveBeenCalled();
    });

    it.each(
      GATED_WRITES.map(
        (write) =>
          [`${write.method.toUpperCase()} ${write.path}`, write] as const,
      ),
    )('%s is admitted with its key', async (_label, write) => {
      const response = await send(write, withKey(write.key));

      expect(response.status).not.toBe(403);

      // Where this table supplies a body the route accepts, the claim is the
      // stronger one: the request reached the service. Where it does not, the
      // `403` is gone and validation is somebody else's spec.
      if (write.body !== 'dto') {
        expect(write.stub).toHaveBeenCalled();
      }
    });

    /**
     * The one that would have caught the bug this feature exists for.
     *
     * A plain employee — twelve of fifty-five permissions, no exceptions — walked
     * through every one of these before Feature 041. The screen hid the buttons;
     * `curl` did not care.
     */
    it('refuses an ordinary employee every administrative write', async () => {
      const employee = as(UserRole.USER, 'usr-ordinary');
      const administrative = GATED_WRITES.filter(
        (write) => !(USER_BASELINE as readonly string[]).includes(write.key),
      );

      for (const write of administrative) {
        await send(write, employee).expect(403);
      }

      expect(administrative.length).toBeGreaterThan(35);
    });
  });

  /**
   * What the sweep had to leave working, asserted rather than assumed.
   *
   * Gating writes is easy to get *too* right: the failure mode of a security
   * pass like this is not a hole left open, it is an employee who can no longer
   * ask for a day off. These are the routes that must keep answering to somebody
   * holding nothing but the `USER` baseline.
   */
  describe('no self-service regression', () => {
    /** Twelve permissions and no exceptions — the whole of an employee. */
    const employee = () => as(UserRole.USER, 'usr-plain');

    it('lets an employee read and edit their own profile', async () => {
      await request(app.getHttpServer())
        .get(`${BASE}/profile/me`)
        .set(employee())
        .expect(200);

      await request(app.getHttpServer())
        .patch(`${BASE}/profile/me`)
        .set(employee())
        .send({})
        .expect(200);

      expect(writes.profile.updateOwn).toHaveBeenCalledTimes(1);
    });

    /**
     * The `/me` leave routes, on the three keys `OWN_WORK` grants.
     *
     * `POST` is asserted as "not refused" rather than as a `201`, because its
     * body is a real leave request — dates, a type, a replacement — and building
     * a valid one here would be re-testing `CreateLeaveRequestDto`. What matters
     * is that the guard is not what stops it.
     */
    it('lets an employee manage their own leave requests', async () => {
      const created = await request(app.getHttpServer())
        .post(`${BASE}/me/leave-requests`)
        .set(employee())
        .send({});

      expect(created.status).not.toBe(403);

      await request(app.getHttpServer())
        .patch(`${BASE}/me/leave-requests/lr-1`)
        .set(employee())
        .send({})
        .expect(200);

      await request(app.getHttpServer())
        .delete(`${BASE}/me/leave-requests/lr-1`)
        .set(employee())
        .expect(200);

      expect(writes.leaveRequests.updateOwn).toHaveBeenCalledTimes(1);
      expect(writes.leaveRequests.removeOwn).toHaveBeenCalledTimes(1);
    });

    /**
     * The same employee, on the same request, before and after the boundary:
     * they may still pick a project for their timesheet and may no longer create
     * one. Both halves in one test, because either alone is the bug.
     */
    it('leaves the project picker open and the project writes shut', async () => {
      await request(app.getHttpServer())
        .get(`${BASE}/projects`)
        .set(employee())
        .expect(200);

      await request(app.getHttpServer())
        .post(`${BASE}/projects`)
        .set(employee())
        .send({})
        .expect(403);

      expect(projects.findAll).toHaveBeenCalledTimes(1);
      expect(projects.create).not.toHaveBeenCalled();
    });

    /**
     * Reading is untouched everywhere, which is the other half of "only write
     * verbs were swept". One read per newly gated controller would be noise;
     * these four are the ones a screen breaks without.
     */
    it('leaves the reference lists readable', async () => {
      for (const path of [
        '/public-holidays',
        '/departments',
        '/leave-types',
        '/work-schedule',
      ]) {
        await request(app.getHttpServer())
          .get(`${BASE}${path}`)
          .set(employee())
          .expect(200);
      }
    });

    /**
     * The administrative inbox, whose two writes the sweep deliberately did not
     * gate: they manage the caller's own notifications, and the catalog says
     * outright that reading one's own inbox "is denied to nobody".
     *
     * What keeps an ordinary employee out of this workspace is the
     * administrative-role check inside `NotificationService` — stubbed here, and
     * tested in Feature 026's own specs. This asserts only what belongs to this
     * file: that no `@RequirePermission` stands in front of it.
     */
    it('leaves the administrative inbox writes ungated', async () => {
      const hr = as(UserRole.HR, 'usr-hr-inbox');

      await request(app.getHttpServer())
        .patch(`${BASE}/administrative/notifications/read-all`)
        .set(hr)
        .expect(200);

      await request(app.getHttpServer())
        .delete(`${BASE}/administrative/notifications`)
        .set(hr)
        .expect(200);

      expect(writes.notifications.markAllAdministrativeRead).toHaveBeenCalled();
      expect(writes.notifications.removeAllAdministrative).toHaveBeenCalled();
    });

    /**
     * And the personal inbox beside it, for the same reason and for a caller who
     * holds nothing administrative at all.
     */
    it('leaves an employee able to clear their own inbox', async () => {
      await request(app.getHttpServer())
        .patch(`${BASE}/notifications/read-all`)
        .set(employee())
        .expect(200);

      await request(app.getHttpServer())
        .delete(`${BASE}/notifications`)
        .set(employee())
        .expect(200);

      // …but not to announce anything to anybody else.
      await request(app.getHttpServer())
        .post(`${BASE}/notifications`)
        .set(employee())
        .send({})
        .expect(403);

      expect(writes.notifications.create).not.toHaveBeenCalled();
    });
  });
});
