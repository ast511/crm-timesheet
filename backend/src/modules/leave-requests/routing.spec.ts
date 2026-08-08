import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';

import { TestAuthentication } from '../auth/testing/authentication.testing';
import { LeaveRequestsController } from './leave-requests.controller';
import { LeaveRequestsService } from './leave-requests.service';
import { MyLeaveRequestsController } from './my-leave-requests.controller';

/**
 * `/me/leave-requests` and `/leave-requests` are two controllers under one
 * prefix, and which one answers is a claim about how Nest matches segments —
 * worth checking rather than asserting in a comment. If `/leave-requests/:id`
 * ever swallowed `/me/...`, `GET /me/leave-requests` would look up a request
 * whose id was `me` and every unit test in the module would still pass.
 *
 * It also exercises `@CurrentEmployeeId()` through a real request, which is the
 * only way to test a param decorator: its logic runs inside Nest's pipeline and
 * a direct call would test nothing.
 *
 * The pipe is the global one, so the parameter rules are exercised through the
 * real routes rather than only through their DTOs.
 */
describe('leave-requests routing', () => {
  let app: INestApplication;

  const page = { items: [], meta: {} };
  const service = {
    findOwn: jest.fn().mockResolvedValue(page),
    findOwnOne: jest.fn().mockResolvedValue({ id: 'lvr-1' }),
    createOwn: jest.fn().mockResolvedValue({ id: 'lvr-1' }),
    updateOwn: jest.fn().mockResolvedValue({ id: 'lvr-1' }),
    removeOwn: jest.fn().mockResolvedValue(undefined),
    findAll: jest.fn().mockResolvedValue(page),
    findOne: jest.fn().mockResolvedValue({ id: 'lvr-1' }),
    decide: jest.fn().mockResolvedValue({ id: 'lvr-1' }),
  };

  /**
   * The access token a caller has to present, since Feature 032.
   *
   * Where this spec used to set `x-employee-id` to say who was calling, it now
   * authenticates as an account *whose employment record is* that employee. The
   * routes and the assertions are unchanged, which is the point: the employee id
   * arrives through the same `@CurrentEmployeeId()` parameter, from the token's
   * account rather than from a header the caller wrote.
   */
  const auth = new TestAuthentication();

  const as = (employeeId: string | null = 'emp-1') => auth.as({ employeeId });

  beforeAll(async () => {
    const moduleRef: TestingModule = await Test.createTestingModule({
      controllers: [MyLeaveRequestsController, LeaveRequestsController],
      providers: [
        { provide: LeaveRequestsService, useValue: service },
        ...auth.providers,
      ],
    }).compile();

    app = moduleRef.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    await app.init();
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  afterAll(async () => {
    await app.close();
  });

  describe('the two collections do not collide', () => {
    it('routes /me/leave-requests to the employee’s own list', async () => {
      await request(app.getHttpServer())
        .get('/me/leave-requests')
        .set(as())
        .expect(200);

      expect(service.findOwn).toHaveBeenCalled();
      expect(service.findAll).not.toHaveBeenCalled();
    });

    it('routes /leave-requests to the HR list', async () => {
      await request(app.getHttpServer())
        .get('/leave-requests')
        .set(as())
        .expect(200);

      expect(service.findAll).toHaveBeenCalled();
      expect(service.findOwn).not.toHaveBeenCalled();
    });

    it('does not read /me as an id on the HR collection', async () => {
      await request(app.getHttpServer())
        .get('/me/leave-requests')
        .set(as())
        .expect(200);

      expect(service.findOne).not.toHaveBeenCalled();
    });

    it('routes the status sub-resource, not the request itself', async () => {
      await request(app.getHttpServer())
        .patch('/leave-requests/lvr-1/status')
        .set(as('emp-9'))
        .send({ status: 'APPROVED' })
        .expect(200);

      expect(service.decide).toHaveBeenCalledWith('emp-9', 'lvr-1', {
        status: 'APPROVED',
      });
    });

    it('has no plain PATCH on the HR collection', async () => {
      await request(app.getHttpServer())
        .patch('/leave-requests/lvr-1')
        .set(as())
        .send({ status: 'APPROVED' })
        .expect(404);
    });

    it('has no POST on the HR collection — leave is asked for by the person taking it', async () => {
      await request(app.getHttpServer())
        .post('/leave-requests')
        .set(as())
        .expect(404);
    });

    it('has no DELETE on the HR collection', async () => {
      await request(app.getHttpServer())
        .delete('/leave-requests/lvr-1')
        .set(as())
        .expect(404);
    });
  });

  describe('the caller’s employment record', () => {
    it('passes the authenticated employee through as the caller', async () => {
      await request(app.getHttpServer())
        .get('/me/leave-requests/lvr-1')
        .set(as('emp-1'))
        .expect(200);

      expect(service.findOwnOne).toHaveBeenCalledWith('emp-1', 'lvr-1');
    });

    /**
     * A `401` where this used to expect a `400` naming a header, and the change
     * is the feature: there is no header to leave out any more, so the failure
     * is no longer a malformed request but an unauthenticated one.
     */
    it('rejects a request with no access token', async () => {
      await request(app.getHttpServer()).get('/me/leave-requests').expect(401);

      expect(service.findOwn).not.toHaveBeenCalled();
    });

    /**
     * A `403` rather than a `400`, and for the same reason: an account with no
     * `employees` row — a super-admin created to administer the system — is
     * perfectly well authenticated and simply has no leave of its own to read.
     * The trimming, blank-value and length checks this block used to make are
     * gone with the header they validated; an id read from `users.employee.id`
     * cannot be blank, padded, or longer than the column it came from.
     */
    it('refuses an authenticated account that has no employment record', async () => {
      await request(app.getHttpServer())
        .get('/me/leave-requests')
        .set(as(null))
        .expect(403);

      expect(service.findOwn).not.toHaveBeenCalled();
    });

    it('is required on the HR decision too, so nobody decides anonymously', async () => {
      await request(app.getHttpServer())
        .patch('/leave-requests/lvr-1/status')
        .set(as(null))
        .send({ status: 'APPROVED' })
        .expect(403);

      expect(service.decide).not.toHaveBeenCalled();
    });

    it('is not required to read the HR list', async () => {
      await request(app.getHttpServer())
        .get('/leave-requests')
        .set(as(null))
        .expect(200);

      expect(service.findAll).toHaveBeenCalled();
    });
  });

  describe('query validation runs at the route', () => {
    it('rejects an out-of-range year before the service sees it', async () => {
      await request(app.getHttpServer())
        .get('/leave-requests?year=20266')
        .set(as())
        .expect(400);

      expect(service.findAll).not.toHaveBeenCalled();
    });

    it('rejects sorting the employee list by employee, which means nothing there', async () => {
      await request(app.getHttpServer())
        .get('/me/leave-requests?sortBy=employee')
        .set(as())
        .expect(400);

      expect(service.findOwn).not.toHaveBeenCalled();
    });

    it('allows sorting the HR list by employee', async () => {
      await request(app.getHttpServer())
        .get('/leave-requests?sortBy=employee')
        .set(as())
        .expect(200);

      expect(service.findAll).toHaveBeenCalled();
    });

    it('rejects ?employeeId= on the employee’s own list', async () => {
      await request(app.getHttpServer())
        .get('/me/leave-requests?employeeId=emp-2')
        .set(as())
        .expect(400);

      expect(service.findOwn).not.toHaveBeenCalled();
    });
  });
});
