import {
  INestApplication,
  ValidationPipe,
  VersioningType,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';

import { AllExceptionsFilter } from '../../common/filters/all-exceptions.filter';
import { ResponseInterceptor } from '../../common/interceptors/response.interceptor';
import {
  API_DEFAULT_VERSION,
  API_PREFIX,
  API_VERSION_PREFIX,
} from '../../config/api.constants';
import { UserRole } from '../../generated/prisma/enums';
import { TestAuthentication } from '../auth/testing/authentication.testing';
import {
  PermissionRequirement,
  REQUIRED_PERMISSIONS_KEY,
} from '../authorization/decorators/require-permission.decorator';
import { ReportingController } from './reporting.controller';
import { ReportingService } from './reporting.service';

/**
 * The reporting routes, exercised through real requests.
 *
 * Four things can only be checked here rather than in a unit test:
 *
 * 1. **Which routes exist**, and which deliberately do not — there is no
 *    `GET /reports/:reportType`, because a report type is not a resource.
 * 2. **That every route requires an access token**, which is this module's own
 *    stake in Feature 032 rather than a re-test of how a token is verified.
 * 3. **The global `ValidationPipe` on the real routes**, so `:reportType`, the
 *    body and `?format=` are rejected where a client actually meets them.
 * 4. **The export's headers and body**, which is the one response in this
 *    application that is not the `{ success, data }` envelope.
 *
 * No `PermissionsGuard` is registered here, so `@RequirePermission('REPORTS.VIEW')`
 * is inert and every request below succeeds on its merits — which is exactly what
 * makes these assertions about routing rather than about access. The gate itself
 * is exercised in `authorization/routing.spec.ts`; that the routes still *declare*
 * it is asserted at the bottom of this file.
 */
describe('reporting routing', () => {
  let app: INestApplication;

  const EXPORTED = {
    buffer: Buffer.from('a spreadsheet'),
    filename: 'attendance-sheet_2026-09.xlsx',
    contentType:
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  };

  const reporting = {
    listReports: jest.fn().mockReturnValue([{ key: 'timesheet-status' }]),
    preview: jest.fn().mockResolvedValue({ reportType: 'timesheet-status' }),
    export: jest.fn().mockResolvedValue(EXPORTED),
  };

  /** The access token a caller has to present, since Feature 032. */
  const auth = new TestAuthentication();

  const as = (role: UserRole = UserRole.ADMIN) => auth.as({ role });

  const BODY = { month: 9, year: 2026 };

  beforeAll(async () => {
    const moduleRef: TestingModule = await Test.createTestingModule({
      controllers: [ReportingController],
      providers: [
        { provide: ReportingService, useValue: reporting },
        ...auth.providers,
      ],
    }).compile();

    app = moduleRef.createNestApplication();

    // The same globals `configureApp` installs, applied by hand. That function
    // also wires CORS and the socket adapter, both of which need `ConfigService`
    // — and this module registers no config. The four that matter to a route are
    // the prefix, the versioning, the validation pipe and the response
    // interceptor, and the interceptor is the point: it is what has to let a
    // `StreamableFile` through unwrapped.
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

  describe('GET /reports', () => {
    it('lists the available reports', async () => {
      await request(app.getHttpServer())
        .get('/api/v1/reports')
        .set(as())
        .expect(200)
        .expect(({ body }) => {
          expect(body.success).toBe(true);
        });
    });

    it('refuses a request that presents no access token', async () => {
      await request(app.getHttpServer()).get('/api/v1/reports').expect(401);
    });
  });

  describe('POST /reports/:reportType/preview', () => {
    it('accepts each of the five report types', async () => {
      for (const reportType of [
        'project-hours-per-employee',
        'timesheet-status',
        'attendance-sheet',
        'leave-calendar',
        'employee-hours-per-project',
      ]) {
        await request(app.getHttpServer())
          .post(`/api/v1/reports/${reportType}/preview`)
          .set(as())
          .send(BODY)
          .expect(200);
      }
    });

    /** A `400` naming the valid set, produced by `@IsIn` on the params DTO. */
    it('refuses an unknown report type, naming the valid ones', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/reports/attendence-sheet/preview')
        .set(as())
        .send(BODY)
        .expect(400)
        .expect(({ body }) => {
          expect(JSON.stringify(body)).toContain('attendance-sheet');
        });
    });

    it('refuses a missing month or year', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/reports/timesheet-status/preview')
        .set(as())
        .send({ year: 2026 })
        .expect(400);

      await request(app.getHttpServer())
        .post('/api/v1/reports/timesheet-status/preview')
        .set(as())
        .send({ month: 9 })
        .expect(400);
    });

    it('refuses a month outside 1..12 and an implausible year', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/reports/timesheet-status/preview')
        .set(as())
        .send({ month: 13, year: 2026 })
        .expect(400);

      await request(app.getHttpServer())
        .post('/api/v1/reports/timesheet-status/preview')
        .set(as())
        .send({ month: 9, year: 20266 })
        .expect(400);
    });

    it('refuses an unknown filter rather than ignoring it', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/reports/timesheet-status/preview')
        .set(as())
        .send({ ...BODY, teamId: 'team-1' })
        .expect(400);
    });

    it('passes the filters through to the service', async () => {
      reporting.preview.mockClear();

      await request(app.getHttpServer())
        .post('/api/v1/reports/timesheet-status/preview')
        .set(as())
        .send({ ...BODY, departmentId: 'dep-1', clientName: '  Acme  ' })
        .expect(200);

      expect(reporting.preview).toHaveBeenCalledWith(
        'timesheet-status',
        expect.objectContaining({ departmentId: 'dep-1', clientName: 'Acme' }),
      );
    });
  });

  describe('POST /reports/:reportType/export', () => {
    it('streams a file with a filename encoding report and period', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/reports/attendance-sheet/export?format=excel')
        .set(as())
        .send(BODY)
        .expect(200)
        .expect(
          'Content-Disposition',
          /attachment; filename="attendance-sheet_2026-09\.xlsx"/,
        )
        .expect('Content-Type', /spreadsheetml\.sheet/);
    });

    /**
     * The one response that is not the `{ success, data }` envelope — it cannot
     * be, since the body is a binary file. The interceptor passes a
     * `StreamableFile` through untouched.
     */
    it('returns the raw file rather than the success envelope', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/v1/reports/attendance-sheet/export?format=excel')
        .set(as())
        .send(BODY)
        // Without this supertest has no parser for a spreadsheet content type
        // and hands back an empty object, which would pass the "not the
        // envelope" assertion for the wrong reason.
        .responseType('blob')
        .expect(200);

      expect(response.body).toBeInstanceOf(Buffer);
      expect(response.body.toString()).toBe('a spreadsheet');
      expect(response.body.toString()).not.toContain('success');
    });

    it('refuses a format other than pdf or excel', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/reports/attendance-sheet/export?format=csv')
        .set(as())
        .send(BODY)
        .expect(400);
    });

    it('refuses a missing format', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/reports/attendance-sheet/export')
        .set(as())
        .send(BODY)
        .expect(400);
    });

    it('tells caches not to keep the document', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/reports/attendance-sheet/export?format=pdf')
        .set(as())
        .send(BODY)
        .expect('Cache-Control', 'no-store');
    });
  });

  /** A report type is not a resource, so there is nothing to `GET`. */
  it('has no GET for a single report type', async () => {
    await request(app.getHttpServer())
      .get('/api/v1/reports/timesheet-status')
      .set(as())
      .expect(404);
  });
});

/**
 * What each route declares, rather than what a guard does with it.
 *
 * This module used to hold its own access rule — `assertReportingAccess`, which
 * admitted the three roles in `ADMINISTRATIVE_ROLES` — and Feature 035 replaced
 * it with a `REPORTS.VIEW` requirement enforced by the global
 * `PermissionsGuard`. The rule is therefore no longer this module's to test:
 * that a caller holding `REPORTS.VIEW` is admitted and one without it is refused
 * is asserted end to end in `authorization/routing.spec.ts`, once, against the
 * real guard.
 *
 * What is still this module's to state is the *declaration*: that all three
 * routes are gated and gated on the same key. A route quietly losing its
 * decorator would be a report anybody could run, and nothing else in the suite
 * would notice — the requests above all pass with or without it, because no
 * guard is registered here.
 */
describe('the reporting routes declare REPORTS.VIEW', () => {
  const reflector = new Reflector();

  const requirementOf = (method: keyof ReportingController) =>
    reflector.get<PermissionRequirement | undefined>(
      REQUIRED_PERMISSIONS_KEY,
      ReportingController.prototype[method],
    );

  it.each<keyof ReportingController>(['findAll', 'preview', 'exportReport'])(
    'gates %s on REPORTS.VIEW',
    (method) => {
      expect(requirementOf(method)).toEqual({
        keys: ['REPORTS.VIEW'],
        mode: 'ALL',
      });
    },
  );
});
