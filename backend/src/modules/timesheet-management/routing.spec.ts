import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';

import { TimesheetEntryType, UserRole } from '../../generated/prisma/enums';
import { TestAuthentication } from '../auth/testing/authentication.testing';
import { TimesheetController } from './timesheet.controller';
import { TimesheetService } from './timesheet.service';

/**
 * One collection with two audiences, exercised through real requests.
 *
 * Four things can only be checked here rather than in a unit test:
 *
 * 1. **Which routes exist**, and just as importantly which do not. There is no
 *    `PATCH /timesheets/:id` writing a status and no `GET /timesheets/:id/entries`
 *    — a `404` on both is the claim.
 * 2. **That `/timesheets/me` is not swallowed by `/timesheets/:id`.** Nest matches
 *    in declaration order, so this is a property of the file's layout rather than
 *    of any code, and only a real request can prove it.
 * 3. **`@CurrentUser()` through Nest's pipeline.** A param decorator's logic runs
 *    inside the request, so a direct call would test nothing.
 * 4. **The global `ValidationPipe` on the real routes**, so the query and body
 *    rules are exercised where a client meets them.
 */
describe('timesheet routing', () => {
  let app: INestApplication;

  const timesheet = { id: 'tsh-1' };
  const timesheets = {
    findOwn: jest.fn().mockResolvedValue(timesheet),
    openOwn: jest.fn().mockResolvedValue(timesheet),
    setOwnEntries: jest.fn().mockResolvedValue(timesheet),
    submitOwn: jest.fn().mockResolvedValue(timesheet),
    findAll: jest.fn().mockResolvedValue({ items: [], meta: {} }),
    findOne: jest.fn().mockResolvedValue(timesheet),
    approve: jest.fn().mockResolvedValue(timesheet),
    reject: jest.fn().mockResolvedValue(timesheet),
    remove: jest.fn().mockResolvedValue(undefined),
  };

  /** The access token a caller has to present, since Feature 032. */
  const auth = new TestAuthentication();

  const as = (
    role: UserRole = UserRole.USER,
    employeeId: string | null = 'emp-1',
  ) => auth.as({ userId: 'usr-1', role, employeeId });

  const ENTRY = {
    date: '2026-09-01',
    type: TimesheetEntryType.WORK,
    hours: 8,
    projectId: 'prj-1',
  };

  beforeAll(async () => {
    const moduleRef: TestingModule = await Test.createTestingModule({
      controllers: [TimesheetController],
      providers: [
        { provide: TimesheetService, useValue: timesheets },
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

  describe('the owner routes', () => {
    /**
     * The one route ordering bug this controller could have. `@Get(':id')`
     * declared above `@Get('me')` would answer "timesheet `me` was not found".
     */
    it('does not let /timesheets/:id swallow /timesheets/me', async () => {
      await request(app.getHttpServer())
        .get('/timesheets/me?month=9&year=2026')
        .set(as())
        .expect(200);

      expect(timesheets.findOwn).toHaveBeenCalled();
      expect(timesheets.findOne).not.toHaveBeenCalled();
    });

    it('coerces the period out of the query string', async () => {
      await request(app.getHttpServer())
        .get('/timesheets/me?month=9&year=2026')
        .set(as())
        .expect(200);

      expect(timesheets.findOwn).toHaveBeenCalledWith(
        expect.objectContaining({ employeeId: 'emp-1' }),
        { month: 9, year: 2026 },
      );
    });

    it('requires the period: "my timesheet" without one names nothing', async () => {
      await request(app.getHttpServer())
        .get('/timesheets/me')
        .set(as())
        .expect(400);

      expect(timesheets.findOwn).not.toHaveBeenCalled();
    });

    it('rejects a month outside the twelve', async () => {
      await request(app.getHttpServer())
        .get('/timesheets/me?month=13&year=2026')
        .set(as())
        .expect(400);
    });

    it('opens a month, answering 201', async () => {
      await request(app.getHttpServer())
        .post('/timesheets/me')
        .set(as())
        .send({ month: 9, year: 2026 })
        .expect(201);

      expect(timesheets.openOwn).toHaveBeenCalled();
    });

    // Whose month it is comes from the header, never from the body.
    it('refuses an employeeId in the body', async () => {
      await request(app.getHttpServer())
        .post('/timesheets/me')
        .set(as())
        .send({ month: 9, year: 2026, employeeId: 'emp-2' })
        .expect(400);

      expect(timesheets.openOwn).not.toHaveBeenCalled();
    });

    // An employee does not decide whether their own month is approved.
    it('refuses a status in the body', async () => {
      await request(app.getHttpServer())
        .post('/timesheets/me')
        .set(as())
        .send({ month: 9, year: 2026, status: 'APPROVED' })
        .expect(400);
    });

    it('replaces the entry set through PUT', async () => {
      await request(app.getHttpServer())
        .put('/timesheets/me/tsh-1/entries')
        .set(as())
        .send({ entries: [ENTRY] })
        .expect(200);

      expect(timesheets.setOwnEntries).toHaveBeenCalledWith(
        expect.anything(),
        'tsh-1',
        { entries: [ENTRY] },
      );
    });

    // Clearing the month is a request that has to be expressible.
    it('accepts an empty entry set', async () => {
      await request(app.getHttpServer())
        .put('/timesheets/me/tsh-1/entries')
        .set(as())
        .send({ entries: [] })
        .expect(200);
    });

    it('validates the nested entries', async () => {
      await request(app.getHttpServer())
        .put('/timesheets/me/tsh-1/entries')
        .set(as())
        .send({ entries: [{ ...ENTRY, hours: -1 }] })
        .expect(400);

      expect(timesheets.setOwnEntries).not.toHaveBeenCalled();
    });

    it('refuses an entry id: PUT replaces rather than patches', async () => {
      await request(app.getHttpServer())
        .put('/timesheets/me/tsh-1/entries')
        .set(as())
        .send({ entries: [{ ...ENTRY, id: 'tse-1' }] })
        .expect(400);
    });

    it('submits through a named transition, answering 201', async () => {
      await request(app.getHttpServer())
        .post('/timesheets/me/tsh-1/submit')
        .set(as())
        .expect(201);

      expect(timesheets.submitOwn).toHaveBeenCalledWith(
        expect.anything(),
        'tsh-1',
      );
    });

    it('refuses a request that presents no access token', async () => {
      await request(app.getHttpServer())
        .get('/timesheets/me?month=9&year=2026')
        .expect(401);

      expect(timesheets.findOwn).not.toHaveBeenCalled();
    });

    // `employeeId` is optional at the seam — not every account has an employee
    // record — so the service is what reports that a timesheet needs an owner.
    it('carries a null employeeId through for the service to refuse', async () => {
      await request(app.getHttpServer())
        .get('/timesheets/me?month=9&year=2026')
        .set(as(UserRole.USER, null))
        .expect(200);

      expect(timesheets.findOwn).toHaveBeenCalledWith(
        expect.objectContaining({ employeeId: null }),
        expect.anything(),
      );
    });
  });

  describe('the administrative routes', () => {
    it('lists the review queue', async () => {
      await request(app.getHttpServer())
        .get('/timesheets')
        .set(as(UserRole.ADMIN))
        .expect(200);

      expect(timesheets.findAll).toHaveBeenCalled();
    });

    it('reads one by id', async () => {
      await request(app.getHttpServer())
        .get('/timesheets/tsh-1')
        .set(as(UserRole.ADMIN))
        .expect(200);

      expect(timesheets.findOne).toHaveBeenCalledWith(
        expect.anything(),
        'tsh-1',
      );
    });

    it('approves with no body at all', async () => {
      await request(app.getHttpServer())
        .post('/timesheets/tsh-1/approve')
        .set(as(UserRole.ADMIN))
        .expect(201);

      expect(timesheets.approve).toHaveBeenCalledWith(
        expect.anything(),
        'tsh-1',
      );
    });

    it('rejects with a reason', async () => {
      await request(app.getHttpServer())
        .post('/timesheets/tsh-1/reject')
        .set(as(UserRole.ADMIN))
        .send({ rejectionReason: 'The 14th is missing.' })
        .expect(201);

      expect(timesheets.reject).toHaveBeenCalledWith(
        expect.anything(),
        'tsh-1',
        {
          rejectionReason: 'The 14th is missing.',
        },
      );
    });

    it('refuses a rejection with no reason', async () => {
      await request(app.getHttpServer())
        .post('/timesheets/tsh-1/reject')
        .set(as(UserRole.ADMIN))
        .send({})
        .expect(400);

      expect(timesheets.reject).not.toHaveBeenCalled();
    });

    it('refuses a rejection whose reason is only whitespace', async () => {
      await request(app.getHttpServer())
        .post('/timesheets/tsh-1/reject')
        .set(as(UserRole.ADMIN))
        .send({ rejectionReason: '   ' })
        .expect(400);
    });

    it('deletes, answering 200 rather than 204', async () => {
      await request(app.getHttpServer())
        .delete('/timesheets/tsh-1')
        .set(as(UserRole.ADMIN))
        .expect(200);

      expect(timesheets.remove).toHaveBeenCalledWith(
        expect.anything(),
        'tsh-1',
      );
    });

    it('passes the caller through, so the reviewer is recorded', async () => {
      await request(app.getHttpServer())
        .post('/timesheets/tsh-1/approve')
        .set(as(UserRole.ADMIN, 'emp-admin'))
        .expect(201);

      expect(timesheets.approve).toHaveBeenCalledWith(
        expect.objectContaining({
          employeeId: 'emp-admin',
          administrativeAccess: true,
        }),
        'tsh-1',
      );
    });

    it('rejects a query parameter it does not offer', async () => {
      await request(app.getHttpServer())
        .get('/timesheets?employeeId=emp-1')
        .set(as(UserRole.ADMIN))
        .expect(400);
    });

    it('rejects a sortBy the list does not support', async () => {
      await request(app.getHttpServer())
        .get('/timesheets?sortBy=totalHours')
        .set(as(UserRole.ADMIN))
        .expect(400);
    });
  });

  describe('routes that deliberately do not exist', () => {
    // The status is a state machine with named transitions, each with its own
    // preconditions and side effects — not a writable field.
    it('has no PATCH writing a status', async () => {
      await request(app.getHttpServer())
        .patch('/timesheets/tsh-1')
        .set(as(UserRole.ADMIN))
        .send({ status: 'APPROVED' })
        .expect(404);
    });

    it('has no separate entries collection', async () => {
      await request(app.getHttpServer())
        .get('/timesheets/tsh-1/entries')
        .set(as(UserRole.ADMIN))
        .expect(404);
    });

    it('has no owner-scoped delete: only an administrator removes a month', async () => {
      await request(app.getHttpServer())
        .delete('/timesheets/me/tsh-1')
        .set(as())
        .expect(404);
    });
  });
});
