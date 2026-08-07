import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';

import { AppModule } from '../src/app.module';
import { API_BASE_PATH } from '../src/config/api.constants';
import { configureApp } from '../src/config/app.setup';

const ALLOWED_ORIGIN = 'http://localhost:5173';

describe('Application endpoints (e2e)', () => {
  // Typing the app with `App` keeps `getHttpServer()` strongly typed for supertest.
  let app: INestApplication<App>;

  beforeAll(async () => {
    // Set before the module is compiled: @nestjs/config reads process.env, and
    // dotenv never overwrites a value that is already there.
    process.env.CORS_ORIGINS = ALLOWED_ORIGIN;

    const moduleRef: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

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
   * Only requests the `ValidationPipe` rejects before the handler runs, so the
   * suite still needs no database. What they prove is the wiring: the module is
   * mounted under the versioned prefix, its DTOs are applied by the global pipe,
   * and a rejection is rendered as the error envelope rather than Nest's
   * default body.
   */
  describe('departments', () => {
    const DEPARTMENTS_PATH = `${API_BASE_PATH}/departments`;

    it('rejects a page size above the shared cap', () => {
      return request(app.getHttpServer())
        .get(DEPARTMENTS_PATH)
        .query({ limit: 101 })
        .expect(400)
        .expect(({ body }: { body: { success: boolean } }) => {
          expect(body.success).toBe(false);
        });
    });

    it('rejects a column that is not sortable', () => {
      return request(app.getHttpServer())
        .get(DEPARTMENTS_PATH)
        .query({ sortBy: 'description' })
        .expect(400);
    });

    it('reports every missing field of a creation payload at once', async () => {
      const response = await request(app.getHttpServer())
        .post(DEPARTMENTS_PATH)
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
        .query({ limit: 101 })
        .expect(400)
        .expect(({ body }: { body: { success: boolean } }) => {
          expect(body.success).toBe(false);
        });
    });

    it('rejects a column that is not sortable', () => {
      return request(app.getHttpServer())
        .get(POSITIONS_PATH)
        .query({ sortBy: 'description' })
        .expect(400);
    });

    it('reports every missing field of a creation payload at once', async () => {
      const response = await request(app.getHttpServer())
        .post(POSITIONS_PATH)
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
   * can supply, and that the boolean filter accepts exactly two spellings. Both
   * are rejected by the `ValidationPipe` before the handler runs, so the suite
   * still needs no database.
   */
  describe('users', () => {
    const USERS_PATH = `${API_BASE_PATH}/users`;

    it('rejects a page size above the shared cap', () => {
      return request(app.getHttpServer())
        .get(USERS_PATH)
        .query({ limit: 101 })
        .expect(400)
        .expect(({ body }: { body: { success: boolean } }) => {
          expect(body.success).toBe(false);
        });
    });

    it('rejects a column that is not sortable', () => {
      return request(app.getHttpServer())
        .get(USERS_PATH)
        .query({ sortBy: 'passwordHash' })
        .expect(400);
    });

    it('rejects a boolean filter that is neither true nor false', () => {
      return request(app.getHttpServer())
        .get(USERS_PATH)
        .query({ isActive: 'yes' })
        .expect(400);
    });

    it('reports every missing field of a creation payload at once', async () => {
      const response = await request(app.getHttpServer())
        .post(USERS_PATH)
        .send({})
        .expect(400);

      const { message } = response.body as { message: string[] };

      expect(message.join(' ')).toMatch(/email/);
      expect(message.join(' ')).toMatch(/password/);
      expect(message.join(' ')).toMatch(/role/);
    });

    it('refuses a password hash supplied by the client', () => {
      return request(app.getHttpServer())
        .post(USERS_PATH)
        .send({
          email: 'ana.pop@example.com',
          password: 'correct horse battery',
          role: 'ADMIN',
          passwordHash: '$2b$12$abcdefghij',
        })
        .expect(400);
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
        .query({ limit: 101 })
        .expect(400)
        .expect(({ body }: { body: { success: boolean } }) => {
          expect(body.success).toBe(false);
        });
    });

    it('rejects a column that is not sortable', () => {
      return request(app.getHttpServer())
        .get(EMPLOYEES_PATH)
        .query({ sortBy: 'phone' })
        .expect(400);
    });

    it('rejects a status outside the enum', () => {
      return request(app.getHttpServer())
        .get(EMPLOYEES_PATH)
        .query({ status: 'RETIRED' })
        .expect(400);
    });

    it('reports every missing field of a creation payload at once', async () => {
      const response = await request(app.getHttpServer())
        .post(EMPLOYEES_PATH)
        .send({})
        .expect(400);

      const { message } = response.body as { message: string[] };
      const reported = message.join(' ');

      expect(reported).toMatch(/employeeCode/);
      expect(reported).toMatch(/firstName/);
      expect(reported).toMatch(/lastName/);
      expect(reported).toMatch(/hireDate/);
      expect(reported).toMatch(/userId/);
      expect(reported).toMatch(/departmentId/);
      expect(reported).toMatch(/positionId/);
      expect(reported).toMatch(/seniority/);
      expect(reported).toMatch(/status/);
    });

    /**
     * Feature 022 moved leave entitlement out of this resource into
     * `employee_leave_balances`, so the field is no longer merely out of range —
     * it is unknown, which `forbidNonWhitelisted` rejects.
     */
    it('rejects a vacation entitlement, which this resource no longer has', () => {
      return request(app.getHttpServer())
        .patch(`${EMPLOYEES_PATH}/emp-1`)
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
        .send({ workingDays: ['FUNDAY'] })
        .expect(400);

      const { message } = response.body as { message: string[] };

      expect(message.join(' ')).toMatch(/workingDays/);
    });

    it('rejects a start time that is not HH:mm', () => {
      return request(app.getHttpServer())
        .put(WORK_SCHEDULE_PATH)
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
        .send({ timezone: 'Europe/Atlantis' })
        .expect(400);

      const { message } = response.body as { message: string[] };

      expect(message.join(' ')).toMatch(/timezone/);
    });

    it('rejects an approval address that is not an address', () => {
      return request(app.getHttpServer())
        .post(`${WORK_SCHEDULE_PATH}/emails`)
        .send({ email: 'not-an-email' })
        .expect(400);
    });

    it('refuses a schedule id supplied alongside an approval address', () => {
      return request(app.getHttpServer())
        .post(`${WORK_SCHEDULE_PATH}/emails`)
        .send({ email: 'hr@example.com', workScheduleId: 'work_schedule' })
        .expect(400);
    });

    /** There is one configuration, so no route addresses one by id. */
    it('does not route a configuration by id', () => {
      return request(app.getHttpServer())
        .get(`${WORK_SCHEDULE_PATH}/work_schedule`)
        .expect(404);
    });
  });

  /**
   * The leave-requests block asserts what is specific to Feature 023: two
   * collections under one prefix that must not swallow each other, a header
   * standing in for authentication until it exists, and the fields a client is
   * refused because the server decides them. Everything here is rejected before
   * a handler runs, so the suite still needs no database — which is also why the
   * balance, overlap and working-day rules are exercised in the service spec
   * rather than here.
   */
  describe('leave requests', () => {
    const LEAVE_REQUESTS_PATH = `${API_BASE_PATH}/leave-requests`;
    const MY_LEAVE_REQUESTS_PATH = `${API_BASE_PATH}/me/leave-requests`;
    const EMPLOYEE_HEADER = 'x-employee-id';

    it('reports every missing field of a request at once', async () => {
      const response = await request(app.getHttpServer())
        .post(MY_LEAVE_REQUESTS_PATH)
        .set(EMPLOYEE_HEADER, 'emp-1')
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
        .set(EMPLOYEE_HEADER, 'emp-1')
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
     * honest and what will stop being settable at all once auth exists.
     */
    it('refuses an employee id supplied in the body', () => {
      return request(app.getHttpServer())
        .post(MY_LEAVE_REQUESTS_PATH)
        .set(EMPLOYEE_HEADER, 'emp-1')
        .send({ employeeId: 'emp-2' })
        .expect(400);
    });

    /** An employee does not decide whether their own leave is approved. */
    it('refuses a status supplied when filing', () => {
      return request(app.getHttpServer())
        .post(MY_LEAVE_REQUESTS_PATH)
        .set(EMPLOYEE_HEADER, 'emp-1')
        .send({ status: 'APPROVED' })
        .expect(400);
    });

    /** Computed from three tables on every read; a client cannot state it. */
    it('refuses a working-day count supplied by the client', () => {
      return request(app.getHttpServer())
        .post(MY_LEAVE_REQUESTS_PATH)
        .set(EMPLOYEE_HEADER, 'emp-1')
        .send({ requestedWorkingDays: 5 })
        .expect(400);
    });

    it('requires the employee header on a /me route', async () => {
      const response = await request(app.getHttpServer())
        .get(MY_LEAVE_REQUESTS_PATH)
        .expect(400);

      expect(JSON.stringify(response.body)).toContain(EMPLOYEE_HEADER);
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
        .set(EMPLOYEE_HEADER, 'emp-9')
        .send({ status: 'PENDING' })
        .expect(400);
    });

    it('refuses a decider supplied in the body rather than the header', () => {
      return request(app.getHttpServer())
        .patch(`${LEAVE_REQUESTS_PATH}/lvr-1/status`)
        .set(EMPLOYEE_HEADER, 'emp-9')
        .send({ status: 'APPROVED', processedById: 'emp-8' })
        .expect(400);
    });

    /** Leave is asked for by the person taking it, and never erased by HR. */
    it('has no POST or DELETE on the HR collection', async () => {
      await request(app.getHttpServer()).post(LEAVE_REQUESTS_PATH).expect(404);
      await request(app.getHttpServer())
        .delete(`${LEAVE_REQUESTS_PATH}/lvr-1`)
        .expect(404);
    });

    it('rejects a page size above the shared cap', () => {
      return request(app.getHttpServer())
        .get(`${LEAVE_REQUESTS_PATH}?limit=1000`)
        .expect(400);
    });

    it('rejects a column that is not sortable', () => {
      return request(app.getHttpServer())
        .get(`${LEAVE_REQUESTS_PATH}?sortBy=requestedWorkingDays`)
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
        .send({ email: 'not-an-email' })
        .expect(400);
    });

    it('rejects a missing address', async () => {
      const response = await request(app.getHttpServer())
        .post(`${EMAIL_PATH}/test`)
        .send({})
        .expect(400);

      const { message } = response.body as { message: string[] };

      expect(message.join(' ')).toMatch(/email/);
    });

    /**
     * The message is fixed precisely so this endpoint cannot become a way to
     * send arbitrary mail from the company's server while there is still no
     * authentication in front of it.
     */
    it.each([{ subject: 'Anything I like' }, { html: '<p>Click here</p>' }])(
      'refuses an attempt to steer the message with %p',
      (extra) => {
        return request(app.getHttpServer())
          .post(`${EMAIL_PATH}/test`)
          .send({ email: 'john@example.com', ...extra })
          .expect(400);
      },
    );

    /** Sending is reached by injecting the service, never over HTTP. */
    it('exposes no endpoint for sending a caller-supplied message', async () => {
      await request(app.getHttpServer()).post(EMAIL_PATH).expect(404);
      await request(app.getHttpServer()).post(`${EMAIL_PATH}/send`).expect(404);
    });
  });

  describe('notification delivery', () => {
    const DELIVERY_PATH = `${API_BASE_PATH}/notification-delivery`;

    /**
     * The engine's whole HTTP surface is one route, and it is documented as
     * existing for development and Postman testing. What can be asserted without
     * a database is which URLs the application answers on — and the shape of the
     * `POST` the delivery flow is triggered through.
     */
    it('registers the manual execution route', async () => {
      const response = await request(app.getHttpServer()).post(
        `${DELIVERY_PATH}/execute/cmp-does-not-exist`,
      );
      const { message } = response.body as { message: string | string[] };

      // A campaign that does not exist is a `404` of its own, which is why the
      // status alone cannot tell "no such route" from "no such campaign". The
      // message can: an unmatched route renders `Cannot POST …`.
      expect(String(message)).not.toMatch(/Cannot POST/);
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
        .expect(404);
    });

    it('exposes no collection and no read routes of its own', async () => {
      await request(app.getHttpServer()).get(DELIVERY_PATH).expect(404);
      await request(app.getHttpServer())
        .get(`${DELIVERY_PATH}/execute/cmp-1`)
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
        .expect(404);
      await request(app.getHttpServer())
        .post(`${API_BASE_PATH}/reminders/rmd-1/execute`)
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
