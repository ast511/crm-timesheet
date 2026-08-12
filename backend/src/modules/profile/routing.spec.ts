import {
  INestApplication,
  ValidationPipe,
  VersioningType,
} from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';

import { AllExceptionsFilter } from '../../common/filters/all-exceptions.filter';
import { ResponseInterceptor } from '../../common/interceptors/response.interceptor';
import {
  API_DEFAULT_VERSION,
  API_PREFIX,
  API_VERSION_PREFIX,
} from '../../config/api.constants';
import {
  AccountStatus,
  EmployeeStatus,
  SeniorityLevel,
  UserRole,
} from '../../generated/prisma/enums';
import { PrismaService } from '../../prisma/prisma.service';
import { TestAuthentication } from '../auth/testing/authentication.testing';
import { ProfileController } from './profile.controller';
import { ProfileService } from './profile.service';

const BASE = `/${API_PREFIX}/${API_VERSION_PREFIX}${API_DEFAULT_VERSION}`;

/** A joined row as `PROFILE_SELECT` returns it — the account and its employee. */
const ROW = {
  id: 'usr-1',
  email: 'ana.pop@example.com',
  username: 'APO',
  role: UserRole.USER,
  status: AccountStatus.ACTIVE,
  createdAt: new Date('2026-01-05T09:00:00.000Z'),
  employee: {
    id: 'emp-1',
    employeeCode: 'EMP-0001',
    firstName: 'Ana',
    lastName: 'Pop',
    phone: '+40 721 000 001',
    hireDate: new Date('2020-01-13T00:00:00.000Z'),
    terminationDate: null,
    seniority: SeniorityLevel.SENIOR,
    status: EmployeeStatus.ACTIVE,
    department: { id: 'dep-1', code: 'DEV', name: 'Development' },
    position: { id: 'pos-1', code: 'DEV-SR', name: 'Senior Developer' },
  },
};

/**
 * The profile routes, through real requests — with the **real service** over a
 * substituted database.
 *
 * The service is real rather than stubbed because the two things worth proving
 * here are properties of what it queries and writes: that the response can never
 * carry a password hash or a token, and that a `PATCH` writes exactly one column
 * of exactly the caller's own employee row. A stub would assert that a mock was
 * called.
 */
describe('profile routing', () => {
  let app: INestApplication;
  let prisma: {
    user: { findUnique: jest.Mock };
    employee: { update: jest.Mock };
  };

  const auth = new TestAuthentication();

  const as = (overrides = {}) =>
    auth.as({ userId: 'usr-1', employeeId: 'emp-1', ...overrides });

  beforeAll(async () => {
    prisma = {
      user: { findUnique: jest.fn() },
      employee: { update: jest.fn() },
    };

    const moduleRef: TestingModule = await Test.createTestingModule({
      controllers: [ProfileController],
      providers: [
        ProfileService,
        { provide: PrismaService, useValue: prisma },
        ...auth.providers,
      ],
    }).compile();

    app = moduleRef.createNestApplication();
    app.setGlobalPrefix(API_PREFIX);
    app.enableVersioning({
      type: VersioningType.URI,
      prefix: API_VERSION_PREFIX,
      defaultVersion: API_DEFAULT_VERSION,
    });
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    app.useGlobalInterceptors(new ResponseInterceptor());
    app.useGlobalFilters(new AllExceptionsFilter());

    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    jest.clearAllMocks();
    prisma.user.findUnique.mockResolvedValue(ROW);
    prisma.employee.update.mockResolvedValue({ id: 'emp-1' });
  });

  describe('GET /profile/me', () => {
    it('returns the account and the employment record together', async () => {
      const response = await request(app.getHttpServer())
        .get(`${BASE}/profile/me`)
        .set(as())
        .expect(200);

      expect(response.body.data).toEqual({
        account: {
          id: 'usr-1',
          email: 'ana.pop@example.com',
          username: 'APO',
          role: UserRole.USER,
          status: AccountStatus.ACTIVE,
          createdAt: '2026-01-05T09:00:00.000Z',
        },
        employee: expect.objectContaining({
          employeeCode: 'EMP-0001',
          firstName: 'Ana',
          phone: '+40 721 000 001',
          department: { id: 'dep-1', code: 'DEV', name: 'Development' },
        }) as unknown,
      });
    });

    /**
     * The guarantee this whole endpoint is judged on. The hash is never *read*
     * out of PostgreSQL — the `select` does not name it — and neither is any
     * outstanding activation or reset link, which would hand a session the means
     * to reset its own password without knowing the current one.
     */
    it('never selects or returns a password hash or any token', async () => {
      const response = await request(app.getHttpServer())
        .get(`${BASE}/profile/me`)
        .set(as())
        .expect(200);

      const [{ select }] = prisma.user.findUnique.mock.calls[0] as [
        { select: Record<string, unknown> },
      ];

      expect(select).not.toHaveProperty('passwordHash');
      expect(select).not.toHaveProperty('accountTokens');
      expect(select).not.toHaveProperty('refreshTokens');
      expect(JSON.stringify(response.body)).not.toMatch(/passwordHash|token/i);
    });

    /** A super-admin created to administer the system has no employee row. */
    it('answers employee: null for an account with no employment record', async () => {
      prisma.user.findUnique.mockResolvedValue({ ...ROW, employee: null });

      const response = await request(app.getHttpServer())
        .get(`${BASE}/profile/me`)
        .set(as({ employeeId: null }))
        .expect(200);

      expect(response.body.data.employee).toBeNull();
      expect(response.body.data.account).toBeDefined();
    });

    /**
     * The account is the caller's, always. There is no id parameter to get
     * wrong, which is why this route needs no ownership check.
     */
    it('reads the caller’s own account and nothing else', async () => {
      await request(app.getHttpServer())
        .get(`${BASE}/profile/me`)
        .set(auth.as({ userId: 'usr-9', employeeId: 'emp-9' }))
        .expect(200);

      expect(prisma.user.findUnique).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'usr-9' } }),
      );
    });

    it('requires an access token', async () => {
      await request(app.getHttpServer()).get(`${BASE}/profile/me`).expect(401);
    });

    /** There is no route by which one person reads another's profile. */
    it('has no /profile/:id', async () => {
      await request(app.getHttpServer())
        .get(`${BASE}/profile/usr-9`)
        .set(as())
        .expect(404);
    });
  });

  describe('PATCH /profile/me', () => {
    it('updates the one editable field', async () => {
      await request(app.getHttpServer())
        .patch(`${BASE}/profile/me`)
        .set(as())
        .send({ phone: '+40 722 999 888' })
        .expect(200);

      expect(prisma.employee.update).toHaveBeenCalledWith({
        where: { id: 'emp-1' },
        data: { phone: '+40 722 999 888' },
        select: { id: true },
      });
    });

    it('clears the phone on an explicit null', async () => {
      await request(app.getHttpServer())
        .patch(`${BASE}/profile/me`)
        .set(as())
        .send({ phone: null })
        .expect(200);

      expect(prisma.employee.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: { phone: null } }),
      );
    });

    /**
     * **The whitelist, asserted as rejections.** Each of these is somebody
     * trying to change a fact about themselves that belongs to HR or to an
     * administrator — a promotion, a role, an identity. `forbidNonWhitelisted`
     * turns each into a `400` naming the property rather than a value silently
     * dropped, so a client is told rather than shown a success over a change
     * that never happened.
     */
    it.each([
      ['a role', { role: UserRole.ADMIN }],
      ['an email', { email: 'someone.else@example.com' }],
      ['an account status', { status: AccountStatus.ACTIVE }],
      ['an employee code', { employeeCode: 'EMP-9999' }],
      ['a position', { positionId: 'pos-9' }],
      ['a department', { departmentId: 'dep-9' }],
      ['a seniority', { seniority: SeniorityLevel.LEAD }],
      ['a hire date', { hireDate: '2019-01-01' }],
      ['an employee status', { status: EmployeeStatus.TERMINATED }],
      ['a password', { password: 'a new one' }],
      ['a first name', { firstName: 'Someone' }],
      ['another user’s id', { userId: 'usr-9' }],
    ])('refuses to let a user change %s', async (_case, body) => {
      await request(app.getHttpServer())
        .patch(`${BASE}/profile/me`)
        .set(as())
        .send({ phone: '+40 722 999 888', ...body })
        .expect(400);

      expect(prisma.employee.update).not.toHaveBeenCalled();
    });

    /** Writes the caller's own employee row, never one named in the body. */
    it('writes only the caller’s own employee row', async () => {
      await request(app.getHttpServer())
        .patch(`${BASE}/profile/me`)
        .set(auth.as({ userId: 'usr-9', employeeId: 'emp-9' }))
        .send({ phone: '+40 722 111 222' })
        .expect(200);

      expect(prisma.employee.update).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'emp-9' } }),
      );
    });

    /**
     * An account with no employment record has nothing this endpoint can write:
     * the only editable field lives on `employees`.
     */
    it('refuses an account with no employment record', async () => {
      const response = await request(app.getHttpServer())
        .patch(`${BASE}/profile/me`)
        .set(as({ employeeId: null }))
        .send({ phone: '+40 722 999 888' })
        .expect(403);

      expect(response.body.errorCode).toBe('AUTH_NO_EMPLOYEE_RECORD');
      expect(prisma.employee.update).not.toHaveBeenCalled();
    });

    /** A patch with nothing to change is not an error. */
    it('accepts an empty body as a no-op', async () => {
      await request(app.getHttpServer())
        .patch(`${BASE}/profile/me`)
        .set(as())
        .send({})
        .expect(200);
    });

    it('requires an access token', async () => {
      await request(app.getHttpServer())
        .patch(`${BASE}/profile/me`)
        .send({ phone: '+40 722 999 888' })
        .expect(401);
    });
  });
});
