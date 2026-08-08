import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';

import { CampaignRecipientType, UserRole } from '../../generated/prisma/enums';
import { TestAuthentication } from '../auth/testing/authentication.testing';
import { NotificationCampaignController } from './notification-campaign.controller';
import { NotificationCampaignService } from './notification-campaign.service';
import { ReminderController } from './reminder.controller';
import { ReminderService } from './reminder.service';

/**
 * Two collections under one prefix, exercised through real requests.
 *
 * Three things can only be checked here rather than in a unit test:
 *
 * 1. **Which routes exist**, and just as importantly which do not. This module
 *    has no `POST /reminders/:id/disable` and no
 *    `POST /notification-campaigns/:id/send` — the first because `enabled` is a
 *    column a `PATCH` writes, the second because nothing in this feature sends
 *    anything. A `404` on both is the claim.
 * 2. **`@CurrentUser()` through Nest's pipeline.** A param decorator's logic runs
 *    inside the request, so a direct call would test nothing.
 * 3. **The global `ValidationPipe` on the real routes**, so the query and body
 *    rules are exercised where a client meets them.
 */
describe('notification-management routing', () => {
  let app: INestApplication;

  const page = { items: [], meta: {} };
  const reminders = {
    findAll: jest.fn().mockResolvedValue(page),
    findOne: jest.fn().mockResolvedValue({ id: 'rmd-1' }),
    create: jest.fn().mockResolvedValue({ id: 'rmd-1' }),
    update: jest.fn().mockResolvedValue({ id: 'rmd-1' }),
    remove: jest.fn().mockResolvedValue(undefined),
  };
  const campaigns = {
    findAll: jest.fn().mockResolvedValue(page),
    findOne: jest.fn().mockResolvedValue({ id: 'cmp-1' }),
    create: jest.fn().mockResolvedValue({ id: 'cmp-1' }),
    update: jest.fn().mockResolvedValue({ id: 'cmp-1' }),
    remove: jest.fn().mockResolvedValue(undefined),
  };

  /** The access token a caller has to present, since Feature 032. */
  const auth = new TestAuthentication();

  const as = (employeeId: string | null = 'emp-1') =>
    auth.as({ userId: 'usr-1', role: UserRole.ADMIN, employeeId });

  const CAMPAIGN_BODY = {
    subject: 'Planned maintenance',
    message: 'The system will be unavailable on Saturday morning.',
    recipientType: CampaignRecipientType.ALL_EMPLOYEES,
  };

  beforeAll(async () => {
    const moduleRef: TestingModule = await Test.createTestingModule({
      controllers: [ReminderController, NotificationCampaignController],
      providers: [
        { provide: ReminderService, useValue: reminders },
        { provide: NotificationCampaignService, useValue: campaigns },
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

  describe('/reminders', () => {
    it('lists', async () => {
      await request(app.getHttpServer())
        .get('/reminders')
        .set(as())
        .expect(200);

      expect(reminders.findAll).toHaveBeenCalled();
    });

    it('reads one by id', async () => {
      await request(app.getHttpServer())
        .get('/reminders/rmd-1')
        .set(as())
        .expect(200);

      expect(reminders.findOne).toHaveBeenCalledWith('rmd-1');
    });

    it('creates, answering 201', async () => {
      await request(app.getHttpServer())
        .post('/reminders')
        .set(as())
        .send({
          name: 'Timesheet due in 3 days',
          daysBeforeDeadline: 3,
          subject: 'Your timesheet is due in 3 days',
          message: 'Please complete it before the end of the month.',
        })
        .expect(201);

      expect(reminders.create).toHaveBeenCalled();
    });

    it('disables one through PATCH rather than a sub-resource', async () => {
      await request(app.getHttpServer())
        .patch('/reminders/rmd-1')
        .set(as())
        .send({ enabled: false })
        .expect(200);

      expect(reminders.update).toHaveBeenCalledWith('rmd-1', {
        enabled: false,
      });
    });

    it('has no disable endpoint', async () => {
      await request(app.getHttpServer())
        .post('/reminders/rmd-1/disable')
        .set(as())
        .expect(404);
    });

    it('deletes, answering 200 rather than 204', async () => {
      await request(app.getHttpServer())
        .delete('/reminders/rmd-1')
        .set(as())
        .expect(200);

      expect(reminders.remove).toHaveBeenCalledWith('rmd-1');
    });

    /**
     * A reminder records nobody, so the caller's *identity* is never read here —
     * but the route is still authenticated, because Feature 032 made that the
     * default and a reminder rule is company configuration rather than something
     * a stranger may list.
     */
    it('reads no caller, and is still authenticated', async () => {
      await request(app.getHttpServer())
        .get('/reminders')
        .set(as())
        .expect(200);
      await request(app.getHttpServer()).get('/reminders').expect(401);
    });

    it('rejects a query parameter it does not offer', async () => {
      await request(app.getHttpServer())
        .get('/reminders?status=DRAFT')
        .set(as())
        .expect(400);
    });

    it('rejects a negative offset at the route', async () => {
      await request(app.getHttpServer())
        .post('/reminders')
        .set(as())
        .send({
          name: 'Late reminder',
          daysBeforeDeadline: -1,
          subject: 'Subject',
          message: 'Message',
        })
        .expect(400);

      expect(reminders.create).not.toHaveBeenCalled();
    });
  });

  describe('/notification-campaigns', () => {
    it('lists', async () => {
      await request(app.getHttpServer())
        .get('/notification-campaigns')
        .set(as())
        .expect(200);

      expect(campaigns.findAll).toHaveBeenCalled();
    });

    it('reads one by id', async () => {
      await request(app.getHttpServer())
        .get('/notification-campaigns/cmp-1')
        .set(as())
        .expect(200);

      expect(campaigns.findOne).toHaveBeenCalledWith('cmp-1');
    });

    it('passes the caller through to the service, so the author is recorded', async () => {
      await request(app.getHttpServer())
        .post('/notification-campaigns')
        .set(as('emp-7'))
        .send(CAMPAIGN_BODY)
        .expect(201);

      expect(campaigns.create).toHaveBeenCalledWith(
        expect.objectContaining({ userId: 'usr-1', employeeId: 'emp-7' }),
        expect.objectContaining({ subject: CAMPAIGN_BODY.subject }),
      );
    });

    it('refuses a POST that presents no access token', async () => {
      await request(app.getHttpServer())
        .post('/notification-campaigns')
        .send(CAMPAIGN_BODY)
        .expect(401);

      expect(campaigns.create).not.toHaveBeenCalled();
    });

    it('carries a null employeeId through for the service to refuse', async () => {
      // `employeeId` is optional at the seam — not every account has an employee
      // record — so the *decorator* accepts its absence and the service is what
      // reports that a campaign needs an author.
      await request(app.getHttpServer())
        .post('/notification-campaigns')
        .set(as(null))
        .send(CAMPAIGN_BODY)
        .expect(201);

      expect(campaigns.create).toHaveBeenCalledWith(
        expect.objectContaining({ employeeId: null }),
        expect.anything(),
      );
    });

    it('cancels through PATCH', async () => {
      await request(app.getHttpServer())
        .patch('/notification-campaigns/cmp-1')
        .set(as())
        .send({ status: 'CANCELLED' })
        .expect(200);

      expect(campaigns.update).toHaveBeenCalledWith('cmp-1', {
        status: 'CANCELLED',
      });
    });

    it('refuses a status only the delivery engine may write', async () => {
      await request(app.getHttpServer())
        .patch('/notification-campaigns/cmp-1')
        .set(as())
        .send({ status: 'SENT' })
        .expect(400);

      expect(campaigns.update).not.toHaveBeenCalled();
    });

    it('refuses a status the schedule decides', async () => {
      await request(app.getHttpServer())
        .patch('/notification-campaigns/cmp-1')
        .set(as())
        .send({ status: 'SCHEDULED' })
        .expect(400);
    });

    it('has no send endpoint: nothing in this feature sends anything', async () => {
      await request(app.getHttpServer())
        .post('/notification-campaigns/cmp-1/send')
        .set(as())
        .expect(404);
    });

    it('deletes', async () => {
      await request(app.getHttpServer())
        .delete('/notification-campaigns/cmp-1')
        .set(as())
        .expect(200);

      expect(campaigns.remove).toHaveBeenCalledWith('cmp-1');
    });

    it('rejects a body field a client may not write', async () => {
      await request(app.getHttpServer())
        .post('/notification-campaigns')
        .set(as())
        .send({ ...CAMPAIGN_BODY, sentAt: '2026-08-05T10:00:00.000Z' })
        .expect(400);
    });
  });

  it('does not collide the two collections', async () => {
    await request(app.getHttpServer()).get('/reminders').set(as()).expect(200);
    await request(app.getHttpServer())
      .get('/notification-campaigns')
      .set(as())
      .expect(200);

    expect(reminders.findAll).toHaveBeenCalledTimes(1);
    expect(campaigns.findAll).toHaveBeenCalledTimes(1);
  });
});
