import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';

import { CURRENT_EMPLOYEE_HEADER } from '../../common/decorators/current-employee-id.decorator';
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

  beforeAll(async () => {
    const moduleRef: TestingModule = await Test.createTestingModule({
      controllers: [MyLeaveRequestsController, LeaveRequestsController],
      providers: [{ provide: LeaveRequestsService, useValue: service }],
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
        .set(CURRENT_EMPLOYEE_HEADER, 'emp-1')
        .expect(200);

      expect(service.findOwn).toHaveBeenCalled();
      expect(service.findAll).not.toHaveBeenCalled();
    });

    it('routes /leave-requests to the HR list', async () => {
      await request(app.getHttpServer()).get('/leave-requests').expect(200);

      expect(service.findAll).toHaveBeenCalled();
      expect(service.findOwn).not.toHaveBeenCalled();
    });

    it('does not read /me as an id on the HR collection', async () => {
      await request(app.getHttpServer())
        .get('/me/leave-requests')
        .set(CURRENT_EMPLOYEE_HEADER, 'emp-1')
        .expect(200);

      expect(service.findOne).not.toHaveBeenCalled();
    });

    it('routes the status sub-resource, not the request itself', async () => {
      await request(app.getHttpServer())
        .patch('/leave-requests/lvr-1/status')
        .set(CURRENT_EMPLOYEE_HEADER, 'emp-9')
        .send({ status: 'APPROVED' })
        .expect(200);

      expect(service.decide).toHaveBeenCalledWith('emp-9', 'lvr-1', {
        status: 'APPROVED',
      });
    });

    it('has no plain PATCH on the HR collection', async () => {
      await request(app.getHttpServer())
        .patch('/leave-requests/lvr-1')
        .send({ status: 'APPROVED' })
        .expect(404);
    });

    it('has no POST on the HR collection — leave is asked for by the person taking it', async () => {
      await request(app.getHttpServer()).post('/leave-requests').expect(404);
    });

    it('has no DELETE on the HR collection', async () => {
      await request(app.getHttpServer())
        .delete('/leave-requests/lvr-1')
        .expect(404);
    });
  });

  describe('the employee header', () => {
    it('passes the header through as the caller', async () => {
      await request(app.getHttpServer())
        .get('/me/leave-requests/lvr-1')
        .set(CURRENT_EMPLOYEE_HEADER, '  emp-1  ')
        .expect(200);

      expect(service.findOwnOne).toHaveBeenCalledWith('emp-1', 'lvr-1');
    });

    it('rejects a request without it, naming the header', async () => {
      const response = await request(app.getHttpServer())
        .get('/me/leave-requests')
        .expect(400);

      expect(JSON.stringify(response.body)).toContain(CURRENT_EMPLOYEE_HEADER);
      expect(service.findOwn).not.toHaveBeenCalled();
    });

    it('rejects a blank header', async () => {
      await request(app.getHttpServer())
        .get('/me/leave-requests')
        .set(CURRENT_EMPLOYEE_HEADER, '   ')
        .expect(400);

      expect(service.findOwn).not.toHaveBeenCalled();
    });

    it('rejects a header longer than a foreign key may be', async () => {
      await request(app.getHttpServer())
        .get('/me/leave-requests')
        .set(CURRENT_EMPLOYEE_HEADER, 'x'.repeat(51))
        .expect(400);

      expect(service.findOwn).not.toHaveBeenCalled();
    });

    it('is required on the HR decision too, so nobody decides anonymously', async () => {
      await request(app.getHttpServer())
        .patch('/leave-requests/lvr-1/status')
        .send({ status: 'APPROVED' })
        .expect(400);

      expect(service.decide).not.toHaveBeenCalled();
    });

    it('is not required to read the HR list', async () => {
      await request(app.getHttpServer()).get('/leave-requests').expect(200);

      expect(service.findAll).toHaveBeenCalled();
    });
  });

  describe('query validation runs at the route', () => {
    it('rejects an out-of-range year before the service sees it', async () => {
      await request(app.getHttpServer())
        .get('/leave-requests?year=20266')
        .expect(400);

      expect(service.findAll).not.toHaveBeenCalled();
    });

    it('rejects sorting the employee list by employee, which means nothing there', async () => {
      await request(app.getHttpServer())
        .get('/me/leave-requests?sortBy=employee')
        .set(CURRENT_EMPLOYEE_HEADER, 'emp-1')
        .expect(400);

      expect(service.findOwn).not.toHaveBeenCalled();
    });

    it('allows sorting the HR list by employee', async () => {
      await request(app.getHttpServer())
        .get('/leave-requests?sortBy=employee')
        .expect(200);

      expect(service.findAll).toHaveBeenCalled();
    });

    it('rejects ?employeeId= on the employee’s own list', async () => {
      await request(app.getHttpServer())
        .get('/me/leave-requests?employeeId=emp-2')
        .set(CURRENT_EMPLOYEE_HEADER, 'emp-1')
        .expect(400);

      expect(service.findOwn).not.toHaveBeenCalled();
    });
  });
});
