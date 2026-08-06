import {
  ConflictException,
  INestApplication,
  NotFoundException,
} from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';

import { DeliverySource } from './notification-delivery.constants';
import { NotificationDeliveryController } from './notification-delivery.controller';
import { NotificationDispatcher } from './notification-dispatcher.service';

/**
 * The one HTTP surface this feature has, exercised through real requests.
 *
 * Two things can only be checked here rather than in a unit test: which routes
 * exist — and, just as importantly, which do not — and that the manual endpoint
 * answers `200` rather than the `201` Nest gives a `@Post` by default.
 */
describe('notification-delivery routing', () => {
  let app: INestApplication;

  const dispatcher = {
    executeCampaign: jest.fn(),
    executeReminder: jest.fn(),
  };

  const RESULT = {
    source: DeliverySource.Campaign,
    campaignId: 'cmp-1',
    reminderId: null,
    recipientCount: 3,
    notificationsCreated: 3,
    emailsSent: 3,
    emailStatus: 'SENT',
    sentAt: '2026-08-05T09:00:00.000Z',
  };

  beforeAll(async () => {
    const moduleRef: TestingModule = await Test.createTestingModule({
      controllers: [NotificationDeliveryController],
      providers: [{ provide: NotificationDispatcher, useValue: dispatcher }],
    }).compile();

    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    jest.clearAllMocks();
    dispatcher.executeCampaign.mockResolvedValue(RESULT);
  });

  describe('POST /notification-delivery/execute/:campaignId', () => {
    it('reaches the dispatcher with the campaign id and answers 200', async () => {
      const response = await request(app.getHttpServer())
        .post('/notification-delivery/execute/cmp-1')
        .expect(200);

      expect(dispatcher.executeCampaign).toHaveBeenCalledWith('cmp-1');
      expect(response.body).toEqual(RESULT);
    });

    // Nothing was created: there is no resource to point at and no `Location` to
    // return.
    it('does not answer the 201 a POST would default to', async () => {
      await request(app.getHttpServer())
        .post('/notification-delivery/execute/cmp-1')
        .expect((response) => {
          expect(response.status).not.toBe(201);
        });
    });

    it('takes the id as a plain string, since ids are cuids', async () => {
      await request(app.getHttpServer())
        .post('/notification-delivery/execute/clx0987654321abcdefghijk')
        .expect(200);

      expect(dispatcher.executeCampaign).toHaveBeenCalledWith(
        'clx0987654321abcdefghijk',
      );
    });

    it('propagates a 404 from the dispatcher', async () => {
      dispatcher.executeCampaign.mockRejectedValue(
        new NotFoundException('Notification campaign cmp-x was not found'),
      );

      await request(app.getHttpServer())
        .post('/notification-delivery/execute/cmp-x')
        .expect(404);
    });

    it('propagates a 409 from the dispatcher', async () => {
      dispatcher.executeCampaign.mockRejectedValue(
        new ConflictException('Campaign cmp-1 is SENT and cannot be sent'),
      );

      await request(app.getHttpServer())
        .post('/notification-delivery/execute/cmp-1')
        .expect(409);
    });
  });

  describe('routes that deliberately do not exist', () => {
    // A reminder is a standing rule whose whole point is the schedule; a route
    // that fired one by hand would be a way to warn the entire company on a
    // Tuesday afternoon by mistake.
    it('offers no way to fire a reminder over HTTP', async () => {
      await request(app.getHttpServer())
        .post('/notification-delivery/execute-reminder/rmd-1')
        .expect(404);

      expect(dispatcher.executeReminder).not.toHaveBeenCalled();
    });

    it('has no execute route without an id', async () => {
      await request(app.getHttpServer())
        .post('/notification-delivery/execute')
        .expect(404);
    });

    it('does not answer a GET on the execute route', async () => {
      await request(app.getHttpServer())
        .get('/notification-delivery/execute/cmp-1')
        .expect(404);
    });

    it('exposes no collection of its own', async () => {
      await request(app.getHttpServer())
        .get('/notification-delivery')
        .expect(404);
    });
  });
});
