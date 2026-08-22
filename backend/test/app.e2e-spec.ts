import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';

import {
  ADMIN_STANDARD,
  HR_STANDARD,
  USER_BASELINE,
} from '../prisma/seeds/permission-sets';
import { ALL_PERMISSION_KEYS } from '../prisma/seeds/permissions.seed';
import { AppModule } from '../src/app.module';
import { API_BASE_PATH } from '../src/config/api.constants';
import { configureApp } from '../src/config/app.setup';
import { UserRole } from '../src/generated/prisma/enums';
import { AuthService } from '../src/modules/auth/auth.service';
import { TestAuthentication } from '../src/modules/auth/testing/authentication.testing';
import { PermissionService } from '../src/modules/permission-management/permission.service';

const ALLOWED_ORIGIN = 'http://localhost:5173';

/**
 * Authorization for a suite that is not *about* authorization, and that has no
 * database.
 *
 * `PermissionsGuard` resolves the caller's effective set through
 * `PermissionService.resolveEffective`, which reads the catalog and two tables —
 * **on every gated route, including for a super-admin**, whose branch still
 * fetches the catalog rows it maps. Until Feature 041 that cost this suite
 * nothing, because none of the routes it exercises declared a requirement. The
 * sweep gated every write verb, so without this override half the assertions
 * below would need PostgreSQL to answer a question about the `ValidationPipe`.
 *
 * The stub is the same trade `auth.stub` makes one paragraph up: substitute the
 * layer this file is not about, keep the thing being asserted real. What it does
 * *not* do is invent a permission model — the three role sets are imported from
 * `prisma/seeds/permission-sets.ts`, so a caller here holds exactly what the
 * shipped product grants them, and a test that passes because an `ADMIN`
 * genuinely lacks a key (see the two approval-address cases below) keeps failing
 * for that reason rather than being papered over.
 *
 * Per-user overrides are deliberately absent: nothing in this suite grants or
 * revokes one, and `authorization/routing.spec.ts` is where the override
 * mechanism is exercised against the real resolver.
 */
const BASELINES: Record<UserRole, readonly string[]> = {
  [UserRole.USER]: USER_BASELINE,
  [UserRole.HR]: HR_STANDARD,
  [UserRole.ADMIN]: ADMIN_STANDARD,
  // Every key, by resolution rather than by configuration — the real branch.
  [UserRole.SUPERADMIN]: ALL_PERMISSION_KEYS,
};

const permissions = {
  resolveEffective: (userId: string, role: UserRole) =>
    Promise.resolve({
      userId,
      role,
      readOnly: role === UserRole.SUPERADMIN,
      // The guard reads `key` and `granted` and nothing else, so the cells carry
      // those two. A full `PermissionMatrixCell` is what the *screen* needs.
      permissions: BASELINES[role].map((key) => ({ key, granted: true })),
    }),
};

/**
 * Authentication for a suite that is not *about* authentication.
 *
 * The same `TestAuthentication` the nineteen module routing specs use, and for
 * the same reason Feature 032 wrote it: every assertion below was written before
 * a token was required, every one of them is still worth making, and none of
 * them should become a test of JWT verification. The real `JwtAuthGuard` runs —
 * it is registered by `AppModule` as an `APP_GUARD` and nothing here overrides
 * it — with a stubbed `AuthService` behind it.
 *
 * The difference from a routing spec is only in how the stub is installed: those
 * build a module out of one controller and spread `auth.providers` into it, while
 * this boots the whole `AppModule` and therefore has to *replace* the real
 * `AuthService` rather than provide one. Everything else — the guard, the pipe,
 * the interceptor, the filter, every controller and every DTO — is the
 * application's own.
 *
 * `AuthController` receives the stub too, which is why no `/auth` route is
 * exercised here. What those routes do is `auth/routing.spec.ts` and
 * `auth/account-lifecycle.routing.spec.ts`.
 */
const auth = new TestAuthentication();

/**
 * Application endpoints, end to end.
 *
 * **Everything here is answered before a handler touches the database**, which
 * is what lets the suite run with no PostgreSQL at all: a route that does not
 * exist, a request with no token, a body the `ValidationPipe` rejects, or an
 * access rule checked at the top of a handler. That constraint is deliberate and
 * it is also the reason no test below asks for a successful `200` from a
 * business module — the assertions that need real rows live in each module's own
 * service spec.
 *
 * Two status codes carry most of the meaning, and the distinction is worth
 * stating once:
 *
 * - **`404` means the route does not exist.** An unmatched path never reaches a
 *   guard, so this is how "there is deliberately no such endpoint" is asserted.
 * - **`401` means the route exists and is guarded.** It is the proof a route is
 *   registered *and* protected, which a `404` would disprove and a `200` would
 *   have said nothing about.
 */
describe('Application endpoints (e2e)', () => {
  // Typing the app with `App` keeps `getHttpServer()` strongly typed for supertest.
  let app: INestApplication<App>;

  beforeAll(async () => {
    // Set before the module is compiled: @nestjs/config reads process.env, and
    // dotenv never overwrites a value that is already there.
    process.env.CORS_ORIGINS = ALLOWED_ORIGIN;

    const moduleRef: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(AuthService)
      .useValue(auth.stub)
      .overrideProvider(PermissionService)
      .useValue(permissions)
      .compile();

    app = moduleRef.createNestApplication();
    configureApp(app);
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it(`GET ${API_BASE_PATH} returns the greeting in the success envelope`, () => {
    return request(app.getHttpServer())
      .get(API_BASE_PATH)
      .expect(200)
      .expect({ success: true, data: { message: 'Hello from the backend' } });
  });

  it(`GET ${API_BASE_PATH}/health returns the health status`, () => {
    return request(app.getHttpServer())
      .get(`${API_BASE_PATH}/health`)
      .expect(200)
      .expect({ success: true, data: { status: 'ok', service: 'backend' } });
  });

  it('GET /health without the prefix is not routed', () => {
    return request(app.getHttpServer()).get('/health').expect(404);
  });

  it('renders an unmatched route as the error envelope', async () => {
    const response = await request(app.getHttpServer())
      .get(`${API_BASE_PATH}/does-not-exist`)
      .expect(404);

    expect(response.body).toEqual({
      success: false,
      statusCode: 404,
      message: expect.any(String) as unknown as string,
      path: `${API_BASE_PATH}/does-not-exist`,
      timestamp: expect.any(String) as unknown as string,
    });
  });

  /**
   * What Feature 032 made true of the whole API, asserted from the outside.
   *
   * Before it, every route below answered an anonymous caller; the day the
   * global guard was registered, this suite's assertions started failing with
   * `401` where they expected `400`. That breakage was the feature working, and
   * this block is it written down: a request with no token is refused by every
   * business module, with the envelope Feature 033 defined and the code a
   * frontend keys its translation on.
   *
   * The two routes deliberately absent are `GET /` and `GET /health`, which
   * carry `@Public()` because a container runtime polls them — they are asserted
   * above, and they answer `200`.
   */
  describe('the global guard', () => {
    it.each([
      ['departments', `${API_BASE_PATH}/departments`],
      ['positions', `${API_BASE_PATH}/positions`],
      ['users', `${API_BASE_PATH}/users`],
      ['employees', `${API_BASE_PATH}/employees`],
      ['the work schedule', `${API_BASE_PATH}/work-schedule`],
      ['leave requests', `${API_BASE_PATH}/leave-requests`],
      ['one’s own leave requests', `${API_BASE_PATH}/me/leave-requests`],
    ])('refuses an unauthenticated request to %s', (_module, path) => {
      return request(app.getHttpServer()).get(path).expect(401);
    });

    it('refuses a token it never issued', () => {
      return request(app.getHttpServer())
        .get(`${API_BASE_PATH}/departments`)
        .set({ authorization: 'Bearer forged' })
        .expect(401);
    });

    it('renders the refusal as the error envelope, with its code', async () => {
      const response = await request(app.getHttpServer())
        .get(`${API_BASE_PATH}/departments`)
        .expect(401);

      expect(response.body).toMatchObject({
        success: false,
        statusCode: 401,
        errorCode: 'AUTH_UNAUTHENTICATED',
      });
    });
  });

  /**
   * Only requests the `ValidationPipe` rejects before the handler runs, so the
   * suite still needs no database. What they prove is the wiring: the module is
   * mounted under the versioned prefix, its DTOs are applied by the global pipe,
   * and a rejection is rendered as the error envelope rather than Nest's
   * default body.
   *
   * Every request carries a token because the pipe now runs *behind* the guard.
   * That ordering is itself asserted, above and below: without the header these
   * same requests answer `401` and the DTO is never consulted.
   */
  describe('departments', () => {
    const DEPARTMENTS_PATH = `${API_BASE_PATH}/departments`;

    it('rejects a page size above the shared cap', () => {
      return request(app.getHttpServer())
        .get(DEPARTMENTS_PATH)
        .set(auth.as())
        .query({ limit: 101 })
        .expect(400)
        .expect(({ body }: { body: { success: boolean } }) => {
          expect(body.success).toBe(false);
        });
    });

    it('rejects a column that is not sortable', () => {
      return request(app.getHttpServer())
        .get(DEPARTMENTS_PATH)
        .set(auth.as())
        .query({ sortBy: 'description' })
        .expect(400);
    });

    it('reports every missing field of a creation payload at once', async () => {
      const response = await request(app.getHttpServer())
        .post(DEPARTMENTS_PATH)
        .set(auth.as())
        .send({})
        .expect(400);

      const { message } = response.body as { message: string[] };

      expect(message).toEqual(expect.arrayContaining([expect.any(String)]));
      expect(message.join(' ')).toMatch(/code/);
      expect(message.join(' ')).toMatch(/name/);
    });
  });

  /**
   * The same three checks against the second module, which is what makes them
   * worth repeating: they prove `PositionModule` is mounted under the versioned
   * prefix with its own DTOs, rather than that the `ValidationPipe` works — the
   * departments block already established that.
   */
  describe('positions', () => {
    const POSITIONS_PATH = `${API_BASE_PATH}/positions`;

    it('rejects a page size above the shared cap', () => {
      return request(app.getHttpServer())
        .get(POSITIONS_PATH)
        .set(auth.as())
        .query({ limit: 101 })
        .expect(400)
        .expect(({ body }: { body: { success: boolean } }) => {
          expect(body.success).toBe(false);
        });
    });

    it('rejects a column that is not sortable', () => {
      return request(app.getHttpServer())
        .get(POSITIONS_PATH)
        .set(auth.as())
        .query({ sortBy: 'description' })
        .expect(400);
    });

    it('reports every missing field of a creation payload at once', async () => {
      const response = await request(app.getHttpServer())
        .post(POSITIONS_PATH)
        .set(auth.as())
        .send({})
        .expect(400);

      const { message } = response.body as { message: string[] };

      expect(message).toEqual(expect.arrayContaining([expect.any(String)]));
      expect(message.join(' ')).toMatch(/code/);
      expect(message.join(' ')).toMatch(/name/);
    });
  });

  /**
   * The users block asserts what is specific to this module rather than
   * repeating the two blocks above: that `passwordHash` is not a field a client
   * can supply, that the boolean filter accepts exactly two spellings, and —
   * since Feature 036 — that these routes belong to account administrators
   * alone. All of it is decided before a row is read, so the suite still needs
   * no database.
   *
   * Every request here authenticates as an `ADMIN`, because `HR` is refused
   * outright: see the access block at the end.
   */
  describe('users', () => {
    const USERS_PATH = `${API_BASE_PATH}/users`;
    const asAdmin = () => auth.as({ role: UserRole.ADMIN });

    it('rejects a page size above the shared cap', () => {
      return request(app.getHttpServer())
        .get(USERS_PATH)
        .set(asAdmin())
        .query({ limit: 101 })
        .expect(400)
        .expect(({ body }: { body: { success: boolean } }) => {
          expect(body.success).toBe(false);
        });
    });

    it('rejects a column that is not sortable', () => {
      return request(app.getHttpServer())
        .get(USERS_PATH)
        .set(asAdmin())
        .query({ sortBy: 'passwordHash' })
        .expect(400);
    });

    it('rejects a boolean filter that is neither true nor false', () => {
      return request(app.getHttpServer())
        .get(USERS_PATH)
        .set(asAdmin())
        .query({ isActive: 'yes' })
        .expect(400);
    });

    /**
     * **`password` is deliberately absent from this list, and that is Feature
     * 036.** This assertion used to require it: an administrator chose the
     * password and the new colleague was told it. `CreateUserDto` has no such
     * field any more — the account is created without a password at all and its
     * owner sets their own through the emailed activation link — so a payload
     * missing one is not incomplete, and reporting it as missing would be the
     * bug.
     */
    it('reports every missing field of a creation payload at once', async () => {
      const response = await request(app.getHttpServer())
        .post(USERS_PATH)
        .set(asAdmin())
        .send({})
        .expect(400);

      const reported = (response.body as { message: string[] }).message.join(
        ' ',
      );

      expect(reported).toMatch(/email/);
      expect(reported).toMatch(/role/);
      expect(reported).not.toMatch(/password/);
    });

    /**
     * The other half of the same rule, and the reason the field's absence is
     * safe: `forbidNonWhitelisted` turns "not a field" into an explicit refusal
     * naming it. An administrator who tries to set a password — or to write a
     * hash directly — is told no, rather than having it silently dropped and
     * walking away believing they know somebody's credential.
     */
    it.each(['password', 'passwordHash'])(
      'refuses %s supplied by the client, by name',
      async (field) => {
        const response = await request(app.getHttpServer())
          .post(USERS_PATH)
          .set(asAdmin())
          .send({
            email: 'ana.pop@example.com',
            role: 'ADMIN',
            [field]: 'correct horse battery',
          })
          .expect(400);

        const reported = (response.body as { message: string[] }).message.join(
          ' ',
        );

        expect(reported).toMatch(new RegExp(field));
      },
    );

    /**
     * Feature 036's access rule, from the outside.
     *
     * `assertAccountAdministrator` runs at the top of every handler here, so a
     * refused caller is turned away before the service is reached — which is
     * exactly why it can be asserted without a database.
     *
     * **HR is the case worth pinning.** An HR administrator is the most
     * privileged non-account role in the application and is deliberately still
     * refused: an account list is a list of everybody who can sign in and what
     * authority each one holds. The rule is a role check rather than a
     * configurable permission precisely because whoever can set a role can set
     * their own.
     */
    describe('access', () => {
      it.each([UserRole.HR, UserRole.USER])(
        'refuses %s with 403, not 401',
        (role) => {
          return request(app.getHttpServer())
            .get(USERS_PATH)
            .set(auth.as({ role }))
            .expect(403);
        },
      );

      it('names the reason with a stable code', async () => {
        const response = await request(app.getHttpServer())
          .get(USERS_PATH)
          .set(auth.as({ role: UserRole.HR }))
          .expect(403);

        expect(response.body).toMatchObject({
          success: false,
          statusCode: 403,
          errorCode: 'AUTHORIZATION_ACCOUNT_ADMIN_REQUIRED',
        });
      });
    });
  });

  /**
   * The employees block asserts what is specific to this module: a payload is
   * expected to name all three relations, the two enum fields are closed
   * vocabularies, and the entitlement is a positive integer. All of it is
   * rejected by the `ValidationPipe` before the handler runs, so the suite
   * still needs no database — which is also why the relation checks themselves
   * (does this department exist?) are not exercised here.
   */
  describe('employees', () => {
    const EMPLOYEES_PATH = `${API_BASE_PATH}/employees`;

    it('rejects a page size above the shared cap', () => {
      return request(app.getHttpServer())
        .get(EMPLOYEES_PATH)
        .set(auth.as())
        .query({ limit: 101 })
        .expect(400)
        .expect(({ body }: { body: { success: boolean } }) => {
          expect(body.success).toBe(false);
        });
    });

    it('rejects a column that is not sortable', () => {
      return request(app.getHttpServer())
        .get(EMPLOYEES_PATH)
        .set(auth.as())
        .query({ sortBy: 'phone' })
        .expect(400);
    });

    it('rejects a status outside the enum', () => {
      return request(app.getHttpServer())
        .get(EMPLOYEES_PATH)
        .set(auth.as())
        .query({ status: 'RETIRED' })
        .expect(400);
    });

    it('reports every missing field of a creation payload at once', async () => {
      const response = await request(app.getHttpServer())
        .post(EMPLOYEES_PATH)
        .set(auth.as())
        .send({})
        .expect(400);

      const { message } = response.body as { message: string[] };
      const reported = message.join(' ');

      expect(reported).toMatch(/employeeCode/);
      expect(reported).toMatch(/firstName/);
      expect(reported).toMatch(/lastName/);
      expect(reported).toMatch(/hireDate/);
      expect(reported).toMatch(/departmentId/);
      expect(reported).toMatch(/positionId/);
      expect(reported).toMatch(/seniority/);
      expect(reported).toMatch(/status/);
    });

    /**
     * **`userId` left this list with Feature 036**, which is asserted rather
     * than merely omitted above.
     *
     * It used to be required: an employee named an account that already
     * existed. Now exactly one of `userId` and `account` must be given — the
     * second creates the account in the same breath — and "exactly one of two
     * fields" is a rule about a pair, which no per-field decorator can state.
     * The `ValidationPipe` therefore says nothing about either, and the service
     * enforces the pair rule — `employee.service.spec.ts` is where the
     * "neither" and "both" refusals are exercised, because both need the
     * service behind them.
     */
    it('no longer reports a missing account, which is now a rule about a pair', async () => {
      const response = await request(app.getHttpServer())
        .post(EMPLOYEES_PATH)
        .set(auth.as())
        .send({})
        .expect(400);

      const reported = (response.body as { message: string[] }).message.join(
        ' ',
      );

      expect(reported).not.toMatch(/userId/);
      expect(reported).not.toMatch(/account/);
    });

    /**
     * Feature 022 moved leave entitlement out of this resource into
     * `employee_leave_balances`, so the field is no longer merely out of range —
     * it is unknown, which `forbidNonWhitelisted` rejects.
     */
    it('rejects a vacation entitlement, which this resource no longer has', () => {
      return request(app.getHttpServer())
        .patch(`${EMPLOYEES_PATH}/emp-1`)
        .set(auth.as())
        .send({ maxVacationDays: 21 })
        .expect(400);
    });
  });

  /**
   * The work-schedule block asserts what is specific to this module: the
   * configuration is written with a `PUT` at a path carrying no id, a partial
   * body is refused because that `PUT` replaces rather than merges, and the
   * approval addresses live under the schedule rather than at a collection of
   * their own. All of it is rejected by the `ValidationPipe` before the handler
   * runs, so the suite still needs no database — which is also why the "not
   * configured yet" 404 is not exercised here.
   */
  describe('work schedule', () => {
    const WORK_SCHEDULE_PATH = `${API_BASE_PATH}/work-schedule`;

    it('reports every missing field of a configuration at once', async () => {
      const response = await request(app.getHttpServer())
        .put(WORK_SCHEDULE_PATH)
        .set(auth.as())
        .send({})
        .expect(400);

      const { message } = response.body as { message: string[] };
      const reported = message.join(' ');

      expect(reported).toMatch(/workingDays/);
      expect(reported).toMatch(/workStartTime/);
      expect(reported).toMatch(/workEndTime/);
      expect(reported).toMatch(/minHoursPerEntry/);
      expect(reported).toMatch(/maxHoursPerEntry/);
      expect(reported).toMatch(/maxHoursPerDay/);
      expect(reported).toMatch(/standardHoursPerDay/);
      expect(reported).toMatch(/standardHoursPerWeek/);
      expect(reported).toMatch(/lunchBreakHours/);
    });

    it('rejects a working day that is not a weekday', async () => {
      const response = await request(app.getHttpServer())
        .put(WORK_SCHEDULE_PATH)
        .set(auth.as())
        .send({ workingDays: ['FUNDAY'] })
        .expect(400);

      const { message } = response.body as { message: string[] };

      expect(message.join(' ')).toMatch(/workingDays/);
    });

    it('rejects a start time that is not HH:mm', () => {
      return request(app.getHttpServer())
        .put(WORK_SCHEDULE_PATH)
        .set(auth.as())
        .send({ workStartTime: '9am' })
        .expect(400);
    });

    /**
     * The zone is optional, so it is absent from the missing-field report above;
     * what it must never be is a free-text field. `Europe/Atlantis` is well
     * shaped and names nothing, which is the case a `Region/City` pattern would
     * have waved through.
     */
    it('rejects a timezone that is not an IANA zone name', async () => {
      const response = await request(app.getHttpServer())
        .put(WORK_SCHEDULE_PATH)
        .set(auth.as())
        .send({ timezone: 'Europe/Atlantis' })
        .expect(400);

      const { message } = response.body as { message: string[] };

      expect(message.join(' ')).toMatch(/timezone/);
    });

    /**
     * The two address cases are sent as a **super-admin**, and the departure
     * from `auth.as()` everywhere else in this block is the point rather than a
     * workaround.
     *
     * Feature 041 gated `POST /work-schedule/emails` on
     * `WORK_SCHEDULE.CONFIGURE`, which the `ADMIN` baseline deliberately
     * withholds — it is one of the nine cells `Admin - Standard` does not carry,
     * because rerouting the approval mail is an act whose consequences outlive
     * the click. So the default caller now meets a `403` here and never reaches
     * the `ValidationPipe`, while `PUT /work-schedule` above is fine on
     * `WORK_SCHEDULE.EDIT`, which that baseline does hold. Both of those are
     * correct, and both are asserted in `authorization/routing.spec.ts`.
     *
     * These two tests are about the DTO, so they need a caller who clears the
     * gate. That is the honest fix: a super-admin, holding every key by
     * resolution.
     */
    const asSuperAdmin = () => auth.as({ role: UserRole.SUPERADMIN });

    it('rejects an approval address that is not an address', () => {
      return request(app.getHttpServer())
        .post(`${WORK_SCHEDULE_PATH}/emails`)
        .set(asSuperAdmin())
        .send({ email: 'not-an-email' })
        .expect(400);
    });

    it('refuses a schedule id supplied alongside an approval address', () => {
      return request(app.getHttpServer())
        .post(`${WORK_SCHEDULE_PATH}/emails`)
        .set(asSuperAdmin())
        .send({ email: 'hr@example.com', workScheduleId: 'work_schedule' })
        .expect(400);
    });

    /** There is one configuration, so no route addresses one by id. */
    it('does not route a configuration by id', () => {
      return request(app.getHttpServer())
        .get(`${WORK_SCHEDULE_PATH}/work_schedule`)
        .set(auth.as())
        .expect(404);
    });
  });

  /**
   * The leave-requests block asserts what is specific to Feature 023: two
   * collections under one prefix that must not swallow each other, and the
   * fields a client is refused because the server decides them. Everything here
   * is rejected before a handler runs, so the suite still needs no database.
   *
   * **What changed with Feature 032.** These tests were written against an
   * `x-employee-id` header that stood in for authentication until it existed.
   * That header is read nowhere now: the requester is the caller, resolved from
   * the token by `@CurrentEmployeeId()`. So the header is gone from every
   * request below, and the test that used to assert it was required now asserts
   * the rule that replaced it — an account with no employment record cannot file
   * leave, and is told so with `403` rather than a `400` naming a header.
   */
  describe('leave requests', () => {
    const LEAVE_REQUESTS_PATH = `${API_BASE_PATH}/leave-requests`;
    const MY_LEAVE_REQUESTS_PATH = `${API_BASE_PATH}/me/leave-requests`;

    it('reports every missing field of a request at once', async () => {
      const response = await request(app.getHttpServer())
        .post(MY_LEAVE_REQUESTS_PATH)
        .set(auth.as({ employeeId: 'emp-1' }))
        .send({})
        .expect(400);

      const { message } = response.body as { message: string[] };
      const reported = message.join(' ');

      expect(reported).toMatch(/leaveTypeId/);
      expect(reported).toMatch(/startDate/);
      expect(reported).toMatch(/endDate/);
      expect(reported).toMatch(/replacementEmployeeIds/);
    });

    it('refuses a request with no replacement, which is the feature’s rule', () => {
      return request(app.getHttpServer())
        .post(MY_LEAVE_REQUESTS_PATH)
        .set(auth.as({ employeeId: 'emp-1' }))
        .send({
          leaveTypeId: 'lvt-1',
          startDate: '2026-09-07',
          endDate: '2026-09-11',
          replacementEmployeeIds: [],
        })
        .expect(400);
    });

    /**
     * The requester is the caller, not a field — which is what keeps `/me`
     * honest. Feature 032 made it structural: there is no longer any channel
     * through which a requester could be claimed.
     */
    it('refuses an employee id supplied in the body', () => {
      return request(app.getHttpServer())
        .post(MY_LEAVE_REQUESTS_PATH)
        .set(auth.as({ employeeId: 'emp-1' }))
        .send({ employeeId: 'emp-2' })
        .expect(400);
    });

    /** An employee does not decide whether their own leave is approved. */
    it('refuses a status supplied when filing', () => {
      return request(app.getHttpServer())
        .post(MY_LEAVE_REQUESTS_PATH)
        .set(auth.as({ employeeId: 'emp-1' }))
        .send({ status: 'APPROVED' })
        .expect(400);
    });

    /** Computed from three tables on every read; a client cannot state it. */
    it('refuses a working-day count supplied by the client', () => {
      return request(app.getHttpServer())
        .post(MY_LEAVE_REQUESTS_PATH)
        .set(auth.as({ employeeId: 'emp-1' }))
        .send({ requestedWorkingDays: 5 })
        .expect(400);
    });

    /**
     * The rule that replaced the `x-employee-id` header.
     *
     * A super-admin created to administer the system authenticates perfectly
     * well and has no employment record, so a `/me` route cannot resolve a
     * requester for them. That is `403` — nothing is wrong with the credential,
     * only with what the account *is* — and it is decided by
     * `@CurrentEmployeeId()` before the handler runs, which is why no database
     * is needed to assert it.
     */
    it('refuses a /me route to an account with no employment record', async () => {
      const response = await request(app.getHttpServer())
        .get(MY_LEAVE_REQUESTS_PATH)
        .set(auth.as({ employeeId: null }))
        .expect(403);

      expect(response.body).toMatchObject({
        success: false,
        statusCode: 403,
        errorCode: 'AUTH_NO_EMPLOYEE_RECORD',
      });
    });

    /**
     * That `/me/leave-requests` is not swallowed by `/leave-requests/:id` is
     * asserted in `leave-requests/routing.spec.ts` rather than here, and
     * deliberately so: with a real module behind it the `/me` list reaches its
     * handler and answers a perfectly correct 404 for an employee that does not
     * exist — indistinguishable, from outside, from the routing failure the
     * check is meant to catch. The routing spec mocks the service, so the two
     * outcomes stay distinct.
     */

    /** There is no way back into the undecided state, from any endpoint. */
    it('refuses PENDING as a decision', () => {
      return request(app.getHttpServer())
        .patch(`${LEAVE_REQUESTS_PATH}/lvr-1/status`)
        .set(auth.as({ employeeId: 'emp-9' }))
        .send({ status: 'PENDING' })
        .expect(400);
    });

    it('refuses a decider supplied in the body rather than taken from the token', () => {
      return request(app.getHttpServer())
        .patch(`${LEAVE_REQUESTS_PATH}/lvr-1/status`)
        .set(auth.as({ employeeId: 'emp-9' }))
        .send({ status: 'APPROVED', processedById: 'emp-8' })
        .expect(400);
    });

    /** Leave is asked for by the person taking it, and never erased by HR. */
    it('has no POST or DELETE on the HR collection', async () => {
      await request(app.getHttpServer())
        .post(LEAVE_REQUESTS_PATH)
        .set(auth.as())
        .expect(404);
      await request(app.getHttpServer())
        .delete(`${LEAVE_REQUESTS_PATH}/lvr-1`)
        .set(auth.as())
        .expect(404);
    });

    it('rejects a page size above the shared cap', () => {
      return request(app.getHttpServer())
        .get(`${LEAVE_REQUESTS_PATH}?limit=1000`)
        .set(auth.as())
        .expect(400);
    });

    it('rejects a column that is not sortable', () => {
      return request(app.getHttpServer())
        .get(`${LEAVE_REQUESTS_PATH}?sortBy=requestedWorkingDays`)
        .set(auth.as())
        .expect(400);
    });
  });

  /**
   * The email block asserts what is specific to Feature 025: the one endpoint
   * that accepts a body accepts exactly one address, and there is no endpoint at
   * all for sending a message somebody else wrote. Everything here is rejected
   * before a handler runs, so no mail server is contacted.
   *
   * `GET /email/health` is deliberately not requested. It is the one route in
   * this suite whose handler would reach outside the process — on a machine
   * with SMTP configured it opens a real connection — which would make the run
   * depend on the developer's `.env` and on a network. The three answers it can
   * give are pinned in `email.service.spec.ts` instead, against a mocked
   * transport.
   */
  describe('email', () => {
    const EMAIL_PATH = `${API_BASE_PATH}/email`;

    it('rejects a test address that is not an address', () => {
      return request(app.getHttpServer())
        .post(`${EMAIL_PATH}/test`)
        .set(auth.as())
        .send({ email: 'not-an-email' })
        .expect(400);
    });

    it('rejects a missing address', async () => {
      const response = await request(app.getHttpServer())
        .post(`${EMAIL_PATH}/test`)
        .set(auth.as())
        .send({})
        .expect(400);

      const { message } = response.body as { message: string[] };

      expect(message.join(' ')).toMatch(/email/);
    });

    /**
     * The message is fixed precisely so this endpoint cannot become a way to
     * send arbitrary mail from the company's server. Feature 032 put a token in
     * front of it as well, so it is now closed twice over.
     */
    it.each([{ subject: 'Anything I like' }, { html: '<p>Click here</p>' }])(
      'refuses an attempt to steer the message with %p',
      (extra) => {
        return request(app.getHttpServer())
          .post(`${EMAIL_PATH}/test`)
          .set(auth.as())
          .send({ email: 'john@example.com', ...extra })
          .expect(400);
      },
    );

    /** Sending is reached by injecting the service, never over HTTP. */
    it('exposes no endpoint for sending a caller-supplied message', async () => {
      await request(app.getHttpServer())
        .post(EMAIL_PATH)
        .set(auth.as())
        .expect(404);
      await request(app.getHttpServer())
        .post(`${EMAIL_PATH}/send`)
        .set(auth.as())
        .expect(404);
    });
  });

  describe('notification delivery', () => {
    const DELIVERY_PATH = `${API_BASE_PATH}/notification-delivery`;

    /**
     * The engine's whole HTTP surface is one route, and it is documented as
     * existing for development and Postman testing. What can be asserted without
     * a database is which URLs the application answers on.
     *
     * `401` is the assertion, and it is a stronger one than the message check it
     * replaced: an unmatched `POST` renders `404 Cannot POST …`, so a refusal
     * that names the *credential* proves the route is both registered and
     * guarded. Sending a token instead would reach the handler and the database,
     * which this suite does not have.
     */
    it('registers the manual execution route, behind the guard', () => {
      return request(app.getHttpServer())
        .post(`${DELIVERY_PATH}/execute/cmp-does-not-exist`)
        .expect(401);
    });

    /**
     * A reminder is a standing rule whose whole point is the schedule. A route
     * that fired one by hand would be a way to warn the entire company on a
     * Tuesday afternoon by mistake, so the reminder path is reachable only
     * through the scheduler.
     */
    it('offers no way to fire a reminder over HTTP', async () => {
      await request(app.getHttpServer())
        .post(`${DELIVERY_PATH}/execute-reminder/rmd-1`)
        .set(auth.as())
        .expect(404);
    });

    it('exposes no collection and no read routes of its own', async () => {
      await request(app.getHttpServer())
        .get(DELIVERY_PATH)
        .set(auth.as())
        .expect(404);
      await request(app.getHttpServer())
        .get(`${DELIVERY_PATH}/execute/cmp-1`)
        .set(auth.as())
        .expect(404);
    });

    /**
     * Feature 027 asserts the same two absences from its own side. Sending stays
     * under this feature's prefix, so a module that stores intentions keeps
     * having no route that acts on them.
     */
    it('leaves the campaign and reminder resources without a send route', async () => {
      await request(app.getHttpServer())
        .post(`${API_BASE_PATH}/notification-campaigns/cmp-1/send`)
        .set(auth.as())
        .expect(404);
      await request(app.getHttpServer())
        .post(`${API_BASE_PATH}/reminders/rmd-1/execute`)
        .set(auth.as())
        .expect(404);
    });
  });

  it('answers an allowed origin with the CORS headers', () => {
    return request(app.getHttpServer())
      .get(`${API_BASE_PATH}/health`)
      .set('Origin', ALLOWED_ORIGIN)
      .expect(200)
      .expect('Access-Control-Allow-Origin', ALLOWED_ORIGIN)
      .expect('Access-Control-Allow-Credentials', 'true');
  });

  it('sends no CORS headers to an origin that is not allowed', async () => {
    const response = await request(app.getHttpServer())
      .get(`${API_BASE_PATH}/health`)
      .set('Origin', 'https://evil.example.com')
      .expect(200);

    expect(response.headers['access-control-allow-origin']).toBeUndefined();
  });
});
