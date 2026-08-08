import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';

import { UserRole } from '../../generated/prisma/enums';
import { TestAuthentication } from '../auth/testing/authentication.testing';
import { AdministrativeNotificationController } from './administrative-notification.controller';
import { NotificationController } from './notification.controller';
import { NotificationService } from './notification.service';

/**
 * `/notifications` and `/administrative/notifications` are two controllers under
 * one prefix, and which one answers is a claim about how Nest matches segments —
 * worth checking rather than asserting in a comment.
 *
 * The case that would otherwise bite silently is `PATCH /notifications/read-all`
 * against `PATCH /notifications/:id/read`: if the collection route were ever
 * swallowed, "mark everything read" would quietly mark one notification called
 * `read-all` instead, and every unit test in the module would still pass.
 *
 * It also exercises `@CurrentUser()` through real requests, which is the only
 * way to test a param decorator: its logic runs inside Nest's pipeline and a
 * direct call would test nothing.
 *
 * The pipe is the global one, so the query rules are exercised through the real
 * routes rather than only through their DTO.
 */
describe('notifications routing', () => {
  let app: INestApplication;

  const page = { items: [], meta: {} };
  const service = {
    findPersonal: jest.fn().mockResolvedValue(page),
    findAdministrative: jest.fn().mockResolvedValue(page),
    findOne: jest.fn().mockResolvedValue({ id: 'ntf-1' }),
    create: jest.fn().mockResolvedValue({ id: 'ntf-1' }),
    markRead: jest.fn().mockResolvedValue({ id: 'ntf-1' }),
    markAllPersonalRead: jest.fn().mockResolvedValue({ affected: 3 }),
    markAllAdministrativeRead: jest.fn().mockResolvedValue({ affected: 2 }),
    remove: jest.fn().mockResolvedValue(undefined),
    removeAllPersonal: jest.fn().mockResolvedValue({ affected: 7 }),
    removeAllAdministrative: jest.fn().mockResolvedValue({ affected: 4 }),
  };

  /**
   * The access token a caller has to present, since Feature 032.
   *
   * `employeeId` defaults to `null` here rather than to the helper's `emp-1`,
   * because the personal inbox is addressed to an *account* and most of this
   * module's assertions were written against a caller with no employment record.
   */
  const auth = new TestAuthentication();

  const as = (role: UserRole, userId = 'usr-1') =>
    auth.as({ userId, role, employeeId: null });

  const get = (url: string, role: UserRole = UserRole.USER) =>
    request(app.getHttpServer()).get(url).set(as(role));

  beforeAll(async () => {
    const moduleRef: TestingModule = await Test.createTestingModule({
      controllers: [
        NotificationController,
        AdministrativeNotificationController,
      ],
      providers: [
        { provide: NotificationService, useValue: service },
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

  describe('the two workspaces do not collide', () => {
    it('routes /notifications to the personal list', async () => {
      await get('/notifications').expect(200);

      expect(service.findPersonal).toHaveBeenCalled();
      expect(service.findAdministrative).not.toHaveBeenCalled();
    });

    it('routes /administrative/notifications to the administrative list', async () => {
      await get('/administrative/notifications', UserRole.HR).expect(200);

      expect(service.findAdministrative).toHaveBeenCalled();
      expect(service.findPersonal).not.toHaveBeenCalled();
    });

    it('does not read "administrative" as a notification id', async () => {
      await get('/administrative/notifications', UserRole.HR).expect(200);

      expect(service.findOne).not.toHaveBeenCalled();
    });

    it('has no id route under the administrative prefix', async () => {
      await get('/administrative/notifications/ntf-1', UserRole.HR).expect(404);
    });

    it('has no POST under the administrative prefix', async () => {
      await request(app.getHttpServer())
        .post('/administrative/notifications')
        .set(as(UserRole.HR))
        .expect(404);
    });
  });

  describe('read-all is a collection route, not an id', () => {
    it('routes PATCH /notifications/read-all to the bulk mark', async () => {
      await request(app.getHttpServer())
        .patch('/notifications/read-all')
        .set(as(UserRole.USER))
        .expect(200);

      expect(service.markAllPersonalRead).toHaveBeenCalled();
      expect(service.markRead).not.toHaveBeenCalled();
    });

    it('routes PATCH /notifications/:id/read to the single mark', async () => {
      await request(app.getHttpServer())
        .patch('/notifications/ntf-1/read')
        .set(as(UserRole.USER))
        .expect(200);

      expect(service.markRead).toHaveBeenCalledWith(
        expect.objectContaining({ userId: 'usr-1' }),
        'ntf-1',
      );
      expect(service.markAllPersonalRead).not.toHaveBeenCalled();
    });

    it('routes the administrative bulk mark to its own workspace', async () => {
      await request(app.getHttpServer())
        .patch('/administrative/notifications/read-all')
        .set(as(UserRole.ADMIN))
        .expect(200);

      expect(service.markAllAdministrativeRead).toHaveBeenCalled();
      expect(service.markAllPersonalRead).not.toHaveBeenCalled();
    });

    it('has no plain PATCH on a notification', async () => {
      await request(app.getHttpServer())
        .patch('/notifications/ntf-1')
        .set(as(UserRole.USER))
        .send({ title: 'Edited' })
        .expect(404);
    });
  });

  describe('delete distinguishes the collection from one row', () => {
    it('routes DELETE /notifications to the bulk delete', async () => {
      await request(app.getHttpServer())
        .delete('/notifications')
        .set(as(UserRole.USER))
        .expect(200);

      expect(service.removeAllPersonal).toHaveBeenCalled();
      expect(service.remove).not.toHaveBeenCalled();
    });

    it('routes DELETE /notifications/:id to the single delete', async () => {
      await request(app.getHttpServer())
        .delete('/notifications/ntf-1')
        .set(as(UserRole.USER))
        .expect(200);

      expect(service.remove).toHaveBeenCalledWith(
        expect.objectContaining({ userId: 'usr-1' }),
        'ntf-1',
      );
      expect(service.removeAllPersonal).not.toHaveBeenCalled();
    });

    it('routes the administrative bulk delete to its own workspace', async () => {
      await request(app.getHttpServer())
        .delete('/administrative/notifications')
        .set(as(UserRole.HR))
        .expect(200);

      expect(service.removeAllAdministrative).toHaveBeenCalled();
      expect(service.removeAllPersonal).not.toHaveBeenCalled();
    });
  });

  describe('the authenticated caller', () => {
    it('passes the account and the role through', async () => {
      await get('/notifications/ntf-1', UserRole.HR).expect(200);

      expect(service.findOne).toHaveBeenCalledWith(
        {
          userId: 'usr-1',
          employeeId: null,
          role: UserRole.HR,
          administrativeAccess: true,
        },
        'ntf-1',
      );
    });

    it('carries the employee record of an account that has one', async () => {
      await request(app.getHttpServer())
        .get('/notifications')
        .set(auth.as({ role: UserRole.USER, employeeId: 'emp-1' }))
        .expect(200);

      expect(service.findPersonal).toHaveBeenCalledWith(
        expect.objectContaining({ employeeId: 'emp-1' }),
        expect.anything(),
      );
    });

    it('rejects a request with no access token, naming what to send', async () => {
      const response = await request(app.getHttpServer())
        .get('/notifications')
        .expect(401);

      expect(JSON.stringify(response.body)).toContain('Bearer');
      expect(service.findPersonal).not.toHaveBeenCalled();
    });

    it('rejects a token this spec never issued', async () => {
      await request(app.getHttpServer())
        .get('/notifications')
        .set({ authorization: 'Bearer not-a-token-we-minted' })
        .expect(401);

      expect(service.findPersonal).not.toHaveBeenCalled();
    });

    /**
     * The claim `x-administrative-access` was never trusted as a header, and now
     * there is no header to trust: the value is derived from the role of the
     * account the token names. Sending one changes nothing, which is the whole
     * assertion.
     */
    it('derives administrativeAccess rather than trusting the client', async () => {
      await request(app.getHttpServer())
        .get('/notifications')
        .set({ ...as(UserRole.USER), 'x-administrative-access': 'true' })
        .expect(200);

      expect(service.findPersonal).toHaveBeenCalledWith(
        expect.objectContaining({ administrativeAccess: false }),
        expect.anything(),
      );
    });

    /**
     * The create route reads no `@CurrentUser()` — it addresses a notification
     * rather than acting as somebody — but it is still authenticated, because
     * Feature 032 made that the default for every route and this one has no
     * claim to be `@Public()`. "Nobody to check" is about *whose* notification
     * it is, not about whether a stranger may post one.
     */
    it('still requires a token although it reads no caller', async () => {
      await request(app.getHttpServer())
        .post('/notifications')
        .set(as(UserRole.ADMIN))
        .send({
          workspace: 'PERSONAL',
          recipientType: 'ALL_USERS',
          title: 'Maintenance',
          message: 'The system will be unavailable on Sunday.',
        })
        .expect(201);

      expect(service.create).toHaveBeenCalled();
    });
  });

  describe('query validation runs at the route', () => {
    it('rejects ?workspace= before the service sees it', async () => {
      await get('/notifications?workspace=ADMINISTRATIVE').expect(400);

      expect(service.findPersonal).not.toHaveBeenCalled();
    });

    it('rejects an unknown sort column', async () => {
      await get('/notifications?sortBy=message').expect(400);

      expect(service.findPersonal).not.toHaveBeenCalled();
    });

    it('applies the same query rules to the administrative list', async () => {
      await get('/administrative/notifications?isRead=yes', UserRole.HR).expect(
        400,
      );

      expect(service.findAdministrative).not.toHaveBeenCalled();
    });

    it('passes the parsed filters through', async () => {
      await get('/notifications?isRead=false&category=LEAVE').expect(200);

      expect(service.findPersonal).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ isRead: false, category: 'LEAVE' }),
      );
    });
  });

  describe('body validation runs at the route', () => {
    it('rejects a create without a title', async () => {
      await request(app.getHttpServer())
        .post('/notifications')
        .set(as(UserRole.ADMIN))
        .send({
          workspace: 'PERSONAL',
          recipientType: 'ALL_USERS',
          message: 'No title on this one.',
        })
        .expect(400);

      expect(service.create).not.toHaveBeenCalled();
    });

    it('rejects a create that tries to set isRead', async () => {
      await request(app.getHttpServer())
        .post('/notifications')
        .set(as(UserRole.ADMIN))
        .send({
          workspace: 'PERSONAL',
          recipientType: 'ALL_USERS',
          title: 'Maintenance',
          message: 'The system will be unavailable on Sunday.',
          isRead: true,
        })
        .expect(400);

      expect(service.create).not.toHaveBeenCalled();
    });
  });
});
