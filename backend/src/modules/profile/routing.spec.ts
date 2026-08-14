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
  UiColorScheme,
  UiCornerRadius,
  UserRole,
} from '../../generated/prisma/enums';
import { PrismaService } from '../../prisma/prisma.service';
import { AUTHENTICATED_USER_SELECT } from '../auth/entities/authenticated-user.entity';
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
  colorScheme: UiColorScheme.DEFAULT,
  cornerRadius: UiCornerRadius.MEDIUM,
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
    user: { findUnique: jest.Mock; update: jest.Mock };
    employee: { update: jest.Mock };
    $transaction: jest.Mock;
  };

  const auth = new TestAuthentication();

  const as = (overrides = {}) =>
    auth.as({ userId: 'usr-1', employeeId: 'emp-1', ...overrides });

  beforeAll(async () => {
    prisma = {
      user: { findUnique: jest.fn(), update: jest.fn() },
      employee: { update: jest.fn() },
      // The service hands `$transaction` the operations it built, so awaiting
      // them here is what a real client does — and it keeps each `update` mock
      // recording the call the assertions below read.
      $transaction: jest.fn((operations: Promise<unknown>[]) =>
        Promise.all(operations),
      ),
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
    prisma.user.update.mockResolvedValue({ id: 'usr-1' });
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
          colorScheme: UiColorScheme.DEFAULT,
          cornerRadius: UiCornerRadius.MEDIUM,
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

    /**
     * Feature 039. **This endpoint is where a frontend reads the theme**, so
     * the two preferences being on the payload is the contract rather than a
     * detail — a client applies them on load from this response.
     */
    it('returns the UI preferences on the account half', async () => {
      const response = await request(app.getHttpServer())
        .get(`${BASE}/profile/me`)
        .set(as())
        .expect(200);

      expect(response.body.data.account).toMatchObject({
        colorScheme: UiColorScheme.DEFAULT,
        cornerRadius: UiCornerRadius.MEDIUM,
      });
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
    it('updates the phone — the one editable field of the employment half', async () => {
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

    /**
     * A patch with nothing to change is not an error — and now writes nothing
     * at all rather than issuing an UPDATE whose only effect would have been to
     * bump `updated_at`.
     */
    it('accepts an empty body as a no-op, and writes nothing', async () => {
      await request(app.getHttpServer())
        .patch(`${BASE}/profile/me`)
        .set(as())
        .send({})
        .expect(200);

      expect(prisma.$transaction).not.toHaveBeenCalled();
      expect(prisma.user.update).not.toHaveBeenCalled();
      expect(prisma.employee.update).not.toHaveBeenCalled();
    });

    it('requires an access token', async () => {
      await request(app.getHttpServer())
        .patch(`${BASE}/profile/me`)
        .send({ phone: '+40 722 999 888' })
        .expect(401);
    });
  });

  /**
   * **Feature 039 — the two UI preferences.**
   *
   * They are columns of `users` rather than of `employees`, which is what most
   * of this block is really testing: the same body now spans two tables, and the
   * interesting cases are all at that seam — an account with no employment
   * record, a request that names both halves, and a rejected request that must
   * leave neither half written.
   */
  describe('PATCH /profile/me — UI preferences', () => {
    it('updates both preferences on the caller’s own account', async () => {
      await request(app.getHttpServer())
        .patch(`${BASE}/profile/me`)
        .set(as())
        .send({
          colorScheme: UiColorScheme.VIOLET,
          cornerRadius: UiCornerRadius.FULL,
        })
        .expect(200);

      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: 'usr-1' },
        data: {
          colorScheme: UiColorScheme.VIOLET,
          cornerRadius: UiCornerRadius.FULL,
        },
        select: { id: true },
      });
    });

    /** Absent means "leave it alone", which Prisma reads from the `undefined`. */
    it('leaves the other preference alone when only one is sent', async () => {
      await request(app.getHttpServer())
        .patch(`${BASE}/profile/me`)
        .set(as())
        .send({ colorScheme: UiColorScheme.GREEN })
        .expect(200);

      expect(prisma.user.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: {
            colorScheme: UiColorScheme.GREEN,
            cornerRadius: undefined,
          },
        }),
      );
    });

    it('touches no employee row when only preferences are sent', async () => {
      await request(app.getHttpServer())
        .patch(`${BASE}/profile/me`)
        .set(as())
        .send({ cornerRadius: UiCornerRadius.NONE })
        .expect(200);

      expect(prisma.employee.update).not.toHaveBeenCalled();
    });

    /**
     * The round trip the whole feature exists for: what was chosen on one
     * device is what the next read returns. The stored row here is a stand-in
     * for the column — the update writes into it and the re-read reads it — so
     * this asserts the write and the read agree rather than that a mock was
     * called.
     */
    it('persists the change, so a re-fetch returns the new values', async () => {
      let stored = { ...ROW };

      prisma.user.update.mockImplementation(
        ({ data }: { data: Partial<typeof ROW> }) => {
          stored = { ...stored, ...data };

          return Promise.resolve({ id: stored.id });
        },
      );
      prisma.user.findUnique.mockImplementation(() => Promise.resolve(stored));

      const patched = await request(app.getHttpServer())
        .patch(`${BASE}/profile/me`)
        .set(as())
        .send({
          colorScheme: UiColorScheme.BLUE,
          cornerRadius: UiCornerRadius.LARGE,
        })
        .expect(200);

      expect(patched.body.data.account).toMatchObject({
        colorScheme: UiColorScheme.BLUE,
        cornerRadius: UiCornerRadius.LARGE,
      });

      const refetched = await request(app.getHttpServer())
        .get(`${BASE}/profile/me`)
        .set(as())
        .expect(200);

      expect(refetched.body.data.account).toMatchObject({
        colorScheme: UiColorScheme.BLUE,
        cornerRadius: UiCornerRadius.LARGE,
      });
    });

    /**
     * **A value outside the enum never reaches PostgreSQL.** `@IsEnum` turns it
     * into the standard `400` envelope with `VALIDATION_ERROR`, naming the
     * property — the alternative, letting the column refuse it, would render a
     * typo as a `500`.
     *
     * The lower-case cases matter: the wire values are the enum's members, and
     * `violet` is the *stored* spelling rather than the API's.
     */
    it.each([
      ['a colour that does not exist', { colorScheme: 'PURPLE' }],
      ['the stored spelling of a real colour', { colorScheme: 'violet' }],
      ['a radius that does not exist', { cornerRadius: 'HUGE' }],
      ['the stored spelling of a real radius', { cornerRadius: 'medium' }],
      ['the radius as the number it stands for', { cornerRadius: 0.5 }],
      ['an empty string', { colorScheme: '' }],
      ['a null, which neither column admits', { colorScheme: null }],
    ])('rejects %s with the standard envelope', async (_case, body) => {
      const response = await request(app.getHttpServer())
        .patch(`${BASE}/profile/me`)
        .set(as())
        .send(body)
        .expect(400);

      expect(response.body).toMatchObject({
        success: false,
        errorCode: 'VALIDATION_ERROR',
      });
      expect(prisma.$transaction).not.toHaveBeenCalled();
      expect(prisma.user.update).not.toHaveBeenCalled();
    });

    /**
     * Self-service, and there is nothing to check because there is nothing to
     * name: the row written is the one the *token* resolved to, so a body
     * claiming another account is a `400` from the whitelist and the `where`
     * never sees it either way.
     */
    it('writes only the caller’s own account row', async () => {
      await request(app.getHttpServer())
        .patch(`${BASE}/profile/me`)
        .set(auth.as({ userId: 'usr-9', employeeId: 'emp-9' }))
        .send({ colorScheme: UiColorScheme.RED })
        .expect(200);

      expect(prisma.user.update).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'usr-9' } }),
      );
    });

    it.each([
      ['a user id', { userId: 'usr-9' }],
      ['an account id', { id: 'usr-9' }],
      ['somebody else’s email', { email: 'someone.else@example.com' }],
    ])(
      'refuses a preference change that also names %s',
      async (_case, body) => {
        await request(app.getHttpServer())
          .patch(`${BASE}/profile/me`)
          .set(as())
          .send({ colorScheme: UiColorScheme.ROSE, ...body })
          .expect(400);

        expect(prisma.user.update).not.toHaveBeenCalled();
      },
    );

    /**
     * The refusal that Feature 039 narrowed. An account with no employment
     * record used to be turned away from this endpoint outright, because the
     * only editable field lived on `employees`. It now has columns of its own,
     * so a super-admin may choose a theme — and is still refused a phone, which
     * has nowhere to go.
     */
    it('lets an account with no employment record set its preferences', async () => {
      prisma.user.findUnique.mockResolvedValue({ ...ROW, employee: null });

      await request(app.getHttpServer())
        .patch(`${BASE}/profile/me`)
        .set(as({ employeeId: null }))
        .send({ colorScheme: UiColorScheme.YELLOW })
        .expect(200);

      expect(prisma.user.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: { colorScheme: UiColorScheme.YELLOW, cornerRadius: undefined },
        }),
      );
      expect(prisma.employee.update).not.toHaveBeenCalled();
    });

    /**
     * A body naming both halves, from an account that has only one of them.
     * The refusal is raised before anything is written, so the theme does not
     * land while the phone is rejected — a client's `403` describes the whole
     * request rather than half of it.
     */
    it('writes neither half when the phone is refused for want of an employee', async () => {
      prisma.user.findUnique.mockResolvedValue({ ...ROW, employee: null });

      const response = await request(app.getHttpServer())
        .patch(`${BASE}/profile/me`)
        .set(as({ employeeId: null }))
        .send({
          phone: '+40 722 999 888',
          colorScheme: UiColorScheme.ORANGE,
        })
        .expect(403);

      expect(response.body.errorCode).toBe('AUTH_NO_EMPLOYEE_RECORD');
      expect(prisma.$transaction).not.toHaveBeenCalled();
      expect(prisma.user.update).not.toHaveBeenCalled();
      expect(prisma.employee.update).not.toHaveBeenCalled();
    });

    /** Both halves of one request go in one transaction, or neither does. */
    it('writes a phone and a preference in a single transaction', async () => {
      await request(app.getHttpServer())
        .patch(`${BASE}/profile/me`)
        .set(as())
        .send({
          phone: '+40 722 111 222',
          cornerRadius: UiCornerRadius.SMALL,
        })
        .expect(200);

      expect(prisma.$transaction).toHaveBeenCalledTimes(1);

      const [operations] = prisma.$transaction.mock.calls[0] as [unknown[]];

      expect(operations).toHaveLength(2);
      expect(prisma.user.update).toHaveBeenCalledTimes(1);
      expect(prisma.employee.update).toHaveBeenCalledTimes(1);
    });

    it('requires an access token', async () => {
      await request(app.getHttpServer())
        .patch(`${BASE}/profile/me`)
        .send({ colorScheme: UiColorScheme.BLUE })
        .expect(401);
    });
  });

  /**
   * **Where a client reads the preferences — the exposure decision of Feature
   * 039, asserted rather than only documented.**
   *
   * They ride on `/profile/me` and on nothing else. The obvious alternative was
   * `GET /auth/me` and the login response, since those are what a frontend
   * hydrates a session from; it was rejected because the query behind them runs
   * on **every authenticated request** — `JwtAuthGuard` resolves the caller from
   * the database each time — and nothing in the application branches on a
   * colour. This test is what stops that select quietly growing.
   */
  describe('the session-hydration contract', () => {
    it('serves both preferences from the profile read', async () => {
      const response = await request(app.getHttpServer())
        .get(`${BASE}/profile/me`)
        .set(as())
        .expect(200);

      expect(response.body.data.account.colorScheme).toBeDefined();
      expect(response.body.data.account.cornerRadius).toBeDefined();
    });

    it('keeps them out of the select that runs on every authenticated request', () => {
      expect(AUTHENTICATED_USER_SELECT).not.toHaveProperty('colorScheme');
      expect(AUTHENTICATED_USER_SELECT).not.toHaveProperty('cornerRadius');
    });
  });
});
