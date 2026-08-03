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
        .query({ sortBy: 'maxVacationDays' })
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

    it('rejects a vacation entitlement of zero days', () => {
      return request(app.getHttpServer())
        .patch(`${EMPLOYEES_PATH}/emp-1`)
        .send({ maxVacationDays: 0 })
        .expect(400);
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
