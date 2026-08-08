import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';

import { UserRole } from '../../generated/prisma/enums';
import { TestAuthentication } from '../auth/testing/authentication.testing';
import { PermissionController } from './permission.controller';
import { PermissionService } from './permission.service';
import { UserPermissionController } from './user-permission.controller';
import { UserPermissionService } from './user-permission.service';

/**
 * Two collections under one prefix, exercised through real requests.
 *
 * Four things can only be checked here rather than in a unit test:
 *
 * 1. **Which routes exist**, and just as importantly which do not. This module
 *    has no `POST /permissions` and no `POST /permissions/presets` — both tables
 *    are seeded vocabulary — and it has no guard on anything. A `404` on the
 *    first two is the claim; the absence of a `403` anywhere is the other.
 * 2. **That the sub-resource does not collide with the users module.**
 *    `/users/:id/permissions` is mounted here while `/users/:id` stays in the
 *    users module, and nothing in `UserController` was touched.
 * 3. **`@CurrentUser()` through Nest's pipeline.** A param decorator's logic runs
 *    inside the request, so a direct call would test nothing — and this is what
 *    proves `changedByUserId` comes from the header rather than from a constant.
 * 4. **The global `ValidationPipe` on the real routes**, so the query and body
 *    rules are exercised where a client meets them.
 */
describe('permission-management routing', () => {
  let app: INestApplication;

  const page = { items: [], meta: {} };
  const matrix = { userId: 'usr-1', role: UserRole.USER, resources: [] };

  const permissions = {
    findAll: jest.fn().mockResolvedValue(page),
    findPresets: jest.fn().mockResolvedValue(page),
    findEffectiveForCaller: jest
      .fn()
      .mockResolvedValue({ userId: 'usr-1', permissions: [] }),
  };
  const userPermissions = {
    findMatrix: jest.fn().mockResolvedValue(matrix),
    replace: jest.fn().mockResolvedValue(matrix),
    applyPreset: jest.fn().mockResolvedValue(matrix),
    resetToRole: jest.fn().mockResolvedValue(matrix),
    findHistory: jest.fn().mockResolvedValue(page),
  };

  /** The access token a caller has to present, since Feature 032. */
  const auth = new TestAuthentication();

  const as = (userId = 'usr-admin', role: UserRole = UserRole.ADMIN) =>
    auth.as({ userId, role });

  beforeAll(async () => {
    const moduleRef: TestingModule = await Test.createTestingModule({
      controllers: [PermissionController, UserPermissionController],
      providers: [
        { provide: PermissionService, useValue: permissions },
        { provide: UserPermissionService, useValue: userPermissions },
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

  describe('/permissions', () => {
    it('lists the catalog', async () => {
      await request(app.getHttpServer())
        .get('/permissions')
        .set(as())
        .expect(200);

      expect(permissions.findAll).toHaveBeenCalled();
    });

    it('reads no caller to list the catalog, and is still authenticated', async () => {
      // The catalog is vocabulary; it says nothing about anybody. Which is a
      // statement about whose data it is, not about who may read it — since
      // Feature 032 every route needs a token unless it is `@Public()`.
      await request(app.getHttpServer())
        .get('/permissions?resource=TIMESHEET&limit=100')
        .set(as())
        .expect(200);
    });

    it('lists the presets without colliding with the catalog route', async () => {
      await request(app.getHttpServer())
        .get('/permissions/presets')
        .set(as())
        .expect(200);

      expect(permissions.findPresets).toHaveBeenCalled();
      expect(permissions.findAll).not.toHaveBeenCalled();
    });

    it('filters the presets by target role', async () => {
      await request(app.getHttpServer())
        .get('/permissions/presets?targetRole=HR')
        .set(as())
        .expect(200);

      expect(permissions.findPresets).toHaveBeenCalledWith(
        expect.objectContaining({ targetRole: UserRole.HR }),
      );
    });

    it('rejects a sort parameter the preset list does not offer', async () => {
      // Six fixed cards in two groups; there is nothing to choose.
      await request(app.getHttpServer())
        .get('/permissions/presets?sortBy=name')
        .set(as())
        .expect(400);
    });

    it('passes the caller through to me/effective', async () => {
      await request(app.getHttpServer())
        .get('/permissions/me/effective')
        .set(as('usr-7', UserRole.HR))
        .expect(200);

      expect(permissions.findEffectiveForCaller).toHaveBeenCalledWith(
        expect.objectContaining({ userId: 'usr-7', role: UserRole.HR }),
      );
    });

    it('refuses me/effective when the request presents no access token', async () => {
      await request(app.getHttpServer())
        .get('/permissions/me/effective')
        .expect(401);

      expect(permissions.findEffectiveForCaller).not.toHaveBeenCalled();
    });

    it('has no create endpoint: the catalog is seeded vocabulary', async () => {
      await request(app.getHttpServer())
        .post('/permissions')
        .set(as())
        .send({ key: 'PAYROLL.RUN' })
        .expect(404);
    });

    it('has no preset create endpoint either', async () => {
      await request(app.getHttpServer())
        .post('/permissions/presets')
        .set(as())
        .send({ key: 'MY_PRESET' })
        .expect(404);
    });

    it('has no GET /:id: a permission is addressed by its key', async () => {
      await request(app.getHttpServer())
        .get('/permissions/prm-1')
        .set(as())
        .expect(404);
    });

    it('rejects a query parameter it does not offer', async () => {
      await request(app.getHttpServer())
        .get('/permissions?role=HR')
        .set(as())
        .expect(400);
    });
  });

  describe('/users/:id/permissions', () => {
    it('reads one user matrix', async () => {
      await request(app.getHttpServer())
        .get('/users/usr-1/permissions')
        .set(as())
        .expect(200);

      expect(userPermissions.findMatrix).toHaveBeenCalledWith('usr-1');
    });

    it('replaces the matrix through PUT, carrying the caller', async () => {
      // The proof that changedByUserId is taken from the request rather than
      // hardcoded: the service receives whoever the header claimed.
      await request(app.getHttpServer())
        .put('/users/usr-1/permissions')
        .set(as('usr-admin'))
        .send({ permissionKeys: ['TIMESHEET.CREATE'] })
        .expect(200);

      expect(userPermissions.replace).toHaveBeenCalledWith(
        'usr-1',
        expect.objectContaining({ userId: 'usr-admin' }),
        { permissionKeys: ['TIMESHEET.CREATE'] },
      );
    });

    it('accepts an empty intended set: it is not the same as a reset', async () => {
      await request(app.getHttpServer())
        .put('/users/usr-1/permissions')
        .set(as())
        .send({ permissionKeys: [] })
        .expect(200);

      expect(userPermissions.replace).toHaveBeenCalledWith(
        'usr-1',
        expect.anything(),
        { permissionKeys: [] },
      );
    });

    it('refuses a PUT that presents no access token', async () => {
      await request(app.getHttpServer())
        .put('/users/usr-1/permissions')
        .send({ permissionKeys: [] })
        .expect(401);

      expect(userPermissions.replace).not.toHaveBeenCalled();
    });

    it('rejects a duplicate key at the route', async () => {
      await request(app.getHttpServer())
        .put('/users/usr-1/permissions')
        .set(as())
        .send({ permissionKeys: ['TIMESHEET.VIEW', 'TIMESHEET.VIEW'] })
        .expect(400);

      expect(userPermissions.replace).not.toHaveBeenCalled();
    });

    it('applies a preset, answering 201', async () => {
      await request(app.getHttpServer())
        .post('/users/usr-1/permissions/apply-preset')
        .set(as('usr-admin'))
        .send({ presetKey: 'HR_STANDARD' })
        .expect(201);

      expect(userPermissions.applyPreset).toHaveBeenCalledWith(
        'usr-1',
        expect.objectContaining({ userId: 'usr-admin' }),
        { presetKey: 'HR_STANDARD' },
      );
    });

    it('resets to role through DELETE, answering 200 rather than 204', async () => {
      await request(app.getHttpServer())
        .delete('/users/usr-1/permissions')
        .set(as('usr-admin'))
        .expect(200);

      expect(userPermissions.resetToRole).toHaveBeenCalledWith(
        'usr-1',
        expect.objectContaining({ userId: 'usr-admin' }),
      );
    });

    it('reads the history without colliding with the matrix route', async () => {
      await request(app.getHttpServer())
        .get('/users/usr-1/permissions/history?page=2&action=PRESET_APPLIED')
        .set(as())
        .expect(200);

      expect(userPermissions.findHistory).toHaveBeenCalledWith(
        'usr-1',
        expect.objectContaining({ page: 2, action: 'PRESET_APPLIED' }),
      );
      expect(userPermissions.findMatrix).not.toHaveBeenCalled();
    });

    it('rejects a free-text search on the history: there is no text to match', async () => {
      await request(app.getHttpServer())
        .get('/users/usr-1/permissions/history?search=granted')
        .set(as())
        .expect(400);
    });

    it('takes the id as a plain string, since ids are cuids', async () => {
      await request(app.getHttpServer())
        .get('/users/not-a-uuid/permissions')
        .set(as())
        .expect(200);

      expect(userPermissions.findMatrix).toHaveBeenCalledWith('not-a-uuid');
    });

    it('has no per-permission toggle endpoint: the matrix is replaced whole', async () => {
      await request(app.getHttpServer())
        .post('/users/usr-1/permissions/TIMESHEET.CREATE')
        .set(as())
        .expect(404);
    });
  });

  it('does not collide the two collections', async () => {
    await request(app.getHttpServer())
      .get('/permissions')
      .set(as())
      .expect(200);
    await request(app.getHttpServer())
      .get('/users/usr-1/permissions')
      .set(as())
      .expect(200);

    expect(permissions.findAll).toHaveBeenCalledTimes(1);
    expect(userPermissions.findMatrix).toHaveBeenCalledTimes(1);
  });
});
