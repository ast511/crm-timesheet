import {
  Controller,
  Get,
  INestApplication,
  UnauthorizedException,
  ValidationPipe,
  VersioningType,
} from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';

import { ERROR_CODES } from '../../common/constants/error-codes.constants';
import { CurrentEmployeeId } from '../../common/decorators/current-employee-id.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { codedError } from '../../common/errors/coded-error';
import { AllExceptionsFilter } from '../../common/filters/all-exceptions.filter';
import { ResponseInterceptor } from '../../common/interceptors/response.interceptor';
import {
  API_DEFAULT_VERSION,
  API_PREFIX,
  API_VERSION_PREFIX,
} from '../../config/api.constants';
import { UserRole } from '../../generated/prisma/enums';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { Public } from './decorators/public.decorator';
import { JwtAuthGuard } from './jwt-auth.guard';

/**
 * A stand-in for the eighteen modules that read the caller through the seam.
 *
 * **This controller is the acceptance test of the whole feature.** Its three
 * handlers are written exactly as every real controller in this application
 * writes them — `@CurrentUser() user: CurrentUser`, `@CurrentEmployeeId() id:
 * string` — and neither line has changed since Feature 026 and Feature 023 wrote
 * them against three headers. What changed is what fills them, and it is
 * invisible from here. That is what "no controller, service, repository, DTO or
 * test signature moves" means, checked rather than asserted.
 */
@Controller('seam')
class SeamProbeController {
  @Get('caller')
  caller(@CurrentUser() user: CurrentUser): CurrentUser {
    return user;
  }

  @Get('employee')
  employee(@CurrentEmployeeId() employeeId: string): { employeeId: string } {
    return { employeeId };
  }

  @Public()
  @Get('open')
  open(): { ok: true } {
    return { ok: true };
  }
}

const CALLER: CurrentUser = {
  userId: 'usr-1',
  employeeId: 'emp-1',
  role: UserRole.HR,
  administrativeAccess: true,
};

const SESSION = {
  accessToken: 'new-access-token',
  refreshToken: 'new-refresh-token',
  tokenType: 'Bearer' as const,
  expiresIn: 900,
  user: {
    id: 'usr-1',
    email: 'maria.ionescu@company.com',
    role: UserRole.HR,
    employeeId: 'emp-1',
    administrativeAccess: true,
  },
};

const VALID_TOKEN = 'a-valid-access-token';
const REFRESH_TOKEN = 'r'.repeat(64);

describe('auth routing', () => {
  let app: INestApplication;

  const auth = {
    login: jest.fn().mockResolvedValue(SESSION),
    refresh: jest.fn().mockResolvedValue(SESSION),
    logout: jest.fn().mockResolvedValue(undefined),
    describeSelf: jest.fn().mockResolvedValue(SESSION.user),
    // Refuses exactly as the real service does, code included — otherwise this
    // spec would assert an envelope the running application does not produce.
    authenticate: jest.fn((token: string) => {
      if (token !== VALID_TOKEN) {
        throw new UnauthorizedException(
          codedError(
            ERROR_CODES.AUTH_UNAUTHENTICATED,
            'Invalid or expired access token',
          ),
        );
      }

      return Promise.resolve(CALLER);
    }),
  };

  const bearer = { authorization: `Bearer ${VALID_TOKEN}` };

  beforeAll(async () => {
    const moduleRef: TestingModule = await Test.createTestingModule({
      controllers: [AuthController, SeamProbeController],
      providers: [
        { provide: AuthService, useValue: auth },
        // The guard as the application registers it, so what is exercised here
        // is the wiring the server actually has.
        { provide: APP_GUARD, useClass: JwtAuthGuard },
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
  });

  describe('POST /auth/login', () => {
    const login = () => request(app.getHttpServer()).post('/api/v1/auth/login');

    it('answers 200 with a session, not the 201 a POST defaults to', async () => {
      await login()
        .send({ email: 'maria.ionescu@company.com', password: 'a password' })
        .expect(200)
        .expect(({ body }) => {
          expect(body.data).toMatchObject({
            accessToken: SESSION.accessToken,
            refreshToken: SESSION.refreshToken,
            tokenType: 'Bearer',
            expiresIn: 900,
          });
        });
    });

    /** The endpoint that issues a token cannot require one. */
    it('needs no access token of its own', async () => {
      await login()
        .send({ email: 'maria.ionescu@company.com', password: 'a password' })
        .expect(200);

      expect(auth.authenticate).not.toHaveBeenCalled();
    });

    /**
     * The address is folded before the lookup because `POST /users` folded it
     * before storing — a login typed with capitals must find the same row.
     */
    it('trims and lower-cases the address before the lookup', async () => {
      await login()
        .send({
          email: '  Maria.Ionescu@Company.com  ',
          password: 'a password',
        })
        .expect(200);

      expect(auth.login).toHaveBeenCalledWith(
        expect.objectContaining({ email: 'maria.ionescu@company.com' }),
        expect.anything(),
      );
    });

    /** Leading and trailing spaces are legitimate characters in a passphrase. */
    it('does not trim the password', async () => {
      await login()
        .send({ email: 'maria.ionescu@company.com', password: '  spaced  ' })
        .expect(200);

      expect(auth.login).toHaveBeenCalledWith(
        expect.objectContaining({ password: '  spaced  ' }),
        expect.anything(),
      );
    });

    it('rejects an address that is not one', async () => {
      await login()
        .send({ email: 'not-an-address', password: 'x' })
        .expect(400);

      expect(auth.login).not.toHaveBeenCalled();
    });

    it('rejects a missing password', async () => {
      await login().send({ email: 'maria.ionescu@company.com' }).expect(400);

      expect(auth.login).not.toHaveBeenCalled();
    });

    /**
     * Without this bound a public, unauthenticated endpoint would hand a
     * megabyte of attacker-supplied text to a deliberately slow hash function,
     * once per request.
     */
    it('rejects a password longer than bcrypt could ever have hashed', async () => {
      await login()
        .send({
          email: 'maria.ionescu@company.com',
          password: 'x'.repeat(1000),
        })
        .expect(400);

      expect(auth.login).not.toHaveBeenCalled();
    });

    it('rejects a body field it does not offer, rather than ignoring it', async () => {
      await login()
        .send({
          email: 'maria.ionescu@company.com',
          password: 'a password',
          role: 'SUPERADMIN',
        })
        .expect(400);
    });

    it('passes the client’s self-description to the service', async () => {
      await login()
        .set('user-agent', 'Mozilla/5.0 (a browser)')
        .send({ email: 'maria.ionescu@company.com', password: 'a password' })
        .expect(200);

      expect(auth.login).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ userAgent: 'Mozilla/5.0 (a browser)' }),
      );
    });
  });

  describe('POST /auth/refresh', () => {
    const refresh = () =>
      request(app.getHttpServer()).post('/api/v1/auth/refresh');

    /**
     * `@Public()` at the authentication level only: this endpoint is protected
     * by a *different* credential. Requiring an access token as well would make
     * a session unrecoverable in the exact situation refresh exists for.
     */
    it('authenticates with the refresh token rather than an access token', async () => {
      await refresh().send({ refreshToken: REFRESH_TOKEN }).expect(200);

      expect(auth.authenticate).not.toHaveBeenCalled();
      expect(auth.refresh).toHaveBeenCalledWith(
        REFRESH_TOKEN,
        expect.anything(),
      );
    });

    /** A copy-paste artefact from a terminal is not part of the credential. */
    it('trims the token, so a stray newline is not a revoked session', async () => {
      await refresh()
        .send({ refreshToken: `\n  ${REFRESH_TOKEN}  ` })
        .expect(200);

      expect(auth.refresh).toHaveBeenCalledWith(
        REFRESH_TOKEN,
        expect.anything(),
      );
    });

    it('rejects a missing token', async () => {
      await refresh().send({}).expect(400);

      expect(auth.refresh).not.toHaveBeenCalled();
    });

    it('rejects a token far too short or far too long to be one', async () => {
      await refresh().send({ refreshToken: 'short' }).expect(400);
      await refresh()
        .send({ refreshToken: 'x'.repeat(2000) })
        .expect(400);

      expect(auth.refresh).not.toHaveBeenCalled();
    });

    it('never puts a token in the URL', async () => {
      await request(app.getHttpServer())
        .post(`/api/v1/auth/refresh?refreshToken=${REFRESH_TOKEN}`)
        .send({ refreshToken: REFRESH_TOKEN })
        .expect(200);

      // The query string is not read; only the body is.
      expect(auth.refresh).toHaveBeenCalledWith(
        REFRESH_TOKEN,
        expect.anything(),
      );
    });
  });

  describe('POST /auth/logout', () => {
    /** Both credentials: the access token proves who, the refresh token what. */
    it('requires an access token as well as the refresh token', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/auth/logout')
        .send({ refreshToken: REFRESH_TOKEN })
        .expect(401);

      expect(auth.logout).not.toHaveBeenCalled();
    });

    it('revokes the presented token for the authenticated caller', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/auth/logout')
        .set(bearer)
        .send({ refreshToken: REFRESH_TOKEN })
        .expect(200)
        .expect(({ body }) => {
          expect(body).toEqual({ success: true, data: null });
        });

      expect(auth.logout).toHaveBeenCalledWith(CALLER, REFRESH_TOKEN);
    });

    it('rejects a logout that names no session', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/auth/logout')
        .set(bearer)
        .send({})
        .expect(400);
    });
  });

  describe('GET /auth/me', () => {
    it('answers with the caller’s own account', async () => {
      await request(app.getHttpServer())
        .get('/api/v1/auth/me')
        .set(bearer)
        .expect(200)
        .expect(({ body }) => {
          expect(body.data).toEqual(SESSION.user);
          expect(body.data.passwordHash).toBeUndefined();
        });
    });

    it('requires a token', async () => {
      await request(app.getHttpServer()).get('/api/v1/auth/me').expect(401);
    });
  });

  /**
   * The guard, at the level it operates on. Everything here is about *whether
   * the caller is known* — never about what they may do, which is the
   * authorization enforcement feature.
   */
  describe('the global guard', () => {
    it('refuses a request with no Authorization header, naming what to send', async () => {
      await request(app.getHttpServer())
        .get('/api/v1/seam/caller')
        .expect(401)
        .expect(({ body }) => {
          expect(body.message).toContain('Bearer');
        });
    });

    it.each([
      ['a bare token with no scheme', VALID_TOKEN],
      ['the wrong scheme', `Basic ${VALID_TOKEN}`],
      ['a scheme with nothing after it', 'Bearer'],
      ['more than two parts', `Bearer ${VALID_TOKEN} extra`],
    ])('refuses %s', async (_case, header) => {
      await request(app.getHttpServer())
        .get('/api/v1/seam/caller')
        .set({ authorization: header })
        .expect(401);
    });

    /** RFC 7235 makes the scheme a case-insensitive token, and clients differ. */
    it('accepts the scheme in any case', async () => {
      await request(app.getHttpServer())
        .get('/api/v1/seam/caller')
        .set({ authorization: `bearer ${VALID_TOKEN}` })
        .expect(200);
    });

    it('refuses a token the service does not recognise', async () => {
      await request(app.getHttpServer())
        .get('/api/v1/seam/caller')
        .set({ authorization: 'Bearer forged' })
        .expect(401);
    });

    it('lets a @Public() route through untouched', async () => {
      await request(app.getHttpServer()).get('/api/v1/seam/open').expect(200);

      expect(auth.authenticate).not.toHaveBeenCalled();
    });
  });

  /**
   * The seam, end to end. `@CurrentUser()` and `@CurrentEmployeeId()` have the
   * signatures Features 026 and 023 gave them; only their source changed.
   */
  describe('the identity seam', () => {
    it('resolves @CurrentUser() to the authenticated caller', async () => {
      await request(app.getHttpServer())
        .get('/api/v1/seam/caller')
        .set(bearer)
        .expect(200)
        .expect(({ body }) => {
          expect(body.data).toEqual(CALLER);
        });
    });

    it('resolves @CurrentEmployeeId() to the same caller’s employment record', async () => {
      await request(app.getHttpServer())
        .get('/api/v1/seam/employee')
        .set(bearer)
        .expect(200)
        .expect(({ body }) => {
          expect(body.data).toEqual({ employeeId: 'emp-1' });
        });
    });

    /**
     * A caller cannot claim administrative access independently of their role:
     * the value is derived where the role is read, and there is no longer any
     * channel through which it could be sent.
     */
    it('ignores an administrative-access header entirely', async () => {
      auth.authenticate.mockResolvedValueOnce({
        ...CALLER,
        role: UserRole.USER,
        administrativeAccess: false,
      });

      await request(app.getHttpServer())
        .get('/api/v1/seam/caller')
        .set({ ...bearer, 'x-administrative-access': 'true' })
        .expect(200)
        .expect(({ body }) => {
          expect(body.data.administrativeAccess).toBe(false);
        });
    });

    /**
     * The one response code Feature 032 changed. A super-admin created to
     * administer the system is authenticated perfectly well and has no
     * employment record, so this is `403` rather than the `400` that used to
     * name a missing header.
     */
    it('answers 403 when the account has no employment record', async () => {
      auth.authenticate.mockResolvedValueOnce({ ...CALLER, employeeId: null });

      await request(app.getHttpServer())
        .get('/api/v1/seam/employee')
        .set(bearer)
        .expect(403);
    });

    /**
     * The identity headers Features 023 and 026 used are read nowhere. Sending
     * all three, with no token, gets a `401` — which is the whole feature in one
     * assertion.
     */
    it('reads none of the three headers it replaced', async () => {
      await request(app.getHttpServer())
        .get('/api/v1/seam/caller')
        .set({
          'x-user-id': 'usr-9',
          'x-user-role': 'SUPERADMIN',
          'x-employee-id': 'emp-9',
        })
        .expect(401);
    });
  });

  /**
   * The error codes as a client actually receives them (Feature 033).
   *
   * `auth.service.spec.ts` asserts which branch produces which code; this
   * asserts that the code survives the trip through `AllExceptionsFilter` and
   * lands on the envelope — which is the only thing a frontend can key a
   * translation on.
   */
  describe('the error envelope', () => {
    it('carries AUTH_UNAUTHENTICATED when no token is presented', async () => {
      await request(app.getHttpServer())
        .get('/api/v1/seam/caller')
        .expect(401)
        .expect(({ body }) => {
          expect(body).toMatchObject({
            success: false,
            statusCode: 401,
            errorCode: 'AUTH_UNAUTHENTICATED',
          });
          expect(typeof body.message).toBe('string');
        });
    });

    it('carries AUTH_UNAUTHENTICATED for a token the service refuses', async () => {
      await request(app.getHttpServer())
        .get('/api/v1/seam/caller')
        .set({ authorization: 'Bearer forged' })
        .expect(401)
        .expect(({ body }) => {
          expect(body.errorCode).toBe('AUTH_UNAUTHENTICATED');
        });
    });

    /** A `403`: nothing is wrong with the credential, only with the account. */
    it('carries AUTH_NO_EMPLOYEE_RECORD when the account has no employment record', async () => {
      auth.authenticate.mockResolvedValueOnce({ ...CALLER, employeeId: null });

      await request(app.getHttpServer())
        .get('/api/v1/seam/employee')
        .set(bearer)
        .expect(403)
        .expect(({ body }) => {
          expect(body.errorCode).toBe('AUTH_NO_EMPLOYEE_RECORD');
        });
    });

    /**
     * The `ValidationPipe`'s failure gains one code for the whole request while
     * keeping every per-field sentence, so a form can still put each message
     * under its input and a heading can be translated from the code.
     */
    it('carries VALIDATION_ERROR and every field message for a rejected body', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({ email: 'not-an-address', password: '' })
        .expect(400)
        .expect(({ body }) => {
          expect(body.errorCode).toBe('VALIDATION_ERROR');
          expect(Array.isArray(body.message)).toBe(true);
          expect(body.message.length).toBeGreaterThan(1);
        });
    });

    it('never emits params for a code that carries none', async () => {
      await request(app.getHttpServer())
        .get('/api/v1/seam/caller')
        .expect(401)
        .expect(({ body }) => {
          expect(body).not.toHaveProperty('params');
        });
    });

    /**
     * The regression that matters most: a route throwing a plain, uncoded
     * exception — which is every module except auth — still produces a valid
     * envelope, with no `errorCode` key for a client to trip over.
     */
    it('leaves the code off an uncoded failure, such as an unmatched route', async () => {
      await request(app.getHttpServer())
        .get('/api/v1/seam/nothing-here')
        .set(bearer)
        .expect(404)
        .expect(({ body }) => {
          expect(body).toMatchObject({ success: false, statusCode: 404 });
          expect(body).not.toHaveProperty('errorCode');
        });
    });
  });
});
